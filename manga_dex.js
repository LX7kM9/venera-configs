/** @type {import('./_venera_.js')} */
class MangaDex extends ComicSource {
    name = "MangaDex"
    key = "manga_dex"
    version = "1.9.9" // 修复图片请求被 WAF 识别为爬虫拦截的问题
    minAppVersion = "1.4.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/manga_dex.js"

    comicsPerPage = 20

    // 白名单 API UA，绕过 API 和 图片 的风控
    _apiUA = 'Mihon/0.16.1 (Linux; Android 13)'

    _cookiesPromise = null
    _preFetchCookies = () => {
        if (!this._cookiesPromise) {
            this._cookiesPromise = Network.get('https://api.mangadex.org/ping', {
                'User-Agent': this._apiUA
            }).catch(() => {})
        }
        return this._cookiesPromise
    }

    get apiHeaders() {
        let headers = {
            'Accept': 'application/json',
            'Origin': 'https://mangadex.org',
            'Referer': 'https://mangadex.org/',
            'User-Agent': this._apiUA
        }
        let auth = this._auth
        if (auth && auth.accessToken && Date.now() < auth.expiresAt) {
            headers['Authorization'] = `Bearer ${auth.accessToken}`
        }
        return headers
    }

    get forumHeaders() {
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://mangadex.org/',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-site',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
    }

    authBaseUrl = 'https://auth.mangadex.org/realms/mangadex/protocol/openid-connect'
    oauthClientId = 'mangadex-frontend-stable'
    oauthRedirectUri = 'https://mangadex.org/auth/login'
    followingFolderId = '$following'
    statusFolderPrefix = '$status:'
    artChapterId = '$art'
    readingStatusNames = {
        reading: 'Reading',
        plan_to_read: 'Plan To Read',
        completed: 'Completed',
        on_hold: 'On Hold',
        re_reading: 'Re-reading',
        dropped: 'Dropped',
    }

    chapterLanguageNames = {
        en: 'English', ja: 'Japanese', ko: 'Korean', zh: 'Chinese (Simplified)',
        'zh-hk': 'Chinese (Traditional)', vi: 'Vietnamese', es: 'Spanish', 'es-la': 'Spanish (LATAM)',
        fr: 'French', 'pt-br': 'Portuguese (Brazil)', pt: 'Portuguese', ru: 'Russian',
        id: 'Indonesian', th: 'Thai', ar: 'Arabic', de: 'German', it: 'Italian',
        pl: 'Polish', tr: 'Turkish', uk: 'Ukrainian', nl: 'Dutch', fa: 'Persian',
        hu: 'Hungarian', ro: 'Romanian', cs: 'Czech', bg: 'Bulgarian', fi: 'Finnish',
        he: 'Hebrew', hi: 'Hindi', ms: 'Malay', tl: 'Filipino', ca: 'Catalan',
        sv: 'Swedish', no: 'Norwegian', da: 'Danish', el: 'Greek', mn: 'Mongolian',
    }

    get tokenUrl() {
        return `${this.authBaseUrl}/token`
    }

    async _loadComicsByIds(allIds, page) {
        let limit = this.comicsPerPage
        if (allIds.length === 0) return { comics: [], maxPage: 1 }

        let order = this.loadSetting('favoritesOrder') || 'updated'
        let orderParam = order === 'title' ? 'order[title]=asc' : 'order[latestUploadedChapter]=desc'

        let all = []
        for (let i = 0; i < allIds.length; i += 100) {
            let chunk = allIds.slice(i, i + 100)
            let query = chunk.map((id) => `ids[]=${id}`).join('&')
            let res = await Network.get(
                `https://api.mangadex.org/manga?limit=100&${query}&${orderParam}&` +
                `includes[]=cover_art&includes[]=author&includes[]=artist`, this.apiHeaders
            )
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            let data = JSON.parse(res.body)
            for (let c of (data['data'] || [])) all.push(this.api.parseComic(c))
        }

        if (order === 'title') all.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        let maxPage = Math.max(1, Math.ceil(all.length / limit))
        return { comics: all.slice((page - 1) * limit, page * limit), maxPage }
    }

    _cleanCommentHtml(html) {
        if (!html) return ''
        html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
        const quoteRe = /<blockquote\b([^>]*)>((?:(?!<blockquote)[\s\S])*?)<\/blockquote>/i
        let guard = 0
        while (guard++ < 30 && quoteRe.test(html)) {
            html = html.replace(quoteRe, (m, attrs, inner) => {
                let am = /data-quote="([^"]*)"/i.exec(attrs)
                let author = am ? am[1] : ''
                let body = inner.replace(/<div[^>]*bbCodeBlock-title[^>]*>[\s\S]*?<\/div>/gi, '')
                    .replace(/<div[^>]*js-expandLink[^>]*>[\s\S]*?<\/div>/gi, '')
                    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
                return `<br><i>❝ ${author ? `<b>${author}:</b> ` : ''}${body} ❞</i><br><br>`
            })
        }
        const directUrl = (raw) => {
            if (!raw) return null
            let m = /[?&]image=([^&"]+)/.exec(raw)
            if (m) { try { return decodeURIComponent(m[1]) } catch (e) {} }
            if (raw.startsWith('//')) return 'https:' + raw
            if (raw.startsWith('/')) return 'https://forums.mangadex.org' + raw
            return raw
        }
        const imgOrLink = (url) => {
            if (!url || !/^https?:\/\//i.test(url)) return ''
            if (/^https?:\/\/forums\.mangadex\.org\//i.test(url)) return ''
            if (/^https?:\/\/(?:[a-z0-9-]+\.)?mangadex\.org\//i.test(url)) {
                let mm = /og-image\/manga\/([0-9a-f-]+)/i.exec(url)
                let href = mm ? `https://mangadex.org/title/${mm[1]}` : url
                return `<a href="${href}">${href}</a>`
            }
            return `<img src="${url}">`
        }
        html = html.replace(/<div[^>]*\bbbImageWrapper\b[^>]*>[\s\S]*?<\/div>/gi, (block) => imgOrLink(directUrl(/data-src="([^"]*)"/.exec(block)?.[1])))
        html = html.replace(/<img\b[^>]*>/gi, (tag) => {
            if (/class="[^"]*\bsmilie\b[^"]*"/i.test(tag) || /class="[^"]*\bemoji\b[^"]*"/i.test(tag)) {
                let cm = /data-shortname="([^"]*)"/i.exec(tag) || /\salt="([^"]*)"/i.exec(tag) || /\stitle="([^"]*)"/i.exec(tag)
                return cm ? `${cm[1].trim()} ` : ''
            }
            return imgOrLink(directUrl(/data-src="([^"]*)"/.exec(tag)?.[1] || /\ssrc="([^"]*)"/.exec(tag)?.[1]))
        })
        const allowed = { a: 1, b: 1, i: 1, u: 1, s: 1, br: 1, span: 1, img: 1 }
        html = html.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, name) => allowed[name.toLowerCase()] ? tag : '')
        return html.replace(/\s+/g, ' ').replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br><br>').replace(/^(?:\s|<br\s*\/?>)+/i, '').replace(/(?:\s|<br\s*\/?>)+$/i, '').trim()
    }

    async _loadStatusMangaIds(status) {
        let res = await Network.get(`https://api.mangadex.org/manga/status?status=${status}`, this.apiHeaders)
        if (res.status === 401) throw this.loginRequiredMessage
        if (res.status !== 200) throw `HTTP ${res.status}`
        return Object.keys(JSON.parse(res.body)['statuses'] || {})
    }

    get _tokenPostHeaders() {
        return {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://mangadex.org',
            'Referer': 'https://mangadex.org/',
            'User-Agent': this._apiUA
        }
    }

    get _auth() { return this.loadData('auth') || null }
    get isLogged() { return !!this._auth }
    _saveAuth(data) {
        this.saveData('auth', {
            accessToken: data['access_token'],
            refreshToken: data['refresh_token'],
            expiresAt: Date.now() + ((data['expires_in'] || 900) * 1000),
        })
    }

    _randomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
        let result = ''
        for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)]
        return result
    }

    _base64url(uint8) {
        const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
        let result = ''
        for (let i = 0; i < uint8.length; i += 3) {
            let b0 = uint8[i]
            let b1 = i + 1 < uint8.length ? uint8[i + 1] : 0
            let b2 = i + 2 < uint8.length ? uint8[i + 2] : 0
            result += table[b0 >> 2]
            result += table[((b0 & 3) << 4) | (b1 >> 4)]
            if (i + 1 < uint8.length) result += table[((b1 & 15) << 2) | (b2 >> 6)]
            if (i + 2 < uint8.length) result += table[b2 & 63]
        }
        return result
    }

    _pkceVerifier = null
    _oauthCode = null

    _getPkceVerifier() {
        if (!this._pkceVerifier) this._pkceVerifier = this._randomString(64)
        return this._pkceVerifier
    }

    _getQueryParam(url, name) {
        let match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url)
        return match ? decodeURIComponent(match[1]) : null
    }

    _buildAuthUrl() {
        this._oauthCode = null
        let verifier = this._getPkceVerifier()
        let hashBytes = new Uint8Array(Convert.sha256(Convert.encodeUtf8(verifier)))
        let challenge = this._base64url(hashBytes)
        let state = this._randomString(32)
        let params = [
            `client_id=${this.oauthClientId}`,
            `redirect_uri=${encodeURIComponent(this.oauthRedirectUri)}`,
            `response_type=code`,
            `scope=${encodeURIComponent('openid email groups profiles roles')}`,
            `state=${state}`,
            `code_challenge=${challenge}`,
            `code_challenge_method=S256`,
        ]
        return `${this.authBaseUrl}/auth?${params.join('&')}`
    }

    loginRequiredMessage = 'Not logged in to MangaDex. Please log in first.'

    async _ensureToken() {
        let auth = this._auth
        if (!auth) throw this.loginRequiredMessage
        if (Date.now() < (auth.expiresAt - 60000)) return
        if (!auth.refreshToken) { this.deleteData('auth'); throw this.loginRequiredMessage }

        let body = `grant_type=refresh_token&client_id=${this.oauthClientId}&refresh_token=${encodeURIComponent(auth.refreshToken)}`
        let res
        try { res = await Network.post(this.tokenUrl, this._tokenPostHeaders, body) } catch (e) { throw 'MangaDex is unreachable right now. Please try again.' }

        if (res.status === 200) { this._saveAuth(JSON.parse(res.body)); return }
        if (res.status === 400 || res.status === 401) { this.deleteData('auth'); throw this.loginRequiredMessage }
        throw `MangaDex token refresh failed (HTTP ${res.status}). Please try again.`
    }

    api = {
        parseComic: (data) => {
            let id = data['id']
            let titles = {}
            let mainTitles = data['attributes']['title']
            for (let lang of Object.keys(mainTitles)) titles[lang] = mainTitles[lang]
            for (let at of data['attributes']['altTitles']) {
                for (let lang of Object.keys(at)) if (titles[lang] === undefined) titles[lang] = at[lang]
            }
            let locale = APP.locale
            let mainTitle = ''
            let firstTitle = titles[Object.keys(titles)[0]]
            if (locale.startsWith('en')) mainTitle = titles['en'] || titles['ja'] || firstTitle
            else if (locale.startsWith('zh_CN')) mainTitle = titles['zh'] || titles['zh-hk'] || titles['zh-tw'] || titles['ja'] || firstTitle
            else if (locale.startsWith('zh_TW')) mainTitle = titles['zh-hk'] || titles['zh-tw'] || titles['zh'] || titles['ja'] || firstTitle

            let tags = [], genres = [], themes = [], contentWarnings = [], formats = []
            for (let tag of data['attributes']['tags']) {
                let name = tag['attributes']['name']['en']
                if (!name) continue
                tags.push(name)
                switch (tag['attributes']['group']) {
                    case 'genre': genres.push(name); break
                    case 'theme': themes.push(name); break
                    case 'content': contentWarnings.push(name); break
                    case 'format': formats.push(name); break
                    default: themes.push(name)
                }
            }
            const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
            let demographic = capitalize(data['attributes']['publicationDemographic'] || '')
            let contentRating = capitalize(data['attributes']['contentRating'] || '')
            
            // 直接使用官方独立图片 CDN 域名，不经过第三方代理
            let cover = data['relationships'].find((e) => e['type'] === 'cover_art')?.['attributes']['fileName']
            if (cover) {
                cover = `https://uploads.mangadex.org/covers/${id}/${cover}.256.jpg`
            } else {
                cover = ""
            }
            
            let descriptions = data['attributes']['description'] || {}
            let description = descriptions['en'] || descriptions[Object.keys(descriptions)[0]] || ''
            let authors = [], artists = []
            for (let rel of data['relationships']) {
                if (rel['type'] === 'author') {
                    authors.push(rel['attributes']['name'])
                    this.authors[rel['attributes']['name']] = rel['id']
                } else if (rel['type'] === 'artist') {
                    artists.push(rel['attributes']['name'])
                    this.artists[rel['attributes']['name']] = rel['id']
                }
            }
            return {
                id: id, title: mainTitle, subtitle: authors.at(0), titles: titles, cover: cover,
                tags: tags, genres: genres, themes: themes, contentWarnings: contentWarnings, formats: formats,
                demographic: demographic, contentRating: contentRating, description: description,
                createTime: data['attributes']['createdAt'], updateTime: data['attributes']['updatedAt'],
                status: data['attributes']['status'], authors: authors, artists: artists,
            }
        },
        getPopular: async (page) => {
            await this._preFetchCookies()
            let time = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            let popularUrl = `https://api.mangadex.org/manga?includes[]=cover_art&includes[]=artist&includes[]=author&order[followedCount]=desc&hasAvailableChapters=true&createdAtSince=${time.toISOString().substring(0, 19)}&limit=${this.comicsPerPage}`
            if (page && page > 1) popularUrl += `&offset=${(page - 1) * this.comicsPerPage}`
            let res = await Network.get(popularUrl, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            return { comics: data['data'].map(c => this.api.parseComic(c)), maxPage: Math.ceil(data['total'] / this.comicsPerPage) }
        },
        getRecent: async (page) => {
            await this._preFetchCookies()
            let recentUrl = `https://api.mangadex.org/manga?includes[]=cover_art&includes[]=artist&includes[]=author&order[createdAt]=desc&hasAvailableChapters=true&limit=${this.comicsPerPage}`
            if (page && page > 1) recentUrl += `&offset=${(page - 1) * this.comicsPerPage}`
            let res = await Network.get(recentUrl, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            return { comics: data['data'].map(c => this.api.parseComic(c)), maxPage: Math.ceil(data['total'] / this.comicsPerPage) }
        },
        getUpdated: async (page) => {
            await this._preFetchCookies()
            let updatedUrl = `https://api.mangadex.org/manga?includes[]=cover_art&includes[]=artist&includes[]=author&order[latestUploadedChapter]=desc&contentRating[]=safe&contentRating[]=suggestive&hasAvailableChapters=true&limit=${this.comicsPerPage}`
            if (page && page > 1) updatedUrl += `&offset=${(page - 1) * this.comicsPerPage}`
            let res = await Network.get(updatedUrl, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            return { comics: data['data'].map(c => this.api.parseComic(c)), maxPage: Math.ceil(data['total'] / this.comicsPerPage) }
        }
    }

    account = ((self) => ({
        loginWithWebview: {
            get url() { return self._buildAuthUrl() },
            checkStatus: (url, title) => {
                if (url.startsWith(self.oauthRedirectUri) && url.includes('code=')) {
                    if (!self._oauthCode) self._oauthCode = self._getQueryParam(url, 'code')
                    return !!self._oauthCode
                }
                return false
            },
            onLoginSuccess: async () => {
                let code = self._oauthCode, verifier = self._getPkceVerifier()
                if (!code) throw 'Login failed: no authorization code captured'
                let body = `grant_type=authorization_code&client_id=${self.oauthClientId}&code=${encodeURIComponent(code)}&code_verifier=${encodeURIComponent(verifier)}&redirect_uri=${encodeURIComponent(self.oauthRedirectUri)}`
                if (self._auth && self._auth.accessToken && Date.now() < self._auth.expiresAt) return
                await self._preFetchCookies()
                let res = await Network.post(self.tokenUrl, self._tokenPostHeaders, body)
                if (res.status !== 200) {
                    if (self._auth && self._auth.accessToken && Date.now() < self._auth.expiresAt) return
                    throw `Login failed: HTTP ${res.status} ${res.body}`
                }
                self._saveAuth(JSON.parse(res.body))
                self._oauthCode = null
            },
        },
        logout: () => {
            self.deleteData('auth')
            self._oauthCode = null
            self._pkceVerifier = null
        },
        registerWebsite: 'https://auth.mangadex.org/realms/mangadex/login-actions/registration?client_id=mangadex-frontend-stable',
    }))(this)

    favorites = {
        multiFolder: true,
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            await this._ensureToken()
            if (folderId.startsWith(this.statusFolderPrefix)) {
                let status = isAdding ? folderId.slice(this.statusFolderPrefix.length) : null
                let res = await Network.post(`https://api.mangadex.org/manga/${comicId}/status`, { ...this.apiHeaders, 'Content-Type': 'application/json' }, JSON.stringify({ status: status }))
                if (res.status === 401) throw this.loginRequiredMessage
                if (res.status !== 200) throw `HTTP ${res.status}`
                return 'ok'
            }
            let url = folderId === this.followingFolderId ? `https://api.mangadex.org/manga/${comicId}/follow` : `https://api.mangadex.org/manga/${comicId}/list/${folderId}`
            let res
            if (isAdding) res = await Network.post(url, this.apiHeaders, '')
            else if (typeof Network.delete === 'function') res = await Network.delete(url, this.apiHeaders, null)
            else res = await Network.request(url, 'DELETE', this.apiHeaders, null)
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            return 'ok'
        },
        loadFolders: async (comicId) => {
            await this._ensureToken()
            let folders = {}
            for (let status of Object.keys(this.readingStatusNames)) folders[this.statusFolderPrefix + status] = this.readingStatusNames[status]
            let listsRes = await Network.get(`https://api.mangadex.org/user/list?limit=100`, this.apiHeaders)
            if (listsRes.status === 401) throw this.loginRequiredMessage
            if (listsRes.status !== 200) throw `HTTP ${listsRes.status}`
            let listsData = JSON.parse(listsRes.body)
            let lists = listsData['data'] || []
            for (let list of lists) folders[list['id']] = list['attributes']['name'] || 'Unnamed list'

            let favorited = []
            if (comicId) {
                let statusRes = await Network.get(`https://api.mangadex.org/manga/${comicId}/status`, this.apiHeaders)
                if (statusRes.status === 200) {
                    let status = JSON.parse(statusRes.body)['status']
                    if (status) favorited.push(this.statusFolderPrefix + status)
                }
                for (let list of lists) {
                    if ((list['relationships'] || []).some((r) => r['type'] === 'manga' && r['id'] === comicId)) favorited.push(list['id'])
                }
            }
            return { folders: folders, favorited: favorited }
        },
        addFolder: async (name) => {
            await this._ensureToken()
            let res = await Network.post(`https://api.mangadex.org/list`, { ...this.apiHeaders, 'Content-Type': 'application/json' }, JSON.stringify({ name: name, visibility: 'private' }))
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            return 'ok'
        },
        deleteFolder: async (folderId) => {
            if (folderId.startsWith('$')) throw 'This is a built-in MangaDex folder and cannot be deleted.'
            await this._ensureToken()
            let url = `https://api.mangadex.org/list/${folderId}`
            let res = typeof Network.delete === 'function' ? await Network.delete(url, this.apiHeaders, null) : await Network.request(url, 'DELETE', this.apiHeaders, null)
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            return 'ok'
        },
        loadComics: async (page, folder) => {
            await this._ensureToken()
            let limit = this.comicsPerPage
            if (!folder || folder === this.followingFolderId) {
                let offset = (page - 1) * limit
                let url = `https://api.mangadex.org/user/follows/manga?limit=${limit}&offset=${offset}&includes[]=cover_art&includes[]=author&includes[]=artist`
                let res = await Network.get(url, this.apiHeaders)
                if (res.status === 401) throw this.loginRequiredMessage
                if (res.status !== 200) throw `HTTP ${res.status}`
                let data = JSON.parse(res.body)
                return { comics: (data['data'] || []).map(c => this.api.parseComic(c)), maxPage: Math.max(1, Math.ceil((data['total'] || 0) / limit)) }
            }
            if (folder.startsWith(this.statusFolderPrefix)) {
                let status = folder.slice(this.statusFolderPrefix.length)
                let ids = await this._loadStatusMangaIds(status)
                return this._loadComicsByIds(ids, page)
            }
            let listRes = await Network.get(`https://api.mangadex.org/list/${folder}`, this.apiHeaders)
            if (listRes.status === 401) throw this.loginRequiredMessage
            if (listRes.status !== 200) throw `HTTP ${listRes.status}`
            let mangaIds = (JSON.parse(listRes.body)['data']['relationships'] || []).filter((r) => r['type'] === 'manga').map((r) => r['id'])
            return this._loadComicsByIds(mangaIds, page)
        },
        singleFolderForSingleComic: false,
    }

    explore = [{
        title: "Manga Dex",
        type: "multiPartPage",
        load: async (page) => {
            let res = await Promise.all([this.api.getPopular(page), this.api.getRecent(page), this.api.getUpdated(page)])
            let titles = ["Popular", "Recent", "Updated"]
            let viewMore = ["popular", "recent", "updated"].map(o => ({ page: "search", attributes: { options: [o, "any", "any"] } }))
            return res.map((r, i) => ({ title: titles[i], comics: r.comics, viewMore: viewMore[i] }))
        },
    }]

    category = {
        title: "MangaDex",
        parts: [{
            name: "Tags", type: "dynamic",
            loader: () => Object.keys(this.tags).map(tag => ({ label: tag, target: { action: "category", keyword: tag, param: this.tags[tag] } }))
        }],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options = [], page = 1) => {
            if (!param) throw new Error("No tag id provided for category comics")
            const parseOption = (opt, fb) => (opt === undefined || opt === null || opt === "") ? fb : (opt.split("-")[0] || fb)
            const sortOption = parseOption(options[0], "popular"), ratingOption = parseOption(options[1], "any"), statusOption = parseOption(options[2], "any")

            let params = ["includes[]=cover_art", "includes[]=artist", "includes[]=author", "hasAvailableChapters=true", `limit=${this.comicsPerPage}`, `includedTags[]=${encodeURIComponent(param)}`]
            if (page && page > 1) params.push(`offset=${(page - 1) * this.comicsPerPage}`)

            if (sortOption !== "any") {
                const orderKey = { popular: "followedCount", follows: "followedCount", recent: "createdAt", updated: "latestUploadedChapter", rating: "rating" }[sortOption]
                if (orderKey) params.push(`order[${orderKey}]=desc`)
            }
            let ratingList = ratingOption === "any" ? ["safe", "suggestive", "erotica"] : [ratingOption]
            for (let rating of ratingList) params.push(`contentRating[]=${encodeURIComponent(rating)}`)
            if (statusOption !== "any") params.push(`status[]=${encodeURIComponent(statusOption)}`)

            await this._preFetchCookies()
            let res = await Network.get(`https://api.mangadex.org/manga?${params.join("&")}`, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body), total = data['total'] || 0
            let comics = (data['data'] || []).map(c => this.api.parseComic(c))
            return { comics: comics, maxPage: total ? Math.ceil(total / this.comicsPerPage) : (comics.length < this.comicsPerPage ? page : page + 1) }
        },
        optionList: [
            { options: ["any-Any", "popular-Popular", "recent-Recent", "updated-Updated", "rating-Rating", "follows-Follows"] },
            { options: ["any-Any", "safe-Safe", "suggestive-Suggestive", "erotica-Erotica"] },
            { options: ["any-Any", "ongoing-Ongoing", "completed-Completed", "hiatus-Hiatus", "cancelled-Cancelled"] }
        ]
    }

    search = {
        load: async (keyword, options, page) => {
            let order = options[0] !== "any" ? { "popular": `order[followedCount]=desc&`, "recent": `order[createdAt]=desc&`, "updated": `order[latestUploadedChapter]=desc&`, "rating": `order[rating]=desc&`, "follows": `order[followedCount]=desc&` }[options[0]] : ""
            let contentRating = options[1] !== "any" ? `contentRating[]=${options[1]}&` : ""
            let status = options[2] !== "any" ? `status[]=${options[2]}&` : ""
            let url = `https://api.mangadex.org/manga?includes[]=cover_art&includes[]=artist&includes[]=author&${order}${contentRating}${status}hasAvailableChapters=true&limit=${this.comicsPerPage}`
            if (page && page > 1) url += `&offset=${(page - 1) * this.comicsPerPage}`

            if (keyword) {
                let splits = keyword.split(" "), reformated = []
                for (let s of splits) {
                    if (s === "") continue
                    if (s.startsWith('tag:')) {
                        let tag = s.substring(4).replaceAll('_', ' '), id = this.tags[tag]
                        if (id !== undefined) url += `&includedTags[]=${id}`; else reformated.push(s)
                    } else if (s.startsWith('author:')) {
                        let author = s.substring(7).replaceAll('_', ' '), id = this.authors[author]
                        if (id !== undefined) url += `&authorOrArtist=${id}`; else reformated.push(s)
                    } else if (s.startsWith('artist:')) {
                        let artist = s.substring(7).replaceAll('_', ' '), id = this.artists[artist]
                        if (id !== undefined) url += `&authorOrArtist=${id}`; else reformated.push(s)
                    } else reformated.push(s)
                }
                keyword = reformated.join(" ")
                if (keyword !== "") url += `&title=${keyword}`
            }
            await this._preFetchCookies()
            let res = await Network.get(url, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            return { comics: data['data'].map(c => this.api.parseComic(c)), maxPage: Math.ceil(data['total'] / this.comicsPerPage) }
        },
        optionList: [
            { label: "Sort By", type: "select", options: ["any-Any", "popular-Popular", "recent-Recent", "updated-Updated", "rating-Rating", "follows-Follows"] },
            { label: "Content Rating", type: "select", options: ["any-Any", "safe-Safe", "suggestive-Suggestive", "erotica-Erotica"] },
            { label: "Status", type: "select", options: ["any-Any", "ongoing-Ongoing", "completed-Completed", "hiatus-Hiatus", "cancelled-Cancelled"] }
        ],
        enableTagsSuggestions: false,
    }

    comic = {
        getComic: async (id) => {
            await this._preFetchCookies()
            let res = await Network.get(`https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=artist&includes[]=author`, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            return this.api.parseComic(JSON.parse(res.body)['data'])
        },
        getChapters: async (id) => {
            await this._preFetchCookies()
            let all = [], offset = 0
            while (true) {
                let url = `https://api.mangadex.org/manga/${id}/feed?limit=500&offset=${offset}&order[volume]=asc&order[chapter]=asc&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic`
                let res = await Network.get(url, this.apiHeaders)
                if (res.status !== 200) throw new Error("HTTP " + res.status)
                let data = JSON.parse(res.body), batch = data['data'] || []
                all.push(...batch); offset += 500
                if (batch.length < 500 || offset >= (data['total'] || 0)) break
            }
            let byLang = {}
            for (let chapter of all) {
                let attrs = chapter['attributes']
                if (attrs['externalUrl']) continue
                let lang = attrs['translatedLanguage'] || 'unknown', num = attrs['chapter']
                let label = num ? `Ch.${num}` : 'Oneshot'
                if (attrs['volume']) label = `Vol.${attrs['volume']} ${label}`
                if (attrs['title']) label += `: ${attrs['title']}`
                let group = (chapter['relationships'] || []).find((r) => r['type'] === 'scanlation_group')
                if (group && group['attributes']) label += ` · ${group['attributes']['name']}`
                if (!byLang[lang]) byLang[lang] = new Map()
                byLang[lang].set(chapter['id'], label)
            }
            let langs = Object.keys(byLang).sort((a, b) => a === 'en' ? -1 : b === 'en' ? 1 : byLang[b].size - byLang[a].size)
            let chapters = new Map()
            for (let lang of langs) chapters.set(this.chapterLanguageNames[lang] || lang.toUpperCase(), byLang[lang])
            chapters.set("Art", new Map([[this.artChapterId, "Covers"]]))
            return chapters
        },
        getStats: async (id) => {
            await this._preFetchCookies()
            let res = await Network.get(`https://api.mangadex.org/statistics/manga/${id}`, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let stats = JSON.parse(res.body)['statistics'][id]
            return { comments: stats['comments']?.['repliesCount'] || 0, follows: stats['follows'] || 0, rating: stats['rating']?.['average'] || 0, ratingBayesian: stats['rating']?.['bayesian'] || 0, ratingDistribution: stats['rating']?.['distribution'] || {}, threadId: stats['comments']?.['threadId'] ?? null }
        },
        getRelated: async (id) => {
            try {
                let simRes = await Network.get(`https://api.similarmanga.com/similar/${id}.json`, { 'Accept': 'application/json' })
                if (simRes.status !== 200) return []
                let matchIds = (JSON.parse(simRes.body)['matches'] || []).map((m) => m['id']).filter((x) => x).slice(0, 20)
                if (matchIds.length === 0) return []
                await this._preFetchCookies()
                let query = matchIds.map((i) => `ids[]=${i}`).join('&')
                let res = await Network.get(`https://api.mangadex.org/manga?limit=100&${query}&includes[]=cover_art&includes[]=author&includes[]=artist`, this.apiHeaders)
                if (res.status !== 200) return []
                let byId = {}
                for (let c of (JSON.parse(res.body)['data'] || [])) byId[c['id']] = c
                return matchIds.map((mid) => byId[mid]).filter((c) => c).map((c) => {
                    let p = this.api.parseComic(c)
                    return new Comic({ id: p.id, title: p.title, subtitle: p.subtitle, cover: p.cover, tags: p.tags, description: p.description })
                })
            } catch (e) { return [] }
        },
        loadInfo: async (id) => {
            let res = await Promise.all([this.comic.getComic(id), this.comic.getChapters(id), this.comic.getStats(id), this.comic.getRelated(id)])
            let comic = res[0], chapters = res[1], stats = res[2], related = res[3]
            let altTitles = [], seen = new Set([comic.title])
            for (let lang of Object.keys(comic.titles)) {
                let t = comic.titles[lang]
                if (t && !seen.has(t)) { seen.add(t); altTitles.push(t) }
            }
            let contentRow = (comic.contentRating ? [comic.contentRating] : []).concat(comic.contentWarnings || [])
            let dist = stats.ratingDistribution || {}, totalVotes = 0
            for (let k of Object.keys(dist)) totalVotes += (dist[k] || 0)
            let ratingRow = stats.rating ? [`${stats.rating.toFixed(2)} / 10` + (totalVotes ? ` · ${totalVotes} votes` : '')] : []

            let tags = {}
            if (ratingRow.length) tags["Rating"] = ratingRow
            if (comic.genres && comic.genres.length) tags["Genres"] = comic.genres
            if (comic.themes && comic.themes.length) tags["Themes"] = comic.themes
            if (comic.demographic) tags["Demographic"] = [comic.demographic]
            if (comic.formats && comic.formats.length) tags["Format"] = comic.formats
            if (contentRow.length) tags["Content"] = contentRow
            if (comic.authors && comic.authors.length) tags["Authors"] = comic.authors
            if (comic.artists && comic.artists.length) tags["Artists"] = comic.artists
            if (comic.status) tags["Status"] = [comic.status]
            if (altTitles.length) tags["Alternative Titles"] = altTitles

            return new ComicDetails({
                id: comic.id, title: comic.title, subtitle: comic.subtitle, cover: comic.cover, tags: tags,
                description: comic.description, updateTime: comic.updateTime, uploadTime: comic.createTime,
                status: comic.status, chapters: chapters, stars: (stats.rating || 0) / 2,
                url: `https://mangadex.org/title/${comic.id}`, subId: stats.threadId != null ? String(stats.threadId) : null, recommend: related,
            })
        },
        starRating: async (id, rating) => {
            await this._ensureToken()
            let value = Math.round(rating), url = `https://api.mangadex.org/rating/${id}`, res
            if (value <= 0) {
                res = typeof Network.delete === 'function' ? await Network.delete(url, this.apiHeaders, null) : await Network.request(url, 'DELETE', this.apiHeaders, null)
            } else {
                value = Math.max(1, Math.min(10, value))
                res = await Network.post(url, { ...this.apiHeaders, 'Content-Type': 'application/json' }, JSON.stringify({ rating: value }))
            }
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            return 'ok'
        },
        loadEp: async (comicId, epId) => {
            if (!epId) throw new Error("No chapter id provided")
            if (epId === this.artChapterId) {
                await this._preFetchCookies()
                let res = await Network.get(`https://api.mangadex.org/cover?manga[]=${comicId}&limit=100&order[volume]=asc`, this.apiHeaders)
                if (res.status !== 200) throw new Error("HTTP " + res.status)
                let images = (JSON.parse(res.body)['data'] || []).map((c) => c['attributes'] && c['attributes']['fileName']).filter((f) => f).map((f) => `https://uploads.mangadex.org/covers/${comicId}/${f}`)
                return { images: images }
            }
            await this._preFetchCookies()
            let res = await Network.get(`https://api.mangadex.org/at-home/server/${epId}`, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body), baseUrl = data['baseUrl'], hash = data['chapter']['hash']
            let full = data['chapter']['data'] || [], saver = data['chapter']['dataSaver'] || []
            let images = full.length > 0 ? full.map((f) => `${baseUrl}/data/${hash}/${f}`) : saver.map((f) => `${baseUrl}/data-saver/${hash}/${f}`)
            return { images: images }
        },
        onImageLoad: (url, comicId, epId) => {
            return { headers: { 'Referer': 'https://mangadex.org/', 'User-Agent': this._apiUA } }
        },
        onThumbnailLoad: (imageKey) => {
            return { headers: { 
                'Referer': 'https://mangadex.org/', 
                'User-Agent': this._apiUA
            } }
        },
        loadComments: async (comicId, subId, page, replyTo) => {
            let threadId = subId
            if (!threadId) {
                await this._preFetchCookies()
                let statsData = JSON.parse((await Network.get(`https://api.mangadex.org/statistics/manga/${comicId}`, this.apiHeaders)).body)
                threadId = statsData['statistics'][comicId]?.['comments']?.['threadId']
            }
            if (!threadId) return { comments: [], maxPage: 1 }
            await this._preFetchCookies()
            let url = `https://forums.mangadex.org/threads/${threadId}/` + (page > 1 ? `page-${page}` : '')
            let res = await Network.get(url, this.forumHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)

            let document = new HtmlDocument(res.body), comments = []
            for (let article of document.querySelectorAll('article.message--post')) {
                let userName = article.attributes['data-author'] || article.querySelector('.message-name .username')?.text || 'Unknown'
                let avatarEl = article.querySelector('.message-avatar img'), avatar = avatarEl?.attributes['src'] || null
                if (avatar && avatar.startsWith('/')) avatar = 'https://forums.mangadex.org' + avatar
                let timeEl = article.querySelector('.message-attribution-main time')
                let time = timeEl?.text?.trim() || timeEl?.attributes['datetime'] || ''
                let contentEl = article.querySelector('.message-userContent .bbWrapper') || article.querySelector('.message-userContent')
                let content = this._cleanCommentHtml(contentEl ? contentEl.innerHTML : '')
                let id = (article.attributes['data-content'] || '').replace('post-', '') || String(comments.length + 1)
                comments.push(new Comment({ id: id, userName: userName, avatar: avatar, content: content, time: time }))
            }

            let maxPage = page || 1
            for (let a of document.querySelectorAll('.pageNav-main .pageNav-page a')) {
                let n = parseInt((a.text || '').trim(), 10)
                if (!isNaN(n) && n > maxPage) maxPage = n
            }
            document.dispose()
            return { comments: comments, maxPage: maxPage }
        },
        sendComment: async () => { throw new Error("Not implemented") },
        onClickTag: (namespace, tag) => {
            let keyword
            if (namespace === "Genres" || namespace === "Themes" || namespace === "Tags") keyword = `tag:${tag.replaceAll(' ', '_')}`
            else if (namespace === "Authors") keyword = `author:${tag.replaceAll(' ', '_')}`
            else if (namespace === "Artists") keyword = `artist:${tag.replaceAll(' ', '_')}`
            else return null
            return { page: "search", attributes: { 'keyword': keyword } }
        },
        link: {
            domains: ['mangadex.org'],
            linkToId: (url) => url.match(/\/title\/([0-9a-f-]+)/)?.[1] || null
        }
    }

    settings = {
        favoritesOrder: {
            title: "收藏排序方式", type: "select",
            options: [{ value: 'updated', text: '最近更新' }, { value: 'title', text: '标题' }],
            default: 'updated',
        },
    }

    translation = { 'zh_CN': {}, 'zh_TW': {}, 'en': {} }

    tags = {"Oneshot":"0234a31e-a729-4e28-9d6a-3f87c4966b9e","Thriller":"07251805-a27e-4d59-b488-f0bfbec15168","Award Winning":"0a39b5a1-b235-4886-a747-1d05d216532d","Reincarnation":"0bc90acb-ccc1-44ca-a34a-b9f3a73259d0","Sci-Fi":"256c8bd9-4904-4360-bf4f-508a76d67183","Time Travel":"292e862b-2d17-4062-90a2-0356caa4ae27","Genderswap":"2bd2e8d0-f146-434a-9b51-fc9ff2c5fe6a","Loli":"2d1f5d56-a1e5-4d0d-a961-2193588b08ec","Traditional Games":"31932a7e-5b8e-49a6-9f12-2afa39dc544c","Official Colored":"320831a8-4026-470b-94f6-8353740e6f04","Historical":"33771934-028e-4cb3-8744-691e866a923e","Monsters":"36fd93ea-e8b8-445e-b836-358f02b3d33d","Action":"391b0423-d847-456f-aff0-8b0cfc03066b","Demons":"39730448-9a5f-48a2-85b0-a70db87b1233","Psychological":"3b60b75c-a2d7-4860-ab56-05f391bb889c","Ghosts":"3bb26d85-09d5-4d2e-880c-c34b974339e9","Animals":"3de8c75d-8ee3-48ff-98ee-e20a65c86451","Long Strip":"3e2b8dae-350e-4ab8-a8ce-016e844b9f0d","Romance":"423e2eae-a7a2-4a8b-ac03-a8351462d71d","Ninja":"489dd859-9b61-4c37-af75-5b18e88daafc","Comedy":"4d32cc48-9f00-4cca-9b5a-a839f0764984","Mecha":"50880a9d-5440-4732-9afb-8f457127e836","Anthology":"51d83883-4103-437c-b4b1-731cb73d786c","Boys' Love":"5920b825-4181-4a17-beeb-9918b0ff7a30","Incest":"5bd0e105-4481-44ca-b6e7-7544da56b1a3","Crime":"5ca48985-9a9d-4bd8-be29-80dc0303db72","Survival":"5fff9cde-849c-4d78-aab0-0d52b2ee1d25","Zombies":"631ef465-9aba-4afb-b0fc-ea10efe274a8","Reverse Harem":"65761a2a-415e-47f3-bef2-a9dababba7a6","Sports":"69964a64-2f90-4d33-beeb-f3ed2875eb4c","Superhero":"7064a261-a137-4d3a-8848-2d385de3a99c","Martial Arts":"799c202e-7daa-44eb-9cf7-8a3c0441531e","Fan Colored":"7b2ce280-79ef-4c09-9b58-12b7c23a9b78","Samurai":"81183756-1453-4c81-aa9e-f6e1b63be016","Magical Girls":"81c836c9-914a-4eca-981a-560dad663e73","Mafia":"85daba54-a71c-4554-8a28-9901a8b0afad","Adventure":"87cc87cd-a395-47af-b27a-93258283bbc6","Self-Published":"891cf039-b895-47f0-9229-bef4c96eccd4","Virtual Reality":"8c86611e-fab7-4986-9dec-d1a2f44acdd5","Office Workers":"92d6d951-ca5e-429c-ac78-451071cbf064","Video Games":"9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8","Post-Apocalyptic":"9467335a-1b83-4497-9231-765337a00b96","Sexual Violence":"97893a4c-12af-4dac-b6be-0dffb353568e","Crossdressing":"9ab53f92-3eed-4e9b-903a-917c86035ee3","Magic":"a1f53773-c69a-4ce5-8cab-fffcd90b1565","Girls' Love":"a3c67850-4684-404e-9b7f-c69850ee5da6","Harem":"aafb99c1-7f60-43fa-b75f-fc9502ce29c7","Military":"ac72833b-c4e9-4878-b9db-6c8a4a99444a","Wuxia":"acc803a4-c95a-4c22-86fc-eb6b582d82a2","Isekai":"ace04997-f6bd-436e-b261-779182193d3d","4-Koma":"b11fda93-8f1d-4bef-b2ed-8803d3173730","Doujinshi":"b13b2a48-c720-44a9-9c77-39c9979373fb","Philosophical":"b1e97889-25b4-4258-b28b-cd7f4d28ea9b","Gore":"b29d6a3d-1569-4e7a-8caf-7557bc92cd5d","Drama":"b9af3a63-f058-46de-a9a0-e0c13906197a","Medical":"c8cbe35b-1b2b-4a3f-9c37-db84c4514856","School Life":"caaa44eb-cd40-4177-b930-79d3ef2afe87","Horror":"cdad7e68-1419-41dd-bdce-27753074a640","Fantasy":"cdc58593-87dd-415e-bbc0-2ec27bf404cc","Villainess":"d14322ac-4d6f-4e9b-afd9-629d5f4d8a41","Vampires":"d7d1730f-6eb0-4ba6-9437-602cac38664c","Delinquents":"da2d50ca-3018-4cc0-ac7a-6b7d472a29ea","Monster Girls":"dd1f77c5-dea9-4e2b-97ae-224af09caf99","Shota":"ddefd648-5140-4e5f-ba18-4eca4071d19b","Police":"df33b754-73a3-4c54-80e6-1a74a8058539","Web Comic":"e197df38-d0e7-43b5-9b09-2842d0c326dd","Slice of Life":"e5301a23-ebd9-49dd-a0cb-2add944c7fe9","Aliens":"e64f6742-c834-471d-8d72-dd51fc02b835","Cooking":"ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869","Supernatural":"eabc5b4c-6aff-42f3-b657-3e90cbd00b75","Mystery":"ee968100-4191-4968-93d3-f82d72be7e46","Adaptation":"f4122d1c-3b44-44d0-9936-ff7502c39ad3","Music":"f42fbf9e-188a-447b-9fdc-f19dc1e4d685","Full Color":"f5ba408b-0e7a-484d-8d49-4e9125ac96de","Tragedy":"f8f62932-27da-4fe4-8ee1-6779a8c5edba","Gyaru":"fad12b5e-68ba-460e-b933-9ae8318f5b65"}

    authors = {}
    artists = {}
}