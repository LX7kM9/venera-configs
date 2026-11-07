class JiePaiTuan extends ComicSource {
    name = "街拍团"
    key = "jiepaituan"
    version = "1.0.3"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/jiepaituan.js"

    get baseUrl() { return "https://jiepaiclub.com"; }

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": this.baseUrl + "/",
            "Origin": this.baseUrl
        };
    }

    get imageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8"
        };
    }

    _attr(el, name) {
        if (!el) return "";
        if (el.attributes) {
            let v = el.attributes[name];
            if (v !== undefined && v !== null) return String(v).trim();
        }
        try {
            if (typeof el.getAttribute === "function") {
                let v = el.getAttribute(name);
                if (v !== undefined && v !== null) return String(v).trim();
            }
        } catch (e) {}
        return "";
    }

    qsa(root, selectors) {
        let out = [];
        let seen = new Set();
        for (let sel of selectors) {
            let list = null;
            try { list = root.querySelectorAll(sel); } catch (e) { list = null; }
            if (!list) continue;
            let arr = [];
            try { arr = Array.from(list); } catch (e) {
                let len = list.length !== undefined ? list.length : 0;
                for (let i = 0; i < len; i++) if (list[i]) arr.push(list[i]);
            }
            for (let el of arr) {
                if (el && !seen.has(el)) { seen.add(el); out.push(el); }
            }
        }
        return out;
    }

    qs(root, selectors) {
        let list = this.qsa(root, selectors);
        return list.length > 0 ? list[0] : null;
    }

    _toStr(body) {
        if (body === null || body === undefined) return "";
        if (typeof body === "string") return body;
        try { return String(body); } catch (e) { return ""; }
    }

    // 统一处理 URL 拼接，无论输入什么格式，都能转成正确的完整网址
    _buildUrl(id) {
        let s = String(id).trim();
        if (!s) return "";
        // 如果已经是完整网址
        if (s.startsWith("http")) return s;
        
        // 清理开头的斜杠
        s = s.replace(/^\/+/, '');
        
        // 如果只是纯数字，自动补全 .html
        if (/^\d+$/.test(s)) {
            s += ".html";
        }
        
        return `${this.baseUrl}/${s}`;
    }

    getImgSrc(el) {
        if (!el) return "";
        let attrs = ["data-original", "data-src", "data-lazy-src", "data-loadsrc", "realsrc", "src"];
        for (let a of attrs) {
            let v = this._attr(el, a);
            if (v && !v.startsWith("data:")) return v;
        }
        return "";
    }

    isValidImg(url) {
        if (!url) return false;
        if (/\/(logo|gonggao|shipin)\.(webp|svg|png|jpg)$/i.test(url)) return false;
        if (!/\.(webp|jpg|jpeg|png)(\?|#|$)/i.test(url)) return false;
        return true;
    }

    parseList(doc) {
        let comics = [];
        let seen = new Set();
        let cards = this.qsa(doc, ["article.post"]);

        for (let card of cards) {
            let cls = this._attr(card, "class");
            if (cls.includes("whisper")) continue;

            let linkEl = this.qs(card, [".post-title > a[href$='.html']", "h2.post-title > a[href$='.html']", "h1.post-title > a[href$='.html']"]);
            if (!linkEl) continue;

            let href = this._attr(linkEl, "href");
            let url = this._buildUrl(href);
            if (!url) continue;

            // 提取纯相对路径 ID (如 "2484.html")
            let id = url.replace(/^https?:\/\/[^\/]+\//i, "");
            if (seen.has(id)) continue;

            let imgEl = this.qs(card, [".thumb img", ".post-content img"]);
            let coverRaw = this.getImgSrc(imgEl);
            let cover = this._buildUrl(coverRaw);

            if (!this.isValidImg(cover)) continue;

            let title = this._attr(linkEl, "title") || (linkEl.text || "").trim() || id;
            seen.add(id);

            comics.push(new Comic({
                id: id,
                title: title,
                cover: cover
            }));
        }
        return comics;
    }

    // 发现页
    explore = [
        {
            title: "街拍团",
            type: "multiPageComicList",
            load: async (page) => {
                let url = page <= 1 ? `${this.baseUrl}/` : `${this.baseUrl}/page/${page}/`;
                
                let res = await Network.get(url, this.headers);
                if (res.status !== 200) throw `HTTP ${res.status}`;
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.parseList(doc);
                
                let nextLinks = this.qsa(doc, ["a[href*='/page/']"]);
                let hasNext = false;
                for (let a of nextLinks) {
                    if (this._attr(a, "href").includes(`/page/${page + 1}/`)) {
                        hasNext = true;
                        break;
                    }
                }
                return { comics: comics, maxPage: hasNext ? page + 1 : page };
            }
        }
    ]

    // 分类页
    category = {
        title: "街拍团",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: ["全部", "街拍", "特刊", "短裙", "短裤", "内衣", "裙装", "瑜伽裤", "情趣", "牛仔裤", "丝袜"],
                categoryParams: ["", "photo", "plus", "tag/duanqun", "tag/duanku", "tag/neiyi", "tag/qunzhuang", "tag/yujiaku", "tag/qingqu", "tag/niuzaiku", "tag/siwa"],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let catParam = param || "";
            let url = catParam ? `${this.baseUrl}/${catParam}` : `${this.baseUrl}/`;
            
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.parseList(doc);
            
            return { comics: comics, maxPage: page };
        }
    }

    // 搜索
    search = {
        load: async (keyword, options, page) => {
            let kw = encodeURIComponent((keyword || "").trim());
            let url = `${this.baseUrl}/search/${kw}/`;
            
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.parseList(doc);
            
            return { comics: comics, maxPage: 1 };
        },
        enableTagsSuggestions: false
    }

    // 漫画详情
    comic = {
        loadInfo: async (id) => {
            let url = this._buildUrl(id);
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));

            let titleEl = this.qs(doc, ["article.post h1.post-title a", "article.post h1.post-title", "h1"]);
            let title = titleEl ? (titleEl.text || "").trim() : "";
            title = title.replace(/\s*-\s*街拍团.*$/, '');

            let cover = "";
            let imgs = this.qsa(doc, ["article.post .post-content img"]);
            for (let img of imgs) {
                let u = this._buildUrl(this.getImgSrc(img));
                if (this.isValidImg(u)) {
                    cover = u;
                    break;
                }
            }

            let tags = [];
            let tagEls = this.qsa(doc, ["article.post a[href*='/tag/']"]);
            for (let el of tagEls) {
                let tag = (el.text || "").trim();
                if (tag && !tags.includes(tag)) tags.push(tag);
            }

            let description = this._attr(this.qs(doc, ["meta[name='description']"]), "content") || "";

            let chapters = new Map();
            let cleanId = url.replace(/^https?:\/\/[^\/]+\//i, ""); // 提取出 2412.html
            chapters.set(cleanId, "Gallery");

            let tagsMap = {};
            if (tags.length > 0) tagsMap["标签"] = tags;
            tagsMap["状态"] = ["已完结"];

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: tagsMap,
                chapters: chapters,
                url: url
            });
        },

        // 章节阅读
        loadEp: async (comicId, epId) => {
            let url = this._buildUrl(epId);
            
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));

            let images = [];
            let seen = new Set();

            let imgEls = this.qsa(doc, ["article.post .post-content img"]);
            for (let img of imgEls) {
                let rawUrl = this.getImgSrc(img);
                let full = this._buildUrl(rawUrl);
                if (this.isValidImg(full) && !seen.has(full)) {
                    seen.add(full);
                    images.push(full);
                }
            }

            if (images.length === 0) {
                throw "未找到图片。";
            }
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
            return { url: url, headers: this.imageHeaders };
        },

        onThumbnailLoad: (url) => {
            return { headers: this.imageHeaders };
        },

        link: {
            domains: ["jiepaiclub.com", "www.jiepaiclub.com"],
            linkToId: (url) => {
                let s = String(url).trim();
                // 无论你发完整链接还是什么，只提取 "数字.html" 这一段
                let m = s.match(/(\d+\.html)/i);
                if (m) return m[1];
                
                // 如果只输入了纯数字
                if (/^\d+$/.test(s)) return s + ".html";
                
                return null;
            }
        }
    }
}