class CosplayLianMeng extends ComicSource {
    name = "Cosplay联盟"
    key = "pandadiu"
    version = "1.2.3"
    minAppVersion = "1.0.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/cosplaylm.js"

    get baseUrl() { return "https://www.pandadiu.com"; }

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/"
        };
    }

    get imageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
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

    absUrl(url) {
        if (!url) return "";
        let u = String(url).trim();
        if (!u) return "";
        if (u.indexOf("//") === 0) return "https:" + u;
        if (u.indexOf("http") === 0) return u;
        return this.baseUrl + (u.indexOf("/") === 0 ? "" : "/") + u;
    }

    _getCover(imgEl) {
        if (!imgEl) return "";
        let cover = this._attr(imgEl, "data-original") || this._attr(imgEl, "data-src") || this._attr(imgEl, "data-lazy-src") || this._attr(imgEl, "data-loadsrc") || this._attr(imgEl, "realsrc") || this._attr(imgEl, "src") || "";
        if (cover.indexOf("data:") === 0) return "";
        return this.absUrl(cover);
    }

    _htmlToText(html) {
        if (!html) return "";
        let s = String(html);
        s = s.replace(/<[^>]+>/g, ''); 
        s = s.replace(/&nbsp;/ig, ' ').replace(/&amp;/ig, '&').replace(/&lt;/ig, '<').replace(/&gt;/ig, '>').replace(/&quot;/ig, '"');
        return s.replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/\s+/g, ' ').trim();
    }

    extractList(doc) {
        let comics = [];
        if (!doc) return comics;
        
        let items = [];
        try {
            // 覆盖：列表页、首页最新、首页推荐、排行榜
            let list = doc.querySelectorAll(".outbox, .cos_list_con > ul > li, .pic_list_con > ul > li, a.newlist-cos, .newcos li, .content .box li, .cos_recom .box li");
            if (list) {
                let len = list.length || 0;
                for (let i = 0; i < len; i++) {
                    if (list[i]) items.push(list[i]);
                }
            }
        } catch (e) { return comics; }

        let seen = {};
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            
            let linkEl = null;
            try { 
                if (item.tagName && item.tagName.toLowerCase() === "a" && this._attr(item, "href").indexOf("show-") >= 0) {
                    linkEl = item;
                } else {
                    linkEl = item.querySelector('a[href*="show-"]');
                }
            } catch (e) {}
            
            if (!linkEl) continue;
            
            let href = this._attr(linkEl, "href");
            if (!href || href.indexOf("javascript:") === 0) continue;
            let fullUrl = this.absUrl(href);
            
            let id = fullUrl;
            if (id.indexOf(this.baseUrl) === 0) {
                id = id.substring(this.baseUrl.length);
            }
            if (!id || seen[id]) continue;
            seen[id] = true;
            
            let imgEl = null;
            try { imgEl = item.querySelector("img"); } catch (e) {}
            if (!imgEl && linkEl.tagName.toLowerCase() === "a") {
                try { imgEl = linkEl.querySelector("img"); } catch(e) {}
            }
            let cover = this._getCover(imgEl);
            
            // 【完美修复】按网站真实 DOM 结构精准提取纯净标题
            let title = "";
            
            // 1. 列表页和首页最新作品区的标题标签
            let aElli = null;
            try { aElli = item.querySelector('a.elli'); } catch(e){}
            if (aElli) title = this._text(aElli);
            
            // 2. 首页热门排行榜的标题标签
            if (!title) {
                let spanElli = null;
                try { spanElli = item.querySelector('span.elli'); } catch(e){}
                if (spanElli) title = this._text(spanElli);
            }
            
            // 3. 兜底的标题标签
            if (!title) {
                let hEl = null;
                try { hEl = item.querySelector('h1, h2, h3, h4'); } catch(e){}
                if (hEl) title = this._text(hEl);
            }
            
            // 4. 尝试 img 的 alt 属性（但必须排除网站瞎写的 "cover"）
            if (!title && imgEl) {
                let alt = this._attr(imgEl, "alt");
                if (alt && alt.toLowerCase() !== "cover") {
                    title = alt;
                }
            }
            
            // 5. 尝试 a 标签的 title 属性
            if (!title) {
                let aTitleEl = null;
                try { aTitleEl = item.querySelector('a[title]'); } catch(e){}
                if (aTitleEl) title = this._attr(aTitleEl, "title");
            }
            
            title = title.replace(/\s+/g, ' ').trim();
            
            // 终极兜底
            if (!title || title.indexOf("/show-") === 0 || title.indexOf("http") === 0) {
                title = "图集 " + id.replace(/[^\d]/g, "").substring(0, 6);
            }
            
            comics.push(new Comic({
                id: String(id),
                title: String(title),
                cover: String(cover)
            }));
        }
        return comics;
    }

    getMaxPage(doc) {
        let maxPage = 1;
        try {
            let pageLinks = doc.querySelectorAll('#pages a, .text-c a, .pages a');
            if (pageLinks) {
                let len = pageLinks.length || 0;
                for (let i = 0; i < len; i++) {
                    let text = this._text(pageLinks[i]);
                    if (text && !isNaN(text)) {
                        let num = parseInt(text, 10);
                        if (num > maxPage) maxPage = num;
                    }
                }
            }
        } catch (e) {}
        return maxPage;
    }

    explore = [
        {
            title: "Cosplay联盟-推荐",
            type: "multiPageComicList",
            load: async (page) => {
                let url = this.baseUrl + "/";
                let res = await Network.get(url, this.headers);
                if (res.status !== 200) throw "HTTP " + res.status;
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.extractList(doc);
                return { comics: comics, maxPage: 1 };
            }
        },
        {
            title: "Cosplay联盟-COS最新",
            type: "multiPageComicList",
            load: async (page) => {
                let url = this.baseUrl + "/list-30-" + page + ".html";
                let res = await Network.get(url, this.headers);
                if (res.status !== 200) throw "HTTP " + res.status;
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.extractList(doc);
                let maxPage = this.getMaxPage(doc);
                if (maxPage < page) maxPage = comics.length > 0 ? page + 1 : page;
                return { comics: comics, maxPage: maxPage };
            }
        }
    ]

    category = {
        title: "Cosplay联盟",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: ["COS全部", "正片", "场照", "写真全部", "摄影", "国风", "JK制服", "Lolita"],
                categoryParams: ["30", "31", "75", "26", "65", "89", "66", "88"],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let categoryId = param || "30";
            let url = this.baseUrl + "/list-" + categoryId + "-" + page + ".html";
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw "HTTP " + res.status;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.extractList(doc);
            let maxPage = this.getMaxPage(doc);
            if (maxPage < page) maxPage = comics.length > 0 ? page + 1 : page;
            return { comics: comics, maxPage: maxPage };
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let kw = (keyword || "").trim();
            if (!kw) return { comics: [], maxPage: 1 };
            
            let searchUrl = this.baseUrl + "/index.php?m=search&c=index&a=init&typeid=1&siteid=1&q=" + encodeURIComponent(kw) + "&page=" + page;
            let res = await Network.get(searchUrl, this.headers);
            
            if (res.status !== 200) return { comics: [], maxPage: 1 };
            
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.extractList(doc);
            
            if (comics.length === 0) {
                let fallbackComics = [];
                let seen = {};
                let links = doc.querySelectorAll('a[href*="show-"]');
                if (links) {
                    let len = links.length || 0;
                    for (let i = 0; i < len; i++) {
                        let a = links[i];
                        let href = this._attr(a, "href");
                        if (!href) continue;
                        let id = href.indexOf(this.baseUrl) === 0 ? href.substring(this.baseUrl.length) : href;
                        if (seen[id]) continue;
                        
                        let title = this._attr(a, "title") || this._text(a.querySelector('h4') || a);
                        let img = a.querySelector('img');
                        if (!title && img) title = this._attr(img, "alt");
                        
                        if (title && title.length > 1) {
                            seen[id] = true;
                            fallbackComics.push(new Comic({
                                id: String(id),
                                title: String(title).replace(/\s+/g, ' ').trim(),
                                cover: this._getCover(img)
                            }));
                        }
                    }
                }
                comics = fallbackComics;
            }
            
            let maxPage = this.getMaxPage(doc);
            if (maxPage < page) maxPage = page;
            
            return { comics: comics, maxPage: maxPage };
        },
        enableTagsSuggestions: false
    }

    comic = {
        loadInfo: async (id) => {
            let detailUrl = this.absUrl(id);
            let res = await Network.get(detailUrl, this.headers);
            if (res.status !== 200) throw "HTTP " + res.status;
            let doc = new HtmlDocument(this._toStr(res.body));
            
            let titleEl = doc.querySelector('.show_cos .title h1');
            if (!titleEl) titleEl = doc.querySelector('h1');
            let title = this._text(titleEl);
            if (!title) {
                let titleTag = doc.querySelector('title');
                title = this._text(titleTag);
            }
            title = title.replace(/\s*-\s*[^-]*-\s*Cosplay联盟.*$/i, "");
            title = title.replace(/\s*-\s*Cosplay联盟.*$/i, "");
            title = this._htmlToText(title);
            if (!title) title = "未知图集";
            
            let img = doc.querySelector('.show_cos .con img');
            let cover = this._getCover(img);
            
            let descEl = doc.querySelector('meta[name="description"]');
            let description = descEl ? this._attr(descEl, "content") : "";
            
            let authorEl = doc.querySelector('.show_cos .title li');
            let author = this._text(authorEl);
            if (author) {
                author = author.replace(/^.*[：:]/, "");
            }
            
            let tags = {};
            if (author) {
                tags["作者/出处"] = [String(author)];
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
            let res = await Network.get(pageUrl, this.headers);
            if (res.status !== 200) throw "HTTP " + res.status;
            
            let doc = new HtmlDocument(this._toStr(res.body));
            let images = [];
            let seen = {};
            
            let imgs = doc.querySelectorAll('.show_cos .con img');
            if (imgs) {
                let len = imgs.length || 0;
                for (let i = 0; i < len; i++) {
                    let img = imgs[i];
                    let src = this._attr(img, "data-original") || this._attr(img, "data-src") || this._attr(img, "data-lazy-src") || this._attr(img, "data-loadsrc") || this._attr(img, "realsrc") || this._attr(img, "src");
                    if (!src || src.indexOf("data:") === 0) continue;
                    
                    let url = this.absUrl(src);
                    if (!/\.(webp|jpg|jpeg|png|gif)(\?|#|$)/i.test(url)) continue;
                    
                    if (!seen[url]) {
                        seen[url] = true;
                        images.push(String(url));
                    }
                }
            }
            
            if (images.length === 0) throw "未找到图片。";
            return { images: images };
        },
        
        onImageLoad: (url, comicId, epId) => {
            let referer = this.baseUrl + "/" + epId.replace(/^\/+/, "");
            let headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": referer,
                "Origin": this.baseUrl,
                "Accept": "image/jpeg, image/png, image/*"
            };
            
            // 针对老旧 http 图片走转码代理
            if (url.indexOf("http://") === 0) {
                return { 
                    url: "https://wsrv.nl/?url=" + encodeURIComponent(url) + "&output=jpg", 
                    headers: headers 
                };
            }
            
            return { url: url, headers: headers };
        },

        onThumbnailLoad: (url) => {
            return { headers: this.imageHeaders };
        },

        link: {
            domains: ["www.pandadiu.com", "pandadiu.com"],
            linkToId: (url) => {
                let u = String(url).trim();
                if (u.indexOf(this.baseUrl) === 0) {
                    return u.substring(this.baseUrl.length);
                }
                return u;
            }
        }
    }
}