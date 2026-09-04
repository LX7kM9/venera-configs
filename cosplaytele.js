class CosplayTele extends ComicSource {
    name = "CosplayTele"
    key = "cosplaytele"
    version = "1.7.5"   // 改用 REST API 提取封面，确保与发现页一致
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/cosplaytele.js"
    base = "https://cosplaytele.com"

    // ---------- 工具：解码 HTML 实体 ----------
    decodeHtmlEntities(str) {
        if (!str) return str;
        return str
            .replace(/&#8211;/g, '–')
            .replace(/&#8220;/g, '“')
            .replace(/&#8221;/g, '”')
            .replace(/&#8216;/g, '‘')
            .replace(/&#8217;/g, '’')
            .replace(/&#8226;/g, '•')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&nbsp;/g, ' ');
    }

    pageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": this.base + "/",
        }
    }

    safeQueryAll(doc, selector) {
        try {
            var result = doc.querySelectorAll(selector)
            return result || []
        } catch (e) {
            return []
        }
    }

    safeQuery(doc, selector) {
        try {
            return doc.querySelector(selector) || null
        } catch (e) {
            return null
        }
    }

    // ---------- 封面提取辅助 ----------
    isDefaultPlaceholder(url) {
        if (!url) return true;
        // 已知默认图片特征
        return url.indexOf("293172358_1027749337945791_5526464405172981062_n.png") !== -1
            || url.indexOf("default") !== -1
            || url.match(/\/uploads\/\d{4}\/\d{2}\/default/i) !== null;
    }

    // ---------- 解析搜索结果的 HTML ----------
    parseSearchResults(html, totalCount) {
        var c = []
        var itemRe = /<div class='item asl_r_pagepost asl_r_pagepost_\d+ asl_r_post'>([\s\S]*?)<\/div>\s*<div class='clear'><\/div>\s*<\/div>/g
        var itemMatch
        while ((itemMatch = itemRe.exec(html)) !== null) {
            var itemHtml = itemMatch[1]
            var imgRe = /<img[^>]+src=['"]([^'"]+)['"]/
            var imgMatch = imgRe.exec(itemHtml)
            var cover = imgMatch ? imgMatch[1].replace(/\\\//g, "/") : ""
            var linkRe = /<a class="asl_res_url" href='([^']+)'>([\s\S]*?)<\/a>/
            var linkMatch = linkRe.exec(itemHtml)
            if (!linkMatch) continue
            var href = linkMatch[1].replace(/\\\//g, "/")
            var title = linkMatch[2].replace(/<[^>]+>/g, "").replace(/&#8211;/g, "-").replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d").trim()
            var slug = href.replace("https://cosplaytele.com/", "").replace(/\/$/, "")
            if (slug && title) {
                c.push({id: slug, title: this.decodeHtmlEntities(title), cover: cover})
            }
        }
        if (c.length === 0) {
            var simpleRe = /<a class="asl_res_url" href='([^']+)'>([\s\S]*?)<\/a>/g
            var simpleMatch
            while ((simpleMatch = simpleRe.exec(html)) !== null) {
                var href = simpleMatch[1].replace(/\\\//g, "/")
                var title = simpleMatch[2].replace(/<[^>]+>/g, "").replace(/&#8211;/g, "-").replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d").trim()
                var slug = href.replace("https://cosplaytele.com/", "").replace(/\/$/, "")
                if (slug && title) {
                    c.push({id: slug, title: this.decodeHtmlEntities(title), cover: ""})
                }
            }
        }
        var maxPage = Math.ceil(totalCount / 10) || 1
        return {comics: c, maxPage: maxPage}
    }

    // 解析热门文章列表
    parsePopularList(html) {
        var c = []
        var itemRe = /<li[^>]*>([\s\S]*?)<\/li>/g
        var itemMatch
        while ((itemMatch = itemRe.exec(html)) !== null) {
            var itemHtml = itemMatch[1]
            var imgRe = /<img[^>]+src=["']([^"']+)["']/
            var imgMatch = imgRe.exec(itemHtml)
            var cover = imgMatch ? imgMatch[1] : ""
            var linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*class=["']wpp-post-title["'][^>]*>([\s\S]*?)<\/a>/
            var linkMatch = linkRe.exec(itemHtml)
            if (!linkMatch) {
                linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g
                var links = []
                while ((linkMatch = linkRe.exec(itemHtml)) !== null) {
                    links.push(linkMatch)
                }
                if (links.length >= 2) {
                    var href = links[1][1]
                    var title = links[1][2].replace(/<[^>]+>/g, "").trim()
                } else if (links.length >= 1) {
                    var href = links[0][1]
                    var title = links[0][2].replace(/<[^>]+>/g, "").trim()
                } else {
                    continue
                }
            } else {
                var href = linkMatch[1]
                var title = linkMatch[2].replace(/<[^>]+>/g, "").trim()
            }
            var slug = href.replace("https://cosplaytele.com/", "").replace(/\/$/, "")
            if (slug && title) {
                c.push({id: slug, title: this.decodeHtmlEntities(title), cover: cover})
            }
        }
        return {comics: c, maxPage: 1}
    }

    // ============ 搜索 ============
    search = {
        load: (k, o, p) => {
            var body = "action=ajaxsearchlite_search&aslp=" + encodeURIComponent(k) + "&asid=1&options=customset%5B%5D%3Dpost%26asl_gen%5B%5D%3Dtitle%26qtranslate_lang%3D0%26filters_initial%3D1%26filters_changed%3D0&asl_req_json=1"
            return Network.post("https://cosplaytele.com/wp-admin/admin-ajax.php", {
                "Content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept": "text/html"
            }, body).then((r) => {
                if (r.status !== 200) throw "err"
                var json = JSON.parse(r.body)
                return this.parseSearchResults(json.html, json.full_results_count || 0)
            }).catch(() => {
                return {comics: [], maxPage: 1}
            })
        },
        optionList: []
    }

    // ============ 解析 Top View 列表 ============
    parseTopList(html) {
        var c = []
        var itemRe = /<li[^>]*>([\s\S]*?)<\/li>/g
        var itemMatch
        while ((itemMatch = itemRe.exec(html)) !== null) {
            var itemHtml = itemMatch[1]
            var imgRe = /<img[^>]+src=["']([^"']+)["']/
            var imgMatch = imgRe.exec(itemHtml)
            var cover = imgMatch ? imgMatch[1] : ""
            var linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*class=["']wpp-post-title["'][^>]*>([\s\S]*?)<\/a>/
            var linkMatch = linkRe.exec(itemHtml)
            if (!linkMatch) {
                linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/g
                var links = []
                while ((linkMatch = linkRe.exec(itemHtml)) !== null) {
                    links.push(linkMatch)
                }
                if (links.length >= 2) {
                    var href = links[1][1]
                    var title = links[1][2].replace(/<[^>]+>/g, "").trim()
                } else if (links.length >= 1) {
                    var href = links[0][1]
                    var title = links[0][2].replace(/<[^>]+>/g, "").trim()
                } else {
                    continue
                }
            } else {
                var href = linkMatch[1]
                var title = linkMatch[2].replace(/<[^>]+>/g, "").trim()
            }
            var slug = href.replace("https://cosplaytele.com/", "").replace(/\/$/, "")
            if (slug && title) {
                c.push({id: slug, title: this.decodeHtmlEntities(title), cover: cover})
            }
        }
        return {comics: c, maxPage: 1}
    }

    // ============ 分类 ============
    category = {
        title: "CosplayTele",
        parts: [
            {
                name: "内容类型",
                type: "fixed",
                itemType: "category",
                categories: ["Cosplay Nude", "Cosplay Ero", "Video Cosplay", "Cosplay", "AI Art", "Only Video"],
                categoryParams: ["cosplay-nude", "cosplay-ero", "video-cosplayy", "cosplay", "ai-art", "only-video"],
            },
            {
                name: "游戏作品",
                type: "fixed",
                itemType: "category",
                categories: ["Genshin Impact", "Azur Lane", "Fate/Grand Order", "Wuthering Waves", "Honkai:Star Rail", "NIKKE", "Zenless Zone Zero", "Blue Archive", "League Of Legends", "Final Fantasy", "Arknights"],
                categoryParams: ["genshin-impact", "azur-lane", "fate-grand-order", "wuthering-waves", "honkai-star-rail", "nikke", "zenless-zone-zero", "blue-archive", "league-of-legends", "final-fantasy", "arknights"],
            },
            {
                name: "动漫作品",
                type: "fixed",
                itemType: "category",
                categories: ["Re:Zero", "NieR:Automata", "Sono Bisque Doll", "Spy x Family", "Dead or Alive", "Chainsaw Man", "Demon Slayer", "Evangelion", "Bocchi The Rock", "Overlord"],
                categoryParams: ["rezero", "nierautomata", "sono-bisque-doll", "spy-x-family", "dead-or-alive", "chainsaw-man", "kimetsu-no-yaiba", "evangelion", "bocchi-the-rock", "overlord"],
            },
            {
                name: "Cosplay Freestyle",
                type: "fixed",
                itemType: "category",
                categories: ["Maid", "School Girl", "ELF", "Nun", "Nurse", "Miko", "Cheongsam", "Hololive", "Devil", "Kimono", "Bunny Girl", "Hatsune Miku"],
                categoryParams: ["maid", "school-girl", "elf", "nun", "nurse", "miko", "cheongsam", "hololive", "devil", "kimono", "bunny-girl", "hatsune-miku"],
            },
            {
                name: "Best Cosplayer",
                type: "fixed",
                itemType: "category",
                categories: ["Machi馬吉", "ChuChu Magic", "Tiny Asa", "水淼Aqua", "铃木美咲", "Byoru", "Umeko J", "咬一口兔娘ovo", "小丁", "Minami", "Rioko", "你的小狗", "DemiFairyTW", "Tokar 浵卡", "阿薰kaOri", "米胡桃MeeHutao", "Bangni邦尼", "Arty Huang", "PoppaChan", "Nekokoyoshi", "Meenfox", "九言", "Hoshilily", "软萌兔兔酱"],
                categoryParams: ["machi", "chuchu-magic", "tiny-asababy", "aqua", "misaki-suzuki", "byoru", "umeko-j", "sticky-bunny", "xiao-ding", "minami", "rioko", "puppyporn090", "demifairytw", "tokar", "axunkaorii", "meehutao69", "bangni", "artyhuang", "poppachan", "nekokoyoshi", "meenfox", "jiu-yan", "hoshilily", "sweetrabbit233"],
            },
            {
                name: "热门时间",
                type: "fixed",
                itemType: "category",
                categories: ["Top 24 Hours", "Top 3 Days", "Top 7 Days"],
                categoryParams: ["top-24h", "top-3d", "top-7d"],
            }
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: (cat, param, options, p) => {
            if (param.indexOf("top-") === 0) {
                var rangeMap = {"top-24h": "daily", "top-3d": "daily", "top-7d": "weekly"}
                var timeQtyMap = {"top-24h": 24, "top-3d": 72, "top-7d": 168}
                var range = rangeMap[param] || "daily"
                var timeQty = timeQtyMap[param] || 24
                var requestBody = JSON.stringify({
                    title: "", limit: "20", offset: 0, range: range, time_quantity: timeQty, time_unit: "hour",
                    freshness: false, order_by: "views", post_type: "post", pid: "", exclude: "", cat: "",
                    taxonomy: "category", term_id: "", author: "",
                    shorten_title: {active: false, length: 0, words: false},
                    "post-excerpt": {active: false, length: 0, keep_format: false, words: false},
                    thumbnail: {active: true, build: "manual", width: "1920", height: "1080"},
                    rating: false, stats_tag: {comment_count: false, views: "1", author: false, date: {active: false, format: "F j, Y"}, category: false, taxonomy: {active: false, name: "category"}},
                    markup: {custom_html: true, "wpp-start": "<ul class=\"wpp-list\">", "wpp-end": "</ul>", "title-start": "<h2>", "title-end": "</h2>", "post-html": "<li class=\"{current_class}\">{thumb} {title} <span class=\"wpp-meta post-stats\">{stats}</span><p class=\"wpp-excerpt\">{excerpt}</p></li>"},
                    theme: {name: ""}
                })
                return Network.post("https://cosplaytele.com/wp-json/wordpress-popular-posts/v2/widget", {
                    "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json", "X-WP-Nonce": "848c6cd23e"
                }, requestBody).then((r) => {
                    if (r.status !== 200) throw "err"
                    var json = JSON.parse(r.body)
                    return this.parseTopList(json.widget || "")
                }).catch(() => {
                    return {comics: [], maxPage: 1}
                })
            }
            var catMap = {
                "cosplay-nude": {id: 193, type: "category"}, "free-style": {id: 400, type: "category"},
                "cosplay-ero": {id: 194, type: "category"}, "game": {id: 398, type: "category"},
                "video-cosplayy": {id: 850, type: "category"}, "anime": {id: 399, type: "category"},
                "cosplay": {id: 363, type: "category"}, "ai-art": {id: 589, type: "category"},
                "only-video": {id: 1124, type: "category"},
                "genshin-impact": {id: 23, type: "category"}, "azur-lane": {id: 43, type: "category"},
                "fate-grand-order": {id: 153, type: "category"},
                "wuthering-waves": {id: 1135, type: "tag"}, "honkai-star-rail": {id: 779, type: "tag"},
                "nikke": {id: 416, type: "tag"}, "zenless-zone-zero": {id: 1112, type: "tag"},
                "blue-archive": {id: 211, type: "tag"}, "league-of-legends": {id: 121, type: "tag"},
                "final-fantasy": {id: 130, type: "tag"}, "arknights": {id: 315, type: "tag"},
                "xiuren": {id: 946, type: "category"}, "pure-media": {id: 955, type: "category"},
                "fantasy-factory": {id: 63, type: "category"},
                "rezero": {id: 197, type: "tag"}, "nierautomata": {id: 133, type: "tag"},
                "sono-bisque-doll": {id: 89, type: "tag"}, "spy-x-family": {id: 126, type: "tag"},
                "dead-or-alive": {id: 237, type: "tag"}, "chainsaw-man": {id: 378, type: "tag"},
                "kimetsu-no-yaiba": {id: 59, type: "tag"}, "evangelion": {id: 260, type: "tag"},
                "bocchi-the-rock": {id: 470, type: "tag"}, "overlord": {id: 305, type: "tag"},
                "maid": {id: 693, type: "tag"}, "school-girl": {id: 739, type: "tag"},
                "elf": {id: 707, type: "tag"}, "nun": {id: 672, type: "tag"},
                "nurse": {id: 700, type: "tag"}, "miko": {id: 230, type: "tag"},
                "cheongsam": {id: 726, type: "tag"}, "hololive": {id: 228, type: "tag"},
                "devil": {id: 710, type: "tag"}, "kimono": {id: 719, type: "tag"},
                "bunny-girl": {id: 742, type: "tag"}, "hatsune-miku": {id: 259, type: "tag"},
                "machi": {id: 1023, type: "category"}, "chuchu-magic": {id: 1171, type: "category"},
                "tiny-asababy": {id: 852, type: "category"}, "misaki-suzuki": {id: 702, type: "category"},
                "minami": {id: 1183, type: "category"},
                "puppyporn090": {id: 1172, type: "category"}, "demifairytw": {id: 1141, type: "category"},
                "tokar": {id: 733, type: "category"}, "axunkaorii": {id: 971, type: "category"},
                "meehutao69": {id: 1179, type: "category"}, "bangni": {id: 1138, type: "category"},
                "poppachan": {id: 347, type: "category"}, "nekokoyoshi": {id: 22, type: "category"},
                "meenfox": {id: 429, type: "category"}, "hoshilily": {id: 41, type: "category"},
                "sweetrabbit233": {id: 803, type: "category"}
            }
            var info = catMap[param] || {id: 193, type: "category"}
            var url = ""
            if (info.type === "tag") {
                url = "https://cosplaytele.com/wp-json/wp/v2/posts?tags=" + info.id + "&page=" + p + "&per_page=20&_embed"
            } else {
                url = "https://cosplaytele.com/wp-json/wp/v2/posts?categories=" + info.id + "&page=" + p + "&per_page=20&_embed"
            }
            return Network.get(url, {}).then((r) => {
                if (r.status !== 200) throw "err"
                var posts = JSON.parse(r.body)
                var c = []
                for (var i = 0; i < posts.length; i++) {
                    var post = posts[i]
                    var slug = post.slug || ""
                    var title = post.title ? post.title.rendered : ""
                    title = title.replace(/<[^>]+>/g, "").replace(/&#8211;/g, "-").replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d").trim()
                    var cover = ""
                    if (post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0]) {
                        cover = post._embedded["wp:featuredmedia"][0].source_url || ""
                    }
                    if (slug && title) {
                        c.push({id: slug, title: this.decodeHtmlEntities(title), cover: cover})
                    }
                }
                var maxPage = p
                try {
                    if (r.headers && r.headers["x-wp-totalpages"]) {
                        maxPage = parseInt(r.headers["x-wp-totalpages"]) || 1
                    } else if (r.responseHeaders) {
                        var hdrs = r.responseHeaders
                        var tpMatch = hdrs.match(/x-wp-totalpages:\s*(\d+)/i)
                        if (tpMatch) maxPage = parseInt(tpMatch[1]) || 1
                    }
                } catch (e) {}
                if (maxPage === p) {
                    if (c.length < 20) {
                        maxPage = p
                    } else {
                        maxPage = 500
                    }
                }
                return {comics: c, maxPage: maxPage}
            }).catch(() => {
                return {comics: [], maxPage: p}
            })
        }
    }

    // ============ 大厅（最新） ============
    explore = [
        {
            title: "Cosplaytele",
            type: "multiPageComicList",
            load: (p) => {
                var url = "https://cosplaytele.com/wp-json/wp/v2/posts?page=" + p + "&per_page=20&_embed&orderby=date&order=desc"
                return Network.get(url, {}).then((r) => {
                    if (r.status !== 200) throw "err"
                    var posts = JSON.parse(r.body)
                    var c = []
                    for (var i = 0; i < posts.length; i++) {
                        var post = posts[i]
                        var slug = post.slug || ""
                        var title = post.title ? post.title.rendered : ""
                        title = title.replace(/<[^>]+>/g, "").replace(/&#8211;/g, "-").replace(/&#8220;/g, "\u201c").replace(/&#8221;/g, "\u201d").trim()
                        var cover = ""
                        if (post._embedded && post._embedded["wp:featuredmedia"] && post._embedded["wp:featuredmedia"][0]) {
                            cover = post._embedded["wp:featuredmedia"][0].source_url || ""
                        }
                        if (slug && title) {
                            c.push({id: slug, title: this.decodeHtmlEntities(title), cover: cover})
                        }
                    }
                    var maxPage = p
                    try {
                        if (r.headers && r.headers["x-wp-totalpages"]) {
                            maxPage = parseInt(r.headers["x-wp-totalpages"]) || 1
                        } else if (r.responseHeaders) {
                            var hdrs = r.responseHeaders
                            var tpMatch = hdrs.match(/x-wp-totalpages:\s*(\d+)/i)
                            if (tpMatch) maxPage = parseInt(tpMatch[1]) || 1
                        }
                    } catch (e) {}
                    if (maxPage === p) {
                        if (c.length < 20) {
                            maxPage = p
                        } else {
                            maxPage = 500
                        }
                    }
                    return {comics: c, maxPage: maxPage}
                }).catch(() => {
                    return {comics: [], maxPage: p}
                })
            }
        }
    ]

    // ============ 详情 / 图片 ============
    comic = {
        // 校验 ID 格式（小写字母、数字、连字符）
        idMatch: "^[a-z0-9-]+$",

        // 生成分享链接
        getShareLink: (id) => {
            return `https://cosplaytele.com/${id}/`
        },

        loadInfo: (id) => {
            var self = this
            var url = "https://cosplaytele.com/" + id + "/"
            // 先请求 HTML 获取基本信息，同时尝试从 HTML 提取封面（非默认图）
            return Network.get(url, self.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                var body = r.body
                var title = ""
                var titleM = body.match(/<meta property="og:title" content="([^"]+)"/)
                if (titleM) title = titleM[1]
                if (!title) {
                    var h1M = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
                    if (h1M) title = h1M[1].replace(/<[^>]+>/g, "").trim()
                }
                title = self.decodeHtmlEntities(title)

                // 尝试从 HTML 提取封面（但过滤默认图）
                var cover = ""
                // 1. 尝试 og:image
                var ogMatch = body.match(/<meta property="og:image" content="([^"]+)"/)
                if (ogMatch && !self.isDefaultPlaceholder(ogMatch[1])) cover = ogMatch[1]
                // 2. 如果失败或默认图，尝试正文第一图
                if (!cover || self.isDefaultPlaceholder(cover)) {
                    var doc = new HtmlDocument(body)
                    var content = self.safeQuery(doc, ".entry-content")
                    if (content) {
                        var img = content.querySelector("img")
                        if (img) {
                            var src = img.attributes["src"] || img.attributes["data-src"] || ""
                            if (src && !self.isDefaultPlaceholder(src)) cover = src
                        }
                    }
                    doc.dispose()
                }
                // 3. 如果仍然无有效封面，则通过 REST API 获取（与发现页一致）
                if (!cover || self.isDefaultPlaceholder(cover)) {
                    // 从 HTML 中提取 REST API 链接
                    var apiMatch = body.match(/<link[^>]+rel="alternate"[^>]+type="application\/json"[^>]+href="([^"]+)"/)
                    if (apiMatch) {
                        var apiUrl = apiMatch[1]
                        // 请求 API 获取 featuredmedia
                        return Network.get(apiUrl, {}).then((apiRes) => {
                            if (apiRes.status === 200) {
                                var data = JSON.parse(apiRes.body)
                                if (data._embedded && data._embedded["wp:featuredmedia"] && data._embedded["wp:featuredmedia"][0]) {
                                    cover = data._embedded["wp:featuredmedia"][0].source_url || ""
                                }
                            }
                            // 确保最终 cover 不为空且不是默认图
                            if (cover && self.isDefaultPlaceholder(cover)) cover = ""
                            // 构建 ComicDetails
                            var shareUrl = "https://cosplaytele.com/" + id + "/"
                            return new ComicDetails({
                                id: id,
                                title: title || id,
                                cover: cover,
                                tags: {},
                                chapters: {"0": "View All Photos"},
                                url: shareUrl,
                            })
                        })
                    } else {
                        // 没有 API 链接，直接返回（可能封面为空）
                        var shareUrl = "https://cosplaytele.com/" + id + "/"
                        return new ComicDetails({
                            id: id,
                            title: title || id,
                            cover: cover,
                            tags: {},
                            chapters: {"0": "View All Photos"},
                            url: shareUrl,
                        })
                    }
                } else {
                    // 已有有效封面，直接返回
                    // 确保 URL 完整
                    if (cover.startsWith("//")) cover = "https:" + cover
                    else if (cover.startsWith("/")) cover = "https://cosplaytele.com" + cover
                    var shareUrl = "https://cosplaytele.com/" + id + "/"
                    return new ComicDetails({
                        id: id,
                        title: title || id,
                        cover: cover,
                        tags: {},
                        chapters: {"0": "View All Photos"},
                        url: shareUrl,
                    })
                }
            })
        },

        loadEp: (id, e) => {
            var url = "https://cosplaytele.com/" + id + "/"
            var self = this
            return Network.get(url, self.pageHeaders()).then((r) => {
                if (r.status !== 200) throw "err"
                var allImgs = []
                var seen = {}
                var d = new HtmlDocument(r.body)
                var content = self.safeQuery(d, ".entry-content")
                var html = ""
                if (content) {
                    html = content.innerHTML
                } else {
                    html = r.body
                }
                d.dispose()
                var cutPos = html.indexOf("Recommend For You")
                if (cutPos > 0) html = html.substring(0, cutPos)
                var re1 = /<a[^>]+data-fancybox[^>]+href=["']([^"']+)["']/g
                var m
                while ((m = re1.exec(html)) !== null) {
                    var s = m[1]
                    if (s && !seen[s] && (s.indexOf(".jpg") > 0 || s.indexOf(".png") > 0 || s.indexOf(".webp") > 0 || s.indexOf(".jpeg") > 0)) {
                        seen[s] = true
                        allImgs.push(s)
                    }
                }
                if (allImgs.length === 0) {
                    var re2 = /<img[^>]+src=["']([^"']+)["']/g
                    while ((m = re2.exec(html)) !== null) {
                        var s = m[1]
                        if (s && !seen[s] && (s.indexOf(".jpg") > 0 || s.indexOf(".png") > 0 || s.indexOf(".webp") > 0 || s.indexOf(".jpeg") > 0)) {
                            seen[s] = true
                            allImgs.push(s)
                        }
                    }
                }
                if (!allImgs.length) throw "no images"
                return {images: allImgs}
            })
        },

        // 链接解析跳转
        link: {
            domains: ["cosplaytele.com"],
            linkToId: (url) => {
                var m = url.match(/https?:\/\/cosplaytele\.com\/([^/?]+)/)
                return m ? m[1] : null
            }
        }
    }

    settings = {}
}