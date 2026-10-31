class DogeManga extends ComicSource {
    name = "漫画狗"
    key = "dogemanga"
    version = "1.0.6"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/dogemanga.js"

    get baseUrl() { return "https://dogemanga.com"; }

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": this.baseUrl + "/",
            "Origin": this.baseUrl,
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1"
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

    absUrl(url) {
        if (!url) return "";
        let u = String(url).trim();
        if (!u || u === "#") return "";
        if (u.startsWith("//")) return "https:" + u;
        if (u.startsWith("http")) return u;
        return this.baseUrl + (u.startsWith("/") ? "" : "/") + u;
    }

    _toStr(body) {
        if (body === null || body === undefined) return "";
        if (typeof body === "string") return body;
        try { return String(body); } catch (e) { return ""; }
    }

    parseList(doc) {
        let comics = [];
        let seenId = new Set();
        let seenTitle = new Set();
        
        let cards = this.qsa(doc, [".site-card[data-manga-id]"]);
        for (let card of cards) {
            let dataId = this._attr(card, "data-manga-id");
            let link = this.qs(card, ["a.site-card__manga-title[href*='/m/']", "a[href*='/m/']"]);
            let href = link ? this._attr(link, "href") : (dataId ? "/m/" + dataId : "");
            if (!href) continue;

            let match = href.match(/\/m\/([^/?#]+)/);
            let id = dataId || (match ? match[1] : "");
            
            let titleEl = this.qs(card, ["a.site-card__manga-title", ".site-card__manga-title"]);
            let title = titleEl ? (titleEl.text || "").trim() : "";
            
            if (!id || !title) continue;
            
            let titleKey = title.toLowerCase().replace(/[\s·・.。:：,，!！?？\-—_~～'“”‘’()（）\[\]【】<>《》]/g, '');
            if (seenId.has(id) || (titleKey && seenTitle.has(titleKey))) continue;
            seenId.add(id);
            if (titleKey) seenTitle.add(titleKey);

            let img = this.qs(card, ["img.card-img-top", "img.site-manga__cover-image", "img[src*='/images/manga-thumbnails/']", "img[data-src*='/images/manga-thumbnails/']"]);
            let coverRaw = img ? (this._attr(img, "src") || this._attr(img, "data-src")) : "";
            let cover = coverRaw ? this.absUrl(coverRaw) : this.absUrl("/images/manga-thumbnails/" + id + ".jpg");

            comics.push(new Comic({
                id: "/m/" + id,
                title: title,
                cover: cover
            }));
        }
        return comics;
    }

    // 【已恢复】纯净版发现页
    explore = [
        {
            title: "漫画狗", 
            type: "multiPageComicList",
            load: async (page) => {
                let url = `${this.baseUrl}/?l=zh`;
                if (page > 1) url += `&p=${page}`;
                
                let res = await Network.get(url, this.headers);
                if (res.status !== 200) throw `HTTP ${res.status}`;
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.parseList(doc);
                
                let nextLinks = this.qsa(doc, ["a[href*='?p=']", "a[href*='&p=']"]);
                let hasNext = nextLinks.length > 0;
                return { comics: comics, maxPage: hasNext ? page + 1 : page };
            }
        }
    ]

    // 【已修复】分类页：只有热门和最新
    category = {
        title: "漫画狗",
        parts: [
            {
                name: "排序",
                type: "fixed",
                categories: ["热门排行", "最新连载"],
                categoryParams: ["popular", "latest"],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            // 暴力判断参数，防止 Venera 传空导致失效
            let isLatest = (param === "latest" || (options && options["排序"] === "latest"));
            
            // 热门: https://dogemanga.com/
            // 最新: https://dogemanga.com/?s=1
            let url = isLatest 
                ? `${this.baseUrl}/?s=1&l=zh` 
                : `${this.baseUrl}/?l=zh`;
                
            if (page > 1) url += `&p=${page}`;

            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.parseList(doc);
            
            let nextLinks = this.qsa(doc, ["a[href*='?p=']", "a[href*='&p=']"]);
            let hasNext = nextLinks.length > 0;
            return { comics: comics, maxPage: hasNext ? page + 1 : page };
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let kw = encodeURIComponent((keyword || "").trim());
            let url = `${this.baseUrl}/?q=${kw}&l=zh`;
            if (page > 1) url += `&p=${page}`;

            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.parseList(doc);
            
            let nextLinks = this.qsa(doc, ["a[href*='?p=']", "a[href*='&p=']"]);
            let hasNext = nextLinks.length > 0;
            return { comics: comics, maxPage: hasNext ? page + 1 : page };
        },
        enableTagsSuggestions: false
    }

    comic = {
        loadInfo: async (id) => {
            let url = this.absUrl(id);
            if (!url.includes("l=")) url += (url.includes("?") ? "&" : "?") + "l=zh";
            
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));

            let root = this.qs(doc, [".site-card[data-manga-id]"]) || doc;
            
            let titleEl = this.qs(root, [".site-card__manga-title", "h3"]);
            let title = titleEl ? (titleEl.text || "").trim() : "";

            let img = this.qs(root, ["img.site-manga__cover-image", "img.card-img-top", "img[src*='/images/manga-thumbnails/']"]);
            let coverRaw = img ? (this._attr(img, "src") || this._attr(img, "data-src")) : "";
            let cover = coverRaw ? this.absUrl(coverRaw) : "";

            let authorEl = this.qs(root, ["h4.text-muted a", "h4.text-muted", ".card-subtitle"]);
            let author = authorEl ? (authorEl.text || "").trim() : "";

            let descEl = this.qs(root, [".site-card__brief"]);
            let description = descEl ? (descEl.text || "").trim() : "";

            let metaEl = this.qs(root, ["small.text-muted"]);
            let meta = metaEl ? (metaEl.text || "").trim() : "";
            let statusMatch = meta.match(/連載狀態：([^最]+)/);
            let status = statusMatch ? statusMatch[1].trim() : "未知";

            let chapterEls = this.qsa(doc, [
                "a.site-manga-thumbnail__link[href*='/p/']",
                ".list-group-item a[href*='/p/']",
                "a[href*='/p/']"
            ]);
            
            let rawChapters = [];
            let seenCid = new Set();
            for (let el of chapterEls) {
                let href = this._attr(el, "href");
                if (!href) continue;
                let match = href.match(/\/p\/([^/?#]+)/);
                let cid = match ? match[1] : "";
                if (!cid || seenCid.has(cid)) continue;
                seenCid.add(cid);

                let cUrl = this.absUrl("/p/" + cid);
                if (!cUrl.includes("l=")) cUrl += (cUrl.includes("?") ? "&" : "?") + "l=zh";

                let cTitleEl = this.qs(el, [".text-center"]);
                let cTitle = cTitleEl ? (cTitleEl.text || "").trim() : (el.text || "").trim() || cid;
                
                rawChapters.push([cUrl, cTitle]);
            }

            // 翻转：最旧话在前
            rawChapters.reverse();
            let finalChapters = new Map(rawChapters);

            let tags = {};
            if (author) tags["作者"] = [author];
            if (status !== "未知") tags["状态"] = [status];

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: tags,
                chapters: finalChapters,
                url: url
            });
        },

        loadEp: async (comicId, epId) => {
            let url = this.absUrl(epId);
            if (!url.includes("l=")) url += (url.includes("?") ? "&" : "?") + "l=zh";

            let res = await Network.get(url, this.headers);
            if (res.status != 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));

            let images = [];
            let seen = new Set();

            let addUrl = (src) => {
                if (!src) return;
                let full = this.absUrl(src);
                if (full && !seen.has(full)) {
                    seen.add(full);
                    images.push(full);
                }
            };

            let imgEls = this.qsa(doc, ["img.site-reader__image[data-page-image-url]", "img[data-page-image-url]"]);
            for (let img of imgEls) {
                addUrl(this._attr(img, "data-page-image-url"));
            }

            if (images.length === 0) {
                let fallbackEls = this.qsa(doc, [
                    "a.site-reader__one-per-page-image-link img[src*='/images/pages/']",
                    "img.site-reader__image[src*='/images/pages/']",
                    "img[src*='/images/pages/']"
                ]);
                for (let img of fallbackEls) {
                    addUrl(this._attr(img, "src"));
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
            domains: ["dogemanga.com", "www.dogemanga.com"],
            linkToId: (url) => {
                let m = String(url || "").match(/\/m\/([^/?#]+)/i);
                if (m && m[1]) return "/m/" + m[1];
                return null;
            }
        }
    }
}