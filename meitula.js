class MeiTuLe extends ComicSource {
    name = "美图乐"
    key = "meitula"
    version = "1.0.8"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/meitula.js"

    get baseUrl() { return "https://www.meitula.org"; }

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
        if (el.text !== undefined && el.text !== null) return String(el.text).trim();
        if (el.textContent !== undefined && el.textContent !== null) return String(el.textContent).trim();
        return "";
    }

    _toStr(body) {
        if (body === null || body === undefined) return "";
        if (typeof body === "string") return body;
        try { return String(body); } catch (e) { return ""; }
    }

    _padZero(num, length) {
        let s = String(num);
        while (s.length < length) s = "0" + s;
        return s;
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
        let cover = this._attr(imgEl, "data-src") || this._attr(imgEl, "data-original") || this._attr(imgEl, "data-lazy-src") || this._attr(imgEl, "src") || "";
        if (cover.indexOf("timthumb.php") !== -1) {
            let srcMatch = cover.match(/src=([^&]+)/);
            if (srcMatch && srcMatch[1]) cover = decodeURIComponent(srcMatch[1]);
        }
        cover = this.absUrl(cover);
        if (/loading\.gif|gif\.php|url\.php|logo|qrcode/i.test(cover)) return "";
        return cover;
    }

    extractList(doc) {
        let comics = [];
        if (!doc) return comics;
        
        let items = [];
        try {
            let list = doc.querySelectorAll("li.list-item.card");
            if (list) {
                let len = list.length || 0;
                for (let i = 0; i < len; i++) {
                    if (list[i]) items.push(list[i]);
                }
            }
        } catch (e) { return comics; }

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let linkEl = null;
            try { linkEl = item.querySelector('a.list-img[href*="/photo/"]'); } catch (e) {}
            if (!linkEl) {
                try { linkEl = item.querySelector('.list-body a[href*="/photo/"]'); } catch (e) {}
            }
            if (!linkEl) continue;
            
            let href = this._attr(linkEl, "href");
            if (!href) continue;
            let fullUrl = this.absUrl(href);
            
            let m = fullUrl.match(/\/photo\/(\d+)(?:_\d+)?\.html/i);
            if (!m) continue;
            let id = "/photo/" + String(m[1]) + ".html";
            
            let imgEl = null;
            try { imgEl = item.querySelector("a.list-img img"); } catch (e) {}
            let cover = this._getCover(imgEl);
            
            let titleEl = null;
            try { titleEl = item.querySelector('.list-body a[href*="/photo/"]'); } catch (e) {}
            if (!titleEl) titleEl = linkEl;
            
            let title = this._text(titleEl);
            if (!title && imgEl) title = this._attr(imgEl, "alt");
            if (!title) title = String(m[1]);
            
            comics.push(new Comic({
                id: String(id),
                title: String(title),
                cover: String(cover)
            }));
        }
        return comics;
    }

    extractSearchFallback(doc) {
        let comics = [];
        let seen = {};
        try {
            let links = doc.querySelectorAll('a[href*="/photo/"]');
            if (links) {
                let len = links.length || 0;
                for (let i = 0; i < len; i++) {
                    let a = links[i];
                    let href = this._attr(a, "href");
                    let m = href.match(/\/photo\/(\d+)(?:_\d+)?\.html/i);
                    if (!m) continue;
                    let id = "/photo/" + String(m[1]) + ".html";
                    if (seen[id]) continue;
                    
                    let title = this._text(a);
                    if (!title || title.length < 2) continue;
                    
                    let img = a.querySelector('img') || (a.parentNode ? a.parentNode.querySelector('img') : null);
                    let cover = this._getCover(img);
                    
                    seen[id] = true;
                    comics.push(new Comic({
                        id: String(id),
                        title: String(title),
                        cover: String(cover)
                    }));
                }
            }
        } catch (e) {}
        return comics;
    }

    explore = [
        {
            title: "美图乐", // 已修改为"美图乐"，并去除了周榜
            type: "multiPageComicList",
            load: async (page) => {
                let url = page <= 1 ? this.baseUrl + "/i/" : this.baseUrl + "/i/index_" + page + ".html";
                let res = await Network.get(url, this.headers);
                if (res.status !== 200) throw "HTTP " + res.status;
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.extractList(doc);
                return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page };
            }
        }
    ]

    category = {
        title: "美图乐",
        parts: [
            {
                name: "美图乐分类",
                type: "fixed",
                categories: ["最新", "周榜", "月榜", "热推", "COS女仆", "网络美女", "情趣内衣", "性感诱惑", "丝袜美腿", "COSER"],
                categoryParams: ["i", "week", "month", "top", "tags/cos", "tags/wangluomeinv", "tags/qingquneiyi", "tags/xinggan", "tags/meitui", "tags/coser"],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let categoryPath = param || "i";
            let url = "";
            if (categoryPath.indexOf("tags/") === 0) {
                url = page <= 1 ? this.baseUrl + "/" + categoryPath + "/" : this.baseUrl + "/" + categoryPath + "/" + page + ".html";
            } else {
                url = page <= 1 ? this.baseUrl + "/" + categoryPath + "/" : this.baseUrl + "/" + categoryPath + "/index_" + page + ".html";
            }
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw "HTTP " + res.status;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.extractList(doc);
            return { comics: comics, maxPage: comics.length > 0 ? page + 1 : page };
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let kw = (keyword || "").trim();
            if (!kw) return { comics: [], maxPage: 1 };
            
            let res = null;
            let comics = [];
            
            try {
                let postHeaders = {
                    "User-Agent": this.headers["User-Agent"],
                    "Referer": this.baseUrl + "/",
                    "Content-Type": "application/x-www-form-urlencoded"
                };
                let postData = "tbname=news&show=title&tempid=1&keyboard=" + encodeURIComponent(kw);
                res = await Network.post(this.baseUrl + "/e/search/", postHeaders, postData);
            } catch (e) {}
            
            if (!res || res.status !== 200) {
                let getUrl = this.baseUrl + "/e/search/index.php?keyboard=" + encodeURIComponent(kw) + "&show=title&tempid=1&tbname=news";
                res = await Network.get(getUrl, this.headers);
            }
            
            if (res && res.status === 200) {
                let doc = new HtmlDocument(this._toStr(res.body));
                comics = this.extractList(doc);
                if (comics.length === 0) {
                    comics = this.extractSearchFallback(doc);
                }
            }
            
            return { comics: comics, maxPage: 1 };
        },
        enableTagsSuggestions: false
    }

    comic = {
        loadInfo: async (id) => {
            let detailUrl = this.absUrl(id);
            let res = await Network.get(detailUrl, this.headers);
            if (res.status !== 200) throw "HTTP " + res.status;
            let doc = new HtmlDocument(this._toStr(res.body));
            
            let titleEl = doc.querySelector('.album-top h1');
            if (!titleEl) titleEl = doc.querySelector('h1');
            let title = this._text(titleEl);
            if (!title) {
                let titleTag = doc.querySelector('title');
                title = this._text(titleTag);
            }
            title = title.replace(/\s*-\s*美图乐.*$/i, "");
            if (!title) title = "未知图集";
            
            let img = doc.querySelector('.content img');
            let cover = this._getCover(img);
            
            let descEl = doc.querySelector('meta[name="description"]');
            let description = descEl ? this._attr(descEl, "content") : "";
            
            let meta = {};
            let dts = doc.querySelectorAll('.album-top dl dt');
            if (dts) {
                let len = dts.length || 0;
                for (let i = 0; i < len; i++) {
                    let dt = dts[i];
                    let key = this._text(dt);
                    let dd = dt.nextElementSibling;
                    if (key && dd) {
                        meta[key] = this._text(dd);
                    }
                }
            }
            
            let lines = [];
            if (meta['拍摄机构']) lines.push("拍摄机构: " + meta['拍摄机构']);
            if (meta['出镜模特']) lines.push("出镜模特: " + meta['出镜模特']);
            if (meta['发行日期']) lines.push("发行日期: " + meta['发行日期']);
            if (meta['照片数量']) lines.push("照片数量: " + meta['照片数量']);
            
            if (lines.length > 0) {
                description = description + "\n" + lines.join("\n");
            }
            
            let tags = {};
            if (meta['拍摄机构']) tags["拍摄机构"] = [String(meta['拍摄机构'])];
            if (meta['出镜模特']) tags["出镜模特"] = [String(meta['出镜模特'])];
            
            let total = 1;
            let bodyEl = doc.querySelector('body');
            let bodyText = bodyEl ? this._text(bodyEl) : "";
            let countMatch = bodyText.match(/照片数量\s*[:：]?\s*(\d+)/) || bodyText.match(/(\d+)\s*[张張枚]\s*(?:图片|照片|写真)?/);
            if (countMatch) {
                total = Math.max(total, parseInt(countMatch[1], 10) || 1);
            } else {
                let pageLinks = doc.querySelectorAll('ul.page a[href*="/photo/"]');
                if (pageLinks) {
                    let plen = pageLinks.length || 0;
                    for (let i = 0; i < plen; i++) {
                        let href = this._attr(pageLinks[i], "href");
                        let m = href.match(/\/photo\/\d+_(\d+)\.html/i);
                        if (m) total = Math.max(total, parseInt(m[1], 10) || 1);
                    }
                }
            }
            total = Math.min(Math.max(total, 1), 300);
            
            let finalChapters = new Map();
            let groupSize = 10;
            for (let start = 1; start <= total; start += groupSize) {
                let end = Math.min(start + groupSize - 1, total);
                let chapId = id + "#mxrange=" + start + "-" + end;
                let chapTitle = "第 " + this._padZero(start, 3) + "-" + this._padZero(end, 3) + " 张";
                finalChapters.set(String(chapId), String(chapTitle));
            }
            
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
            let match = epId.match(/\/photo\/(\d+)(?:_\d+)?\.html#mxrange=(\d+)-(\d+)/i);
            if (!match) throw "章节格式错误";
            let photoId = match[1];
            let start = parseInt(match[2], 10);
            let end = parseInt(match[3], 10);
            
            let images = [];
            let promises = [];
            for (let pageNo = start; pageNo <= end; pageNo++) {
                let pageUrl = pageNo <= 1 
                    ? this.baseUrl + "/photo/" + photoId + ".html"
                    : this.baseUrl + "/photo/" + photoId + "_" + pageNo + ".html";
                    
                promises.push((async () => {
                    try {
                        let res = await Network.get(pageUrl, this.headers);
                        if (res.status === 200) {
                            let doc = new HtmlDocument(this._toStr(res.body));
                            let img = doc.querySelector(".content img");
                            if (img) {
                                let imgUrl = this._attr(img, "src") || this._attr(img, "data-src") || this._attr(img, "data-original");
                                if (imgUrl && !/loading\.gif|logo|qrcode|gif\.php|url\.php/i.test(imgUrl)) {
                                    return this.absUrl(imgUrl);
                                }
                            }
                        }
                    } catch (e) {}
                    return null;
                })());
            }
            
            for (let i = 0; i < promises.length; i += 5) {
                let chunk = await Promise.all(promises.slice(i, i + 5));
                for (let j = 0; j < chunk.length; j++) {
                    let r = chunk[j];
                    if (r && images.indexOf(r) === -1) {
                        images.push(String(r));
                    }
                }
            }
            
            if (images.length === 0) throw "未找到图片，可能遇到网站防爬或图片尚未生成。";
            return { images: images };
        },
        
        onImageLoad: (url, comicId, epId) => {
            return { url: url, headers: this.imageHeaders };
        },

        onThumbnailLoad: (url) => {
            return { headers: this.imageHeaders };
        },

        link: {
            domains: ["www.meitula.org", "meitula.org"],
            linkToId: (url) => {
                let m = String(url).match(/\/photo\/(\d+)(?:_\d+)?\.html/i);
                if (m && m[1]) return "/photo/" + m[1] + ".html";
                return null;
            }
        }
    }
}