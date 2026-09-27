/** @type {import('../_venera_.js')} */
class ManHuaRen extends ComicSource {
    name = "漫画人"
    key = "manhuaren"
    version = "2.0.0"   // 移植 dm5 新功能
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/manhuaren.js"

    init() { }

    // ==================================================
    // 主域名设置
    // ==================================================
    settings = {
        domain: {
            title: "主域名",
            type: "input",
            default: "www.manhuaren.com"
        }
    };

    get baseUrl() {
        let domain = this.loadSetting("domain");
        if (!domain) domain = "www.manhuaren.com";
        domain = String(domain)
            .trim()
            .replace(/^https?:\/\//i, "")
            .replace(/\/+$/, "");
        return "https://" + domain;
    }

    // ==================================================
    // 统一请求头（动态 host）
    // ==================================================
    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": this.baseUrl + "/",
            "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"'
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
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Pragma": "no-cache",
            "Referer": referer || (this.baseUrl + "/"),
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-Storage-Access": "active",
            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
            "sec-ch-ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"'
        };
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

    isUsableImage(url) {
        const s = String(url || "");
        if (!/^https?:\/\//i.test(s)) return false;
        if (/\/dm5\/images?\//i.test(s) || /\/images\/mobile\//i.test(s)) return false;
        if (/\.(?:gif|svg)(?:\?|$)/i.test(s)) return false;
        return true;
    }

    pickCover(anchor) {
        if (!anchor) return "";
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
        for (const img of anchor.querySelectorAll("img")) {
            const url = this.getImageUrl(img);
            if (this.isRealCover(url, img.attributes["class"])) return url;
        }
        for (const img of anchor.querySelectorAll("img")) {
            const url = this.getImageUrl(img);
            if (this.isUsableImage(url)) return url;
        }
        return "";
    }

    // ==================================================
    // 漫画 ID 工具（适配 manhuaren 的 manhua-xxx / m\d+ 两种格式）
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
    // 通用 P.A.C.K.E.R. 解包
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
    // 探索页
    // ==================================================
    explore = [
        {
            title: "漫画人",
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

                // ========== 2) 分类列表 ==========
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
    // 分类（保留 manhuaren 原 POST 到 dm5.ashx 的方式）
    // ==================================================
    category = {
        title: "漫画人",
        parts: [
            {
                name: "类型",
                type: "fixed",
                itemType: "category",
                categories: [
                    "全部", "热血", "恋爱", "校园", "伪娘", "冒险", "职场", "后宫",
                    "治愈", "科幻", "轻小说", "励志", "生活", "战争", "悬疑", "推理",
                    "搞笑", "奇幻", "魔法", "神鬼", "萌系", "历史", "美食", "同人",
                    "运动", "绅士", "机甲", "百合"
                ],
                categoryParams: [
                    "", "31", "26", "1", "5", "2", "6", "8",
                    "9", "25", "156", "10", "11", "12", "17", "33",
                    "37", "14", "15", "20", "21", "4", "7", "30",
                    "34", "36", "40", "3"
                ]
            }
        ],
        enableRankingPage: false
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            let tag = param || '';
            let statusOpt = (options && options[0]) ? options[0].split('-')[0] : '';
            let sortOpt = (options && options[1]) ? options[1].split('-')[0] : '';

            let path = 'manhua-list';
            if (tag) path += `-tag${tag}`;
            if (statusOpt) path += `-${statusOpt}`;
            if (sortOpt) path += `-${sortOpt}`;

            let url = `${this.baseUrl}/${path}/dm5.ashx`;
            let pageIndex = Math.max(0, (parseInt(page) || 1));
            let pageSize = 21;
            let statusNum = 0;
            if (statusOpt && statusOpt.startsWith('st')) {
                let m = statusOpt.match(/st(\d+)/);
                if (m) statusNum = parseInt(m[1]);
            }
            let sortNum = 0;
            if (sortOpt && sortOpt.startsWith('s')) {
                let m = sortOpt.match(/s(\d+)/);
                if (m) sortNum = parseInt(m[1]);
            }
            let tagId = tag && tag.length > 0 ? tag : '0';

            let body = `action=getclasscomics&pageindex=${pageIndex}&pagesize=${pageSize}&categoryid=0&tagid=${encodeURIComponent(tagId)}&status=${statusNum}&usergroup=0&pay=-1&areaid=0&sort=${sortNum}&iscopyright=0`;

            let host = this.baseUrl.replace(/^https?:\/\//i, "");
            let categoryHeaders = {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'host': host,
                'origin': this.baseUrl,
                'pragma': 'no-cache',
                'referer': `${this.baseUrl}/${path}/`,
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                'x-requested-with': 'XMLHttpRequest'
            };

            let res = await Network.post(url, categoryHeaders, body);
            if (res.status !== 200) throw `加载分类漫画失败: ${res.status}`;

            let data = {};
            try { data = JSON.parse(res.body || '{}'); } catch (e) { throw '解析分类返回数据失败'; }

            let items = data.UpdateComicItems || [];
            let comics = items.map(it => {
                let id = it.UrlKey ? `/${it.UrlKey}/` : (it.ID ? `/m${it.ID}/` : '');
                let cover = it.ShowPicUrlB || it.ShowConver || '';
                if (cover && cover.startsWith('//')) cover = 'https:' + cover;
                if (cover && !cover.startsWith('http')) cover = this.baseUrl + cover;
                let tags = [];
                if (it.Author && Array.isArray(it.Author)) tags = it.Author.slice(0, 3);
                return new Comic({
                    id: id,
                    title: it.Title,
                    cover: cover,
                    description: it.Content || '',
                    tags: tags
                });
            });

            let perPage = items.length || 20;
            let total = data.Count || 0;
            let maxPage = perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : (comics.length > 0 ? page + 1 : page);
            return { comics, maxPage: maxPage + 1 };
        },

        optionList: [
            {
                type: 'select',
                label: '状态',
                options: ['st0-全部', 'st1-连载', 'st2-已完结'],
                default: 'st0'
            },
            {
                type: 'select',
                label: '排序',
                options: ['s2-最近更新', 's10-人气最旺', 's18-最近上架'],
                default: 's2'
            }
        ]
    };

    // ==================================================
    // 搜索
    // ==================================================
    search = {
        load: async (keyword, options, page) => {
            let url = `${this.baseUrl}/search?title=${encodeURIComponent(keyword)}&language=1&page=${page}`;
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `Search failed: ${res.status}`;

            let doc = new HtmlDocument(res.body);
            let comics = [];
            let seen = new Set();
            let list = doc.querySelectorAll('.book-list > li');

            for (let item of list) {
                let link = item.querySelector('.book-list-info > a');
                let href = link?.attributes['href'];
                if (!href) continue;
                if (!href.startsWith('http')) href = this.baseUrl + href;

                let id = this.getComicId(href);
                if (!id || seen.has(id)) continue;

                let title = item.querySelector('.book-list-info-title')?.text?.trim();
                if (!title) title = this.cleanText(item.querySelector('a')?.attributes?.['title'] || '');
                if (!title) title = "漫画 " + id;

                let coverEl = item.querySelector('.book-list-cover-img');
                let cover = coverEl?.attributes['src'];
                if (cover) {
                    if (cover.startsWith('//')) cover = 'https:' + cover;
                    else if (!cover.startsWith('http')) cover = this.baseUrl + cover;
                }
                let desc = item.querySelector('.book-list-info-desc')?.text?.trim();
                let tags = [];
                let tagEls = item.querySelectorAll('.book-list-info-bottom-item');
                for (let t of tagEls) tags.push(t.text.trim());
                let status = item.querySelector('.book-list-info-bottom-right-font')?.text?.trim();
                if (status) tags.push(status);

                seen.add(id);
                comics.push(new Comic({
                    id: id,
                    title: title,
                    cover: cover,
                    description: desc,
                    tags: tags
                }));
            }

            let maxPage = comics.length > 0 ? page + 1 : page;
            return { comics, maxPage };
        },
        optionList: [],
        enableTagsSuggestions: false
    };

    // ==================================================
    // 漫画详情
    // ==================================================
    comic = {
        loadInfo: async (id) => {
            if (!id || typeof id !== 'string') throw "ID不能为空";

            let comicId = String(id);
            let targetUrl = /^https?:\/\//i.test(comicId) ? comicId : this.getComicUrl(comicId);

            let res = await Network.get(targetUrl, this.headers);
            if (res.status !== 200) throw `请求失败，状态码: ${res.status}，URL: ${targetUrl}`;

            let html = res.body || '';
            this.comic.id = id;

            let doc = new HtmlDocument(html);

            let title = this.cleanText(doc.querySelector('p.detail-main-info-title')?.text)
                || this.cleanText(doc.querySelector('span.normal-top-title')?.text)
                || this.cleanText(doc.querySelector('title')?.text?.replace(/漫画.*$/i, ''))
                || '未知标题';

            let cover = "";
            const coverSelectors = [
                ".detail-main-cover img",
                "img.detail-main-bg",
                ".book-cover img",
                ".comic-cover img",
                ".cover img"
            ];
            for (const sel of coverSelectors) {
                const img = doc.querySelector(sel);
                if (!img) continue;
                cover = this.getImageUrl(img);
                if (cover) break;
            }
            if (!cover) {
                const allImgs = doc.querySelectorAll("img");
                for (const img of allImgs) {
                    const src = this.getImageUrl(img);
                    if (this.isUsableImage(src)) { cover = src; break; }
                }
            }

            let author = '未知作者';
            let authorContainer = doc.querySelector('.detail-main-info-author');
            if (authorContainer) {
                let authors = [];
                let links = authorContainer.querySelectorAll('a') || [];
                for (let i = 0; i < links.length; i++) {
                    let text = this.cleanText(links[i].text);
                    if (text) authors.push(text);
                }
                if (authors.length > 0) author = authors.join('，');
                else {
                    let raw = this.cleanText(authorContainer.text?.replace(/作者[:：]/, ''));
                    if (raw) author = raw;
                }
            } else {
                let metaAuthor = doc.querySelector('meta[name="Author"]')?.attributes?.content;
                if (metaAuthor) author = metaAuthor.includes(':') ? metaAuthor.split(':').pop().trim() : metaAuthor.trim();
            }

            let status = this.cleanText(doc.querySelector('.detail-list-title-1')?.text) || '未知状态';
            let description = this.cleanText(doc.querySelector('.detail-desc')?.text);
            if (!description) description = doc.querySelector('meta[name="Description"]')?.attributes?.content || '';

            let tags = [];
            let tagElements = doc.querySelectorAll('.detail-main-info-class a') || [];
            for (let i = 0; i < tagElements.length; i++) {
                let tagText = this.cleanText(tagElements[i].text);
                if (tagText && tags.indexOf(tagText) < 0) tags.push(tagText);
            }

            let updateTime = this.cleanText(doc.querySelector('.detail-list-title-3')?.text) || '';

            let starValue = null;
            let starElement = doc.querySelector('.detail-main-info-star');
            if (starElement && starElement.attributes && starElement.attributes['class']) {
                let match = starElement.attributes['class'].match(/star-(\d+)/i);
                if (match && match[1]) {
                    let num = parseInt(match[1], 10);
                    if (!isNaN(num)) starValue = num;
                }
            }

            let chapters = new Map();
            let seen = new Set();
            let selectorItems = doc.querySelectorAll('.detail-selector .detail-selector-item');

            if (selectorItems.length > 0) {
                for (let item of selectorItems) {
                    let groupName = this.cleanText(item.text);
                    if (!groupName || groupName.includes('评论')) continue;

                    let onclick = item.attributes['onclick'];
                    let listId = null;
                    if (onclick) {
                        let match = onclick.match(/titleSelect\(.*?,.*?, *['"](.*?)['"]\)/);
                        if (match) listId = match[1];
                    }

                    if (listId) {
                        let listEl = doc.getElementById(listId);
                        if (listEl) {
                            let groupChapters = new Map();
                            let links = listEl.querySelectorAll('a.chapteritem');
                            for (let link of links) {
                                let href = link.attributes['href'];
                                let chapterTitle = this.cleanText(link.text || link.attributes['title']);
                                if (href && chapterTitle) {
                                    chapterTitle = chapterTitle.replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim();
                                    if (!href.startsWith('http')) href = this.toAbsoluteUrl(href);
                                    if (!seen.has(href)) {
                                        seen.add(href);
                                        groupChapters.set(href, chapterTitle);
                                    }
                                }
                            }
                            if (groupChapters.size > 0) chapters.set(groupName, groupChapters);
                        }
                    }
                }
            }

            if (chapters.size === 0) {
                let groupChapters = new Map();
                let links = doc.querySelectorAll('a.chapteritem');
                for (let link of links) {
                    let href = link.attributes['href'];
                    let chapterTitle = this.cleanText(link.text || link.attributes['title']);
                    if (href && chapterTitle) {
                        chapterTitle = chapterTitle.replace(/\s*\d{4}-\d{2}-\d{2}\s*$/, "").trim();
                        if (!href.startsWith('http')) href = this.toAbsoluteUrl(href);
                        groupChapters.set(href, chapterTitle);
                    }
                }
                if (groupChapters.size > 0) chapters.set('连载', groupChapters);
            }

            let parseRecommends = (htmlContent) => {
                let recs = [];
                let recPattern = /<li[^>]*class=["'][^"']*(?:list-comic|rec|recommend)[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*>[^<]*<\/a>[\s\S]*?<a[^>]*>\s*([^<]+)\s*<\/a>/gi;
                let m;
                let count = 0;
                while ((m = recPattern.exec(htmlContent)) !== null && count < 12) {
                    let url = m[1];
                    let cover = m[2];
                    let titleText = (m[3] || '').trim();
                    if (!url || !titleText) continue;
                    if (!url.startsWith('http')) url = this.toAbsoluteUrl(url);
                    if (cover && !cover.startsWith('http')) cover = this.toAbsoluteUrl(cover);
                    recs.push(new Comic({ id: url, title: titleText, cover: cover }));
                    count++;
                }
                return recs;
            };
            let recommends = parseRecommends(html);

            let midMatch = html.match(/mid["\s:]*(\d+)/i) || html.match(/var mid = (\d+)/i) || html.match(/mid=(\d+)/i) || html.match(/var DM5_MID = (\d+)/i) || html.match(/var COMIC_MID=(\d+)/i);
            if (midMatch) this.comic.mid = parseInt(midMatch[1]);

            const detailUrl = targetUrl;

            return new ComicDetails({
                title,
                cover,
                description: description || '暂无描述',
                tags: {
                    '作者': [author || '未知作者'],
                    '状态': [status || '未知状态'],
                    '标签': tags
                },
                chapters: chapters,
                recommend: recommends,
                updateTime: updateTime,
                stars: starValue,
                subId: this.comic.mid ? this.comic.mid.toString() : '73225',
                url: detailUrl
            });
        },

        loadEp: async (comicId, epId) => {
            let chapterUrl;
            if (/^https?:\/\//i.test(epId)) {
                chapterUrl = epId;
            } else if (epId.startsWith("/")) {
                chapterUrl = this.baseUrl + epId;
            } else {
                chapterUrl = this.baseUrl + "/" + epId;
            }
            if (!chapterUrl.endsWith("/")) chapterUrl += "/";

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
        // 评论系统（保留）
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
            let url = `${this.baseUrl}/manhua-${comicSlug}/pagerdata.ashx`;
            let params = {
                d: Date.now(),
                pageindex: (requestPage - 1),
                pagesize: 767,
                mid: subId,
                t: 4
            };
            let query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
            url += '?' + query;

            let host = this.baseUrl.replace(/^https?:\/\//i, "");
            let headers = {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'host': host,
                'pragma': 'no-cache',
                'referer': `${this.baseUrl}/manhua-${comicSlug}/`,
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
            let host = this.baseUrl.replace(/^https?:\/\//i, "");
            let url = `${this.baseUrl}/showcomment/pagerdata.ashx?d=${Date.now()}&pageindex=${requestPage}&pagesize=${pageSize}&cid=${cid}&t=9`;
            let headers = {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'host': host,
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
        // 链接解析（保留）
        // ==================================================
        link: {
            domains: ["www.manhuaren.com", "manhuaren.com"],
            linkToId: (url) => {
                let id = this.getComicId(url);
                return id || null;
            }
        }
    };
}