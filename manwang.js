class ManWang extends ComicSource {

    name = "漫网";

    key = "manwang";

    version = "1.2.4";

    minAppVersion = "1.4.0";

    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/manwang.js";

    baseUrl = "https://www.manwang.net";

    ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    paramsAesKey = "9S8$vJnU2ANeSRoF";
    imageAesKey = "my2ecret782ecret";

    searchCatalogCache = null;
    searchCatalogPendingPaths = null;
    searchCatalogComplete = false;
    searchDeepCatalogCache = null;
    searchDeepCatalogNextPage = 2;
    searchDeepCatalogComplete = false;
    searchCatalogMaxPage = 1;

    init() {
        try {
            const cookieStr = this.loadSetting("search_cookie");
            if (cookieStr) {
                const cookies = String(cookieStr).split(";").map((pair) => {
                    const p = pair.trim().split("=");
                    return new Cookie({ name: p[0], value: p.slice(1).join("="), domain: "manwang.net" });
                }).filter((c) => c.name);
                if (cookies.length > 0) Network.setCookies(this.baseUrl, cookies);
            }
        } catch (e) { }
    }

    settings = {
        search_cookie: {
            title: "搜索 Cookie（可选，效果待验证）",
            type: "input",
            default: "",
        },
    };

    // ===== 工具函数 =====

    requestHeaders() {
        return {
            "User-Agent": this.ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Referer": this.baseUrl + "/",
        };
    }

    absoluteUrl(p) {
        if (!p) return "";
        p = String(p).trim();
        if (/^http:\/\/www\.manwang\.net\//i.test(p)) return "https://" + p.slice(7);
        if (/^https?:\/\//i.test(p)) return p;
        if (p.startsWith("//")) return "https:" + p;
        if (p.startsWith("/")) return this.baseUrl + p;
        return this.baseUrl + "/" + p;
    }

    normalizeBookId(id) {
        const s = String(id || "").trim();
        const fromPath = s.match(/(?:^|\/)book\/(\d+)/);
        if (fromPath) return fromPath[1];
        return /^\d+$/.test(s) ? s : null;
    }

    bookIdFromHref(href) {
        const m = String(href || "").match(/\/book\/(\d+)/);
        return m ? m[1] : "";
    }

    chapterIdFromHref(href) {
        const m = String(href || "").match(/\/chapter\/\d+-(\d+)/);
        return m ? m[1] : "";
    }

    normalizeChapterId(epId) {
        if (!epId) return null;
        if (typeof epId === "object") {
            const v = epId.epId || epId.chapterId || epId.id || epId.url;
            return v ? this.normalizeChapterId(v) : null;
        }
        const s = String(epId);
        const m = s.match(/chapter\/\d+-(\d+)/);
        if (m) return m[1];
        if (/^\d+$/.test(s)) return s;
        const m2 = s.match(/^\d+-(\d+)$/);
        if (m2) return m2[1];
        return null;
    }

    decryptParams(b64) {
        const raw = Convert.decodeBase64(b64);
        const rawView = new Uint8Array(raw);
        if (rawView.length < 32 || (rawView.length - 16) % 16 !== 0) throw "params 密文长度无效";
        const iv = rawView.slice(0, 16).buffer;
        const cipher = rawView.slice(16).buffer;
        const key = Convert.encodeUtf8(this.paramsAesKey);
        const decrypted = Convert.decryptAesCbc(cipher, key, iv);
        const plain = Convert.decodeUtf8(decrypted);
        const start = plain.indexOf("{");
        const end = plain.lastIndexOf("}");
        if (start < 0 || end <= start) throw "params 解密结果不是 JSON";
        return JSON.parse(plain.slice(start, end + 1));
    }

    imgUrl(img) {
        if (!img) return "";
        const u = img.attributes["data-src"] || img.attributes.src || "";
        if (!u || u.indexOf("data-loading") >= 0) return "";
        return this.absoluteUrl(u);
    }

    /**
     * 从卡片中提取真实标题（多候选源，避免回退到数字 ID）。
     */
    extractCardTitle(item, link, img) {
        // 1) img 的 alt / title
        if (img) {
            let t = String(img.attributes.alt || "").trim();
            if (!t) t = String(img.attributes.title || "").trim();
            if (t) return t;
        }
        // 2) a 的 title 属性
        if (link) {
            let t = String(link.attributes.title || "").trim();
            if (t) return t;
            // 3) a 的文字内容（排除“开始阅读”之类的按钮文字）
            t = String(link.text || "").trim();
            if (t && !/^(开始阅读|立即阅读|查看详情|详情|阅读)$/.test(t)) return t;
        }
        // 4) 卡片内常见标题容器
        const candidates = [
            ".slider-title", ".slide-title", ".slides-title",
            ".latest-info .title", ".latest-info h3",
            ".title", ".comic-title", ".detail-title", ".name",
            ".comic-info h4", ".comic-info h2",
            "h3", "h4",
        ];
        for (let sel of candidates) {
            const el = item.querySelector(sel);
            if (el && el.text && el.text.trim()) {
                const t = el.text.trim();
                if (t && !/^(开始阅读|立即阅读|查看详情|详情|阅读)$/.test(t)) return t;
            }
        }
        return "";
    }

    parseHomeCard(item) {
        const link = item.querySelector("a");
        const id = this.bookIdFromHref(link ? link.attributes.href : "");
        if (!id) return null;
        const img = item.querySelector("img.lazyload") || item.querySelector("img");
        const cover = this.imgUrl(img);
        const titleEl = item.querySelector(".comic-info h4") || item.querySelector("h4") || item.querySelector(".detail-title");
        const title = titleEl ? titleEl.text.trim() : this.extractCardTitle(item, link, img);
        const subParts = [];
        const mask = item.querySelector(".comic-mask p");
        if (mask) subParts.push(mask.text.trim());
        return new Comic({ id: id, title: title, cover: cover, subTitle: subParts.join(" · ") });
    }

    parseListCard(item) {
        const id = this.bookIdFromHref(item.attributes.href);
        if (!id) return null;
        const img = item.querySelector("img.lazyload") || item.querySelector("img");
        const cover = this.imgUrl(img);
        const titleEl = item.querySelector(".comic-info h2") || item.querySelector("h2") || item.querySelector(".detail-title") || item.querySelector("h4");
        const title = titleEl ? titleEl.text.trim() : this.extractCardTitle(item, item, img);
        const process = item.querySelector(".process");
        const desc = item.querySelector(".desc");
        const tagList = item.querySelector(".tag-list");
        const subParts = [];
        if (process) subParts.push(process.text.trim());
        if (tagList) subParts.push(tagList.text.trim());
        return new Comic({
            id: id,
            title: title,
            cover: cover,
            subTitle: subParts.join(" · "),
            description: desc ? desc.text.trim() : "",
        });
    }

    parseLeadCard(item) {
        const link = item.querySelector("a[href*='/book/']");
        const img = item.querySelector("img");
        const id = this.bookIdFromHref(link ? link.attributes.href : "");
        if (!id || !img) return null;

        let title = this.extractCardTitle(item, link, img);

        return new Comic({
            id: id,
            title: title || id,
            cover: this.imgUrl(img),
            subTitle: "首页重点推荐",
        });
    }

    parseRelatedCard(item) {
        const comic = this.parseLeadCard(item);
        if (!comic) return null;
        const mask = item.querySelector(".comic-mask p");
        comic.subTitle = mask && mask.text.trim()
            ? "相关推荐 · " + mask.text.trim()
            : "相关推荐";
        return comic;
    }

    addUniqueComic(list, seen, comic) {
        if (!comic || !comic.id) return;
        const existing = seen[comic.id];
        if (existing) {
            if ((!existing.title || existing.title === existing.id) && comic.title && comic.title !== comic.id) existing.title = comic.title;
            if (!existing.cover && comic.cover) existing.cover = comic.cover;
            if (!existing.subTitle && comic.subTitle) existing.subTitle = comic.subTitle;
            if (!existing.description && comic.description) existing.description = comic.description;
            return;
        }
        seen[comic.id] = comic;
        list.push(comic);
    }

    parseHomePanel(panel) {
        const list = [];
        const seen = {};
        panel.querySelectorAll(".panel-comic-l").forEach((item) => {
            this.addUniqueComic(list, seen, this.parseLeadCard(item));
        });
        panel.querySelectorAll(".item-comic").forEach((item) => {
            this.addUniqueComic(list, seen, this.parseHomeCard(item));
        });
        return list;
    }

    parseListDocument(doc) {
        const list = [];
        const seen = {};
        doc.querySelectorAll(".comic-item").forEach((item) => {
            this.addUniqueComic(list, seen, this.parseListCard(item));
        });
        if (list.length === 0) {
            doc.querySelectorAll(".item-comic").forEach((item) => {
                this.addUniqueComic(list, seen, this.parseHomeCard(item));
            });
        }
        return list;
    }

    parseSearchSuggestions(doc) {
        const list = [];
        doc.querySelectorAll(".layer-search-all a[href*='/book/']").forEach((a) => {
            const id = this.bookIdFromHref(a.attributes.href || "");
            const title = a.text ? a.text.trim() : "";
            if (!id || !title) return;
            let cover = "";
            doc.querySelectorAll("a[href*='/book/']").forEach((link) => {
                if (cover || this.bookIdFromHref(link.attributes.href || "") !== id) return;
                const img = link.querySelector("img");
                if (img) cover = this.imgUrl(img);
            });
            list.push(new Comic({ id: id, title: title, cover: cover, subTitle: "站内推荐" }));
        });
        return list;
    }

    /**
     * 从文档里抓取 id → 标题 映射。
     * 主要来源：header 的“大家都在搜” `.layer-search-all`，服务器直出、稳定可靠。
     */
    buildTitleMap(doc, target) {
        const map = target || {};
        if (!doc) return map;
        doc.querySelectorAll(".layer-search-all a[href*='/book/']").forEach((a) => {
            const id = this.bookIdFromHref(a.attributes.href || "");
            const t = a.text ? a.text.trim() : "";
            if (id && t && !map[id]) map[id] = t;
        });
        // 其它位置也顺手补一份（例如推荐位 a 有 title/alt）
        doc.querySelectorAll("a[href*='/book/']").forEach((a) => {
            const id = this.bookIdFromHref(a.attributes.href || "");
            if (!id || map[id]) return;
            const img = a.querySelector("img");
            let t = "";
            if (img) t = String(img.attributes.alt || img.attributes.title || "").trim();
            if (!t) t = String(a.attributes.title || "").trim();
            if (t) map[id] = t;
        });
        return map;
    }

    applyTitleMap(comic, titleMap) {
        if (!comic) return;
        if ((!comic.title || comic.title === comic.id) && titleMap && titleMap[comic.id]) {
            comic.title = titleMap[comic.id];
        }
    }

    /**
     * 详情页兜底：轮播卡片只有封面图，没有任何标题来源时，访问详情页抓取真实标题。
     */
    async fetchComicTitle(id) {
        if (!id) return "";
        try {
            const res = await Network.get(this.baseUrl + "/book/" + id, this.requestHeaders());
            if (!res || res.status !== 200 || !res.body) return "";
            const doc = new HtmlDocument(res.body);
            let title = "";
            const h1 = doc.querySelector("h1.detail-title");
            if (h1 && h1.text) title = h1.text.trim();
            if (!title) {
                const og = doc.querySelector("meta[property='og:title']");
                if (og) title = String(og.attributes["content"] || "").trim();
            }
            // 去掉 "xxx - 漫网" 之类的站点后缀
            title = title.replace(/\s*[-_|—]+\s*(漫网|漫画).*$/i, "").trim();
            doc.dispose();
            return title;
        } catch (e) {
            return "";
        }
    }

    async loadSearchCatalog() {
        const allPaths = ["/", "/custom/update", "/custom/hot", "/category/finish/1", "/category/finish/2", "/category"];
        if (this.searchCatalogComplete && this.searchCatalogCache !== null) return this.searchCatalogCache;
        const paths = this.searchCatalogPendingPaths === null ? allPaths : this.searchCatalogPendingPaths.slice();
        const catalog = this.searchCatalogCache || [];
        const seen = {};
        catalog.forEach((comic) => { if (comic && comic.id) seen[comic.id] = comic; });
        const titleMap = {};
        catalog.forEach((comic) => {
            if (comic && comic.id && comic.title && comic.title !== comic.id) titleMap[comic.id] = comic.title;
        });
        const pending = [];
        for (let i = 0; i < paths.length; i++) {
            let doc = null;
            try {
                const res = await Network.get(this.baseUrl + paths[i], this.requestHeaders());
                if (!res || res.status !== 200 || !res.body) {
                    pending.push(paths[i]);
                    continue;
                }
                doc = new HtmlDocument(res.body);
                this.buildTitleMap(doc, titleMap);
                if (paths[i] === "/") {
                    doc.querySelectorAll("#slider .slides li").forEach((item) => {
                        const comic = this.parseLeadCard(item);
                        this.applyTitleMap(comic, titleMap);
                        this.addUniqueComic(catalog, seen, comic);
                    });
                    doc.querySelectorAll(".panel-comic").forEach((panel) => {
                        this.parseHomePanel(panel).forEach((comic) => {
                            this.applyTitleMap(comic, titleMap);
                            this.addUniqueComic(catalog, seen, comic);
                        });
                    });
                    this.parseSearchSuggestions(doc).forEach((comic) => {
                        this.applyTitleMap(comic, titleMap);
                        this.addUniqueComic(catalog, seen, comic);
                    });
                } else {
                    this.parseListDocument(doc).forEach((comic) => {
                        this.applyTitleMap(comic, titleMap);
                        this.addUniqueComic(catalog, seen, comic);
                    });
                    this.searchCatalogMaxPage = Math.max(this.searchCatalogMaxPage, this.parseMaxPage(doc));
                }
            } catch (e) {
                pending.push(paths[i]);
            } finally {
                if (doc) doc.dispose();
            }
        }
        this.searchCatalogPendingPaths = pending;
        this.searchCatalogComplete = pending.length === 0;
        if (catalog.length > 0 || pending.length < paths.length) this.searchCatalogCache = catalog;
        return catalog;
    }

    normalizeSearchText(value) {
        return String(value || "").toLowerCase().replace(/[\s\u3000]+/g, "");
    }

    searchKeywordAliases(keyword) {
        const raw = String(keyword || "").trim();
        if (!raw) return [];
        const compact = raw.replace(/[\s\u3000]+/g, "");
        const aliases = [raw];
        if (compact && aliases.indexOf(compact) < 0) aliases.push(compact);
        const known = {
            "妖神计": ["妖神记"],
            "妖神記": ["妖神记"],
            "古見同學有交流障礙症": ["古见同学有交流障碍症"],
        };
        (known[compact] || []).forEach((alias) => {
            if (aliases.indexOf(alias) < 0) aliases.push(alias);
        });
        return aliases;
    }

    filterSearchCatalog(catalog, keyword) {
        const queries = this.searchKeywordAliases(keyword).map((q) => this.normalizeSearchText(q));
        if (queries.length === 0) return [];
        return catalog.filter((comic) => {
            const text = this.normalizeSearchText([comic.title, comic.subTitle, comic.description].filter((v) => v).join(" "));
            return queries.some((q) => q && text.indexOf(q) >= 0);
        });
    }

    async loadSearchCatalogDeep(keyword) {
        if (this.searchCatalogComplete && this.searchDeepCatalogComplete && this.searchDeepCatalogCache !== null) return this.searchDeepCatalogCache;
        const baseCatalog = await this.loadSearchCatalog();
        if (this.searchCatalogCache === null) return baseCatalog;
        let catalog = this.searchDeepCatalogCache || [];
        const seen = {};
        catalog.forEach((comic) => { if (comic && comic.id) seen[comic.id] = comic; });
        baseCatalog.forEach((comic) => this.addUniqueComic(catalog, seen, comic));
        this.searchDeepCatalogCache = catalog;
        if (keyword && this.filterSearchCatalog(catalog, keyword).length > 0) return catalog;
        const maxPage = Math.min(Math.max(1, this.searchCatalogMaxPage), 50);
        for (let page = Math.max(2, this.searchDeepCatalogNextPage); page <= maxPage; page++) {
            let doc = null;
            try {
                const res = await Network.get(this.baseUrl + "/category/page/" + page, this.requestHeaders());
                if (!res || res.status !== 200 || !res.body) {
                    this.searchDeepCatalogNextPage = page;
                    return catalog;
                }
                doc = new HtmlDocument(res.body);
                this.parseListDocument(doc).forEach((comic) => this.addUniqueComic(catalog, seen, comic));
                this.searchDeepCatalogNextPage = page + 1;
                if (keyword && this.filterSearchCatalog(catalog, keyword).length > 0) {
                    this.searchDeepCatalogCache = catalog;
                    return catalog;
                }
            } catch (e) {
                this.searchDeepCatalogNextPage = page;
                return catalog;
            } finally {
                if (doc) doc.dispose();
            }
        }
        this.searchDeepCatalogComplete = this.searchCatalogComplete;
        this.searchDeepCatalogCache = catalog;
        return catalog;
    }

    parseMaxPage(doc) {
        let max = 1;
        doc.querySelectorAll("a").forEach((a) => {
            const href = a.attributes.href || "";
            const m = href.match(/\/page\/(\d+)/);
            if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > max) max = n;
            }
        });
        return max;
    }

    // ===== 首页探索 =====
    explore = [
        {
            title: this.name,
            type: "singlePageWithMultiPart",
            load: async () => {
                const result = {};
                // ★ 全页共享的 id → 标题 映射（首页 header “大家都在搜” 直出，稳定可靠）
                const titleMap = {};
                let homeDoc = null;
                try {
                    const res = await Network.get(this.baseUrl + "/", this.requestHeaders());
                    if (res.status !== 200) return result;
                    homeDoc = new HtmlDocument(res.body);

                    // ★ 先构建 id→title 映射
                    this.buildTitleMap(homeDoc, titleMap);

                    // 轮播推荐（#slider 卡片通常只有封面图，没有标题文本，用 titleMap 立刻填上）
                    const banner = [];
                    const bannerSeen = {};
                    homeDoc.querySelectorAll("#slider .slides li").forEach((item) => {
                        const comic = this.parseLeadCard(item);
                        this.applyTitleMap(comic, titleMap);
                        this.addUniqueComic(banner, bannerSeen, comic);
                    });
                    if (banner.length > 0) result["轮播推荐"] = banner;

                    // 首页面板（每个 panel 内含左侧重点推荐 + 右侧卡片列表）
                    const panels = homeDoc.querySelectorAll(".panel-comic");
                    for (let i = 0; i < panels.length; i++) {
                        const titleEl = panels[i].querySelector(".mod-title span");
                        const title = titleEl ? titleEl.text.trim() : "推荐";
                        const list = this.parseHomePanel(panels[i]);
                        list.forEach((c) => this.applyTitleMap(c, titleMap));
                        if (list.length > 0) result[title] = list;
                    }
                } catch (e) {
                    // 首页失败时仍返回已成功解析的部分
                } finally {
                    if (homeDoc) homeDoc.dispose();
                }

                // 这些页面均为当前站点导航中的真实列表页，用作首页的更多分区。
                const extraParts = [
                    ["最新更新", "/custom/update"],
                    ["人气排行", "/custom/hot"],
                    ["连载漫画", "/category/finish/1"],
                    ["完结漫画", "/category/finish/2"],
                ];
                for (let i = 0; i < extraParts.length; i++) {
                    const title = extraParts[i][0];
                    const path = extraParts[i][1];
                    let doc = null;
                    try {
                        const res = await Network.get(this.baseUrl + path, this.requestHeaders());
                        if (res.status !== 200) continue;
                        doc = new HtmlDocument(res.body);
                        // 顺手扩充 titleMap
                        this.buildTitleMap(doc, titleMap);
                        const list = this.parseListDocument(doc);
                        list.forEach((c) => this.applyTitleMap(c, titleMap));
                        if (list.length > 0) result[title] = list;
                    } catch (e) {
                        // 单个扩展分区失败不影响其他首页分区
                    } finally {
                        if (doc) doc.dispose();
                    }
                }

                // ★ 轮播推荐标题回填（兜底）
                // 1) 用其它分区里已抓到的真实标题补全
                if (result["轮播推荐"] && result["轮播推荐"].length > 0) {
                    Object.keys(result).forEach((key) => {
                        if (key === "轮播推荐") return;
                        const list = result[key];
                        if (!Array.isArray(list)) return;
                        list.forEach((c) => {
                            if (c && c.id && c.title && c.title !== c.id && !titleMap[c.id]) {
                                titleMap[c.id] = c.title;
                            }
                        });
                    });
                    result["轮播推荐"].forEach((c) => this.applyTitleMap(c, titleMap));

                    // 2) 依然没有标题的，再走详情页网络兜底
                    const stillNeedFetch = result["轮播推荐"].filter(
                        (c) => c && (!c.title || c.title === c.id)
                    );
                    if (stillNeedFetch.length > 0) {
                        await Promise.all(stillNeedFetch.map(async (c) => {
                            const t = await this.fetchComicTitle(c.id);
                            if (t) c.title = t;
                        }));
                    }
                }

                return result;
            },
        },
    ];

    // ===== 分类 =====
    category = {
        title: this.name,
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: [
                    "全部", "热血", "恋爱", "奇幻", "冒险", "搞笑", "都市", "古风",
                    "悬疑", "穿越", "校园", "治愈", "科幻", "玄幻", "修仙", "少年",
                    "少女", "机甲", "重生", "系统", "同人",
                ],
                itemType: "category",
                categoryParams: [
                    "", "2572", "2617", "2569", "2591", "2570", "2571", "2593",
                    "2600", "2573", "2587", "2588", "2589", "2585", "2586", "2596",
                    "2612", "2575", "2615", "2597", "2618",
                ],
            },
            {
                name: "状态",
                type: "fixed",
                categories: ["连载中", "已完结"],
                itemType: "category",
                categoryParams: ["1", "2"],
            },
        ],
        enableRankingPage: false,
    };

    // ===== 分类漫画加载 =====
    categoryComics = {
        load: async (category, param, options, page) => {
            let doc = null;
            const safePage = Math.max(1, parseInt(page, 10) || 1);
            try {
                let base;
                if (category === "连载中" || category === "已完结") {
                    base = "/category/finish/" + param;
                } else if (!param) {
                    base = "/category";
                } else {
                    base = "/category/tags/" + param;
                }
                const path = safePage <= 1 ? base : base + "/page/" + safePage;
                const res = await Network.get(this.baseUrl + path, this.requestHeaders());
                if (!res || res.status !== 200) return { comics: [], maxPage: safePage };
                doc = new HtmlDocument(res.body);

                const titleMap = {};
                this.buildTitleMap(doc, titleMap);

                const comics = [];
                const seen = {};
                doc.querySelectorAll(".comic-item").forEach((item) => {
                    const comic = this.parseListCard(item);
                    this.applyTitleMap(comic, titleMap);
                    this.addUniqueComic(comics, seen, comic);
                });
                const maxPage = this.parseMaxPage(doc);
                return { comics: comics, maxPage: maxPage };
            } catch (e) {
                return { comics: [], maxPage: page };
            } finally {
                if (doc) doc.dispose();
            }
        },
    };

    // ===== 搜索 =====
    search = {
        load: async (keyword, options, page) => {
            let doc = null;
            const safePage = Math.max(1, Number(page) || 1);
            try {
                const path = "/index.php/search?key=" + encodeURIComponent(String(keyword || "").trim());
                const res = await Network.get(this.baseUrl + path, this.requestHeaders());
                if (res && res.status === 200 && res.body && !String(res.body).trim().startsWith("{")) {
                    doc = new HtmlDocument(res.body);
                    const titleMap = {};
                    this.buildTitleMap(doc, titleMap);
                    const comics = this.parseListDocument(doc);
                    comics.forEach((c) => this.applyTitleMap(c, titleMap));
                    if (comics.length > 0) {
                        return { comics: comics, maxPage: this.parseMaxPage(doc) };
                    }
                }
            } catch (e) {
                // 站点搜索接口失败时继续尝试已取证列表兜底
            } finally {
                if (doc) doc.dispose();
            }

            if (safePage > 1) return { comics: [], maxPage: 1 };
            try {
                const catalog = await this.loadSearchCatalog();
                let comics = this.filterSearchCatalog(catalog, keyword);
                if (comics.length > 0) return { comics: comics, maxPage: 1 };
                const deepCatalog = await this.loadSearchCatalogDeep(keyword);
                comics = this.filterSearchCatalog(deepCatalog, keyword);
                return { comics: comics, maxPage: 1 };
            } catch (e) {
                return { comics: [], maxPage: 1 };
            }
        },
    };

    // ===== 漫画详情与章节 =====
    comic = {
        loadInfo: async (id) => {
            let doc = null;
            const comicId = this.normalizeBookId(id);
            if (!comicId) throw "Invalid comic id";
            const res = await Network.get(this.baseUrl + "/book/" + comicId, this.requestHeaders());
            if (!res || res.status !== 200) throw "Comic not found";
            try {
                doc = new HtmlDocument(res.body);

                const titleEl = doc.querySelector("h1.detail-title");
                const title = titleEl ? titleEl.text.trim() : id;

                const coverImg = doc.querySelector(".mod-banner img.lazyload")
                    || doc.querySelector(".banner-img img")
                    || doc.querySelector(".mod-detail-info img.lazyload");
                const cover = this.imgUrl(coverImg);

                const authorEl = doc.querySelector("p.author");
                const author = authorEl ? authorEl.text.trim() : "";

                const description = doc.querySelector(".detail-desc")
                    ? doc.querySelector(".detail-desc").text.trim() : "";

                const tags = [];
                doc.querySelectorAll(".detail-info-btags .tag-list a").forEach((a) => {
                    const t = a.text.trim();
                    if (t) tags.push(t);
                });

                const updateEl = doc.querySelector(".detail-info-btips .tips b");
                const updateTime = updateEl ? updateEl.text.trim() : "";

                const recommend = [];
                const recommendSeen = {};
                doc.querySelectorAll(".panel-recommend .mod-vitem-comic").forEach((item) => {
                    this.addUniqueComic(recommend, recommendSeen, this.parseRelatedCard(item));
                });

                // 章节列表：页面按「最新 → 最老」排列，先按页面顺序收集，再反转
                const rawChapters = [];
                const seenChapterIds = new Set();
                doc.querySelectorAll("#j_chapter_list li.item").forEach((li) => {
                    const cid = li.attributes["data-chapter"];
                    if (!cid || seenChapterIds.has(String(cid))) return;
                    const a = li.querySelector("a");
                    const ctitle = a ? (a.attributes.title || "").trim() : "";
                    seenChapterIds.add(String(cid));
                    rawChapters.push([String(cid), ctitle || String(cid)]);
                });
                const chapters = new Map();
                for (let i = rawChapters.length - 1; i >= 0; i--) {
                    chapters.set(rawChapters[i][0], rawChapters[i][1]);
                }

                return new ComicDetails({
                    title: title,
                    subTitle: author,
                    cover: cover,
                    description: description,
                    tags: { 题材: tags },
                    chapters: chapters,
                    isFavorite: false,
                    subId: comicId,
                    thumbnails: cover ? [cover] : [],
                    recommend: recommend,
                    updateTime: updateTime,
                    url: this.baseUrl + "/book/" + comicId + "/",
                });
            } finally {
                if (doc) doc.dispose();
            }
        },

        loadEp: async (comicId, epId) => {
            const safeComicId = this.normalizeBookId(comicId);
            const chapterId = this.normalizeChapterId(epId);
            if (!safeComicId || !chapterId) return { images: [] };
            let doc = null;
            try {
                const res = await Network.get(
                    this.baseUrl + "/chapter/" + safeComicId + "-" + chapterId,
                    this.requestHeaders()
                );
                if (res.status !== 200) return { images: [] };
                const body = res.body;
                const pm = body.match(/params\s*=\s*([\"'])([^\"']+)\1/);
                if (!pm) return { images: [] };
                doc = new HtmlDocument(body);
                const data = this.decryptParams(pm[2]);
                if (!data || data.host !== "www.manwang.net") return { images: [] };
                const images = [];
                const seenImages = {};
                (Array.isArray(data.images) ? data.images : []).forEach((u) => {
                    const image = String(u || "").trim();
                    if (image && !seenImages[image]) {
                        seenImages[image] = true;
                        images.push(image);
                    }
                });
                return { images: images };
            } catch (e) {
                return { images: [] };
            } finally {
                if (doc) doc.dispose();
            }
        },

        onImageLoad: (url, comicId, epId) => {
            const safeComicId = this.normalizeBookId(comicId);
            const chapterId = this.normalizeChapterId(epId);
            const referer = safeComicId && chapterId
                ? this.baseUrl + "/chapter/" + safeComicId + "-" + chapterId
                : this.baseUrl + "/";
            const cfg = {
                headers: {
                    "User-Agent": this.ua,
                    "Referer": referer,
                    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                },
            };
            if (!/^https?:\/\//i.test(String(url || ""))) {
                const relative = String(url || "").startsWith("/") ? String(url || "") : "/" + String(url || "");
                cfg.url = "https://img1.baipiaoguai.org" + relative;
                const key = Convert.encodeUtf8(this.imageAesKey);
                const iv = key;
                cfg.onResponse = (buffer) => {
                    const decrypted = new Uint8Array(Convert.decryptAesCbc(buffer, key, iv));
                    if (decrypted.length === 0) throw "图片解密结果为空";
                    const padLen = decrypted[decrypted.length - 1];
                    if (padLen < 1 || padLen > 16 || padLen > decrypted.length) throw "图片 PKCS7 padding 无效";
                    for (let i = decrypted.length - padLen; i < decrypted.length; i++) {
                        if (decrypted[i] !== padLen) throw "图片 PKCS7 padding 无效";
                    }
                    return decrypted.slice(0, decrypted.length - padLen).buffer;
                };
            }
            return cfg;
        },

        link: {
            domains: ['www.manwang.net'],
            linkToId: (url) => {
                const m = String(url).match(/\/book\/(\d+)/);
                return m ? m[1] : null;
            }
        }
    };
}