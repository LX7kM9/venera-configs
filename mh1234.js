class MH1234 extends ComicSource {
    name = "漫画1234"
    key = "mh1234"
    version = "1.4.3" // 章节列表反转为最老话在前
    minAppVersion = "1.4.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/mh1234.js"

    // 站点独立阅读域（/go/ 跳转目标）
    get readerUrl() {
        return "https://reader.hqread.cc";
    }

    settings = {
        domains: {
            title: "域名",
            type: "input",
            default: "wmh1234.com"
        }
    }

    get baseUrl() {
        return `https://m.${this.loadSetting('domains')}`;
    }

    // 探索页（首页）—— 适配 mint 新版模板
    explore = [{
        title: "漫画1234",
        type: "singlePageWithMultiPart",
        load: async () => {
            const result = {};
            const res = await Network.get(this.baseUrl);
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            const doc = new HtmlDocument(res.body);

            // 今日推荐：article.mint-feature
            const features = [];
            for (let feat of doc.querySelectorAll("article.mint-feature")) {
                const dataId = feat.attributes["data-comic-id"];
                const link = feat.querySelector("a.mint-feature__cover") || feat.querySelector("a[href*='/comic/']");
                const href = link?.attributes["href"] || "";
                const idMatch = href.match(/\/comic\/(\d+)\.html/);
                const id = dataId || (idMatch ? idMatch[1] : null);
                if (!id) continue;
                const title = feat.querySelector(".mint-feature__body h2")?.text?.trim() ||
                              feat.querySelector("h2")?.text?.trim() || "";
                const img = feat.querySelector("img");
                const cover = img?.attributes["src"] || img?.attributes["data-src"] || "";
                features.push(new Comic({ id, title, cover }));
            }
            if (features.length > 0) result["今日推荐"] = features;

            // 最新更新：a.mint-update-card
            const updates = [];
            for (let card of doc.querySelectorAll("a.mint-update-card")) {
                const href = card.attributes["href"];
                const idMatch = href?.match(/\/comic\/(\d+)\.html/);
                if (!idMatch) continue;
                const id = idMatch[1];
                const title = card.querySelector("strong")?.text?.trim() || "";
                const img = card.querySelector("img");
                const cover = img?.attributes["src"] || img?.attributes["data-src"] || "";
                updates.push(new Comic({ id, title, cover }));
            }
            if (updates.length > 0) result["最新更新"] = updates;

            // 发现好故事：a.mint-cover-card
            const discover = [];
            const seenDiscover = new Set();
            for (let card of doc.querySelectorAll("a.mint-cover-card")) {
                const href = card.attributes["href"];
                const idMatch = href?.match(/\/comic\/(\d+)\.html/);
                if (!idMatch) continue;
                const id = idMatch[1];
                if (seenDiscover.has(id)) continue;
                seenDiscover.add(id);
                const title = card.querySelector("h3")?.text?.trim() || "";
                const img = card.querySelector("img");
                const cover = img?.attributes["src"] || img?.attributes["data-src"] || "";
                discover.push(new Comic({ id, title, cover }));
            }
            if (discover.length > 0) result["发现好故事"] = discover;

            return result;
        }
    }];

    // 分类
    category = {
        title: "漫画1234",
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: [
                    "恋爱", "搞笑", "日漫", "其他", "热血", "都市", "国漫", "少女", "科幻", "魔幻", "奇幻", "冒险", "生活", "韩漫", "纯爱", "少年", "校园", "耽美", "古风", "剧情", "喜剧", "日常", "悬疑", "玄幻", "格斗", "穿越", "恐怖", "武侠", "灵异", "大女主", "百合", "推理", "战斗", "治愈", "侦探", "竞技", "重生", "系统", "逆袭", "短篇", "浪漫", "职场", "动作", "魔法", "后宫", "ABO", "体育", "青春", "总裁", "霸总", "复仇", "架空", "西幻", "现代", "宫廷", "异能", "欧风", "神鬼", "蔷薇", "美食", "欢乐向", "欧美", "唯美", "四格", "女神", "励志", "故事漫画", "战争", "脑洞", "修真", "社会", "萌系", "高甜", "妖怪", "年下", "修仙", "轻小说", "末日", "怪物", "历史", "改编", "游戏", "神仙", "神魔", "惊悚", "娱乐圈", "东方", "轻松", "权谋", "宫斗", "SM", "同人", "多攻", "明星", "音乐", "仙侠", "机甲", "偶像", "虐心", "正能量"
                ],
                itemType: "category",
                categoryParams: [
                    "17", "13", "240", "97", "6", "31", "257", "187", "8", "69", "96", "7", "29", "209", "77", "204", "11", "16", "28", "84", "380", "104", "18", "10", "94", "14", "19", "66", "26", "172", "27", "112", "107", "67", "80", "23", "171", "173", "126", "354", "100", "73", "21", "95", "15", "285", "132", "99", "170", "9", "124", "25", "224", "222", "136", "108", "228", "74", "93", "89", "70", "258", "65", "83", "226", "24", "60", "20", "90", "12", "150", "85", "181", "177", "387", "178", "79", "175", "176", "72", "188", "143", "174", "149", "117", "128", "86", "103", "137", "161", "384", "22", "391", "75", "278", "82", "133", "201", "68", "283"
                ],
            }
        ],
        enableRankingPage: false,
    }

    // 通用解析：同时支持分类/搜索卡片、探索页卡片
    parseComics(html, onePage = false) {
        const doc = new HtmlDocument(html);
        const comics = [];
        const seen = new Set();

        const addComic = (id, title, cover) => {
            if (!id || seen.has(id)) return;
            seen.add(id);
            comics.push(new Comic({ id, title, cover }));
        };

        // 分类/搜索页：article.comic-card
        for (let card of doc.querySelectorAll("article.comic-card")) {
            const link = card.querySelector("a.comic-card__link") || card.querySelector("a");
            if (!link) continue;
            const href = link.attributes["href"];
            const idMatch = href?.match(/\/comic\/(\d+)\.html/);
            if (!idMatch) continue;
            const title = card.querySelector(".comic-card__title")?.text || "";
            const img = card.querySelector("img.lazy") || card.querySelector("img");
            const cover = img?.attributes["data-src"] || img?.attributes["src"] || "";
            addComic(idMatch[1], title, cover);
        }

        // 探索页更新卡片
        for (let card of doc.querySelectorAll("a.mint-update-card")) {
            const href = card.attributes["href"];
            const idMatch = href?.match(/\/comic\/(\d+)\.html/);
            if (!idMatch) continue;
            const title = card.querySelector("strong")?.text || "";
            const img = card.querySelector("img");
            const cover = img?.attributes["src"] || img?.attributes["data-src"] || "";
            addComic(idMatch[1], title, cover);
        }

        // 探索页封面卡片
        for (let card of doc.querySelectorAll("a.mint-cover-card")) {
            const href = card.attributes["href"];
            const idMatch = href?.match(/\/comic\/(\d+)\.html/);
            if (!idMatch) continue;
            const title = card.querySelector("h3")?.text || "";
            const img = card.querySelector("img");
            const cover = img?.attributes["src"] || img?.attributes["data-src"] || "";
            addComic(idMatch[1], title, cover);
        }

        // 旧版回退
        if (comics.length === 0) {
            for (let comic of doc.querySelectorAll(".itemBox")) {
                addComic(comic.attributes["data-key"], comic.querySelector(".title")?.text, comic.querySelector("img")?.attributes["src"]);
            }
        }

        const maxPageEl = doc.querySelector("#total-page");
        const maxPage = maxPageEl ? parseInt(maxPageEl.attributes["value"]) : 1;
        return { comics, maxPage: onePage ? 1 : maxPage };
    }

    // 解析阅读页图片
    parseReaderImages(html) {
        const doc = new HtmlDocument(html);
        const images = [];
        for (let img of doc.querySelectorAll(".reader-content img, .reader-image, img.lazy")) {
            const url = img.attributes["data-src"] || img.attributes["data-original"] || img.attributes["src"];
            if (url && !url.includes("placeholder.svg") && /^https?:\/\//.test(url)) {
                if (!images.includes(url)) images.push(url);
            }
        }
        doc.dispose?.();
        return images;
    }

    // 列表解析（返回数组，供分类页使用）
    parseList(doc) {
        const comics = [];
        const seen = new Set();

        const addComic = (id, title, cover) => {
            if (!id || seen.has(id)) return;
            seen.add(id);
            comics.push(new Comic({ id, title, cover }));
        };

        for (let card of doc.querySelectorAll("article.comic-card")) {
            const link = card.querySelector("a.comic-card__link") || card.querySelector("a");
            if (!link) continue;
            const href = link.attributes["href"];
            const idMatch = href?.match(/\/comic\/(\d+)\.html/);
            if (!idMatch) continue;
            const title = card.querySelector(".comic-card__title")?.text || "";
            const img = card.querySelector("img.lazy") || card.querySelector("img");
            const cover = img?.attributes["data-src"] || img?.attributes["src"] || "";
            addComic(idMatch[1], title, cover);
        }

        if (comics.length === 0) {
            for (let comic of doc.querySelectorAll(".list-comic")) {
                addComic(comic.attributes["data-key"], comic.querySelector(".txtA")?.text, comic.querySelector("img")?.attributes["src"]);
            }
        }
        return comics;
    }

    categoryComics = {
        load: async (category, params, options, page) => {
            let url = `${this.baseUrl}/category/tags/${params}`;
            const status = options[0];
            if (status !== "0") {
                url += `/finish/${status}`;
            }
            const sort = options[1];
            if (sort !== "id") {
                url += `/order/${sort}`;
            }
            url += `/page/${page}`;
            console.warn(url);
            const res = await Network.get(url);
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            const doc = new HtmlDocument(res.body);
            const comics = this.parseList(doc);
            let maxPage = 1;
            const pageLinks = doc.querySelectorAll(".pagination-wrapper a[href*='/page/']");
            for (let link of pageLinks) {
                const href = link.attributes["href"];
                const match = href?.match(/\/page\/(\d+)/);
                if (match) {
                    const p = parseInt(match[1]);
                    if (p > maxPage) maxPage = p;
                }
            }
            return { comics, maxPage };
        },
        optionLoader: async (category, params) => {
            return [
                { options: [ "0-全部", "1-连载", "2-完结" ] },
                { options: [ "id-最新", "hits-热门", "addtime-更新" ] }
            ];
        }
    }

    search = {
        load: async (keyword, options, page) => {
            const url = `${this.baseUrl}/search?key=${encodeURIComponent(keyword)}&sort=${options[0]}&page=${page}`;
            const res = await Network.get(url);
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            return this.parseComics(res.body);
        },
        optionList: [
            { options: [ "update-更新", "post-发布", "click-点击" ], label: "排序" }
        ],
        enableTagsSuggestions: false,
    }

    comic = {
        loadInfo: async (id) => {
            const res = await Network.get(`${this.baseUrl}/comic/${id}.html`);
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            const doc = new HtmlDocument(res.body);

            // 标题
            let title = doc.querySelector("#mintWorkTitle")?.text?.trim() ||
                        doc.querySelector(".mint-work-info h2")?.text?.trim() ||
                        doc.querySelector(".comic-hero__title")?.text?.trim() ||
                        doc.querySelector("h1")?.text?.trim() ||
                        "未知标题";

            // 封面
            let cover = "";
            const coverImg = doc.querySelector("#mintWorkCover") ||
                             doc.querySelector(".mint-work-cover") ||
                             doc.querySelector(".comic-hero__cover img");
            if (coverImg) {
                cover = coverImg.attributes["src"] ||
                        coverImg.attributes["data-src"] ||
                        coverImg.attributes["data-original"] || "";
            }
            if (!cover) {
                for (let sel of [".comic-cover-large img.lazy", ".pic img", ".cover img", ".comic-cover img", "img.lazy"]) {
                    const img = doc.querySelector(sel);
                    if (img) {
                        cover = img.attributes["data-original"] || img.attributes["data-src"] || img.attributes["src"] || "";
                        if (cover) break;
                    }
                }
            }

            // 简介
            let description = doc.querySelector("#mintIntroPanel > div")?.text?.trim() ||
                              doc.querySelector(".mint-intro > div")?.text?.trim() ||
                              doc.querySelector(".comic-desc")?.text?.trim() ||
                              doc.querySelector(".comic-description-inline__content")?.text?.trim() ||
                              doc.querySelector("#full-des")?.text?.trim() ||
                              doc.querySelector(".comic-description")?.text?.trim() ||
                              "";

            // 作者 / 状态 / 更新 / 标签
            let author = "", update = "", status = "";
            const tags = [];

            const workInfo = doc.querySelector(".mint-work-info");
            if (workInfo) {
                for (let p of workInfo.querySelectorAll("p")) {
                    const text = p.text?.trim() || "";
                    if (text.endsWith("著")) {
                        author = text.replace(/\s*著\s*$/, "").trim();
                        break;
                    }
                }
                const tagEl = workInfo.querySelector("p .mint-tag, p span.mint-tag");
                if (tagEl) {
                    status = tagEl.text?.trim() || "";
                    const parentText = tagEl.parentNode?.text?.trim() || "";
                    const tagText = parentText.replace(status, "").trim();
                    if (tagText) {
                        for (let t of tagText.split(/\s+/)) {
                            if (t && t.length > 0) tags.push(t);
                        }
                    }
                }
                const metaP = workInfo.querySelector("p.mint-work-meta");
                if (metaP) {
                    const m = metaP.text?.match(/(\d{2}-\d{2})\s*更新/);
                    if (m) update = m[1];
                }
            }

            // 旧版回退
            if (!author && !status) {
                const authorInfoEl = doc.querySelector(".comic-author-info");
                if (authorInfoEl) {
                    const text = authorInfoEl.text;
                    const authorMatch = text.match(/作者：([^·]+)/);
                    if (authorMatch) author = authorMatch[1].trim();
                    const updateMatch = text.match(/更新时间：([^·]+)/);
                    if (updateMatch) update = updateMatch[1].trim();
                    const statusMatch = text.match(/状态：([^·]+)/);
                    if (statusMatch) status = statusMatch[1].trim();
                } else {
                    const infos = doc.querySelectorAll(".txtItme");
                    if (infos.length > 0) {
                        author = infos[0]?.text?.replaceAll("\n", "").replaceAll("\r", "").trim() || "";
                        if (infos[3]) {
                            update = infos[3].querySelector(".date")?.text || "";
                        }
                    }
                }
            }

            // 章节列表（按页面原始顺序收集，稍后反转）
            // 新版：div.mint-chapter-grid 内的 a[href^='/go/']，锚文本即章节标题
            const rawChapters = [];   // [[token, title], ...] 保持原始顺序
            const seenTokens = new Set();

            const pushChapter = (token, chapterTitle) => {
                if (!token || !chapterTitle) return;
                if (seenTokens.has(token)) return;
                seenTokens.add(token);
                rawChapters.push([token, chapterTitle]);
            };

            const chapterGrid = doc.querySelector(".mint-chapter-grid");
            if (chapterGrid) {
                for (let link of chapterGrid.querySelectorAll("a[href^='/go/']")) {
                    const href = link.attributes["href"];
                    const goMatch = href?.match(/^\/go\/([A-Za-z0-9+/=_-]+)$/);
                    if (!goMatch) continue;
                    const token = goMatch[1];
                    const chapterTitle = link.text?.trim() || "";
                    if (chapterTitle.includes("APP观看")) continue;
                    pushChapter(token, chapterTitle);
                }
            }

            // 旧版：.chapter-list a.chapter-item
            if (rawChapters.length === 0) {
                for (let item of doc.querySelectorAll(".chapter-list a.chapter-item")) {
                    const href = item.attributes["href"] || "";
                    const goMatch = href.match(/^\/go\/([A-Za-z0-9+/=_-]+)$/);
                    if (!goMatch) continue;
                    const token = goMatch[1];
                    const chapterTitle = item.querySelector(".chapter-title")?.text?.trim() ||
                                         item.text?.trim() || "";
                    if (chapterTitle.includes("APP观看")) continue;
                    pushChapter(token, chapterTitle);
                }
            }

            // 更旧版：/comic/ID/章节.html
            if (rawChapters.length === 0) {
                const allLinks = doc.querySelectorAll("a[href]");
                for (let link of allLinks) {
                    const href = link.attributes["href"];
                    if (!href) continue;
                    const match = href.match(/\/comic\/(\d+)\/(\d+)\.html/);
                    if (!match) continue;
                    const chapterId = `${match[1]}_${match[2]}`;
                    let chapterTitle = link.text?.trim() || "";
                    if (!chapterTitle) {
                        const parent = link.parentNode;
                        const titleSpan = parent?.querySelector?.(".chapter-title, .chapter-name");
                        if (titleSpan) chapterTitle = titleSpan.text?.trim() || "";
                    }
                    if (!chapterTitle) chapterTitle = "第" + match[2] + "话";
                    pushChapter(chapterId, chapterTitle);
                }
            }

            // ★ 关键：反转顺序，让最老话排在最前
            const chapters = {};
            for (let i = rawChapters.length - 1; i >= 0; i--) {
                const [token, chapterTitle] = rawChapters[i];
                chapters[token] = chapterTitle;
            }

            console.warn(`提取到 ${Object.keys(chapters).length} 个章节`);
            if (Object.keys(chapters).length === 0) {
                throw "未找到任何章节，页面结构可能已变化";
            }

            // 推荐漫画
            const recommend = [];
            const seenRec = new Set();
            const recSelectors = ".mint-cover-grid--three a.mint-cover-card, .recommendations .comic-card, .comic-card";
            for (let card of doc.querySelectorAll(recSelectors)) {
                let recId = null;
                if (card.tagName?.toLowerCase() === "a") {
                    const href = card.attributes["href"] || "";
                    const m = href.match(/\/comic\/(\d+)\.html/);
                    if (m) recId = m[1];
                } else {
                    const link = card.querySelector("a");
                    const href = link?.attributes["href"] || card.attributes["onclick"] || "";
                    const m = href.match(/\/comic\/(\d+)\.html/);
                    if (m) recId = m[1];
                }
                if (!recId || recId === id || seenRec.has(recId)) continue;
                seenRec.add(recId);
                const recTitle = card.querySelector("h3, .comic-card__title, .comic-title")?.text?.trim() || "";
                const recImg = card.querySelector("img.lazy") || card.querySelector("img");
                const recCover = recImg?.attributes["src"] || recImg?.attributes["data-src"] || "";
                recommend.push(new Comic({ id: recId, title: recTitle, cover: recCover }));
            }

            const url = `${this.baseUrl}/comic/${id}.html`;

            return {
                title,
                cover,
                description,
                tags: {
                    "作者": [author],
                    "状态": [status],
                    "更新": [update],
                    "标签": tags
                },
                chapters,
                recommend,
                url
            };
        },

        loadEp: async (comicId, epId) => {
            if (!epId) {
                throw new Error(`章节ID无效: ${epId}，请检查详情页是否成功加载章节列表`);
            }

            let html = "";
            let status = 0;

            // 旧版 epId 格式：数字_数字（comicId_chapterId）
            const oldMatch = epId.match(/^(\d+)_(\d+)$/);
            if (oldMatch) {
                const ids = oldMatch;
                const res = await Network.get(`${this.baseUrl}/comic/${ids[1]}/${ids[2]}.html`, {
                    "Referer": `${this.baseUrl}/comic/${comicId}.html`
                });
                status = res.status;
                html = res.body;
                if (status === 200) {
                    const m = html.match(/location\.replace\("([^"]+)"\)/);
                    if (m) {
                        const res3 = await Network.get(m[1], { "Referer": `${this.baseUrl}/` });
                        status = res3.status;
                        html = res3.body;
                    }
                }
            } else {
                // 新版：epId 是 /go/ 后的 token，阅读页在 reader.hqread.cc/r/<token>
                const res = await Network.get(`${this.readerUrl}/r/${epId}`, {
                    "Referer": `${this.baseUrl}/`
                });
                status = res.status;
                html = res.body;
                let images = this.parseReaderImages(html);
                if (images.length > 0) return { images };

                const res2 = await Network.get(`${this.baseUrl}/go/${epId}`, {
                    "Referer": `${this.baseUrl}/comic/${comicId}.html`
                });
                status = res2.status;
                html = res2.body;
                if (status === 200) {
                    const m = html.match(/location\.replace\("([^"]+)"\)/);
                    if (m) {
                        const res3 = await Network.get(m[1], { "Referer": `${this.baseUrl}/` });
                        status = res3.status;
                        html = res3.body;
                    }
                }
            }

            if (status !== 200) throw `Invalid status code: ${status}`;
            const images = this.parseReaderImages(html);
            if (images.length === 0) {
                throw "未找到任何图片，该章节可能为App抢先看或页面结构已变化";
            }
            return { images };
        },

        link: {
            domains: [
                'wmh1234.com',
                'mh1234.com',
                'www.wmh1234.com',
                'm.wmh1234.com',
                'hqread.cc'
            ],
            linkToId: (url) => {
                let match = url.match(/\/comic\/(\d+)\.html/);
                if (match) return match[1];
                match = url.match(/\/details\/(\d+)/);
                if (match) return match[1];
                return null;
            }
        },

        idMatch: "^\\d+$",

        enableTagsTranslate: false,
    }

    onImageLoad(url, comicId, epId) {
        return { headers: { "Referer": `${this.baseUrl}/` } };
    }

    onThumbnailLoad(url) {
        return { headers: { "Referer": `${this.baseUrl}/` } };
    }
}