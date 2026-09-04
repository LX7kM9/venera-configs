/** @type {import('./_venera_.js')} */
class YemanComicSource extends ComicSource {
    name = "野蛮漫画"
    key = "yemancomic"
    version = "0.3.6"  // 新增屏蔽 TL 开关
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/yemancomic.js"

    get baseUrl() { return "https://yemancomic.com" }

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
            "Referer": this.baseUrl + "/"
        }
    }

    abs(u) {
        if (!u) return ""
        u = ("" + u).trim()
        if (u.startsWith("//")) return "https:" + u
        if (u.startsWith("http://") || u.startsWith("https://")) return u
        if (!u.startsWith("/")) u = "/" + u
        return this.baseUrl + u
    }

    text(el) { return el ? (el.text || "").trim() : "" }
    attr(el, name) { return el && el.attributes ? (el.attributes[name] || "") : "" }

    async getDoc(url) {
        let res = await Network.get(url, this.headers)
        if (res.status !== 200) throw `Request Error: ${res.status} ${url}`
        return new HtmlDocument(res.body)
    }

    async getText(url) {
        let res = await Network.get(url, this.headers)
        if (res.status !== 200) throw `Request Error: ${res.status} ${url}`
        return res.body || ""
    }

    parseReadMeta(html, fallbackUrl) {
        let aid = ""
        let cid = ""
        let picCount = 0
        let m = html.match(/read\s*=\s*\{([\s\S]*?)\}<\/script>/i)
        let block = m ? m[1] : html
        let aidMatch = block.match(/aid\s*:\s*['"]?(\d+)['"]?/i)
        let cidMatch = block.match(/(?:apiCid|cid)\s*:\s*['"]?(\d+)['"]?/i)
        let countMatch = block.match(/picCount\s*:\s*['"]?(\d+)['"]?/i)
        if (aidMatch) aid = aidMatch[1]
        if (cidMatch) cid = cidMatch[1]
        if (countMatch) picCount = parseInt(countMatch[1])
        if ((!aid || !cid) && fallbackUrl) {
            let urlMatch = ("" + fallbackUrl).match(/\/chapter\/(\d+)\/(\d+)\.html/i)
            if (urlMatch) {
                aid = aid || urlMatch[1]
                cid = cid || urlMatch[2]
            }
        }
        return { aid, cid, picCount }
    }

    parsePicApiResponse(body) {
        let images = []
        let total = 0
        try {
            let json = JSON.parse(body)
            if (json && json.data) {
                total = parseInt(json.data.total || 0)
                let pics = json.data.pic || []
                for (let item of pics) {
                    let pic = item && item.pic ? this.abs(item.pic.replace(/\\\//g, "/")) : ""
                    if (pic) images.push(pic)
                }
            }
        } catch (e) {
            let matches = body.match(/"pic"\s*:\s*"([^"]+)"/g) || []
            for (let item of matches) {
                let m = item.match(/"pic"\s*:\s*"([^"]+)"/)
                if (m) images.push(this.abs(m[1].replace(/\\\//g, "/")))
            }
            let totalMatch = body.match(/"total"\s*:\s*(\d+)/)
            if (totalMatch) total = parseInt(totalMatch[1])
        }
        return { images, total }
    }

    async loadPicsFromApi(aid, cid, referer, picCount) {
        let images = []
        let seen = {}
        let offset = 0
        let limit = 10
        let total = picCount || 0
        for (let guard = 0; guard < 100; guard++) {
            let body = `id=${encodeURIComponent(cid)}&aid=${encodeURIComponent(aid)}&offset=${offset}&limit=${limit}`
            let headers = Object.assign({}, this.headers, {
                "Referer": referer,
                "Content-Type": "application/x-www-form-urlencoded"
            })
            let res = await Network.post(`${this.baseUrl}/api/comic/read/pics`, headers, Convert.encodeUtf8(body))
            if (res.status !== 200) break
            let parsed = this.parsePicApiResponse(res.body || "")
            if (parsed.total) total = parsed.total
            if (parsed.images.length === 0) break
            for (let img of parsed.images) {
                if (!seen[img]) {
                    seen[img] = true
                    images.push(img)
                }
            }
            offset += parsed.images.length
            if (total && images.length >= total) break
        }
        return images
    }

    // ---------- 强化解析 ----------
    parseComicItem(item) {
        let a = item.querySelector("a")
        let img = item.querySelector("img")
        // 标题：优先 .card-title，其次 img.alt，再其次 a 的文本
        let title = this.text(item.querySelector(".card-title")) ||
                    this.text(img?.attributes?.alt) ||
                    this.text(a) ||
                    ""
        let href = this.attr(a, "href")
        // 封面：优先 data-src（懒加载），其次 src
        let cover = this.attr(img, "data-src") || this.attr(img, "src") || ""
        let last = this.text(item.querySelector(".chapter")) || ""

        // ------ 提取标签（用于 TL 过滤） ------
        let tags = []
        let tagItems = item.querySelectorAll(".tags-list .item")
        if (tagItems.length > 0) {
            for (let t of tagItems) {
                let tagText = this.text(t)
                if (tagText) tags.push(tagText)
            }
        }
        // 若没有 tags，保留原有的章节信息作为 tags（仅用于显示）
        if (tags.length === 0 && last) tags.push(last)

        return new Comic({
            id: this.abs(href),
            title: title,
            cover: this.abs(cover),
            tags: tags,
            description: last
        })
    }

    parseComicList(doc) {
        // 优先 li.card（首页/分类/更新均使用）
        let nodes = doc.querySelectorAll("li.card")
        if (nodes.length === 0) {
            // 备用选择器
            nodes = doc.querySelectorAll(".comic-item, .mult-warp li, .list li, li[class*=card]")
        }
        let list = []
        let seen = {}
        for (let item of nodes) {
            let c = this.parseComicItem(item)
            if (c.id && c.title && !seen[c.id]) {
                seen[c.id] = true
                list.push(c)
            }
        }
        return list
    }

    parseMaxPage(doc, fallback) {
        let html = doc.querySelector("body")?.innerHTML || ""
        let maxPage = fallback || 1
        let ms = html.match(/(\d+)\.html[^>]*>\s*(尾页|末页|最后|last)/i) || html.match(/page=(\d+)[^>]*>\s*(尾页|末页|最后|last)/i)
        if (ms) maxPage = parseInt(ms[1])
        let nums = html.match(/>\s*\d+\s*</g) || []
        for (let n of nums) {
            let v = parseInt(n.replace(/\D/g, ""))
            if (v > maxPage && v < 10000) maxPage = v
        }
        return maxPage
    }

    // ---------- TL 过滤 ----------
    _isTL(tags) {
        if (!this.loadSetting('hideTL')) return false
        if (!tags || !Array.isArray(tags)) return false
        // 不区分大小写，匹配 "TL" 标签（可能包含空格）
        return tags.some(t => t && t.trim().toLowerCase() === "tl")
    }

    _filterTL(comics) {
        if (!this.loadSetting('hideTL')) return comics
        return comics.filter(c => !this._isTL(c.tags))
    }

    categoryNames = [
        "全部", "长条", "大女主", "百合", "耽美", "纯爱", "後宫", "韩漫", "奇幻", "轻小说",
        "生活", "悬疑", "格斗", "搞笑", "伪娘", "竞技", "职场", "萌系", "冒险", "治愈",
        "都市", "霸总", "神鬼", "侦探", "爱情", "古风", "欢乐向", "科幻", "穿越", "性转换",
        "校园", "美食", "剧情", "热血", "节操", "励志", "异世界", "历史", "战争", "恐怖",
        "日漫", "港台", "美漫", "国漫", "韩漫专区", "未分类", "连载中", "已完结"
    ]

    categoryUrl(name, page) {
        const encAll = encodeURIComponent("全部")
        if (name === "日漫") return `${this.baseUrl}/comiclists/1/${encAll}/3/${page}.html`
        if (name === "港台") return `${this.baseUrl}/comiclists/2/${encAll}/3/${page}.html`
        if (name === "美漫") return `${this.baseUrl}/comiclists/3/${encAll}/3/${page}.html`
        if (name === "国漫") return `${this.baseUrl}/comiclists/4/${encAll}/3/${page}.html`
        if (name === "韩漫专区") return `${this.baseUrl}/comiclists/5/${encAll}/3/${page}.html`
        if (name === "未分类") return `${this.baseUrl}/comiclists/6/${encAll}/3/${page}.html`
        if (name === "连载中") return `${this.baseUrl}/comiclists/9/${encAll}/4/${page}.html`
        if (name === "已完结") return `${this.baseUrl}/comiclists/9/${encAll}/1/${page}.html`
        return `${this.baseUrl}/comiclists/9/${encodeURIComponent(name)}/3/${page}.html`
    }

    category = {
        title: "野蛮漫画",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: this.categoryNames,
                itemType: "category",
                categoryParams: this.categoryNames,
            }
        ],
        enableRankingPage: true,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let doc = await this.getDoc(this.categoryUrl(param || category || "全部", page || 1))
            let comics = this.parseComicList(doc)
            comics = this._filterTL(comics)  // 应用 TL 过滤
            let maxPage = this.parseMaxPage(doc, page || 1)
            doc.dispose()
            return { comics, maxPage }
        },
        ranking: {
            options: ["alldj-总点击", "week-周点击", "month-月点击"],
            load: async (option, page) => {
                let key = (option || "alldj").split("-")[0]
                let url = page && page > 1 ? `${this.baseUrl}/top/${key}-${page}.html` : `${this.baseUrl}/top/${key}.html`
                let doc = await this.getDoc(url)
                let comics = this.parseComicList(doc)
                comics = this._filterTL(comics)  // 应用 TL 过滤
                let maxPage = this.parseMaxPage(doc, page || 1)
                doc.dispose()
                return { comics, maxPage }
            }
        }
    }

    // ---------- 发现页：四个指定板块（应用 TL 过滤） ----------
    explore = [
        {
            title: "野蛮漫画",
            type: "singlePageWithMultiPart",
            load: async () => {
                let doc = await this.getDoc(this.baseUrl + "/")
                let result = {}
                const targetTitles = [
                    "新作·热腾腾出炉",
                    "经典·永不退色的记忆",
                    "最强C位",
                    "完结·一次爽翻天"
                ]
                let blocks = doc.querySelectorAll(".mult.sow")
                for (let block of blocks) {
                    let titleEl = block.querySelector(".mult-title")
                    if (!titleEl) continue
                    let title = this.text(titleEl).trim()
                    if (!targetTitles.includes(title)) continue
                    let comics = []
                    let items = block.querySelectorAll("li.card")
                    for (let item of items) {
                        let c = this.parseComicItem(item)
                        if (c.id && c.title) comics.push(c)
                    }
                    // 应用 TL 过滤
                    comics = this._filterTL(comics)
                    if (comics.length) result[title] = comics
                }
                doc.dispose()
                return result
            }
        },
        {
            title: "每日更新",
            type: "multiPageComicList",
            load: async (page) => {
                let day = new Date().getDay()
                day = day === 0 ? 7 : day
                let doc = await this.getDoc(`${this.baseUrl}/update/${day}.html`)
                let comics = this.parseComicList(doc)
                comics = this._filterTL(comics)  // 应用 TL 过滤
                doc.dispose()
                return { comics, maxPage: 1 }
            }
        }
    ]

    search = {
        load: async (keyword, options, page) => {
            let url = `${this.baseUrl}/search?searchkey=${encodeURIComponent(keyword)}`
            let doc = await this.getDoc(url)
            let comics = this.parseComicList(doc)
            comics = this._filterTL(comics)  // 应用 TL 过滤
            doc.dispose()
            return { comics, maxPage: 1 }
        },
        optionList: []
    }

    comic = {
        idMatch: "https?://(www\\.)?yemancomic\\.com/book/\\d+/?",
        link: {
            domains: ["yemancomic.com", "www.yemancomic.com"],
            linkToId: (url) => url && url.indexOf("/book/") >= 0 ? url : null
        },
        loadInfo: async (id) => {
            let url = id.startsWith("http") ? id : this.abs(id)
            let doc = await this.getDoc(url)
            let title = this.text(doc.querySelector("h1.name")) || this.text(doc.querySelector("h1"))
            let author = this.text(doc.querySelector("span.author")) || this.text(doc.querySelector(".author"))
            let cover = this.attr(doc.querySelector(".thumbnail img"), "src") || this.attr(doc.querySelector(".cover img"), "src") || this.attr(doc.querySelector("img"), "src")
            let desc = this.text(doc.querySelector("#js_desc_content")) || this.text(doc.querySelector(".desc-con")) || this.text(doc.querySelector(".description"))
            let tagNodes = doc.querySelectorAll("ul.types a, .types a, .type a")
            let tags = {}
            let tagArr = []
            for (let t of tagNodes) {
                let tx = this.text(t)
                if (tx) tagArr.push(tx)
            }
            if (tagArr.length) tags["分类"] = tagArr
            let chapters = {}
            let selectors = [
                "#chapter-list a", ".chapter-list a", ".chapter a", ".episodes a", ".episode-list a", ".comic-chapters a",
                "ul[id*=chapter] a", "div[id*=chapter] a", "a[href*='/chapter/']", "a[href*='/comic/']", "a[href*='-']"
            ]
            let seen = {}
            for (let sel of selectors) {
                let as = doc.querySelectorAll(sel)
                for (let a of as) {
                    let href = this.attr(a, "href")
                    let name = this.text(a)
                    if (!href || !name) continue
                    if (href.indexOf("/book/") >= 0 && href.replace(/\/$/, "") === url.replace(/\/$/, "")) continue
                    let ep = this.abs(href)
                    if (!seen[ep] && /\d/.test(href)) {
                        seen[ep] = true
                        chapters[ep] = name
                    }
                }
                if (Object.keys(chapters).length > 0) break
            }
            doc.dispose()
            return new ComicDetails({
                title, subTitle: author, cover: this.abs(cover), description: desc,
                tags, chapters, url
            })
        },
        loadEp: async (comicId, epId) => {
            let url = epId && epId.startsWith("http") ? epId : this.abs(epId || comicId)
            let images = []
            let seen = {}
            for (let i = 0; i < 80 && url; i++) {
                let html = await this.getText(url)
                let meta = this.parseReadMeta(html, url)
                if (meta.aid && meta.cid) {
                    let apiImages = await this.loadPicsFromApi(meta.aid, meta.cid, url, meta.picCount)
                    for (let img of apiImages) {
                        if (!seen[img]) {
                            seen[img] = true
                            images.push(img)
                        }
                    }
                    if (images.length) break
                }
                let doc = new HtmlDocument(html)
                let imgNodes = doc.querySelectorAll(".rd-article img, .comicpage img, .comic-page img, .chapter-content img, .read-content img, #images img, article img, img")
                for (let img of imgNodes) {
                    let src = this.attr(img, "data-original") || this.attr(img, "data-src") || this.attr(img, "src")
                    src = this.abs(src)
                    if (!src) continue
                    if (/logo|avatar|icon|vip|loading|default|qrcode|blank|data:image/i.test(src)) continue
                    if (!seen[src]) {
                        seen[src] = true
                        images.push(src)
                    }
                }
                let next = null
                let links = doc.querySelectorAll("a")
                for (let a of links) {
                    let txt = this.text(a)
                    let href = this.attr(a, "href")
                    if (href && (txt.indexOf("下一页") >= 0 || txt.indexOf("下一話") >= 0 || txt.indexOf("下一话") >= 0)) {
                        next = this.abs(href)
                        break
                    }
                }
                doc.dispose()
                if (!next || next === url) break
                url = next
            }
            return { images }
        },
        onImageLoad: (url, comicId, epId) => {
            return { headers: this.headers }
        },
        onThumbnailLoad: (url) => {
            return { headers: this.headers }
        }
    }

    // ============================================================
    //  SETTINGS — 增加屏蔽 TL 开关
    // ============================================================
    settings = {
        hideTL: {
            title: "屏蔽TL内容",
            type: "switch",
            default: false,
            description: "开启后将过滤掉标签中带有「TL」的漫画"
        },
        // 可以继续保留其他设置项（如果有）
    }

    // ============================================================
    //  TRANSLATION（可选）
    // ============================================================
    translation = {
        'zh_CN': {
            '屏蔽TL内容': '屏蔽TL内容',
        },
        'zh_TW': {
            '屏蔽TL内容': '屏蔽TL內容',
        },
        'en': {
            '屏蔽TL内容': 'Hide TL Content',
        }
    }
}