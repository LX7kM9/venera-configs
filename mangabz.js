/** @type {import('./_venera_.js')} */
class MangabzSource extends ComicSource {
    name = "Mangabz"
    key = "mangabz"
    version = "0.9.3"  // 分类页全部写死固定链接
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/mangabz.js"

    get baseUrl() { return "https://www.mangabz.com" }

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

    text(el) { return el ? (el.text || "").trim().replace(/\s+/g, " ") : "" }
    attr(el, name) { return el && el.attributes ? (el.attributes[name] || "") : "" }

    async getText(url, referer) {
        let headers = Object.assign({}, this.headers)
        if (referer) headers["Referer"] = referer
        let res = await Network.get(url, headers)
        if (res.status !== 200) throw `Request Error: ${res.status} ${url}`
        return res.body || ""
    }

    async getDoc(url, referer) {
        return new HtmlDocument(await this.getText(url, referer))
    }

    // ---------- 解析工具 ----------
    parseComicItem(a) {
        let href = this.attr(a, "href")
        if (!href || !/\/\d+bz\/?$/i.test(href)) return null
        let img = a.querySelector("img")
        let title = this.attr(a, "title") || this.attr(img, "alt") || this.text(a)
        title = title.split(/\s{2,}/)[0].trim()
        let cover = this.attr(img, "data-src") || this.attr(img, "data-original") || this.attr(img, "src")
        let id = this.abs(href)
        if (!title) return null
        return new Comic({ id, title, cover: this.abs(cover), description: this.baseUrl })
    }

    parseCategoryItem(item) {
        let a = item.querySelector("a")
        let img = item.querySelector("img")
        let titleEl = item.querySelector(".manga-i-list-title")
        let subEl = item.querySelector(".manga-i-list-subtitle")
        if (!a || !img || !titleEl) return null

        let href = this.attr(a, "href")
        let cover = this.attr(img, "src") || this.attr(img, "data-src") || ""
        let name = this.text(titleEl)
        let desc = this.text(subEl) || ""
        let id = this.abs(href)
        if (!id || !name) return null

        return new Comic({
            id: id,
            title: name,
            cover: this.abs(cover),
            description: desc
        })
    }

    parseComicList(doc) {
        let list = []
        let seen = {}
        for (let a of doc.querySelectorAll("a")) {
            let c = this.parseComicItem(a)
            if (c && !seen[c.id]) {
                seen[c.id] = true
                list.push(c)
            }
        }
        return list
    }

    parseTitle(html, doc) {
        let m = html.match(/<title[^>]*>([^<]+)/i)
        let title = m ? m[1].replace(/漫畫.*/, "").trim() : ""
        return title || this.text(doc.querySelector("h1")) || this.text(doc.querySelector(".title"))
    }

    parseChapters(doc) {
        let chapterItems = doc.querySelectorAll(".detail-list-item a")
        let chapterList = []
        for (let a of chapterItems) {
            let href = this.attr(a, "href")
            if (!href || !/^\/m\d+\/?$/i.test(href)) continue
            let name = this.text(a) || this.attr(a, "title") || ""
            if (!name) continue
            chapterList.push({ url: this.abs(href), name: name })
        }
        chapterList.sort((a, b) => {
            let numA = parseInt(a.name.replace(/[^0-9]/g, ""))
            let numB = parseInt(b.name.replace(/[^0-9]/g, ""))
            if (isNaN(numA) || isNaN(numB)) {
                return a.name.localeCompare(b.name)
            }
            return numA - numB
        })
        let chapters = {}
        for (let item of chapterList) {
            chapters[item.url] = item.name
        }
        return chapters
    }

    // ---------- 图片提取（已修复） ----------
    parseImagesFromPacked(html) {
        let scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi
        let evalScript = null
        let match
        while ((match = scriptRegex.exec(html)) !== null) {
            let content = match[1]
            if (content.includes('eval(function') && content.includes('.split(')) {
                evalScript = content
                break
            }
        }
        if (!evalScript) {
            return this._fallbackExtract(html)
        }

        let tokenStrMatch = evalScript.match(/eval\([^)]*,\s*\d+,\s*\d+,\s*['"]([^'"]*)['"]\s*\.split\(['"]\|['"]\)/)
        if (!tokenStrMatch) {
            let altMatch = evalScript.match(/,\s*['"]([^'"]*)['"]\s*\.split\(['"]\|['"]\)/)
            if (altMatch) tokenStrMatch = altMatch
            else return this._fallbackExtract(html)
        }

        let tokenStr = tokenStrMatch[1]
        let tokens = tokenStr.split('|')

        let cid = tokens[0] || ''
        let mid = tokens[2] || ''
        let key = tokens[4] || ''
        if (!mid || !cid || !key) {
            return this._fallbackExtract(html)
        }

        let fileNames = []
        for (let t of tokens) {
            if (/^\d+_[a-f0-9]+$/.test(t)) {
                fileNames.push(t)
            }
        }

        if (fileNames.length === 0) {
            let regex = /\b(\d+_[a-f0-9]+)\b/g
            let m
            while ((m = regex.exec(tokenStr)) !== null) {
                if (!fileNames.includes(m[1])) fileNames.push(m[1])
            }
        }

        if (fileNames.length === 0) {
            return this._fallbackExtract(html)
        }

        fileNames.sort((a, b) => parseInt(a.split('_')[0]) - parseInt(b.split('_')[0]))

        let base = "https://image.mangabz.com/1/" + mid + "/" + cid + "/"
        let images = fileNames.map(name => {
            return base + name + ".jpg?cid=" + cid + "&key=" + key + "&type=1"
        })

        return images
    }

    _fallbackExtract(html) {
        let match = html.match(/var\s+newImgs\s*=\s*(\[[\s\S]*?\])\s*;/)
        if (match) {
            try {
                let images = eval('(' + match[1] + ')')
                if (Array.isArray(images) && images.length > 0) {
                    return this._normalizeImages(images)
                }
            } catch (e) {}
        }

        let doc = new HtmlDocument(html)
        let allImages = []
        let imgNodes = doc.querySelectorAll("img")
        for (let img of imgNodes) {
            let src = this.attr(img, "data-src") || this.attr(img, "data-original") || this.attr(img, "src")
            if (src && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(src)) {
                let absUrl = this.abs(src)
                if (absUrl && !allImages.includes(absUrl)) {
                    allImages.push(absUrl)
                }
            }
        }
        doc.dispose()
        if (allImages.length) return allImages

        let regex = /https?:\/\/[^"']+\.(jpg|jpeg|png|webp|gif)(\?[^"']*)?/gi
        let matches = html.match(regex) || []
        let unique = []
        for (let u of matches) {
            let clean = u.replace(/\\/g, "")
            if (!unique.includes(clean)) unique.push(clean)
        }
        return unique
    }

    _normalizeImages(images) {
        let baseDomain = this.baseUrl.replace(/^https?:\/\//, '').split('/')[0]
        return images.map(u => {
            if (typeof u !== 'string') return null
            u = u.trim()
            if (!u) return null
            if (u.startsWith('//')) {
                let parts = u.split('/')
                if (parts.length >= 2) {
                    parts[1] = baseDomain
                    return 'https:' + parts.join('/')
                }
                return 'https:' + u
            }
            if (u.startsWith('http://') || u.startsWith('https://')) return u
            return this.abs(u)
        }).filter(u => u !== null && u.length > 0)
    }

    // ---------- 发现页 ----------
    explore = [
        {
            title: "Mangabz",
            type: "singlePageWithMultiPart",
            load: async () => {
                let doc = await this.getDoc(this.baseUrl + "/")
                let result = {}

                const sections = [
                    { title: "人氣推薦", key: "人气推荐" },
                    { title: "編輯推薦", key: "编辑推荐" },
                    { title: "上升最快", key: "上升最快" }
                ]

                let titleBars = doc.querySelectorAll(".index-title-bar")
                let lists = doc.querySelectorAll(".manga-i-list")
                let len = Math.min(titleBars.length, lists.length)
                for (let i = 0; i < len; i++) {
                    let bar = titleBars[i]
                    let list = lists[i]
                    let titleSpan = bar.querySelector(".index-title")
                    if (!titleSpan) continue
                    let title = this.text(titleSpan).trim()
                    let matched = sections.find(s => s.title === title)
                    if (!matched) continue

                    let comics = []
                    let items = list.querySelectorAll(".manga-i-list-item")
                    for (let item of items) {
                        let a = item.querySelector("a")
                        let img = item.querySelector("img")
                        let titleEl = item.querySelector(".manga-i-list-title")
                        let subEl = item.querySelector(".manga-i-list-subtitle")
                        if (!a || !img || !titleEl) continue

                        let href = this.attr(a, "href")
                        let cover = this.attr(img, "src") || this.attr(img, "data-src") || ""
                        let name = this.text(titleEl)
                        let desc = this.text(subEl) || ""
                        let id = this.abs(href)
                        if (!id || !name) continue

                        comics.push(new Comic({
                            id: id,
                            title: name,
                            cover: this.abs(cover),
                            description: desc
                        }))
                    }

                    if (comics.length) {
                        result[matched.key] = comics
                    }
                }

                doc.dispose()
                return result
            }
        },
        {
            title: "排行榜",
            type: "multiPageComicList",
            load: async (page) => {
                let doc = await this.getDoc(this.baseUrl + "/manga-rank/")
                let comics = []
                let items = doc.querySelectorAll(".manga-item")
                for (let item of items) {
                    let a = item.querySelector("a") || item
                    let img = item.querySelector("img")
                    let titleEl = item.querySelector(".manga-item-title")
                    let subEl = item.querySelector(".manga-item-subtitle")
                    let descEl = item.querySelector(".manga-item-content")

                    let href = this.attr(a, "href") || this.attr(item, "href")
                    let cover = this.attr(img, "src") || ""
                    let name = this.text(titleEl) || ""
                    let author = this.text(subEl) || ""
                    let desc = this.text(descEl) || ""
                    let id = this.abs(href)
                    if (!id || !name) continue

                    comics.push(new Comic({
                        id: id,
                        title: name,
                        cover: this.abs(cover),
                        subTitle: author,
                        description: desc
                    }))
                }
                doc.dispose()
                return { comics, maxPage: 1 }
            }
        }
    ]

    // ---------- 分类页（全部写死固定链接） ----------
    category = {
        title: "Mangabz",  // 标题改为 Mangabz
        parts: [
            {
                name: "主题",
                type: "fixed",
                categories: [
                    "全部",
                    "热血",
                    "恋爱",
                    "校园",
                    "冒险",
                    "科幻",
                    "生活",
                    "悬疑",
                    "魔法",
                    "运动"
                ],
                categoryParams: [
                    "https://www.mangabz.com/manga-list/",
                    "https://www.mangabz.com/manga-list-31-0-10/",
                    "https://www.mangabz.com/manga-list-26-0-10/",
                    "https://www.mangabz.com/manga-list-1-0-10/",
                    "https://www.mangabz.com/manga-list-2-0-10/",
                    "https://www.mangabz.com/manga-list-25-0-10/",
                    "https://www.mangabz.com/manga-list-11-0-10/",
                    "https://www.mangabz.com/manga-list-17-0-10/",
                    "https://www.mangabz.com/manga-list-15-0-10/",
                    "https://www.mangabz.com/manga-list-34-0-10/"
                ],
                itemType: "category"
            },
            {
                name: "状态",
                type: "fixed",
                categories: [
                    "全部",
                    "连载中",
                    "完结"
                ],
                categoryParams: [
                    "https://www.mangabz.com/manga-list/",
                    "https://www.mangabz.com/manga-list-0-1-10/",
                    "https://www.mangabz.com/manga-list-0-2-10/"
                ],
                itemType: "category"
            },
            {
                name: "排序",
                type: "fixed",
                categories: [
                    "人气",
                    "更新时间",
                    "上架时间"
                ],
                categoryParams: [
                    "https://www.mangabz.com/manga-list/",
                    "https://www.mangabz.com/manga-list-0-0-2/",
                    "https://www.mangabz.com/manga-list-0-0-18/"
                ],
                itemType: "category"
            }
        ],
        enableRankingPage: false
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            // param 就是完整的 URL，直接使用
            let url = param
            // 如果 URL 以 / 开头，补全域名
            if (url.startsWith("/")) {
                url = this.baseUrl + url
            }
            // 如果有分页参数
            if (page && page > 1) {
                // 简单分页：mangabz 的分页是 ?page=2 格式
                if (url.includes("?")) {
                    url += "&page=" + page
                } else {
                    url += "?page=" + page
                }
            }
            let doc = await this.getDoc(url)
            let comics = []
            let items = doc.querySelectorAll(".manga-i-list-item")
            for (let item of items) {
                let c = this.parseCategoryItem(item)
                if (c) comics.push(c)
            }
            // 分页
            let maxPage = page || 1
            let pageLinks = doc.querySelectorAll("a[href*='?page=']")
            let maxNum = 1
            for (let a of pageLinks) {
                let href = this.attr(a, "href")
                let m = href.match(/[?&]page=(\d+)/)
                if (m) {
                    let num = parseInt(m[1])
                    if (num > maxNum) maxNum = num
                }
            }
            if (maxNum > 1) maxPage = maxNum
            doc.dispose()
            return { comics, maxPage }
        },
        optionList: []
    }

    // ---------- 搜索 ----------
    search = {
        load: async (keyword, options, page) => {
            let doc = await this.getDoc(`${this.baseUrl}/search?title=${encodeURIComponent(keyword)}`)
            let comics = this.parseComicList(doc)
            doc.dispose()
            return { comics, maxPage: 1 }
        },
        optionList: []
    }

    // ---------- 漫画详情与阅读 ----------
    comic = {
        loadInfo: async (id) => {
            let html = await this.getText(id)
            let doc = new HtmlDocument(html)
            let title = this.parseTitle(html, doc) || "未知标题"
            let cover = this.attr(doc.querySelector(".cover img"), "src") || this.attr(doc.querySelector(".detail-list-form-con img"), "src") || this.attr(doc.querySelector("img"), "src")
            let desc = this.text(doc.querySelector(".detail-info-content")) || this.text(doc.querySelector(".comic_deCon")) || this.text(doc.querySelector(".desc")) || ""
            let chapters = this.parseChapters(doc) || {}
            doc.dispose()
            return new ComicDetails({
                title: title,
                subTitle: "",
                cover: this.abs(cover),
                description: desc,
                chapters: chapters,
                url: id,
                tags: {}
            })
        },
        loadEp: async (comicId, epId) => {
            let url = epId || comicId
            let html = await this.getText(url, comicId)
            let images = this.parseImagesFromPacked(html)
            if (!images.length) throw `No images parsed: ${url}`
            return { images }
        },
        onImageLoad: (url, comicId, epId) => ({ headers: Object.assign({}, this.headers, { "Referer": epId || comicId || this.baseUrl }) }),
        onThumbnailLoad: (url) => ({ headers: this.headers })
    }

    getHomePage = this.explore
    getComicInfo = this.comic.loadInfo
    getChapters = this.comic.loadInfo
    getImages = this.comic.loadEp
}