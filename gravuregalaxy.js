class GravureGalaxy extends ComicSource {
    name = "GravureGalaxy"
    key = "gravuregalaxy"
    version = "2.0.1"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/gravuregalaxy.js"

    baseUrl = "https://gravuregalaxy.hatenablog.com"

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
            "Referer": this.baseUrl + "/"
        }
    }

    // 使用 wsrv.nl 代理图片，防止 Hatenablog 的图片并发请求触发 429 封禁
    proxyImage(url) {
        if (!url) return "";
        let u = String(url).trim();
        if (!u.startsWith("http")) return u;
        return `https://wsrv.nl/?url=${encodeURIComponent(u)}`;
    }

    // 带重试机制的请求，防止 429
    async fetchHtmlSafe(url) {
        for (let i = 0; i < 2; i++) {
            try {
                let res = await Network.get(url, this.headers);
                if (res.status === 200 && res.body && !res.body.includes("429 Too Many Requests")) {
                    return res.body;
                }
                if (res.status === 429) {
                    await new Promise(r => { try { setTimeout(r, 1000); } catch (e) { r(); } });
                }
            } catch (e) {}
        }
        return "";
    }

    processCover(url) {
        if (!url) return "";
        let s = String(url).replace(/&amp;/g, "&");
        let m = s.match(/(https%3A%2F%2F.+?\.(?:jpg|jpeg|png|webp))(?:[?#].*)?$/i);
        if (m) {
            try { s = decodeURIComponent(m[1]); } catch (e) {}
        }
        return s;
    }

    parseList(doc) {
        let comics = [];
        if (!doc) return comics;
        let items = doc.querySelectorAll(".archive-entry");
        for (let item of items) {
            let linkEl = item.querySelector("a.entry-title-link");
            if (!linkEl) continue;
            let href = linkEl.attributes.href || "";
            let id = href.replace(/^https?:\/\/(www\.)?gravuregalaxy\.hatenablog\.com/i, "").replace(/^\/+|\/+$/g, "");
            let title = (linkEl.text || "").trim();
            let cover = "";
            let thumb = item.querySelector(".entry-thumb");
            if (thumb && thumb.attributes && thumb.attributes.style) {
                let match = thumb.attributes.style.match(/url\(['"]?([^'")]+)['"]?\)/i);
                if (match) cover = match[1];
            }
            if (!cover) {
                let img = item.querySelector("img");
                if (img) cover = img.attributes.src || img.attributes["data-src"] || "";
            }
            cover = this.processCover(cover);
            if (id && title) {
                comics.push(new Comic({ id: id, title: title, cover: this.proxyImage(cover) }));
            }
        }
        return comics;
    }

    getMaxPage(doc, currentPage) {
        if (!doc) return currentPage;
        let nextBtn = doc.querySelector("a.archive-pagination-next") || doc.querySelector(".pager-next a");
        return nextBtn ? currentPage + 1 : currentPage;
    }

    // ========== 发现页 ==========
    explore = [
        {
            title: this.name, 
            type: "multiPageComicList",
            load: async (page) => {
                let url = page <= 1 ? this.baseUrl + "/" : this.baseUrl + "/?page=" + page;
                let body = await this.fetchHtmlSafe(url);
                if (!body) throw "加载超时，请下拉刷新重试";
                let doc = new HtmlDocument(body);
                return {
                    comics: this.parseList(doc),
                    maxPage: this.getMaxPage(doc, page)
                };
            }
        }
    ]

    // ========== 分类页 (精简为只保留 Cup) ==========
    category = {
        title: this.name,
        parts: [
            {
                name: "罩杯分类",
                type: "fixed",
                categories: ["C Cup", "D Cup", "E Cup", "F Cup", "G Cup", "H Cup", "I Cup", "J Cup", "K Cup", "L Cup"],
                categoryParams: ["Cカップ", "Dカップ", "Eカップ", "Fカップ", "Gカップ", "Hカップ", "Iカップ", "Jカップ", "Kカップ", "Lカップ"],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let url = this.baseUrl + "/archive/category/" + encodeURIComponent(param);
            if (page > 1) url += "?page=" + page;
            
            let body = await this.fetchHtmlSafe(url);
            if (!body) throw "加载失败，请重试。";
            
            let doc = new HtmlDocument(body);
            return {
                comics: this.parseList(doc),
                maxPage: this.getMaxPage(doc, page)
            };
        }
    }

    // ========== 搜索 ==========
    search = {
        load: async (keyword, options, page) => {
            let kw = encodeURIComponent(keyword.trim());
            let url = this.baseUrl + "/search?q=" + kw;
            if (page > 1) url += "&page=" + page;
            let body = await this.fetchHtmlSafe(url);
            if (!body) throw "加载失败，请重试。";
            let doc = new HtmlDocument(body);
            return {
                comics: this.parseList(doc),
                maxPage: this.getMaxPage(doc, page)
            };
        },
        enableTagsSuggestions: false
    }

    // ========== 详情与阅读 ==========
    comic = {
        loadInfo: async (id) => {
            let url = this.baseUrl + "/" + id;
            let body = await this.fetchHtmlSafe(url);
            if (!body) throw "获取详情失败，请重试。";
            let doc = new HtmlDocument(body);

            let titleEl = doc.querySelector("h1.entry-title") || doc.querySelector(".entry-title-link");
            let title = titleEl ? (titleEl.text || "").trim() : id;

            let cover = "";
            let ogImage = doc.querySelector('meta[property="og:image"]');
            if (ogImage && ogImage.attributes) cover = ogImage.attributes.content || "";
            if (!cover) {
                let img = doc.querySelector(".entry-content img");
                if (img) cover = img.attributes.src || img.attributes["data-src"] || "";
            }
            cover = this.processCover(cover);

            let desc = "";
            let ogDesc = doc.querySelector('meta[property="og:description"]') || doc.querySelector('meta[name="description"]');
            if (ogDesc && ogDesc.attributes) desc = ogDesc.attributes.content || "";

            let tags = [];
            let tagEls = doc.querySelectorAll(".entry-category-link");
            for (let el of tagEls) {
                let t = (el.text || "").trim();
                if (t) tags.push(t);
            }

            let chapters = new Map();
            chapters.set(id, "Gallery");

            return new ComicDetails({
                title: title,
                cover: this.proxyImage(cover),
                description: desc,
                tags: { "标签": tags },
                chapters: chapters,
                url: url
            });
        },

        loadEp: async (comicId, epId) => {
            let url = this.baseUrl + "/" + comicId; 
            let body = await this.fetchHtmlSafe(url);
            if (!body) throw "获取页面失败，请返回重试。";

            let doc = new HtmlDocument(body);
            let root = doc.querySelector(".entry-content") || doc.querySelector("body");
            let imgs = root ? root.querySelectorAll("img") : [];
            let images = [];
            let seen = new Set();

            for (let img of imgs) {
                let src = img.attributes.src || img.attributes["data-src"] || img.attributes["data-original"] || "";
                if (!src) continue;
                if (src.startsWith("//")) src = "https:" + src;
                else if (!src.startsWith("http")) src = this.baseUrl + (src.startsWith("/") ? "" : "/") + src;
                
                src = src.replace(/&amp;/g, "&");

                if (!/\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(src)) continue;
                if (/amazon|profile|blogmura|banner|icon|svg|with2\.net|hatena-module|blog_custom_icon/i.test(src)) continue;

                if (!seen.has(src)) {
                    seen.add(src);
                    images.push(this.proxyImage(src));
                }
            }

            if (images.length === 0) throw "未提取到图片，请重试。";
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
            return { url: url, headers: { "User-Agent": "Mozilla/5.0" } };
        },

        onThumbnailLoad: (url) => {
            return { headers: { "User-Agent": "Mozilla/5.0" } };
        },

        link: {
            domains: ["gravuregalaxy.hatenablog.com"],
            linkToId: (url) => {
                let m = String(url || "").match(/^https?:\/\/gravuregalaxy\.hatenablog\.com\/(.*)$/i);
                if (!m) return null;
                let path = m[1].split("#")[0].split("?")[0];
                return path.replace(/^\/+|\/+$/g, "");
            }
        }
    }
}