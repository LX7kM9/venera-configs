class HComic extends ComicSource {
    // Name of the source
    name = "H-Comic"

    // Unique id of the source
    key = "hcomic"

    version = "1.0.2"   // 修复链接解析问题

    minAppVersion = "1.6.0"

    // Update url
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/hcomic.js"

    baseUrl = "https://h-comic.com"

    /**
     * [Optional] init function
     */
    init() {

    }

    async getHtml(url) {
        let res = await Network.get(url, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        return res.body;
    }

    extractData(html) {
        // Look for the SvelteKit data script
        // Matches: data: [null, { ... }], form:
        let match = html.match(/data:\s*\[null,\s*(\{[\s\S]*?\})\s*\]\s*,\s*form:/);
        if (match) {
            let jsonStr = match[1];
            try {
                // Try to fix unquoted keys: { key: value } -> { "key": value }
                let fixedJsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
                let json = JSON.parse(fixedJsonStr);
                return json.data;
            } catch (e) {
                console.error("Failed to parse JSON", e);
                try {
                    // Fallback to new Function if JSON.parse fails (e.g. trailing commas)
                    let fn = new Function("return " + jsonStr);
                    let json = fn();
                    return json.data;
                } catch (e2) {
                    console.error("Failed to eval", e2);
                }
            }
        }
        return null;
    }

    extractMaxPage(html) {
        let match = html.match(/name="page"[^>]*max="(\d+)"/);
        if (match) {
            return parseInt(match[1]);
        }
        return 1;
    }

    parseComic(c) {
        let title = c.title.display || c.title.pretty || c.title.japanese;
        let tags = c.tags ? c.tags.map(t => t.name_zh || t.name) : [];
        let updateTime = null;
        if (c.upload_date) {
            let date = new Date(c.upload_date * 1000).toISOString().split('T')[0];
            tags.push(date);
            updateTime = date;
        }
        return new Comic({
            id: `${c.id}|${title}`,
            title: title,
            subTitle: c.title.english,
            cover: c.thumbnail,
            tags: tags,
            description: "",
            updateTime: updateTime
        });
    }

    // explore page list
    explore = [
        {
            // title of the page.
            title: "h-comic",

            /// multiPartPage or multiPageComicList or mixed
            type: "multiPartPage",

            /**
             * load function
             * @param page {number | null} - page number, null for `singlePageWithMultiPart` type
             * @returns {{}}
             */
            load: async (page) => {
                let html = await this.getHtml(this.baseUrl);
                let data = this.extractData(html);
                if (!data || !data.comics) return [];
                
                let comics = data.comics.map(c => this.parseComic(c));
                return [{ title: "随机漫画", comics }];
            }
        }
    ]

    // categories
    category = {
        /// title of the category page
        title: "H-Comic",
        parts: [
            {
                // title of the part
                name: "热门TAG",

                // fixed or random or dynamic
                type: "fixed",

                categories: [
                    { label: "全部", target: { page: "category", attributes: { category: "全部" } } },
                    { label: "全彩", target: { page: "category", attributes: { category: "全彩", param: "全彩" } } },
                    { label: "無修正", target: { page: "category", attributes: { category: "無修正", param: "無修正" } } },
                    { label: "蘿莉", target: { page: "category", attributes: { category: "蘿莉", param: "蘿莉" } } },
                    { label: "制服", target: { page: "category", attributes: { category: "制服", param: "制服" } } },
                    { label: "巨乳", target: { page: "category", attributes: { category: "巨乳", param: "巨乳" } } },
                    { label: "黑絲 / 白襪", target: { page: "category", attributes: { category: "黑絲 / 白襪", param: "黑絲 / 白襪" } } },
                    { label: "NTR", target: { page: "category", attributes: { category: "NTR", param: "netorare" } } },
                    { label: "足交 / 腳交", target: { page: "category", attributes: { category: "足交 / 腳交", param: "footjob" } } },
                    { label: "女學生", target: { page: "category", attributes: { category: "女學生", param: "女學生" } } },
                    { label: "眼鏡控", target: { page: "category", attributes: { category: "眼鏡控", param: "眼鏡控" } } },
                    { label: "口交", target: { page: "category", attributes: { category: "口交", param: "口交" } } },
                    { label: "正太控", target: { page: "category", attributes: { category: "正太控", param: "正太控" } } },
                    { label: "年上", target: { page: "category", attributes: { category: "年上", param: "年上" } } },
                    { label: "亂倫", target: { page: "category", attributes: { category: "亂倫", param: "亂倫" } } },
                    { label: "熟女 / 人妻", target: { page: "category", attributes: { category: "熟女 / 人妻", param: "熟女 / 人妻" } } },
                    { label: "同志 BL", target: { page: "category", attributes: { category: "同志 BL", param: "同志 BL" } } },
                    { label: "黑肉", target: { page: "category", attributes: { category: "黑肉", param: "黑肉" } } },
                    { label: "泳裝", target: { page: "category", attributes: { category: "泳裝", param: "泳裝" } } },
                    { label: "手淫", target: { page: "category", attributes: { category: "手淫", param: "手淫" } } },
                    { label: "肌肉", target: { page: "category", attributes: { category: "肌肉", param: "肌肉" } } },
                    { label: "姐姐 / 妹妹", target: { page: "category", attributes: { category: "姐姐 / 妹妹", param: "姐姐 / 妹妹" } } },
                    { label: "捆綁", target: { page: "category", attributes: { category: "捆綁", param: "捆綁" } } },
                    { label: "調教", target: { page: "category", attributes: { category: "調教", param: "調教" } } },
                    { label: "催眠", target: { page: "category", attributes: { category: "催眠", param: "催眠" } } },
                    { label: "露出", target: { page: "category", attributes: { category: "露出", param: "露出" } } },
                    { label: "群交", target: { page: "category", attributes: { category: "群交", param: "群交" } } },
                    { label: "肛交", target: { page: "category", attributes: { category: "肛交", param: "肛交" } } },
                    { label: "獸交", target: { page: "category", attributes: { category: "獸交", param: "獸交" } } }
                ]
            }
        ],
        // enable ranking page
        enableRankingPage: false,
    }

    /// category comic loading related
    categoryComics = {
        /**
         * load comics of a category
         * @param category {string} - category name
         * @param param {string?} - category param
         * @param options {string[]} - options from optionList
         * @param page {number} - page number
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (category, param, options, page) => {
            let sort = options[0];
            let path = sort === "random" ? "/random" : "/";
            
            let url = `${this.baseUrl}${path}?page=${page}&q=`;

            if (param) {
                url += `&tag=${encodeURIComponent(param)}`;
            } else {
                url += `&tag=`;
            }

            let html = await this.getHtml(url);
            let data = this.extractData(html);
            let maxPage = sort === "random" ? null : this.extractMaxPage(html);

            if (!data || !data.comics) return { comics: [], maxPage: page };

            let comics = data.comics.map(c => this.parseComic(c));
            
            return {
                comics: comics,
                maxPage: maxPage
            }
        },
        // [Optional] provide options for category comic loading
        optionList: [
            {
                options: [
                    "latest-最近更新",
                    "random-随机刷新"
                ]
            }
        ],
        ranking: {
            options: [],
            load: async (option, page) => {
                return { comics: [], maxPage: 0 };
            }
        }
    }

    /// search related
    search = {
        /**
         * load search result
         * @param keyword {string}
         * @param options {string[]} - options from optionList
         * @param page {number}
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (keyword, options, page) => {
            // Placeholder for search
            let url = `${this.baseUrl}/?q=${encodeURIComponent(keyword)}&tag=&page=${page}`;
            let html = await this.getHtml(url);
            let data = this.extractData(html);
            let maxPage = this.extractMaxPage(html);

            if (!data || !data.comics) return { comics: [], maxPage: page };

            let comics = data.comics.map(c => this.parseComic(c));

            return { comics, maxPage };
        },
        optionList: [],
        enableTagsSuggestions: false,
    }

    /// single comic related
    comic = {
        loadInfo: async (id) => {
            let realId = id;
            let title_temp = "view";
            if (id.includes('|')) {
                let parts = id.split('|');
                realId = parts[0];
                title_temp = parts.slice(1).join('|');
            }

            let url = `${this.baseUrl}/comics/${encodeURIComponent(title_temp)}/1?id=${realId}`;
            let html = await this.getHtml(url);
            let data = this.extractData(html);
            
            if (!data || !data.comic) throw "Failed to load comic info";
            let c = data.comic;

            let title = c.title.display || c.title.pretty || c.title.japanese;
            let subTitle = c.title.english;
            
            let cover = c.thumbnail;
            if (!cover && c.comic_source && c.media_id) {
                cover = `https://h-comic.link/api/${c.comic_source}/${c.media_id}/pages/1`;
            }

            let tags = {};
            if (c.tags) {
                tags["标签"] = c.tags.map(t => t.name_zh || t.name);
            }
            
            let updateTime = null;
            if (c.upload_date) {
                let date = new Date(c.upload_date * 1000).toISOString().split('T')[0];
                tags["日期"] = [date];
                updateTime = date;
            }

            let description = c.title.japanese || "";

            // Encode source, media_id, num_pages into chapter ID
            let chapterId = `${c.comic_source}|${c.media_id}|${c.num_pages}`;

            let chapters = new Map();
            let group = new Map();
            group.set(chapterId, "全一话");
            chapters.set("章节", group);

            // ========== 生成详情页 URL（供复制链接使用） ==========
            const comicUrl = `${this.baseUrl}/comics/${encodeURIComponent(title_temp)}/1?id=${realId}`;

            return new ComicDetails({
                title: title,
                subTitle: subTitle,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                updateTime: updateTime,
                url: comicUrl
            });
        },
        loadEp: async (comicId, epId) => {
            let parts = epId.split('|');
            let source = parts[0];
            let mediaId = parts[1];
            let numPages = parseInt(parts[2]);

            let images = [];
            for (let i = 1; i <= numPages; i++) {
                images.push(`https://h-comic.link/api/${source}/${mediaId}/pages/${i}`);
            }

            return { images: images };
        },
        onClickTag: (namespace, tag) => {
            return {
                page: "category",
                attributes: {
                    category: "tag",
                    param: tag
                }
            };
        },
        // ========== 链接解析功能（已修复） ==========
        link: {
            /**
             * 支持的域名列表（用于识别链接是否属于该源）
             */
            domains: [
                'h-comic.com'
            ],
            /**
             * 从 URL 中提取漫画 ID
             * 支持格式：
             *   https://h-comic.com/comics/{title}/1?id={id}
             * @param {string} url - 完整的漫画详情页链接
             * @returns {string|null} - 漫画 ID（格式为 "id|title" 或纯数字 id），若无法解析则返回 null
             */
            linkToId: (url) => {
                // 提取 id 参数
                let idMatch = url.match(/id=(\d+)/);
                if (!idMatch) return null;
                let id = idMatch[1];
                
                // 尝试从路径中提取标题
                // 匹配 /comics/ 后面直到下一个 / 或 ? 之前的内容
                let titleMatch = url.match(/\/comics\/([^/?]+)/);
                if (titleMatch) {
                    try {
                        let title = decodeURIComponent(titleMatch[1]);
                        // 如果标题有效且不是 "view"，则返回 id|title 格式
                        if (title && title !== "view") {
                            return `${id}|${title}`;
                        }
                    } catch (e) {
                        // decodeURIComponent 失败时忽略，继续使用默认值
                    }
                }
                
                // 如果无法提取有效标题，只返回 id
                // loadInfo 会将其作为 realId，并使用默认的 "view" 作为 title_temp
                return id;
            }
        },
        enableTagsTranslate: false,
    }
}