class WuXian extends ComicSource {
    name = "无限动漫"
    key = "wuxian"
    version = "1.0.8"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/wuxian.js"

    get baseUrl() { return "https://www.8comic.com"; }
    get comicBaseUrl() { return "https://articles.onemoreplace.tw"; }

    get headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        };
    }

    get imageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": this.baseUrl + "/",
            "Accept": "image/avif,image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.5"
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

    _extractId(href) {
        if (!href) return "";
        let s = String(href).trim();
        let m = s.match(/(\d+)\.html/);
        return m ? m[1] : s;
    }

    parseList(doc, isLatest) {
        let comics = [];
        if (!doc) return comics;
        let selector = isLatest ? ".container .row .cat2_list a" : ".container .row a.comicpic_col6";
        let cards = this.qsa(doc, [selector]);
        
        for (let card of cards) {
            let titleEl = this.qs(card, ["li.nowraphide"]);
            let imgEl = this.qs(card, ["img"]);
            if (titleEl && imgEl) {
                let title = (titleEl.text || "").trim();
                let cover = this.absUrl(this._attr(imgEl, "src") || this._attr(imgEl, "data-src"));
                let id = this._extractId(this._attr(card, "href"));
                if (id) {
                    comics.push(new Comic({ id: id, title: title, cover: cover }));
                }
            }
        }
        return comics;
    }

    explore = [
        {
            title: "无限动漫",
            type: "multiPageComicList",
            load: async (page) => {
                let url = `${this.baseUrl}/comic/h-${page}.html`;
                let res = await Network.get(url, this.headers);
                if (res.status !== 200) throw `HTTP ${res.status}`;
                let doc = new HtmlDocument(this._toStr(res.body));
                let comics = this.parseList(doc, false);
                let hasNext = this.qs(doc, ["div.pager a span.mdi-skip-next"]) !== null;
                return { comics: comics, maxPage: hasNext ? page + 1 : page };
            }
        }
    ]

    category = {
        title: "无限动漫",
        parts: [
            {
                name: "排序",
                type: "fixed",
                categories: ["热门", "最新"],
                categoryParams: ["popular", "latest"],
                itemType: "category"
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let isLatest = param === "latest";
            let url = isLatest 
                ? `${this.baseUrl}/comic/u-${page}.html`
                : `${this.baseUrl}/comic/h-${page}.html`;
            
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.parseList(doc, isLatest);
            let hasNext = this.qs(doc, ["div.pager a span.mdi-skip-next"]) !== null;
            return { comics: comics, maxPage: hasNext ? page + 1 : page };
        }
    }

    search = {
        load: async (keyword, options, page) => {
            let kw = encodeURIComponent((keyword || "").trim());
            let url = `${this.baseUrl}/member/search.aspx?key=${kw}&page=${page}`;
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));
            let comics = this.parseList(doc, false);
            let hasNext = this.qs(doc, ["div.pager a span.mdi-skip-next"]) !== null;
            return { comics: comics, maxPage: hasNext ? page + 1 : page };
        },
        enableTagsSuggestions: false
    }

    comic = {
        loadInfo: async (id) => {
            let url = `${this.baseUrl}/html/${id}.html`;
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            let doc = new HtmlDocument(this._toStr(res.body));

            let title = (this.qs(doc, [".item_content_box .h2"])?.text || "").trim();
            let coverImg = this.qs(doc, [".item-cover img"]);
            let cover = this.absUrl(this._attr(coverImg, "src"));
            
            let author = (this.qs(doc, [".item_content_box .item-info-author"])?.text || "").trim();
            if (author.includes("作者:")) author = author.split("作者:")[1].trim();

            let description = (this.qs(doc, [".item_content_box .item_info_detail"])?.text || "").trim();
            let statusText = (this.qs(doc, [".item_content_box .item-info-status"])?.text || "").trim();
            let status = "未知";
            if (statusText.includes("連載中")) status = "连载中";
            else if (statusText.includes("已完結")) status = "已完结";

            let chapterEls = this.qsa(doc, ["#chapters a", ".comic_chapters a"]);
            let chapters = new Map();

            for (let el of chapterEls) {
                let onclick = this._attr(el, "onclick");
                let chapterUrl = "";
                
                if (onclick.includes("cview")) {
                    let startIdx = onclick.indexOf("cview('") + 7;
                    if (startIdx > 6) {
                        let params = onclick.substring(startIdx).split("'")[0];
                        let parts = params.split("-");
                        let comicId = parts[0] || "";
                        let chapterId = (parts[1] || "").split(".html")[0];
                        if (comicId && chapterId) {
                            chapterUrl = `${this.comicBaseUrl}/online/new-${comicId}.html?ch=${chapterId}`;
                        }
                    }
                }
                
                if (!chapterUrl) {
                    let href = this._attr(el, "href");
                    if (href.startsWith("/online/")) {
                        chapterUrl = this.comicBaseUrl + href;
                    } else if (href.startsWith("http")) {
                        chapterUrl = href;
                    } else if (href) {
                        chapterUrl = this.absUrl(href);
                    }
                }

                if (chapterUrl) {
                    let chapterTitle = (el.text || "").replace(/\s*document\..*$/g, "").replace(/\s+/g, " ").trim();
                    if (!chapterTitle) chapterTitle = "Chapter " + (chapters.size + 1);
                    chapters.set(chapterUrl, chapterTitle);
                }
            }

            let tags = {};
            if (author) tags["作者"] = [author];
            tags["状态"] = [status];

            // 【修复】更正类名为 ComicDetails
            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                url: url
            });
        },

        loadEp: async (comicId, epId) => {
            let url = this.absUrl(epId);
            let res = await Network.get(url, this.headers);
            if (res.status !== 200) throw `HTTP ${res.status}`;
            
            let htmlStr = this._toStr(res.body);
            
            // 1. 提取核心变量
            let go12h8b53Match = htmlStr.match(/go12h8b53='([^']+)'/);
            if (!go12h8b53Match) throw "未找到加密核心数据";
            let go12h8b53 = go12h8b53Match[1];
            
            // 【修复】精准提取 ti (漫画ID)
            let tiMatch = htmlStr.match(/var chs=\d+;var ti=(\d+)/);
            let ti = tiMatch ? parseInt(tiMatch[1]) : 0;
            if (ti === 0) throw "未找到漫画 ID 数据";
            
            let chMatch = url.match(/[?&]ch=([^&]+)/);
            let ch = chMatch ? chMatch[1] : "1";
            
            // 2. 定义解密函数
            let lc = (l) => {
                if (l.length != 2) return l;
                let az = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                let a = l.substring(0, 1);
                let b = l.substring(1, 2);
                if (a == 'Z') return 8000 + az.indexOf(b);
                else return az.indexOf(a) * 52 + az.indexOf(b);
            };
            let su = (a, b, c) => (a + '').substring(b, b + c);
            let nn = (n) => n < 10 ? '00' + n : n < 100 ? '0' + n : n;
            let mm = (p) => (parseInt((p - 1) / 10) % 10) + (((p - 1) % 10) * 3);
            
            let r2k1uc45 = (str) => {
                let res = '';
                for (let i = 0; i < str.length / 2; i++) {
                    res += '%' + str.substring(i * 2, i * 2 + 2);
                }
                return unescape(res);
            };
            let u45r0gi8s = (x) => {
                let start = go12h8b53.length - 47 - x * 6;
                let end = start + 6;
                return r2k1uc45(go12h8b53.substring(start, end));
            };
            
            // 常量
            let wb0cps2of_ = 49;
            let wh_ik_b0cp = 46;
            let kyvbp7hhk4 = '%38'; // 8
            let si8s0kp3 = '%5f';  // _
            let lb53v4 = 48;
            let uprz3_yvb = '%2f';  // /
            let ih045vprz3 = '%2e'; // .
            
            // 3. 匹配对应章节并解密
            let ps = 0;
            let c36273z = "";
            let p9325ee = "0";
            let dzvy17mf = "";
            let lf947p = "";
            
            for (let i = 0; i < 2000; i++) {
                let c = lc(su(go12h8b53, i * (wh_ik_b0cp + 1) + 0, 2));
                let d = lc(su(go12h8b53, i * (wb0cps2of_ - 2) + 2, 2));
                let g = lc(su(go12h8b53, i * (lb53v4 - 1) + 4, 2));
                // 注意这里提取的是 40 个字符，且不经过 lc 转换，保持字符串原样
                let l = su(go12h8b53, i * (wh_ik_b0cp + 1) + 6, 40); 
                let p = lc(su(go12h8b53, i * (lb53v4 - 1) + 46, 1));
                
                if (c == ch) {
                    c36273z = c;
                    p9325ee = p;
                    ps = g;
                    dzvy17mf = d;
                    lf947p = l;
                    break;
                }
            }
            
            if (ps == 0) throw "未找到该章节的解密数据";
            
            // 4. 拼接真实图片 URL
            let images = [];
            for (let j = 1; j <= ps; j++) {
                let rawUrl = uprz3_yvb + uprz3_yvb + u45r0gi8s(4) + su(dzvy17mf, 0, 1) + ih045vprz3 + kyvbp7hhk4 + u45r0gi8s(3) + u45r0gi8s(2) + u45r0gi8s(3) + uprz3_yvb + su(dzvy17mf, 1, 1) + uprz3_yvb + ti + uprz3_yvb + c36273z + (p9325ee == "0" ? "" : p9325ee) + uprz3_yvb + nn(j) + si8s0kp3 + su(lf947p, mm(j), 3) + ih045vprz3 + u45r0gi8s(1);
                
                let decodedUrl = unescape(rawUrl);
                if (decodedUrl.startsWith("//")) decodedUrl = "https:" + decodedUrl;
                images.push(decodedUrl);
            }
            
            return { images: images };
        },

        onImageLoad: (url, comicId, epId) => {
            return { url: url, headers: this.imageHeaders };
        },

        onThumbnailLoad: (url) => {
            return { headers: { "Referer": this.baseUrl + "/", "User-Agent": this.headers["User-Agent"] } };
        },

        link: {
            domains: ["8comic.com", "www.8comic.com"],
            linkToId: (url) => {
                let m = String(url || "").match(/8comic\.com\/html\/(\d+)\.html/i);
                if (m && m[1]) return m[1];
                return null;
            }
        }
    }
}