/** @type {import('./_venera_.js')} */
class YKMHSource extends ComicSource {
    name = "优酷漫画"
    key = "ykmh"
    version = "1.0.9"   // 改为 singlePageWithMultiPart，去掉无效的“查看更多”
    minAppVersion = "1.4.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/ykmh.js"

    get baseUrl() {
        return "https://www.ykmh.net";
    }

    get commonHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.ykmh.net/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Connection': 'keep-alive'
        };
    }

    _absoluteUrl(url, base) {
        if (!url || typeof url !== 'string' || url.trim() === "") return "";
        let trimmedUrl = url.trim();
        let finalUrl = "";
        if (trimmedUrl.startsWith('http')) {
            finalUrl = trimmedUrl;
        } else if (trimmedUrl.startsWith('//')) {
            finalUrl = 'https:' + trimmedUrl;
        } else {
            let domain = base || "https://www.ykmh.net";
            finalUrl = domain + (trimmedUrl.startsWith('/') ? trimmedUrl : '/' + trimmedUrl);
        }
        if (finalUrl.includes('ykmh.net/images/')) {
            finalUrl = finalUrl.replace(/https?:\/\/.*ykmh\.net\/images\//, 'https://js.haotuyk.top/images/');
        }
        return finalUrl;
    }

    // ==================== 探索页（改为 singlePageWithMultiPart） ====================
    explore = [
        {
            title: "优酷漫画",
            type: "singlePageWithMultiPart",
            load: async () => {
                let res = await Network.get("https://www.ykmh.net", { headers: this.commonHeaders })
                if (res.status !== 200) {
                    if (res.body && res.body.includes("cloudflare")) throw "触发 Cloudflare 验证。请在内置浏览器中打开 https://www.ykmh.net/ 完成验证后再使用。";
                    throw `Invalid status code: ${res.status}`;
                }
                const parseHotCarousel = (html) => {
                    let hotComics = [];
                    let carouselPattern = /<div class="sub-item">\s*<a href="([^"]+)" target="_blank"><img src="([^"]+)" alt="[^"]*"><\/a>\s*<div class="carousel-caption">\s*([^<]+)\s*<\/div>/g;
                    let match;
                    while ((match = carouselPattern.exec(html)) !== null) {
                        let cover = this._absoluteUrl(match[2], "https://www.ykmh.net");
                        if (cover) hotComics.push(new Comic({ id: match[1], title: match[3].trim(), cover: cover, tags: [`热门推荐`], description: "热门推荐漫画" }));
                    }
                    return hotComics.slice(0, 10);
                }
                const parseLatestComics = (html) => {
                    let latestComics = [];
                    let comicPattern = /<li data-key="(\d+)"><a class="image-link" href="([^"]+)" title="([^"]+)"><img src="([^"]+)"[^>]*><span class="tip"><p>([^<]*)<\/p><\/span><\/a><p><a href="[^"]*" title="[^"]*">([^<]+)<\/a><\/p>/g;
                    let match;
                    while ((match = comicPattern.exec(html)) !== null) {
                        let cover = this._absoluteUrl(match[4], "https://www.ykmh.net");
                        if (cover) latestComics.push(new Comic({ id: match[2], title: match[3], cover: cover, tags: [match[5]], description: `更新至：${match[5]}` }));
                    }
                    return latestComics.slice(0, 15);
                }
                
                // 生成两个板块
                let parts = [
                    { title: "热门推荐", comics: parseHotCarousel(res.body) },
                    { title: "最新更新", comics: parseLatestComics(res.body) }
                ];
                
                // 转换为对象（键为标题，值为漫画列表）
                let result = {};
                for (let part of parts) {
                    result[part.title] = part.comics;
                }
                return result;
            }
            // 无需 loadNext
        }
    ]

    static category_param_dict = {
        "全部": "", "爱情": "aiqing", "剧情": "juqing", "欢乐向": "huanlexiang", "格斗": "gedou", "科幻": "kehuan",
        "伪娘": "weiniang", "节操": "jiecao", "恐怖": "kongbu", "悬疑": "xuanyi", "冒险": "maoxian", "校园": "xiaoyuan",
        "治愈": "zhiyu", "恋爱": "lianai", "奇幻": "qihuan", "热血": "rexue", "限制级": "xianzhiji", "魔法": "mofa",
        "后宫": "hougong", "魔幻": "mohuan", "轻小说": "qingxiaoshuo", "震撼": "zhenhan", "纯爱": "chunai", "少女": "shaonv",
        "战争": "zhanzheng", "武侠": "wuxia", "搞笑": "gaoxiao", "神鬼": "shengui", "竞技": "jingji", "幻想": "huanxiang",
        "神魔": "shenmo", "灵异": "lingyi", "百合": "baihe", "运动": "yundong", "体育": "tiyu", "惊悚": "jingsong",
        "日常": "richang", "绅士": "shenshi", "颜艺": "yanyi", "生活": "shenghuo", "四格": "sige", "萌系": "mengxi",
        "都市": "dushi", "同人": "tongren", "推理": "tuili", "耽美": "danmei", "卖肉": "mairou", "职场": "zhichang",
        "侦探": "zhentan", "战斗": "zhandou", "爆笑": "baoxiao", "总裁": "zongcai", "美食": "meishi", "性转换": "xingzhuanhuan",
        "励志": "lizhi", "西方魔幻": "xifangmohuan", "改编": "gaibian", "其他": "qita", "宅系": "zhaixi", "机战": "jizhan",
        "乙女": "yinv", "秀吉": "xiuji", "舰娘": "jianniang", "历史": "lishi", "猎奇": "lieqi", "社会": "shehui",
        "青春": "qingchun", "高清单行": "gaoqingdanxing", "东方": "dongfang", "橘味": "juwei", "音乐舞蹈": "yinyuewudao",
        "家庭": "jiating", "少年": "shaonian", "泡泡": "paopao", "宫斗": "gongdou", "动作": "dongzuo", "青年": "qingnian",
        "虐心": "nuexin", "泛爱": "fanai", "机甲": "jijia", "装逼": "zhuangbi", "#穿越": "chuanyue", "#异世界": "yishijie",
        "#无修正": "wuxiuzheng", "已完结": "wanjie", "连载中": "lianzai"
    }

    category = {
        title: "优酷漫画",
        parts: [{ name: "主题", type: "fixed", categories: Object.keys(YKMHSource.category_param_dict), itemType: "category", categoryParams: Object.values(YKMHSource.category_param_dict) }],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let sort = options[1].split("-")[0] == 0 ? "" : "-";
            sort += options[0].split("-")[0];
            let url = (param === "" || param === undefined) ? `https://www.ykmh.net/list/${sort}/?page=${page}` : `https://www.ykmh.net/list/${param}/${sort}/${page}/`;
            let res = await Network.get(url, { headers: this.commonHeaders });
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            const parseComicsList = (html) => {
                let comics = [];
                let comicPattern = /<li class="list-comic" data-key="(\d+)">\s*<a class="comic_img"\s+href="([^"]+)"><img src="([^"]+)" alt="([^"]*)"[^>]*><\/a>\s*<span class="comic_list_det"[^>]*>\s*<h3><a href="[^"]*">([^<]+)<\/a><\/h3>/g;
                let match;
                while ((match = comicPattern.exec(html)) !== null) {
                    let cover = this._absoluteUrl(match[3], "https://www.ykmh.net");
                    if (cover) comics.push(new Comic({ id: match[2], title: match[5] || match[4], cover: cover }));
                }
                return comics;
            }
            let comics = parseComicsList(res.body);
            let maxPage = 1;
            let pageMatch = res.body.match(/<li class="last"><a href="[^"]*\/(\d+)\/" data-page="\d+">尾页<\/a><\/li>/);
            if (pageMatch) maxPage = parseInt(pageMatch[1]);
            return { comics, maxPage };
        },
        optionList: [{ options: ["update-更新时间", "post-发布时间", "click-点击量"] }, { options: ["0-降序", "1-升序"] }]
    }

    search = {
        load: async (keyword, options, page) => {
            let encodedKeyword = encodeURIComponent(keyword);
            let url = page && page > 1 ? `https://www.ykmh.net/search/?keywords=${encodedKeyword}&page=${page}` : `https://www.ykmh.net/search/?keywords=${encodedKeyword}`;
            let res = await Network.get(url, { headers: this.commonHeaders });
            if (res.status !== 200) throw `Request Error: ${res.status}`;
            const parseSearchResults = (html) => {
                let comics = [];
                let comicPattern = /<li class="list-comic" data-key="(\d+)"><a class="image-link"\s+href="([^"]+)"\s+title="([^"]+)"><img src="([^"]+)"[^>]*><\/a>\s*<p><a href="[^"]*"[^>]*>([^<]+)<\/a><\/p>\s*<p class="auth"><a href="[^"]*">([^<]*)<\/a><\/p>\s*<p class="newPage">([^<]*)<\/p>/g;
                let match;
                while ((match = comicPattern.exec(html)) !== null) {
                    let cover = this._absoluteUrl(match[4], "https://www.ykmh.net");
                    if (cover) comics.push(new Comic({ id: match[2], title: match[3], cover: cover, tags: [match[6] || "未知作者", match[7] || ""], description: `作者：${match[6] || "未知作者"} | 更新至：${match[7] || "未知"}` }));
                }
                return comics;
            }
            let comics = parseSearchResults(res.body);
            let maxPage = 1;
            let pageMatch = res.body.match(/<li class="last"><a href="[^"]*page=(\d+)"[^>]*>尾页<\/a><\/li>/);
            if (pageMatch) maxPage = parseInt(pageMatch[1]);
            return { comics, maxPage };
        }
    }

    comic = {
        id: null,
        buildId: null,
        loadInfo: async (id) => {
            let targetUrl = id.startsWith('https://www.ykmh.net/') ? id.replace('https://www.ykmh.net/', 'https://m.ykmh.net/') : (id.startsWith('/') ? 'https://m.ykmh.net' + id : 'https://m.ykmh.net/' + id);
            if (!targetUrl.endsWith('/')) targetUrl += '/';
            let res = await Network.get(targetUrl, { headers: { ...this.commonHeaders, 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', 'Referer': 'https://m.ykmh.net/' } });
            if (res.status !== 200) throw `请求详情失败: ${res.status}`;
            const parseComicInfo = (html) => {
                let title = (html.match(/<div class="BarTit" id="comicName">([^<]+)<\/div>/) || [])[1] || "未知标题";
                let cover = (html.match(/<div class="pic" id="Cover">\s*<mip-img src="([^"]+)"/) || [])[1] || "https://m.ykmh.net/images/default/cover.png";
                let author = (html.match(/<p class="txtItme">\s*<span class="icon icon01"><\/span>\s*<a href="[^"]*">([^<]+)<\/a>/) || [])[1] || "未知作者";
                let description = ((html.match(/<mip-showmore[^>]*id="showmore-des">\s*([^<]+(?:<[^>]+>[^<]*<\/[^>]+>[^<]*)*?)\s*<\/mip-showmore>/) || [])[1] || "暂无描述").replace(/<[^>]+>/g, '').trim();
                let status = "连载中", tags = [];
                let txtItems = html.match(/<p class="txtItme">[\s\S]*?<\/p>/g);
                if (txtItems) {
                    for (let item of txtItems) {
                        if (item.includes('icon icon02')) {
                            let tagMatches = item.matchAll(/<a href="[^"]*\/list\/[^"]*\/">([^<]+)<\/a>/g);
                            for (let tagMatch of tagMatches) {
                                if (tagMatch && tagMatch[1]) {
                                    let tagText = tagMatch[1].trim();
                                    if (tagText && !tags.includes(tagText)) {
                                        tags.push(tagText);
                                        if (tagText.includes('连载') || tagText.includes('完结')) status = tagText;
                                    }
                                }
                            }
                        }
                    }
                }
                return { title, cover: this._absoluteUrl(cover, "https://m.ykmh.net"), author, description, tags, status };
            }
            const parseChapters = (html) => {
                let allChaptersMap = new Map();
                let chapterGroupsPattern = /<div class="comic-chapters">[\s\S]*?<span class="Title">([^<]+)<\/span>[\s\S]*?<ul id="chapter-list-(\d+)"[^>]*>([\s\S]*?)<\/ul>/g;
                let groupMatch;
                while ((groupMatch = chapterGroupsPattern.exec(html)) !== null) {
                    let groupTitle = groupMatch[1].trim(), groupContent = groupMatch[3];
                    let chapterPattern = /<li>\s*<a href="([^"]+)"[^>]*>\s*<span>([^<]+)<\/span>\s*<\/a>\s*<\/li>/g;
                    let chapterMatch;
                    while ((chapterMatch = chapterPattern.exec(groupContent)) !== null) {
                        let url = this._absoluteUrl(chapterMatch[1], "https://m.ykmh.net");
                        let finalTitle = groupTitle !== "连载列表" ? `[${groupTitle}] ${chapterMatch[2].trim()}` : chapterMatch[2].trim();
                        allChaptersMap.set(url, finalTitle);
                    }
                }
                if (allChaptersMap.size === 0) {
                    let match, allChapterPattern = /<li>\s*<a href="([^"]+)"[^>]*>\s*<span>([^<]+)<\/span>\s*<\/a>\s*<\/li>/g;
                    while ((match = allChapterPattern.exec(html)) !== null) allChaptersMap.set(this._absoluteUrl(match[1], "https://m.ykmh.net"), match[2].trim());
                }
                return allChaptersMap;
            }
            let info = parseComicInfo(res.body), chapters = parseChapters(res.body);
            let updateInfo = chapters.size > 0 ? `更新至：${Array.from(chapters.values())[0]}` : "暂无更新";

            // ===== 修复：直接使用当前 URL 作为复制链接，替换域名为 PC 端 =====
            let detailUrl = targetUrl.replace('https://m.ykmh.net/', 'https://www.ykmh.net/');
            if (!detailUrl.endsWith('/')) detailUrl += '/';

            return { 
                title: info.title, 
                cover: info.cover, 
                description: info.description, 
                tags: { "作者": [info.author], "状态": [info.status], "更新": [updateInfo], "标签": info.tags }, 
                chapters: chapters, 
                recommend: [],
                url: detailUrl   // 修复：使用实际 URL，而非数字 ID
            };
        },

        loadEp: async (comicId, epId) => {
            let url = this._absoluteUrl(epId, "https://m.ykmh.net");
            let res = await Network.get(url, { headers: { ...this.commonHeaders, 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', 'Referer': 'https://m.ykmh.net/' } });
            if (res.status !== 200) throw `请求章节失败: ${res.status}`;
            let images = [];
            let scriptMatch = res.body.match(/var\s+chapterImages\s*=\s*(\[.*?\]);/);
            if (scriptMatch) {
                try {
                    let imageList = JSON.parse(scriptMatch[1]);
                    for (let img of imageList) {
                        let absImg = this._absoluteUrl(img, "https://m.ykmh.net");
                        if (absImg) images.push(absImg);
                    }
                } catch (e) {}
            }
            if (images.length === 0) {
                let match, imgPattern = /<img[^>]+src="([^"]+)"[^>]*>/g;
                while ((match = imgPattern.exec(res.body)) !== null) {
                    let src = match[1];
                    if (src && !src.includes('cover') && !src.includes('logo') && !src.includes('icon')) {
                        let absImg = this._absoluteUrl(src, "https://m.ykmh.net");
                        if (absImg) images.push(absImg);
                    }
                }
            }
            
            let imageHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': url,
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Connection': 'keep-alive'
            };

            let timestamp = new Date().getTime();
            let finalImages = images.filter(img => img && img.length > 10).map(img => {
                return img.includes('?') ? `${img}&v=${timestamp}` : `${img}?v=${timestamp}`;
            });

            return { 
                images: finalImages,
                headers: imageHeaders
            };
        },
        onClickTag: (namespace, tag) => {
            if (namespace === "标签") return { action: 'category', keyword: `${tag}`, param: `${YKMHSource.category_param_dict[tag]}` };
            throw "未支持此类Tag检索";
        },

        // ===== 修复：链接解析支持英文路径 =====
        link: {
            domains: ["www.ykmh.net", "m.ykmh.net"],
            linkToId: (url) => {
                // 匹配 /manhua/xxx/ 或 /manhua/xxx （英文路径）
                const match = url.match(/\/manhua\/[^\/\?]+/);
                if (match) return match[0];  // 返回相对路径，如 /manhua/DrSTONEshijiyuan
                // 匹配 /book/数字（旧版可能）
                const match2 = url.match(/\/book\/(\d+)/);
                if (match2) return match2[1];
                // 其他情况尝试匹配数字
                const match3 = url.match(/\/(\d+)/);
                return match3 ? match3[1] : null;
            }
        }
    }
}