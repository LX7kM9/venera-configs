class WebtoonsZhHant extends ComicSource {
    name = "LINE WEBTOON"
    key = "webtoons_zh_hant"
    version = "1.0.1"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/webtoons_zh_hant.js"

    // ---------------- 站点常量 ----------------
    static SITE = "https://www.webtoons.com"
    static MSITE = "https://m.webtoons.com"
    static LANG = "zh-hant"
    static MIRROR = "zh-hant-hk"
    static CDN = "https://webtoon-phinf.pstatic.net"
    static PC_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    static M_UA = "Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
    static BLOCK_MARK = "无法显示此网页"
    static REGION_ERROR = "LINE WEBTOON 繁体中文站（zh-hant）在当前网络被地区限制：服务器返回「无法显示此网页」。请开启代理/VPN（使用非中国大陆节点）后重试。"
    static SEARCH_PAGE_SIZE = 20

    // 题材（证据: /zh-hant/genres 页面导航，共 23 项）
    static GENRES = [
        ["愛情", "romance"],
        ["奇幻冒險", "fantasy"],
        ["校園", "school"],
        ["劇情", "drama"],
        ["動作", "action"],
        ["驚悚", "thriller"],
        ["恐怖", "horror"],
        ["搞笑", "comedy"],
        ["生活/日常", "slice_of_life"],
        ["療癒/萌系", "heartwarming"],
        ["懸疑推理", "mystery"],
        ["穿越/轉生", "time_slip"],
        ["現代/職場", "city_office"],
        ["古代宮廷", "eastern_palace"],
        ["歐式宮廷", "western_palace"],
        ["武俠", "martial_arts"],
        ["少年", "shonen"],
        ["大人系", "romance_m"],
        ["LGBTQ+", "bl_gl"],
        ["影視化", "adaptation"],
        ["台灣原創作品", "local"],
        ["翻頁漫畫", "epub"],
        ["小說", "web_novel"]
    ]

    // 连载日程（证据: /zh-hant/originals/{day}）
    static WEEKDAYS = [
        ["週一", "monday"],
        ["週二", "tuesday"],
        ["週三", "wednesday"],
        ["週四", "thursday"],
        ["週五", "friday"],
        ["週六", "saturday"],
        ["週日", "sunday"]
    ]

    // 排行榜分页（证据: /ranking 导航）
    static RANK_TABS = [
        ["即時熱門", "trending"],
        ["人氣排行榜", "popular"],
        ["正式連載", "originals"],
        ["CANVAS", "canvas"]
    ]

    // 排行榜题材筛选（证据: /ranking/originals?subTabGenreCode=...，站点仅提供这 10 个）
    static RANK_GENRES = [
        ["愛情", "ROMANCE"],
        ["奇幻冒險", "FANTASY"],
        ["校園", "SCHOOL"],
        ["劇情", "DRAMA"],
        ["影視化", "ADAPTATION"],
        ["歐式宮廷", "WESTERN_PALACE"],
        ["台灣原創作品", "LOCAL"],
        ["武俠", "MARTIAL_ARTS"],
        ["LGBTQ+", "BL_GL"],
        ["大人系", "ROMANCE_M"]
    ]

    // 直连被拦截时优先走镜像；成功访问 zh-hant 后会复位
    _preferMirror = false

    init() {
        this._preferMirror = false
    }

    // ---------------- 请求头 ----------------
    pcHeaders(extra) {
        const h = {
            "User-Agent": WebtoonsZhHant.PC_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-TW,zh;q=0.9",
            "Referer": WebtoonsZhHant.SITE + "/" + WebtoonsZhHant.LANG + "/"
        }
        if (extra) { for (const k in extra) { h[k] = extra[k] } }
        return h
    }

    mHeaders(extra) {
        const h = {
            "User-Agent": WebtoonsZhHant.M_UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-TW,zh;q=0.9",
            "Referer": WebtoonsZhHant.SITE + "/" + WebtoonsZhHant.LANG + "/"
        }
        if (extra) { for (const k in extra) { h[k] = extra[k] } }
        return h
    }

    // ---------------- 地区拦截识别 ----------------
    isBlockedPage(body) {
        if (!body) return true
        const s = String(body)
        if (s.length < 4000 && s.indexOf(WebtoonsZhHant.BLOCK_MARK) >= 0) return true
        return false
    }

    zoneOrder() {
        return this._preferMirror
            ? [WebtoonsZhHant.MIRROR, WebtoonsZhHant.LANG]
            : [WebtoonsZhHant.LANG, WebtoonsZhHant.MIRROR]
    }

    zonePath(path) {
        let p = String(path == null ? "" : path).trim()
        if (!p) return "/"
        if (p.charAt(0) !== "/") p = "/" + p
        const m = p.match(/^\/(?:zh-hant|zh-hant-hk)(?=\/|$)/)
        if (m) p = p.substring(m[0].length)
        if (!p) return "/"
        if (p.charAt(0) !== "/") p = "/" + p
        return p
    }

    async fetchHtml(path, extraHeaders) {
        let lastError = ""
        for (const zone of this.zoneOrder()) {
            const url = WebtoonsZhHant.SITE + "/" + zone + this.zonePath(path)
            try {
                const res = await Network.get(url, this.pcHeaders(extraHeaders))
                if (res.status !== 200) {
                    lastError = "HTTP " + res.status + " @ /" + zone + this.zonePath(path)
                    continue
                }
                if (this.isBlockedPage(res.body)) {
                    if (zone === WebtoonsZhHant.LANG) { this._preferMirror = true }
                    lastError = "地区拦截页(无法显示此网页) @ /" + zone
                    continue
                }
                if (zone === WebtoonsZhHant.LANG) { this._preferMirror = false }
                return res.body
            } catch (e) {
                lastError = String((e && e.message) || e)
            }
        }
        throw WebtoonsZhHant.REGION_ERROR + "（最后错误：" + lastError + "）"
    }

    async fetchJson(url, extraHeaders) {
        const res = await Network.get(url, this.mHeaders(extraHeaders))
        if (res.status !== 200) { throw "Invalid status code: " + res.status }
        if (this.isBlockedPage(res.body)) { throw WebtoonsZhHant.REGION_ERROR }
        try { return JSON.parse(res.body) } catch (e) { return null }
    }

    async fetchSearchJson(queryString) {
        let lastError = ""
        for (const zone of this.zoneOrder()) {
            const url = WebtoonsZhHant.MSITE + "/" + zone + "/search/result?" + queryString
            try {
                const json = await this.fetchJson(url)
                if (json && json.result) {
                    if (zone === WebtoonsZhHant.LANG) { this._preferMirror = false }
                    return json
                }
                lastError = "empty json"
            } catch (e) {
                if (zone === WebtoonsZhHant.LANG) { this._preferMirror = true }
                lastError = String((e && e.message) || e)
            }
        }
        throw lastError
    }

    // ---------------- URL / ID 工具 ----------------
    cdnUrl(u) {
        if (!u) return ""
        let s = String(u).trim()
        if (s.indexOf("//") === 0) { s = "https:" + s }
        if (s.indexOf("http://") === 0) { s = "https://" + s.substring(7) }
        if (s.indexOf("http") === 0) return s
        if (s.charAt(0) === "/") return WebtoonsZhHant.CDN + s
        return WebtoonsZhHant.CDN + "/" + s
    }

    titleNoOf(text) {
        const s = String(text == null ? "" : text).trim()
        let m = s.match(/title[_\-]?no[=\/](\d+)/i)
        if (m) return m[1]
        m = s.match(/^(\d{2,9})(?:[\|:;].*)?$/)
        if (m) return m[1]
        return ""
    }

    episodeNoOf(text) {
        const s = String(text == null ? "" : text).trim()
        let m = s.match(/episode[_\-]?no[=\/](\d+)/i)
        if (m) return m[1]
        m = s.match(/^(\d{1,6})$/)
        if (m) return m[1]
        m = s.match(/^\d{1,9}\D{1,2}(\d{1,6})$/)
        if (m) return m[1]
        return ""
    }

    parseComicId(id) {
        const s = String(id == null ? "" : id).trim()
        if (!s) return null
        const titleNo = this.titleNoOf(s)
        if (!titleNo) return null
        let genre = "x"
        let slug = "y"
        const m = s.match(/\/(?:zh-hant|zh-hant-hk)\/([^\/?#]+)\/([^\/?#]+)\//)
        if (m) { genre = m[1]; slug = m[2] }
        return { titleNo: titleNo, genre: genre, slug: slug }
    }

    detailPath(t) {
        return "/" + WebtoonsZhHant.LANG + "/" + t.genre + "/" + t.slug + "/list?title_no=" + t.titleNo
    }

    viewerPath(t, epNo) {
        return "/" + WebtoonsZhHant.LANG + "/" + t.genre + "/" + t.slug + "/" + epNo +
            "/viewer?title_no=" + t.titleNo + "&episode_no=" + epNo
    }

    comicIdFromHref(href, fallbackTitleNo) {
        let h = String(href == null ? "" : href).trim()
        h = h.replace(/^https?:\/\/[^\/]+/i, "")
        h = h.replace(/^\/zh-hant-hk\//, "/zh-hant/")
        const m = h.match(/title_no=(\d+)/i)
        const titleNo = m ? m[1] : (fallbackTitleNo || "")
        if (!titleNo) return ""
        const p = h.match(/\/(?:zh-hant|zh-hant-hk)\/([^\/?#]+)\/([^\/?#]+)\//)
        const genre = p ? p[1] : "x"
        const slug = p ? p[2] : "y"
        return "/" + WebtoonsZhHant.LANG + "/" + genre + "/" + slug + "/list?title_no=" + titleNo
    }

    // ---------------- 卡片解析 ----------------
    cardSubTitle(node, href) {
        const pick = (sel) => {
            const el = node.querySelector(sel)
            if (!el) return ""
            return String(el.text || "").replace(/\s+/g, " ").trim()
        }
        const author = pick(".info_text .author") || pick(".info_area .author") || pick(".author")
        if (author) return author
        const genre = pick(".info_text .genre") || pick(".genre")
        if (genre) return genre
        const fromSlug = this.genreLabelFromPath(href)
        if (fromSlug) return fromSlug
        return pick(".info_text .view_count") || pick(".view_count")
    }

    genreLabelFromPath(href) {
        const m = String(href == null ? "" : href).match(/\/(?:zh-hant|zh-hant-hk)\/([^\/?#]+)\//)
        if (!m) return ""
        const norm = (x) => String(x).toLowerCase().replace(/_/g, "-")
        const slug = norm(m[1])
        for (const g of WebtoonsZhHant.GENRES) { if (norm(g[1]) === slug) return g[0] }
        const extra = {
            canvas: "投稿新星",
            bestchallenge: "挑战赛",
            "best-challenge": "挑战赛",
            challenge: "投稿新星",
            originals: "正式連載",
            daily: "每日更新"
        }
        return extra[slug] || ""
    }

    parseCard(node) {
        if (!node) return null
        let a = node.querySelector("a.link") || node.querySelector("a")
        if (!a) {
            const attrs = node.attributes
            if (attrs && attrs.href) { a = node } else { return null }
        }
        const href = a.attributes.href || ""
        const titleNo = a.attributes["data-title-no"] || this.titleNoOf(href)
        if (!titleNo) return null
        const id = this.comicIdFromHref(href, titleNo)
        if (!id) return null
        const img = node.querySelector(".image_wrap img") || node.querySelector(".img_area img") || node.querySelector("img")
        let title = ""
        const titleEl = node.querySelector(".info_text .title") || node.querySelector(".info_area .subj") || node.querySelector(".title") || node.querySelector(".subj")
        if (titleEl) { title = titleEl.text.trim() }
        if (!title && img) { title = String(img.attributes.alt || "").trim() }
        return new Comic({
            id: id,
            title: title,
            cover: this.cdnUrl(img ? (img.attributes["data-src"] || img.attributes.src || "") : ""),
            subTitle: this.cardSubTitle(node, href)
        })
    }

    parseList(root, selectors) {
        const comics = []
        const seen = {}
        for (const sel of selectors) {
            for (const node of root.querySelectorAll(sel)) {
                const c = this.parseCard(node)
                if (!c || !c.id || !c.title) continue
                if (seen[c.id]) continue
                seen[c.id] = true
                comics.push(c)
            }
        }
        return comics
    }

    // ---------------- 章节目录（API 优先，HTML 兜底）----------------
    async episodesOf(titleNo) {
        const url = WebtoonsZhHant.MSITE + "/api/v1/webtoon/" + titleNo + "/episodes?pageSize=1000&startIndex=0"
        const json = await this.fetchJson(url)
        const list = (json && json.result && json.result.episodeList) ? json.result.episodeList : null
        return list
    }

    async chaptersFromHtml(t) {
        const chapters = new Map()
        const seen = {}
        let prevFirst = ""
        for (let page = 1; page <= 30; page++) {
            const path = this.detailPath(t) + (page > 1 ? "&page=" + page : "")
            let html = ""
            try { html = await this.fetchHtml(path) } catch (e) { break }
            const doc = new HtmlDocument(html)
            let count = 0
            let firstId = ""
            try {
                for (const li of doc.querySelectorAll("li._episodeItem")) {
                    count++
                    const a = li.querySelector("a") || li
                    const epNo = this.episodeNoOf(a.attributes.href || "")
                    if (!epNo || seen[epNo]) continue
                    seen[epNo] = true
                    const subj = li.querySelector(".subj")
                    chapters.set(epNo, subj ? subj.text.trim() : ("第" + epNo + "話"))
                    if (!firstId) firstId = epNo
                }
            } finally {
                doc.dispose()
            }
            if (count === 0) break
            if (page > 1 && firstId && firstId === prevFirst) break
            prevFirst = firstId
        }
        return chapters
    }

    // ---------------- 探索页 ----------------
    explore = [
        {
            title: "LINE WEBTOON",
            type: "singlePageWithMultiPart",
            load: async () => {
                const html = await this.fetchHtml("/")
                const doc = new HtmlDocument(html)
                try {
                    const result = {}
                    for (const section of doc.querySelectorAll(".main_section")) {
                        const head = section.querySelector("h2.section_title") || section.querySelector(".section_title")
                        const name = head ? head.text.trim() : ""
                        if (!name) continue
                        const comics = this.parseList(section, ["ul.webtoon_list > li"])
                        if (comics.length > 0 && !result[name]) { result[name] = comics }
                    }
                    if (Object.keys(result).length === 0) {
                        throw "首页解析结果为空：站点结构可能已改版。"
                    }
                    return result
                } finally {
                    doc.dispose()
                }
            }
        },
        {
            title: "每日更新",
            type: "singlePageWithMultiPart",
            load: async () => {
                const result = {}
                for (const item of WebtoonsZhHant.WEEKDAYS) {
                    const html = await this.fetchHtml("/originals/" + item[1])
                    const doc = new HtmlDocument(html)
                    try {
                        const comics = this.parseList(doc, ["a.link._originals_title_a", "ul.webtoon_list > li"])
                        if (comics.length > 0) { result[item[0]] = comics }
                    } finally {
                        doc.dispose()
                    }
                }
                return result
            }
        },
        {
            title: "人氣排行榜",
            type: "singlePageWithMultiPart",
            load: async () => {
                const result = {}
                for (const item of WebtoonsZhHant.RANK_TABS) {
                    const html = await this.fetchHtml("/ranking/" + item[1])
                    const doc = new HtmlDocument(html)
                    try {
                        const comics = this.parseList(doc, ["a.link._ranking_title_a", "ul.webtoon_list > li"])
                        if (comics.length > 0) { result[item[0]] = comics }
                    } finally {
                        doc.dispose()
                    }
                }
                return result
            }
        },
        {
            title: "投稿新星（CANVAS）",
            type: "singlePageWithMultiPart",
            load: async () => {
                const html = await this.fetchHtml("/canvas")
                const doc = new HtmlDocument(html)
                try {
                    const comics = this.parseList(doc, ["a.lk_discover_item", "a[href*=\"title_no=\"]"])
                    if (comics.length === 0) { throw "投稿新星页面解析结果为空：站点结构可能已改版。" }
                    return { "投稿新星專區": comics }
                } finally {
                    doc.dispose()
                }
            }
        }
    ]

    // ---------------- 分类页 ----------------
    category = {
        title: "LINE WEBTOON",
        parts: [
            {
                name: "題材",
                type: "fixed",
                categories: WebtoonsZhHant.GENRES.map(e => e[0]),
                categoryParams: WebtoonsZhHant.GENRES.map(e => "g:" + e[1]),
                itemType: "category"
            },
            {
                name: "連載日程",
                type: "fixed",
                categories: WebtoonsZhHant.WEEKDAYS.map(e => e[0]),
                categoryParams: WebtoonsZhHant.WEEKDAYS.map(e => "d:" + e[1]),
                itemType: "category"
            },
            {
                name: "排行榜",
                type: "fixed",
                categories: WebtoonsZhHant.RANK_TABS.map(e => e[0]),
                categoryParams: WebtoonsZhHant.RANK_TABS.map(e => "r:" + e[1]),
                itemType: "category"
            },
            {
                name: "排行榜（依題材）",
                type: "fixed",
                categories: WebtoonsZhHant.RANK_GENRES.map(e => e[0]),
                categoryParams: WebtoonsZhHant.RANK_GENRES.map(e => "rg:" + e[1]),
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        optionList: [
            {
                options: ["MANA-人氣排序", "LIKEIT-愛心排序", "UPDATE-最近更新"],
                notShowWhen: [
                    "d:monday", "d:tuesday", "d:wednesday", "d:thursday", "d:friday", "d:saturday", "d:sunday",
                    "r:trending", "r:popular", "r:originals", "r:canvas",
                    "rg:ROMANCE", "rg:FANTASY", "rg:SCHOOL", "rg:ADAPTATION", "rg:WESTERN_PALACE",
                    "rg:LOCAL", "rg:MARTIAL_ARTS", "rg:BL_GL", "rg:ROMANCE_M", "rg:DRAMA"
                ]
            }
        ],
        load: async (category, param, options, page) => {
            const p = String(param == null ? "" : param)
            const sort = (options && options.length > 0 && options[0]) ? String(options[0]) : "MANA"
            if (p.indexOf("g:") === 0) {
                const html = await this.fetchHtml("/genres/" + p.substring(2) + "?sortOrder=" + encodeURIComponent(sort))
                const doc = new HtmlDocument(html)
                try {
                    return { comics: this.parseList(doc, ["a.link._genre_title_a", "ul.webtoon_list > li"]), maxPage: 1 }
                } finally {
                    doc.dispose()
                }
            }
            if (p.indexOf("d:") === 0) {
                const html = await this.fetchHtml("/originals/" + p.substring(2))
                const doc = new HtmlDocument(html)
                try {
                    return { comics: this.parseList(doc, ["a.link._originals_title_a", "ul.webtoon_list > li"]), maxPage: 1 }
                } finally {
                    doc.dispose()
                }
            }
            if (p.indexOf("r:") === 0) {
                const html = await this.fetchHtml("/ranking/" + p.substring(2))
                const doc = new HtmlDocument(html)
                try {
                    return { comics: this.parseList(doc, ["a.link._ranking_title_a", "ul.webtoon_list > li"]), maxPage: 1 }
                } finally {
                    doc.dispose()
                }
            }
            if (p.indexOf("rg:") === 0) {
                const html = await this.fetchHtml("/ranking/originals?subTabGenreCode=" + encodeURIComponent(p.substring(3)))
                const doc = new HtmlDocument(html)
                try {
                    return { comics: this.parseList(doc, ["a.link._ranking_title_a", "ul.webtoon_list > li"]), maxPage: 1 }
                } finally {
                    doc.dispose()
                }
            }
            return { comics: [], maxPage: 1 }
        }
    }

    // ---------------- 搜索 ----------------
    search = {
        optionList: [
            {
                type: "select",
                options: ["ALL-全部作品", "WEBTOON-連載作品", "CHALLENGE-投稿作品 CANVAS"],
                label: "搜尋範圍",
                default: null
            }
        ],
        load: async (keyword, options, page) => {
            const kw = String(keyword == null ? "" : keyword).trim()
            if (!kw) return { comics: [], maxPage: 1 }
            const scope = (options && options.length > 0 && options[0]) ? String(options[0]) : "ALL"
            const p = (page && page > 0) ? page : 1
            const start = (p - 1) * WebtoonsZhHant.SEARCH_PAGE_SIZE
            try {
                return await this.searchByApi(kw, scope, start)
            } catch (e) {
                return await this.searchByHtml(kw, p)
            }
        }
    }

    comicFromSearchItem(it) {
        if (!it) return null
        const titleNo = it.titleNo ? String(it.titleNo) : ""
        if (!titleNo) return null
        const genre = it.representGenre ? String(it.representGenre).toLowerCase().replace(/_/g, "-") : "x"
        const slug = it.titleGroupName ? String(it.titleGroupName) : "y"
        const names = []
        for (const v of [it.writingAuthorName, it.pictureAuthorName]) {
            const s = v ? String(v).trim() : ""
            if (s && names.indexOf(s) < 0) names.push(s)
        }
        return new Comic({
            id: "/" + WebtoonsZhHant.LANG + "/" + genre + "/" + slug + "/list?title_no=" + titleNo,
            title: String(it.title == null ? "" : it.title),
            cover: this.cdnUrl(it.thumbnailMobile || it.thumbnail || ""),
            subTitle: names.join(" · ")
        })
    }

    async searchByApi(kw, scope, start) {
        const types = scope === "WEBTOON" ? ["WEBTOON"]
            : scope === "CHALLENGE" ? ["CHALLENGE"]
                : ["WEBTOON", "CHALLENGE"]
        const comics = []
        const seen = {}
        let maxPage = 1
        let reached = false
        for (const type of types) {
            const qs = "keyword=" + encodeURIComponent(kw) + "&searchType=" + type + "&start=" + start
            let json = null
            try { json = await this.fetchSearchJson(qs) } catch (e) { json = null }
            if (!json || !json.result) continue
            reached = true
            const node = json.result[type === "WEBTOON" ? "webtoonResult" : "challengeResult"]
            if (!node) continue
            const total = (typeof node.totalCount === "number") ? node.totalCount : 0
            const pages = Math.max(1, Math.ceil(total / WebtoonsZhHant.SEARCH_PAGE_SIZE))
            if (pages > maxPage) maxPage = pages
            for (const it of (node.titleList || [])) {
                const c = this.comicFromSearchItem(it)
                if (!c || !c.id || !c.title) continue
                if (seen[c.id]) continue
                seen[c.id] = true
                comics.push(c)
            }
        }
        if (!reached) throw "search api unavailable"
        return { comics: comics, maxPage: maxPage }
    }

    async searchByHtml(kw, page) {
        const path = "/search?keyword=" + encodeURIComponent(kw) + (page > 1 ? "&page=" + page : "")
        const html = await this.fetchHtml(path)
        const doc = new HtmlDocument(html)
        try {
            const comics = this.parseList(doc, ["a.link._card_item", "ul.webtoon_list > li"])
            return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page }
        } finally {
            doc.dispose()
        }
    }

    // ---------------- 详情 / 章节 ----------------
    comic = {
        idMatch: "(?:https?://www\\.webtoons\\.com)?/?(?:zh-hant|zh-hant-hk)/.*title_no=\\d+|^\\d{2,9}",

        loadInfo: async (id) => {
            const t = this.parseComicId(id)
            if (!t) throw "无法解析漫画 ID：请从探索、搜索或分类页重新打开这部作品。"
            const html = await this.fetchHtml(this.detailPath(t))
            const doc = new HtmlDocument(html)
            let title = ""
            let cover = ""
            let description = ""
            let author = ""
            let genre = ""
            let dayInfo = ""
            try {
                const h1 = doc.querySelector("h1.subj")
                if (h1) title = h1.text.trim()
                const og = doc.querySelector("meta[property=\"og:image\"]")
                if (og) cover = this.cdnUrl(og.attributes.content || "")
                const summary = doc.querySelector(".summary")
                if (summary) description = summary.text.trim()
                const genreEl = doc.querySelector(".detail_header .genre") || doc.querySelector(".genre")
                if (genreEl) genre = genreEl.text.trim()
                const authorEl = doc.querySelector(".detail_header .author_area")
                if (authorEl) author = authorEl.text.replace(/\s+/g, " ").replace(/作家資訊/g, "").trim()
                const dayEl = doc.querySelector("p.day_info")
                if (dayEl) dayInfo = dayEl.text.replace(/更新在|更新/g, "").replace(/\s+/g, " ").trim()
            } finally {
                doc.dispose()
            }

            const tags = {}
            if (genre) tags["題材"] = [genre]
            if (dayInfo) tags["更新"] = [dayInfo]

            let chapters = new Map()
            let eps = null
            try { eps = await this.episodesOf(t.titleNo) } catch (e) { eps = null }

            if (eps && eps.length > 0) {
                // v1.0.1：改为话号升序 → 第 1 话排在最前
                const sorted = eps.slice().sort((a, b) => (a.episodeNo || 0) - (b.episodeNo || 0))
                for (const e of sorted) {
                    const no = String(e.episodeNo == null ? "" : e.episodeNo)
                    if (!no) continue
                    chapters.set(no, String(e.episodeTitle || ("第" + no + "話")))
                }
            } else {
                // HTML 兜底：站点每页默认最新章节在前，这里反转为第 1 话在最前
                const htmlChapters = await this.chaptersFromHtml(t)
                const entries = []
                for (const [k, v] of htmlChapters) entries.push([k, v])
                entries.reverse()
                for (const [k, v] of entries) chapters.set(k, v)
            }

            return new ComicDetails({
                title: title,
                subtitle: author,
                subTitle: author,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                isFavorite: null,
                uploader: author,
                url: WebtoonsZhHant.SITE + this.detailPath(t)
            })
        },

        loadEp: async (comicId, epId) => {
            const t = this.parseComicId(comicId)
            if (!t) return { images: [] }
            const epNo = this.episodeNoOf(epId)
            if (!epNo) return { images: [] }
            const html = await this.fetchHtml(this.viewerPath(t, epNo))
            const doc = new HtmlDocument(html)
            try {
                const images = []
                const seen = {}
                const keepBanner = this.showBanner()
                for (const img of doc.querySelectorAll("#_imageList img")) {
                    let u = img.attributes["data-url"] || img.attributes.src || ""
                    u = this.cdnUrl(u)
                    if (!u) continue
                    if (u.indexOf("webtoons-static.pstatic.net") === 0) continue
                    if (u.indexOf("bg_transparency") >= 0) continue
                    if (!keepBanner && u.indexOf("tw_warning") >= 0) continue
                    if (seen[u]) continue
                    seen[u] = true
                    images.push(u)
                }
                return { images: images }
            } finally {
                doc.dispose()
            }
        },

        onImageLoad: (url, comicId, epId) => {
            const u = String(url == null ? "" : url)
            if (u.indexOf("webtoon-phinf.pstatic.net") >= 0) {
                return { headers: { "Referer": WebtoonsZhHant.SITE + "/" } }
            }
            return {}
        },

        onThumbnailLoad: (url) => {
            const u = String(url == null ? "" : url)
            if (u.indexOf("webtoon-phinf.pstatic.net") >= 0) {
                return { headers: { "Referer": WebtoonsZhHant.SITE + "/" } }
            }
            return {}
        },

        link: {
            domains: ["www.webtoons.com", "m.webtoons.com", "webtoons.com"],
            linkToId: (url) => {
                const t = this.parseComicId(url)
                return t ? this.detailPath(t) : null
            }
        }
    }

    // ---------------- 设置 ----------------
    settings = {
        show_copyright_banner: {
            title: "顯示官方版權提示圖（每話第一張）",
            type: "switch",
            default: false
        }
    }

    showBanner() {
        try { return this.loadSetting("show_copyright_banner") === true } catch (e) { return false }
    }
}