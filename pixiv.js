/** @type {import('./_venera_.js')} */

class Pixiv extends ComicSource {

    name = "Pixiv"
    key = "pixiv"
    version = "1.7.2"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/pixiv.js"

    static CLIENT_ID     = "MOBrBDS8blbauoSck0ZfDbtuzpyT"
    static CLIENT_SECRET = "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj"
    static HASH_SECRET   = "28c1fdd170a5204386cb1313c7077b34f83e4aaf4aa829ce78c231e05b0bae2c"
    static USER_AGENT    = "PixivAndroidApp/5.0.166 (Android 10.0; Pixel C)"
    static REDIRECT_URI  = "https://app-api.pixiv.net/web/v1/users/auth/pixiv/callback"
    static PKCE_CHARS    = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

    static _pkceVerifier = ""

    get apiBase() {
        return this.loadSetting('apiHost') || 'https://app-api.pixiv.net'
    }

    get authUrl() {
        let raw = this.loadSetting('oauthHost') || 'https://oauth.secure.pixiv.net'
        raw = String(raw).trim().replace(/\/$/, '')
        if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw
        return raw + '/auth/token'
    }

    get imageQuality() {
        return this.loadSetting('imageQuality') || 'large'
    }

    // ==========================================================
    //  多账号
    // ==========================================================
    // 优先读新的 _sub_accounts_meta，兼容旧 setting sub_accounts
    subAccounts() {
        try {
            let arr = JSON.parse(this.loadData('_sub_accounts_meta') || '[]')
            if (Array.isArray(arr) && arr.length > 0) return arr
        } catch (e) {}
        try {
            let arr = JSON.parse(this.loadSetting('sub_accounts') || '[]')
            return Array.isArray(arr) ? arr : []
        } catch (e) { return [] }
    }
    _saveSubAccounts(arr) {
        this.saveData('_sub_accounts_meta', JSON.stringify(arr || []))
    }

    accountCount() { return 1 + this.subAccounts().length }

    accountName(index) {
        if (index === 0) return '主账号'
        let sub = this.subAccounts()[index - 1]
        return sub && sub.name ? sub.name : `账号${index}`
    }

    get activeAccount() {
        let value = this.loadData('active_account')
        let index = value === null || value === undefined || value === '' ? 0 : Number(value)
        if (isNaN(index) || index < 0) return 0
        return index
    }

    accountTokenKey(index)        { return index === 0 ? 'access_token'  : `access_token_${index}` }
    accountRefreshKey(index)      { return index === 0 ? 'refresh_token' : `refresh_token_${index}` }
    accountUserIdKey(index)       { return index === 0 ? 'user_id'       : `user_id_${index}` }
    accountUserNameKey(index)     { return index === 0 ? 'user_name'     : `user_name_${index}` }
    accountUserAccountKey(index)  { return index === 0 ? 'user_account'  : `user_account_${index}` }

    hasAccount(index) { return !!this.loadData(this.accountTokenKey(index)) }
    getUserId(index) {
        let i = index === undefined ? this.activeAccount : index
        return this.loadData(this.accountUserIdKey(i))
    }
    requireAccount() {
        if (this.hasAccount(this.activeAccount)) return
        if (this.activeAccount === 0) throw 'Login expired'
        throw '当前账号未登录, 请在设置中登录附属账号或切换账号'
    }

    // 获取 refresh_token：优先运行时已保存（可能已轮换），回退到 meta 中的初始 token
    getRefreshToken(index) {
        if (index === null || index === undefined) index = this.activeAccount
        let saved = this.loadData(this.accountRefreshKey(index))
        if (saved) return saved
        if (index > 0) {
            let sub = this.subAccounts()[index - 1]
            if (sub) {
                let t = sub.token || sub.refresh_token || sub.refreshToken
                if (t) return String(t).trim()
            }
        }
        return null
    }

    // 把一个账号位置的所有运行时数据搬到另一个位置
    _moveAccountData(fromIdx, toIdx) {
        let v
        v = this.loadData(this.accountTokenKey(fromIdx))
        if (v) this.saveData(this.accountTokenKey(toIdx), v); else this.deleteData(this.accountTokenKey(toIdx))
        v = this.loadData(this.accountRefreshKey(fromIdx))
        if (v) this.saveData(this.accountRefreshKey(toIdx), v); else this.deleteData(this.accountRefreshKey(toIdx))
        v = this.loadData(this.accountUserIdKey(fromIdx))
        if (v) this.saveData(this.accountUserIdKey(toIdx), v); else this.deleteData(this.accountUserIdKey(toIdx))
        v = this.loadData(this.accountUserNameKey(fromIdx))
        if (v) this.saveData(this.accountUserNameKey(toIdx), v); else this.deleteData(this.accountUserNameKey(toIdx))
        v = this.loadData(this.accountUserAccountKey(fromIdx))
        if (v) this.saveData(this.accountUserAccountKey(toIdx), v); else this.deleteData(this.accountUserAccountKey(toIdx))
    }

    _clearAccountData(idx) {
        this.deleteData(this.accountTokenKey(idx))
        this.deleteData(this.accountRefreshKey(idx))
        this.deleteData(this.accountUserIdKey(idx))
        this.deleteData(this.accountUserNameKey(idx))
        this.deleteData(this.accountUserAccountKey(idx))
    }

    // ==========================================================
    //  基础辅助
    // ==========================================================
    rewriteHost(url) {
        if (!url) return url
        let mode = this.loadSetting('imageHost') || 'i.pximg.net'
        let host = mode
        if (mode === 'custom') host = this.loadSetting('customImageHost') || 'i.pximg.net'
        if (!host || host === 'i.pximg.net') return url
        return url.replace(/\/\/i\.pximg\.net\//, '//' + host + '/')
    }

    fixNextUrl(url) {
        if (!url) return url
        return url.replace(/^https?:\/\/[^/]+/, this.apiBase)
    }

    init() {
        if (!this._refreshPromises) this._refreshPromises = {}
    }

    // ==========================================================
    //  签名 / 请求
    // ==========================================================
    getSignHeaders() {
        let d = new Date()
        let time = d.toISOString().replace(/\.\d+Z$/, '+00:00')
        let hash = Convert.hexEncode(Convert.md5(Convert.encodeUtf8(time + Pixiv.HASH_SECRET)))
        return {
            'X-Client-Time':   time,
            'X-Client-Hash':   hash,
            'User-Agent':      Pixiv.USER_AGENT,
            'App-OS':          'Android',
            'App-OS-Version':  'Android 10.0',
            'App-Version':     '5.0.166',
            'Accept-Language': 'zh-cn'
        }
    }

    _saveTokenResponse(resp, accountIndex) {
        let index = accountIndex === undefined ? 0 : accountIndex
        this.saveData(this.accountTokenKey(index),   resp.access_token)
        this.saveData(this.accountRefreshKey(index), resp.refresh_token)
        if (resp.user) {
            this.saveData(this.accountUserIdKey(index),      resp.user.id.toString())
            this.saveData(this.accountUserNameKey(index),    resp.user.name)
            this.saveData(this.accountUserAccountKey(index), resp.user.account)
        }
    }

    async _newTokenRequest(paramList, accountIndex) {
        let index = accountIndex === undefined ? 0 : accountIndex
        let bodyList = []
        for (let i = 0; i < paramList.length; i++)
            bodyList.push(paramList[i][0] + '=' + encodeURIComponent(paramList[i][1]))
        let body = bodyList.join('&')

        let headers = this.getSignHeaders()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        try {
            let u = new URL(this.authUrl)
            headers['Host'] = u.host
        } catch (e) {}

        Network.deleteCookies('https://oauth.secure.pixiv.net')

        let res = await Network.post(this.authUrl, headers, body)
        if (res.status !== 200) return null
        let json = JSON.parse(res.body)
        let resp = json.response || json
        if (!resp || !resp.access_token) return null
        this._saveTokenResponse(resp, index)
        return resp.access_token
    }

    async _exchangeAuthCode() {
        let code = this.loadData('_pkce_code')
        let verifier = Pixiv._pkceVerifier || this.loadData('pkce_verifier')
        if (!code || !verifier) return false
        this.deleteData('_pkce_code')
        return !!(await this._newTokenRequest([
            ['client_id',      Pixiv.CLIENT_ID],
            ['client_secret',  Pixiv.CLIENT_SECRET],
            ['grant_type',     'authorization_code'],
            ['code',           code],
            ['code_verifier',  verifier],
            ['redirect_uri',   Pixiv.REDIRECT_URI],
            ['include_policy', 'true']
        ], 0))
    }

    async _exchangeWebviewToken() {
        let token = this.loadData('pending_refresh_token')
        if (!token) return false
        this.deleteData('pending_refresh_token')
        return !!(await this._newTokenRequest([
            ['client_id',      Pixiv.CLIENT_ID],
            ['client_secret',  Pixiv.CLIENT_SECRET],
            ['grant_type',     'refresh_token'],
            ['refresh_token',  token],
            ['include_policy', 'true']
        ], 0))
    }

    async _passwordLogin(account, pwd, accountIndex) {
        let index = accountIndex === undefined ? 0 : accountIndex
        return !!(await this._newTokenRequest([
            ['client_id',      Pixiv.CLIENT_ID],
            ['client_secret',  Pixiv.CLIENT_SECRET],
            ['grant_type',     'password'],
            ['username',       account],
            ['password',       pwd],
            ['Device_token',   'pixiv'],
            ['get_secure_url', 'true'],
            ['include_policy', 'true']
        ], index))
    }

    async refreshToken(accountIndex) {
        let index = accountIndex === null || accountIndex === undefined
            ? this.activeAccount : accountIndex
        let refreshToken = this.getRefreshToken(index)
        if (!refreshToken) throw 'No refresh token'
        let result = await this._newTokenRequest([
            ['client_id',      Pixiv.CLIENT_ID],
            ['client_secret',  Pixiv.CLIENT_SECRET],
            ['grant_type',     'refresh_token'],
            ['refresh_token',  refreshToken],
            ['include_policy', 'true']
        ], index)
        if (!result) throw 'Token refresh failed'
        return result
    }

    _ensureRefresh(accountIndex) {
        let index = accountIndex === undefined ? this.activeAccount : accountIndex
        if (!this._refreshPromises) this._refreshPromises = {}
        if (!this._refreshPromises[index]) {
            this._refreshPromises[index] = this.refreshToken(index).then(
                v => { this._refreshPromises[index] = null; return v },
                e => { this._refreshPromises[index] = null; throw e }
            )
        }
        return this._refreshPromises[index]
    }

    async _ensureToken() {
        let index = this.activeAccount
        if (index === 0) {
            if (this.loadData('pending_refresh_token')) {
                try { await this._exchangeWebviewToken() } catch (e) {}
            }
            if (this.loadData('_pkce_code')) {
                try { await this._exchangeAuthCode() } catch (e) {}
            }
        }
        let hasAccessToken = !!this.loadData(this.accountTokenKey(index))
        if (!hasAccessToken) {
            try { await this.refreshToken(index); return true }
            catch (e) { return false }
        }
        return true
    }

    async apiGet(url) {
        await this._ensureToken()
        let index = this.activeAccount
        let token = this.loadData(this.accountTokenKey(index))
        if (!token) throw 'Login expired'
        let headers = this.getSignHeaders()
        headers['Authorization'] = 'Bearer ' + token
        try { let u = new URL(url); headers['Host'] = u.host } catch (e) {}

        let res = await Network.get(url, headers)
        if (this._isOAuthError(res)) {
            await this._ensureRefresh(index)
            token = this.loadData(this.accountTokenKey(index))
            headers['Authorization'] = 'Bearer ' + token
            res = await Network.get(url, headers)
        }
        if (res.status !== 200) throw 'HTTP ' + res.status + ': ' + url
        return JSON.parse(res.body)
    }

    async apiPost(url, body) {
        await this._ensureToken()
        let index = this.activeAccount
        let token = this.loadData(this.accountTokenKey(index))
        if (!token) throw 'Login expired'
        let headers = this.getSignHeaders()
        headers['Authorization'] = 'Bearer ' + token
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        try { let u = new URL(url); headers['Host'] = u.host } catch (e) {}

        let res = await Network.post(url, headers, body)
        if (this._isOAuthError(res)) {
            await this._ensureRefresh(index)
            token = this.loadData(this.accountTokenKey(index))
            headers['Authorization'] = 'Bearer ' + token
            res = await Network.post(url, headers, body)
        }
        if (res.status !== 200) throw 'HTTP ' + res.status + ': ' + url
        return JSON.parse(res.body)
    }

    async apiDelete(url) {
        await this._ensureToken()
        let index = this.activeAccount
        let token = this.loadData(this.accountTokenKey(index))
        if (!token) throw 'Login expired'
        let headers = this.getSignHeaders()
        headers['Authorization'] = 'Bearer ' + token
        try { let u = new URL(url); headers['Host'] = u.host } catch (e) {}

        let res = await Network.sendRequest('DELETE', url, headers, null)
        if (this._isOAuthError(res)) {
            await this._ensureRefresh(index)
            token = this.loadData(this.accountTokenKey(index))
            headers['Authorization'] = 'Bearer ' + token
            res = await Network.sendRequest('DELETE', url, headers, null)
        }
        if (res.status !== 200) throw 'HTTP ' + res.status + ': ' + url
        return JSON.parse(res.body)
    }

    _isOAuthError(res) {
        if (!res) return false
        if (res.status === 400 || res.status === 401) {
            try {
                let json = JSON.parse(res.body)
                let msg = json?.error?.message || json?.errors?.system?.message || ''
                if (msg.indexOf('OAuth') !== -1) return true
            } catch (e) {}
            if (res.status === 401) return true
        }
        return false
    }

    // ==========================================================
    //  图片
    // ==========================================================
    pickImageUrls(urls) {
        if (!urls) return null
        let q = this.imageQuality
        if (q === 'original') return urls.original || urls.large || urls.medium
        return urls[q] || urls.large || urls.medium
    }
    pickCover(illust) {
        if (!illust) return null
        let q = this.imageQuality
        if (q === 'original') {
            if (illust.meta_pages && illust.meta_pages.length > 0)
                return illust.meta_pages[0].image_urls.original
            return (illust.meta_single_page && illust.meta_single_page.original_image_url)
                || (illust.image_urls && illust.image_urls.large)
        }
        return (illust.image_urls && (illust.image_urls[q] || illust.image_urls.large)) || null
    }

    // ==========================================================
    //  解析
    // ==========================================================
    _isAIIllust(illust) {
        if (!illust) return false
        if (illust.ai_type !== undefined && illust.ai_type !== null && illust.ai_type > 0) return true
        const texts = []
        if (illust.title) texts.push(illust.title)
        if (illust.caption) texts.push(illust.caption)
        if (illust.tags && Array.isArray(illust.tags)) {
            for (let t of illust.tags) {
                if (t.name) texts.push(t.name)
                if (t.translated_name) texts.push(t.translated_name)
            }
        }
        const aiRegex = /AI生成|ai-generated|人工知能|人工智能|(?<![a-zA-Z])ai(?![a-zA-Z])/i
        for (let text of texts) if (text && aiRegex.test(text)) return true
        return false
    }

    parseIllust(illust) {
        let cover = this.pickCover(illust)
        let tags = (illust.tags || []).map(t => t.translated_name || t.name)
        tags.push(illust.user.name)
        if (this._isAIIllust(illust)) tags.push("AI生成")
        return new Comic({
            id: illust.id.toString(),
            title: illust.title,
            subTitle: illust.user.name,
            cover: this.rewriteHost(cover),
            tags: tags,
            description: (illust.caption || '').replace(/<[^>]*>/g, ''),
            maxPage: illust.page_count || 1
        })
    }

    parseUserPreview(userPreview) {
        let user = userPreview.user
        let illusts = userPreview.illusts || []
        let cover = user.profile_image_urls.medium
        let tags = []
        let pages = 1
        if (illusts.length > 0) {
            cover = this.pickCover(illusts[0])
            tags = (illusts[0].tags || []).map(t => t.translated_name || t.name)
            pages = illusts.length
        }
        return new Comic({
            id: 'user_' + user.id.toString(),
            title: user.name,
            subTitle: user.account,
            cover: this.rewriteHost(cover),
            tags: tags,
            description: '',
            maxPage: pages
        })
    }

    parseComment(c) {
        let u = c.user || {}
        let profile = u.profile_image_urls || {}
        return new Comment({
            userName: u.name || "",
            avatar: profile.medium ? this.rewriteHost(profile.medium) : undefined,
            content: c.comment || "",
            time: c.date,
            replyCount: c.has_replies ? 1 : null,
            id: c.id !== undefined ? c.id.toString() : undefined,
        })
    }

    // ==========================================================
    //  R18 / AI 过滤
    // ==========================================================
    _isR18(tags) {
        if (!tags || !Array.isArray(tags)) return false
        const hideR18  = this.loadSetting('hideR18')
        const hideR18G = this.loadSetting('hideR18G')
        if (!hideR18 && !hideR18G) return false
        return tags.some(t => {
            if (hideR18  && /\br-?18\b/i.test(t))  return true
            if (hideR18G && /\br-?18g\b/i.test(t)) return true
            return false
        })
    }
    _isAI(tags) {
        if (!this.loadSetting('hideAI')) return false
        if (!tags || !Array.isArray(tags)) return false
        return tags.some(t => /AI生成/i.test(t))
    }
    _filterR18(comics) {
        if (!this.loadSetting('hideR18') && !this.loadSetting('hideR18G')) return comics
        return comics.filter(c => !this._isR18(c.tags))
    }
    _filterAI(comics) {
        if (!this.loadSetting('hideAI')) return comics
        return comics.filter(c => !this._isAI(c.tags))
    }
    _filterAll(comics) { return this._filterR18(this._filterAI(comics)) }

    // ==========================================================
    //  探索
    // ==========================================================
    explore = [
        {
            title: "Following", type: "multiPageComicList",
            loadNext: async (next) => {
                this.requireAccount()
                let url = next ? (next.startsWith('http') ? next : this.apiBase + next)
                               : this.apiBase + '/v2/illust/follow?restrict=all'
                let json = await this.apiGet(url)
                let comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
                return { comics: comics, next: this.fixNextUrl(json.next_url) }
            },
        },
        {
            title: "Recommended Artists", type: "multiPageComicList",
            loadNext: async (next) => {
                let url = next ? (next.startsWith('http') ? next : this.apiBase + next)
                               : this.apiBase + '/v1/user/recommended?filter=for_android'
                let json = await this.apiGet(url)
                let comics = (json.user_previews || []).map(up => this.parseUserPreview(up))
                return { comics: comics, next: this.fixNextUrl(json.next_url) }
            },
        },
        {
            title: "Followed Artists", type: "multiPageComicList",
            loadNext: async (next) => {
                let userId = this.getUserId()
                if (!userId) return { comics: [], next: null }
                let url = next ? (next.startsWith('http') ? next : this.apiBase + next)
                               : this.apiBase + '/v1/user/following?filter=for_android&user_id=' + userId
                let json = await this.apiGet(url)
                let comics = (json.user_previews || []).map(up => this.parseUserPreview(up))
                return { comics: comics, next: this.fixNextUrl(json.next_url) }
            },
        },
        {
            title: "Recommended Illustrations", type: "multiPageComicList",
            loadNext: async (next) => {
                let url = next ? (next.startsWith('http') ? next : this.apiBase + next)
                               : this.apiBase + '/v1/illust/recommended?filter=for_android&include_ranking_label=true'
                let json = await this.apiGet(url)
                let comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
                return { comics: comics, next: this.fixNextUrl(json.next_url) }
            },
        },
        {
            title: "Recommended Manga", type: "multiPageComicList",
            loadNext: async (next) => {
                let url = next ? (next.startsWith('http') ? next : this.apiBase + next)
                               : this.apiBase + '/v1/manga/recommended?filter=for_android&include_ranking_label=true'
                let json = await this.apiGet(url)
                let comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
                return { comics: comics, next: this.fixNextUrl(json.next_url) }
            },
        },
        {
            title: "Daily Ranking", type: "multiPageComicList",
            loadNext: async (next) => {
                let url = next ? (next.startsWith('http') ? next : this.apiBase + next)
                               : this.apiBase + '/v1/illust/ranking?filter=for_android&mode=day'
                let json = await this.apiGet(url)
                let comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
                return { comics: comics, next: this.fixNextUrl(json.next_url) }
            },
        },
        {
            title: "Trending Tags", type: "multiPageComicList",
            loadNext: async (next) => {
                let json = await this.apiGet(this.apiBase + '/v1/trending-tags/illust?filter=for_android')
                let comics = []
                for (let item of (json.trend_tags || [])) {
                    if (item.illust) comics.push(this.parseIllust(item.illust))
                }
                comics = this._filterAll(comics)
                return { comics: comics, next: null }
            },
        }
    ]

    // ==========================================================
    //  分类
    // ==========================================================
    category = {
        title: "Pixiv",
        parts: [
            {
                name: "热门标签(动态)", type: "dynamic",
                loader: async () => {
                    let json = await this.apiGet(this.apiBase + '/v1/trending-tags/illust?filter=for_android')
                    let items = []
                    for (let item of (json.trend_tags || [])) {
                        items.push({
                            label: item.translated_name || item.tag,
                            target: {
                                page: 'category',
                                attributes: { category: 'tag_search', param: item.tag },
                            },
                        })
                    }
                    return items
                },
            },
            {
                name: "热门标签", type: "fixed", itemType: "category",
                categories: [
                    "原神", "崩坏：星穹铁道", "VOCALOID", "初音ミク", "東方Project",
                    "Fate/Grand Order", "ブルーアーカイブ", "ウマ娘", "アイドルマスター",
                    "ラブライブ", "呪術廻戦", "鬼滅の刃", "SPY×FAMILY", "チェンソーマン",
                    "ホロライブ", "にじさんじ", "アークナイツ", "プロセカ",
                    "ドールズフロントライン", "アズールレーン",
                ],
                categoryParams: [
                    "原神", "崩壊:スターレイル", "VOCALOID", "初音ミク", "東方Project",
                    "Fate/GrandOrder", "ブルーアーカイブ", "ウマ娘", "アイドルマスター",
                    "ラブライブ!", "呪術廻戦", "鬼滅の刃", "SPY×FAMILY", "チェンソーマン",
                    "ホロライブ", "にじさんじ", "アークナイツ", "プロジェクトセカイ",
                    "ドールズフロントライン", "アズールレーン",
                ],
            },
        ],
        enableRankingPage: true,
    }

    async resolveUserId(nameOrId) {
        if (/^\d+$/.test(String(nameOrId))) return String(nameOrId)
        let json = await this.apiGet(this.apiBase + '/v1/search/user?filter=for_android&word=' +
            encodeURIComponent(nameOrId))
        let previews = json.user_previews || []
        if (previews.length > 0 && previews[0].user) return String(previews[0].user.id)
        return null
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            if (category === 'user_illusts' || category === 'artist') {
                let userId = await this.resolveUserId(param)
                if (!userId) return { comics: [], maxPage: page }
                let offset = (page - 1) * 30
                let json = await this.apiGet(this.apiBase + '/v1/user/illusts?filter=for_android&user_id=' +
                    userId + '&offset=' + offset)
                let comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
                let maxPage = (json.illusts || []).length < 30 ? page : page + 1
                return { comics: comics, maxPage: maxPage }
            }
            let tag = param
            if (!tag && category === 'tag_search') tag = param
            if (tag && typeof tag === 'string') {
                let url
                if (page > 1) {
                    let cursor = this.loadData('_tag_cursor')
                    if (!cursor) return { comics: [], maxPage: page - 1 }
                    url = cursor.startsWith('http') ? cursor : this.apiBase + cursor
                } else {
                    this.deleteData('_tag_cursor')
                    url = this.apiBase + '/v1/search/illust' +
                        '?word=' + encodeURIComponent(tag) +
                        '&search_target=exact_match_for_tags' +
                        '&sort=popular_desc' +
                        '&filter=for_android' +
                        '&merge_plain_keyword_results=true'
                }
                let json = await this.apiGet(url)
                let comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
                if (json.next_url) this.saveData('_tag_cursor', json.next_url)
                else this.deleteData('_tag_cursor')
                return { comics: comics, maxPage: json.next_url ? page + 1 : page }
            }
            return { comics: [], maxPage: 1 }
        },

        optionList: [
            {
                type: "select",
                options: ["date_desc-最新", "date_asc-最早", "popular_desc-热门"],
                label: "排序", default: "date_desc",
                notShowWhen: ['artist', 'user_illusts'],
            },
        ],

        ranking: {
            options: [
                "day-Daily", "week-Weekly", "month-Monthly",
                "day_male-Daily (Male)", "day_female-Daily (Female)",
                "week_original-Original", "week_rookie-Rookie", "day_manga-Manga",
                "day_r18-R18", "day_ai-AI", "day_r18_ai-R18 AI",
            ],
            load: async (option, page) => {
                let cursorKey = '_ranking_cursor_' + option
                let url
                if (page > 1) {
                    let cursor = this.loadData(cursorKey)
                    if (!cursor) return { comics: [], maxPage: page - 1 }
                    url = cursor.startsWith('http') ? cursor : this.apiBase + cursor
                } else {
                    this.deleteData(cursorKey)
                    url = this.apiBase + '/v1/illust/ranking?filter=for_android&mode=' + option
                }
                let json = await this.apiGet(url)
                let comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
                if (json.next_url) this.saveData(cursorKey, json.next_url)
                else this.deleteData(cursorKey)
                return { comics: comics, maxPage: json.next_url ? page + 1 : page }
            },
        },
    }

    // ==========================================================
    //  搜索
    // ==========================================================
    search = {
        loadNext: async (keyword, options, next) => {
            let sort = ((options && options[0]) || 'date_desc').replace(/^"|"$/g, '')
            let searchTarget = ((options && options[1]) || 'partial_match_for_tags').replace(/^"|"$/g, '')
            let aiFilter = ((options && options[2]) || 'all').replace(/^"|"$/g, '')
            let isTagClick = this._pendingTagSearch
            this._pendingTagSearch = false

            let url
            if (next) {
                url = next.startsWith('http') ? next : this.apiBase + next
            } else {
                if (searchTarget === 'users') {
                    url = this.apiBase + '/v1/search/user?word=' + encodeURIComponent(keyword) +
                        '&filter=for_android'
                } else if (isTagClick) {
                    url = this.apiBase + '/v1/search/illust?word=' + encodeURIComponent(keyword) +
                        '&search_target=exact_match_for_tags&sort=popular_desc' +
                        '&filter=for_android&merge_plain_keyword_results=true'
                } else {
                    url = this.apiBase + '/v1/search/illust?word=' + encodeURIComponent(keyword) +
                        '&sort=' + sort + '&search_target=' + searchTarget +
                        '&filter=for_android&merge_plain_keyword_results=true' +
                        (aiFilter === 'exclude_ai' ? '&search_ai_type=1' : '') +
                        (aiFilter === 'only_ai' ? '&search_ai_type=2' : '')
                }
            }
            let json = await this.apiGet(url)
            let comics
            if (searchTarget === 'users') {
                comics = (json.user_previews || []).map(e => this.parseUserPreview(e))
            } else {
                comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
            }
            return { comics: comics, next: this.fixNextUrl(json.next_url) }
        },

        optionList: [
            { type: "select", options: ["date_desc-Newest", "date_asc-Oldest", "popular_desc-Popular"],
              label: "sort", default: "date_desc" },
            { type: "select",
              options: ["partial_match_for_tags-Tag Match", "exact_match_for_tags-Exact Tag",
                        "title_and_caption-Title & Caption", "users-Users"],
              label: "target", default: "partial_match_for_tags" },
            { type: "select", options: ["all-All", "exclude_ai-No AI", "only_ai-AI Only"],
              label: "ai", default: "all" },
        ],
        enableTagsSuggestions: false,
        onTagSuggestionSelected: (tag) => {}
    }

    // ==========================================================
    //  收藏
    // ==========================================================
    tagFolderId(restrict, name) { return 'tag:' + (restrict || 'public') + ':' + name }
    parseTagFolder(folderId) {
        if (!folderId || folderId.indexOf('tag:') !== 0) return null
        let rest = folderId.substring(4)
        let idx = rest.indexOf(':')
        if (idx < 0) return null
        return { restrict: rest.substring(0, idx), name: rest.substring(idx + 1) }
    }
    _buildBookmarkBody(comicId, restrict, tags) {
        let body = 'illust_id=' + encodeURIComponent(comicId) +
                   '&restrict=' + encodeURIComponent(restrict || 'public')
        for (let tag of (tags || [])) body += '&tags%5B%5D=' + encodeURIComponent(tag)
        return body
    }
    async _getBookmarkDetail(comicId) {
        try {
            let json = await this.apiGet(this.apiBase +
                '/v2/illust/bookmark/detail?illust_id=' + comicId)
            return json.bookmark_detail || null
        } catch (e) { return null }
    }

    favorites = {
        multiFolder: true,
        singleFolderForSingleComic: false,

        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            this.requireAccount()
            let parts = this.parseTagFolder(folderId)

            if (!isAdding) {
                if (!parts) {
                    await this.apiPost(this.apiBase + '/v1/illust/bookmark/delete',
                        'illust_id=' + encodeURIComponent(comicId))
                    return 'ok'
                }
                let detail = await this._getBookmarkDetail(comicId)
                if (!detail || !detail.is_bookmarked) return 'ok'
                let remaining = (detail.tags || []).map(t => t.name).filter(n => n !== parts.name)
                await this.apiPost(this.apiBase + '/v2/illust/bookmark/add',
                    this._buildBookmarkBody(comicId, detail.restrict || parts.restrict || 'public', remaining))
                return 'ok'
            }

            if (!parts) {
                let detail = await this._getBookmarkDetail(comicId)
                let tags = detail && detail.is_bookmarked ? (detail.tags || []).map(t => t.name) : []
                await this.apiPost(this.apiBase + '/v2/illust/bookmark/add',
                    this._buildBookmarkBody(comicId, folderId || 'public', tags))
                return 'ok'
            }

            let detail = await this._getBookmarkDetail(comicId)
            let restrict = detail && detail.is_bookmarked && detail.restrict ? detail.restrict : parts.restrict
            let tags = detail && detail.is_bookmarked ? (detail.tags || []).map(t => t.name) : []
            if (tags.indexOf(parts.name) < 0) tags.push(parts.name)
            await this.apiPost(this.apiBase + '/v2/illust/bookmark/add',
                this._buildBookmarkBody(comicId, restrict, tags))
            return 'ok'
        },

        loadFolders: async (comicId) => {
            this.requireAccount()
            let folders = { 'public': '公开收藏', 'private': '私密收藏' }
            let favorited = []
            let detail = null
            if (comicId) detail = await this._getBookmarkDetail(comicId)
            let userId = this.getUserId()
            for (let restrict of ['public', 'private']) {
                try {
                    let json = await this.apiGet(this.apiBase + '/v1/user/bookmark-tags/illust?user_id=' +
                        (userId || '') + '&restrict=' + restrict)
                    for (let tag of (json.bookmark_tags || [])) {
                        folders[this.tagFolderId(restrict, tag.name)] = `${tag.name} (${tag.count})`
                    }
                } catch (e) {}
            }
            if (detail && detail.is_bookmarked) {
                let restrict = detail.restrict || 'public'
                favorited.push(restrict)
                for (let tag of (detail.tags || [])) {
                    favorited.push(this.tagFolderId(restrict, tag.name))
                }
            }
            return { folders: folders, favorited: favorited }
        },

        addFolder: async (name) => {
            this.requireAccount()
            await this.apiPost(this.apiBase + '/v1/user/bookmark-tags/illust',
                'tag=' + encodeURIComponent(name) + '&restrict=public')
            return 'ok'
        },

        deleteFolder: async (folderId) => {
            this.requireAccount()
            let parts = this.parseTagFolder(folderId)
            if (!parts) throw 'Invalid folder'
            await this.apiDelete(this.apiBase + '/v1/user/bookmark-tags/illust?tag=' +
                encodeURIComponent(parts.name) + '&restrict=' + parts.restrict)
            return 'ok'
        },

        loadNext: async (next, folder) => {
            this.requireAccount()
            let userId = this.getUserId()
            let restrict = 'public'
            let tag = null
            let parts = this.parseTagFolder(folder)
            if (parts) { restrict = parts.restrict; tag = parts.name }
            else if (folder === 'private') restrict = 'private'

            let url
            if (next) url = next.startsWith('http') ? next : this.apiBase + next
            else {
                url = this.apiBase + '/v1/user/bookmarks/illust?user_id=' + userId +
                    '&restrict=' + restrict + '&filter=for_android'
                if (tag) url += '&tag=' + encodeURIComponent(tag)
            }
            let json = await this.apiGet(url)
            let comics = this._filterAll((json.illusts || []).map(e => this.parseIllust(e)))
            return { comics: comics, next: this.fixNextUrl(json.next_url) }
        },
    }

    // ==========================================================
    //  Comic
    // ==========================================================
    comic = {
        loadInfo: async (id) => {
            if (id.startsWith('user_')) {
                let userId = id.substring(5)
                let userJson
                try {
                    userJson = await this.apiGet(this.apiBase + '/v1/user/detail?filter=for_android&user_id=' + userId)
                } catch (e) {}
                let user = userJson?.user
                if (!user) throw 'User not found'

                let allIllusts = []
                let offset = 0, limit = 30, maxPages = 100, hasMore = true, pageCount = 0
                while (hasMore && pageCount < maxPages) {
                    let illustsJson = await this.apiGet(this.apiBase + '/v1/user/illusts?filter=for_android&user_id=' +
                        userId + '&offset=' + offset)
                    let illusts = illustsJson.illusts || []
                    if (illusts.length === 0) hasMore = false
                    else {
                        allIllusts = allIllusts.concat(illusts)
                        offset += limit; pageCount++
                        if (illusts.length < limit) hasMore = false
                    }
                }
                let tagsObj = {}
                tagsObj['Artist'] = [user.name + ' |' + user.id]
                let chapters = {}
                if (allIllusts.length > 0) {
                    for (let i = 0; i < allIllusts.length; i++)
                        chapters[allIllusts[i].id.toString()] = allIllusts[i].title
                } else chapters['0'] = user.name

                let isFollowed = false
                if (this.loadData(this.accountTokenKey(this.activeAccount))) {
                    try {
                        let followJson = await this.apiGet(this.apiBase + '/v1/user/follow/detail?user_id=' + userId)
                        let fd = followJson.follow_detail
                        if (fd) isFollowed = !!fd.is_followed
                    } catch (e) {}
                }
                this.saveData('_artist_of_' + userId, userId)
                let desc = user.comment || ''
                if (allIllusts.length === 0) desc = (desc ? desc + '\n\n' : '') + 'No illustrations yet.'
                return new ComicDetails({
                    title: user.name, subtitle: user.account,
                    cover: this.rewriteHost(user.profile_image_urls.medium),
                    description: desc, tags: tagsObj, chapters: chapters,
                    isLiked: isFollowed,
                    url: 'https://www.pixiv.net/users/' + user.id
                })
            }

            let json = await this.apiGet(this.apiBase + '/v1/illust/detail?illust_id=' + id)
            let illust = json.illust
            if (!illust) throw 'Illust not found'
            let chapters = { '0': illust.title }
            let tagsObj = {}
            let contentTags = (illust.tags || []).map(t =>
                (t.translated_name && t.translated_name !== t.name)
                    ? t.name + ' [' + t.translated_name + ']'
                    : t.name
            )
            if (contentTags.length > 0) tagsObj['Tags'] = contentTags
            tagsObj['Artist'] = [illust.user.name + ' |' + illust.user.id]
            this.saveData('_artist_of_' + illust.id, illust.user.id)

            let related = []
            try {
                let relatedJson = await this.apiGet(this.apiBase + '/v2/illust/related?filter=for_android&illust_id=' + id)
                related = this._filterAll((relatedJson.illusts || []).map(e => this.parseIllust(e)))
            } catch (e) {}

            let isFollowed = false
            if (this.loadData(this.accountTokenKey(this.activeAccount))) {
                try {
                    let followJson = await this.apiGet(this.apiBase + '/v1/user/follow/detail?user_id=' + illust.user.id)
                    let fd = followJson.follow_detail
                    if (fd) isFollowed = !!fd.is_followed
                } catch (e) {}
            }
            return new ComicDetails({
                title: illust.title, subtitle: illust.user.name,
                cover: this.rewriteHost(this.pickCover(illust)),
                description: illust.caption || '',
                tags: tagsObj, chapters: chapters,
                isFavorite: illust.is_bookmarked || false,
                recommend: related,
                url: 'https://www.pixiv.net/artworks/' + illust.id,
                commentCount: illust.total_comments || 0,
                likesCount: illust.total_bookmarks || 0,
                isLiked: isFollowed,
                uploader: illust.user.name,
                uploadTime: illust.create_date,
                updateTime: illust.create_date,
                maxPage: illust.page_count || 1
            })
        },

        loadEp: async (comicId, epId) => {
            let illustId = comicId.startsWith('user_') ? parseInt(epId) : parseInt(comicId)
            if (!illustId) throw 'Invalid illust ID'
            let json = await this.apiGet(this.apiBase + '/v1/illust/detail?illust_id=' + illustId)
            let illust = json.illust
            if (!illust) throw 'Illust not found'
            let images = []
            if (illust.page_count <= 1 || !illust.meta_pages || illust.meta_pages.length === 0) {
                let url = this.pickImageUrls(illust.image_urls)
                if (this.imageQuality === 'original' && illust.meta_single_page?.original_image_url)
                    url = illust.meta_single_page.original_image_url
                images.push(this.rewriteHost(url))
            } else {
                for (let i = 0; i < illust.meta_pages.length; i++) {
                    let page = illust.meta_pages[i]
                    let url = this.pickImageUrls(page.image_urls)
                    if (this.imageQuality === 'original' && page.image_urls.original)
                        url = page.image_urls.original
                    images.push(this.rewriteHost(url))
                }
            }
            return { images: images }
        },

        onImageLoad: (url, comicId, epId) => ({
            url: this.rewriteHost(url),
            headers: { 'Referer': 'https://app-api.pixiv.net/', 'User-Agent': Pixiv.USER_AGENT }
        }),
        onThumbnailLoad: (url) => ({
            url: this.rewriteHost(url),
            headers: { 'Referer': 'https://app-api.pixiv.net/', 'User-Agent': Pixiv.USER_AGENT }
        }),

        likeComic: async (id, isLike) => {
            this.requireAccount()
            let artistId = this.loadData('_artist_of_' + id)
            if (!artistId && id.startsWith('user_')) artistId = id.substring(5)
            if (!artistId) return
            let isFollowed = false
            try {
                let followJson = await this.apiGet(this.apiBase + '/v1/user/follow/detail?user_id=' + artistId)
                let fd = followJson.follow_detail
                if (fd) isFollowed = !!fd.is_followed
            } catch (e) {}
            if (isFollowed) {
                await this.apiPost(this.apiBase + '/v1/user/follow/delete', 'user_id=' + artistId)
            } else {
                await this.apiPost(this.apiBase + '/v1/user/follow/add', 'user_id=' + artistId + '&restrict=private')
            }
        },

        loadComments: async (comicId, subId, page, replyTo) => {
            let cursorKey = '_comment_cursor_' + comicId + (replyTo ? '_' + replyTo : '_root')
            let url
            if (page > 1) {
                let cursor = this.loadData(cursorKey)
                if (!cursor) return { comments: [], maxPage: page - 1 }
                url = cursor.startsWith('http') ? cursor : this.apiBase + cursor
            } else {
                this.deleteData(cursorKey)
                url = replyTo
                    ? this.apiBase + '/v2/illust/comment/replies?comment_id=' + replyTo
                    : this.apiBase + '/v3/illust/comments?illust_id=' + comicId
            }
            let json = await this.apiGet(url)
            let comments = (json.comments || []).map(c => this.parseComment(c))
            if (json.next_url) this.saveData(cursorKey, json.next_url)
            else this.deleteData(cursorKey)
            return { comments: comments, maxPage: json.next_url ? page + 1 : page }
        },

        sendComment: async (comicId, subId, content, replyTo) => {
            this.requireAccount()
            let body = 'illust_id=' + encodeURIComponent(comicId) +
                       '&comment=' + encodeURIComponent(content)
            if (replyTo) body += '&parent_comment_id=' + encodeURIComponent(replyTo)
            await this.apiPost(this.apiBase + '/v1/illust/comment/add', body)
            return 'ok'
        },

        likeComment: async (comicId, subId, commentId, isLike) => {},
        voteComment: async (id, subId, commentId, isUp, isCancel) => {},

        onClickTag: (namespace, tag) => {
            if (namespace === 'Artist') {
                let idx = tag.lastIndexOf('|')
                if (idx !== -1) {
                    return {
                        page: 'category',
                        attributes: { category: 'user_illusts', param: tag.substring(idx + 1).trim() }
                    }
                }
            }
            if (tag && tag.startsWith('artist:')) {
                return {
                    page: 'category',
                    attributes: { category: 'user_illusts', param: tag.substring(7) }
                }
            }
            let searchTag = tag
            let bracketIdx = tag.lastIndexOf(' [')
            if (bracketIdx !== -1 && tag.endsWith(']')) searchTag = tag.substring(0, bracketIdx)
            this._pendingTagSearch = true
            return { page: 'search', attributes: { keyword: searchTag } }
        },

        link: {
            domains: ['pixiv.net', 'www.pixiv.net'],
            linkToId: (url) => {
                let match = url.match(/\/artworks\/(\d+)/)
                if (match) return match[1]
                match = url.match(/\/users\/(\d+)/)
                if (match) return 'user_' + match[1]
                return null
            }
        },

        idMatch: "^(\\d+|user_\\d+)$",
        enableTagsTranslate: true,
    }

    // ==========================================================
    //  账号
    // ==========================================================
    account = {
        loginWithWebview: {
            get url() {
                let chars = Pixiv.PKCE_CHARS
                let verifier = ''
                for (let i = 0; i < 128; i++) verifier += chars[randomInt(0, chars.length - 1)]
                Pixiv._pkceVerifier = verifier
                let hash = Convert.sha256(Convert.encodeUtf8(verifier))
                let b64 = Convert.encodeBase64(hash)
                let challenge = ''
                for (let i = 0; i < b64.length; i++) {
                    let c = b64[i]
                    if (c === '+') challenge += '-'
                    else if (c === '/') challenge += '_'
                    else if (c === '=') break
                    else challenge += c
                }
                return 'https://app-api.pixiv.net/web/v1/login' +
                    '?code_challenge=' + challenge +
                    '&code_challenge_method=S256' +
                    '&client=pixiv-android'
            },

            checkStatus: (url, title) => {
                let codeIdx = url.indexOf('code=')
                if (url.indexOf('/auth/pixiv/callback') !== -1 && codeIdx !== -1) {
                    let start = codeIdx + 5
                    let end = url.indexOf('&', start)
                    if (end === -1) end = url.length
                    let code = url.substring(start, end)
                    if (code) {
                        if (Pixiv._pkceVerifier) this.saveData('pkce_verifier', Pixiv._pkceVerifier)
                        this.saveData('_pkce_code', decodeURIComponent(code))
                        return true
                    }
                }
                return false
            },

            onLoginSuccess: () => {
                let code = this.loadData('_pkce_code')
                if (!code) return
                this._exchangeAuthCode().catch(function(e) {})
            }
        },

        login: async (account, pwd) => {
            if (account && pwd) {
                let ok = await this._passwordLogin(account, pwd, 0)
                if (ok) { this.saveData('active_account', '0'); return 'ok' }
            }
            let code = this.loadData('_pkce_code')
            if (code) {
                let ok = await this._exchangeAuthCode()
                if (ok) { this.saveData('active_account', '0'); return 'ok' }
                throw 'Login failed: unable to exchange authorization code'
            }
            let pending = this.loadData('pending_refresh_token')
            if (pending) {
                let ok = await this._exchangeWebviewToken()
                if (ok) { this.saveData('active_account', '0'); return 'ok' }
                throw 'Login failed: unable to exchange webview token'
            }
            let manual = (account || '').trim()
            if (manual) {
                this.saveData(this.accountRefreshKey(0), manual)
                try {
                    await this.refreshToken(0)
                    this.saveData('active_account', '0')
                    return 'ok'
                } catch (e) {
                    this.deleteData(this.accountRefreshKey(0))
                    throw 'Login failed: invalid refresh token'
                }
            }
            if (this.loadData(this.accountRefreshKey(0))) {
                try {
                    await this.refreshToken(0)
                    this.saveData('active_account', '0')
                    return 'ok'
                } catch (e) { throw 'Login failed: unable to refresh token' }
            }
            throw 'Please login via WebView first, or provide a valid refresh_token'
        },

        logout: () => {
            UI.showDialog("确认退出", "确定要退出 Pixiv 账号吗？", [
                {
                    text: "确定", style: "danger",
                    callback: () => {
                        try {
                            this._clearAccountData(0)
                            let subs = this.subAccounts()
                            for (let i = 0; i < subs.length; i++) this._clearAccountData(i + 1)
                            this.deleteData('pending_refresh_token')
                            this.deleteData('_pkce_code')
                            this.deleteData('pkce_verifier')
                            this.deleteData('active_account')
                            Network.deleteCookies('https://www.pixiv.net')
                            Network.deleteCookies('https://accounts.pixiv.net')
                            UI.showMessage("已退出登录")
                        } catch (e) { UI.showMessage("退出时发生错误，请重试") }
                    }
                },
                { text: "取消", callback: () => {} }
            ])
        },

        registerWebsite: 'https://www.pixiv.net/signup/'
    }

    // ==========================================================
    //  设置
    // ==========================================================
    settings = {
        help: {
            title: "使用帮助", type: "callback", buttonText: "查看帮助",
            callback: () => {
                UI.showDialog("Pixiv 使用帮助",
`• 主账号登录：WebView / Refresh Token / 用户名密码均可。
• 附属账号：点「添加附属账号」→ 输入名称 → 输入 refresh_token → 校验通过即保存。
  可添加多个；点「重新登录所有附属账号」批量刷新；点「选择当前账号」切换；点「删除附属账号」移除。
• refresh_token 从哪来：用本应用 WebView 登录主账号后从网络日志/抓包中取出；
  或从其它支持 Pixiv 的客户端导出。
• 收藏：使用 Pixiv 收藏标签作为文件夹，区分公开/私密。
• 探索页：关注、推荐画师、已关注画师、推荐插画、推荐漫画、综合日榜、热门标签。
• 分类页：静态热门标签 + 动态热门标签。
• 屏蔽 R18/R18G/AI：可在下方开关中开启。
• 图片域名 / 图片质量 / API 地址 / OAuth 地址：均可自定义。`,
                    [{text: "知道了", callback: () => {}}])
            }
        },
        apiHost: {
            title: "API 地址", type: "input",
            default: "https://app-api.pixiv.net",
            validator: "^https?://.+"
        },
        oauthHost: {
            title: "OAuth 地址", type: "input",
            default: "https://oauth.secure.pixiv.net",
            validator: "^https?://.+"
        },
        login_main_with_token: {
            title: "账号快捷登录", type: "callback",
            buttonText: "使用 Refresh Token 登录",
            callback: async () => {
                let token = await UI.showInputDialog("输入 Refresh Token", (v) => (v && v.trim()) ? null : "不能为空")
                if (!token) return
                token = token.trim()
                try {
                    await this.account.login(token, "")
                    UI.showMessage("登录成功")
                } catch (e) {
                    UI.showDialog("登录失败", String(e), [{text: "确定", callback: () => {}}])
                }
            }
        },
        imageQuality: {
            title: "图片质量", type: "select",
            options: [
                { value: 'medium', text: '中' },
                { value: 'large', text: '大' },
                { value: 'original', text: '原图' },
            ],
            default: 'large',
        },
        imageHost: {
            title: "图片域名", type: "select",
            options: [
                { value: 'i.pximg.net', text: 'i.pximg.net（官方）' },
                { value: 'i.pixiv.re', text: 'i.pixiv.re（反代）' },
                { value: 'custom', text: '自定义' },
            ],
            default: 'i.pximg.net',
        },
        customImageHost: {
            title: "自定义图片域名", type: "input", default: "",
            description: "选择「自定义」时生效，仅填 host，如 i.example.com"
        },
        hideR18:  { title: "屏蔽R18内容",  type: "switch", default: false },
        hideR18G: { title: "屏蔽R18G内容", type: "switch", default: false },
        hideAI:   { title: "屏蔽AI内容",   type: "switch", default: false },

        // ==================== 附属账号（Token 登录） ====================
        add_sub_account: {
            title: "添加附属账号",
            type: "callback",
            buttonText: "输入名称和 Token 添加",
            callback: async () => {
                let name = await UI.showInputDialog("账号名称", (v) => (v && v.trim()) ? null : "不能为空")
                if (name === null || name === undefined) return
                name = String(name).trim()

                let token = await UI.showInputDialog("Refresh Token", (v) => (v && v.trim()) ? null : "不能为空")
                if (token === null || token === undefined) return
                token = String(token).trim()

                let subs = this.subAccounts()
                let newIdx = subs.length + 1

                // 写入临时 token 进行验证
                this.saveData(this.accountRefreshKey(newIdx), token)
                try {
                    await this.refreshToken(newIdx)
                } catch (e) {
                    this._clearAccountData(newIdx)
                    UI.showDialog("登录失败", String(e), [{text: "确定", callback: () => {}}])
                    return
                }

                subs.push({ name: name, token: token })
                this._saveSubAccounts(subs)
                UI.showMessage(`已添加账号: ${name}`)
            }
        },

        login_sub_accounts: {
            title: "重新登录所有附属账号",
            type: "callback",
            buttonText: "刷新所有附属账号",
            callback: async () => {
                let subs = this.subAccounts()
                if (subs.length === 0) { UI.showMessage("请先添加附属账号"); return }
                let ok = 0
                for (let i = 0; i < subs.length; i++) {
                    let idx = i + 1
                    let acc = subs[i]
                    // 若运行时的 token 不存在，回退到 meta 里的初始 token
                    if (!this.loadData(this.accountRefreshKey(idx))) {
                        let initial = acc.token || acc.refresh_token || acc.refreshToken
                        if (initial) this.saveData(this.accountRefreshKey(idx), String(initial).trim())
                    }
                    try {
                        await this.refreshToken(idx)
                        ok++
                    } catch (e) {
                        UI.showMessage(`${this.accountName(idx)}: ${e}`)
                        this.deleteData(this.accountRefreshKey(idx))
                    }
                }
                UI.showMessage(`附属账号登录: ${ok}/${subs.length} 成功`)
            },
        },

        remove_sub_account: {
            title: "删除附属账号",
            type: "callback",
            buttonText: "选择要删除的账号",
            callback: async () => {
                let subs = this.subAccounts()
                if (subs.length === 0) { UI.showMessage("暂无附属账号"); return }
                let options = subs.map((s, i) => s.name || `账号${i + 1}`)
                let idx = await UI.showSelectDialog("选择要删除的账号", options, 0)
                if (idx === null || idx === undefined) return

                let oneBased = idx + 1
                let lastOneBased = subs.length

                if (oneBased !== lastOneBased) {
                    // 把最后一个账号的数据搬到被删位置
                    this._moveAccountData(lastOneBased, oneBased)
                    subs[oneBased - 1] = subs[lastOneBased - 1]
                }
                this._clearAccountData(lastOneBased)
                subs.pop()
                this._saveSubAccounts(subs)

                if (this.activeAccount > subs.length) this.saveData('active_account', '0')
                UI.showMessage(`已删除 ${subs[oneBased - 1] ? '' : ''}账号`)
            },
        },

        clear_sub_accounts: {
            title: "清除附属账号TOKEN",
            type: "callback",
            buttonText: "清除运行时 Token",
            callback: () => {
                let subs = this.subAccounts()
                for (let i = 0; i < subs.length; i++) this._clearAccountData(i + 1)
                this.saveData('active_account', '0')
                UI.showMessage("已清除运行时 Token（账号列表中配置保留，可再次刷新登录）")
            },
        },

        switch_account: {
            title: "切换当前账号",
            type: "callback",
            buttonText: "选择当前账号",
            callback: async () => {
                let options = []
                for (let i = 0; i < this.accountCount(); i++) {
                    options.push(`${this.accountName(i)}${this.hasAccount(i) ? '' : ' (未登录)'}`)
                }
                let index = await UI.showSelectDialog("选择当前账号", options,
                    Math.min(this.activeAccount, this.accountCount() - 1))
                if (index === null || index === undefined) return
                this.saveData('active_account', String(index))
                UI.showMessage(`已切换到 ${this.accountName(index)}`)
            },
        },
    }

    // ==========================================================
    //  翻译
    // ==========================================================
    translation = {
        'zh_CN': {
            '使用帮助': '使用帮助', '查看帮助': '查看帮助',
            'API 地址': 'API 地址', 'OAuth 地址': 'OAuth 地址',
            '图片质量': '图片质量', '图片域名': '图片域名',
            '自定义图片域名': '自定义图片域名',
            '中': '中', '大': '大', '原图': '原图', '自定义': '自定义',
            'i.pximg.net（官方）': 'i.pximg.net（官方）',
            'i.pixiv.re（反代）': 'i.pixiv.re（反代）',
            'Following': '关注', 'Recommended Artists': '推荐画师',
            'Followed Artists': '已关注画师',
            'Recommended Illustrations': '推荐插画',
            'Recommended Manga': '推荐漫画',
            'Daily Ranking': '综合日榜', 'Trending Tags': '热门标签',
            '热门标签': '热门标签', '热门标签(动态)': '热门标签(动态)',
            'sort': '排序', 'target': '搜索目标', 'ai': 'AI',
            'Newest': '最新', 'Oldest': '最旧', 'Popular': '最热',
            'Tag Match': '标签匹配', 'Exact Tag': '精确标签',
            'Title & Caption': '标题和简介', 'Users': '用户',
            'All': '全部', 'No AI': '不含AI', 'AI Only': '仅AI',
            'Daily': '日榜', 'Weekly': '周榜', 'Monthly': '月榜',
            'Daily (Male)': '男性向', 'Daily (Female)': '女性向',
            'Original': '原创', 'Rookie': '新人', 'Manga': '漫画',
            'R18': 'R18', 'AI': 'AI', 'R18 AI': 'R18 AI',
            '账号快捷登录': '账号快捷登录',
            '使用 Refresh Token 登录': '使用 Refresh Token 登录',
            '屏蔽R18内容': '屏蔽R18内容',
            '屏蔽R18G内容': '屏蔽R18G内容',
            '屏蔽AI内容': '屏蔽AI内容',
            '添加附属账号': '添加附属账号',
            '输入名称和 Token 添加': '输入名称和 Token 添加',
            '重新登录所有附属账号': '重新登录所有附属账号',
            '刷新所有附属账号': '刷新所有附属账号',
            '删除附属账号': '删除附属账号',
            '选择要删除的账号': '选择要删除的账号',
            '清除附属账号TOKEN': '清除附属账号TOKEN',
            '清除运行时 Token': '清除运行时 Token',
            '切换当前账号': '切换当前账号',
            '选择当前账号': '选择当前账号',
            '公开收藏': '公开收藏', '私密收藏': '私密收藏',
        },
        'zh_TW': {
            '使用帮助': '使用說明', '查看帮助': '查看說明',
            'API 地址': 'API 位址', 'OAuth 地址': 'OAuth 位址',
            '图片质量': '圖片品質', '图片域名': '圖片網域',
            '自定义图片域名': '自訂圖片網域',
            '中': '中', '大': '大', '原图': '原圖', '自定义': '自訂',
            '账号快捷登录': '帳號快捷登入',
            '使用 Refresh Token 登录': '使用 Refresh Token 登入',
            '屏蔽R18内容': '屏蔽R18內容',
            '屏蔽R18G内容': '屏蔽R18G內容',
            '屏蔽AI内容': '屏蔽AI內容',
            '添加附属账号': '新增附屬帳號',
            '重新登录所有附属账号': '重新登入所有附屬帳號',
            '删除附属账号': '刪除附屬帳號',
            '清除附属账号TOKEN': '清除附屬帳號TOKEN',
            '切换当前账号': '切換目前帳號',
            '公开收藏': '公開收藏', '私密收藏': '私密收藏',
        },
        'en': {
            '使用帮助': 'Help', '查看帮助': 'View Help',
            'API 地址': 'API Host', 'OAuth 地址': 'OAuth Host',
            '图片质量': 'Image Quality', '图片域名': 'Image Host',
            '自定义图片域名': 'Custom Image Host',
            '中': 'Medium', '大': 'Large', '原图': 'Original', '自定义': 'Custom',
            '账号快捷登录': 'Quick Account Login',
            '使用 Refresh Token 登录': 'Login with Refresh Token',
            '屏蔽R18内容': 'Hide R18 Content',
            '屏蔽R18G内容': 'Hide R18G Content',
            '屏蔽AI内容': 'Hide AI Content',
            '添加附属账号': 'Add Sub-account',
            '重新登录所有附属账号': 'Refresh All Sub-accounts',
            '删除附属账号': 'Remove Sub-account',
            '清除附属账号TOKEN': 'Clear Sub-account Tokens',
            '切换当前账号': 'Switch Account',
            '公开收藏': 'Public', '私密收藏': 'Private',
        },
    }
}