class Komiic extends ComicSource {
    name = "Komiic"
    key = "Komiic"
    version = "1.8.3"      // 增加详情页 url，支持复制链接
    minAppVersion = "1.0.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/Komiic.js"

    static API_BASE_DEFAULT = "https://komiic.cc"
    static REFERER = "https://komiic.cc/"
    static UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    static FAV_FOLDER_ID = "0"

    /** API 基址：根据节点选择或自定义返回 */
    _apiBase() {
        let node = this.loadSetting('node_selection');
        if (node && node !== 'custom') {
            return node.replace(/\/+$/, "");
        } else {
            let custom = this.loadSetting('custom_api') || this.loadSetting('api_mirror') || Komiic.API_BASE_DEFAULT;
            return custom.replace(/\/+$/, "");
        }
    }
    _apiUrl(path) { return this._apiBase() + path }

    /** 把图片域名从 .com 改写成 .cc */
    _imgUrl(url) {
        if (!url) return url
        return url.replace(/\.komiic\.com/g, ".komiic.cc")
    }

    /** 解析 komiic 的 expiresAt */
    _parseExpiresAt(s) {
        if (!s) return 0
        try {
            let t = s.replace(/\.(\d+)Z$/, (m, d) => '.' + d.slice(0, 3) + 'Z')
            return new Date(t).getTime() || 0
        } catch (e) { return 0 }
    }

    /** 清掉 komiic 的 cookie */
    _clearApiCookies() {
        try { Network.deleteCookies(this._apiBase()) } catch (e) { console.log(`clear cookie failed: ${e}`) }
    }

    get headers() {
        let token = this.loadData("account_token_0") || this.loadData("token");
        let headers = {
            'Referer': Komiic.REFERER,
            'User-Agent': Komiic.UA,
            'Content-Type': 'application/json',
            'http_client': 'dart:io'
        }
        if (token) headers['Authorization'] = `Bearer ${token}`
        return headers
    }

    init() {
        this._imageTicketCache = {}
        this._imageTicketUrls = {}
        this._imageTicketPromises = {}
        this._exhaustedAccounts = {}

        let oldToken = this.loadData("token");
        if (oldToken && !this.loadData("account_token_0")) {
            this.saveData("account_token_0", oldToken);
        }

        let oldAccount = this.loadData("account");
        if (oldAccount && Array.isArray(oldAccount) && oldAccount.length >= 2) {
            let cred = this.loadData("account_credentials");
            if (!cred) {
                this.saveData("account_credentials", { email: oldAccount[0], password: oldAccount[1] });
            }
        }
    }

    /** 通用 GraphQL 请求（使用指定 token） */
    async _queryJsonWithToken(token, query) {
        this._clearApiCookies()
        let res = await Network.post(this._apiUrl("/api/query"), this._headersForToken(token), query)
        if (res.status !== 200) throw `Invalid Status Code ${res.status}`
        let json = JSON.parse(res.body)
        if (json.errors !== undefined) {
            let err = json.errors[0]
            let msg = (err.message || '').toString()
            let code = (err.extensions && err.extensions.code) || ''
            let isToken = code === 'UNAUTHENTICATED' || /token is expired|no token|unauthor|expired/i.test(msg)
            if (isToken) {
                throw msg
            }
            throw msg
        }
        return json
    }

    /** 用主账号发 GraphQL，token 过期自动重登 */
    async queryJson(query) {
        let token = this.loadData("account_token_0") || this.loadData("token");
        try {
            return await this._queryJsonWithToken(token, query)
        } catch (e) {
            let msg = String(e)
            if (/token is expired|no token|unauthor|expired/i.test(msg)) {
                if (await this._reloginAccount(0)) {
                    token = this.loadData("account_token_0")
                    return await this._queryJsonWithToken(token, query)
                }
            }
            throw e
        }
    }

    _headersForToken(token) {
        let headers = {
            'Referer': Komiic.REFERER,
            'User-Agent': Komiic.UA,
            'Content-Type': 'application/json',
            'http_client': 'dart:io'
        }
        if (token) headers['Authorization'] = `Bearer ${token}`
        return headers
    }

    async queryComics(query) {
        let operationName = query["operationName"]
        let json = await this.queryJson(query)
        const parseComic = (comic) => {
            let author = (comic.authors && comic.authors.length > 0) ? comic.authors[0].name : ''
            let tags = []
            if (comic.categories) comic.categories.forEach((c) => tags.push(c.name))
            const getTimeDifference = (date) => {
                const diff = Date.now() - date
                const msPerHour = 3600000
                const msPerDay = msPerHour * 24
                if (diff < msPerHour) return '剛剛更新'
                if (diff < msPerDay) return `${Math.floor(diff / msPerHour)}小時前更新`
                return `${Math.floor(diff / msPerDay)}天前更新`
            }
            let updateTime = new Date(comic.dateUpdated)
            return {
                id: comic.id,
                title: comic.title,
                subTitle: author,
                cover: this._imgUrl(comic.imageUrl),
                tags: tags,
                description: getTimeDifference(updateTime),
                updateTime: `${updateTime.getFullYear()}-${updateTime.getMonth() + 1}-${updateTime.getDate()}`,
                isFavorite: comic.isFavorite === true
            }
        }
        return { comics: json.data[operationName].map(parseComic), maxPage: null }
    }

    // ========== account 对象 ==========
    account = {
        login: async (email, password, index = 0) => {
            this._clearApiCookies()
            let res = await Network.post(this._apiUrl("/api/login"), this._headersForToken(null), { email, password })
            if (res.status !== 200) throw `登录失败 (HTTP ${res.status})`
            let body = JSON.parse(res.body)
            if (!body.token) throw `登录失败: ${res.body}`
            this.saveData(`account_token_${index}`, body.token)
            if (index === 0) {
                this.saveData('account_credentials', { email, password })
                this.saveData('account', [email, password])
            }
            return "ok"
        },
        logout: (index = 0) => {
            this.deleteData(`account_token_${index}`)
            if (index === 0) {
                this.deleteData('account_credentials')
            }
        },
        registerWebsite: null
    }

    async _reloginAccount(accountIndex) {
        let email, password
        if (accountIndex === 0) {
            let cred = this.loadData("account_credentials")
            if (cred) {
                email = cred.email
                password = cred.password
            } else {
                let old = this.loadData("account")
                if (old && Array.isArray(old) && old.length >= 2) {
                    email = old[0]
                    password = old[1]
                } else {
                    return false
                }
            }
        } else {
            let subs = this._getSubAccounts()
            let acc = subs[accountIndex - 1]
            if (!acc) return false
            email = acc.email
            password = acc.password
        }
        try {
            await this.account.login(email, password, accountIndex)
            return true
        } catch (e) {
            console.log(`account ${accountIndex} relogin error: ${e}`)
            return false
        }
    }

    // ========== 探索 ==========
    explore = [
        {
            title: "Komiic",
            type: "multiPageComicList",
            load: async (page) => {
                return await this.queryComics({
                    "operationName": "recentUpdate",
                    "variables": { "pagination": { "limit": 20, "offset": (page - 1) * 20, "orderBy": "DATE_UPDATED", "status": "", "asc": true } },
                    "query": "query recentUpdate($pagination: Pagination!) {\n recentUpdate(pagination: $pagination) {\n id\n title\n status\n year\n imageUrl\n authors {\n id\n name\n __typename\n }\n categories {\n id\n name\n __typename\n }\n dateUpdated\n monthViews\n views\n favoriteCount\n lastBookUpdate\n lastChapterUpdate\n __typename\n }\n}"
                })
            }
        }
    ]

    // ========== 分类 ==========
    category = {
        title: "Komiic",
        enableRankingPage: true,
        parts: [
            {
                name: "主题",
                type: "fixed",
                categories: ['全部', '愛情', '神鬼', '校園', '搞笑', '生活', '懸疑', '冒險', '職場', '魔幻', '後宮', '魔法', '格鬥', '宅男', '勵志', '耽美', '科幻', '百合', '治癒', '萌系', '熱血', '競技', '推理', '雜誌', '偵探', '偽娘', '美食', '恐怖', '四格', '社會', '歷史', '戰爭', '舞蹈', '武俠', '機戰', '音樂', '體育', '黑道'],
                itemType: "category",
                categoryParams: ['0', '1', '3', '4', '5', '6', '7', '8', '10', '11', '2', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '9', '28', '31', '32', '33', '34', '35', '36', '37', '40', '42']
            }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let variables = {
                pagination: { limit: 30, offset: (page - 1) * 30, orderBy: options[0], asc: false, status: options[1] }
            }
            variables.categoryId = (param !== '0') ? [param] : []
            return await this.queryComics({
                "operationName": "comicByCategories",
                "variables": variables,
                "query": "query comicByCategories($categoryId: [ID!]!, $pagination: Pagination!) {\n comicByCategories(categoryId: $categoryId, pagination: $pagination) {\n id\n title\n status\n year\n imageUrl\n authors { id name __typename }\n categories { id name __typename }\n dateUpdated\n monthViews\n views\n favoriteCount\n lastBookUpdate\n lastChapterUpdate\n __typename\n }\n }"
            })
        },
        optionList: [
            { options: ["DATE_UPDATED-更新", "VIEWS-觀看數", "FAVORITE_COUNT-喜愛數"], notShowWhen: null, showWhen: null },
            { options: ["-全部", "ONGOING-連載中", "END-完結"], notShowWhen: null, showWhen: null }
        ],
        ranking: {
            options: ["MONTH_VIEWS-月", "VIEWS-綜合"],
            load: async (option, page) => {
                return this.queryComics({
                    "operationName": "hotComics",
                    "variables": { "pagination": { "limit": 20, "offset": (page - 1) * 20, "orderBy": option, "status": "", "asc": true } },
                    "query": "query hotComics($pagination: Pagination!) {\n hotComics(pagination: $pagination) {\n id\n title\n status\n year\n imageUrl\n authors {\n id\n name\n __typename\n }\n categories {\n id\n name\n __typename\n }\n dateUpdated\n monthViews\n views\n favoriteCount\n lastBookUpdate\n lastChapterUpdate\n __typename\n }\n}"
                })
            }
        }
    }

    // ========== 搜索 ==========
    search = {
        load: async (keyword, options, page) => {
            let json = await this.queryJson({
                "operationName": "searchComicAndAuthorQuery",
                "variables": { "keyword": keyword },
                "query": "query searchComicAndAuthorQuery($keyword: String!) {\n searchComicsAndAuthors(keyword: $keyword) {\n comics {\n id\n title\n status\n year\n imageUrl\n authors {\n id\n name\n __typename\n }\n categories {\n id\n name\n __typename\n }\n dateUpdated\n monthViews\n views\n favoriteCount\n lastBookUpdate\n lastChapterUpdate\n __typename\n }\n authors {\n id\n name\n chName\n enName\n wikiLink\n comicCount\n views\n __typename\n }\n __typename\n }\n}"
            })
            const parseComic = (comic) => {
                let author = (comic.authors && comic.authors.length > 0) ? comic.authors[0].name : ''
                let tags = []
                if (comic.categories) comic.categories.forEach((c) => tags.push(c.name))
                const getTimeDifference = (date) => {
                    const diff = Date.now() - date
                    const msPerHour = 3600000
                    const msPerDay = msPerHour * 24
                    if (diff < msPerHour) return '剛剛更新'
                    if (diff < msPerDay) return `${Math.floor(diff / msPerHour)}小時前更新`
                    return `${Math.floor(diff / msPerDay)}天前更新`
                }
                let updateTime = new Date(comic.dateUpdated)
                return {
                    id: comic.id, title: comic.title, subTitle: author, cover: this._imgUrl(comic.imageUrl),
                    tags: tags, description: getTimeDifference(updateTime)
                }
            }
            return { comics: json.data.searchComicsAndAuthors.comics.map(parseComic), maxPage: 1 }
        },
        optionList: []
    }

    // ============================================================
    // 收藏：支持心形收藏（虚拟“收藏”文件夹）和自定义文件夹
    // ============================================================
    favorites = {
        multiFolder: true,

        loadFolders: async (comicId) => {
            let json = await this.queryJson({
                "operationName": "myFolder",
                "variables": {},
                "query": "query myFolder {\n folders {\n id\n key\n name\n views\n comicCount\n dateCreated\n dateUpdated\n __typename\n }\n}"
            })

            let orderedFolders = {};
            orderedFolders[Komiic.FAV_FOLDER_ID] = "收藏";
            json.data.folders.forEach((f) => {
                orderedFolders[f.id] = f.name;
            });

            let favorited = []
            if (comicId) {
                let favJson = await this.queryJson({
                    "operationName": "comicByIds",
                    "variables": { "comicIds": [comicId] },
                    "query": "query comicByIds($comicIds: [ID]!) {\n comicByIds(comicIds: $comicIds) {\n id\n isFavorite\n __typename\n }\n}"
                })
                let arr = favJson.data.comicByIds
                if (arr && arr.length > 0 && arr[0].isFavorite === true) {
                    favorited.push(Komiic.FAV_FOLDER_ID)
                }
                let folderJson = await this.queryJson({
                    "operationName": "comicInAccountFolders",
                    "variables": { "comicId": comicId },
                    "query": "query comicInAccountFolders($comicId: ID!) {\n comicInAccountFolders(comicId: $comicId)\n}"
                })
                favorited = favorited.concat(folderJson.data.comicInAccountFolders)
            }
            return { folders: orderedFolders, favorited }
        },

        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            let query
            if (folderId === Komiic.FAV_FOLDER_ID) {
                if (isAdding) {
                    query = {
                        "operationName": "addFavorite",
                        "variables": { "comicId": comicId },
                        "query": "mutation addFavorite($comicId: ID!) {\n  addFavorite(comicId: $comicId) {\n    __typename\n  }\n}"
                    }
                } else {
                    query = {
                        "operationName": "removeFavorite",
                        "variables": { "comicId": comicId },
                        "query": "mutation removeFavorite($comicId: ID!) {\n  removeFavorite(comicId: $comicId)\n}"
                    }
                }
            } else {
                query = isAdding
                    ? {
                        "operationName": "addComicToFolder",
                        "variables": { "comicId": comicId, "folderId": folderId },
                        "query": "mutation addComicToFolder($comicId: ID!, $folderId: ID!) {\n  addComicToFolder(comicId: $comicId, folderId: $folderId)\n}"
                      }
                    : {
                        "operationName": "removeComicToFolder",
                        "variables": { "comicId": comicId, "folderId": folderId },
                        "query": "mutation removeComicToFolder($comicId: ID!, $folderId: ID!) {\n  removeComicToFolder(comicId: $comicId, folderId: $folderId)\n}"
                      }
            }
            await this.queryJson(query)
            return "ok"
        },

        addFolder: async (name) => {
            await this.queryJson({
                "operationName": "createFolder",
                "variables": { "name": name },
                "query": "mutation createFolder($name: String!) {\n  createFolder(name: $name) {\n    id\n    key\n    name\n    account {\n      id\n      nickname\n      __typename\n    }\n    comicCount\n    views\n    dateCreated\n    dateUpdated\n    __typename\n  }\n}"
            })
            return "ok"
        },

        deleteFolder: async (folderId) => {
            if (folderId === Komiic.FAV_FOLDER_ID) return "ok"
            await this.queryJson({
                "operationName": "removeFolder",
                "variables": { "folderId": folderId },
                "query": "mutation removeFolder($folderId: ID!) {\n  removeFolder(folderId: $folderId)\n}"
            })
            return "ok"
        },

        loadComics: async (page, folder) => {
            if (folder === Komiic.FAV_FOLDER_ID) {
                let json = await this.queryJson({
                    "operationName": "favoritesV2",
                    "variables": { "pagination": { "limit": 30, "offset": (page - 1) * 30, "orderBy": "FAVORITE_ADDED", "asc": false } },
                    "query": "query favoritesV2($pagination: Pagination!) {\n favoritesV2(pagination: $pagination) {\n id\n comicId\n dateAdded\n lastAccess\n __typename\n }\n}"
                })
                let favs = json.data.favoritesV2
                if (!favs || favs.length === 0) return { comics: [], maxPage: 1 }
                let ids = favs.map(f => f.comicId)
                let res = await this.queryComics({
                    "operationName": "comicByIds",
                    "variables": { "comicIds": ids },
                    "query": "query comicByIds($comicIds: [ID]!) {\n comicByIds(comicIds: $comicIds) {\n id\n title\n status\n year\n imageUrl\n authors {\n id\n name\n __typename\n }\n categories {\n id\n name\n __typename\n }\n dateUpdated\n monthViews\n views\n favoriteCount\n lastBookUpdate\n lastChapterUpdate\n __typename\n }\n}"
                })
                let order = {}
                ids.forEach((cid, i) => order[cid] = i)
                res.comics.sort((a, b) => (order[a.id] ?? 9999) - (order[b.id] ?? 9999))
                res.maxPage = favs.length < 30 ? page : page + 1
                return res
            } else {
                let json = await this.queryJson({
                    "operationName": "folderComicIds",
                    "variables": {
                        "folderId": folder,
                        "pagination": { "limit": 30, "offset": (page - 1) * 30, "orderBy": "DATE_UPDATED", "status": "", "asc": true }
                    },
                    "query": "query folderComicIds($folderId: ID!, $pagination: Pagination!) {\n  folderComicIds(folderId: $folderId, pagination: $pagination) {\n    folderId\n    key\n    comicIds\n    __typename\n  }\n}"
                })
                let ids = json.data.folderComicIds.comicIds
                if (ids.length === 0) {
                    return { comics: [], maxPage: 1 }
                }
                let res = await this.queryComics({
                    "operationName": "comicByIds",
                    "variables": { "comicIds": ids },
                    "query": "query comicByIds($comicIds: [ID]!) {\n  comicByIds(comicIds: $comicIds) {\n    id\n    title\n    status\n    year\n    imageUrl\n    authors {\n      id\n      name\n      __typename\n    }\n    categories {\n      id\n      name\n      __typename\n    }\n    dateUpdated\n    monthViews\n    views\n    favoriteCount\n    lastBookUpdate\n    lastChapterUpdate\n    __typename\n  }\n}"
                })
                res.maxPage = ids.length < 30 ? page : page + 1
                return res
            }
        }
    }

    // ========== 单个漫画 ==========
    comic = {
        loadInfo: async (id) => {
            let [recJson, chapJson] = await Promise.all([
                this.queryJson({ "operationName": "recommendComicById", "variables": { "comicId": id }, "query": "query recommendComicById($comicId: ID!) {\n recommendComicById(comicId: $comicId)\n}" }),
                this.queryJson({ "operationName": "chapterByComicId", "variables": { "comicId": id }, "query": "query chapterByComicId($comicId: ID!) {\n chaptersByComicId(comicId: $comicId) {\n id\n serial\n type\n dateCreated\n dateUpdated\n size\n __typename\n }\n}" })
            ])
            let recommend = recJson.data.recommendComicById
            recommend.push(id)
            let all = chapJson.data.chaptersByComicId
            let books = [], chapters = []
            all.forEach((c) => (c.type === 'book' ? books : chapters).push(c))
            let chapMap = new Map()
            books.forEach((c) => chapMap.set(c.id, '卷' + c.serial))
            chapters.forEach((c) => chapMap.set(c.id, c.serial))

            let res = await this.queryComics({
                "operationName": "comicByIds", "variables": { "comicIds": recommend },
                "query": "query comicByIds($comicIds: [ID]!) {\n comicByIds(comicIds: $comicIds) {\n id\n title\n status\n year\n imageUrl\n isFavorite\n authors {\n id\n name\n __typename\n }\n categories {\n id\n name\n __typename\n }\n dateUpdated\n monthViews\n views\n favoriteCount\n lastBookUpdate\n lastChapterUpdate\n __typename\n }\n}"
            })

            let info = res.comics.pop()

            // 构造详情页链接（用于复制链接）
            const base = this._apiBase(); // 如 https://komiic.cc 或 https://komiic.com
            const url = `${base}/comic/${id}`;

            return {
                title: info.title,
                cover: info.cover,
                tags: { "作者": [info.subTitle], "标签": info.tags },
                chapters: chapMap,
                recommend: res.comics,
                updateTime: info.updateTime,
                isFavorite: info.isFavorite,
                url: url   // 添加此字段，使右上角菜单出现“复制链接”
            }
        },

        loadEp: async (comicId, epId) => {
            let cached = this._imageTicketCache[epId]
            let now = Date.now()
            if (cached && Object.keys(cached).length > 0) {
                let anyValid = Object.values(cached).some(e => !e.expiresAt || this._parseExpiresAt(e.expiresAt) > now + 5000)
                if (anyValid) {
                    return { images: this._imageTicketUrls[epId] || Object.keys(cached) }
                }
            }
            let tickets = await this._fetchImageTickets(epId)
            let cache = {}
            let urls = []
            for (let t of tickets) {
                let u = this._imgUrl(t.url)
                cache[u] = { ticket: t.ticket, kid: t.kid, expiresAt: t.expiresAt }
                urls.push(u)
            }
            this._imageTicketCache[epId] = cache
            this._imageTicketUrls[epId] = urls
            return { images: urls }
        },

        onImageLoad: async (url, comicId, epId) => {
            let headers = {
                'user-agent': Komiic.UA,
                'referer': `https://komiic.cc/comic/${comicId}/chapter/${epId}/images/all`,
                'http_client': 'dart:io'
            }
            let cache = this._imageTicketCache[epId]
            let entry = cache && cache[url]
            let now = Date.now()
            let expired = entry && entry.expiresAt && (this._parseExpiresAt(entry.expiresAt) - now < 5000)
            if (!entry) {
                try {
                    let tickets = await this._fetchImageTickets(epId)
                    let c = {}
                    let orderUrls = []
                    for (let t of tickets) {
                        let u = this._imgUrl(t.url)
                        c[u] = { ticket: t.ticket, kid: t.kid, expiresAt: t.expiresAt }
                        orderUrls.push(u)
                    }
                    this._imageTicketCache[epId] = c
                    this._imageTicketUrls[epId] = orderUrls
                    entry = c[url]
                } catch (e) {
                    console.log(`fetch tickets for ep ${epId} failed: ${e}`)
                }
            } else if (expired) {
                try {
                    let t = await this._refreshSingleTicket(entry.kid)
                    let u = this._imgUrl(t.url)
                    let c2 = this._imageTicketCache[epId] || {}
                    c2[url] = { ticket: t.ticket, kid: t.kid, expiresAt: t.expiresAt }
                    this._imageTicketCache[epId] = c2
                    entry = c2[url]
                } catch (e) {
                    console.log(`refresh single ticket for ep ${epId} failed: ${e}`)
                }
            }
            if (entry && entry.ticket) headers['X-Image-Ticket'] = entry.ticket
            return { headers }
        },

        loadComments: async (comicId, subId, page, replyTo) => {
            let operationName = replyTo ? "messageChan" : "getMessagesByComicId"
            let promise = replyTo
                ? this.queryJson({ "operationName": "messageChan", "variables": { "messageId": replyTo }, "query": "query messageChan($messageId: ID!) {\n messageChan(messageId: $messageId) {\n id\n comicId\n account {\n id\n nickname\n profileText\n profileTextColor\n profileBackgroundColor\n profileImageUrl\n __typename\n }\n message\n replyTo {\n id\n __typename\n }\n upCount\n downCount\n dateUpdated\n dateCreated\n __typename\n }\n}" })
                : this.queryJson({ "operationName": "getMessagesByComicId", "variables": { "comicId": comicId, "pagination": { "limit": 100, "offset": (page - 1) * 100, "orderBy": "DATE_UPDATED", "asc": true } }, "query": "query getMessagesByComicId($comicId: ID!, $pagination: Pagination!) {\n getMessagesByComicId(comicId: $comicId, pagination: $pagination) {\n id\n comicId\n account {\n id\n nickname\n profileText\n profileTextColor\n profileBackgroundColor\n profileImageUrl\n __typename\n }\n message\n replyTo {\n id\n message\n account {\n id\n nickname\n profileText\n profileTextColor\n profileBackgroundColor\n profileImageUrl\n __typename\n }\n __typename\n }\n upCount\n downCount\n dateUpdated\n dateCreated\n __typename\n }\n}" })
            let json = await promise
            let list = json.data[operationName]
            return {
                comments: list.map(e => ({
                    userName: e.account.nickname,
                    avatar: e.account.profileImageUrl,
                    content: e.message,
                    time: e.dateUpdated,
                    replyCount: 0,
                    id: e.id,
                })),
                maxPage: replyTo ? 1 : (list.length < 100 ? page : page + 1),
            }
        },

        sendComment: async (comicId, subId, content, replyTo) => {
            if (!replyTo) replyTo = "0"
            await this.queryJson({ "operationName": "addMessageToComic", "variables": { "comicId": comicId, "message": content, "replyToId": replyTo }, "query": "mutation addMessageToComic($comicId: ID!, $replyToId: ID!, $message: String!) {\n addMessageToComic(message: $message, comicId: $comicId, replyToId: $replyToId) {\n id\n message\n comicId\n account {\n id\n nickname\n __typename\n }\n replyTo {\n id\n message\n account {\n id\n nickname\n profileText\n profileTextColor\n profileBackgroundColor\n profileImageUrl\n __typename\n }\n __typename\n }\n dateCreated\n dateUpdated\n __typename\n }\n}" })
            return "ok"
        },

        // ========== 链接解析跳转 ==========
        link: {
            domains: [
                'komiic.cc',
                'komiic.com'
            ],
            linkToId: (url) => {
                // 匹配 /comic/{数字}
                let match = url.match(/\/comic\/(\d+)/);
                return match ? match[1] : null;
            }
        }
    }

    // ========== 图片 ticket 与额度池化 ==========
    _imageAccountIndices() {
        let indices = []
        if (this.loadData(`account_token_0`)) indices.push(0)
        let subs = this._getSubAccounts()
        for (let i = 0; i < subs.length; i++) indices.push(i + 1)
        return indices
    }

    _getSubAccounts() {
        let arr = this.loadData('sub_accounts')
        if (Array.isArray(arr)) return arr
        try {
            let old = JSON.parse(this.loadSetting('sub_accounts') || '[]')
            if (Array.isArray(old) && old.length > 0) {
                this.saveData('sub_accounts', old)
                return old
            }
        } catch (e) {}
        return []
    }

    _setSubAccounts(arr) {
        this.saveData('sub_accounts', arr || [])
    }

    _isExhausted(accountIndex) {
        let e = this._exhaustedAccounts[accountIndex]
        if (!e) return false
        if (Date.now() < e.until) return true
        delete this._exhaustedAccounts[accountIndex]
        return false
    }

    async _markExhausted(accountIndex) {
        let until = Date.now() + 6 * 3600 * 1000
        try {
            let lim = await this.getImageLimit(accountIndex)
            let resetSec = parseInt(lim.resetInSeconds) || 21600
            until = Date.now() + resetSec * 1000
        } catch (e) { console.log(`markExhausted get limit failed: ${e}`) }
        this._exhaustedAccounts[accountIndex] = { until: until }
        console.log(`account ${accountIndex} marked exhausted until ${new Date(until).toLocaleTimeString()}`)
    }

    async _fetchImageTickets(epId) {
        if (this._imageTicketPromises[epId]) return this._imageTicketPromises[epId]
        let p = this._fetchImageTicketsInner(epId)
        this._imageTicketPromises[epId] = p
        p.then(() => { delete this._imageTicketPromises[epId] }, () => { delete this._imageTicketPromises[epId] })
        return p
    }

    async _refreshSingleTicket(kid) {
        let indices = this._imageAccountIndices()
        if (indices.length === 0) indices = [0]
        let lastErr = null
        for (let accountIndex of indices) {
            if (this._isExhausted(accountIndex)) continue
            try {
                let token = this.loadData(`account_token_${accountIndex}`)
                if (!token) {
                    if (await this._reloginAccount(accountIndex)) token = this.loadData(`account_token_${accountIndex}`)
                    else { await this._markExhausted(accountIndex); lastErr = `account ${accountIndex} login failed`; continue }
                }
                this._clearApiCookies()
                let res = await Network.post(
                    this._apiUrl("/api/query"),
                    this._headersForToken(token),
                    {
                        "operationName": "getImageTicket",
                        "variables": { "kid": kid },
                        "query": "query getImageTicket($kid: String!) {\n getImageTicket(kid: $kid) {\n url\n ticket\n kid\n width\n height\n expiresAt\n __typename\n }\n}"
                    }
                )
                if (res.status !== 200) throw `Invalid Status Code ${res.status}: ${res.body}`
                let json = JSON.parse(res.body)
                if (json.errors !== undefined) {
                    let err = json.errors[0]
                    let msg = (err.message || '').toString()
                    let code = (err.extensions && err.extensions.code) || ''
                    if (code === 'QUOTA_EXCEEDED' || /quota|exceeded|limit/i.test(msg)) {
                        await this._markExhausted(accountIndex)
                        lastErr = msg
                        continue
                    }
                    throw msg
                }
                return json.data.getImageTicket
            } catch (e) {
                let msg = String(e && e.message ? e.message : e)
                if (/quota|exceeded|limit/i.test(msg)) {
                    await this._markExhausted(accountIndex)
                    lastErr = msg
                    continue
                }
                throw e
            }
        }
        throw lastErr || '所有账号今日图片额度已用尽，无法刷新单张 ticket'
    }

    async _fetchImageTicketsInner(epId) {
        let indices = this._imageAccountIndices()
        if (indices.length === 0) indices = [0]

        let lastErr = null
        for (let accountIndex of indices) {
            if (this._isExhausted(accountIndex)) continue
            let retried = false
            while (true) {
                try {
                    let token = this.loadData(`account_token_${accountIndex}`)
                    if (!token) {
                        if (await this._reloginAccount(accountIndex)) {
                            token = this.loadData(`account_token_${accountIndex}`)
                        } else {
                            await this._markExhausted(accountIndex)
                            lastErr = `account ${accountIndex} login failed`
                            break
                        }
                    }
                    this._clearApiCookies()
                    let res = await Network.post(
                        this._apiUrl("/api/query"),
                        this._headersForToken(token),
                        {
                            "operationName": "imageTicketsByChapterId",
                            "variables": { "chapterId": epId },
                            "query": "query imageTicketsByChapterId($chapterId: ID!) {\n imageTicketsByChapterId(chapterId: $chapterId) {\n url\n ticket\n kid\n width\n height\n expiresAt\n __typename\n }\n}"
                        }
                    )
                    if (res.status !== 200) throw `Invalid Status Code ${res.status}: ${res.body}`
                    let json = JSON.parse(res.body)
                    if (json.errors !== undefined) {
                        let err = json.errors[0]
                        let msg = (err.message || '').toString()
                        let code = (err.extensions && err.extensions.code) || ''
                        let isQuota = code === 'QUOTA_EXCEEDED' || /quota|exceeded|limit/i.test(msg)
                        let isToken = code === 'UNAUTHENTICATED' || /token is expired|no token|unauthor|expired/i.test(msg)
                        if (isQuota) {
                            await this._markExhausted(accountIndex)
                            console.log(`account ${accountIndex} quota exceeded, marked exhausted, fallback to next`)
                            lastErr = msg
                            break
                        }
                        if (isToken && !retried) {
                            console.log(`account ${accountIndex} token expired, relogin...`)
                            if (await this._reloginAccount(accountIndex)) {
                                retried = true
                                continue
                            }
                            await this._markExhausted(accountIndex)
                            lastErr = `account ${accountIndex} relogin failed`
                            break
                        }
                        throw msg
                    }
                    return json.data.imageTicketsByChapterId
                } catch (e) {
                    let msg = String(e && e.message ? e.message : e)
                    if (/quota|exceeded|limit/i.test(msg)) {
                        await this._markExhausted(accountIndex)
                        lastErr = msg
                        break
                    }
                    throw e
                }
            }
        }
        throw lastErr || '所有账号今日图片额度已用尽或不可用，请等待额度重置或登录更多附属账号'
    }

    async getImageLimit(accountIndex = 0) {
        for (let attempt = 0; attempt < 2; attempt++) {
            let token = this.loadData(`account_token_${accountIndex}`)
            if (!token) {
                if (await this._reloginAccount(accountIndex)) {
                    token = this.loadData(`account_token_${accountIndex}`)
                } else {
                    throw `account ${accountIndex} login failed`
                }
            }
            this._clearApiCookies()
            let res = await Network.post(
                this._apiUrl("/api/query"),
                this._headersForToken(token),
                {
                    "operationName": "getImageLimit",
                    "variables": {},
                    "query": "query getImageLimit {\n getImageLimit {\n usage\n limit\n resetInSeconds\n }\n}"
                }
            )
            if (res.status !== 200) throw `Invalid Status Code ${res.status}`
            let json = JSON.parse(res.body)
            if (json.errors !== undefined) {
                let err = json.errors[0]
                let msg = (err.message || '').toString()
                let code = (err.extensions && err.extensions.code) || ''
                let isToken = code === 'UNAUTHENTICATED' || /token is expired|no token|unauthor|expired/i.test(msg)
                if (isToken && attempt === 0) {
                    if (await this._reloginAccount(accountIndex)) continue
                }
                throw msg
            }
            return json.data.getImageLimit
        }
        throw 'getImageLimit failed'
    }

    // ========== 设置 ==========
    settings = {
        help: {
            title: "使用帮助",
            type: "callback",
            buttonText: "查看帮助",
            callback: () => {
                UI.showDialog("Komiic 多账号帮助",
`• 主账号：通过应用内标准登录入口登录，负责收藏/评论等所有操作
• 收藏：支持两种方式
  - 「收藏」文件夹 = 心形收藏（profile 页的收藏），使用 addFavorite/removeFavorite
  - 自建文件夹 = 书柜文件夹，使用 addComicToFolder/removeComicToFolder
• 附属账号：点「添加附属账号」添加，仅用于看图额度池化，看图时自动登录
• 看图优先用主号，主号额度用尽自动切附属号，到点自动恢复，全程无需手动
• API 默认使用 komiic.cc（国内可直连）；若需切换，可在下方「节点选择」中选取预置节点或自定义
• 密码以明文存储，请注意安全`, [{text: "知道了", callback: () => {}}])
            }
        },
        node_selection: {
            title: "节点选择",
            type: "select",
            options: [
                { value: "https://komiic.com", text: "主站 (komiic.com)" },
                { value: "https://komiic.cc", text: "中国大陆线路 (komiic.cc，速度更稳定)" },
                { value: "custom", text: "自定义（使用下方 API 地址）" }
            ],
            default: "https://komiic.cc",
        },
        custom_api: {
            title: "API 地址（自定义）",
            type: "input",
            validator: null,
            default: "https://komiic.cc",
            description: "当节点选择为「自定义」时，使用此地址"
        },
        add_sub_account: {
            title: "添加附属账号",
            type: "callback",
            buttonText: "添加附属账号（弹窗输入）",
            callback: async () => {
                let name = await UI.showInputDialog("附属账号 - 显示名称", (v) => v && v.trim() ? null : "名称不能为空")
                if (!name) return
                name = name.trim()
                let email = await UI.showInputDialog("附属账号 - 邮箱", (v) => v && v.indexOf("@") > 0 ? null : "邮箱格式不正确")
                if (!email) return
                email = email.trim()
                let password = await UI.showInputDialog("附属账号 - 密码", (v) => v ? null : "密码不能为空")
                if (!password) return
                let subs = this._getSubAccounts()
                subs.push({ name: name, email: email, password: password })
                this._setSubAccounts(subs)
                UI.showMessage(`已添加附属账号「${name}」，下次看图时会自动登录`)
            }
        },
        manage_sub_accounts: {
            title: "管理附属账号",
            type: "callback",
            buttonText: "查看 / 删除附属账号",
            callback: async () => {
                let subs = this._getSubAccounts()
                if (subs.length === 0) { UI.showMessage("还没有附属账号，请先点「添加附属账号」"); return }
                let options = subs.map((s, i) => `${i + 1}. ${s.name} (${s.email})`)
                options.push("清空全部附属账号")
                let idx = await UI.showSelectDialog("选择要删除的附属账号", options)
                if (idx === null || idx === undefined) return
                if (idx === subs.length) {
                    UI.showDialog("确认清空", `将删除全部 ${subs.length} 个附属账号配置及其 token，确定？`, [
                        { text: "清空", style: "danger", callback: () => {
                            for (let i = 0; i < subs.length; i++) this.deleteData(`account_token_${i + 1}`)
                            this._setSubAccounts([])
                            this._exhaustedAccounts = {}
                            UI.showMessage("已清空全部附属账号")
                        }},
                        { text: "取消", callback: () => {} }
                    ])
                    return
                }
                let target = subs[idx]
                UI.showDialog("确认删除", `删除「${target.name}」(${target.email})？`, [
                    { text: "删除", style: "danger", callback: () => {
                        for (let i = idx; i < subs.length - 1; i++) {
                            let t = this.loadData(`account_token_${i + 2}`)
                            if (t) this.saveData(`account_token_${i + 1}`, t)
                        }
                        this.deleteData(`account_token_${subs.length}`)
                        subs.splice(idx, 1)
                        this._setSubAccounts(subs)
                        this._exhaustedAccounts = {}
                        UI.showMessage(`已删除「${target.name}」`)
                    }},
                    { text: "取消", callback: () => {} }
                ])
            }
        },
        show_image_quota: {
            title: "查看今日图片额度",
            type: "callback",
            buttonText: "查询所有账号额度",
            callback: async () => {
                let indices = this._imageAccountIndices()
                if (indices.length === 0) { UI.showMessage("未登录任何账号"); return }
                let labels = ["主号"]
                let subs = this._getSubAccounts()
                for (let i = 0; i < subs.length; i++) labels.push(subs[i].name || `附属${i + 1}`)
                let lines = []
                for (let i of indices) {
                    let label = labels[i] || `账号${i}`
                    let exhausted = this._isExhausted(i) ? "（已用尽）" : ""
                    try {
                        let lim = await this.getImageLimit(i)
                        let resetH = (parseInt(lim.resetInSeconds) / 3600).toFixed(1)
                        lines.push(`[${label}]${exhausted} 已用 ${lim.usage} / ${lim.limit}，约 ${resetH} 小时后重置`)
                    } catch (e) {
                        lines.push(`[${label}] 查询失败: ${e}`)
                    }
                }
                UI.showDialog("今日图片额度", lines.join("\n"), [{text: "知道了", callback: () => {}}])
            }
        }
    }

    // ========== 翻译 ==========
    translation = {
        'zh_CN': {
            'Komiic 多账号': 'Komiic 多账号',
            '节点选择': '节点选择',
            'API 地址（自定义）': 'API 地址（自定义）',
            '使用帮助': '使用帮助', '查看帮助': '查看帮助',
            '添加附属账号': '添加附属账号', '添加附属账号（弹窗输入）': '添加附属账号（弹窗输入）',
            '管理附属账号': '管理附属账号', '查看 / 删除附属账号': '查看 / 删除附属账号',
            '查看今日图片额度': '查看今日图片额度', '查询所有账号额度': '查询所有账号额度',
            '主题': '主题', '主号': '主号',
        },
        'zh_TW': {
            'Komiic 多账号': 'Komiic 多帳號',
            '节点选择': '節點選擇',
            'API 地址（自定义）': 'API 地址（自定義）',
            '使用帮助': '使用說明', '查看帮助': '查看說明',
            '添加附属账号': '添加附屬帳號', '添加附属账号（弹窗输入）': '添加附屬帳號（彈窗輸入）',
            '管理附属账号': '管理附屬帳號', '查看 / 删除附属账号': '查看 / 刪除附屬帳號',
            '查看今日图片额度': '查看今日圖片額度', '查询所有账号额度': '查詢所有帳號額度',
            '主题': '主題', '主号': '主號',
        },
        'en': {
            'Komiic 多账号': 'Komiic Multi-Account',
            '节点选择': 'Node Selection',
            'API 地址（自定义）': 'API URL (Custom)',
            '使用帮助': 'Help', '查看帮助': 'View Help',
            '添加附属账号': 'Add sub-account', '添加附属账号（弹窗输入）': 'Add sub-account (dialog)',
            '管理附属账号': 'Manage sub-accounts', '查看 / 删除附属账号': 'View / delete sub-account',
            '查看今日图片额度': 'View daily image quota', '查询所有账号额度': 'Query all account quotas',
            '主题': 'Theme', '主号': 'Main',
        }
    }
}