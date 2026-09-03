/** @type {import('../_venera_.js')} */
class OneKkk extends ComicSource {
    name = "极速漫画"
    key = "one_kkk"
    version = "1.0.1"      // 修复链接解析跳转
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/one_kkk.js"  // 可自行修改

    init() { }

    get baseUrl() {
        return "https://m.1kkk.com";
    }

    // 通用请求头
    _buildHeaders() {
        return {
            'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
            'accept': '*/*',
            'accept-encoding': 'gzip, deflate, br, zstd',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'cache-control': 'no-cache',
            'pragma': 'no-cache',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'host': 'm.1kkk.com'
        };
    }

    _buildImageHeaders(imageUrl, referer) {
        let host = '';
        try {
            let u = new URL(imageUrl);
            host = u.host;
        } catch (e) {
            let m = imageUrl.match(/^https?:\/\/([^\/]+)/i);
            host = m ? m[1] : '';
        }

        return {
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Pragma': 'no-cache',
            'Referer': referer || (this.baseUrl + '/'),
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
            'Sec-Fetch-Storage-Access': 'active',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
            'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"'
        };
    }

    // ==================== 探索页 (改为 singlePageWithMultiPart) ====================
    explore = [
        {
            title: "极速漫画",
            type: "singlePageWithMultiPart",
            load: async () => {
                let url = this.baseUrl + '/';
                let res = await Network.get(url, this._buildHeaders());
                if (res.status !== 200) throw `Invalid status code: ${res.status}`;

                let html = res.body || '';
                let doc = new HtmlDocument(html);
                let parts = [];

                // Banner
                let banner = doc.querySelector('.index-banner');
                if (banner) {
                    let comics = [];
                    let items = banner.querySelectorAll('li');
                    for (let i = 0; i < items.length; i++) {
                        let item = items[i];
                        let a = item.querySelector('a');
                        if (!a) continue;
                        let img = item.querySelector('img');
                        let href = a.attributes['href'];
                        let title = a.attributes['title'];
                        let cover = img ? (img.attributes['src'] || img.attributes['data-src']) : '';
                        if (href) {
                            if (!href.startsWith('http')) href = this.baseUrl + href;
                            if (cover && !cover.startsWith('http')) {
                                if (cover.startsWith('//')) cover = 'https:' + cover;
                                else cover = this.baseUrl + cover;
                            }
                            comics.push(new Comic({
                                id: href,
                                title: title || '',
                                cover: cover || '',
                                description: ''
                            }));
                        }
                    }
                    if (comics.length > 0) parts.push({ title: '热门推荐', comics: comics });
                }

                // 列表
                let lists = doc.querySelectorAll('.manga-list');
                for (let i = 0; i < lists.length; i++) {
                    let list = lists[i];
                    let titleNode = list.querySelector('.manga-list-title');
                    let title = titleNode ? titleNode.text.trim() : '';
                    let viewMore = null;
                    if (titleNode) {
                        let moreNode = titleNode.querySelector('a');
                        if (moreNode) {
                            let href = moreNode.attributes['href'];
                            if (href) {
                                if (!href.startsWith('http')) href = this.baseUrl + href;
                                viewMore = href;
                            }
                        }
                    }
                    let comics = [];
                    let items = list.querySelectorAll('li');
                    for (let j = 0; j < items.length; j++) {
                        let item = items[j];
                        let a = item.querySelector('a');
                        if (!a) continue;
                        let href = a.attributes['href'];
                        let comicTitle = a.attributes['title'];
                        if (!comicTitle) {
                            let t = item.querySelector('.manga-list-2-title');
                            if (t) comicTitle = t.text.trim();
                        }
                        let img = item.querySelector('img');
                        let cover = img ? (img.attributes['data-src'] || img.attributes['src']) : '';
                        let tip = item.querySelector('.manga-list-1-tip') || item.querySelector('.manga-list-2-tip');
                        let desc = tip ? tip.text.trim() : '';
                        let badgeNode = item.querySelector('.manga-list-1-cover-logo-font');
                        let badge = badgeNode ? badgeNode.text.trim() : '';

                        if (href) {
                            if (!href.startsWith('http')) href = this.baseUrl + href;
                            if (cover && !cover.startsWith('http')) {
                                if (cover.startsWith('//')) cover = 'https:' + cover;
                                else cover = this.baseUrl + cover;
                            }
                            comics.push(new Comic({
                                id: href,
                                title: comicTitle || '',
                                cover: cover || '',
                                description: desc,
                                tags: badge ? [badge] : []
                            }));
                        }
                    }
                    if (comics.length > 0) {
                        if (!title) {
                            if (comics[0].tags && comics[0].tags.length > 0) title = comics[0].tags[0];
                            else title = '漫画列表';
                        }
                        let part = { title: title, comics: comics };
                        if (viewMore) part.viewMore = viewMore;
                        parts.push(part);
                    }
                }

                // 转换为对象
                let result = {};
                for (let part of parts) {
                    result[part.title] = part.comics;
                }
                return result;
            }
            // 删除 loadNext
        }
    ];

    // ==================== 分类 ====================
    category = {
        title: "极速漫画",
        parts: [
            {
                name: "类型",
                type: "fixed",
                itemType: "category",
                categories: [
                    "全部", "热血", "恋爱", "校园", "伪娘", "冒险", "职场", "后宫",
                    "治愈", "科幻", "轻小说", "励志", "生活", "战争", "悬疑", "推理",
                    "搞笑", "奇幻", "魔法", "神鬼", "萌系", "历史", "美食", "同人",
                    "运动", "绅士", "机甲", "百合"
                ],
                categoryParams: [
                    "", "31", "26", "1", "5", "2", "6", "8",
                    "9", "25", "156", "10", "11", "12", "17", "33",
                    "37", "14", "15", "20", "21", "4", "7", "30",
                    "34", "36", "40", "3"
                ]
            }
        ],
        enableRankingPage: false
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            let tag = param || '';
            let statusOpt = (options && options[0]) ? options[0].split('-')[0] : '';
            let sortOpt = (options && options[1]) ? options[1].split('-')[0] : '';

            let path = 'manhua-list';
            if (tag) path += `-tag${tag}`;
            if (statusOpt) path += `-${statusOpt}`;
            if (sortOpt) path += `-${sortOpt}`;

            let url = `${this.baseUrl}/${path}/dm5.ashx`;
            let pageIndex = Math.max(0, (parseInt(page) || 1));
            let pageSize = 21;
            let statusNum = 0;
            if (statusOpt && statusOpt.startsWith('st')) {
                let m = statusOpt.match(/st(\d+)/);
                if (m) statusNum = parseInt(m[1]);
            }
            let sortNum = 0;
            if (sortOpt && sortOpt.startsWith('s')) {
                let m = sortOpt.match(/s(\d+)/);
                if (m) sortNum = parseInt(m[1]);
            }
            let tagId = tag && tag.length > 0 ? tag : '0';

            let body = `action=getclasscomics&pageindex=${pageIndex}&pagesize=${pageSize}&categoryid=0&tagid=${encodeURIComponent(tagId)}&status=${statusNum}&usergroup=0&pay=-1&areaid=0&sort=${sortNum}&iscopyright=0`;

            let categoryHeaders = {
                'accept': 'application/json, text/javascript, */*; q=0.01',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'host': 'm.1kkk.com',
                'origin': this.baseUrl,
                'pragma': 'no-cache',
                'referer': `${this.baseUrl}/${path}/`,
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                'x-requested-with': 'XMLHttpRequest'
            };

            let res = await Network.post(url, categoryHeaders, body);
            if (res.status !== 200) throw `加载分类漫画失败: ${res.status}`;

            let data = {};
            try { data = JSON.parse(res.body || '{}'); } catch (e) { throw '解析分类返回数据失败'; }

            let items = data.UpdateComicItems || [];
            let comics = items.map(it => {
                let id = it.UrlKey ? `/${it.UrlKey}/` : (it.ID ? `/m${it.ID}/` : '');
                let cover = it.ShowPicUrlB || it.ShowConver || '';
                if (cover && cover.startsWith('//')) cover = 'https:' + cover;
                if (cover && !cover.startsWith('http')) cover = this.baseUrl + cover;
                let tags = [];
                if (it.Author && Array.isArray(it.Author)) tags = it.Author.slice(0, 3);
                return new Comic({
                    id: id,
                    title: it.Title,
                    cover: cover,
                    description: it.Content || '',
                    tags: tags
                });
            });

            let perPage = items.length || 20;
            let total = data.Count || 0;
            let maxPage = perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : (comics.length > 0 ? page + 1 : page);
            return { comics, maxPage: maxPage + 1 };
        },

        optionList: [
            {
                type: 'select',
                label: '状态',
                options: ['st0-全部', 'st1-连载', 'st2-已完结'],
                default: 'st0'
            },
            {
                type: 'select',
                label: '排序',
                options: ['s2-最近更新', 's10-人气最旺', 's18-最近上架'],
                default: 's2'
            }
        ]
    };

    // ==================== 搜索 ====================
    search = {
        load: async (keyword, options, page) => {
            let url = `${this.baseUrl}/search?title=${encodeURIComponent(keyword)}&language=1&page=${page}`;
            let res = await Network.get(url, this._buildHeaders());
            if (res.status !== 200) throw `Search failed: ${res.status}`;

            let doc = new HtmlDocument(res.body);
            let comics = [];
            let list = doc.querySelectorAll('.book-list > li');

            for (let item of list) {
                let link = item.querySelector('.book-list-info > a');
                let href = link?.attributes['href'];
                if (!href) continue;
                if (!href.startsWith('http')) href = this.baseUrl + href;

                let title = item.querySelector('.book-list-info-title')?.text?.trim();
                let coverEl = item.querySelector('.book-list-cover-img');
                let cover = coverEl?.attributes['src'];
                if (cover) {
                    if (cover.startsWith('//')) cover = 'https:' + cover;
                    else if (!cover.startsWith('http')) cover = this.baseUrl + cover;
                }
                let desc = item.querySelector('.book-list-info-desc')?.text?.trim();
                let tags = [];
                let tagEls = item.querySelectorAll('.book-list-info-bottom-item');
                for (let t of tagEls) tags.push(t.text.trim());
                let status = item.querySelector('.book-list-info-bottom-right-font')?.text?.trim();
                if (status) tags.push(status);

                comics.push(new Comic({
                    id: href,
                    title: title,
                    cover: cover,
                    description: desc,
                    tags: tags
                }));
            }

            let maxPage = comics.length > 0 ? page + 1 : page;
            return { comics, maxPage };
        },
        optionList: [],
        enableTagsSuggestions: false
    };

    // ==================== 漫画详情 ====================
    comic = {
        loadInfo: async (id) => {
            if (!id || typeof id !== 'string') throw "ID不能为空";

            let targetUrl = id;
            if (!targetUrl.startsWith('http')) {
                if (targetUrl.startsWith('/')) targetUrl = this.baseUrl + targetUrl;
                else targetUrl = this.baseUrl + '/' + targetUrl;
            }

            let res = await Network.get(targetUrl, this._buildHeaders());
            if (res.status !== 200) throw `请求失败，状态码: ${res.status}，URL: ${targetUrl}`;

            let html = res.body || '';
            this.comic.id = id;

            let toAbsUrl = (value) => {
                if (!value) return '';
                let trimmed = value.trim();
                if (trimmed.startsWith('http')) return trimmed;
                if (trimmed.startsWith('//')) return 'https:' + trimmed;
                if (trimmed.startsWith('/')) return this.baseUrl + trimmed;
                return this.baseUrl + '/' + trimmed;
            };

            let doc = new HtmlDocument(html);

            let title = doc.querySelector('p.detail-main-info-title')?.text?.trim()
                || doc.querySelector('span.normal-top-title')?.text?.trim()
                || doc.querySelector('title')?.text?.trim()?.replace(/漫画.*$/i, '')
                || '未知标题';

            let coverEl = doc.querySelector('.detail-main-cover img')
                || doc.querySelector('.detail-main-cover .cover-img img');
            let cover = toAbsUrl(coverEl?.attributes?.src || coverEl?.attributes?.['data-src'] || '');

            let authorContainer = doc.querySelector('.detail-main-info-author');
            let author = '未知作者';
            if (authorContainer) {
                let authors = [];
                let links = authorContainer.querySelectorAll('a') || [];
                for (let i = 0; i < links.length; i++) {
                    let text = links[i].text?.trim();
                    if (text) authors.push(text);
                }
                if (authors.length > 0) author = authors.join('，');
                else {
                    let raw = authorContainer.text?.replace(/作者[:：]/, '').trim();
                    if (raw) author = raw;
                }
            } else {
                let metaAuthor = doc.querySelector('meta[name="Author"]')?.attributes?.content;
                if (metaAuthor) {
                    author = metaAuthor.includes(':') ? metaAuthor.split(':').pop().trim() : metaAuthor.trim();
                }
            }

            let status = doc.querySelector('.detail-list-title-1')?.text?.trim() || '未知状态';
            let descriptionEl = doc.querySelector('.detail-desc');
            let description = descriptionEl?.text?.trim() || '';
            if (!description) description = doc.querySelector('meta[name="Description"]')?.attributes?.content || '';

            let tags = [];
            let tagElements = doc.querySelectorAll('.detail-main-info-class a') || [];
            for (let i = 0; i < tagElements.length; i++) {
                let tagText = tagElements[i].text?.trim();
                if (tagText) tags.push(tagText);
            }

            let updateTime = doc.querySelector('.detail-list-title-3')?.text?.trim() || '';
            let starValue = null;
            let starElement = doc.querySelector('.detail-main-info-star');
            if (starElement && starElement.attributes && starElement.attributes['class']) {
                let starClass = starElement.attributes['class'];
                let match = starClass.match(/star-(\d+)/i);
                if (match && match[1]) {
                    let num = parseInt(match[1], 10);
                    if (!isNaN(num)) starValue = num;
                }
            }

            let chapters = new Map();
            let selectorItems = doc.querySelectorAll('.detail-selector .detail-selector-item');
            if (selectorItems.length > 0) {
                for (let item of selectorItems) {
                    let groupName = item.text?.trim();
                    if (!groupName || groupName.includes('评论')) continue;
                    let onclick = item.attributes['onclick'];
                    let listId = null;
                    if (onclick) {
                        let match = onclick.match(/titleSelect\(.*?,.*?, *['"](.*?)['"]\)/);
                        if (match) listId = match[1];
                    }
                    if (listId) {
                        let listEl = doc.getElementById(listId);
                        if (listEl) {
                            let groupChapters = new Map();
                            let links = listEl.querySelectorAll('a.chapteritem');
                            for (let link of links) {
                                let href = link.attributes['href'];
                                let title = link.text?.trim() || link.attributes['title']?.trim();
                                if (href && title) {
                                    if (!href.startsWith('http')) href = toAbsUrl(href);
                                    groupChapters.set(href, title);
                                }
                            }
                            if (groupChapters.size > 0) chapters.set(groupName, groupChapters);
                        }
                    }
                }
            }

            if (chapters.size === 0) {
                let groupChapters = new Map();
                let links = doc.querySelectorAll('a.chapteritem');
                for (let link of links) {
                    let href = link.attributes['href'];
                    let title = link.text?.trim() || link.attributes['title']?.trim();
                    if (href && title) {
                        if (!href.startsWith('http')) href = toAbsUrl(href);
                        groupChapters.set(href, title);
                    }
                }
                if (groupChapters.size > 0) chapters.set('连载', groupChapters);
            }

            let parseRecommends = (htmlContent) => {
                let recs = [];
                let recPattern = /<li[^>]*class=["'][^"']*(?:list-comic|rec|recommend)[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*>[^<]*<\/a>[\s\S]*?<a[^>]*>\s*([^<]+)\s*<\/a>/gi;
                let m;
                let count = 0;
                while ((m = recPattern.exec(htmlContent)) !== null && count < 12) {
                    let url = m[1];
                    let cover = m[2];
                    let titleText = (m[3] || '').trim();
                    if (!url || !titleText) continue;
                    if (!url.startsWith('http')) url = toAbsUrl(url);
                    if (cover && !cover.startsWith('http')) cover = toAbsUrl(cover);
                    recs.push(new Comic({ id: url, title: titleText, cover: cover }));
                    count++;
                }
                return recs;
            };

            let recommends = parseRecommends(html);

            let midMatch = html.match(/mid["\s:]*(\d+)/i) || html.match(/var mid = (\d+)/i) || html.match(/mid=(\d+)/i) || html.match(/var DM5_MID = (\d+)/i) || html.match(/var COMIC_MID=(\d+)/i);
            if (midMatch) this.comic.mid = parseInt(midMatch[1]);

            const detailUrl = targetUrl;

            return new ComicDetails({
                title,
                cover,
                description: description || '暂无描述',
                tags: {
                    '作者': [author || '未知作者'],
                    '状态': [status || '未知状态'],
                    '标签': tags
                },
                chapters: chapters,
                recommend: recommends,
                updateTime: updateTime,
                stars: starValue,
                subId: this.comic.mid ? this.comic.mid.toString() : '73225',
                url: detailUrl
            });
        },

        loadEp: async (comicId, epId) => {
            let url = `${epId}/`;
            let res = await Network.get(url, this._buildHeaders());
            if (res.status !== 200) throw new Error('获取章节内容失败: ' + res.status);
            let html = res.body;
            let document = new HtmlDocument(html);
            let scripts = document.querySelectorAll("script");
            let script = null;
            for (let s of scripts) {
                if (s.innerHTML.includes('eval(function(p,a,c,k,e,d)')) {
                    script = s.innerHTML;
                    break;
                }
            }
            if (!script) throw ('无法显示付费内容/章节不存在');

            let pStart = script.indexOf("}('") + 3;
            let boundaryMatch = script.substring(pStart).match(/',(\d+),(\d+),'/);
            if (!boundaryMatch) throw new Error('无法解析脚本参数边界');
            let boundaryIndex = boundaryMatch.index + pStart;
            let rawP = script.substring(pStart, boundaryIndex);
            let a = parseInt(boundaryMatch[1]);
            let c = parseInt(boundaryMatch[2]);
            let kContentStart = boundaryIndex + boundaryMatch[0].length;
            let kEnd = script.indexOf("'.split", kContentStart);
            let rawK = script.substring(kContentStart, kEnd);
            let dict = rawK.split('|');

            let decrypt = (p, a, c, k) => {
                let e = (c) => (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
                let d = {};
                while (c--) d[e(c)] = k[c] || e(c);
                return p.replace(/\b\w+\b/g, w => d[w] || w);
            };

            let decrypted = decrypt(rawP, a, c, dict);
            let arrayMatch = decrypted.match(/\[(.*?)\]/);
            if (!arrayMatch) throw new Error('无法从解密后的脚本中提取图片数组');
            let arrayContent = arrayMatch[1];
            let images = arrayContent.split(',').map(item => {
                return item.trim().replace(/^\\?['"]|\\?['"]$/g, '');
            }).filter(url => url && url.startsWith('http'));
            return { images };
        },

        onImageLoad: (url, comicId, epId) => {
            let referer = '';
            if (epId && typeof epId === 'string') {
                if (!epId.startsWith('http')) referer = this.baseUrl + epId;
                else referer = epId;
            } else {
                referer = this.baseUrl + '/';
            }
            return {
                headers: this._buildImageHeaders(url, referer)
            };
        },

        onThumbnailLoad: (url) => {
            return {
                headers: this._buildImageHeaders(url, this.baseUrl + '/')
            };
        },

        likeComic: async (id, isLike) => { /* 暂不实现 */ },

        loadComments: async (comicId, subId, page, replyTo) => {
            if (!subId) throw new Error('漫画ID未找到，无法加载评论');
            let requestPage = page;
            let targetCommentId = null;
            if (replyTo) {
                let parts = replyTo.split('//');
                targetCommentId = parts[0];
                requestPage = parseInt(parts[1]);
            }

            let url = `${this.baseUrl}/manhua-${comicId}/pagerdata.ashx`;
            let params = {
                d: Date.now(),
                pageindex: (requestPage - 1),
                pagesize: 767,
                mid: subId,
                t: 4
            };
            let query = Object.keys(params).map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
            url += '?' + query;

            let headers = {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'host': 'm.1kkk.com',
                'pragma': 'no-cache',
                'referer': `${this.baseUrl}/manhua-${comicId}/`,
                'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
                'x-requested-with': 'XMLHttpRequest'
            };

            let res = await Network.get(url, headers);
            if (res.status !== 200) throw new Error(`加载评论失败，状态码: ${res.status}`);
            let data = JSON.parse(res.body);
            let comments = [];
            let maxPage = 0;
            if (replyTo) {
                let target = data.find(item => item.Id.toString() === targetCommentId);
                if (target && target.ToPostShowDataItems) {
                    comments = target.ToPostShowDataItems.map(item => new Comment({
                        id: item.Id.toString(),
                        userName: item.Poster,
                        content: item.PostContent,
                        time: item.PostTime,
                        avatar: item.HeadUrl,
                        likeCount: item.PraiseCount,
                        isLiked: item.IsPraise,
                        replyCount: 0
                    }));
                }
            } else {
                comments = data.map(item => new Comment({
                    id: `${item.Id}//${page}`,
                    userName: item.Poster,
                    content: item.PostContent,
                    time: item.PostTime,
                    avatar: item.HeadUrl,
                    likeCount: item.PraiseCount,
                    isLiked: item.IsPraise,
                    replyCount: item.ToPostShowDataItems ? item.ToPostShowDataItems.length : 0
                }));
                maxPage = (comments.length === 0) ? page : null;
            }
            return { comments, maxPage: replyTo ? 1 : maxPage };
        },

        loadChapterComments: async (comicId, epId, page, replyTo) => {
            let cidMatch = epId.match(/m(\d+)/);
            let cid = cidMatch ? cidMatch[1] : null;
            if (!cid) {
                let match = epId.match(/(\d+)\/?$/);
                if (match) cid = match[1];
            }
            if (!cid) return { comments: [], maxPage: page };

            let requestPage = page;
            let targetCommentId = null;
            if (replyTo) {
                let parts = replyTo.split('//');
                targetCommentId = parts[0];
                requestPage = parseInt(parts[1]);
            }

            let pageSize = 20;
            let url = `${this.baseUrl}/showcomment/pagerdata.ashx?d=${Date.now()}&pageindex=${requestPage}&pagesize=${pageSize}&cid=${cid}&t=9`;
            let headers = {
                'accept': '*/*',
                'accept-encoding': 'gzip, deflate, br, zstd',
                'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'cache-control': 'no-cache',
                'connection': 'keep-alive',
                'host': 'm.1kkk.com',
                'pragma': 'no-cache',
                'referer': `${this.baseUrl}/showcomment/?cid=${cid}`,
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
                'x-requested-with': 'XMLHttpRequest'
            };

            let res = await Network.get(url, headers);
            if (res.status !== 200) return { comments: [], maxPage: page };
            let data = [];
            try { data = JSON.parse(res.body); } catch (e) { }
            if (!Array.isArray(data)) return { comments: [], maxPage: page };

            let comments = [];
            let maxPage = 0;
            if (replyTo) {
                let target = data.find(item => item.Id.toString() === targetCommentId);
                if (target && target.ToPostShowDataItems) {
                    comments = target.ToPostShowDataItems.map(item => new Comment({
                        id: item.Id.toString(),
                        userName: item.Poster,
                        content: item.PostContent,
                        time: item.PostTime,
                        avatar: item.HeadUrl,
                        likeCount: item.PraiseCount,
                        isLiked: item.IsPraise,
                        replyCount: 0
                    }));
                }
            } else {
                comments = data.map(item => new Comment({
                    id: `${item.Id}//${page}`,
                    userName: item.Poster,
                    content: item.PostContent,
                    time: item.PostTime,
                    avatar: item.HeadUrl,
                    likeCount: item.PraiseCount,
                    isLiked: item.IsPraise,
                    replyCount: item.ToPostShowDataItems ? item.ToPostShowDataItems.length : 0
                }));
                maxPage = (comments.length === 0) ? page : null;
            }
            return { comments, maxPage: replyTo ? 1 : maxPage };
        },

        // ===== 修复链接解析跳转 =====
        link: {
            domains: ["m.1kkk.com"],
            linkToId: (url) => {
                // 匹配 /manhua20802/ 或 /manhua-20802/ 格式
                let match = url.match(/\/manhua-?\d+(?:\/|$)/);
                if (match) return match[0];
                // 匹配 /m20802/ 格式
                match = url.match(/\/m\d+(?:\/|$)/);
                if (match) return match[0];
                return null;
            }
        }
    };
}