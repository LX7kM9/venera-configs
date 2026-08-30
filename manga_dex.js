/** @type {import('./_venera_.js')} */
class MangaDex extends ComicSource {
    // Note: The fields which are marked as [Optional] should be removed if not used

    // name of the source
    name = "MangaDex"

    // unique id of the source
    key = "manga_dex"

    version = "1.9.4"   // 增加链接解析

    minAppVersion = "1.4.0"
    
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/manga_dex.js"

    // update url
    // NOTE: disabled — auto-update would replace this heavily-customised config
    // (login, favorites, comments, multi-language, art, recommendations) with the
    // upstream version and wipe those features. Re-enable only if you publish this.
    // url = "https://git.nyne.dev/nyne/venera-configs/raw/branch/main/manga_dex.js"

    comicsPerPage = 20

    // Cached promise for the one-time pre-fetch of mangadex.org.
    // MangaDex's progressive rollout assigns bucket -1 (→ 400 HTML) to API
    // requests that arrive without the session cookie set by the main site.
    // Fetching mangadex.org first puts that cookie into Venera's cookie jar
    // so subsequent api.mangadex.org calls include it and get a valid bucket.
    _cookiesPromise = null

    _preFetchCookies = () => {
        if (!this._cookiesPromise) {
            this._cookiesPromise = Network.get('https://mangadex.org/', {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
            }).catch(() => {})
        }
        return this._cookiesPromise
    }

    get apiHeaders() {
        let headers = {
            'Accept': 'application/json',
            'Origin': 'https://mangadex.org',
            'Referer': 'https://mangadex.org/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
        }
        // Attach the OAuth bearer token only while it is still valid, so public
        // endpoints are never sent a stale/expired token (which MangaDex rejects).
        let auth = this._auth
        if (auth && auth.accessToken && Date.now() < auth.expiresAt) {
            headers['Authorization'] = `Bearer ${auth.accessToken}`
        }
        return headers
    }

    // Headers for fetching the XenForo forum HTML (comments). forums.mangadex.org
    // is behind the same progressive-rollout gate, so it needs browser
    // navigation-style headers to get a valid bucket instead of a 400 page.
    get forumHeaders() {
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://mangadex.org/',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-site',
        }
    }

    // ===== OAuth2 / OpenID Connect (Keycloak) =====
    // MangaDex uses the authorization-code + PKCE flow of the public frontend
    // client `mangadex-frontend-stable`. We open the auth page in a webview,
    // capture the `code` from the redirect, then exchange it for tokens.
    authBaseUrl = 'https://auth.mangadex.org/realms/mangadex/protocol/openid-connect'
    oauthClientId = 'mangadex-frontend-stable'
    oauthRedirectUri = 'https://mangadex.org/auth/login'
    // Sentinel folder id for the main "Following" list (vs. custom list UUIDs).
    followingFolderId = '$following'
    // MangaDex reading-status (Library) folders. A folder id is the prefix plus
    // the API status value, e.g. `$status:reading`. Order = MangaDex Library tabs.
    statusFolderPrefix = '$status:'
    // Sentinel chapter id for the synthetic "Art" chapter (volume covers).
    artChapterId = '$art'
    readingStatusNames = {
        reading: 'Reading',
        plan_to_read: 'Plan To Read',
        completed: 'Completed',
        on_hold: 'On Hold',
        re_reading: 'Re-reading',
        dropped: 'Dropped',
    }

    // Display names for the MangaDex translatedLanguage codes. Unknown codes fall
    // back to the upper-cased code. Used to group chapters by language.
    chapterLanguageNames = {
        en: 'English',
        ja: 'Japanese',
        ko: 'Korean',
        zh: 'Chinese (Simplified)',
        'zh-hk': 'Chinese (Traditional)',
        vi: 'Vietnamese',
        es: 'Spanish',
        'es-la': 'Spanish (LATAM)',
        fr: 'French',
        'pt-br': 'Portuguese (Brazil)',
        pt: 'Portuguese',
        ru: 'Russian',
        id: 'Indonesian',
        th: 'Thai',
        ar: 'Arabic',
        de: 'German',
        it: 'Italian',
        pl: 'Polish',
        tr: 'Turkish',
        uk: 'Ukrainian',
        nl: 'Dutch',
        fa: 'Persian',
        hu: 'Hungarian',
        ro: 'Romanian',
        cs: 'Czech',
        bg: 'Bulgarian',
        fi: 'Finnish',
        he: 'Hebrew',
        hi: 'Hindi',
        ms: 'Malay',
        tl: 'Filipino',
        ca: 'Catalan',
        sv: 'Swedish',
        no: 'Norwegian',
        da: 'Danish',
        el: 'Greek',
        mn: 'Mongolian',
    }

    get tokenUrl() {
        return `${this.authBaseUrl}/token`
    }

    // Fetch full manga details for an id list, ordered by the user's chosen sort,
    // then return the requested page. Shared by reading-status folders and lists.
    async _loadComicsByIds(allIds, page) {
        let limit = this.comicsPerPage
        if (allIds.length === 0) {
            return { comics: [], maxPage: 1 }
        }

        // "Last updated" = latest chapter upload time, exactly like the website's
        // Updates page. MangaDex honours order[] together with the ids[] filter,
        // so the server returns the folder already correctly ordered. (updatedAt
        // — the manga record's timestamp — is NOT the latest-chapter time, which
        // is why the previous client-side sort was wrong.)
        let order = this.loadSetting('favoritesOrder') || 'updated'
        let orderParam = order === 'title'
            ? 'order[title]=asc'
            : 'order[latestUploadedChapter]=desc'

        // Fetch every manga in the folder (chunked by 100, MangaDex's ids[] cap).
        let all = []
        for (let i = 0; i < allIds.length; i += 100) {
            let chunk = allIds.slice(i, i + 100)
            let query = chunk.map((id) => `ids[]=${id}`).join('&')
            let res = await Network.get(
                `https://api.mangadex.org/manga?limit=100&${query}&${orderParam}&` +
                `includes[]=cover_art&includes[]=author&includes[]=artist`,
                this.apiHeaders
            )
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            let data = JSON.parse(res.body)
            for (let c of (data['data'] || [])) {
                all.push(this.api.parseComic(c))
            }
        }

        // Title sort is reliable client-side too (covers the rare >100 folder
        // where chunks aren't globally ordered). Update order relies on the
        // server's latestUploadedChapter ordering.
        if (order === 'title') {
            all.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        }

        let maxPage = Math.max(1, Math.ceil(all.length / limit))
        let pageComics = all.slice((page - 1) * limit, page * limit)
        return { comics: pageComics, maxPage: maxPage }
    }

    // Turn a XenForo post body into the limited rich text Venera renders: strip
    // helper <script>/<style> blocks and convert lazy image wrappers into plain
    // <img> tags (Venera only renders a small tag subset, images among them).
    _cleanCommentHtml(html) {
        if (!html) return ''
        html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')

        // XenForo quote blocks (<blockquote class="bbCodeBlock--quote" data-quote="X">)
        // → "X: «quoted text»" built from supported tags. Process innermost-first
        // so nested quotes collapse cleanly, and drop the "said:" title and the
        // "Click to expand..." link.
        const quoteRe = /<blockquote\b([^>]*)>((?:(?!<blockquote)[\s\S])*?)<\/blockquote>/i
        let guard = 0
        while (guard++ < 30 && quoteRe.test(html)) {
            html = html.replace(quoteRe, (m, attrs, inner) => {
                let am = /data-quote="([^"]*)"/i.exec(attrs)
                let author = am ? am[1] : ''
                let body = inner
                    .replace(/<div[^>]*bbCodeBlock-title[^>]*>[\s\S]*?<\/div>/gi, '')
                    .replace(/<div[^>]*js-expandLink[^>]*>[\s\S]*?<\/div>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&nbsp;/gi, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                // Italicise the whole quote and bold the author so quoted text
                // is clearly distinct from the reply itself. The trailing blank
                // line separates the quote from the reply that follows.
                let label = author ? `<b>${author}:</b> ` : ''
                return `<br><i>❝ ${label}${body} ❞</i><br><br>`
            })
        }

        // XenForo proxies external images via /proxy.php?image=<encoded-url>.
        // Decode back to the direct URL (no forum gate / no proxy needed).
        const directUrl = (raw) => {
            if (!raw) return null
            let m = /[?&]image=([^&"]+)/.exec(raw)
            if (m) {
                try { return decodeURIComponent(m[1]) } catch (e) {}
            }
            if (raw.startsWith('//')) return 'https:' + raw
            if (raw.startsWith('/')) return 'https://forums.mangadex.org' + raw
            return raw
        }

        // Decide how to render an image by its (resolved) URL:
        // - forums.mangadex.org images (smilies, avatars, attachments) are gated
        //   and can't load in a comment → drop (avoids empty grey boxes).
        // - other MangaDex-gated images (e.g. a first-post og banner) → link.
        // - anything that didn't resolve to an absolute http(s) URL → drop.
        // - external images (Amazon, imgur, …) → keep as <img>.
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

        // <div class="bbImageWrapper" data-src="URL">…</div> → <img>/<a>
        html = html.replace(/<div[^>]*\bbbImageWrapper\b[^>]*>[\s\S]*?<\/div>/gi, (block) => {
            let m = /data-src="([^"]*)"/.exec(block)
            return imgOrLink(directUrl(m ? m[1] : null))
        })

        // Lazy/plain <img>: prefer data-src (full image) over the placeholder src.
        html = html.replace(/<img\b[^>]*>/gi, (tag) => {
            // Forum smilies/emotes can't load — replace them with their shortcode
            // (e.g. :dolphin:) / emoji text so it's clear what was posted, instead
            // of rendering rows of empty grey boxes.
            if (/class="[^"]*\bsmilie\b[^"]*"/i.test(tag) || /class="[^"]*\bemoji\b[^"]*"/i.test(tag)) {
                let cm = /data-shortname="([^"]*)"/i.exec(tag)
                    || /\salt="([^"]*)"/i.exec(tag)
                    || /\stitle="([^"]*)"/i.exec(tag)
                let code = cm ? cm[1].trim() : ''
                return code ? `${code} ` : ''
            }
            let dm = /data-src="([^"]*)"/.exec(tag)
            let sm = /\ssrc="([^"]*)"/.exec(tag)
            return imgOrLink(directUrl(dm ? dm[1] : (sm ? sm[1] : null)))
        })

        // Venera renders ONLY a small set of tags and shows any other tag as
        // literal text. Drop every remaining unsupported tag (keep its inner text).
        const allowed = { a: 1, b: 1, i: 1, u: 1, s: 1, br: 1, span: 1, img: 1 }
        html = html.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, name) => {
            return allowed[name.toLowerCase()] ? tag : ''
        })

        // Normalise whitespace and collapse runs of <br> so consecutive quotes
        // (and paragraphs) leave at most one blank line instead of a big gap.
        html = html
            .replace(/\s+/g, ' ')
            .replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br><br>')
            .replace(/^(?:\s|<br\s*\/?>)+/i, '')
            .replace(/(?:\s|<br\s*\/?>)+$/i, '')
        return html.trim()
    }

    // Fetch the manga ids that have a given reading status (the Library tabs).
    async _loadStatusMangaIds(status) {
        let res = await Network.get(
            `https://api.mangadex.org/manga/status?status=${status}`,
            this.apiHeaders
        )
        if (res.status === 401) throw this.loginRequiredMessage
        if (res.status !== 200) throw `HTTP ${res.status}`
        let data = JSON.parse(res.body)
        let statuses = data['statuses'] || {}
        return Object.keys(statuses)
    }

    // Headers for the auth.mangadex.org token endpoints. Like api.mangadex.org,
    // auth.mangadex.org is behind the progressive-rollout gate and returns a 400
    // HTML page (bucket -1) for requests that lack the browser Sec-Fetch headers.
    get _tokenPostHeaders() {
        return {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': 'https://mangadex.org',
            'Referer': 'https://mangadex.org/',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
        }
    }

    // Stored auth: {accessToken, refreshToken, expiresAt}
    get _auth() {
        return this.loadData('auth') || null
    }

    get isLogged() {
        return !!this._auth
    }

    _saveAuth(data) {
        this.saveData('auth', {
            accessToken: data['access_token'],
            refreshToken: data['refresh_token'],
            // Refresh a minute early to avoid edge-of-expiry races.
            expiresAt: Date.now() + ((data['expires_in'] || 900) * 1000),
        })
    }

    _randomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
        let result = ''
        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)]
        }
        return result
    }

    // base64url encoding (no padding) done in pure JS. We must NOT pass the byte
    // array back to a Dart Convert.* helper: a JS Uint8Array marshals to Dart as
    // a Map, not List<int>, which throws during parse. Input is a JS Uint8Array.
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

    // In-memory login state. These only need to live for a single login attempt
    // (URL build → redirect → token exchange all happen in one app session), so
    // they are NOT persisted — persisting here would call saveData during the
    // parse-time `account` probe, which crashes Venera's data layer.
    _pkceVerifier = null
    _oauthCode = null

    // PKCE verifier is generated once and reused for the whole login attempt so
    // the challenge in the auth URL always matches the verifier in the exchange.
    _getPkceVerifier() {
        if (!this._pkceVerifier) {
            this._pkceVerifier = this._randomString(64)
        }
        return this._pkceVerifier
    }

    _getQueryParam(url, name) {
        let match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url)
        return match ? decodeURIComponent(match[1]) : null
    }

    _buildAuthUrl() {
        // Starting a fresh login: drop any code captured by a previous attempt
        // so we don't try to exchange a stale/consumed one.
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

    // Error message shown when there is no usable session. We deliberately do
    // NOT throw the magic string 'Login expired': that makes Venera attempt an
    // automatic re-login, which crashes for webview-based login sources
    // (ComicSource.reLogin -> "String is not a subtype of List<dynamic>").
    // A plain message instead surfaces a clean "please log in" error.
    loginRequiredMessage = 'Not logged in to MangaDex. Please log in first.'

    // Refresh the access token if it is missing/expired, using the long-lived
    // refresh token. Throws a plain (non-magic) error when no valid session can
    // be obtained, so the favorites page shows a message instead of crashing.
    async _ensureToken() {
        let auth = this._auth
        if (!auth) throw this.loginRequiredMessage
        if (Date.now() < (auth.expiresAt - 60000)) {
            return
        }
        if (!auth.refreshToken) {
            this.deleteData('auth')
            throw this.loginRequiredMessage
        }
        let body = [
            `grant_type=refresh_token`,
            `client_id=${this.oauthClientId}`,
            `refresh_token=${encodeURIComponent(auth.refreshToken)}`,
        ].join('&')
        await this._preFetchCookies()
        let res
        try {
            res = await Network.post(this.tokenUrl, this._tokenPostHeaders, body)
        } catch (e) {
            // Network error (timeout, DNS, etc.) — transient. Keep the session.
            throw 'MangaDex is unreachable right now. Please try again.'
        }
        if (res.status === 200) {
            this._saveAuth(JSON.parse(res.body))
            return
        }
        // Only a genuine auth rejection (the refresh token is invalid/revoked)
        // should log the user out. Transient server errors (5xx, Cloudflare 5xx,
        // rate limits) must NOT wipe the saved session, or a brief outage forces
        // a full re-login.
        if (res.status === 400 || res.status === 401) {
            this.deleteData('auth')
            throw this.loginRequiredMessage
        }
        throw `MangaDex token refresh failed (HTTP ${res.status}). Please try again.`
    }

    api = {
        parseComic: (data) => {
            let id = data['id']
            let titles = {}
            let mainTitles = data['attributes']['title']
            for (let lang of Object.keys(mainTitles)) {
                titles[lang] = mainTitles[lang]
            }
            for (let at of data['attributes']['altTitles']) {
                for (let lang of Object.keys(at)) {
                    if (titles[lang] === undefined) {
                        titles[lang] = at[lang]
                    }
                }
            }
            let locale = APP.locale
            let mainTitle = ''
            let firstTitle = titles[Object.keys(titles)[0]]
            if (locale.startsWith('en')) {
                mainTitle = titles['en'] || titles['ja'] || firstTitle
            } else if (locale.startsWith('zh_CN')) {
                mainTitle = titles['zh'] || titles['zh-hk'] || titles['zh-tw'] || titles['ja'] || firstTitle
            } else if (locale.startsWith('zh_TW')) {
                mainTitle = titles['zh-hk'] || titles['zh-tw'] || titles['zh'] || titles['ja'] || firstTitle
            }
            // Tags carry a `group` (genre / theme / content / format); split them
            // the way the website does. `tags` stays a flat list for list views.
            let tags = []
            let genres = []
            let themes = []
            let contentWarnings = []
            let formats = []
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
            // publicationDemographic (shounen/…) and contentRating (erotica/…) are
            // manga attributes, not tags — surfaced as their own info rows.
            let demographic = capitalize(data['attributes']['publicationDemographic'] || '')
            let contentRating = capitalize(data['attributes']['contentRating'] || '')
            let cover = data['relationships'].find((e) => e['type'] === 'cover_art')?.['attributes']['fileName']
            if (cover) {
                cover = `https://mangadex.org/covers/${id}/${cover}.256.jpg`
            } else {
                cover = ""
            }
            let descriptions = data['attributes']['description'] || {}
            let description = descriptions['en'] || descriptions[Object.keys(descriptions)[0]] || ''
            let createTime = data['attributes']['createdAt']
            let updateTime = data['attributes']['updatedAt']
            let status = data['attributes']['status']
            let authors = []
            let artists = []
            for (let rel of data['relationships']) {
                if (rel['type'] === 'author') {
                    let name = rel['attributes']['name'];
                    let id = rel['id']
                    authors.push(name)
                    this.authors[name] = id
                } else if (rel['type'] === 'artist') {
                    let name = rel['attributes']['name'];
                    let id = rel['id']
                    artists.push(name)
                    this.artists[name] = id
                }
            }

            return {
                id: id,
                title: mainTitle,
                subtitle: authors.at(0),
                titles: titles,
                cover: cover,
                tags: tags,
                genres: genres,
                themes: themes,
                contentWarnings: contentWarnings,
                formats: formats,
                demographic: demographic,
                contentRating: contentRating,
                description: description,
                createTime: createTime,
                updateTime: updateTime,
                status: status,
                authors: authors,
                artists: artists,
            }
        },
        getPopular: async (page) => {
            await this._preFetchCookies()
            let time = new Date()
            time = new Date(time.getTime() - 30 * 24 * 60 * 60 * 1000)
            let popularUrl = `https://api.mangadex.org/manga?` +
                `includes[]=cover_art&` +
                `includes[]=artist&` +
                `includes[]=author&` +
                `order[followedCount]=desc&` +
                `hasAvailableChapters=true&` +
                `createdAtSince=${time.toISOString().substring(0, 19)}&` +
                `limit=${this.comicsPerPage}`
            if (page && page > 1) {
                popularUrl += `&offset=${(page - 1) * this.comicsPerPage}`
            }
            let res = await Network.get(popularUrl, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            let total = data['total']
            let maxPage = Math.ceil(total / this.comicsPerPage)
            let comics = []
            for (let comic of data['data']) {
                comics.push(this.api.parseComic(comic))
            }
            return {
                comics: comics,
                maxPage: maxPage
            }
        },
        getRecent: async (page) => {
            await this._preFetchCookies()
            let recentUrl = `https://api.mangadex.org/manga?` +
                `includes[]=cover_art&` +
                `includes[]=artist&` +
                `includes[]=author&` +
                `order[createdAt]=desc&` +
                `hasAvailableChapters=true&` +
                `limit=${this.comicsPerPage}`
            if (page && page > 1) {
                recentUrl += `&offset=${(page - 1) * this.comicsPerPage}`
            }
            let res = await Network.get(recentUrl, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            let total = data['total']
            let maxPage = Math.ceil(total / this.comicsPerPage)
            let comics = []
            for (let comic of data['data']) {
                comics.push(this.api.parseComic(comic))
            }
            return {
                comics: comics,
                maxPage: maxPage
            }
        },
        getUpdated: async (page) => {
            await this._preFetchCookies()
            let updatedUrl = `https://api.mangadex.org/manga?` +
                `includes[]=cover_art&` +
                `includes[]=artist&` +
                `includes[]=author&` +
                `order[latestUploadedChapter]=desc&` +
                `contentRating[]=safe&` +
                `contentRating[]=suggestive&` +
                `hasAvailableChapters=true&` +
                `limit=${this.comicsPerPage}`
            if (page && page > 1) {
                updatedUrl += `&offset=${(page - 1) * this.comicsPerPage}`
            }
            let res = await Network.get(updatedUrl, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            let total = data['total']
            let maxPage = Math.ceil(total / this.comicsPerPage)
            let comics = []
            for (let comic of data['data']) {
                comics.push(this.api.parseComic(comic))
            }
            return {
                comics: comics,
                maxPage: maxPage
            }
        }
    }

    // [Optional] account related.
    // Built via an IIFE that captures the instance as `self`, so this is a plain
    // own-property (reliably detected by the parser) while still letting the
    // login URL be computed lazily through an inner getter. No persistence runs
    // at construction/parse time — only pure computation and in-memory state.
    account = ((self) => ({
        loginWithWebview: {
            // Lazy: the PKCE challenge is only computed when the URL is actually
            // read (i.e. when the user opens the login page), never at parse time.
            get url() {
                return self._buildAuthUrl()
            },
            /**
             * Detect the OAuth redirect and capture the authorization code.
             * We keep ONLY the first code: it is the one Keycloak issues in direct
             * response to OUR auth request, so it is bound to OUR PKCE challenge.
             * If the MangaDex SPA then restarts its own OAuth flow, later redirects
             * carry a code bound to a DIFFERENT challenge — exchanging that with our
             * verifier yields "PKCE verification failed". Capturing first avoids it.
             * @param url {string}
             * @param title {string}
             * @returns {boolean}
             */
            checkStatus: (url, title) => {
                if (url.startsWith(self.oauthRedirectUri) && url.includes('code=')) {
                    if (!self._oauthCode) {
                        let code = self._getQueryParam(url, 'code')
                        if (code) {
                            self._oauthCode = code
                        }
                    }
                    return !!self._oauthCode
                }
                return false
            },
            onLoginSuccess: async () => {
                let code = self._oauthCode
                let verifier = self._getPkceVerifier()
                if (!code) {
                    throw 'Login failed: no authorization code captured'
                }
                let body = [
                    `grant_type=authorization_code`,
                    `client_id=${self.oauthClientId}`,
                    `code=${encodeURIComponent(code)}`,
                    `code_verifier=${encodeURIComponent(verifier)}`,
                    `redirect_uri=${encodeURIComponent(self.oauthRedirectUri)}`,
                ].join('&')
                // A valid token already in hand means a previous (possibly
                // duplicate) redirect already completed login; the current code
                // may have been consumed, so don't re-exchange and fail.
                if (self._auth && self._auth.accessToken && Date.now() < self._auth.expiresAt) {
                    return
                }
                await self._preFetchCookies()
                let res = await Network.post(self.tokenUrl, self._tokenPostHeaders, body)
                if (res.status !== 200) {
                    // If a parallel exchange already succeeded, treat as success.
                    if (self._auth && self._auth.accessToken && Date.now() < self._auth.expiresAt) {
                        return
                    }
                    throw `Login failed: HTTP ${res.status} ${res.body}`
                }
                self._saveAuth(JSON.parse(res.body))
                self._oauthCode = null
                // NOTE: deliberately keep `_pkceVerifier` stable for the whole
                // app session. If the login flow runs twice (the webview can fire
                // the redirect more than once), both exchanges then use the same
                // verifier that matches the challenge in the auth URL — avoiding
                // a "PKCE verification failed" 400 on the second exchange.
            },
        },

        /**
         * logout function, clear account related data
         */
        logout: () => {
            self.deleteData('auth')
            self._oauthCode = null
            self._pkceVerifier = null
        },

        // {string?} - register url
        registerWebsite: 'https://auth.mangadex.org/realms/mangadex/login-actions/registration?client_id=mangadex-frontend-stable',
    }))(this)

    // favorite related — MangaDex exposes the "Following" list plus user-created
    // custom lists, each shown as an enterable folder.
    favorites = {
        multiFolder: true,
        /**
         * follow/unfollow, or add/remove from a custom list.
         * @param comicId {string}
         * @param folderId {string} - `$following` or a custom-list UUID
         * @param isAdding {boolean}
         * @param favoriteId {string?}
         * @returns {Promise<any>}
         */
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            await this._ensureToken()

            // Reading-status folder: set (or clear) the manga's Library status.
            if (folderId.startsWith(this.statusFolderPrefix)) {
                let status = isAdding ? folderId.slice(this.statusFolderPrefix.length) : null
                let res = await Network.post(
                    `https://api.mangadex.org/manga/${comicId}/status`,
                    { ...this.apiHeaders, 'Content-Type': 'application/json' },
                    JSON.stringify({ status: status })
                )
                if (res.status === 401) throw this.loginRequiredMessage
                if (res.status !== 200) throw `HTTP ${res.status}`
                return 'ok'
            }

            let url
            if (folderId === this.followingFolderId) {
                url = `https://api.mangadex.org/manga/${comicId}/follow`
            } else {
                url = `https://api.mangadex.org/manga/${comicId}/list/${folderId}`
            }
            let res
            if (isAdding) {
                res = await Network.post(url, this.apiHeaders, '')
            } else if (typeof Network.delete === 'function') {
                res = await Network.delete(url, this.apiHeaders, null)
            } else {
                res = await Network.request(url, 'DELETE', this.apiHeaders, null)
            }
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            return 'ok'
        },
        /**
         * load favorite folders: the "Following" list plus each custom list.
         * if comicId is given, also report which folders already contain it.
         * @param comicId {string?}
         * @returns {Promise<{folders: {[p: string]: string}, favorited: string[]}>}
         */
        loadFolders: async (comicId) => {
            await this._ensureToken()
            let folders = {}
            // The six Library reading-status folders. "Following" is omitted: for
            // MangaDex it overlaps almost entirely with "Reading".
            for (let status of Object.keys(this.readingStatusNames)) {
                folders[this.statusFolderPrefix + status] = this.readingStatusNames[status]
            }

            // Fetch the user's custom lists.
            let listsRes = await Network.get(
                `https://api.mangadex.org/user/list?limit=100`,
                this.apiHeaders
            )
            if (listsRes.status === 401) throw this.loginRequiredMessage
            if (listsRes.status !== 200) throw `HTTP ${listsRes.status}`
            let listsData = JSON.parse(listsRes.body)
            let lists = listsData['data'] || []
            for (let list of lists) {
                folders[list['id']] = list['attributes']['name'] || 'Unnamed list'
            }

            let favorited = []
            if (comicId) {
                // Its reading status (which Library folder it belongs to).
                let statusRes = await Network.get(
                    `https://api.mangadex.org/manga/${comicId}/status`,
                    this.apiHeaders
                )
                if (statusRes.status === 200) {
                    let status = JSON.parse(statusRes.body)['status']
                    if (status) {
                        favorited.push(this.statusFolderPrefix + status)
                    }
                }
                // Which custom lists contain it? Each list's relationships
                // include its manga ids.
                for (let list of lists) {
                    let inList = (list['relationships'] || []).some(
                        (r) => r['type'] === 'manga' && r['id'] === comicId
                    )
                    if (inList) {
                        favorited.push(list['id'])
                    }
                }
            }

            return {
                folders: folders,
                favorited: favorited,
            }
        },
        /**
         * create a custom list
         * @param name {string}
         * @returns {Promise<any>}
         */
        addFolder: async (name) => {
            await this._ensureToken()
            let res = await Network.post(
                `https://api.mangadex.org/list`,
                { ...this.apiHeaders, 'Content-Type': 'application/json' },
                JSON.stringify({ name: name, visibility: 'private' })
            )
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            return 'ok'
        },
        /**
         * delete a custom list
         * @param folderId {string}
         * @returns {Promise<any>}
         */
        deleteFolder: async (folderId) => {
            // Built-in folders ("Following" and the reading-status tabs) are not
            // user-created custom lists and cannot be deleted.
            if (folderId.startsWith('$')) {
                throw 'This is a built-in MangaDex folder and cannot be deleted.'
            }
            await this._ensureToken()
            let url = `https://api.mangadex.org/list/${folderId}`
            let res
            if (typeof Network.delete === 'function') {
                res = await Network.delete(url, this.apiHeaders, null)
            } else {
                res = await Network.request(url, 'DELETE', this.apiHeaders, null)
            }
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            return 'ok'
        },
        /**
         * load comics in a folder (paged).
         * @param page {number}
         * @param folder {string} - `$following` or a custom-list UUID
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        loadComics: async (page, folder) => {
            await this._ensureToken()
            let limit = this.comicsPerPage

            if (!folder || folder === this.followingFolderId) {
                // The "Following" list is paginated server-side.
                let offset = (page - 1) * limit
                let url = `https://api.mangadex.org/user/follows/manga?` +
                    `limit=${limit}&offset=${offset}&` +
                    `includes[]=cover_art&includes[]=author&includes[]=artist`
                let res = await Network.get(url, this.apiHeaders)
                if (res.status === 401) throw this.loginRequiredMessage
                if (res.status !== 200) throw `HTTP ${res.status}`
                let data = JSON.parse(res.body)
                let comics = (data['data'] || []).map((c) => this.api.parseComic(c))
                return {
                    comics: comics,
                    maxPage: Math.max(1, Math.ceil((data['total'] || 0) / limit)),
                }
            }

            // A reading-status (Library) folder: get all its manga ids, then
            // page through them client-side fetching full details.
            if (folder.startsWith(this.statusFolderPrefix)) {
                let status = folder.slice(this.statusFolderPrefix.length)
                let ids = await this._loadStatusMangaIds(status)
                return this._loadComicsByIds(ids, page)
            }

            // A custom list returns all its manga ids in one call; paginate the
            // ids client-side, then fetch full manga details for the page slice.
            let listRes = await Network.get(
                `https://api.mangadex.org/list/${folder}`,
                this.apiHeaders
            )
            if (listRes.status === 401) throw this.loginRequiredMessage
            if (listRes.status !== 200) throw `HTTP ${listRes.status}`
            let listData = JSON.parse(listRes.body)
            let mangaIds = (listData['data']['relationships'] || [])
                .filter((r) => r['type'] === 'manga')
                .map((r) => r['id'])
            return this._loadComicsByIds(mangaIds, page)
        },
        singleFolderForSingleComic: false,
    }

    // explore page list
    explore = [
        {
            // title of the page.
            // title is used to identify the page, it should be unique
            title: "Manga Dex",

            /// multiPartPage or multiPageComicList or mixed
            type: "multiPartPage",

            load: async (page) => {
                let res = await Promise.all([
                    this.api.getPopular(page),
                    this.api.getRecent(page),
                    this.api.getUpdated(page)
                ])
                let titles = ["Popular", "Recent", "Updated"]
                let viewMore = [
                    {
                        page: "search",
                        attributes: {
                            options: ["popular", "any", "any"],
                        },
                    },
                    {
                        page: "search",
                        attributes: {
                            options: ["recent", "any", "any"],
                        },
                    },
                    {
                        page: "search",
                        attributes: {
                            options: ["updated", "any", "any"],
                        },
                    }
                ]
                let parts = []
                for (let i = 0; i < res.length; i++) {
                    let part = res[i]
                    parts.push({
                        title: titles[i],
                        comics: part.comics,
                        viewMore: viewMore[i]
                    })
                }
                return parts
            },
        }
    ]

    // categories
    category = {
        /// title of the category page, used to identify the page, it should be unique
        title: "MangaDex",
        parts: [
            {
                // title of the part
                name: "Tags",

                // fixed or random or dynamic
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                // if dynamic, need to provide `loader` field, which indicates the function to load comics
                type: "dynamic",

                // number of comics to display at the same time
                // randomNumber: 5,

                // load function for dynamic type
                        loader: () => {
                    let categories = []
                    for (let tag of Object.keys(this.tags)) {
                        categories.push({
                            label: tag,
                            target: {
                                        action: "category",
                                        keyword: tag,
                                        param: this.tags[tag],
                            }
                        })
                    }
                    return categories
                }
            }
        ],
        // enable ranking page
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options = [], page = 1) => {
            if (!param) {
                throw new Error("No tag id provided for category comics")
            }

            const parseOption = (option, fallback) => {
                if (option === undefined || option === null || option === "") {
                    return fallback
                }
                let value = option.split("-")[0]
                return value || fallback
            }

            const sortOption = parseOption(options[0], "popular")
            const ratingOption = parseOption(options[1], "any")
            const statusOption = parseOption(options[2], "any")

            let params = [
                "includes[]=cover_art",
                "includes[]=artist",
                "includes[]=author",
                "hasAvailableChapters=true",
                `limit=${this.comicsPerPage}`,
                `includedTags[]=${encodeURIComponent(param)}`
            ]

            if (page && page > 1) {
                params.push(`offset=${(page - 1) * this.comicsPerPage}`)
            }

            if (sortOption !== "any") {
                const orderMap = {
                    popular: "followedCount",
                    follows: "followedCount",
                    recent: "createdAt",
                    updated: "latestUploadedChapter",
                    rating: "rating"
                }
                const orderKey = orderMap[sortOption]
                if (orderKey) {
                    params.push(`order[${orderKey}]=desc`)
                }
            }

            let ratingList
            if (ratingOption === "any") {
                ratingList = ["safe", "suggestive", "erotica"]
            } else {
                ratingList = [ratingOption]
            }
            for (let rating of ratingList) {
                params.push(`contentRating[]=${encodeURIComponent(rating)}`)
            }

            if (statusOption !== "any") {
                params.push(`status[]=${encodeURIComponent(statusOption)}`)
            }

            await this._preFetchCookies()
            let url = `https://api.mangadex.org/manga?${params.join("&")}`
            let res = await Network.get(url, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            let total = data['total'] || 0
            let comics = []
            for (let comic of data['data'] || []) {
                comics.push(this.api.parseComic(comic))
            }
            let maxPage = total ? Math.ceil(total / this.comicsPerPage) : (comics.length < this.comicsPerPage ? page : page + 1)
            return {
                comics: comics,
                maxPage: maxPage
            }
        },
        optionList: [
            {
                options: [
                    "any-Any",
                    "popular-Popular",
                    "recent-Recent",
                    "updated-Updated",
                    "rating-Rating",
                    "follows-Follows"
                ]
            },
            {
                options: [
                    "any-Any",
                    "safe-Safe",
                    "suggestive-Suggestive",
                    "erotica-Erotica"
                ]
            },
            {
                options: [
                    "any-Any",
                    "ongoing-Ongoing",
                    "completed-Completed",
                    "hiatus-Hiatus",
                    "cancelled-Cancelled"
                ]
            }
        ]
    }

    /// search related
    search = {
        /**
         * load search result
         * @param keyword {string}
         * @param options {string[]} - options from optionList
         * @param page {number}
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (keyword, options, page) => {
            let order = ""
            if (options[0] !== "any") {
                order = {
                    "popular": `order[followedCount]=desc&`,
                    "recent": `order[createdAt]=desc&`,
                    "updated": `order[latestUploadedChapter]=desc&`,
                    "rating": `order[rating]=desc&`,
                    "follows": `order[followedCount]=desc&`
                }[options[0]]
            }
            let contentRating = ""
            if (options[1] !== "any") {
                contentRating = `contentRating[]=${options[1]}&`
            }
            let status = ""
            if (options[2] !== "any") {
                status = `status[]=${options[2]}&`
            }
            let url = `https://api.mangadex.org/manga?` +
                `includes[]=cover_art&` +
                `includes[]=artist&` +
                `includes[]=author&` +
                order +
                contentRating +
                status +
                `hasAvailableChapters=true&` +
                `limit=${this.comicsPerPage}`
            if (page && page > 1) {
                url += `&offset=${(page - 1) * this.comicsPerPage}`
            }
            if (keyword) {
                let splits = keyword.split(" ")
                let reformated = []
                for (let s of splits) {
                    if (s === "") {
                        continue
                    }
                    if (s.startsWith('tag:')) {
                        let tag = s.substring(4)
                        tag = tag.replaceAll('_', ' ')
                        let id = this.tags[tag]
                        if (id !== undefined) {
                            url += `&includedTags[]=${id}`
                        } else {
                            reformated.push(s)
                        }
                    } else if (s.startsWith('author:')) {
                        let author = s.substring(7)
                        author = author.replaceAll('_', ' ')
                        let id = this.authors[author]
                        if (id !== undefined) {
                            url += `&authorOrArtist=${id}`
                        } else {
                            reformated.push(s)
                        }
                    } else if (s.startsWith('artist:')) {
                        let artist = s.substring(7)
                        artist = artist.replaceAll('_', ' ')
                        let id = this.artists[artist]
                        if (id !== undefined) {
                            url += `&authorOrArtist=${id}`
                        } else {
                            reformated.push(s)
                        }
                    } else {
                        reformated.push(s)
                    }
                }
                keyword = reformated.join(" ")
                if (keyword !== "")
                    url += `&title=${keyword}`
            }
            await this._preFetchCookies()
            let res = await Network.get(url, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            let total = data['total']
            let maxPage = Math.ceil(total / this.comicsPerPage)
            let comics = []
            for (let comic of data['data']) {
                comics.push(this.api.parseComic(comic))
            }
            return {
                comics: comics,
                maxPage: maxPage
            }
        },

        // provide options for search
        optionList: [
            {
                label: "Sort By",
                type: "select",
                options: [
                    "any-Any",
                    "popular-Popular",
                    "recent-Recent",
                    "updated-Updated",
                    "rating-Rating",
                    "follows-Follows",
                ],
            },
            {
                label: "Content Rating",
                type: "select",
                options: [
                    "any-Any",
                    "safe-Safe",
                    "suggestive-Suggestive",
                    "erotica-Erotica",
                ]
            },
            {
                label: "Status",
                type: "select",
                options: [
                    "any-Any",
                    "ongoing-Ongoing",
                    "completed-Completed",
                    "hiatus-Hiatus",
                    "cancelled-Cancelled",
                ]
            },
        ],

        // enable tags suggestions
        enableTagsSuggestions: false,
    }

    /// single comic related
    comic = {
        getComic: async (id) => {
            await this._preFetchCookies()
            let res = await Network.get(`https://api.mangadex.org/manga/${id}?includes[]=cover_art&includes[]=artist&includes[]=author`, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            return this.api.parseComic(data['data'])
        },
        getChapters: async (id) => {
            await this._preFetchCookies()
            // Fetch the whole feed across ALL languages (paginated by 500), so
            // every translation is available — not just English.
            const limit = 500
            let all = []
            let offset = 0
            while (true) {
                let url = `https://api.mangadex.org/manga/${id}/feed?` +
                    `limit=${limit}&offset=${offset}&` +
                    `order[volume]=asc&order[chapter]=asc&` +
                    `includes[]=scanlation_group&` +
                    `contentRating[]=safe&contentRating[]=suggestive&` +
                    `contentRating[]=erotica&contentRating[]=pornographic`
                let res = await Network.get(url, this.apiHeaders)
                if (res.status !== 200) throw new Error("HTTP " + res.status)
                let data = JSON.parse(res.body)
                let batch = data['data'] || []
                all.push(...batch)
                offset += limit
                if (batch.length < limit || offset >= (data['total'] || 0)) break
            }

            // Bucket chapters by language, preserving the feed's chapter order.
            let byLang = {}
            for (let chapter of all) {
                let attrs = chapter['attributes']
                // External chapters open a 3rd-party site; the reader can't load them.
                if (attrs['externalUrl']) continue
                let lang = attrs['translatedLanguage'] || 'unknown'
                let num = attrs['chapter']
                let label = num ? `Ch.${num}` : 'Oneshot'
                if (attrs['volume']) {
                    label = `Vol.${attrs['volume']} ${label}`
                }
                if (attrs['title']) {
                    label += `: ${attrs['title']}`
                }
                // Disambiguate same-numbered chapters from different scan groups.
                let group = (chapter['relationships'] || [])
                    .find((r) => r['type'] === 'scanlation_group')
                let groupName = group && group['attributes'] ? group['attributes']['name'] : null
                if (groupName) {
                    label += ` · ${groupName}`
                }
                if (!byLang[lang]) {
                    byLang[lang] = new Map()
                }
                byLang[lang].set(chapter['id'], label)
            }

            // Order languages: English first, then by translation count (desc).
            let langs = Object.keys(byLang)
            langs.sort((a, b) => {
                if (a === 'en') return -1
                if (b === 'en') return 1
                return byLang[b].size - byLang[a].size
            })

            let chapters = new Map()
            for (let lang of langs) {
                let name = this.chapterLanguageNames[lang] || lang.toUpperCase()
                chapters.set(name, byLang[lang])
            }
            // Append a synthetic "Art" chapter at the very end; opening it shows
            // the volume covers as pages (resolved lazily in loadEp).
            chapters.set("Art", new Map([[this.artChapterId, "Covers"]]))
            return chapters
        },
        getStats: async (id) => {
            await this._preFetchCookies()
            let res = await Network.get(`https://api.mangadex.org/statistics/manga/${id}`, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            let stats = data['statistics'][id]
            return {
                comments: stats['comments']?.['repliesCount'] || 0,
                follows: stats['follows'] || 0,
                rating: stats['rating']?.['average'] || 0,
                ratingBayesian: stats['rating']?.['bayesian'] || 0,
                ratingDistribution: stats['rating']?.['distribution'] || {},
                threadId: stats['comments']?.['threadId'] ?? null,
            }
        },
        // Recommended manga, from the same "similar-manga" dataset that powers
        // MangaDex's website Recommendations tab (TF-IDF + tag similarity). The
        // matches come back already ordered by similarity score. We then fetch
        // MangaDex details for those ids (covers/authors) to build clickable
        // cards. Never throws; empty when the title isn't in the dataset.
        getRelated: async (id) => {
            try {
                // 1) Similarity matches (ordered by score, highest first).
                let simRes = await Network.get(
                    `https://api.similarmanga.com/similar/${id}.json`,
                    { 'Accept': 'application/json' }
                )
                if (simRes.status !== 200) return []
                let sim = JSON.parse(simRes.body)
                let matchIds = (sim['matches'] || [])
                    .map((m) => m['id'])
                    .filter((x) => x)
                    .slice(0, 20)
                if (matchIds.length === 0) return []

                // 2) Fetch MangaDex details for the matched ids.
                await this._preFetchCookies()
                let query = matchIds.map((i) => `ids[]=${i}`).join('&')
                let res = await Network.get(
                    `https://api.mangadex.org/manga?limit=100&${query}&` +
                    `includes[]=cover_art&includes[]=author&includes[]=artist`,
                    this.apiHeaders
                )
                if (res.status !== 200) return []
                let data = JSON.parse(res.body)
                let byId = {}
                for (let c of (data['data'] || [])) byId[c['id']] = c
                // Preserve the similarity order from the dataset.
                return matchIds
                    .map((mid) => byId[mid])
                    .filter((c) => c)
                    .map((c) => {
                        let p = this.api.parseComic(c)
                        return new Comic({
                            id: p.id,
                            title: p.title,
                            subtitle: p.subtitle,
                            cover: p.cover,
                            tags: p.tags,
                            description: p.description,
                        })
                    })
            } catch (e) {
                return []
            }
        },
        /**
         * load comic info
         * @param id {string}
         * @returns {Promise<ComicDetails>}
         */
        loadInfo: async (id) => {
            let res = await Promise.all([
                this.comic.getComic(id),
                this.comic.getChapters(id),
                this.comic.getStats(id),
                this.comic.getRelated(id)
            ])
            let comic = res[0]
            let chapters = res[1]
            let stats = res[2]
            let related = res[3]

            // Alternative titles: every distinct title other than the displayed one.
            let altTitles = []
            let seen = new Set([comic.title])
            for (let lang of Object.keys(comic.titles)) {
                let t = comic.titles[lang]
                if (t && !seen.has(t)) {
                    seen.add(t)
                    altTitles.push(t)
                }
            }

            // The red website labels (content rating + content warnings) go in a
            // single non-clickable "Content" row (handled in onClickTag).
            let contentRow = []
            if (comic.contentRating) contentRow.push(comic.contentRating)
            contentRow = contentRow.concat(comic.contentWarnings || [])

            // Rating on MangaDex's native 10-point scale + vote count, shown as a
            // single compact chip (the top star widget is the app's 5-star control
            // and can't be changed). Distribution is omitted to keep it clean.
            let dist = stats.ratingDistribution || {}
            let totalVotes = 0
            for (let k of Object.keys(dist)) totalVotes += (dist[k] || 0)
            let ratingRow = []
            if (stats.rating) {
                ratingRow.push(`${stats.rating.toFixed(2)} / 10` + (totalVotes ? ` · ${totalVotes} votes` : ''))
            }

            // Only include rows that have values, in the website's order.
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
                id: comic.id,
                title: comic.title,
                subtitle: comic.subtitle,
                cover: comic.cover,
                tags: tags,
                description: comic.description,
                updateTime: comic.updateTime,
                uploadTime: comic.createTime,
                status: comic.status,
                chapters: chapters,
                // The 5-star widget couples its fill and its number, so we can't
                // fill on a 5-scale AND label with the 10-point value. Halve the
                // rating so the stars fill proportionally (not always maxed out);
                // the exact 10-point score lives in the "Rating" info row.
                stars: (stats.rating || 0) / 2,
                url: `https://mangadex.org/title/${comic.id}`,
                subId: stats.threadId != null ? String(stats.threadId) : null,
                recommend: related,
            })
        },

        /**
         * rate a comic
         * @param id
         * @param rating {number} - [0-10] app use 5 stars, 1 rating = 0.5 stars,
         * @returns {Promise<any>} - return any value to indicate success
         */
        starRating: async (id, rating) => {
            await this._ensureToken()
            // Venera passes 0-10 (1 = half a star). MangaDex ratings are integers
            // 1-10; a 0 (cleared stars) removes the rating.
            let value = Math.round(rating)
            let url = `https://api.mangadex.org/rating/${id}`
            let res
            if (value <= 0) {
                if (typeof Network.delete === 'function') {
                    res = await Network.delete(url, this.apiHeaders, null)
                } else {
                    res = await Network.request(url, 'DELETE', this.apiHeaders, null)
                }
            } else {
                value = Math.max(1, Math.min(10, value))
                res = await Network.post(
                    url,
                    { ...this.apiHeaders, 'Content-Type': 'application/json' },
                    JSON.stringify({ rating: value })
                )
            }
            if (res.status === 401) throw this.loginRequiredMessage
            if (res.status !== 200) throw `HTTP ${res.status}`
            return 'ok'
        },

        /**
         * load images of a chapter
         * @param comicId {string}
         * @param epId {string?}
         * @returns {Promise<{images: string[]}>}
         */
        loadEp: async (comicId, epId) => {
            if (!epId) {
                throw new Error("No chapter id provided")
            }
            // The synthetic "Art" chapter: return the volume covers as pages.
            if (epId === this.artChapterId) {
                await this._preFetchCookies()
                let res = await Network.get(
                    `https://api.mangadex.org/cover?manga[]=${comicId}&limit=100&order[volume]=asc`,
                    this.apiHeaders
                )
                if (res.status !== 200) throw new Error("HTTP " + res.status)
                let data = JSON.parse(res.body)
                let images = (data['data'] || [])
                    .map((c) => c['attributes'] && c['attributes']['fileName'])
                    .filter((f) => f)
                    .map((f) => `https://mangadex.org/covers/${comicId}/${f}`)
                return { images: images }
            }
            await this._preFetchCookies()
            let res = await Network.get(`https://api.mangadex.org/at-home/server/${epId}`, this.apiHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)
            let data = JSON.parse(res.body)
            let baseUrl = data['baseUrl']
            let hash = data['chapter']['hash']
            let full = data['chapter']['data'] || []
            let saver = data['chapter']['dataSaver'] || []

            // Prefer full quality (what the website serves); fall back to
            // data-saver only when the full-resolution set is absent. NOTE: every
            // image request must carry the mangadex.org Referer (injected by
            // onImageLoad) — the @Home nodes `vary` on Referer and return 404
            // without it.
            let images = full.length > 0
                ? full.map((f) => `${baseUrl}/data/${hash}/${f}`)
                : saver.map((f) => `${baseUrl}/data-saver/${hash}/${f}`)
            return { images: images }
        },
        /**
         * [Optional] provide headers for chapter image requests.
         * The MangaDex@Home nodes `vary` on Referer and return 404 for requests
         * without `Referer: https://mangadex.org/`, so inject it here.
         * @param url {string}
         * @param comicId {string}
         * @param epId {string?}
         * @returns {{headers: object}}
         */
        onImageLoad: (url, comicId, epId) => {
            let headers = { 'Referer': 'https://mangadex.org/' }
            // The "Art" chapter serves covers from mangadex.org/covers, which is
            // gated and varies on the browser fetch headers (like the cover
            // thumbnails handled by onThumbnailLoad).
            if (url.includes('mangadex.org/covers/')) {
                headers['Sec-Fetch-Dest'] = 'image'
                headers['Sec-Fetch-Mode'] = 'no-cors'
                headers['Sec-Fetch-Site'] = 'same-origin'
            }
            return { headers: headers }
        },
        /**
         * [Optional] load comments
         *
         * Since app version 1.0.6, rich text is supported in comments.
         * Following html tags are supported: ['a', 'b', 'i', 'u', 's', 'br', 'span', 'img'].
         * span tag supports style attribute, but only support font-weight, font-style, text-decoration.
         * All images will be placed at the end of the comment.
         * Auto link detection is enabled, but only http/https links are supported.
         * @param comicId {string}
         * @param subId {string?} - ComicDetails.subId
         * @param page {number}
         * @param replyTo {string?} - commentId to reply, not null when reply to a comment
         * @returns {Promise<{comments: Comment[], maxPage: number?}>}
         */
        loadComments: async (comicId, subId, page, replyTo) => {
            let threadId = subId
            if (!threadId) {
                await this._preFetchCookies()
                let statsRes = await Network.get(
                    `https://api.mangadex.org/statistics/manga/${comicId}`,
                    this.apiHeaders
                )
                if (statsRes.status !== 200) throw new Error("HTTP " + statsRes.status)
                let statsData = JSON.parse(statsRes.body)
                threadId = statsData['statistics'][comicId]?.['comments']?.['threadId']
            }
            if (!threadId) {
                return { comments: [], maxPage: 1 }
            }
            // MangaDex comments live in a XenForo forum thread
            // (forums.mangadex.org/threads/{id}/). There is no JSON API, so fetch
            // the thread page HTML and scrape the posts.
            await this._preFetchCookies()
            let url = `https://forums.mangadex.org/threads/${threadId}/`
            if (page && page > 1) {
                url += `page-${page}`
            }
            let res = await Network.get(url, this.forumHeaders)
            if (res.status !== 200) throw new Error("HTTP " + res.status)

            let document = new HtmlDocument(res.body)
            let comments = []
            for (let article of document.querySelectorAll('article.message--post')) {
                let userName = article.attributes['data-author']
                    || article.querySelector('.message-name .username')?.text
                    || 'Unknown'

                let avatarEl = article.querySelector('.message-avatar img')
                let avatar = avatarEl?.attributes['src'] || null
                if (avatar && avatar.startsWith('/')) {
                    avatar = 'https://forums.mangadex.org' + avatar
                }

                let timeEl = article.querySelector('.message-attribution-main time')
                let time = timeEl?.text?.trim() || timeEl?.attributes['datetime'] || ''

                let contentEl = article.querySelector('.message-userContent .bbWrapper')
                    || article.querySelector('.message-userContent')
                let content = this._cleanCommentHtml(contentEl ? contentEl.innerHTML : '')

                // data-content is like "post-12345" → use the numeric id.
                let id = (article.attributes['data-content'] || '').replace('post-', '')
                    || String(comments.length + 1)

                comments.push(new Comment({
                    id: id,
                    userName: userName,
                    avatar: avatar,
                    content: content,
                    time: time,
                }))
            }

            // Pagination: the highest page number in the XenForo page navigation.
            let maxPage = page || 1
            for (let a of document.querySelectorAll('.pageNav-main .pageNav-page a')) {
                let n = parseInt((a.text || '').trim(), 10)
                if (!isNaN(n) && n > maxPage) {
                    maxPage = n
                }
            }
            document.dispose()

            return {
                comments: comments,
                maxPage: maxPage,
            }
        },
        /**
         * [Optional] send a comment, return any value to indicate success
         * @param comicId {string}
         * @param subId {string?} - ComicDetails.subId
         * @param content {string}
         * @param replyTo {string?} - commentId to reply, not null when reply to a comment
         * @returns {Promise<any>}
         */
        sendComment: async (comicId, subId, content, replyTo) => {
            throw new Error("Not implemented")
        },
        /**
         * [Optional] Handle tag click event
         * @param namespace {string}
         * @param tag {string}
         * @returns {PageJumpTarget}
         */
        onThumbnailLoad: (imageKey) => {
            return {
                headers: {
                    'Referer': 'https://mangadex.org/',
                    'Sec-Fetch-Dest': 'image',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'same-origin',
                }
            }
        },
        onClickTag: (namespace, tag) => {
            let keyword
            if (namespace === "Genres" || namespace === "Themes" || namespace === "Tags") {
                keyword = `tag:${tag.replaceAll(' ', '_')}`
            } else if (namespace === "Authors") {
                keyword = `author:${tag.replaceAll(' ', '_')}`
            } else if (namespace === "Artists") {
                keyword = `artist:${tag.replaceAll(' ', '_')}`
            } else {
                // Content (rating/warnings), Demographic, Status, Format and
                // Alternative Titles are informational only — not clickable.
                return null
            }
            return {
                page: "search",
                attributes: {
                    'keyword': keyword,
                },
            }
        },

        // ========== 新增：链接解析跳转（支持 mangadex.org） ==========
        link: {
            domains: [
                'mangadex.org',
                // 可扩展，但通常 www.mangadex.org 也指向同一站点，linkToId 不依赖域名
            ],
            linkToId: (url) => {
                // 匹配 /title/{uuid} 格式
                let match = url.match(/\/title\/([0-9a-f-]+)/);
                return match ? match[1] : null;
            }
        }
    }

    settings = {
        favoritesOrder: {
            title: "收藏排序方式",
            type: "select",
            options: [
                { value: 'updated', text: '最近更新' },
                { value: 'title', text: '标题' },
            ],
            default: 'updated',
        },
    }

    // [Optional] translations for the strings in this config
    translation = {
        'zh_CN': {},
        'zh_TW': {},
        'en': {}
    }

    tags = {"Oneshot":"0234a31e-a729-4e28-9d6a-3f87c4966b9e","Thriller":"07251805-a27e-4d59-b488-f0bfbec15168","Award Winning":"0a39b5a1-b235-4886-a747-1d05d216532d","Reincarnation":"0bc90acb-ccc1-44ca-a34a-b9f3a73259d0","Sci-Fi":"256c8bd9-4904-4360-bf4f-508a76d67183","Time Travel":"292e862b-2d17-4062-90a2-0356caa4ae27","Genderswap":"2bd2e8d0-f146-434a-9b51-fc9ff2c5fe6a","Loli":"2d1f5d56-a1e5-4d0d-a961-2193588b08ec","Traditional Games":"31932a7e-5b8e-49a6-9f12-2afa39dc544c","Official Colored":"320831a8-4026-470b-94f6-8353740e6f04","Historical":"33771934-028e-4cb3-8744-691e866a923e","Monsters":"36fd93ea-e8b8-445e-b836-358f02b3d33d","Action":"391b0423-d847-456f-aff0-8b0cfc03066b","Demons":"39730448-9a5f-48a2-85b0-a70db87b1233","Psychological":"3b60b75c-a2d7-4860-ab56-05f391bb889c","Ghosts":"3bb26d85-09d5-4d2e-880c-c34b974339e9","Animals":"3de8c75d-8ee3-48ff-98ee-e20a65c86451","Long Strip":"3e2b8dae-350e-4ab8-a8ce-016e844b9f0d","Romance":"423e2eae-a7a2-4a8b-ac03-a8351462d71d","Ninja":"489dd859-9b61-4c37-af75-5b18e88daafc","Comedy":"4d32cc48-9f00-4cca-9b5a-a839f0764984","Mecha":"50880a9d-5440-4732-9afb-8f457127e836","Anthology":"51d83883-4103-437c-b4b1-731cb73d786c","Boys' Love":"5920b825-4181-4a17-beeb-9918b0ff7a30","Incest":"5bd0e105-4481-44ca-b6e7-7544da56b1a3","Crime":"5ca48985-9a9d-4bd8-be29-80dc0303db72","Survival":"5fff9cde-849c-4d78-aab0-0d52b2ee1d25","Zombies":"631ef465-9aba-4afb-b0fc-ea10efe274a8","Reverse Harem":"65761a2a-415e-47f3-bef2-a9dababba7a6","Sports":"69964a64-2f90-4d33-beeb-f3ed2875eb4c","Superhero":"7064a261-a137-4d3a-8848-2d385de3a99c","Martial Arts":"799c202e-7daa-44eb-9cf7-8a3c0441531e","Fan Colored":"7b2ce280-79ef-4c09-9b58-12b7c23a9b78","Samurai":"81183756-1453-4c81-aa9e-f6e1b63be016","Magical Girls":"81c836c9-914a-4eca-981a-560dad663e73","Mafia":"85daba54-a71c-4554-8a28-9901a8b0afad","Adventure":"87cc87cd-a395-47af-b27a-93258283bbc6","Self-Published":"891cf039-b895-47f0-9229-bef4c96eccd4","Virtual Reality":"8c86611e-fab7-4986-9dec-d1a2f44acdd5","Office Workers":"92d6d951-ca5e-429c-ac78-451071cbf064","Video Games":"9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8","Post-Apocalyptic":"9467335a-1b83-4497-9231-765337a00b96","Sexual Violence":"97893a4c-12af-4dac-b6be-0dffb353568e","Crossdressing":"9ab53f92-3eed-4e9b-903a-917c86035ee3","Magic":"a1f53773-c69a-4ce5-8cab-fffcd90b1565","Girls' Love":"a3c67850-4684-404e-9b7f-c69850ee5da6","Harem":"aafb99c1-7f60-43fa-b75f-fc9502ce29c7","Military":"ac72833b-c4e9-4878-b9db-6c8a4a99444a","Wuxia":"acc803a4-c95a-4c22-86fc-eb6b582d82a2","Isekai":"ace04997-f6bd-436e-b261-779182193d3d","4-Koma":"b11fda93-8f1d-4bef-b2ed-8803d3173730","Doujinshi":"b13b2a48-c720-44a9-9c77-39c9979373fb","Philosophical":"b1e97889-25b4-4258-b28b-cd7f4d28ea9b","Gore":"b29d6a3d-1569-4e7a-8caf-7557bc92cd5d","Drama":"b9af3a63-f058-46de-a9a0-e0c13906197a","Medical":"c8cbe35b-1b2b-4a3f-9c37-db84c4514856","School Life":"caaa44eb-cd40-4177-b930-79d3ef2afe87","Horror":"cdad7e68-1419-41dd-bdce-27753074a640","Fantasy":"cdc58593-87dd-415e-bbc0-2ec27bf404cc","Villainess":"d14322ac-4d6f-4e9b-afd9-629d5f4d8a41","Vampires":"d7d1730f-6eb0-4ba6-9437-602cac38664c","Delinquents":"da2d50ca-3018-4cc0-ac7a-6b7d472a29ea","Monster Girls":"dd1f77c5-dea9-4e2b-97ae-224af09caf99","Shota":"ddefd648-5140-4e5f-ba18-4eca4071d19b","Police":"df33b754-73a3-4c54-80e6-1a74a8058539","Web Comic":"e197df38-d0e7-43b5-9b09-2842d0c326dd","Slice of Life":"e5301a23-ebd9-49dd-a0cb-2add944c7fe9","Aliens":"e64f6742-c834-471d-8d72-dd51fc02b835","Cooking":"ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869","Supernatural":"eabc5b4c-6aff-42f3-b657-3e90cbd00b75","Mystery":"ee968100-4191-4968-93d3-f82d72be7e46","Adaptation":"f4122d1c-3b44-44d0-9936-ff7502c39ad3","Music":"f42fbf9e-188a-447b-9fdc-f19dc1e4d685","Full Color":"f5ba408b-0e7a-484d-8d49-4e9125ac96de","Tragedy":"f8f62932-27da-4fe4-8ee1-6779a8c5edba","Gyaru":"fad12b5e-68ba-460e-b933-9ae8318f5b65"}

    // [authors] and [artists] are dynamic map
    authors = {}
    artists = {}
}