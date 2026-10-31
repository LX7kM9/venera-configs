class MengTeen extends ComicSource {
    name = "Mengteen"
    key = "mengteen"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/mengteen.js"

    get baseUrl() { return "https://www.635k.com"; }

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/"
        };
    }

    get imageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/"
        };
    }

    // 安全获取属性，防止 Null 报错
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

    // 安全获取文本
    _text(el) {
        if (!el) return "";
        if (el.text !== undefined && el.text !== null) return String(el.text).trim();
        if (el.textContent !== undefined && el.textContent !== null) return String(el.textContent).trim();
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
        let cover = this._attr(imgEl, "data-src") || this._attr(imgEl, "data-original") || this._attr(imgEl, "src") || "";
        return this.absUrl(cover);
    }

    // 提取列表
    extractList(doc, isPopular) {
        let comics = [];
        if (!doc) return comics;
        
        let items = [];
        let selector = isPopular ? "ul.topsige li a[href]" : "#post_list_box li.lpost";
        
        try {
            let list = doc.querySelectorAll(selector);
            if (list) {
                let len = list.length || 0;
                for (let i = 0; i < len; i++) {
                    if (list[i]) items.push(list[i]);
                }
            }
        } catch (e) { return comics; }

        for (let i = 0; i < items.length; i++) {
            let el = items[i];
            let linkEl = isPopular ? el : (el.querySelector('h2 a[href]') || el.querySelector('.list-img a[href]'));
            if (!linkEl) continue;
            
            let href = this._attr(linkEl, "href");
            if (!href) continue;
            let fullUrl = this.absUrl(href);
            
            let id = fullUrl;
            if (id.indexOf(this.baseUrl) === 0) {
                id = id.substring(this.baseUrl.length);
            }
            if (!id) continue;
            
            let imgEl = isPopular ? el.querySelector('img') : el.querySelector('.list-img img');
            let cover = this._getCover(imgEl);
            
            let title = "";
            if (isPopular) {
                title = this._attr(linkEl, "title") || this._text(linkEl.querySelector("h3")) || this._text(linkEl);
            } else {
                title = this._text(linkEl) || (imgEl ? this._attr(imgEl, "alt") : "");
            }
            if (!title) title = id;
            
            comics.push(new Comic({
                id: String(id),
                title: String(title),
                cover: String(cover)
            }));
        }
        return comics;
    }

    explore = [
        {
            title: "Mengteen-推荐",
            type: "multiPageComicList",
            load: async (page) => {
                // 推荐页不支持翻页
                if (page > 1) return { comics: [], maxPage: 1 };
                
                let url = this.baseUrl + "/";
                let res = await Network.get(url, this.headers);
                if (res.status !== 200) throw "HTTP " + res.status;
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.extractList(doc, true);
                return { comics: comics, maxPage: 1 };
            }
        },
        {
            title: "Mengteen-最新",
            type: "multiPageComicList",
            load: async (page) => {
                let url = page <= 1 ? this.baseUrl + "/siwataotu.html" : this.baseUrl + "/siwataotu_" + page + ".html";
                let res = await Network.get(url, this.headers);
                if (res.status !== 200) throw "HTTP " + res.status;
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.extractList(doc, false);
                return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page };
            }
        }
    ]

    category = {
        title: "Mengteen",
        parts: [
            {
                name: "分类",
                type: "fixed",
                categories: ["丝袜套图", "异思趣向", "Ligui丽柜", "克拉女神", "绅士摄影", "SSA丝社", "丝慕SMOU", "丝意SIEE", "慕丝女郎", "梦丝女神"],
                categoryParams: ["siwataotu", "IESSyisiquxiang", "liguiligui", "kelanvshenKelagirls", "shenshiSHENSHIjinjiqihua", "ssasishe", "simusmou", "siyiSIEE", "musinvlang", "mengsinvshen"],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let categoryPath = param || "siwataotu";
            let url = page <= 1 ? this.baseUrl + "/" + categoryPath + ".html" : this.baseUrl + "/" + categoryPath + "_" + page + ".html";
            
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw "HTTP " + res.status;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.extractList(doc, false);
            return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page };
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let kw = (keyword || "").trim();
            if (!kw) return { comics: [], maxPage: 1 };
            
            let url = this.baseUrl + "/search.php?q=" + encodeURIComponent(kw) + "&page=" + page;
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) return { comics: [], maxPage: 1 };
            
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.extractList(doc, false);
            return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page };
        },
        enableTagsSuggestions: false
    }

    comic = {
        loadInfo: async (id) => {
            let detailUrl = this.absUrl(id);
            let res = await Network.get(detailUrl, this.headers);
            if (res.status !== 200) throw "HTTP " + res.status;
            let doc = new HtmlDocument(this._toStr(res.body));
            
            let titleEl = doc.querySelector('.focusbox-title') || doc.querySelector('h1');
            let title = this._text(titleEl);
            if (!title) title = "未知套图";
            title = title.replace(/\s*-\s*丝袜美腿\s*$/i, "");
            
            let cover = "";
            let ogImage = doc.querySelector('meta[property="og:image"]');
            if (ogImage) {
                cover = this._attr(ogImage, "content");
            }
            if (!cover) {
                let img = doc.querySelector('article#lightgallery img.img');
                cover = this._getCover(img);
            }
            cover = this.absUrl(cover);
            
            let catEl = doc.querySelector('.list-meta a.item-meta');
            let category = this._text(catEl);
            
            let tags = {};
            if (category) {
                tags["分类"] = [String(category)];
            }
            
            let finalChapters = new Map();
            finalChapters.set(String(id), "Gallery 全部原图");
            
            return new ComicDetails({
                title: String(title),
                cover: String(cover),
                description: "点击阅读全部原图",
                tags: tags,
                chapters: finalChapters,
                url: String(detailUrl)
            });
        },
        
        loadEp: async (comicId, epId) => {
            // 直接请求 page=all 获取完整图片
            let pageUrl = this.absUrl(epId) + "?page=all";
            let res = await Network.get(pageUrl, this.headers);
            if (res.status !== 200) throw "HTTP " + res.status;
            
            let doc = new HtmlDocument(this._toStr(res.body));
            let images = [];
            let seen = {};
            
            let imgs = doc.querySelectorAll('article#lightgallery img.img');
            if (imgs) {
                let len = imgs.length || 0;
                for (let i = 0; i < len; i++) {
                    let img = imgs[i];
                    let src = this._attr(img, "data-src") || this._attr(img, "data-original") || this._attr(img, "src");
                    if (!src || src.indexOf("data:image") === 0) continue;
                    
                    let url = this.absUrl(src);
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
            // 完善防盗链处理
            let referer = this.absUrl(epId);
            let headers = {
                "User-Agent": this.imageHeaders["User-Agent"],
                "Referer": referer
            };
            return { url: url, headers: headers };
        },

        onThumbnailLoad: (url) => {
            return { headers: this.imageHeaders };
        },

        link: {
            domains: ["www.635k.com", "635k.com"],
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