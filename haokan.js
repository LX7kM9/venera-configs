class HaoKan extends ComicSource {
    name = "好看漫画"
    key = "haokan_txt"
    version = "1.0.4"   // 修复分类页白屏（支持文字 slug）
    minAppVersion = "1.2.2"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/haokan.js"

    baseUrl = "https://www.haokantxt.com"

    get headers() {
        return {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            "referer": this.baseUrl + "/"
        }
    }

    // ========== 发现页（multiPartPage + viewMore） ==========
    explore = [
        {
            title: "好看漫画",
            type: "multiPartPage",
            load: async () => {
                let res = await Network.get(this.baseUrl + "/", this.headers)
                if (res.status !== 200) throw "发现页加载失败: " + res.status
                let doc = new HtmlDocument(res.body)
                let result = []

                let sectionNodes = doc.querySelectorAll(".section, .comic-section, .panel")
                for (let section of sectionNodes) {
                    let titleEl = section.querySelector(".section-header h2, .section-header h3, h2, h3")
                    let title = titleEl ? this.text(titleEl) : ""
                    if (!title) continue

                    let comics = this.parseSectionComics(section)
                    if (comics.length === 0) continue

                    let part = { title: title, comics: comics }
                    let morePath = this.mapTitleToPath(title)
                    if (morePath) {
                        part.viewMore = {
                            page: "category",
                            attributes: { category: title, param: morePath }
                        }
                    }
                    result.push(part)
                }

                if (result.length === 0) {
                    let comics = this.parseComics(doc)
                    if (comics.length > 0) {
                        result.push({
                            title: "最新更新",
                            comics: comics,
                            viewMore: {
                                page: "category",
                                attributes: { category: "最新更新", param: "/custom/new" }
                            }
                        })
                    }
                }

                return result
            }
        }
    ]

    // ========== 分类页 ==========
    category = {
        title: "好看漫画",
        enableRankingPage: false,
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: [
                    "全部", "热血", "冒险", "科幻", "霸总", "玄幻", "校园", "修真", "搞笑", "穿越",
                    "后宫", "耽美", "恋爱", "悬疑", "恐怖", "战争", "动作", "同人", "竞技", "励志",
                    "架空", "灵异", "百合", "古风", "生活", "真人", "都市", "日常", "神鬼", "推理",
                    "青春", "纯爱", "剧情", "逆袭", "少年", "奇幻", "美食", "治愈", "爱情", "韩漫"
                ],
                categoryParams: [
                    "", "6", "7", "8", "9", "10", "11", "12", "13", "14",
                    "15", "16", "17", "18", "19", "20", "21", "22", "23", "24",
                    "25", "26", "27", "28", "29", "30", "31", "48", "49", "51",
                    "52", "54", "55", "56", "57", "60", "59", "62", "63", "74"
                ],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let url
            let p = param == null ? "" : String(param)

            if (p.startsWith("/")) {
                url = this.baseUrl + p
                if (page > 1) {
                    url += (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + page
                }
            } else {
                let segments = []
                if (p) segments.push("tags/" + p)

                let status = options && options[0] ? String(options[0]).split("-")[0] : ""
                if (status) segments.push("finish/" + status)

                let order = options && options[1] ? String(options[1]).split("-")[0] : ""
                if (order) segments.push("order/" + order)

                if (page > 1) segments.push("page/" + page)

                url = this.baseUrl + "/category/" + segments.join("/")
                if (segments.length === 0) url = this.baseUrl + "/category/"
            }

            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "分类加载失败: " + res.status
            let doc = new HtmlDocument(res.body)
            let comics = this.parseCategoryComics(doc)
            let maxPage = this.parseMaxPage(doc, page)

            return { comics: comics, maxPage: maxPage }
        },
        optionList: [
            {
                type: "select",
                label: "状态",
                options: ["-全部", "1-连载中", "2-已完结"]
            },
            {
                type: "select",
                label: "排序",
                options: ["hits-热门人气", "addtime-最新更新"]
            }
        ]
    }

    // ========== 搜索 ==========
    search = {
        load: async (keyword, options, page) => {
            let url = this.baseUrl + "/search?key=" + encodeURIComponent(keyword)
            if (page > 1) url += "&page=" + page
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "搜索失败: " + res.status

            let doc = new HtmlDocument(res.body)
            let comics = this.parseSearchResults(doc)

            for (let comic of comics) {
                try {
                    let detail = await Network.get(this.baseUrl + comic.id, this.headers)
                    if (detail.status === 200) {
                        let detailDoc = new HtmlDocument(detail.body)
                        let image = detailDoc.querySelector('meta[property="og:image"]')
                        if (image && image.attributes && image.attributes.content) {
                            comic.cover = image.attributes.content
                        }
                    }
                } catch (error) {}
            }

            return {
                comics: comics,
                maxPage: comics.length > 0 ? page + 1 : page
            }
        },
        optionList: [],
        enableTagsSuggestions: false
    }

    // ========== 详情 ==========
    comic = {
        idMatch: "^(/comic_[^?#]+\\.html|https?://www\\.haokantxt\\.com/comic_[^?#]+\\.html)$",
        link: {
            domains: ["www.haokantxt.com"],
            linkToId: (url) => url.replace(/^https?:\/\/www\.haokantxt\.com/i, "")
        },

        onThumbnailLoad: (url) => ({ headers: this.headers }),

        onImageLoad: async (url, comicId, epId) => ({
            headers: {
                "user-agent": this.headers["user-agent"],
                "referer": this.baseUrl + "/"
            }
        }),

        loadInfo: async (id) => {
            let url = this.normalizeComicUrl(id)
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "详情加载失败: " + res.status

            let doc = new HtmlDocument(res.body)

            let title = this.text(doc.querySelector("h1"))
            if (!title) title = this.text(doc.querySelector(".comic-title"))
            if (!title) title = "未知漫画"

            let cover = ""
            let image = doc.querySelector('meta[property="og:image"]')
            if (image && image.attributes) cover = image.attributes.content || ""
            if (!cover) {
                let coverImage = doc.querySelector(".comic-cover-large img") || doc.querySelector(".comic-cover img")
                if (coverImage && coverImage.attributes) cover = coverImage.attributes.src || coverImage.attributes["data-src"] || ""
            }

            let description = ""
            let descSelectors = [
                ".comic-description p",
                ".comic-desc p",
                ".detail-desc",
                ".comic-intro p",
                "[itemprop='description']"
            ]
            for (let sel of descSelectors) {
                let el = doc.querySelector(sel)
                if (el) {
                    let t = this.text(el)
                    if (t) { description = t; break }
                }
            }
            if (!description) {
                let ld = doc.querySelector('script[type="application/ld+json"]')
                if (ld && ld.text) {
                    try {
                        let json = JSON.parse(ld.text)
                        if (json && json.description) description = String(json.description).trim()
                    } catch (e) {}
                }
            }
            if (!description) {
                let metaDesc = doc.querySelector('meta[name="description"]')
                if (metaDesc && metaDesc.attributes) description = metaDesc.attributes.content || ""
            }

            let author = ""
            let stats = doc.querySelectorAll(".comic-stats .stat-item")
            for (let s of stats) {
                let t = this.text(s)
                if (t.indexOf("作者") >= 0) {
                    author = t.replace(/^作者[:：]\s*/, "").trim()
                    break
                }
            }
            if (!author) {
                let authorEl = doc.querySelector(".comic-author, [itemprop='author']")
                if (authorEl) author = this.text(authorEl)
            }
            if (!author) {
                let ld = doc.querySelector('script[type="application/ld+json"]')
                if (ld && ld.text) {
                    try {
                        let json = JSON.parse(ld.text)
                        if (json && json.author) {
                            if (typeof json.author === "string") author = json.author
                            else if (json.author.name) author = json.author.name
                        }
                    } catch (e) {}
                }
            }

            let tagList = []
            for (let t of doc.querySelectorAll(".comic-tags .tag")) {
                let txt = this.text(t)
                if (txt) tagList.push(txt)
            }
            if (tagList.length === 0) {
                let ld = doc.querySelector('script[type="application/ld+json"]')
                if (ld && ld.text) {
                    try {
                        let json = JSON.parse(ld.text)
                        if (json && json.genre) {
                            if (typeof json.genre === "string") {
                                tagList = json.genre.split(/[\s，,、]+/).filter(v => v)
                            } else if (Array.isArray(json.genre)) {
                                tagList = json.genre
                            }
                        }
                    } catch (e) {}
                }
            }

            let tags = {}
            if (author) tags["作者"] = [author]
            if (tagList.length > 0) tags["标签"] = tagList

            let chapters = {}
            let links = doc.querySelectorAll("a")
            for (let link of links) {
                let href = String(link.attributes.href || "")
                let match = href.match(/chapter_([0-9]+)_([0-9]+)\.html/i)
                if (match) {
                    chapters[match[1] + "@" + match[2]] = this.text(link) || match[2]
                }
            }
            if (Object.keys(chapters).length === 0) throw "没有找到章节"

            return new ComicDetails({
                title: title,
                cover: this.absoluteUrl(cover),
                description: description,
                tags: tags,
                chapters: chapters,
                url: url
            })
        },

        loadEp: async (comicId, epId) => {
            let parts = String(epId || "").split("@")
            if (parts.length !== 2) throw "章节 ID 无效"

            let url = this.baseUrl + "/chapter_" + parts[0] + "_" + parts[1] + ".html"
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "章节加载失败: " + res.status

            let doc = new HtmlDocument(res.body)
            let images = []
            let seen = {}
            let nodes = doc.querySelectorAll("img.comic-image")
            if (nodes.length === 0) nodes = doc.querySelectorAll("img")

            for (let image of nodes) {
                let attrs = image.attributes || {}
                let imageUrl = attrs["data-src"] || attrs.src || attrs["data-original"] || ""
                imageUrl = this.absoluteUrl(imageUrl)
                if (imageUrl && !seen[imageUrl] && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(imageUrl)) {
                    seen[imageUrl] = true
                    images.push(imageUrl)
                }
            }
            if (images.length === 0) throw "没有找到章节图片"
            return { images: images }
        }
    }

    // ========== 分类页专用解析（关键修复：支持文字 slug） ==========
    parseCategoryComics(doc) {
        let comics = []
        let seen = {}
        let items = doc.querySelectorAll(".comic-list .comic-item")
        for (let item of items) {
            let coverLink = item.querySelector("a.comic-cover")
            let titleLink = item.querySelector("h3 a") || item.querySelector("h3")
            if (!titleLink) continue

            let href = String(titleLink.attributes.href || (coverLink && coverLink.attributes.href) || "")

            // ★ 关键修复：支持数字 ID 和文字 slug（如 comic_yirenzhixia.html）
            let match = href.match(/comic_([^?#.\/]+)\.html/i)
            if (!match || seen[match[1]]) continue

            let title = this.text(titleLink) ||
                        (coverLink && coverLink.querySelector("img") && coverLink.querySelector("img").attributes.alt) || ""
            if (!title) continue

            let cover = ""
            let img = coverLink ? coverLink.querySelector("img") : null
            if (img && img.attributes) {
                cover = img.attributes.src || img.attributes["data-src"] || img.attributes["data-original"] || ""
            }

            let author = ""
            let authorEl = item.querySelector(".comic-author")
            if (authorEl) author = this.text(authorEl)

            let badge = ""
            let badgeEl = item.querySelector(".update-badge")
            if (badgeEl) badge = this.text(badgeEl)

            let tags = []
            if (badge) tags.push(badge)

            seen[match[1]] = true
            comics.push(new Comic({
                id: "/comic_" + match[1] + ".html",
                title: title,
                cover: this.absoluteUrl(cover),
                subTitle: author,
                description: author,
                tags: tags
            }))
        }
        return comics
    }

    parseMaxPage(doc, currentPage) {
        let maxPage = currentPage || 1
        let pageLinks = doc.querySelectorAll(".pagination a")
        for (let a of pageLinks) {
            let href = String(a.attributes.href || "")
            let m = href.match(/\/page\/(\d+)/)
            if (m) {
                let n = parseInt(m[1], 10)
                if (n > maxPage) maxPage = n
            }
            let txt = this.text(a)
            let n2 = parseInt(txt, 10)
            if (!isNaN(n2) && n2 > maxPage) maxPage = n2
        }
        return maxPage
    }

    // ========== 发现页辅助 ==========
    mapTitleToPath(title) {
        if (title.indexOf("推荐") >= 0 || title.indexOf("热门") >= 0) return "/custom/recom"
        if (title.indexOf("最新") >= 0 || title.indexOf("更新") >= 0) return "/custom/new"
        if (title.indexOf("完结") >= 0) return "/custom/end"
        if (title.indexOf("排行") >= 0 || title.indexOf("榜") >= 0) return "/custom/top"
        return null
    }

    parseSectionComics(section) {
        let comics = []
        let seen = {}
        let links = section.querySelectorAll("a[href*='comic_']")
        for (let link of links) {
            let href = String(link.attributes.href || "")
            let match = href.match(/comic_([^?#.\/]+)\.html/i)
            if (!match || seen[match[1]]) continue

            let img = link.querySelector("img")
            let title = ""
            if (link.attributes.title) title = link.attributes.title
            if (!title && img && img.attributes) title = img.attributes.alt || ""
            if (!title) title = this.text(link)
            if (!title) continue

            let cover = ""
            if (img && img.attributes) {
                cover = img.attributes["data-src"] || img.attributes.src || img.attributes["data-original"] || ""
            }

            seen[match[1]] = true
            comics.push(new Comic({
                id: "/comic_" + match[1] + ".html",
                title: title,
                cover: this.absoluteUrl(cover)
            }))
        }
        return comics
    }

    // ========== 通用解析 ==========
    normalizeComicUrl(id) {
        let value = String(id || "")
        if (/^https?:\/\//i.test(value)) return value
        return this.absoluteUrl(value)
    }

    absoluteUrl(value) {
        if (!value) return ""
        value = String(value).trim()
        if (/^https?:\/\//i.test(value)) return value
        if (value.indexOf("//") === 0) return "https:" + value
        return this.baseUrl + (value.indexOf("/") === 0 ? value : "/" + value)
    }

    text(element) {
        return element && element.text ? String(element.text).replace(/\s+/g, " ").trim() : ""
    }

    parseComics(doc) {
        let comics = []
        let seen = {}

        let coverLinks = doc.querySelectorAll("a.comic-cover")
        for (let coverLink of coverLinks) {
            let href = String(coverLink.attributes.href || "")
            let match = href.match(/comic_([^?#.\/]+)\.html/i)
            if (!match || seen[match[1]]) continue
            let image = coverLink.querySelector("img")
            let title = ""
            let titleLink = doc.querySelector('h3 a[href="' + href + '"]')
            if (titleLink) title = this.text(titleLink)
            if (!title && image && image.attributes) title = image.attributes.alt || ""
            if (!title) continue
            let cover = ""
            if (image && image.attributes) cover = image.attributes["data-original"] || image.attributes["data-src"] || image.attributes.src || ""
            seen[match[1]] = true
            comics.push(new Comic({
                id: "/comic_" + match[1] + ".html",
                title: title,
                cover: this.absoluteUrl(cover)
            }))
        }

        let itemLinks = doc.querySelectorAll("a.comic-item")
        for (let item of itemLinks) {
            let href = String(item.attributes.href || "")
            let match = href.match(/comic_([^?#.\/]+)\.html/i)
            if (!match || seen[match[1]]) continue
            let img = item.querySelector("img")
            let title = this.text(item.querySelector("h3.comic-title")) || (img && img.attributes.alt) || ""
            if (!title) continue
            let cover = img ? (img.attributes.src || "") : ""
            seen[match[1]] = true
            comics.push(new Comic({
                id: "/comic_" + match[1] + ".html",
                title: title,
                cover: this.absoluteUrl(cover)
            }))
        }

        if (comics.length === 0) {
            let links = doc.querySelectorAll("a[href*='comic_']")
            for (let link of links) {
                let href = String(link.attributes.href || "")
                let match = href.match(/comic_([^?#.\/]+)\.html/i)
                if (!match || seen[match[1]]) continue
                let img = link.querySelector("img")
                let title = link.attributes.title || (img && img.attributes.alt) || this.text(link)
                if (!title) continue
                let cover = img ? (img.attributes["data-src"] || img.attributes.src || "") : ""
                seen[match[1]] = true
                comics.push(new Comic({
                    id: "/comic_" + match[1] + ".html",
                    title: title,
                    cover: this.absoluteUrl(cover)
                }))
            }
        }

        return comics
    }

    parseSearchResults(doc) {
        let comics = []
        let seen = {}
        let links = doc.querySelectorAll("a.comic-cover")

        for (let link of links) {
            let href = String(link.attributes.href || "")
            let match = href.match(/\/comic_[^?#]+\.html/i)
            if (!match || seen[match[0]]) continue

            let image = link.querySelector("img")
            let title = ""
            let titleLink = doc.querySelector('h3 a[href="' + href + '"]')
            if (titleLink) title = this.text(titleLink)
            if (!title && image && image.attributes) title = image.attributes.alt || ""
            if (!title) continue

            let cover = ""
            if (image && image.attributes) {
                cover = image.attributes["data-src"] || image.attributes.src || ""
            }

            seen[match[0]] = true
            comics.push(new Comic({
                id: match[0],
                title: title,
                cover: this.absoluteUrl(cover)
            }))
        }
        return comics
    }
}