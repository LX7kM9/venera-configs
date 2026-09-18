/** @type {import('./_venera_.js')} */
class CycomicSource extends ComicSource {
    name = "次元漫画"
    key = "cycomic"
    version = "1.0.3"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/cycomic.js"

    static baseUrl = "https://2cycomic.com"
    static IMAGE_PROXY = "https://wsrv.nl/?url="

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
            "Referer": CycomicSource.baseUrl + "/"
        }
    }

    abs(u) {
        if (!u) return ""
        u = ("" + u).trim()
        if (u.startsWith("//")) return "https:" + u
        if (u.startsWith("http://") || u.startsWith("https://")) return u
        if (!u.startsWith("/")) u = "/" + u
        return CycomicSource.baseUrl + u
    }

    static proxyImage(url) {
        if (!url) return ""
        if (url.startsWith(CycomicSource.IMAGE_PROXY)) return url
        return CycomicSource.IMAGE_PROXY + encodeURIComponent(url)
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
            let res = await Network.post(`${CycomicSource.baseUrl}/api/comic/read/pics`, headers, Convert.encodeUtf8(body))
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

    // ---------- 从单个 a[href*='/book/'] 解析漫画 ----------
    // 关键：只从 a 自身和它的直接父节点里取信息，避免跨卡片污染
    parseComicFromAnchor(a) {
        let href = this.attr(a, "href")
        let m = href.match(/\/book\/(\d+)/)
        if (!m) return null
        let id = m[1]

        // 封面：只从 a 内部的 img 取
        let img = a.querySelector("img")
        let cover = ""
        if (img) {
            cover = this.attr(img, "data-src") || this.attr(img, "data-original") || this.attr(img, "src") || ""
        }

        // 标题：优先 a 的 title 属性，其次 img.alt，再次 a 内文本
        let title = this.attr(a, "title").trim()
        if (!title && img) title = this.attr(img, "alt").trim()
        if (!title) title = this.text(a).replace(/\s+/g, " ")
        title = title.replace(/,?\s*[^,]*漫画\s*$/, "").trim() || title

        // 如果 a 自身没标题，从直接父节点找 .card-title / .title / .name
        if (!title) {
            let p = a.parentElement
            if (p) {
                let tEl = p.querySelector(".card-title, .title, .name, h4, h3, h2")
                if (tEl) title = this.text(tEl)
            }
        }

        if (!title) return null
        if (/^(VIP|更新|排行|分类|完结)$/i.test(title)) return null

        return new Comic({
            id: this.abs(href),
            title: title,
            cover: cover ? this.abs(cover) : ""
        })
    }

    // ---------- 通用列表解析：直接遍历 a[href*='/book/'] ----------
    parseComicList(doc) {
        let list = []
        let seen = {}
        let anchors = doc.querySelectorAll("a[href*='/book/']")
        for (let a of anchors) {
            let c = this.parseComicFromAnchor(a)
            if (c && c.id && !seen[c.id]) {
                seen[c.id] = true
                list.push(c)
            }
        }
        return list
    }

    // ---------- 排行榜解析 ----------
    parseRankList(doc) {
        let comics = []
        let seen = {}

        let topItems = doc.querySelectorAll(".comic-rank-top .comic-item")
        for (let item of topItems) {
            let a = item.querySelector("a.comic-cover-link") || item.querySelector("a[href*='/book/']")
            if (!a) continue
            let href = this.attr(a, "href")
            let m = href.match(/\/book\/(\d+)/)
            if (!m) continue
            let id = m[1]
            if (seen[id]) continue
            let img = a.querySelector("img") || item.querySelector("img")
            let cover = this.attr(img, "src") || this.attr(img, "data-src") || ""
            let nameEl = item.querySelector(".comic-name a") || item.querySelector("h3 a")
            let title = this.text(nameEl)
            if (title) {
                seen[id] = true
                comics.push(new Comic({ id: this.abs(href), title, cover: this.abs(cover) }))
            }
        }

        let listItems = doc.querySelectorAll(".comic-list > li.list, li.list.clearfix")
        for (let item of listItems) {
            let a = item.querySelector(".comic-name a") || item.querySelector("h3 a")
            if (!a) continue
            let href = this.attr(a, "href")
            let m = href.match(/\/book\/(\d+)/)
            if (!m) continue
            let id = m[1]
            if (seen[id]) continue
            let title = this.text(a)
            if (title) {
                seen[id] = true
                comics.push(new Comic({ id: this.abs(href), title, cover: "" }))
            }
        }
        return comics
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

    categoryNames = [
        "全部", "长条", "大女主", "百合", "耽美", "纯爱", "後宫", "韩漫", "奇幻", "轻小说",
        "生活", "悬疑", "格斗", "搞笑", "伪娘", "竞技", "职场", "萌系", "冒险", "治愈",
        "都市", "霸总", "神鬼", "侦探", "爱情", "古风", "欢乐向", "科幻", "穿越", "性转换",
        "校园", "美食", "剧情", "热血", "节操", "励志", "异世界", "历史", "战争", "恐怖",
        "日漫", "港台", "美漫", "国漫", "韩漫专区", "未分类", "连载中", "已完结"
    ]

    categoryUrl(name, page) {
        const encAll = encodeURIComponent("全部")
        if (name === "日漫") return `${CycomicSource.baseUrl}/booklists/1/${encAll}/3/${page}.html`
        if (name === "港台") return `${CycomicSource.baseUrl}/booklists/2/${encAll}/3/${page}.html`
        if (name === "美漫") return `${CycomicSource.baseUrl}/booklists/3/${encAll}/3/${page}.html`
        if (name === "国漫") return `${CycomicSource.baseUrl}/booklists/4/${encAll}/3/${page}.html`
        if (name === "韩漫专区") return `${CycomicSource.baseUrl}/booklists/5/${encAll}/3/${page}.html`
        if (name === "未分类") return `${CycomicSource.baseUrl}/booklists/6/${encAll}/3/${page}.html`
        if (name === "连载中") return `${CycomicSource.baseUrl}/booklists/9/${encAll}/4/${page}.html`
        if (name === "已完结") return `${CycomicSource.baseUrl}/booklists/9/${encAll}/1/${page}.html`
        return `${CycomicSource.baseUrl}/booklists/9/${encodeURIComponent(name)}/3/${page}.html`
    }

    category = {
        title: "次元漫画",
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
            let maxPage = this.parseMaxPage(doc, page || 1)
            doc.dispose()
            return { comics, maxPage }
        },
        ranking: {
            options: [
                "alldj-总点击",
                "ydj-月点击",
                "zdj-周点击",
                "rdj-日点击",
                "allfav-总收藏"
            ],
            load: async (option, page) => {
                let key = (option || "alldj").split("-")[0]
                let url = page && page > 1 ? `${CycomicSource.baseUrl}/top/${key}-${page}.html` : `${CycomicSource.baseUrl}/top/${key}.html`
                let doc = await this.getDoc(url)
                let comics = this.parseRankList(doc)
                let maxPage = this.parseMaxPage(doc, page || 1)
                doc.dispose()
                return { comics, maxPage }
            }
        }
    }

    // ---------- 发现页 ----------
    explore = [
        {
            title: "次元漫画",
            type: "singlePageWithMultiPart",
            load: async () => {
                let doc = await this.getDoc(CycomicSource.baseUrl + "/")
                let result = {}
                let blocks = doc.querySelectorAll(".mult.sow")
                for (let block of blocks) {
                    let titleEl = block.querySelector(".mult-title")
                    if (!titleEl) continue
                    let title = this.text(titleEl).trim()
                    if (!title) continue
                    let comics = this.parseComicList(block)
                    if (comics.length) result[title] = comics
                }
                doc.dispose()
                return result
            }
        },
        {
            title: "每日更新-次元",
            type: "multiPageComicList",
            load: async (page) => {
                let day = new Date().getDay()
                day = day === 0 ? 7 : day
                let doc = await this.getDoc(`${CycomicSource.baseUrl}/update/${day}.html`)
                let comics = this.parseComicList(doc)
                doc.dispose()
                return { comics, maxPage: 1 }
            }
        }
    ]

    search = {
        load: async (keyword, options, page) => {
            let url = `${CycomicSource.baseUrl}/search?searchkey=${encodeURIComponent(keyword)}`
            let doc = await this.getDoc(url)
            let comics = this.parseComicList(doc)
            doc.dispose()
            return { comics, maxPage: 1 }
        },
        optionList: []
    }

    comic = {
        idMatch: "https?://(www\\.)?2cycomic\\.com/book/\\d+/?",
        link: {
            domains: ["2cycomic.com", "www.2cycomic.com"],
            linkToId: (url) => url && url.indexOf("/book/") >= 0 ? url : null
        },
        loadInfo: async (id) => {
            let url = id.startsWith("http") ? id : this.abs(id)
            let doc = await this.getDoc(url)
            let title = this.text(doc.querySelector("h1.name")) || this.text(doc.querySelector("h1"))
            let author = this.text(doc.querySelector("span.author")) || this.text(doc.querySelector(".author"))
            let cover = this.attr(doc.querySelector(".thumbnail img"), "src") ||
                        this.attr(doc.querySelector(".cover img"), "src") ||
                        this.attr(doc.querySelector("img"), "src")
            let desc = this.text(doc.querySelector("#js_desc_content")) ||
                       this.text(doc.querySelector(".desc-con")) ||
                       this.text(doc.querySelector(".description"))
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
                "ul[id*=chapter] a", "div[id*=chapter] a", "a[href*='/chapter/']"
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
            if (!url) return { headers: this.headers }
            return {
                url: CycomicSource.proxyImage(url),
                headers: this.headers
            }
        },
        onThumbnailLoad: (url) => {
            if (!url) return { headers: this.headers }
            return {
                url: CycomicSource.proxyImage(url),
                headers: this.headers
            }
        }
    }
}