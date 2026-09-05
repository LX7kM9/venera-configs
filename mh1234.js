class MH1234 extends ComicSource {
    name = "漫画1234"
    key = "mh1234"
    version = "1.4.1" // 新增链接解析与复制链接支持
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

    // 探索页（首页）
    explore = [{
        title: "漫画1234",
        type: "singlePageWithMultiPart",
        load: async () => {
            const result = {};
            const res = await Network.get(this.baseUrl);
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            const doc = new HtmlDocument(res.body);
            const sections = doc.querySelectorAll("section.comic-section");
            for (let section of sections) {
                const header = section.querySelector(".section-header .section-title");
                const tabTitle = header?.text?.trim() || "推荐";
                const items = [];
                const cards = section.querySelectorAll("article.comic-card");
                for (let card of cards) {
                    const link = card.querySelector("a.comic-card__link");
                    if (!link) continue;
                    const href = link.attributes["href"];
                    const idMatch = href?.match(/\/comic\/(\d+)\.html/);
                    if (!idMatch) continue;
                    const id = idMatch[1];
                    const title = card.querySelector(".comic-card__title")?.text || "";
                    const img = card.querySelector("img.lazy") || card.querySelector("img");
                    const cover = img?.attributes["data-src"] || img?.attributes["src"] || "";
                    items.push(new Comic({ id, title, cover }));
                }
                if (items.length > 0) {
                    result[tabTitle] = items;
                }
            }
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
                // 2026-08 站点分类体系已全部更换为新 ID（旧 ID 403/149/148... 已失效）
                // 注：站点"全部"(tags/0) 服务端模板损坏返回空列表，故不收录
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

    parseComics(html, onePage = false) {
        const doc = new HtmlDocument(html);
        const comics = [];
        for (let card of doc.querySelectorAll("article.comic-card")) {
            const link = card.querySelector("a.comic-card__link");
            if (!link) continue;
            const href = link.attributes["href"];
            const idMatch = href?.match(/\/comic\/(\d+)\.html/);
            if (!idMatch) continue;
            const id = idMatch[1];
            const title = card.querySelector(".comic-card__title")?.text || "";
            const img = card.querySelector("img.lazy") || card.querySelector("img");
            const cover = img?.attributes["data-src"] || img?.attributes["src"] || "";
            comics.push(new Comic({ id, title, cover }));
        }
        if (comics.length === 0) {
            for (let comic of doc.querySelectorAll(".itemBox")) {
                comics.push(new Comic({
                    id: comic.attributes["data-key"],
                    title: comic.querySelector(".title")?.text,
                    cover: comic.querySelector("img")?.attributes["src"]
                }));
            }
        }
        const maxPageEl = doc.querySelector("#total-page");
        const maxPage = maxPageEl ? parseInt(maxPageEl.attributes["value"]) : 1;
        return { comics, maxPage: onePage ? 1 : maxPage };
    }

    // 解析阅读页图片：新版阅读页为 main.reader-content 内 img.reader-image（data-src 为带签名CDN地址）
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

    parseList(doc) {
        const comics = [];
        for (let card of doc.querySelectorAll("article.comic-card")) {
            const link = card.querySelector("a.comic-card__link");
            if (!link) continue;
            const href = link.attributes["href"];
            const idMatch = href?.match(/\/comic\/(\d+)\.html/);
            if (!idMatch) continue;
            const id = idMatch[1];
            const title = card.querySelector(".comic-card__title")?.text || "";
            const img = card.querySelector("img.lazy") || card.querySelector("img");
            const cover = img?.attributes["data-src"] || img?.attributes["src"] || "";
            comics.push(new Comic({ id, title, cover }));
        }
        if (comics.length === 0) {
            for (let comic of doc.querySelectorAll(".list-comic")) {
                comics.push(new Comic({
                    id: comic.attributes["data-key"],
                    title: comic.querySelector(".txtA")?.text,
                    cover: comic.querySelector("img")?.attributes["src"]
                }));
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
            let title = doc.querySelector(".comic-hero__title")?.text ||
                        doc.querySelector("h1")?.text ||
                        doc.querySelector(".BarTit")?.text ||
                        "未知标题";

            // 封面
            let cover = "";
            const coverSelectors = [
                ".comic-hero__cover img",
                ".comic-cover-large img.lazy",
                ".pic img",
                ".cover img",
                ".comic-cover img",
                "img.lazy"
            ];
            for (let sel of coverSelectors) {
                const img = doc.querySelector(sel);
                if (img) {
                    cover = img.attributes["data-original"] || img.attributes["data-src"] || img.attributes["src"] || "";
                    if (cover) break;
                }
            }

            // 简介
            let description = doc.querySelector(".comic-desc")?.text ||
                              doc.querySelector(".comic-description-inline__content")?.text ||
                              doc.querySelector("#full-des")?.text ||
                              doc.querySelector(".comic-description")?.text ||
                              "";

            // 作者/状态（适配新版）
            let author = "", update = "", status = "";
            const metaItems = doc.querySelectorAll(".comic-hero__meta .meta-item");
            if (metaItems.length >= 1) {
                author = metaItems[0].text?.replace(/作者：/g, '').trim() || "";
            }
            const statItems = doc.querySelectorAll(".comic-hero__stats .stat-item");
            if (statItems.length >= 1) {
                const statusEl = statItems[0].querySelector(".stat-value");
                if (statusEl) {
                    status = statusEl.text?.trim() || "";
                }
            }
            // 如果新版未找到，尝试旧版
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
                        author = infos[0]?.text.replaceAll("\n", "").replaceAll("\r", "").trim() || "";
                        if (infos[3]) {
                            update = infos[3].querySelector(".date")?.text || "";
                        }
                    }
                }
            }

            // 标签
            const tags = [];
            const tagSelectors = [
                ".comic-hero__meta .meta-item:nth-child(2)",
                ".comic-tags-large .tag-large",
                ".sub_r a",
                ".tag-list a",
                ".comic-tags a"
            ];
            for (let sel of tagSelectors) {
                const tagEl = doc.querySelector(sel);
                if (tagEl) {
                    const tagText = tagEl.text;
                    if (tagText) {
                        const splitted = tagText.split(/\s+/).filter(t => t.length > 0);
                        tags.push(...splitted);
                    }
                }
                if (tags.length > 0) break;
            }

            // 章节列表：新版站点章节链接为 /go/<base64 token>（token 解码后为 comicId-chapterId-hash）
            // 阅读页实际位于 reader.hqread.cc/r/<token>，token 本身即为章节ID
            const chapters = {};
            const chapterItems = doc.querySelectorAll(".chapter-list a.chapter-item");
            for (let item of chapterItems) {
                const href = item.attributes["href"] || "";
                const goMatch = href.match(/^\/go\/([A-Za-z0-9+/=_-]+)$/);
                if (!goMatch) continue; // 跳过"APP观看"等非章节项
                const token = goMatch[1];
                let chapterTitle = item.querySelector(".chapter-title")?.text?.trim() ||
                                   item.text?.trim() || "";
                if (!chapterTitle || chapterTitle.indexOf("APP观看") >= 0) continue;
                chapters[token] = chapterTitle;
            }
            // 兼容旧版页面：/comic/ID/章节.html 直链（现已被 302 到 /go/）
            if (Object.keys(chapters).length === 0) {
                const allLinks = doc.querySelectorAll("a[href]");
                for (let link of allLinks) {
                    const href = link.attributes["href"];
                    if (!href) continue;
                    const match = href.match(/\/comic\/(\d+)\/(\d+)\.html/);
                    if (!match) continue;
                    const chapterId = `${match[1]}_${match[2]}`;
                    if (chapters[chapterId] !== undefined) continue;
                    let chapterTitle = link.text?.trim() || "";
                    if (!chapterTitle) {
                        const parent = link.parentNode;
                        const titleSpan = parent?.querySelector?.(".chapter-title, .chapter-name");
                        if (titleSpan) chapterTitle = titleSpan.text?.trim() || "";
                    }
                    if (!chapterTitle) chapterTitle = "第" + match[2] + "话";
                    chapters[chapterId] = chapterTitle;
                }
            }
            console.warn(`提取到 ${Object.keys(chapters).length} 个章节`);
            if (Object.keys(chapters).length === 0) {
                throw "未找到任何章节，页面结构可能已变化";
            }

            // 推荐漫画
            const recommend = [];
            const recCards = doc.querySelectorAll(".recommendations .comic-card, .comic-card");
            for (let card of recCards) {
                const link = card.querySelector("a");
                const href = link?.attributes["href"] || card.attributes["onclick"] || "";
                const idMatch = href.match(/\/comic\/(\d+)\.html/);
                if (!idMatch) continue;
                const recId = idMatch[1];
                if (recId === id) continue;
                const recTitle = card.querySelector(".comic-card__title, .comic-title")?.text || "";
                const recImg = card.querySelector("img.lazy") || card.querySelector("img");
                const recCover = recImg?.attributes["data-src"] || recImg?.attributes["src"] || "";
                recommend.push(new Comic({ id: recId, title: recTitle, cover: recCover }));
            }

            // 构造详情页链接（用于复制链接功能）
            const url = `${this.baseUrl}/comic/${id}.html`;

            return {
                title,
                cover,
                description,
                tags: {
                    "作者": [author],
                    "更新": [update],
                    "标签": tags
                },
                chapters,
                recommend,
                url // 新增，供右上角菜单复制链接使用
            };
        },

        loadEp: async (comicId, epId) => {
            if (!epId) {
                throw new Error(`章节ID无效: ${epId}，请检查详情页是否成功加载章节列表`);
            }
            // 新版：epId 为 /go/ token，阅读页在独立域名 reader.hqread.cc/r/<token>
            // 旧版 epId 格式为 comicId_chapterId，需拼回旧路径再跟随 302
            let html = "";
            let status = 0;
            if (epId.indexOf("_") > 0) {
                const ids = epId.split("_");
                const res = await Network.get(`${this.baseUrl}/comic/${ids[0]}/${ids[1]}.html`, {
                    "Referer": `${this.baseUrl}/comic/${comicId}.html`
                });
                status = res.status;
                html = res.body;
                // 旧路径现已 302 至 /go/<token>，返回的是 JS 跳转页，需跟随 location.replace
                if (status === 200) {
                    const m = html.match(/location\.replace\("([^"]+)"\)/);
                    if (m) {
                        const res3 = await Network.get(m[1], { "Referer": `${this.baseUrl}/` });
                        status = res3.status;
                        html = res3.body;
                    }
                }
            } else {
                // 优先直连阅读域（/go/ 中转页有时会被插入"App抢先看"广告）
                const res = await Network.get(`${this.readerUrl}/r/${epId}`, {
                    "Referer": `${this.baseUrl}/`
                });
                status = res.status;
                html = res.body;
                let images = this.parseReaderImages(html);
                if (images.length > 0) return { images };
                // 直连失败时走 /go/ 中转，解析 location.replace 跳转
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

        // 链接解析与复制链接支持
        link: {
            // 提供可能的域名列表（用于生成链接，App可能使用第一个）
            domains: [
                'wmh1234.com',
                'mh1234.com',
                'www.wmh1234.com',
                'm.wmh1234.com',
                'hqread.cc'
            ],
            // 从URL提取漫画ID
            linkToId: (url) => {
                let match = url.match(/\/comic\/(\d+)\.html/);
                if (match) return match[1];
                // 兼容其他可能的格式
                match = url.match(/\/details\/(\d+)/);
                if (match) return match[1];
                return null;
            }
        },

        // 漫画ID格式（数字）
        idMatch: "^\\d+$",

        enableTagsTranslate: false,
    }

    // 图片CDN（wmh1234.wszwhg.net）带签名参数，一般无Referer要求；统一带上站点Referer以防万一
    onImageLoad(url, comicId, epId) {
        return { headers: { "Referer": `${this.baseUrl}/` } };
    }

    onThumbnailLoad(url) {
        return { headers: { "Referer": `${this.baseUrl}/` } };
    }
}