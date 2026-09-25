/** @type {import('./_venera_.js')} */

class YandeRe extends ComicSource {
    name = "yande.re"
    key = "yandere"
    version = "4.9.3"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/yandere.js"

    base = "https://yande.re"

    _imageCache = {}
    _comicCache = {}

    static fallbackTags = [
        "tagme", "seifuku", "thighhighs", "animal_ears",
        "swimsuits", "pantsu", "no_bra", "cleavage",
        "yukata", "lingerie", "wet", "cosplay",
    ]

    headers() {
        return {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": this._getLocaleHeader(),
            "Referer": this.base + "/",
        }
    }

    _getLocaleHeader() {
        let locale = this.loadSetting("locale") || "zh_CN"
        switch (locale) {
            case "en": return "en-US,en;q=0.9"
            case "ja": return "ja-JP,ja;q=0.9"
            case "zh_CN": return "zh-CN,zh;q=0.9,en;q=0.8"
            case "zh_TW": return "zh-TW,zh;q=0.9,en;q=0.8"
            case "de": return "de-DE,de;q=0.9,en;q=0.8"
            case "es": return "es-ES,es;q=0.9,en;q=0.8"
            case "ru": return "ru-RU,ru;q=0.9,en;q=0.8"
            default: return "zh-CN,zh;q=0.9,en;q=0.8"
        }
    }

    // 给 URL 加上 locale 参数（yande.re 用 ?locale=xx 控制界面语言）
    _withLocale(url) {
        if (!url) return url
        let locale = this.loadSetting("locale") || "zh_CN"
        if (url.indexOf("locale=") !== -1) return url
        return url + (url.indexOf("?") !== -1 ? "&" : "?") + "locale=" + encodeURIComponent(locale)
    }

    _getText(el) {
        if (!el) return ""
        try {
            if (typeof el.text === "string") return el.text.trim()
            if (typeof el.textContent === "string") return el.textContent.trim()
            if (typeof el.innerHTML === "string") {
                return el.innerHTML.replace(/<[^>]*>/g, "").trim()
            }
        } catch (e) {}
        return ""
    }

    _toBool(v) {
        if (v === undefined || v === null) return false
        if (typeof v === "boolean") return v
        if (typeof v === "number") return v !== 0
        let s = String(v).trim().toLowerCase()
        return s === "true" || s === "1" || s === "yes" || s === "on"
    }

    _hideExplicit() { return this._toBool(this.loadSetting("hide_explicit")) }
    _hideQuestionable() { return this._toBool(this.loadSetting("hide_questionable")) }
    _useSearchWildcard() { return this._toBool(this.loadSetting("search_wildcard")) }

    _shouldHideRating(rating) {
        if (!rating) return false
        let r = String(rating).toLowerCase()
        if (r === "e" || r === "explicit") return this._hideExplicit()
        if (r === "q" || r === "questionable") return this._hideQuestionable()
        return false
    }

    _applyWildcard(keyword) {
        if (!keyword) return keyword
        let tags = String(keyword).trim().split(/\s+/).filter(Boolean)
        let result = []
        for (let tag of tags) {
            if (tag.startsWith("-") || tag.indexOf(":") >= 0) {
                result.push(tag); continue
            }
            let t = tag
            if (!t.startsWith("*")) t = "*" + t
            if (!t.endsWith("*")) t = t + "*"
            result.push(t)
        }
        return result.join(" ")
    }

    // 去掉 Venera 传入的 option 值两端的引号
    _cleanOption(v, def) {
        if (v === undefined || v === null) return def
        let s = String(v).trim()
        if (s.startsWith('"') && s.endsWith('"')) s = s.substring(1, s.length - 1)
        if (!s) return def
        return s
    }

    _buildTagString(baseTags) {
        let parts = []
        if (baseTags) parts.push(baseTags)
        if (this._hideExplicit()) parts.push("-rating:explicit")
        if (this._hideQuestionable()) parts.push("-rating:questionable")
        return parts.join(" ")
    }

    _buildPostUrl(baseTags, page) {
        let tagsStr = this._buildTagString(baseTags)
        let url
        if (tagsStr) {
            url = this.base + "/post?tags=" + encodeURIComponent(tagsStr).replace(/%20/g, "+")
            if (page && page > 1) url += "&page=" + page
        } else {
            url = this.base + "/post"
            if (page && page > 1) url += "?page=" + page
        }
        return this._withLocale(url)
    }

    // ============ 登录状态检测 ============

    async _isLoggedIn() {
        try {
            let res = await Network.get(this._withLocale(this.base + "/user/home"), this.headers())
            if (res.status !== 200) return false
            let htmlMatch = res.body.match(/<html class="([^"]*)"/)
            let htmlClass = htmlMatch ? htmlMatch[1] : ""
            return htmlClass.indexOf("action-user-login") === -1 &&
                   (res.body.indexOf("My Account") !== -1 ||
                    res.body.indexOf("My Profile") !== -1 ||
                    res.body.indexOf("我的账户") !== -1)
        } catch (e) {
            return false
        }
    }

    // ============ 热门标签缓存 ============

    _getHotTags() {
        let cached = this.loadData("_hot_tags")
        if (cached) {
            try {
                let obj = JSON.parse(cached)
                if (Array.isArray(obj)) return obj
                if (obj && Array.isArray(obj.tags)) return obj.tags
            } catch (e) {}
        }
        return []
    }

    init() {
        let needRefresh = true
        let cached = this.loadData("_hot_tags")
        if (cached) {
            try {
                let obj = JSON.parse(cached)
                if (obj && obj.t && Array.isArray(obj.tags)) {
                    if (Date.now() - obj.t < 24 * 3600 * 1000) needRefresh = false
                }
            } catch (e) {}
        }
        if (needRefresh) this._refreshHotTags()
    }

    async _refreshHotTags() {
        try {
            let url = this._withLocale(this.base + "/tag?order=count")
            let res = await Network.get(url, this.headers())
            if (res.status !== 200) return
            let doc = new HtmlDocument(res.body)
            let tags = []
            let rows = doc.querySelectorAll("table.highlightable tbody tr")
            if (!rows || rows.length === 0) rows = doc.querySelectorAll("table tr")
            if (!rows || rows.length === 0) { doc.dispose(); return }
            for (let tr of rows) {
                let countTd = tr.querySelector("td:nth-child(1)")
                if (!countTd) continue
                let count = parseInt(this._getText(countTd)) || 0
                if (count < 10) continue
                let nameTd = tr.querySelector("td:nth-child(2)")
                if (!nameTd) continue
                let links = nameTd.querySelectorAll("a")
                if (!links || links.length === 0) continue
                let name = ""
                for (let a of links) {
                    let t = this._getText(a)
                    if (t && t !== "?") { name = t; break }
                }
                if (!name) continue
                tags.push({ name: name, count: count })
            }
            doc.dispose()
            if (tags.length > 0) {
                this.saveData("_hot_tags", JSON.stringify({ t: Date.now(), tags: tags }))
            }
        } catch (e) {
            console.error("yande.re 热门标签加载失败:", e)
        }
    }

    // ============ 公共解析 ============

    parsePostList(body) {
        let doc = new HtmlDocument(body)
        let comics = []
        let lis = Array.from(doc.querySelectorAll("#post-list-posts > li"))
        for (let li of lis) {
            let rawId = li.attributes.id || ""
            if (rawId.indexOf("p") !== 0) continue
            let id = rawId.substring(1)
            if (!id) continue
            let img = li.querySelector("img.preview")
            if (!img) continue
            let preview = img.attributes.src || ""
            let alt = img.attributes.alt || ""
            let directlinkEl = li.querySelector("a.directlink")
            let fileUrl = directlinkEl ? directlinkEl.attributes.href || "" : ""
            let tags = []
            let tm = alt.match(/Tags:\s*(.+?)\s+User:/)
            if (tm) tags = tm[1].split(/\s+/).filter(Boolean)
            let rating = ""
            let rm = alt.match(/Rating:\s*(\S+)/)
            if (rm) rating = rm[1]

            if (this._shouldHideRating(rating)) continue

            let author = ""
            let am = alt.match(/User:\s*(.+?)\s*$/)
            if (am) author = am[1].trim()
            let title = tags.length > 0 ? tags.slice(0, 4).join(" ") : "Post " + id
            if (fileUrl) this._imageCache[id] = fileUrl
            this._comicCache[id] = { title, tags, author, rating, cover: preview }
            comics.push(new Comic({
                id, title, subTitle: author || rating, cover: preview, tags, maxPage: 1,
            }))
        }
        doc.dispose()
        return comics
    }

    getMaxPage(body, p) {
        let lm = body.match(/<link href="[^"]*[?&]page=(\d+)[^"]*" rel="last"/)
        if (lm) return parseInt(lm[1]) || p
        return p
    }

    explore = [
        {
            title: "yande.re",
            type: "multiPageComicList",
            load: async (page) => {
                let p = page || 1
                let url = this._buildPostUrl("", p)
                let res = await Network.get(url, this.headers())
                if (res.status !== 200) throw "HTTP " + res.status
                let comics = this.parsePostList(res.body)
                return { comics: comics, maxPage: this.getMaxPage(res.body, p) }
            },
        },
    ]

    category = {
        title: "yande.re",
        parts: [
            {
                name: "热门标签",
                type: "dynamic",
                loader: () => {
                    let tags = this._getHotTags()
                    let items = []
                    if (tags.length === 0) {
                        for (let name of YandeRe.fallbackTags) {
                            items.push({
                                label: name,
                                target: {
                                    page: "category",
                                    attributes: { category: "tag_search", param: name },
                                },
                            })
                        }
                    } else {
                        for (let t of tags) {
                            items.push({
                                label: t.name + " (" + t.count + ")",
                                target: {
                                    page: "category",
                                    attributes: { category: "tag_search", param: t.name },
                                },
                            })
                        }
                    }
                    return items
                },
            },
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let p = page || 1
            if (!param) return { comics: [], maxPage: p }
            let url = this._buildPostUrl(param, p)
            let res = await Network.get(url, this.headers())
            if (res.status !== 200) throw "HTTP " + res.status
            let comics = this.parsePostList(res.body)
            let maxPage = this.getMaxPage(res.body, p)
            return { comics: comics, maxPage: maxPage }
        },
    }

    // ============ 搜索（含作者 + 评级筛选） ============
    //
    // yande.re 支持三种评级：
    //   rating:safe          / rating:s  → Safe
    //   rating:questionable  / rating:q  → Questionable（擦边）
    //   rating:explicit      / rating:e  → Explicit（R-18）
    //
    // 注意：当用户在搜索里显式选了一个评级，则**不再叠加**设置里的屏蔽规则。
    // 否则勾了「屏蔽 Explicit」又选「仅 Explicit」会搜不到东西。

    search = {
        load: async (keyword, options, page) => {
            let p = page || 1
            if (!keyword) return { comics: [], maxPage: p }

            let target = this._cleanOption(options && options[0], "tag")
            let rating = this._cleanOption(options && options[1], "all")
            let trimmed = String(keyword).trim().replace(/\s+/g, " ")

            let tagsParts = []

            // 搜索目标：标签 / 作者
            if (target === "artist") {
                tagsParts.push("user:" + trimmed)
            } else {
                let finalKeyword = this._useSearchWildcard()
                    ? this._applyWildcard(trimmed)
                    : trimmed
                tagsParts.push(finalKeyword)
            }

            // 评级筛选
            if (rating === "s") tagsParts.push("rating:safe")
            else if (rating === "q") tagsParts.push("rating:questionable")
            else if (rating === "e") tagsParts.push("rating:explicit")

            let tagsStr = tagsParts.join(" ")
            console.log("yande.re 搜索: [" + trimmed + "] target=" + target +
                        " rating=" + rating + " → [" + tagsStr + "]")

            let url
            if (rating === "all") {
                // 未指定评级，走默认 URL 构造（会叠加屏蔽规则）
                url = this._buildPostUrl(tagsStr, p)
            } else {
                // 指定了评级，绕过屏蔽规则
                url = this.base + "/post?tags=" +
                      encodeURIComponent(tagsStr).replace(/%20/g, "+")
                if (p > 1) url += "&page=" + p
                url = this._withLocale(url)
            }

            let res = await Network.get(url, this.headers())
            if (res.status !== 200) throw "HTTP " + res.status
            let comics = this.parsePostList(res.body)
            let maxPage = this.getMaxPage(res.body, p)
            return { comics: comics, maxPage: maxPage }
        },

        optionList: [
            {
                type: "select",
                options: [
                    "tag-标签",
                    "artist-作者"
                ],
                label: "搜索目标", default: "tag"
            },
            {
                type: "select",
                options: [
                    "all-全部",
                    "s-仅 Safe",
                    "q-仅 Questionable",
                    "e-仅 Explicit"
                ],
                label: "评级", default: "all"
            },
        ],

        enableTagsSuggestions: false,
        onTagSuggestionSelected: (namespace, tag) => tag,
    }

    // ============ 账号 ============

    account = {
        loginWithWebview: {
            url: this.base + "/user/login",
            checkStatus: (url, title) => {
                if (!url.includes("yande.re")) return false
                if (url.includes("/user/login")) return false
                if (url.includes("/user/authenticate")) return false
                return url.includes("/user/home")
                    || url.includes("/post")
                    || url === "https://yande.re/"
            },
            onLoginSuccess: () => {
                this.deleteData("_fav_username")
                console.log("yande.re WebView 登录成功，session 已保存到 jar")
            },
        },

        login: async (username, password) => {
            if (!username || !password) throw "请填写用户名和密码"
            let loginPage = await Network.get(
                this._withLocale(this.base + "/user/login"),
                this.headers()
            )
            if (loginPage.status !== 200) throw "无法访问登录页：" + loginPage.status

            let tokenMatch = loginPage.body.match(/name="authenticity_token"[^>]*value="([^"]+)"/)
            if (!tokenMatch) throw "无法获取 CSRF token"
            let authenticityToken = tokenMatch[1]

            let body =
                "authenticity_token=" + encodeURIComponent(authenticityToken) +
                "&user%5Bname%5D=" + encodeURIComponent(username) +
                "&user%5Bpassword%5D=" + encodeURIComponent(password) +
                "&url=&commit=Login"

            let res = await Network.post(
                this._withLocale(this.base + "/user/authenticate"),
                {
                    ...this.headers(),
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": this._withLocale(this.base + "/user/login"),
                    "Origin": this.base,
                },
                body
            )

            if (res.status === 302 || res.status === 200) {
                this.deleteData("_fav_username")
                console.log("yande.re 账号登录成功，session 已保存到 jar")

                // 登录后立即校验
                let check = await Network.get(
                    this._withLocale(this.base + "/user/home"),
                    this.headers()
                )
                if (check.status !== 200 ||
                    (check.body.indexOf("My Account") === -1 &&
                     check.body.indexOf("My Profile") === -1 &&
                     check.body.indexOf("我的账户") === -1)) {
                    throw "登录似乎未生效，请重试"
                }
                return "ok"
            }
            throw "登录失败：状态码 " + res.status
        },

        logout: () => {
            Network.deleteCookies("https://yande.re")
            Network.deleteCookies("https://yande.re/")
            Network.deleteCookies(this.base)
            this.deleteData("_fav_username")
            console.log("yande.re 已登出，清空 jar 里的 cookie")
        },

        registerWebsite: "https://yande.re/user/signup",
    }

    // ============ 收藏夹 ============

    _sanitizeUsername(input) {
        if (!input) return ""
        let name = String(input).trim()
        try { name = decodeURIComponent(name) } catch (e) {}
        while (/^vote:3:/i.test(name)) name = name.substring(7)
        name = name.replace(/[+\s]+order:vote\s*$/i, "")
        return name.trim()
    }

    _extractUsernameFromHtml(html) {
        let patterns = [
            /vote%3A3%3A([^"&+<>\s]+)/i,
            /vote:3:([^"&+<>\s]+)/i,
        ]
        for (let p of patterns) {
            let m = html.match(p)
            if (m && m[1]) {
                let name = m[1]
                try { name = decodeURIComponent(name) } catch (e) {}
                name = name.replace(/[+\s]+order:vote.*$/i, "").trim()
                name = name.replace(/^vote:3:/i, "")
                if (name) return name
            }
        }
        return null
    }

    _getFavoriteUsername() {
        let setting = this.loadSetting("fav_username")
        if (setting && setting.trim()) {
            let name = this._sanitizeUsername(setting)
            if (name) return name
        }
        let cached = this.loadData("_fav_username")
        if (cached) return cached
        return null
    }

    async _detectFavoriteUsername() {
        let setting = this.loadSetting("fav_username")
        if (setting && setting.trim()) {
            let name = this._sanitizeUsername(setting)
            if (name) return name
        }
        let cached = this.loadData("_fav_username")
        if (cached) return cached

        let urls = ["/user/home", "/post", "/"]
        for (let u of urls) {
            try {
                let res = await Network.get(this._withLocale(this.base + u), this.headers())
                if (res.status !== 200) continue
                let name = this._extractUsernameFromHtml(res.body)
                if (name) {
                    this.saveData("_fav_username", name)
                    console.log("yande.re 自动检测到收藏夹用户名: " + name)
                    return name
                }
            } catch (e) {}
        }
        return null
    }

    favorites = {
        multiFolder: false,
        singleFolderForSingleComic: true,

        loadFolders: async (comicId) => {
            let folders = new Map()
            folders.set("default", "我的收藏")
            let favorited = []
            if (comicId) {
                try {
                    let res = await Network.get(
                        this._withLocale(this.base + "/post/show/" + comicId),
                        this.headers()
                    )
                    if (res.status === 200) {
                        let username = this._getFavoriteUsername()
                        if (username && res.body.indexOf("vote:3:" + username) !== -1) {
                            favorited.push("default")
                        }
                    }
                } catch (e) {}
            }
            return { folders, favorited }
        },

        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            return await this._voteComic(comicId, isAdding)
        },

        loadComics: async (page, folder) => {
            let username = this._getFavoriteUsername()
            if (!username) {
                username = await this._detectFavoriteUsername()
            }
            if (!username) {
                throw "未检测到收藏夹用户名，请在设置中填写「收藏夹用户名」"
            }

            let p = page || 1
            let baseTags = "vote:3:" + username + " order:vote"
            let parts = [baseTags]
            if (this._hideExplicit()) parts.push("-rating:explicit")
            if (this._hideQuestionable()) parts.push("-rating:questionable")
            let tagsStr = parts.join(" ")
            let url = this.base + "/post?tags=" + encodeURIComponent(tagsStr).replace(/%20/g, "+")
            if (p > 1) url += "&page=" + p
            url = this._withLocale(url)

            let res = await Network.get(url, this.headers())
            if (res.status !== 200) throw "HTTP " + res.status

            let comics = this.parsePostList(res.body)
            let maxPage = this.getMaxPage(res.body, p)
            return { comics: comics, maxPage: maxPage }
        },
    }

    // ============ 投票核心（只通过 html class 判断成败） ============

    async _voteComic(comicId, isAdding) {
        console.log("===== 投票开始 =====")

        // 1. 一次 GET 详情页：拿 csrf-token，同时让 jar 里的 session 刷新
        let detailUrl = this._withLocale(this.base + "/post/show/" + comicId)
        let res1 = await Network.get(detailUrl, this.headers())
        if (res1.status !== 200) throw "无法获取详情页: HTTP " + res1.status

        let body = res1.body || ""

        // 2. 登录状态：看 html class 是否 action-user-login
        let loginHtmlMatch = body.match(/<html class="([^"]*)"/)
        let loginHtmlClass = loginHtmlMatch ? loginHtmlMatch[1] : ""
        let isLoginPage = loginHtmlClass.indexOf("action-user-login") !== -1
        let loggedIn = !isLoginPage
        console.log("[1] 登录状态: " + loggedIn + " (html class: " + loginHtmlClass + ")")
        if (!loggedIn) {
            throw "请先登录 yande.re 账号。请在设置中登录，或通过 WebView 登录。"
        }

        // 3. 优先取 meta 里的 csrf-token
        let m = body.match(/<meta name="csrf-token"\s+content="([^"]+)"/)
        if (!m) m = body.match(/<form[^>]*id="edit-form"[^>]*>[\s\S]*?name="authenticity_token"[^>]*value="([^"]+)"/)
        if (!m) m = body.match(/name="authenticity_token"[^>]*value="([^"]+)"/)
        if (!m) throw "未找到 authenticity_token"
        let token = m[1]
        console.log("[2] token 长度: " + token.length)

        // 4. POST /post/vote（Venera 会自动把 jar 里的 cookie 塞进来）
        let score = isAdding ? 3 : 0
        let postBody = "id=" + comicId +
                       "&score=" + score +
                       "&authenticity_token=" + encodeURIComponent(token)

        let headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": this._getLocaleHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
            "X-CSRF-Token": token,
            "X-Requested-With": "XMLHttpRequest",
            "Referer": detailUrl,
            "Origin": this.base,
        }

        let res = await Network.post(
            this._withLocale(this.base + "/post/vote"),
            headers,
            postBody
        )

        console.log("[3] POST status: " + res.status)
        if (res.status !== 200 && res.status !== 302) {
            throw "投票失败: HTTP " + res.status
        }

        // 5. 只看响应开头的 <html class="...">
        let respHtmlMatch = (res.body || "").match(/<html class="([^"]*)"/)
        let respHtmlClass = respHtmlMatch ? respHtmlMatch[1] : ""
        console.log("[4] 响应 html class: [" + respHtmlClass + "]")

        if (respHtmlClass.indexOf("action-user-login") !== -1) {
            throw "投票被拒绝（session 失效），请重新登录后再试。"
        }
        if (!respHtmlClass) {
            let preview = res.body ? String(res.body).substring(0, 200) : "(空)"
            console.log("[!] 响应无 html class，预览: " + preview)
            throw "投票响应异常，无法确认结果。"
        }

        console.log("[5] 投票成功 (score=" + score + ")")
        return "ok"
    }

    // ============ 详情 ============

    _checkIsVotedInBody(body, postId) {
        let resp = this.extractJsonAfter(body, "Post.register_resp(")
        if (!resp) return false
        let votes = resp.votes
        if (!votes || typeof votes !== "object") return false
        let key = String(postId)
        if (votes[key] === undefined || votes[key] === null) return false
        return Number(votes[key]) === 3
    }

    extractJsonAfter(body, marker) {
        let idx = body.indexOf(marker)
        if (idx < 0) return null
        let start = idx + marker.length
        while (start < body.length && body[start] !== "{") start++
        if (start >= body.length) return null
        let depth = 0, inStr = false, escape = false
        for (let i = start; i < body.length; i++) {
            let c = body[i]
            if (inStr) {
                if (escape) escape = false
                else if (c === "\\") escape = true
                else if (c === '"') inStr = false
            } else {
                if (c === '"') inStr = true
                else if (c === "{") depth++
                else if (c === "}") {
                    depth--
                    if (depth === 0) {
                        try { return JSON.parse(body.substring(start, i + 1)) }
                        catch (e) { return null }
                    }
                }
            }
        }
        return null
    }

    extractPostInfo(body) {
        let resp = this.extractJsonAfter(body, "Post.register_resp(")
        if (resp && Array.isArray(resp.posts) && resp.posts.length > 0) return resp.posts[0]
        let info = this.extractJsonAfter(body, "Post.register(")
        if (info && info.id) return info
        return null
    }

    comic = {
        idMatch: "^\\d+$",

        loadInfo: async (id) => {
            let url = this._withLocale(this.base + "/post/show/" + id)
            let res = await Network.get(url, this.headers())
            if (res.status !== 200) throw "HTTP " + res.status
            let body = res.body
            let tags = [], author = "", rating = "", source = "", cover = "", fileUrl = ""
            let score = 0
            let info = this.extractPostInfo(body)
            if (info) {
                if (info.tags) tags = String(info.tags).split(/\s+/).filter(Boolean)
                if (info.author) author = info.author
                if (info.rating) rating = info.rating
                if (info.source) source = info.source
                if (info.file_url) fileUrl = info.file_url
                else if (info.jpeg_url) fileUrl = info.jpeg_url
                if (info.preview_url) cover = info.preview_url
                if (info.score !== undefined && info.score !== null) score = Number(info.score) || 0
                if (info.id) id = String(info.id)
            }

            if (this._shouldHideRating(rating)) {
                throw "该内容已被屏蔽（评级：" + rating + "）"
            }

            if (!cover) {
                let om = body.match(/<meta property="og:image" content="([^"]+)"/)
                if (om) cover = om[1]
            }
            if (!fileUrl) {
                let m = body.match(/<a[^>]*id="png"[^>]*href="([^"]+)"/)
                if (m) fileUrl = m[1]
            }
            if (!fileUrl) {
                let m = body.match(/<a[^>]*id="highres"[^>]*href="([^"]+)"/)
                if (m) fileUrl = m[1]
            }
            if (!fileUrl) {
                let m = body.match(/<img[^>]*id="image"[^>]*src="([^"]+)"/)
                if (m) fileUrl = m[1]
            }
            if (fileUrl) this._imageCache[id] = fileUrl
            let cached = this._comicCache[id]
            let titleText
            if (cached && cached.title) {
                titleText = cached.title
                if (tags.length === 0 && cached.tags) tags = cached.tags
                if (!author && cached.author) author = cached.author
                if (!rating && cached.rating) rating = cached.rating
                if (!cover && cached.cover) cover = cached.cover
            } else {
                titleText = tags.length > 0 ? tags.slice(0, 5).join(" ") : "Post " + id
            }
            let tagsObj = {}
            if (tags.length > 0) tagsObj["Tags"] = tags
            if (author) tagsObj["Author"] = [author]
            let descParts = []
            if (rating) descParts.push("Rating: " + rating)
            if (source) descParts.push("Source: " + source)

            let isLiked = this._checkIsVotedInBody(body, id)

            return new ComicDetails({
                title: titleText,
                subtitle: author,
                subTitle: author,
                cover: cover,
                description: descParts.join("\n"),
                tags: tagsObj,
                chapters: { "0": "Image" },
                url: this.base + "/post/show/" + id,
                maxPage: 1,
                isLiked: isLiked,
                likesCount: score,
            })
        },

        loadEp: async (comicId, epId) => {
            let cached = this._imageCache[comicId]
            if (cached) return { images: [cached] }
            let url = this._withLocale(this.base + "/post/show/" + comicId)
            let res = await Network.get(url, this.headers())
            if (res.status !== 200) throw "HTTP " + res.status
            let body = res.body
            let fileUrl = ""
            let info = this.extractPostInfo(body)
            if (info) {
                if (info.rating && this._shouldHideRating(info.rating)) {
                    throw "该内容已被屏蔽"
                }
                if (info.file_url) fileUrl = info.file_url
                else if (info.jpeg_url) fileUrl = info.jpeg_url
            }
            if (!fileUrl) {
                let m = body.match(/<a[^>]*id="png"[^>]*href="([^"]+)"/)
                if (m) fileUrl = m[1]
            }
            if (!fileUrl) {
                let m = body.match(/<a[^>]*id="highres"[^>]*href="([^"]+)"/)
                if (m) fileUrl = m[1]
            }
            if (!fileUrl) {
                let m = body.match(/<img[^>]*id="image"[^>]*src="([^"]+)"/)
                if (m) fileUrl = m[1]
            }
            if (!fileUrl) throw "找不到图片"
            this._imageCache[comicId] = fileUrl
            return { images: [fileUrl] }
        },

        likeComic: async (id, isLike) => {
            // 先查一次当前投票状态，再决定 add/remove
            let url = this._withLocale(this.base + "/post/show/" + id)
            let res = await Network.get(url, this.headers())
            if (res.status !== 200) throw "HTTP " + res.status
            let currentlyVoted = this._checkIsVotedInBody(res.body, id)
            console.log("yande.re likeComic id=" + id + " 当前已投票=" + currentlyVoted)
            return await this._voteComic(id, !currentlyVoted)
        },

        // ============ 评论功能（支持翻页） ============

        loadComments: async (comicId, subId, page, replyTo) => {
            let p = page || 1
            let url = this.base + "/comment"
            let q = []
            if (p > 1) q.push("page=" + p)
            let locale = this.loadSetting("locale") || "zh_CN"
            q.push("locale=" + encodeURIComponent(locale))
            if (q.length > 0) url += "?" + q.join("&")

            let res = await Network.get(url, this.headers())
            if (res.status !== 200) throw "HTTP " + res.status

            let comments = []
            let doc = new HtmlDocument(res.body)

            // 全站评论区每条评论都包裹在 #comment-list > .post 里
            let postEls = doc.querySelectorAll("#comment-list > .post")
            for (let postEl of postEls) {
                // 被评论的帖子 ID 和链接
                let postId = ""
                let postUrl = ""
                let col2 = postEl.querySelector(".col2")
                if (col2) {
                    let m = (col2.attributes.id || "").match(/comments-for-p(\d+)/)
                    if (m) postId = m[1]
                }
                let col1a = postEl.querySelector(".col1 a")
                if (col1a) {
                    let href = col1a.attributes.href || ""
                    if (href.startsWith("/")) href = this.base + href
                    postUrl = href
                }

                let commentNodes = postEl.querySelectorAll(".response-list .comment")
                for (let node of commentNodes) {
                    // ✅ 评论者头像（注意不是 .col1 img.preview）
                    let avatarEl = node.querySelector(".comment-avatar-container img.avatar")
                    if (!avatarEl) avatarEl = node.querySelector("img.avatar")
                    let avatar = avatarEl ? avatarEl.attributes.src : undefined

                    // 评论者用户名
                    let userEl = node.querySelector(".author h6 a")
                    let userName = userEl ? this._getText(userEl) : "匿名"

                    // 评论内容
                    let contentEl = node.querySelector(".content .body")
                    let content = ""
                    if (contentEl) {
                        content = contentEl.innerHTML
                            .replace(/<br\s*\/?>/gi, "\n")
                            .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, "【图片: $1】")
                            .replace(/<[^>]*>/g, "")
                            .trim()
                    }

                    // 时间
                    let timeEl = node.querySelector(".author .date")
                    let time = timeEl ? this._getText(timeEl) : ""

                    // 评论 ID
                    let idStr = node.attributes.id || ""
                    let id = idStr.startsWith("c") ? idStr.substring(1) : undefined

                    // 附加"评论作品"信息（Markdown 链接，可点击跳转）
                    let displayContent = content
                    if (postId && postUrl) {
                        displayContent += "\n\n—— 评论作品: [#" + postId + "](" + postUrl + ")"
                    }

                    comments.push(new Comment({
                        userName: userName,
                        avatar: avatar,
                        content: displayContent,
                        time: time,
                        id: id,
                        replyCount: null,
                    }))
                }
            }

            // 解析最大页数：从 #paginator 里找到所有带 page= 参数的链接
            let maxPage = 1
            let paginator = doc.querySelector("#paginator .pagination")
            if (paginator) {
                let links = paginator.querySelectorAll("a")
                for (let link of links) {
                    let href = link.attributes.href || ""
                    let m = href.match(/[?&]page=(\d+)/)
                    if (m) {
                        let num = parseInt(m[1])
                        if (num > maxPage) maxPage = num
                    }
                }
            }
            doc.dispose()

            console.log("yande.re loadComments page=" + p + " 评论数=" + comments.length + " maxPage=" + maxPage)
            return { comments: comments, maxPage: maxPage }
        },

        sendComment: async (comicId, subId, content, replyTo) => {
            let detailUrl = this._withLocale(this.base + "/post/show/" + comicId)
            let res = await Network.get(detailUrl, this.headers())
            if (res.status !== 200) throw "无法获取详情页: HTTP " + res.status
            let body = res.body || ""

            let htmlMatch = body.match(/<html class="([^"]*)"/)
            let htmlClass = htmlMatch ? htmlMatch[1] : ""
            if (htmlClass.indexOf("action-user-login") !== -1) {
                throw "请先登录 yande.re 账号"
            }

            let tokenMatch = body.match(/<meta name="csrf-token"\s+content="([^"]+)"/)
            if (!tokenMatch) tokenMatch = body.match(/name="authenticity_token"[^>]*value="([^"]+)"/)
            if (!tokenMatch) throw "未找到 authenticity_token"
            let token = tokenMatch[1]

            let postBody = "authenticity_token=" + encodeURIComponent(token) +
                           "&comment%5Bpost_id%5D=" + encodeURIComponent(comicId) +
                           "&comment%5Bbody%5D=" + encodeURIComponent(content)

            let headers = {
                ...this.headers(),
                "Content-Type": "application/x-www-form-urlencoded",
                "X-CSRF-Token": token,
                "Referer": detailUrl,
                "Origin": this.base,
            }

            let postRes = await Network.post(
                this._withLocale(this.base + "/comment/create"),
                headers,
                postBody
            )
            if (postRes.status !== 200 && postRes.status !== 302) {
                throw "发送评论失败: HTTP " + postRes.status
            }

            let respHtmlMatch = (postRes.body || "").match(/<html class="([^"]*)"/)
            let respHtmlClass = respHtmlMatch ? respHtmlMatch[1] : ""
            if (respHtmlClass.indexOf("action-user-login") !== -1) {
                throw "发送评论被拒绝（session 失效），请重新登录"
            }

            return "ok"
        },

        likeComment: async (comicId, subId, commentId, isLike) => {},
        voteComment: async (id, subId, commentId, isUp, isCancel) => {},

        onImageLoad: (url, comicId, epId) => ({ headers: { "Referer": "https://yande.re/" } }),
        onThumbnailLoad: (url) => ({ headers: { "Referer": "https://yande.re/" } }),

        link: {
            domains: ["yande.re"],
            linkToId: (url) => {
                let m = String(url).match(/\/post\/show\/(\d+)/)
                return m ? m[1] : null
            },
        },

        onClickTag: (namespace, tag) => {
            if (namespace === 'Author') {
                return {
                    page: 'search',
                    attributes: { keyword: 'user:' + tag }
                }
            }
            return {
                page: 'search',
                attributes: { keyword: tag }
            }
        },
    }

    // ============ 设置 ============

    settings = {
        help: {
            title: "使用帮助", type: "callback", buttonText: "查看帮助",
            callback: () => {
                UI.showDialog("yande.re 使用帮助",
`【账号登录】
• 方式一：WebView 登录（推荐）。在设置里点击「登录」会自动打开 yande.re 网页，输入用户名密码登录后 session 会保存到 cookie jar 里。
• 方式二：使用「登录」按钮输入用户名和密码，脚本会自己抓 CSRF token 并 POST 登录。
• 登录后可以：投票、收藏、发评论。

【收藏功能】
• yande.re 的「收藏」本质上就是给图片投 3 星（score=3）。所以点击详情页的心形按钮，就是收藏。
• 取消收藏会投 0 分，图片会从收藏列表中消失。
• 如果收藏夹列表为空，请到设置里填写「收藏夹用户名」（即你自己的 yande.re 用户名，例如 輕小說萬歲），注意不要带 vote:3: 或 order:vote 前缀。

【屏蔽评级】
• 屏蔽 Explicit：屏蔽评级为 R-18 的帖子（默认开）。
• 屏蔽 Questionable：屏蔽擦边、内衣、轻微裸露的帖子（默认开）。
• 这两个开关会影响列表、搜索、详情页的展示。
• 注意：搜索时如果你显式选了某个评级，则不再叠加屏蔽规则。

【搜索筛选】
• 搜索目标：标签 / 作者。
  - 标签模式：搜索标签，可配合「搜索自动通配符」使用。
  - 作者模式：搜索该用户名上传的所有作品（user: 前缀）。
• 评级：全部 / 仅 Safe / 仅 Questionable / 仅 Explicit。
• 在漫画详情页点击作者标签，会自动搜索该作者的所有作品。

【评论区】
• yande.re 没有单帖评论区，只有全站评论流。
• 脚本返回的是全站评论，支持翻页（读取 #paginator 的最大页码）。
• 每条评论下方会标注「—— 评论作品: [#ID](链接)」，点击可跳转到对应作品。
• 评论者头像取自评论者自己的 avatar（https://yande.re/data/avatars/{user_id}.jpg）。
• 如果某条评论看不到头像，说明该用户没有设置头像。
• 发送评论需要先登录，脚本会自己抓 CSRF token 后 POST 到 /comment/create。

【语言设置】
• yande.re 通过 URL 参数 ?locale=xx 来控制界面语言，有效值：de/en/es/ja/ru/zh_CN/zh_TW。
• 切换到简体中文后，评论区的「日期/用户/评级/得分/引用/标记待删除/回复/发送」等文字会全部翻译。

【常见错误】
• 提示「session 失效，请重新登录」：说明 cookie 已过期，去设置里重新登录一次即可。
• 提示「HTTP 403 / 429」：可能触发了 yande.re 的限流，等待几分钟再试。
• 收藏列表里没有刚收藏的图：下拉刷新一下收藏夹页面，yande.re 有一定缓存。`,
                    [{text: "知道了", callback: () => {}}])
            }
        },
        locale: {
            title: "界面语言",
            type: "select",
            options: [
                { value: 'en', text: 'English' },
                { value: 'ja', text: '日本語' },
                { value: 'zh_CN', text: '简体中文' },
                { value: 'zh_TW', text: '繁體中文' },
                { value: 'de', text: 'Deutsch' },
                { value: 'es', text: 'español' },
                { value: 'ru', text: 'русский' },
            ],
            default: 'zh_CN',
            description: "通过 URL 参数 ?locale=xx 生效，可切换网页 UI（含评论区的日期/用户/评级/得分/引用/回复/发送等）。切换后请重新进入详情页查看。"
        },
        hide_explicit: {
            title: "屏蔽 Explicit (R-18)",
            type: "switch",
            default: true,
            description: "屏蔽评级为 Explicit（明确 18+）的帖子。默认开启。"
        },
        hide_questionable: {
            title: "屏蔽 Questionable (擦边)",
            type: "switch",
            default: true,
            description: "屏蔽评级为 Questionable（擦边、内衣、轻微裸露）的帖子。默认开启。"
        },
        search_wildcard: {
            title: "搜索自动通配符",
            type: "switch",
            default: true,
            description: "开启后，标签搜索时「merlin」会自动变成「*merlin*」。作者搜索不受影响。"
        },
        fav_username: {
            title: "收藏夹用户名",
            type: "input",
            default: "",
            description: "只填 yande.re 用户名即可（如 轻小说万岁），不要带 vote:3: 或 order:vote。留空会自动尝试检测。"
        },
    }
}