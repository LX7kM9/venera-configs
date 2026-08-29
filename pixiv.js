/** @type {import('./_venera_.js')} */

class Pixiv extends ComicSource {

    // ============================================================
    //  BASIC INFO
    // ============================================================
    name = "Pixiv"
    key = "pixiv"
    version = "1.4.4"  // 增加使用帮助（模仿 Komiic 风格）
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/pixiv.js"

    // ============================================================
    //  CONSTANTS
    // ============================================================
    static AUTH_URL      = "https://oauth.secure.pixiv.net/auth/token"
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

    // ============================================================
    //  INIT — 清除旧多账户数据，避免 Null check
    // ============================================================

    init() {
        // 删除所有多账户相关的存储键（如果存在）
        this.deleteData('sub_accounts')
        for (let i = 1; i <= 10; i++) {
            this.deleteData(`access_token_${i}`)
            this.deleteData(`refresh_token_${i}`)
            this.deleteData(`user_user_id_${i}`)
            this.deleteData(`user_user_name_${i}`)
            this.deleteData(`user_user_account_${i}`)
        }
        this.deleteData('_migrated_sub_accounts')
    }

    // ============================================================
    //  SIGN HEADERS
    // ============================================================

    getSignHeaders() {
        let d = new Date()
        let time = d.toISOString().replace(/\.\d+Z$/, '+00:00')
        let hash = Convert.hexEncode(
            Convert.md5(Convert.encodeUtf8(time + Pixiv.HASH_SECRET))
        )
        return {
            'X-Client-Time':    time,
            'X-Client-Hash':    hash,
            'User-Agent':       Pixiv.USER_AGENT,
            'App-OS':           'Android',
            'App-OS-Version':   'Android 10.0',
            'App-Version':      '5.0.166',
            'Accept-Language':  'zh-cn'
        }
    }

    // ============================================================
    //  TOKEN MANAGEMENT (单账号)
    // ============================================================

    _saveTokenResponse(resp) {
        this.saveData('access_token', resp.access_token)
        this.saveData('refresh_token', resp.refresh_token)
        if (resp.user) {
            this.saveData('user_id', resp.user.id.toString())
            this.saveData('user_name', resp.user.name)
            this.saveData('user_account', resp.user.account)
        }
        this.saveData('account', ['refresh_token', ''])
    }

    async _newTokenRequest(paramList) {
        let bodyList = []
        for (let i = 0; i < paramList.length; i++) {
            bodyList.push(paramList[i][0] + '=' + encodeURIComponent(paramList[i][1]))
        }
        let body = bodyList.join('&')

        let headers = this.getSignHeaders()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        headers['Host'] = 'oauth.secure.pixiv.net'

        Network.deleteCookies('https://oauth.secure.pixiv.net')

        console.log('[Pixiv] _requestToken POST to ' + Pixiv.AUTH_URL)
        let res = await Network.post(Pixiv.AUTH_URL, headers, body)
        if (res.status !== 200) {
            console.log('[Pixiv] _requestToken FAILED, body (first 300): ' + res.body.substring(0, 300))
            return null
        }

        let json = JSON.parse(res.body)
        let resp = json.response
        if (!resp || !resp.access_token) {
            console.log('[Pixiv] _requestToken: no access_token in response')
            return null
        }

        console.log('[Pixiv] _requestToken SUCCESS, got access_token')
        this._saveTokenResponse(resp)
        return resp.access_token
    }

    async _exchangeAuthCode() {
        let code = this.loadData('_pkce_code')
        let verifier = Pixiv._pkceVerifier
        if (!code || !verifier) return false

        this.deleteData('_pkce_code')

        let result = await this._newTokenRequest([
            ['client_id',       Pixiv.CLIENT_ID],
            ['client_secret',   Pixiv.CLIENT_SECRET],
            ['grant_type',      'authorization_code'],
            ['code',            code],
            ['code_verifier',   verifier],
            ['redirect_uri',    Pixiv.REDIRECT_URI],
            ['include_policy',  'true']
        ])
        return !!result
    }

    async _exchangeWebviewToken() {
        let token = this.loadData('pending_refresh_token')
        if (!token) return false
        this.deleteData('pending_refresh_token')
        this.saveData('refresh_token', token)

        let result = await this._newTokenRequest([
            ['client_id',       Pixiv.CLIENT_ID],
            ['client_secret',   Pixiv.CLIENT_SECRET],
            ['grant_type',      'refresh_token'],
            ['refresh_token',   token],
            ['include_policy',  'true']
        ])
        return !!result
    }

    async refreshToken() {
        let refreshToken = this.loadData('refresh_token')
        if (!refreshToken) throw 'No refresh token'

        let result = await this._newTokenRequest([
            ['client_id',       Pixiv.CLIENT_ID],
            ['client_secret',   Pixiv.CLIENT_SECRET],
            ['grant_type',      'refresh_token'],
            ['refresh_token',   refreshToken],
            ['include_policy',  'true']
        ])
        if (!result) throw 'Token refresh failed'
        return result
    }

    // ============================================================
    //  HTTP HELPERS (单账号)
    // ============================================================

    async _ensureToken() {
        if (this.loadData('pending_refresh_token')) {
            console.log('[Pixiv] _ensureToken: found pending_refresh_token, exchanging...')
            try { await this._exchangeWebviewToken() } catch (e) {}
        }
        if (this.loadData('_pkce_code')) {
            console.log('[Pixiv] _ensureToken: found _pkce_code, exchanging...')
            try { await this._exchangeAuthCode() } catch (e) {}
        }
        let hasAccessToken = !!this.loadData('access_token')
        console.log('[Pixiv] _ensureToken done, has access_token=' + hasAccessToken)
        if (!hasAccessToken) {
            try {
                await this.refreshToken()
                return true
            } catch (e) {
                return false
            }
        }
        return true
    }

    async apiGet(url) {
        console.log('[Pixiv] apiGet: ' + url.substring(0, 80))
        await this._ensureToken()
        let token = this.loadData('access_token')
        if (!token) throw 'Login expired'

        let headers = this.getSignHeaders()
        headers['Authorization'] = 'Bearer ' + token
        headers['Host'] = 'app-api.pixiv.net'

        let res = await Network.get(url, headers)
        if (this._isOAuthError(res)) {
            await this.refreshToken()
            token = this.loadData('access_token')
            headers['Authorization'] = 'Bearer ' + token
            res = await Network.get(url, headers)
        }
        if (res.status !== 200) throw 'HTTP ' + res.status + ': ' + url
        return JSON.parse(res.body)
    }

    async apiPost(url, body) {
        await this._ensureToken()
        let token = this.loadData('access_token')
        if (!token) throw 'Login expired'

        let headers = this.getSignHeaders()
        headers['Authorization'] = 'Bearer ' + token
        headers['Host'] = 'app-api.pixiv.net'
        headers['Content-Type'] = 'application/x-www-form-urlencoded'

        let res = await Network.post(url, headers, body)
        if (this._isOAuthError(res)) {
            await this.refreshToken()
            token = this.loadData('access_token')
            headers['Authorization'] = 'Bearer ' + token
            res = await Network.post(url, headers, body)
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

    // ============================================================
    //  UTILITY
    // ============================================================

    parseIllust(illust) {
        let cover = illust.image_urls.medium
        if (illust.page_count > 1 && illust.meta_pages && illust.meta_pages.length > 0) {
            cover = illust.meta_pages[0].image_urls.medium
        }
        let tags = (illust.tags || []).map(function(t) { return t.translated_name || t.name })
        tags.push(illust.user.name)
        return new Comic({
            id: illust.id.toString(),
            title: illust.title,
            subTitle: illust.user.name,
            cover: cover,
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
            cover = illusts[0].image_urls.medium
            tags = (illusts[0].tags || []).map(function(t) { return t.translated_name || t.name })
            pages = illusts.length
        }
        return new Comic({
            id: 'user_' + user.id.toString(),
            title: user.name,
            subTitle: user.account,
            cover: cover,
            tags: tags,
            description: '',
            maxPage: pages
        })
    }

    // ============================================================
    //  EXPLORE — 修复 Followed Artists 接口（移除 restrict 参数）
    // ============================================================

    explore = [
        {
            title: "Following",
            type: "multiPageComicList",
            loadNext: async (next) => {
                let url = next
                    ? (next.startsWith('http') ? next : this.apiBase + next)
                    : this.apiBase + '/v2/illust/follow?restrict=all'
                let json = await this.apiGet(url)
                let comics = (json.illusts || []).map((function(e) { return this.parseIllust(e) }).bind(this))
                return { comics: comics, next: json.next_url || null }
            },
        },
        {
            title: "Recommended Artists",
            type: "multiPageComicList",
            loadNext: async (next) => {
                let url = next
                    ? (next.startsWith('http') ? next : this.apiBase + next)
                    : this.apiBase + '/v1/user/recommended?filter=for_android'
                let json = await this.apiGet(url)
                let previews = json.user_previews || []
                let comics = previews.map((function(up) { return this.parseUserPreview(up) }).bind(this))
                return { comics: comics, next: json.next_url || null }
            },
        },
        {
            title: "Followed Artists",
            type: "multiPageComicList",
            loadNext: async (next) => {
                let userId = this.loadData('user_id')
                if (!userId) return { comics: [], next: null }
                let url = next
                    ? (next.startsWith('http') ? next : this.apiBase + next)
                    : this.apiBase + '/v1/user/following?filter=for_android&user_id=' + userId
                let json = await this.apiGet(url)
                let previews = json.user_previews || []
                let comics = previews.map((function(up) { return this.parseUserPreview(up) }).bind(this))
                return { comics: comics, next: json.next_url || null }
            },
        }
    ]

    // ============================================================
    //  CATEGORY (unchanged)
    // ============================================================

    category = {
        title: "Pixiv",
        parts: [],
        enableRankingPage: true,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            if (category === 'tag_search') {
                let url
                if (page > 1) {
                    let cursor = this.loadData('_tag_cursor')
                    if (!cursor) return { comics: [], maxPage: page - 1 }
                    url = cursor.startsWith('http') ? cursor : this.apiBase + cursor
                } else {
                    this.deleteData('_tag_cursor')
                    url = this.apiBase + '/v1/search/illust' +
                        '?word=' + encodeURIComponent(param) +
                        '&search_target=exact_match_for_tags' +
                        '&sort=popular_desc' +
                        '&filter=for_android' +
                        '&merge_plain_keyword_results=true'
                }
                let json = await this.apiGet(url)
                let illusts = json.illusts || []
                let comics = illusts.map((function(e) { return this.parseIllust(e) }).bind(this))
                if (json.next_url) this.saveData('_tag_cursor', json.next_url)
                else this.deleteData('_tag_cursor')
                return { comics: comics, maxPage: json.next_url ? page + 1 : page }
            }
            if (category === 'user_illusts') {
                let offset = (page - 1) * 30
                let json = await this.apiGet(
                    this.apiBase + '/v1/user/illusts?filter=for_android&user_id=' + param + '&offset=' + offset)
                let illusts = json.illusts || []
                let comics = illusts.map((function(e) { return this.parseIllust(e) }).bind(this))
                let maxPage = illusts.length < 30 ? page : page + 1
                return { comics: comics, maxPage: maxPage }
            }
            return { comics: [], maxPage: 1 }
        },
        ranking: {
            options: [
                "day-Daily",
                "week-Weekly",
                "month-Monthly",
                "day_male-Daily (Male)",
                "day_female-Daily (Female)",
                "week_original-Original",
                "week_rookie-Rookie",
                "day_manga-Manga",
                "day_r18-R18",
                "day_ai-AI",
                "day_r18_ai-R18 AI",
            ],
            load: async (option, page) => {
                let url
                let cursorKey = '_ranking_cursor_' + option
                if (page > 1) {
                    let cursor = this.loadData(cursorKey)
                    if (!cursor) return { comics: [], maxPage: page - 1 }
                    url = cursor.startsWith('http') ? cursor : this.apiBase + cursor
                } else {
                    this.deleteData(cursorKey)
                    url = this.apiBase + '/v1/illust/ranking?filter=for_android&mode=' + option
                }
                let json = await this.apiGet(url)
                let comics = (json.illusts || []).map((function(e) { return this.parseIllust(e) }).bind(this))
                if (json.next_url) this.saveData(cursorKey, json.next_url)
                else this.deleteData(cursorKey)
                return { comics: comics, maxPage: json.next_url ? page + 1 : page }
            },
        },
    }

    // ============================================================
    //  SEARCH — 包含 onTagSuggestionSelected 占位
    // ============================================================

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
                    url = this.apiBase + '/v1/search/user' +
                        '?word=' + encodeURIComponent(keyword) +
                        '&filter=for_android'
                } else if (isTagClick) {
                    url = this.apiBase + '/v1/search/illust' +
                        '?word=' + encodeURIComponent(keyword) +
                        '&search_target=exact_match_for_tags' +
                        '&sort=popular_desc' +
                        '&filter=for_android' +
                        '&merge_plain_keyword_results=true'
                } else {
                    url = this.apiBase + '/v1/search/illust' +
                        '?word=' + encodeURIComponent(keyword) +
                        '&sort=' + sort +
                        '&search_target=' + searchTarget +
                        '&filter=for_android' +
                        '&merge_plain_keyword_results=true' +
                        (aiFilter === 'exclude_ai' ? '&search_ai_type=1' : '') +
                        (aiFilter === 'only_ai' ? '&search_ai_type=2' : '')
                }
            }
            let json = await this.apiGet(url)
            let comics
            if (searchTarget === 'users') {
                let userPreviews = json.user_previews || []
                comics = userPreviews.map((function(e) { return this.parseUserPreview(e) }).bind(this))
            } else {
                comics = (json.illusts || []).map((function(e) { return this.parseIllust(e) }).bind(this))
            }
            return { comics: comics, next: json.next_url || null }
        },
        optionList: [
            {
                type: "select",
                options: [
                    "date_desc-Newest",
                    "date_asc-Oldest",
                    "popular_desc-Popular"
                ],
                label: "sort",
                default: "date_desc",
            },
            {
                type: "select",
                options: [
                    "partial_match_for_tags-Tag Match",
                    "exact_match_for_tags-Exact Tag",
                    "title_and_caption-Title & Caption",
                    "users-Users"
                ],
                label: "target",
                default: "partial_match_for_tags",
            },
            {
                type: "select",
                options: [
                    "all-All",
                    "exclude_ai-No AI",
                    "only_ai-AI Only"
                ],
                label: "ai",
                default: "all",
            }
        ],
        enableTagsSuggestions: false,
        onTagSuggestionSelected: (tag) => {}   // 占位
    }

    // ============================================================
    //  FAVORITES — 完全还原 0.7.0 版本（单账号标签文件夹）
    // ============================================================

    favorites = {
        multiFolder: true,

        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            if (isAdding) {
                let body = 'illust_id=' + comicId + '&restrict=public'
                if (folderId) {
                    body += '&tags%5B%5D=' + encodeURIComponent(folderId)
                }
                await this.apiPost(this.apiBase + '/v2/illust/bookmark/add', body)
            } else {
                let body = 'illust_id=' + comicId
                await this.apiPost(this.apiBase + '/v1/illust/bookmark/delete', body)
            }
            return 'ok'
        },

        loadFolders: async (comicId) => {
            let userId = this.loadData('user_id')
            if (!userId) throw 'Login expired'

            let json = await this.apiGet(
                this.apiBase + '/v1/user/bookmark-tags/illust?user_id=' + userId + '&restrict=public')
            let tags = json.bookmark_tags || []

            let folders = { '': '默认' }
            tags.forEach(function(t) {
                folders[t.name] = t.name + ' (' + t.count + ')'
            })

            let favorited = []
            if (comicId) {
                try {
                    let detail = await this.apiGet(
                        this.apiBase + '/v2/illust/bookmark/detail?illust_id=' + comicId)
                    let bd = detail.bookmark_detail
                    if (bd && bd.is_bookmarked) {
                        (bd.tags || []).forEach(function(t) { favorited.push(t.name) })
                    }
                } catch (e) {}
            }

            return { folders: folders, favorited: favorited }
        },

        loadComics: async (page, folder) => {
            let userId = this.loadData('user_id')
            if (!userId) throw 'Login expired'

            let offset = (page - 1) * 30
            let url = this.apiBase + '/v1/user/bookmarks/illust' +
                '?user_id=' + userId + '&restrict=public&offset=' + offset
            if (folder) url += '&tag=' + encodeURIComponent(folder)

            let json = await this.apiGet(url)
            let illusts = json.illusts || []
            let comics = illusts.map((function(e) { return this.parseIllust(e) }).bind(this))
            let maxPage = illusts.length < 30 ? page : page + 1
            return { comics: comics, maxPage: maxPage }
        },
    }

    // ============================================================
    //  COMIC — 包含 loadThumbnails 占位
    // ============================================================

    comic = {
        loadInfo: async (id) => {
            if (id.startsWith('user_')) {
                let userId = id.substring(5)
                let userJson, illustsJson
                try {
                    userJson = await this.apiGet(
                        this.apiBase + '/v1/user/detail?filter=for_android&user_id=' + userId)
                    illustsJson = await this.apiGet(
                        this.apiBase + '/v1/user/illusts?filter=for_android&user_id=' + userId + '&offset=0')
                } catch (e) {}
                let user = userJson?.user
                let illusts = illustsJson?.illusts || []
                if (!user) throw 'User not found'
                let tagsObj = {}
                tagsObj['Artist'] = [user.name + ' |' + user.id]
                let chapters = {}
                if (illusts.length > 0) {
                    for (let i = 0; i < illusts.length; i++) {
                        chapters[illusts[i].id.toString()] = illusts[i].title
                    }
                }
                let isFollowed = false
                if (this.loadData('user_id')) {
                    try {
                        let followJson = await this.apiGet(
                            this.apiBase + '/v1/user/follow/detail?user_id=' + userId)
                        let fd = followJson.follow_detail
                        if (fd) isFollowed = !!fd.is_followed
                    } catch (e) {}
                }
                this.saveData('_artist_of_' + userId, userId)
                let desc = user.comment || ''
                if (illusts.length === 0) {
                    desc = (desc ? desc + '\n\n' : '') + 'No illustrations yet.'
                }
                return new ComicDetails({
                    title: user.name,
                    subtitle: user.account,
                    cover: user.profile_image_urls.medium,
                    description: desc,
                    tags: tagsObj,
                    chapters: illusts.length > 0 ? chapters : { '0': user.name },
                    isLiked: isFollowed,
                    url: 'https://www.pixiv.net/users/' + user.id
                })
            }
            let json = await this.apiGet(
                this.apiBase + '/v1/illust/detail?illust_id=' + id)
            let illust = json.illust
            if (!illust) throw 'Illust not found'
            let chapters = {}
            chapters['0'] = illust.title
            let tagsObj = {}
            let contentTags = (illust.tags || []).map(function(t) {
                if (t.translated_name && t.translated_name !== t.name) {
                    return t.name + ' [' + t.translated_name + ']'
                }
                return t.name
            })
            if (contentTags.length > 0) tagsObj['Tags'] = contentTags
            tagsObj['Artist'] = [illust.user.name + ' |' + illust.user.id]
            this.saveData('_artist_of_' + illust.id, illust.user.id)
            let isFollowed = false
            if (this.loadData('user_id')) {
                try {
                    let followJson = await this.apiGet(
                        this.apiBase + '/v1/user/follow/detail?user_id=' + illust.user.id)
                    let fd = followJson.follow_detail
                    if (fd) isFollowed = !!fd.is_followed
                } catch (e) {}
            }
            return new ComicDetails({
                title: illust.title,
                subtitle: illust.user.name,
                cover: illust.image_urls.medium,
                description: illust.caption || '',
                tags: tagsObj,
                chapters: chapters,
                isFavorite: illust.is_bookmarked || false,
                url: 'https://www.pixiv.net/artworks/' + illust.id,
                commentCount: illust.total_comments || 0,
                likesCount: illust.total_bookmarks || 0,
                isLiked: isFollowed,
                uploadTime: illust.create_date,
                maxPage: illust.page_count || 1
            })
        },

        loadEp: async (comicId, epId) => {
            let illustId = comicId.startsWith('user_') ? parseInt(epId) : parseInt(comicId)
            if (!illustId) throw 'Invalid illust ID'
            let json = await this.apiGet(
                this.apiBase + '/v1/illust/detail?illust_id=' + illustId)
            let illust = json.illust
            if (!illust) throw 'Illust not found'
            let images = []
            if (illust.page_count <= 1 || !illust.meta_pages || illust.meta_pages.length === 0) {
                let url = illust.meta_single_page?.original_image_url
                    || illust.image_urls.large
                images.push(url)
            } else {
                for (let i = 0; i < illust.meta_pages.length; i++) {
                    let page = illust.meta_pages[i]
                    images.push(page.image_urls.original || page.image_urls.large)
                }
            }
            return { images: images }
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                headers: {
                    'Referer': 'https://app-api.pixiv.net/',
                    'User-Agent': Pixiv.USER_AGENT
                }
            }
        },

        onThumbnailLoad: (url) => {
            return {
                headers: {
                    'Referer': 'https://app-api.pixiv.net/',
                    'User-Agent': Pixiv.USER_AGENT
                }
            }
        },

        loadThumbnails: (comicIds) => { return {} },   // 占位

        likeComic: async (id, isLike) => {
            let artistId = this.loadData('_artist_of_' + id)
            if (!artistId && id.startsWith('user_')) {
                artistId = id.substring(5)
            }
            if (!artistId) return
            let isFollowed = false
            try {
                let followJson = await this.apiGet(
                    this.apiBase + '/v1/user/follow/detail?user_id=' + artistId)
                let fd = followJson.follow_detail
                if (fd) isFollowed = !!fd.is_followed
            } catch (e) {}
            if (isFollowed) {
                let body = 'user_id=' + artistId
                await this.apiPost(this.apiBase + '/v1/user/follow/delete', body)
            } else {
                let body = 'user_id=' + artistId + '&restrict=private'
                await this.apiPost(this.apiBase + '/v1/user/follow/add', body)
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
                if (replyTo) {
                    url = this.apiBase + '/v2/illust/comment/replies?comment_id=' + replyTo
                } else {
                    url = this.apiBase + '/v3/illust/comments?illust_id=' + comicId
                }
            }
            let json = await this.apiGet(url)
            let comments = (json.comments || []).map(function(c) {
                return new Comment({
                    userName: c.user.name,
                    avatar: c.user.profile_image_urls.medium,
                    content: c.comment,
                    time: c.date,
                    replyCount: c.has_replies ? 1 : null,
                    id: c.id.toString(),
                })
            })
            if (json.next_url) this.saveData(cursorKey, json.next_url)
            else this.deleteData(cursorKey)
            return { comments: comments, maxPage: json.next_url ? page + 1 : page }
        },

        sendComment: async (comicId, subId, content, replyTo) => {
            let body = 'illust_id=' + encodeURIComponent(comicId) +
                '&comment=' + encodeURIComponent(content)
            if (replyTo) {
                body += '&parent_comment_id=' + encodeURIComponent(replyTo)
            }
            await this.apiPost(this.apiBase + '/v1/illust/comment/add', body)
            return 'ok'
        },

        likeComment: async (comicId, subId, commentId, isLike) => { },
        voteComment: async (id, subId, commentId, isUp, isCancel) => { },

        onClickTag: (namespace, tag) => {
            if (namespace === 'Artist') {
                let idx = tag.lastIndexOf('|')
                if (idx !== -1) {
                    return {
                        page: 'category',
                        attributes: {
                            category: 'user_illusts',
                            param: tag.substring(idx + 1).trim()
                        }
                    }
                }
            }
            if (tag && tag.startsWith('artist:')) {
                return {
                    page: 'category',
                    attributes: {
                        category: 'user_illusts',
                        param: tag.substring(7)
                    }
                }
            }
            let searchTag = tag
            let bracketIdx = tag.lastIndexOf(' [')
            if (bracketIdx !== -1 && tag.endsWith(']')) {
                searchTag = tag.substring(0, bracketIdx)
            }
            this._pendingTagSearch = true
            return {
                page: 'search',
                attributes: {
                    keyword: searchTag,
                },
            }
        },

        idMatch: "^\\d+$",
    }

    // ============================================================
    //  ACCOUNT — url 为普通属性（IIFE），不是 getter
    // ============================================================

    account = {

        loginWithWebview: {
            url: (function() {
                let chars = Pixiv.PKCE_CHARS
                let verifier = ''
                for (let i = 0; i < 128; i++) {
                    verifier += chars[randomInt(0, chars.length - 1)]
                }
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
            })(),

            checkStatus: (url, title) => {
                console.log('[Pixiv] checkStatus url=' + url)
                let codeIdx = url.indexOf('code=')
                if (url.indexOf('/auth/pixiv/callback') !== -1 && codeIdx !== -1) {
                    console.log('[Pixiv] checkStatus → PKCE callback, capturing code')
                    let start = codeIdx + 5
                    let end = url.indexOf('&', start)
                    if (end === -1) end = url.length
                    let code = url.substring(start, end)
                    if (code) {
                        this.saveData('_pkce_code', decodeURIComponent(code))
                        console.log('[Pixiv] PKCE code saved')
                        return true
                    }
                }
                return false
            },

            onLoginSuccess: () => {
                console.log('[Pixiv] onLoginSuccess triggered')
                let code = this.loadData('_pkce_code')
                if (!code) {
                    console.log('[Pixiv] WARN: no PKCE code in onLoginSuccess')
                    return
                }
                console.log('[Pixiv] Exchanging PKCE code...')
                this._exchangeAuthCode().then(function(ok) {
                    console.log('[Pixiv] _exchangeAuthCode result=' + ok)
                }.bind(this)).catch(function(e) {
                    console.log('[Pixiv] _exchangeAuthCode error=' + e)
                })
            }
        },

        login: async (account, pwd) => {
            console.log('[Pixiv] login() called, account=' + !!account)
            let code = this.loadData('_pkce_code')
            if (code) {
                console.log('[Pixiv] login: path 1 - PKCE code exchange')
                let ok = await this._exchangeAuthCode()
                if (ok) return 'ok'
                throw 'Login failed: unable to exchange authorization code'
            }
            let pending = this.loadData('pending_refresh_token')
            if (pending) {
                console.log('[Pixiv] login: path 2 - pending refresh_token exchange')
                let ok = await this._exchangeWebviewToken()
                if (ok) return 'ok'
                throw 'Login failed: unable to exchange webview token'
            }
            if (this.loadData('refresh_token')) {
                console.log('[Pixiv] login: path 3 - refresh existing token')
                try {
                    await this.refreshToken()
                    return 'ok'
                } catch (e) {
                    throw 'Login failed: unable to refresh token'
                }
            }
            let manual = (account || '').trim()
            if (manual) {
                console.log('[Pixiv] login: path 4 - manual refresh_token')
                this.saveData('refresh_token', manual)
                try {
                    await this.refreshToken()
                    return 'ok'
                } catch (e) {
                    this.deleteData('refresh_token')
                    throw 'Login failed: invalid refresh token'
                }
            }
            console.log('[Pixiv] login: FAILED - no token available')
            throw 'Please login via WebView first, or provide a valid refresh_token'
        },

        logout: () => {
            UI.showDialog("确认退出", "确定要退出 Pixiv 账号吗？", [
                {
                    text: "确定",
                    style: "danger",
                    callback: () => {
                        try {
                            this.deleteData('access_token')
                            this.deleteData('refresh_token')
                            this.deleteData('pending_refresh_token')
                            this.deleteData('_pkce_code')
                            this.deleteData('user_id')
                            this.deleteData('user_name')
                            this.deleteData('user_account')
                            this.deleteData('account')
                            Network.deleteCookies('https://www.pixiv.net')
                            Network.deleteCookies('https://accounts.pixiv.net')
                            UI.showMessage("已退出登录")
                        } catch (e) {
                            console.log('[Pixiv] logout error:', e)
                            UI.showMessage("退出时发生错误，请重试")
                        }
                    }
                },
                {
                    text: "取消",
                    callback: () => {}
                }
            ])
        },

        registerWebsite: 'https://www.pixiv.net/signup/'
    }

    // ============================================================
    //  SETTINGS — 添加使用帮助（模仿 Komiic 风格）
    // ============================================================

    settings = {
        help: {
            title: "使用帮助",
            type: "callback",
            buttonText: "查看帮助",
            callback: () => {
                UI.showDialog("Pixiv 使用帮助",
`• 登录方式：支持通过 WebView 登录（自动完成 PKCE 流程）或手动输入 Refresh Token（在设置页「主账号快捷登录」处使用）。
• 收藏夹：使用 Pixiv 的收藏标签作为文件夹，您可以在收藏作品时添加任意标签，系统自动归类：
  - 「默认」文件夹存放未加标签的收藏。
  - 自建标签会出现在列表，点击可筛选该标签下的作品。
• 搜索与排行榜：支持按标签、标题、用户搜索，排行榜提供日、周、月及多种细分榜单（包括 AI 分类）。
• 探索页：包含「关注」「推荐画师」「已关注画师」三个入口，方便快速浏览。
• API 地址：默认使用官方 API，若需更换镜像或自定义节点，可在下方「API 地址」中修改（需为 https:// 开头）。
• Refresh Token 等凭证仅存储在本地，不会上传或泄露，请妥善保管。`, [{text: "知道了", callback: () => {}}])
            }
        },
        apiHost: {
            title: "API 地址",
            type: "input",
            default: "https://app-api.pixiv.net",
            validator: "^https?://.+"
        },
        login_main_with_token: {
            title: "主账号快捷登录",
            type: "callback",
            buttonText: "使用 Refresh Token 登录",
            callback: async () => {
                let token = await UI.showInputDialog("输入 Refresh Token", (v) => v && v.trim() ? null : "不能为空")
                if (!token) return
                token = token.trim()
                try {
                    await this.account.login(token, "")
                    UI.showMessage("主账号登录成功")
                } catch (e) {
                    UI.showDialog("登录失败", String(e), [{text: "确定", callback: () => {}}])
                }
                return
            }
        }
    }

    // ============================================================
    //  TRANSLATION (保留常用项)
    // ============================================================

    translation = {
        'zh_CN': {
            '使用帮助': '使用帮助',
            '查看帮助': '查看帮助',
            'API Host': 'API 地址',
            'Following': '关注',
            'sort': '排序',
            'target': '搜索目标',
            'ai': 'AI',
            'Newest': '最新',
            'Oldest': '最旧',
            'Popular': '最热',
            'Tag Match': '标签匹配',
            'Exact Tag': '精确标签',
            'Title & Caption': '标题和简介',
            'All': '全部',
            'No AI': '不含AI',
            'AI Only': '仅AI',
            'Users': '用户',
            'Recommended Artists': '推荐画师',
            'Followed Artists': '已关注画师',
            'Daily': '日榜',
            'Weekly': '周榜',
            'Monthly': '月榜',
            'Daily (Male)': '男性向',
            'Daily (Female)': '女性向',
            'Original': '原创',
            'Rookie': '新人',
            'Manga': '漫画',
            'R18': 'R18',
            'AI': 'AI',
            'R18 AI': 'R18 AI',
            '主账号快捷登录': '主账号快捷登录',
            '使用 Refresh Token 登录': '使用 Refresh Token 登录',
        },
        'zh_TW': {
            '使用帮助': '使用說明',
            '查看帮助': '查看說明',
            'API Host': 'API 位址',
            '主账号快捷登录': '主帳號快捷登入',
            '使用 Refresh Token 登录': '使用 Refresh Token 登入',
        },
        'en': {
            '使用帮助': 'Help',
            '查看帮助': 'View Help',
            'API Host': 'API Host',
            '主账号快捷登录': 'Quick Main Account Login',
            '使用 Refresh Token 登录': 'Login with Refresh Token',
        }
    }
}
