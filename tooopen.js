class MeiTuGongShe extends ComicSource {
    name = "美图公社"
    key = "tooopen"
    version = "1.0.5"
    minAppVersion = "1.0.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/tooopen.js"

    get baseUrl() { return "https://desk.tooopen.com"; }

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
            "Referer": this.baseUrl + "/"
        };
    }

    get imageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        };
    }

    // 核心修复：短超时 + 内部自动重试，解决死节点卡死15秒导致第一次搜索报错的问题
    async _fetch(url) {
        let maxRetries = 3;
        for (let i = 0; i < maxRetries; i++) {
            try {
                // 强制设置单次请求超时为 6 秒，超时立刻重试
                let res = await Network.get(url, this.headers, { timeout: 6000 });
                if (res.status === 200) return res;
            } catch (e) {
                // 捕获超时异常，准备进入下一次重试
            }
        }
        // 3次全失败才抛出异常，让 Venera 显示重试按钮
        throw new Error("网络请求超时，请重试");
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

    _text(el) {
        if (!el) return "";
        try {
            if (el.text !== undefined && el.text !== null) return String(el.text).trim();
            if (el.textContent !== undefined && el.textContent !== null) return String(el.textContent).trim();
        } catch (e) {}
        return "";
    }

    _toStr(body) {
        if (body === null || body === undefined) return "";
        if (typeof body === "string") return body;
        try { return String(body); } catch (e) { return ""; }
    }

    _htmlToText(html) {
        if (!html) return "";
        let s = String(html);
        s = s.replace(/<[^>]+>/g, "");
        s = s.replace(/&nbsp;/ig, " ")
            .replace(/&amp;/ig, "&")
            .replace(/&lt;/ig, "<")
            .replace(/&gt;/ig, ">")
            .replace(/&quot;/ig, '"');
        return s.replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/\s+/g, " ").trim();
    }

    absUrl(url) {
        if (!url) return "";
        let u = String(url).trim();
        if (!u || u.indexOf("data:") === 0) return "";
        if (u.indexOf("//") === 0) return "https:" + u;
        if (/^https?:\/\//i.test(u)) return u;
        return this.baseUrl + (u.indexOf("/") === 0 ? "" : "/") + u;
    }

    _idFromUrl(url) {
        let u = String(url || "").trim();
        if (!u) return "";
        if (u.indexOf("//") === 0) u = "https:" + u;

        if (/^https?:\/\//i.test(u)) {
            let m = u.match(/^https?:\/\/[^\/]+(\/[^#]*)?/i);
            u = m && m[1] ? m[1] : "";
        }

        let hashIndex = u.indexOf("#");
        if (hashIndex >= 0) u = u.substring(0, hashIndex);

        return u.replace(/^\/+|\/+$/g, "");
    }

    _pickImageUrl(el) {
        if (!el) return "";

        let attrs = [
            "data-original", "data-src", "data-lazy-src",
            "data-loadsrc", "realsrc", "src", "href"
        ];

        for (let i = 0; i < attrs.length; i++) {
            let v = this._attr(el, attrs[i]);
            if (v && !/^data:/i.test(v)) return v;
        }

        let style = this._attr(el, "style");
        if (style) {
            let m = style.match(/url\(['"]?([^'")]+)['"]?\)/i);
            if (m && m[1]) return m[1];
        }

        return "";
    }

    _getCoverFromLink(link) {
        if (!link) return "";
        let img = null;
        try { img = link.querySelector("img"); } catch (e) {}
        if (!img && link.tagName && String(link.tagName).toLowerCase() === "img") img = link;
        
        let cover = this._pickImageUrl(img);
        if (!cover) cover = this._pickImageUrl(link);
        return cover ? this.absUrl(cover) : "";
    }

    extractList(doc) {
        let comics = [];
        if (!doc) return comics;

        let links = [];
        try { links = doc.querySelectorAll('a[href*="/topic/"], a[href*="/view/"]'); } catch (e) { return comics; }

        let seen = {};
        let len = links.length || 0;

        for (let i = 0; i < len; i++) {
            let link = links[i];
            let href = this._attr(link, "href");
            if (!href || href.indexOf("javascript:") === 0) continue;

            let url = this.absUrl(href);
            let id = this._idFromUrl(url);
            if (!id || seen[id]) continue;

            let img = null;
            try { img = link.querySelector("img"); } catch (e) {}

            let title = this._attr(link, "title")
                || (img && (this._attr(img, "alt") || this._attr(img, "title")))
                || this._text(link.querySelector("span"))
                || this._text(link)
                || id;

            title = this._htmlToText(title).replace(/\s+/g, " ").trim();
            if (!title || title.indexOf("http") === 0) title = "图集 " + id.replace(/[^\d]/g, "").substring(0, 6);

            seen[id] = true;
            comics.push(new Comic({
                id: String(id),
                title: String(title),
                cover: String(this._getCoverFromLink(link))
            }));
        }

        return comics;
    }

    getMaxPage(doc) {
        let maxPage = 1;
        if (!doc) return maxPage;

        let selectors = ["#pages a", ".text-c a", ".pages a", ".pagination a", ".page a", 'a[href*="_3_"]'];
        for (let s = 0; s < selectors.length; s++) {
            let links = null;
            try { links = doc.querySelectorAll(selectors[s]); } catch (e) {}
            if (!links) continue;

            let len = links.length || 0;
            for (let i = 0; i < len; i++) {
                let el = links[i];
                let text = this._text(el);
                if (text && /^\d+$/.test(text)) {
                    let num = parseInt(text, 10);
                    if (num > maxPage) maxPage = num;
                }
                let href = this._attr(el, "href");
                if (href) {
                    let m = href.match(/_3_(\d+)\.html/i);
                    if (m && m[1]) {
                        let num = parseInt(m[1], 10);
                        if (num > maxPage) maxPage = num;
                    }
                }
            }
        }
        return maxPage;
    }

    explore = [
        {
            title: "美图公社",
            type: "multiPageComicList",
            load: async (page) => {
                let res = await this._fetch(this.baseUrl + "/");
                let doc = new HtmlDocument(this._toStr(res.body));
                return { comics: this.extractList(doc), maxPage: 1 };
            }
        },
        {
            title: "美图公社",
            type: "multiPageComicList",
            load: async (page) => {
                let p = Math.max(1, Number(page || 1));
                let url = p <= 1 ? this.baseUrl + "/model.html" : this.baseUrl + "/model_3_" + p + ".html";
                let res = await this._fetch(url);
                
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.extractList(doc);
                let maxPage = this.getMaxPage(doc);
                if (maxPage < p) maxPage = comics.length > 0 ? p + 1 : p;
                return { comics: comics, maxPage: maxPage };
            }
        }
    ]

    category = {
        title: "美图公社",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: [
                    "美女明星", "清纯美女", "性感美女", "艺术写真", "鲜花图片",
                    "动物图片", "狗狗图片", "风景壁纸", "动漫壁纸", "绘画图片",
                    "家装设计", "美食图片", "丝袜美女", "比基尼美女", "泳装美女",
                    "内衣美女", "日本美女", "韩国美女", "国产精品", "欧美美女",
                    "亚洲美女", "性感写真"
                ],
                categoryParams: [
                    "model.html", "beauty.html", "meinv2.html", "artphoto.html", "flower.html",
                    "animal.html", "gougou.html", "scenery.html", "dongman.html", "painting.html",
                    "decoration.html", "meishi.html", "t_siwameinv.html", "t_bijinimeinv.html", "t_yongzhuangmeinv.html",
                    "t_neiyimeinv.html", "t_ribenmeinv.html", "t_hanguomeinv.html", "t_zhongguomeinv.html", "t_oumeimeinv.html",
                    "t_yazhoumeinv.html", "t_xinganxiezhen.html"
                ],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let p = Math.max(1, Number(page || 1));
            let cat = String(param || "model.html").trim().replace(/^\/+/, "");
            let url = p <= 1 ? this.baseUrl + "/" + cat : this.baseUrl + "/" + cat.replace(/\.html$/i, "") + "_3_" + p + ".html";
            
            let res = await this._fetch(url);
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.extractList(doc);
            let maxPage = this.getMaxPage(doc);
            if (maxPage < p) maxPage = comics.length > 0 ? p + 1 : p;
            return { comics: comics, maxPage: maxPage };
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let kw = String(keyword || "").trim();
            if (!kw) return { comics: [], maxPage: 1 };

            let p = Math.max(1, Number(page || 1));

            let map = {
                "美女": "model.html", "明星": "model.html", "美女明星": "model.html",
                "清纯": "beauty.html", "清纯美女": "beauty.html",
                "性感": "meinv2.html", "性感美女": "meinv2.html",
                "艺术": "artphoto.html", "艺术写真": "artphoto.html",
                "鲜花": "flower.html", "鲜花图片": "flower.html",
                "动物": "animal.html", "动物图片": "animal.html",
                "狗狗": "gougou.html", "狗狗图片": "gougou.html",
                "风景": "scenery.html", "风景壁纸": "scenery.html",
                "壁纸": "scenery.html", "手机壁纸": "scenery.html",
                "动漫": "dongman.html", "动漫壁纸": "dongman.html",
                "绘画": "painting.html", "绘画图片": "painting.html",
                "家装": "decoration.html", "家装设计": "decoration.html",
                "美食": "meishi.html", "美食图片": "meishi.html",
                "丝袜": "t_siwameinv.html", "丝袜美女": "t_siwameinv.html",
                "比基尼": "t_bijinimeinv.html", "比基尼美女": "t_bijinimeinv.html",
                "泳装": "t_yongzhuangmeinv.html", "泳装美女": "t_yongzhuangmeinv.html",
                "内衣": "t_neiyimeinv.html", "内衣美女": "t_neiyimeinv.html",
                "日本": "t_ribenmeinv.html", "日本美女": "t_ribenmeinv.html",
                "韩国": "t_hanguomeinv.html", "韩国美女": "t_hanguomeinv.html",
                "国产": "t_zhongguomeinv.html", "国产精品": "t_zhongguomeinv.html",
                "欧美": "t_oumeimeinv.html", "欧美美女": "t_oumeimeinv.html",
                "亚洲": "t_yazhoumeinv.html", "亚洲美女": "t_yazhoumeinv.html",
                "写真": "t_xinganxiezhen.html", "性感写真": "t_xinganxiezhen.html"
            };

            let cat = map[kw] || "";

            if (!cat && (/^https?:\/\//i.test(kw) || kw.indexOf("/topic/") >= 0 || kw.indexOf("/view/") >= 0)) {
                cat = this._idFromUrl(kw);
            }

            if (!cat) cat = "model.html";
            cat = cat.replace(/^\/+/, "");

            let url = p <= 1 ? this.baseUrl + "/" + cat : this.baseUrl + "/" + cat.replace(/\.html$/i, "") + "_3_" + p + ".html";

            let res = await this._fetch(url);
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.extractList(doc);
            let maxPage = this.getMaxPage(doc);

            if (maxPage < p) maxPage = p;

            return { comics: comics, maxPage: maxPage };
        },
        enableTagsSuggestions: false
    }

    comic = {
        loadInfo: async (id) => {
            let detailUrl = this.absUrl(id);
            let res = await this._fetch(detailUrl);

            let doc = new HtmlDocument(this._toStr(res.body));
            let title = this._text(doc.querySelector(".det-info h1")) || this._text(doc.querySelector("h1")) || this._text(doc.querySelector("title"));
            title = title.replace(/[_-].*美图公社.*$/i, "").replace(/\s*-\s*美图公社.*$/i, "");
            title = this._htmlToText(title);
            if (!title) title = "未知图集";

            let coverEl = doc.querySelector("#faded img, .det-img-item img, .det-topic img, .img-list img, img");
            let cover = this._pickImageUrl(coverEl);
            if (cover) cover = this.absUrl(cover);

            let descEl = doc.querySelector(".det-info p");
            let description = descEl ? this._text(descEl) : this._attr(doc.querySelector('meta[name="description"]'), "content");
            description = this._htmlToText(description);

            let tags = {};
            let tagEls = null;
            try { tagEls = doc.querySelectorAll(".det-nav a"); } catch (e) {}
            if (tagEls) {
                let tagArr = [];
                for (let i = 0; i < tagEls.length; i++) {
                    let t = this._htmlToText(this._text(tagEls[i]));
                    if (t) tagArr.push(t);
                }
                if (tagArr.length > 0) tags["分类"] = tagArr;
            }

            let finalChapters = new Map();
            finalChapters.set(String(id), "Gallery 全部原图");

            return new ComicDetails({
                title: String(title),
                cover: String(cover),
                description: String(description),
                tags: tags,
                chapters: finalChapters,
                url: String(detailUrl)
            });
        },

        loadEp: async (comicId, epId) => {
            let pageUrl = this.absUrl(epId);
            let res = await this._fetch(pageUrl);

            let doc = new HtmlDocument(this._toStr(res.body));
            let images = [];
            let seen = {};

            let pushImage = (img) => {
                let src = this._pickImageUrl(img);
                if (!src || src.indexOf("data:") === 0) return;
                let url = this.absUrl(src);
                if (!/\.(webp|jpg|jpeg|png)(\?|#|$)/i.test(url)) return;
                if (seen[url]) return;
                seen[url] = true;
                images.push(String(url));
            };

            let first = doc.querySelectorAll("#faded img, .det-img-item img");
            for (let i = 0; i < first.length; i++) pushImage(first[i]);

            if (images.length === 0) {
                let second = doc.querySelectorAll(".det-topic img, .img-list.det-topic img");
                for (let i = 0; i < second.length; i++) pushImage(second[i]);
            }

            if (images.length === 0) throw "未找到图片。";
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
            let referer = this.absUrl(epId);
            if (!referer) referer = this.baseUrl + "/";

            let headers = {
                "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
                "Referer": referer,
                "Origin": this.baseUrl,
                "Accept": "image/jpeg, image/png, image/*"
            };

            return { url: url, headers: headers };
        },

        onThumbnailLoad: (url) => {
            return { headers: this.imageHeaders };
        },

        link: {
            domains: ["desk.tooopen.com", "www.desk.tooopen.com", "tooopen.com", "www.tooopen.com"],
            linkToId: (url) => {
                let u = String(url || "").trim();
                if (!u) return "";
                if (/^https?:\/\//i.test(u)) {
                    let m = u.match(/^https?:\/\/([^\/]+)(\/[^#]*)?/i);
                    if (m) {
                        let host = String(m[1] || "").toLowerCase();
                        if (host.indexOf("tooopen.com") >= 0) {
                            return this._idFromUrl(u);
                        }
                    }
                    return u;
                }
                return this._idFromUrl(u);
            },
            idToLink: (id) => {
                return this.absUrl(id);
            }
        }
    }
}