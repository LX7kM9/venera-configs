/** @type {import('../_venera_.js')} */
class Dm5Source extends ComicSource {
    name = "动漫屋"
    key = "dm5"
    version = "2.0.4"      // 发现页回退单页 + 放宽封面选择
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/dm5.js"

    init() { }

    // ==================================================
    // 主域名设置
    // ==================================================
    settings = {
        domain: {
            title: "主域名",
            type: "input",
            default: "m.dm5.com"
        }
    };

    get baseUrl() {
        let domain = this.loadSetting("domain");
        if (!domain) domain = "m.dm5.com";
        domain = String(domain)
            .trim()
            .replace(/^https?:\/\//i, "")
            .replace(/\/+$/, "");
        return "https://" + domain;
    }

    // ==================================================
    // 请求头
    // ==================================================
    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        };
    }

    _buildImageHeaders(imageUrl, referer) {
        let host = "";
        try {
            let u = new URL(imageUrl);
            host = u.host;
        } catch (e) {
            let m = imageUrl.match(/^https?:\/\/([^\/]+)/i);
            host = m ? m[1] : "";
        }

        return {
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Pragma": "no-cache",
            "Referer": referer || (this.baseUrl + "/"),
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
        };
    }

    get imageHeaders() {
        return this._buildImageHeaders("", this.baseUrl + "/");
    }

    // ==================================================
    // URL/文本清理工具
    // ==================================================
    cleanUrl(url) {
        if (!url) return "";
        return String(url)
            .replace(/&amp;/g, "&")
            .replace(/\\u0026/g, "&")
            .replace(/\\\//g, "/")
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\+$/g, "")
            .trim();
    }

    cleanText(text) {
        if (!text) return "";
        return String(text).replace(/\s+/g, " ").trim();
    }

    toAbsoluteUrl(url) {
        if (!url) return "";
        url = this.cleanUrl(url);
        if (!url) return "";
        if (/^https?:\/\//i.test(url)) return url;
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return this.baseUrl + url;
        return this.baseUrl + "/" + url;
    }

    getImageUrl(element) {
        if (!element) return "";
        let attrs = element.attributes || {};
        let url =
            attrs["data-src"] ||
            attrs["data-original"] ||
            attrs["data-lazy-src"] ||
            attrs["data-url"] ||
            attrs["data-image"] ||
            attrs["src"] ||
            "";
        return this.toAbsoluteUrl(url);
    }

    // ==================================================
    // 封面识别
    // ==================================================
    // 严格的「真实竖版封面」判定：用于优先挑选
    isRealCover(url, className) {
        const s = String(url || "");
        if (!/^https?:\/\//i.test(s)) return false;
        if (s.indexOf("_320x246") >= 0 || s.indexOf("_880x385") >= 0) return false;
        if (/\/dm5\/images?\//i.test(s) || /\/images\/mobile\//i.test(s)) return false;
        if (/\.(?:gif|svg)(?:\?|$)/i.test(s)) return false;

        const cls = String(className || "");
        if (cls.indexOf("manga-list-1-cover-img") >= 0) return false;
        if (cls.indexOf("rank-list-cover-img") >= 0) return false;
        return true;
    }

    // 宽松的「可用图片」判定：仅排除站点 UI 图标、gif/svg。用于兜底，避免封面为空
    isUsableImage(url) {
        const s = String(url || "");
        if (!/^https?:\/\//i.test(s)) return false;
        if (/\/dm5\/images?\//i.test(s) || /\/images\/mobile\//i.test(s)) return false;
        if (/\.(?:gif|svg)(?:\?|$)/i.test(s)) return false;
        return true;
    }

    // 挑选封面：竖版封面优先，挑不到用任意可用图片兜底
    pickCover(anchor) {
        if (!anchor) return "";
        // 1) 首选：真正的竖版封面
        const preferred = [
            "manga-list-2-cover-img",
            "book-list-cover-img",
            "detail-main-cover-img",
            "detail-main-bg"
        ];
        for (const cls of preferred) {
            const img = anchor.querySelector("img." + cls);
            if (!img) continue;
            const url = this.getImageUrl(img);
            if (this.isRealCover(url, cls)) return url;
        }
        // 2) 次选：任何真实竖版封面
        for (const img of anchor.querySelectorAll("img")) {
            const url = this.getImageUrl(img);
            if (this.isRealCover(url, img.attributes["class"])) return url;
        }
        // 3) 兜底：任何可用图片（放宽，避免部分卡片封面为空）
        for (const img of anchor.querySelectorAll("img")) {
            const url = this.getImageUrl(img);
            if (this.isUsableImage(url)) return url;
        }
        return "";
    }

    // ==================================================
    // 漫画 ID 工具
    // ==================================================
    getComicId(href) {
        if (!href) return null;
        href = String(href).split("?")[0].split("#")[0].replace(/\/+$/, "");
        let match = href.match(/\/(manhua-[^/]+)$/i);
        if (match) return match[1];
        match = href.match(/\/(m\d+)$/i);
        if (match) return match[1];
        return null;
    }

    isComicUrl(href) {
        if (!href) return false;
        href = String(href).split("?")[0].split("#")[0];
        return /\/manhua-[^/]+\/?$/i.test(href) || /\/m\d+\/?$/i.test(href);
    }

    getComicUrl(id) {
        if (!id) return "";
        id = String(id).trim();
        if (!id) return "";
        if (/^https?:\/\//i.test(id)) return id;
        if (id.startsWith("manhua-")) return this.baseUrl + "/" + id + "/";
        if (/^m\d+$/i.test(id)) return this.baseUrl + "/" + id + "/";
        return this.baseUrl + "/" + id + "/";
    }

    // ==================================================
    // DM5 P.A.C.K.E.R. 解包
    // ==================================================
    unpackDM5(html) {
        if (!html) return "";
        let result = html;
        const maxLoop = 10;

        for (let loop = 0; loop < maxLoop; loop++) {
            const match = result.match(
                /eval\s*\(\s*function\s*\(p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)\s*\{([\s\S]*?)\}\s*\(\s*(['"])([\s\S]*?)\2\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])([\s\S]*?)\6\.split\(['"]\|['"]\)\s*,\s*0\s*,\s*\{\}\s*\)\s*\)/
            );
            if (!match) break;

            const packed = match[3];
            const radix = parseInt(match[4], 10);
            const count = parseInt(match[5], 10);
            const dictionaryString = match[7];

            if (!packed || !radix || !count || dictionaryString === undefined) break;

            const dictionary = dictionaryString.split("|");

            function encode(num) {
                let result = "";
                do {
                    const remainder = num % radix;
                    num = Math.floor(num / radix);
                    if (remainder > 35) {
                        result += String.fromCharCode(remainder + 29);
                    } else {
                        result += remainder.toString(36);
                    }
                } while (num > 0);
                return result.split("").reverse().join("");
            }

            let unpacked = packed;
            for (let i = count - 1; i >= 0; i--) {
                const key = encode(i);
                const value = dictionary[i] || key;
                const keyRegex = new RegExp("\\b" + key + "\\b", "g");
                unpacked = unpacked.replace(keyRegex, value);
            }
            if (unpacked === packed) break;
            result = result.replace(match[0], unpacked);
        }

        return result;
    }

    extractNewImgs(html) {
        let images = [];
        if (!html) return images;
        const newImgsMatch = html.match(
            /(?:var\s+)?newImgs\s*=\s*(?:new\s+Array\s*\()?\s*\[([\s\S]*?)\]/i
        );
        if (!newImgsMatch) return images;
        const body = newImgsMatch[1];
        const urlRegex = /(['"])(.*?)\1/g;
        let match;
        while ((match = urlRegex.exec(body)) !== null) {
            let url = this.cleanUrl(match[2]);
            if (/^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) {
                if (!images.includes(url)) images.push(url);
            }
        }
        return images;
    }

    extractImages(html) {
        if (!html) return [];
        let images = [];

        images = this.extractNewImgs(html);
        if (images.length > 0) return [...new Set(images)];

        const fullRegex = /https?:\/\/[^"'\\\s<>]+?\.(?:jpg|jpeg|png|webp)\?[^"'\\\s<>]+/gi;
        let match;
        while ((match = fullRegex.exec(html)) !== null) {
            let url = this.cleanUrl(match[0]);
            if (!images.includes(url)) images.push(url);
        }
        if (images.length > 0) return [...new Set(images)];

        const cidRegex = /https?:\/\/[^"'\\\s<>]+?\.jpg\?cid=\d+&key=[^"'\\\s<>]+?&type=\d+/gi;
        while ((match = cidRegex.exec(html)) !== null) {
            let url = this.cleanUrl(match[0]);
            if (!images.includes(url)) images.push(url);
        }
        if (images.length > 0) return [...new Set(images)];

        const attrRegex = /(?:data-src|data-original|data-lazy-src|data-url|data-image|src)\s*=\s*["']([^"']+)["']/gi;
        while ((match = attrRegex.exec(html)) !== null) {
            let url = this.cleanUrl(match[1]);
            if (/^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) {
                if (!images.includes(url)) images.push(url);
            }
        }
        images = images.filter(url => !url.includes("page_default_img"));
        return [...new Set(images)];
    }

    // ==================================================
    // 探索页（回退到单页：banner + 分类列表）
    // ==================================================
    explore = [
        {
            title: "动漫屋",
            type: "singlePageWithMultiPart",
            load: async () => {
                const res = await Network.get(this.baseUrl + "/", this.headers);
                if (res.status !== 200) throw "Invalid status code: " + res.status;

                const document = new HtmlDocument(res.body);
                const result = {};
                const seen = new Set();

                // ========== 1) 首页 banner ==========
                const banner = document.querySelector(".index-banner");
                if (banner) {
                    const comics = [];
                    const items = banner.querySelectorAll("li");
                    for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        const a = item.querySelector("a");
                        if (!a) continue;

                        const href = a.attributes["href"] || "";
                        if (!this.isComicUrl(href)) continue;

                        const id = this.getComicId(href);
                        if (!id || seen.has(id)) continue;

                        const img = item.querySelector("img");
                        let title = this.cleanText(a.attributes["title"]);
                        if (!title && img) title = this.cleanText(img.attributes["alt"] || "");
                        if (!title) title = this.cleanText(a.text);
                        if (!title) continue;

                        const cover = this.pickCover(item) || this.pickCover(a);

                        seen.add(id);
                        comics.push({
                            id: String(id),
                            title: String(title),
                            cover: String(cover || ""),
                            description: ""
                        });
                    }
                    if (comics.length > 0) result["热门推荐"] = comics;
                }

                // ========== 2) 各分类列表 ==========
                const lists = document.querySelectorAll(".manga-list");
                for (let i = 0; i < lists.length; i++) {
                    const list = lists[i];
                    const titleNode = list.querySelector(".manga-list-title");
                    let title = titleNode ? this.cleanText(titleNode.text) : "";

                    const comics = [];
                    const items = list.querySelectorAll("li");
                    for (let j = 0; j < items.length; j++) {
                        const item = items[j];
                        const a = item.querySelector("a");
                        if (!a) continue;

                        const href = a.attributes["href"] || "";
                        if (!this.isComicUrl(href)) continue;

                        const id = this.getComicId(href);
                        if (!id || seen.has(id)) continue;

                        const img = item.querySelector("img");
                        let comicTitle = this.cleanText(a.attributes["title"]);
                        if (!comicTitle) {
                            const t = item.querySelector(".manga-list-2-title");
                            if (t) comicTitle = this.cleanText(t.text);
                        }
                        if (!comicTitle && img) comicTitle = this.cleanText(img.attributes["alt"] || "");
                        if (!comicTitle) comicTitle = this.cleanText(a.text);
                        if (!comicTitle) continue;

                        const tip = item.querySelector(".manga-list-1-tip") || item.querySelector(".manga-list-2-tip");
                        const desc = tip ? this.cleanText(tip.text) : "";
                        const badgeNode = item.querySelector(".manga-list-1-cover-logo-font");
                        const badge = badgeNode ? this.cleanText(badgeNode.text) : "";

                        const cover = this.pickCover(a);

                        seen.add(id);
                        comics.push({
                            id: String(id),
                            title: String(comicTitle),
                            cover: String(cover || ""),
                            description: String(desc || ""),
                            tags: badge ? [badge] : []
                        });
                    }

                    if (comics.length > 0) {
                        if (!title) {
                            if (comics[0].tags && comics[0].tags.length > 0) title = comics[0].tags[0];
                            else title = "漫画列表";
                        }
                        if (result[title]) {
                            result[title] = result[title].concat(comics);
                        } else {
                            result[title] = comics;
                        }
                    }
                }

                return result;
            }
        }
    ];

    // ==================================================
    // 搜索
    // ==================================================
    search = {
        load: async (keyword, options, page) => {
            const url = this.baseUrl
                + "/search?f=2&language=1&title="
                + encodeURIComponent(String(keyword || ""))
                + "&page=" + String(page || 1);

            const res = await Network.get(url, this.headers);
            if (res.status === 404) return { comics: [], maxPage: page };
            if (res.status !== 200) throw "Invalid status code: " + res.status;

            const document = new HtmlDocument(res.body);
            const comics = [];
            const seen = new Set();

            for (const a of document.querySelectorAll("a")) {
                const href = a.attributes["href"] || "";
                if (!this.isComicUrl(href)) continue;

                const id = this.getComicId(href);
                if (!id || seen.has(id)) continue;

                const img = a.querySelector("img");
                let title = this.cleanText(a.text);
                if (!title && img) title = this.cleanText(img.attributes["alt"] || "");
                if (!title) title = this.cleanText(a.attributes["title"] || "");
                if (!title) title = "漫画 " + String(id);

                const cover = this.pickCover(a);
                seen.add(id);

                if (cover) {
                    comics.push({
                        id: String(id),
                        title: String(title),
                        cover: String(cover)
                    });
                }
            }

            return {
                comics: comics,
                maxPage: comics.length > 0 ? Number(page || 1) + 1 : Number(page || 1)
            };
        },
        optionList: [],
        enableTagsSuggestions: false
    };

    // ==================================================
    // 分类
    // ==================================================
    static dm5Tags = [
        ["校园", "tag1"], ["冒险", "tag2"], ["历史", "tag4"], ["后宫", "tag8"],
        ["战争", "tag12"], ["奇幻", "tag14"], ["魔法", "tag15"], ["悬疑", "tag17"],
        ["神鬼", "tag20"], ["科幻", "tag25"], ["恋爱", "tag26"], ["同人", "tag30"],
        ["热血", "tag31"], ["推理", "tag33"], ["运动", "tag34"], ["绅士", "tag36"],
        ["搞笑", "tag37"], ["机甲", "tag40"]
    ];
    static dm5Areas = [["港台", "area35"], ["日韩", "area36"], ["大陆", "area37"], ["欧美", "area52"]];
    static dm5Groups = [["少年向", "group1"], ["少女向", "group2"], ["青年向", "group3"]];
    static dm5Status = [["连载中", "st1"], ["已完结", "st2"]];

    category = {
        title: "动漫屋",
        parts: [
            {
                name: "题材",
                type: "fixed",
                itemType: "category",
                categories: ["全部"].concat(Dm5Source.dm5Tags.map((e) => e[0])),
                categoryParams: [""].concat(Dm5Source.dm5Tags.map((e) => e[1]))
            },
            {
                name: "地区",
                type: "fixed",
                itemType: "category",
                categories: ["全部"].concat(Dm5Source.dm5Areas.map((e) => e[0])),
                categoryParams: [""].concat(Dm5Source.dm5Areas.map((e) => e[1]))
            },
            {
                name: "受众",
                type: "fixed",
                itemType: "category",
                categories: ["全部"].concat(Dm5Source.dm5Groups.map((e) => e[0])),
                categoryParams: [""].concat(Dm5Source.dm5Groups.map((e) => e[1]))
            },
            {
                name: "状态",
                type: "fixed",
                itemType: "category",
                categories: ["全部"].concat(Dm5Source.dm5Status.map((e) => e[0])),
                categoryParams: [""].concat(Dm5Source.dm5Status.map((e) => e[1]))
            }
        ],
        enableRankingPage: false
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            const pageNum = Number(page || 1) > 0 ? Number(page || 1) : 1;

            const optValue = (i) => {
                const raw = options && options[i] != null ? String(options[i]) : "";
                const v = raw.split("-")[0].trim();
                return v === "x" ? "" : v;
            };

            const seg = String(param || "").trim().replace(/^-+/, "");
            let path = "manhua-list";
            if (/^(?:tag|area|group|st)\d+$/.test(seg)) {
                path += "-" + seg;
            }

            const sortOpt = optValue(0);
            if (sortOpt && sortOpt !== "s10") path += "-" + sortOpt;
            const payOpt = optValue(1);
            if (payOpt && /^pay\d+$/.test(payOpt)) path += "-" + payOpt;

            if (pageNum > 1) path += "-p" + pageNum;

            const url = this.baseUrl + "/" + path + "/";

            const res = await Network.get(url, this.headers);
            if (res.status !== 200) throw "加载分类失败: " + res.status;

            const document = new HtmlDocument(res.body);
            const comics = [];
            const seen = new Set();

            const listItems = document.querySelectorAll(
                ".manga-list-2 li, .manga-list li, .book-list li"
            );

            if (listItems.length > 0) {
                for (const item of listItems) {
                    const a = item.querySelector("a");
                    if (!a) continue;

                    const href = a.attributes["href"] || "";
                    if (!this.isComicUrl(href)) continue;

                    const id = this.getComicId(href);
                    if (!id || seen.has(id)) continue;

                    const img = item.querySelector("img");
                    let title = this.cleanText(
                        (item.querySelector(".title, .book-list-info-title, .manga-list-2-title")?.text) || a.text
                    );
                    if (!title && img) title = this.cleanText(img.attributes["alt"] || "");
                    if (!title) title = this.cleanText(a.attributes["title"] || "");
                    if (!title) title = "漫画 " + id;

                    const cover = this.pickCover(a);
                    seen.add(id);

                    comics.push({
                        id: String(id),
                        title: String(title),
                        cover: this.toAbsoluteUrl(cover)
                    });
                }
            }

            if (comics.length === 0) {
                for (const a of document.querySelectorAll("a")) {
                    const href = a.attributes["href"] || "";
                    if (!this.isComicUrl(href)) continue;

                    const id = this.getComicId(href);
                    if (!id || seen.has(id)) continue;

                    const img = a.querySelector("img");
                    let title = this.cleanText(a.text);
                    if (!title && img) title = this.cleanText(img.attributes["alt"] || "");
                    if (!title) title = this.cleanText(a.attributes["title"] || "");
                    if (!title) title = "漫画 " + id;

                    const cover = this.pickCover(a);
                    seen.add(id);

                    comics.push({
                        id: String(id),
                        title: String(title),
                        cover: this.toAbsoluteUrl(cover)
                    });
                }
            }

            return {
                comics: comics,
                maxPage: (() => {
                    const pageSize = Number((String(res.body).match(/var pagesize = "(\d+)"/) || [])[1]) || 0;
                    return pageSize > 0 && comics.length >= pageSize ? pageNum + 1 : pageNum;
                })()
            };
        },
        optionList: [
            {
                type: 'select',
                label: '排序',
                options: ['s10-人气最旺', 's2-最近更新', 's18-最新上架'],
                default: 's10'
            },
            {
                type: 'select',
                label: '付费',
                options: ['x-全部', 'pay0-免费', 'pay1-付费', 'pay2-VIP免费'],
                default: 'x'
            }
        ]
    };

    // ==================================================
    // 漫画详情
    // ==================================================
    comic = {
        loadInfo: async (id) => {
            const comicId = String(id || "");
            const url = this.getComicUrl(comicId);

            const res = await Network.get(url, this.headers);
            if (res.status !== 200) throw "Invalid status code: " + res.status;

            const document = new HtmlDocument(res.body);

            let title = "";
            const titleElement =
                document.querySelector(".detail-main-info-title") ||
                document.querySelector(".normal-top-title") ||
                document.querySelector("h1") ||
                document.querySelector(".book-title") ||
                document.querySelector(".comic-title");
            if (titleElement) title = this.cleanText(titleElement.text);
            if (!title) title = "漫画 " + comicId;

            let cover = "";
            const coverSelectors = [
                ".detail-main-cover img",
                "img.detail-main-bg",
                ".book-cover img",
                ".comic-cover img",
                ".cover img",
                ".book-img img",
                ".detail-cover img"
            ];
            for (const selector of coverSelectors) {
                const img = document.querySelector(selector);
                if (!img) continue;
                cover = this.getImageUrl(img);
                if (cover) break;
            }
            if (!cover) {
                const allImgs = document.querySelectorAll("img");
                for (const img of allImgs) {
                    const src = this.getImageUrl(img);
                    if (this.isUsableImage(src)) {
                        cover = src;
                        break;
                    }
                }
            }

            let description = "";
            const descEl = document.querySelector(".detail-desc");
            if (descEl) description = this.cleanText(descEl.text);
            if (!description) {
                const meta = document.querySelector("meta[name='Description']");
                if (meta) description = String(meta.attributes["content"] || "");
            }

            const authors = [];
            for (const a of document.querySelectorAll(".detail-main-info-author a")) {
                const t = this.cleanText(a.text);
                if (t && authors.indexOf(t) < 0) authors.push(t);
            }

            const genreTags = [];
            for (const a of document.querySelectorAll(".detail-main-info-class a")) {
                const t = this.cleanText(a.text);
                if (t && genreTags.indexOf(t) < 0) genreTags.push(t);
            }

            // 章节列表
            const chapters = new Map();
            const seen = new Set();

            for (const a of document.querySelectorAll(".detail-list-select a")) {
                let href = a.attributes["href"] || "";
                href = href.split("?")[0];

                let chapterId = null;
                let match = href.match(/\/(m\d+(?:-p\d+)?)\/?$/i);
                if (match) chapterId = match[1];
                if (!chapterId) {
                    match = href.match(/\/(manhua-[^/]+-[^/]+)$/i);
                    if (match) chapterId = match[1];
                }
                if (!chapterId || seen.has(chapterId)) continue;

                let chapterTitle = this.cleanText(a.text);
                chapterTitle = chapterTitle.replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim();
                if (!chapterTitle) chapterTitle = String(chapterId);

                seen.add(chapterId);
                chapters.set(String(chapterId), String(chapterTitle));
            }

            // 提取 mid（评论系统用）
            const html = res.body || "";
            let mid = null;
            const midMatch = html.match(/mid["\s:]*(\d+)/i)
                || html.match(/var mid = (\d+)/i)
                || html.match(/mid=(\d+)/i)
                || html.match(/var DM5_MID = (\d+)/i)
                || html.match(/var COMIC_MID=(\d+)/i);
            if (midMatch) mid = parseInt(midMatch[1]);

            const detailUrl = url;

            return new ComicDetails({
                title: String(title),
                cover: String(cover || ""),
                description: String(description),
                tags: (() => {
                    const t = {};
                    if (authors.length > 0) t["作者"] = authors;
                    if (genreTags.length > 0) t["标签"] = genreTags;
                    return t;
                })(),
                chapters: chapters,
                subId: mid ? mid.toString() : '73225',
                url: detailUrl
            });
        },

        loadEp: async (comicId, epId) => {
            const chapterId = String(epId || "");
            const chapterUrl = this.getComicUrl(chapterId);

            const res = await Network.get(chapterUrl, {
                ...this.headers,
                "Referer": chapterUrl
            });
            if (res.status !== 200) throw "Invalid status code: " + res.status;

            const html = res.body;

            const decoded = this.unpackDM5(html);
            let images = this.extractImages(decoded);
            if (images.length === 0) images = this.extractImages(html);

            if (images.length === 0) throw "未找到章节图片";

            images = images
                .map(url => this.cleanUrl(url))
                .filter(url => /^https?:\/\//i.test(url))
                .filter(url => !url.endsWith("\\"));

            if (images.length === 0) throw "章节图片 URL 无效";

            return { images: [...new Set(images)] };
        },

        onImageLoad: (url, comicId, epId) => {
            let referer = "";
            if (epId && typeof epId === "string") {
                if (!epId.startsWith("http")) {
                    referer = this.getComicUrl(epId);
                    if (!referer.endsWith("/")) referer += "/";
                } else {
                    referer = epId;
                }
            } else {
                referer = this.baseUrl + "/";
            }
            return { headers: this._buildImageHeaders(url, referer) };
        },

        onThumbnailLoad: (url) => {
            return { headers: this._buildImageHeaders(url, this.baseUrl + "/") };
        },

        likeComic: async (id, isLike) => { /* 暂不实现 */ },

        // ==================================================
        // 漫画评论
        // ==================================================
        loadComments: async (comicId, subId, page, replyTo) => {
            if (!subId) throw new Error('漫画ID未找到，无法加载评论');
            let requestPage = page;
            let targetCommentId = null;
            if (replyTo) {
                let parts = replyTo.split('//');
                targetCommentId = parts[0];
                requestPage = parseInt(parts[1]);
            }

            let comicSlug = String(comicId || '').replace(/^\/+|\/+$/g, '');

            let url = `${this.baseUrl}/${comicSlug}/pagerdata.ashx`;
            let params = {
                d: Date.now(),
                pageindex: (requestPage - 1),
                pagesize: 767,
                mid: subId,
                t: 4
            };
            let query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
            url += '?' + query;

            let headers = {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'host': 'm.dm5.com',
                'pragma': 'no-cache',
                'referer': `${this.baseUrl}/${comicSlug}/`,
                'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
                'x-requested-with': 'XMLHttpRequest'
            };

            let res = await Network.get(url, headers);
            if (res.status !== 200) throw new Error(`加载评论失败，状态码: ${res.status}`);
            let data = JSON.parse(res.body);
            let comments = [];
            let maxPage = 0;
            if (replyTo) {
                let target = data.find(item => item.Id.toString() === targetCommentId);
                if (target && target.ToPostShowDataItems) {
                    comments = target.ToPostShowDataItems.map(item => new Comment({
                        id: item.Id.toString(),
                        userName: item.Poster,
                        content: item.PostContent,
                        time: item.PostTime,
                        avatar: item.HeadUrl,
                        likeCount: item.PraiseCount,
                        isLiked: item.IsPraise,
                        replyCount: 0
                    }));
                }
            } else {
                comments = data.map(item => new Comment({
                    id: `${item.Id}//${page}`,
                    userName: item.Poster,
                    content: item.PostContent,
                    time: item.PostTime,
                    avatar: item.HeadUrl,
                    likeCount: item.PraiseCount,
                    isLiked: item.IsPraise,
                    replyCount: item.ToPostShowDataItems ? item.ToPostShowDataItems.length : 0
                }));
                maxPage = (comments.length === 0) ? page : null;
            }
            return { comments, maxPage: replyTo ? 1 : maxPage };
        },

        // ==================================================
        // 章节评论
        // ==================================================
        loadChapterComments: async (comicId, epId, page, replyTo) => {
            let cidMatch = epId.match(/m(\d+)/);
            let cid = cidMatch ? cidMatch[1] : null;
            if (!cid) {
                let match = epId.match(/(\d+)\/?$/);
                if (match) cid = match[1];
            }
            if (!cid) return { comments: [], maxPage: page };

            let requestPage = page;
            let targetCommentId = null;
            if (replyTo) {
                let parts = replyTo.split('//');
                targetCommentId = parts[0];
                requestPage = parseInt(parts[1]);
            }

            let pageSize = 20;
            let url = `${this.baseUrl}/showcomment/pagerdata.ashx?d=${Date.now()}&pageindex=${requestPage}&pagesize=${pageSize}&cid=${cid}&t=9`;
            let headers = {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'host': 'm.dm5.com',
                'pragma': 'no-cache',
                'referer': `${this.baseUrl}/showcomment/?cid=${cid}`,
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                'x-requested-with': 'XMLHttpRequest'
            };

            let res = await Network.get(url, headers);
            if (res.status !== 200) return { comments: [], maxPage: page };
            let data = [];
            try { data = JSON.parse(res.body); } catch (e) { }
            if (!Array.isArray(data)) return { comments: [], maxPage: page };

            let comments = [];
            let maxPage = 0;
            if (replyTo) {
                let target = data.find(item => item.Id.toString() === targetCommentId);
                if (target && target.ToPostShowDataItems) {
                    comments = target.ToPostShowDataItems.map(item => new Comment({
                        id: item.Id.toString(),
                        userName: item.Poster,
                        content: item.PostContent,
                        time: item.PostTime,
                        avatar: item.HeadUrl,
                        likeCount: item.PraiseCount,
                        isLiked: item.IsPraise,
                        replyCount: 0
                    }));
                }
            } else {
                comments = data.map(item => new Comment({
                    id: `${item.Id}//${page}`,
                    userName: item.Poster,
                    content: item.PostContent,
                    time: item.PostTime,
                    avatar: item.HeadUrl,
                    likeCount: item.PraiseCount,
                    isLiked: item.IsPraise,
                    replyCount: item.ToPostShowDataItems ? item.ToPostShowDataItems.length : 0
                }));
                maxPage = (comments.length === 0) ? page : null;
            }
            return { comments, maxPage: replyTo ? 1 : maxPage };
        },

        // ==================================================
        // 链接解析
        // ==================================================
        link: {
            domains: ["m.dm5.com"],
            linkToId: (url) => {
                let id = this.getComicId(url);
                if (id) return id;
                return null;
            }
        }
    };
}