class RuManHua extends ComicSource {
    name = "如漫画"
    key = "rumanhua"
    version = "2.4.1"   // 动态解析 tool.js 获取搜索接口，缓存 1 小时
    minAppVersion = "1.0.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/rumanhua.js"

    settings = {
        base_url: {
            title: "访问地址",
            type: "select",
            options: [
                { value: "http://m.rumanhua2.com", text: "http://m.rumanhua2.com（默认，稳定）" },
                { value: "http://www.rumanhua2.com", text: "http://www.rumanhua2.com" },
                { value: "http://m.rumanhua1.com", text: "http://m.rumanhua1.com（备用线路）" },
                { value: "http://www.rumanhua1.com", text: "http://www.rumanhua1.com（备用线路）" },
            ],
            default: "http://m.rumanhua2.com",
        },
        image_quality: {
            title: "图片质量",
            type: "select",
            options: [
                { value: "default", text: "默认" }
            ],
            default: "default",
        }
    }

    get baseUrl() {
        return this.loadSetting("base_url") || "http://m.rumanhua2.com";
    }

    _headers() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": this.baseUrl + "/",
        };
    }

    async _fetchBody(label, url) {
        let res = await Network.get(url, this._headers());
        if (res.status >= 300 && res.status < 400) {
            let loc = res.headers && (res.headers["location"] || res.headers["Location"]);
            if (loc) {
                if (loc.startsWith("/")) loc = this.baseUrl + loc;
                res = await Network.get(loc, this._headers());
            }
        }
        if (res.status !== 200) throw label + " 请求失败: " + res.status;
        return res.body;
    }

    async _postBody(label, url, data) {
        const headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            ...this._headers()
        };
        const body = Object.keys(data).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k])).join('&');
        let res = await Network.post(url, headers, Convert.encodeUtf8(body));
        if (res.status >= 300 && res.status < 400) {
            let loc = res.headers && (res.headers["location"] || res.headers["Location"]);
            if (loc) {
                if (loc.startsWith("/")) loc = this.baseUrl + loc;
                res = await Network.post(loc, headers, Convert.encodeUtf8(body));
            }
        }
        if (res.status !== 200) throw label + " POST 请求失败: " + res.status;
        return res.body;
    }

    // ===== 动态解析搜索接口 =====
    // 从 /static/js/tool.js 的 get_search_data() 里提取真实的 URL、方法、参数名。
    // 结果缓存 1 小时；解析失败时使用默认值（当前站点可用：POST /s + k）
    async _resolveSearchApi() {
        const now = Date.now();
        if (this._searchApi && this._searchApiExpire && now < this._searchApiExpire) {
            return this._searchApi;
        }

        // 默认值（站点当前已确认可用）
        let api = { method: "POST", path: "/s", param: "k", source: "default" };

        try {
            // 从首页找 tool.js 的带版本号 URL（如 /static/js/tool.js?v=171200013）
            let toolUrl = this.baseUrl + "/static/js/tool.js";
            try {
                const homeBody = await this._fetchBody("home", this.baseUrl + "/");
                const m = homeBody.match(/\/static\/js\/tool\.js\?v=[0-9]+/);
                if (m) toolUrl = this.baseUrl + m[0];
            } catch (e) {}

            const js = await this._fetchBody("tool.js", toolUrl);

            // 定位 get_search_data 函数体
            const idx = js.indexOf("function get_search_data");
            if (idx >= 0) {
                const seg = js.slice(idx, idx + 8000);

                // 优先匹配 $.post("/s", { k: k })
                let mm = seg.match(/\$\.post\(\s*["']([^"']+)["']\s*,\s*\{([^}]*)\}\s*\)/);
                if (mm) {
                    api.method = "POST";
                    api.path = mm[1];
                    const pm = mm[2].match(/([a-zA-Z_$][\w$]*)\s*:/);
                    if (pm) api.param = pm[1];
                    api.source = "tool.js:$.post";
                } else {
                    // 匹配 $.get("...url...")
                    mm = seg.match(/\$\.get\(\s*["']([^"']+)["']/);
                    if (mm) {
                        api.method = "GET";
                        api.path = mm[1];
                        const qm = mm[1].match(/[?&]([a-zA-Z_$][\w$]*)=/);
                        if (qm) api.param = qm[1];
                        api.source = "tool.js:$.get";
                    } else {
                        // 匹配 $.ajax({ url: "...", type: "...", data: { k: ... } })
                        mm = seg.match(/\$\.ajax\(\s*\{([\s\S]{0,800}?)\}\s*\)/);
                        if (mm) {
                            const block = mm[1];
                            const um = block.match(/url\s*:\s*["']([^"']+)["']/);
                            const tm = block.match(/type\s*:\s*["']([^"']+)["']/i);
                            const dm = block.match(/data\s*:\s*\{([^}]*)\}/);
                            if (um) {
                                api.method = (tm ? tm[1] : "POST").toUpperCase();
                                api.path = um[1];
                                if (dm) {
                                    const pm = dm[1].match(/([a-zA-Z_$][\w$]*)\s*:/);
                                    if (pm) api.param = pm[1];
                                }
                                api.source = "tool.js:$.ajax";
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // 解析失败，使用默认值
        }

        this._searchApi = api;
        this._searchApiExpire = now + 60 * 60 * 1000;
        return api;
    }

    parseComicAnchor(a) {
        if (!a) return null;
        let href = a.attributes["href"] || "";
        let m = href.match(/\/([A-Za-z0-9]+)\/?$/);
        if (!m) return null;
        let id = m[1];

        let img = a.querySelector("img");
        let cover = "";
        if (img) cover = img.attributes["data-src"] || img.attributes["src"] || "";

        let title = "";
        let h2 = a.querySelector("h2");
        if (h2) title = h2.text.trim();
        if (!title) {
            let ct = a.querySelector(".card-title");
            if (ct) title = ct.text.trim();
        }
        if (!title) title = a.attributes["title"] || id;

        let sub = "";
        let ps = a.querySelectorAll("p");
        for (let p of ps) {
            let t = p.text.trim();
            if (!t) continue;
            if (p.attributes && (p.attributes["class"] || "").indexOf("card-title") >= 0) continue;
            sub = t;
        }

        if (!cover) return null;
        return new Comic({ id: id, title: title, subTitle: sub, cover: cover });
    }

    async _parseHomeSections() {
        let body = await this._fetchBody("home", this.baseUrl + "/");
        let doc = new HtmlDocument(body);
        let sections = [];
        for (let sec of doc.querySelectorAll(".mults")) {
            let head = sec.querySelector(".mult-head");
            let title = head ? head.text.trim() : "推荐";
            let comics = [];
            let seen = {};
            for (let a of sec.querySelectorAll(".mult-body li a")) {
                let c = this.parseComicAnchor(a);
                if (!c || seen[c.id]) continue;
                seen[c.id] = true;
                comics.push(c);
            }
            if (comics.length) {
                sections.push({ title, comics });
            }
        }
        doc.dispose();
        return sections;
    }

    explore = [
        {
            title: "如漫画",
            type: "singlePageWithMultiPart",
            load: async () => {
                try {
                    let sections = await this._parseHomeSections();
                    let result = {};
                    for (let sec of sections) {
                        result[sec.title] = sec.comics;
                    }
                    if (Object.keys(result).length === 0) result["首页"] = [];
                    return result;
                } catch (e) {
                    return {};
                }
            }
        },
        {
            title: "最新更新",
            type: "singlePageWithMultiPart",
            load: async () => {
                try {
                    let sections = await this._parseHomeSections();
                    let target = null;
                    for (let sec of sections) {
                        if (sec.title.includes("最新")) {
                            target = sec;
                            break;
                        }
                    }
                    if (!target && sections.length > 0) {
                        target = sections[sections.length - 1];
                    }
                    let result = {};
                    if (target) {
                        result["最新更新"] = target.comics;
                    } else {
                        result["最新更新"] = [];
                    }
                    return result;
                } catch (e) {
                    return { "最新更新": [] };
                }
            }
        }
    ]

    category = {
        title: "如漫画",
        parts: [
            {
                name: "分类",
                type: "fixed",
                itemType: "category",
                categories: [
                    "冒险", "热血", "都市", "玄幻", "悬疑", "耽美", "恋爱", "生活",
                    "搞笑", "穿越", "修真", "后宫", "女主", "古风", "连载", "完结",
                ],
                categoryParams: [
                    "sort/1", "sort/2", "sort/3", "sort/4", "sort/5", "sort/6",
                    "sort/7", "sort/8", "sort/9", "sort/10", "sort/11", "sort/12",
                    "sort/13", "sort/14", "sort/15", "sort/16",
                ],
            },
            {
                name: "排行榜",
                type: "fixed",
                itemType: "category",
                categories: ["精品榜", "人气榜", "推荐榜", "黑马榜", "最近更新", "新漫画"],
                categoryParams: ["rank/1", "rank/2", "rank/3", "rank/4", "rank/5", "rank/6"],
            }
        ],
        enableRankingPage: false
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            if (!param) return { comics: [], maxPage: 1 };
            try {
                let body = await this._fetchBody("category", this.baseUrl + "/" + param);
                let comics = this.parseRankList(body);
                return { comics: comics, maxPage: 1 };
            } catch (e) {
                return { comics: [], maxPage: 1 };
            }
        }
    }

    parseRankList(html) {
        let doc = new HtmlDocument(html);
        let comics = [];
        let seen = {};
        for (let li of doc.querySelectorAll(".rank-box .rank-list li")) {
            let a = li.querySelector("a[href]");
            let c = this.parseComicAnchor(a);
            if (!c || seen[c.id]) continue;
            seen[c.id] = true;
            comics.push(c);
        }
        for (let li of doc.querySelectorAll(".manga-list li, .rank-list li")) {
            let a = li.querySelector("a[href]");
            let c = this.parseComicAnchor(a);
            if (!c || seen[c.id]) continue;
            seen[c.id] = true;
            comics.push(c);
        }
        doc.dispose();
        return comics;
    }

    // ===== 搜索：动态解析接口 + JSON 解析 =====
    search = {
        load: async (keyword, options, page) => {
            const kw = String(keyword || "").trim();
            if (kw.length <= 0) throw "请输入你想搜索的内容";
            if (kw.length == 1) throw "搜索漫画不能小于2个字哦";
            if (kw.length > 12) throw "搜索漫画不能大于12个字哦";

            // 动态解析接口（带缓存）
            const api = await this._resolveSearchApi();

            const headers = {
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Referer": this.baseUrl + "/",
            };

            const paramStr = api.param + "=" + encodeURIComponent(kw);
            let res;

            if (api.method === "GET") {
                let url = this.baseUrl + api.path;
                url += (url.indexOf("?") >= 0 ? "&" : "?") + paramStr;
                res = await Network.get(url, headers);
            } else {
                const postHeaders = {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    ...headers
                };
                res = await Network.post(this.baseUrl + api.path, postHeaders, Convert.encodeUtf8(paramStr));
            }

            if (res.status !== 200) {
                throw "如漫画搜索请求失败: HTTP " + res.status;
            }

            let ret;
            try {
                ret = JSON.parse(res.body);
            } catch (e) {
                throw "如漫画搜索响应无法解析（非 JSON）";
            }

            if (!ret || ret.code === "-1") {
                throw "如漫画搜索失败: " + (ret && ret.msg ? ret.msg : "未知错误");
            }
            if (ret.code === "201") {
                return { comics: [], maxPage: 1 };
            }
            if (ret.code !== "200") {
                return { comics: [], maxPage: 1 };
            }

            const list = Array.isArray(ret.data) ? ret.data : [];
            const comics = [];
            const seen = {};
            for (const item of list) {
                const id = String(item.id || "").trim();
                if (!id || seen[id]) continue;
                seen[id] = true;
                comics.push(new Comic({
                    id: id,
                    title: String(item.name || id),
                    cover: String(item.imgurl || ""),
                    subTitle: String(item.remarks || ""),
                }));
            }
            return { comics: comics, maxPage: 1 };
        },
        optionList: [],
        enableTagsSuggestions: false,
    }

    comic = {
        loadInfo: async (id) => {
            try {
                let body = await this._fetchBody("detail", this.baseUrl + "/" + id + "/");
                let doc = new HtmlDocument(body);

                let title = "";
                let nameEl = doc.querySelector(".book-name h1.name");
                if (nameEl) title = nameEl.text.trim();
                if (!title) {
                    let og = doc.querySelector('meta[property="og:title"]');
                    if (og) title = og.attributes["content"] || "";
                }
                if (!title) title = id;

                let cover = "";
                let coverImg = doc.querySelector(".book-cover img");
                if (coverImg) cover = coverImg.attributes["data-src"] || coverImg.attributes["src"] || "";
                if (!cover) {
                    let og = doc.querySelector('meta[property="og:image"]');
                    if (og) cover = og.attributes["content"] || "";
                }

                let author = "", status = "", update = "";
                for (let p of doc.querySelectorAll(".comic-info-detail p")) {
                    let t = p.text.trim();
                    if (t.startsWith("作者：")) author = t.replace("作者：", "").trim();
                    else if (t.startsWith("状态：")) status = t.replace("状态：", "").trim();
                    else if (t.startsWith("更新：")) update = t.replace("更新：", "").trim();
                }

                let description = "";
                let descEl = doc.querySelector(".cartoon-introduction p");
                if (descEl) description = descEl.text.trim();

                let tags = [];
                for (let s of doc.querySelectorAll(".comic-tags span")) {
                    let t = s.text.trim();
                    if (t) tags.push(t);
                }

                const rawChapters = [];
                const seenIds = new Set();

                for (let a of doc.querySelectorAll(".chaplist-box li a")) {
                    let href = a.attributes["href"] || "";
                    let m = href.match(/\/([A-Za-z0-9]+)\.html$/);
                    if (!m) continue;
                    let chapterId = m[1];
                    if (seenIds.has(chapterId)) continue;
                    let chTitle = a.text ? a.text.trim() : "";
                    if (!chTitle) continue;
                    seenIds.add(chapterId);
                    rawChapters.push([chapterId, chTitle]);
                }

                const moreBtn = doc.querySelector(".chaplist-box button") || doc.querySelector(".chaplist-more");
                if (moreBtn) {
                    try {
                        let comicId = id;
                        let idMatch = String(id).match(/\/([A-Za-z0-9]+)$/);
                        if (idMatch) comicId = idMatch[1];
                        const moreResBody = await this._postBody("morechapter", this.baseUrl + "/morechapter", { id: comicId });
                        const moreRet = JSON.parse(moreResBody);
                        if (moreRet.code == "200" && Array.isArray(moreRet.data)) {
                            for (const item of moreRet.data) {
                                const chapterId = String(item.chapterid || "").trim();
                                const chapterName = String(item.chaptername || "").trim();
                                if (chapterId && chapterName && !seenIds.has(chapterId)) {
                                    seenIds.add(chapterId);
                                    rawChapters.push([chapterId, chapterName]);
                                }
                            }
                        }
                    } catch (e) {
                        // 异步加载失败不影响已有章节
                    }
                }

                let chapters = new Map();
                for (let i = rawChapters.length - 1; i >= 0; i--) {
                    const [cid, ct] = rawChapters[i];
                    chapters.set(cid, ct);
                }

                doc.dispose();
                if (chapters.size === 0) throw "未解析到章节列表";

                let tagMap = {};
                if (author) tagMap["作者"] = [author];
                if (status) tagMap["状态"] = [status];
                if (update) tagMap["更新"] = [update];
                if (tags.length) tagMap["标签"] = tags;

                const detailUrl = this.baseUrl + "/" + id + "/";

                return new ComicDetails({
                    title: title,
                    subtitle: author,
                    cover: cover,
                    description: description,
                    tags: tagMap,
                    chapters: chapters,
                    url: detailUrl
                });
            } catch (e) {
                throw e;
            }
        },

        loadEp: async (comicId, epId) => {
            let url = this.baseUrl + "/" + comicId + "/" + epId + ".html";
            let body = await this._fetchBody("ep", url);
            let images = this.comic.decryptChapterImages(body);
            if (!images.length) throw "章节图片列表为空";
            return { images: images };
        },

        decryptChapterImages(html) {
            const expr = this._findPackedExpr(html);
            if (!expr) throw new Error("未找到打包脚本(eval(function(p,a,c,k,e,d))");
            const { p, a, c, k } = this._parsePackedArgs(expr);
            const unpacked = this._unpack(p, a, c, k);
            const mm = unpacked.match(/var\s+__c0rst96\s*=\s*"([^"]*)"/);
            if (!mm) throw new Error("未找到 __c0rst96 加密数据");
            const payload = mm[1];

            const didM = html.match(/class="readerContainer"[^>]*data-id="(\d+)"/);
            const dataId = didM ? parseInt(didM[1], 10) : 0;
            const keys = ["smkhy258", "smkd95fv", "md496952", "cdcsdwq", "vbfsa256", "cawf151c", "cd56cvda", "8kihnt9", "dso15tlo", "5ko6plhy"];
            const key = keys[dataId] || keys[0];

            const buf = this._base64ToBytes(payload);
            const kb = [];
            for (let i = 0; i < key.length; i++) kb.push(key.charCodeAt(i));
            const xored = [];
            for (let i = 0; i < buf.length; i++) xored.push(buf[i] ^ kb[i % kb.length]);
            const latin1 = xored.map((b) => String.fromCharCode(b)).join("");
            const jsonBytes = this._base64ToBytes(latin1);
            const jsonStr = this._utf8BytesToString(jsonBytes);
            const arr = JSON.parse(jsonStr);
            if (!Array.isArray(arr)) throw new Error("解密结果不是数组");
            return arr;
        },

        _findPackedExpr(html) {
            const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
            let m;
            while ((m = re.exec(html)) !== null) {
                const txt = m[1];
                const idx = txt.indexOf("eval(function(p,a,c,k,e,d)");
                if (idx < 0) continue;
                let depth = 0, inStr = false, quote = "", o = idx + 4, end = -1;
                for (; o < txt.length; o++) {
                    const ch = txt[o];
                    if (inStr) {
                        if (ch === "\\") { o++; continue; }
                        if (ch === quote) inStr = false;
                        continue;
                    }
                    if (ch === '"' || ch === "'" || ch === "`") { inStr = true; quote = ch; continue; }
                    if (ch === "(") depth++;
                    else if (ch === ")" && --depth === 0) { end = o + 1; break; }
                }
                if (end > 0) return txt.slice(idx + 4, end).trim();
            }
            return null;
        },

        _unquote(s) {
            s = s.trim();
            const q = s[0];
            if ((q === '"' || q === "'" || q === "`") && s[s.length - 1] === q) return s.slice(1, -1);
            return s;
        },

        _parseK(raw) {
            raw = raw.trim();
            const m = raw.match(/^["'`]([\s\S]*?)["'`]\s*\.\s*split\s*\(\s*["']([^"']*)["']\s*\)$/);
            if (m) return m[1].split(m[2]);
            const u = this._unquote(raw);
            if (u !== raw) return u.split("|");
            return raw.split("|");
        },

        _parsePackedArgs(expr) {
            const bo = expr.indexOf("{");
            if (bo < 0) throw new Error("packed: 找不到函数体");
            let depth = 1, i = bo + 1;
            for (; i < expr.length; i++) {
                const ch = expr[i];
                if (ch === "{") depth++;
                else if (ch === "}" && --depth === 0) break;
            }
            const argsStr = expr.slice(i + 1).trim();
            if (!argsStr.startsWith("(") || !argsStr.endsWith(")")) throw new Error("packed: 参数格式异常");
            const inner = argsStr.slice(1, -1);
            const parts = [];
            let buf = "", d = 0, instr = false, q = "";
            for (let j = 0; j < inner.length; j++) {
                const ch = inner[j];
                if (instr) {
                    buf += ch;
                    if (ch === "\\") { buf += inner[++j] || ""; continue; }
                    if (ch === q) instr = false;
                    continue;
                }
                if (ch === '"' || ch === "'" || ch === "`") { instr = true; q = ch; buf += ch; continue; }
                if (ch === "(" || ch === "[" || ch === "{") d++;
                else if (ch === ")" || ch === "]" || ch === "}") d--;
                if (ch === "," && d === 0) { parts.push(buf); buf = ""; continue; }
                buf += ch;
            }
            if (buf.length) parts.push(buf);
            if (parts.length < 4) throw new Error("packed: 参数不足");
            return {
                p: this._unquote(parts[0].trim()),
                a: parseInt(parts[1].trim(), 10),
                c: parseInt(parts[2].trim(), 10),
                k: this._parseK(parts[3].trim()),
            };
        },

        _base62sym(n, base) {
            function e(r) {
                const mm = r % base;
                return (r < base ? "" : e(Math.floor(r / base))) +
                    (mm > 35 ? String.fromCharCode(mm + 29) : mm.toString(36));
            }
            return e(n);
        },

        _unpack(p, a, c, k) {
            const dict = Array.isArray(k) ? k : k.split("|");
            let out = p;
            for (let i = c - 1; i >= 0; i--) {
                const token = dict[i];
                if (!token) continue;
                const sym = this._base62sym(i, a);
                out = out.split(new RegExp("\\b" + sym + "\\b", "g")).join(token);
            }
            return out;
        },

        _base64ToBytes(b64) {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            b64 = String(b64).replace(/=+$/, "");
            const bytes = [];
            let buffer = 0, bits = 0;
            for (let i = 0; i < b64.length; i++) {
                const idx = chars.indexOf(b64[i]);
                if (idx < 0) continue;
                buffer = (buffer << 6) | idx;
                bits += 6;
                if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff); }
            }
            return bytes;
        },

        _utf8BytesToString(bytes) {
            let str = "";
            for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
            return decodeURIComponent(escape(str));
        },

        onImageLoad: (url) => {
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                }
            };
        },

        onThumbnailLoad: (url) => {
            return {
                headers: {
                    "Referer": this.baseUrl + "/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                }
            };
        },

        link: {
            domains: [
                'rumanhua2.com',
                'm.rumanhua2.com',
                'www.rumanhua2.com',
                'rumanhua.com',
                'm.rumanhua.com',
                'www.rumanhua.com',
                'rumanhua1.com',
                'm.rumanhua1.com',
                'www.rumanhua1.com',
                'rumanhua.org',
                'www.rumanhua.org'
            ],
            linkToId: (url) => {
                let m = url.match(/https?:\/\/[^\/]+\/([A-Za-z0-9]+)(?:\/|$)/);
                if (m) return m[1];
                m = url.match(/\/news\/(\d+)/);
                return m ? m[1] : null;
            }
        },

        idMatch: "^[A-Za-z0-9]+$",
    }
}