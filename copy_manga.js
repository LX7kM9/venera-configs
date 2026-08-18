class CopyManga extends ComicSource {

    name = "拷贝漫画"

    key = "copy_manga"

    version = "1.8.0"   // 版本号递增

    minAppVersion = "1.6.0"

    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/copy_manga.js"

    // ========== 节流 ==========
    async throttle() {
        let lastReq = this.loadData("_last_req_time") || 0;
        let now = Date.now();
        let diff = now - parseInt(lastReq);
        let targetDelay = 600 + Math.floor(Math.random() * 600);
        if (diff < targetDelay) {
            let wait = targetDelay - diff;
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
        this.saveData("_last_req_time", Date.now().toString());
    }

    // ========== Request ID ==========
    async getReqID() {
        if (this.copyRegion === "0") return "";
        const reqIdUrl = "https://marketing.aiacgn.com/api/v2/adopr/query3/?format=json&ident=200100001";
        let reqId = "";
        try {
            await this.throttle();
            const response = await Network.get(reqIdUrl, this.headers);
            if (response.status === 200) {
                const data = JSON.parse(response.body);
                reqId = data.results.request_id;
            }
        } catch (e) {}
        return reqId;
    }

    // ========== Headers ==========
    _headersForToken(token) {
        let secret = "M2FmMDg1OTAzMTEwMzJlZmUwNjYwNTUwYTA1NjNhNTM=";
        let now = new Date(Date.now());
        let year = now.getFullYear();
        let month = (now.getMonth() + 1).toString().padStart(2, '0');
        let day = now.getDate().toString().padStart(2, '0');
        let ts = Math.floor(now.getTime() / 1000).toString();

        if (!token) token = "";
        else token = " " + token;

        let sig = Convert.hmacString(
            Convert.decodeBase64(secret),
            Convert.encodeUtf8(ts),
            "sha256"
        );

        return {
            "User-Agent": "COPY/3.0.9",
            "source": "copyApp",
            "deviceinfo": this.deviceinfo,
            "dt": `${year}.${month}.${day}`,
            "platform": "3",
            "referer": "com.copymanga.app-3.0.9",
            "version": "3.0.9",
            "device": this.device,
            "pseudoid": this.pseudoid,
            "Accept": "application/json",
            "region": this.copyRegion,
            "authorization": `Token${token}`,
            "umstring": "b4c89ca4104ea9a97750314d791520ac",
            "x-auth-timestamp": ts,
            "x-auth-signature": sig,
        };
    }

    get headers() {
        let token = this.loadData("account_token_0") || this.loadData("token") || "";
        if (token && !this.loadData("account_token_0")) {
            this.saveData("account_token_0", token);
            this.deleteData("token");
        }
        return this._headersForToken(token);
    }

    // ========== 静态配置 ==========
    static defaultCopyRegion = "0"
    static defaultImageQuality = "1500"
    static defaultApiUrl = 'api.copy2000.online'
    static searchApi = "/api/kb/web/searchb/comics"

    // ========== 设备指纹池 ==========
    static realDevicePool = [
        { deviceinfo: "3371150V-9327", device: "EB0O.675141.548" },
        { deviceinfo: "4482161V-8412", device: "SM-S9180.827361.012" },
        { deviceinfo: "5593272V-7523", device: "23127PN0CC.918234.331" },
        { deviceinfo: "6604383V-6634", device: "V2309A.547182.194" }
    ];

    get deviceinfo() {
        let info = this.loadData("_deviceinfo");
        if (!info) {
            let item = CopyManga.realDevicePool[Math.floor(Math.random() * CopyManga.realDevicePool.length)];
            info = item.deviceinfo;
            this.saveData("_deviceinfo", info);
            this.saveData("_device", item.device);
        }
        return info;
    }

    get device() {
        let dev = this.loadData("_device");
        if (!dev) {
            let item = CopyManga.realDevicePool[Math.floor(Math.random() * CopyManga.realDevicePool.length)];
            dev = item.device;
            this.saveData("_device", dev);
            this.saveData("_deviceinfo", item.deviceinfo);
        }
        return dev;
    }

    get pseudoid() {
        let pid = this.loadData("_pseudoid");
        if (!pid) {
            const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            pid = '';
            for (let i = 0; i < 16; i++) {
                pid += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            this.saveData("_pseudoid", pid);
        }
        return pid;
    }

    // ========== 动态 API URL ==========
    get apiUrl() {
        let node = this.loadSetting('node_selection');
        if (node && node !== 'custom') {
            return `https://${node}`;
        } else {
            let base = this.loadSetting('base_url') || CopyManga.defaultApiUrl;
            return `https://${base}`;
        }
    }

    get copyRegion() {
        return this.loadSetting('region') || this.defaultCopyRegion
    }

    get imageQuality() {
        return this.loadSetting('image_quality') || this.defaultImageQuality
    }

    // ========== 初始化 ==========
    init() {
        this.author_path_word_dict = {}
        this._clearMergeState();
        this.refreshSearchApi()
        this.refreshAppApi()
        let oldToken = this.loadData("token");
        if (oldToken && !this.loadData("account_token_0")) {
            this.saveData("account_token_0", oldToken);
            this.deleteData("token");
        }
    }

    // ========== 主账号 ==========
    account = {
        login: async (account, pwd) => {
            let salt = Math.floor(1000 + Math.random() * 9000);
            let base64 = Convert.encodeBase64(Convert.encodeUtf8(`${pwd}-${salt}`))
            await this.throttle();
            let res = await Network.post(
                `${this.apiUrl}/api/v3/login`,
                {
                    ...this.headers,
                    "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
                },
                `username=${account}&password=${base64}\n&salt=${salt}&authorization=Token+`
            );
            if (res.status === 200) {
                let data = JSON.parse(res.body)
                let token = data.results.token
                this.saveData('account_token_0', token)
                this.deleteData('token')
                return "ok"
            } else {
                throw `Invalid Status Code ${res.status}`
            }
        },
        logout: () => {
            this.deleteData('account_token_0')
            this.deleteData('token')
        },
        registerWebsite: null
    }

    // ========== 探索页 ==========
    explore = [
        {
            title: "拷贝漫画",
            type: "singlePageWithMultiPart",
            load: async () => {
                await this.throttle();
                let dataStr = await Network.get(
                    `${this.apiUrl}/api/v3/h5/homeIndex`,
                    this.headers
                )
                if (dataStr.status === 210) throw "210：访问过于频繁，已被官方风控限制，请等待1小时、切换海外线路或尝试点击设置里的“重置设备指纹池”";
                if (dataStr.status !== 200) throw `Invalid status code: ${dataStr.status}`
                let data = JSON.parse(dataStr.body)
                function parseComic(comic) {
                    if (comic["comic"] !== null && comic["comic"] !== undefined) comic = comic["comic"]
                    let tags = []
                    if (comic["theme"] !== null && comic["theme"] !== undefined) tags = comic["theme"].map(t => t["name"])
                    let author = null
                    if (Array.isArray(comic["author"]) && comic["author"].length > 0) author = comic["author"][0]["name"]
                    return { id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags }
                }
                let res = {}
                res["推荐"] = data["results"]["recComics"]["list"].map(parseComic)
                res["热门"] = data["results"]["hotComics"].map(parseComic)
                res["最新"] = data["results"]["newComics"].map(parseComic)
                res["完结"] = data["results"]["finishComics"]["list"].map(parseComic)
                res["今日排行"] = data["results"]["rankDayComics"]["list"].map(parseComic)
                res["本周排行"] = data["results"]["rankWeekComics"]["list"].map(parseComic)
                res["本月排行"] = data["results"]["rankMonthComics"]["list"].map(parseComic)
                return res
            }
        }
    ]

    // ========== 分类 ==========
    static category_param_dict = {
        "全部": "", "愛情": "aiqing", "歡樂向": "huanlexiang", "冒險": "maoxian", "奇幻": "qihuan",
        "百合": "baihe", "校园": "xiaoyuan", "科幻": "kehuan", "東方": "dongfang", "耽美": "danmei",
        "生活": "shenghuo", "格鬥": "gedou", "轻小说": "qingxiaoshuo", "悬疑": "xuanyi", "其他": "qita",
        "神鬼": "shengui", "职场": "zhichang", "TL": "teenslove", "萌系": "mengxi", "治愈": "zhiyu",
        "長條": "changtiao", "四格": "sige", "节操": "jiecao", "舰娘": "jianniang", "竞技": "jingji",
        "搞笑": "gaoxiao", "伪娘": "weiniang", "热血": "rexue", "励志": "lizhi", "性转换": "xingzhuanhuan",
        "彩色": "COLOR", "後宮": "hougong", "美食": "meishi", "侦探": "zhentan", "AA": "aa",
        "音乐舞蹈": "yinyuewudao", "魔幻": "mohuan", "战争": "zhanzheng", "历史": "lishi", "异世界": "yishijie",
        "惊悚": "jingsong", "机战": "jizhan", "都市": "dushi", "穿越": "chuanyue", "恐怖": "kongbu",
        "C100": "comiket100", "重生": "chongsheng", "C99": "comiket99", "C101": "comiket101", "C97": "comiket97",
        "C96": "comiket96", "生存": "shengcun", "宅系": "zhaixi", "武侠": "wuxia", "C98": "C98",
        "C95": "comiket95", "FATE": "fate", "转生": "zhuansheng", "無修正": "Uncensored", "仙侠": "xianxia",
        "LoveLive": "loveLive"
    }

    category = {
        title: "拷贝漫画",
        parts: [
            { name: "拷贝漫画", type: "fixed", categories: ["排行"], categoryParams: ["ranking"], itemType: "category" },
            { name: "主题", type: "fixed", categories: Object.keys(CopyManga.category_param_dict), categoryParams: Object.values(CopyManga.category_param_dict), itemType: "category" }
        ]
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let category_url;
            if (category === "排行" || param === "ranking") {
                category_url = `${this.apiUrl}/api/v3/ranks?limit=30&offset=${(page - 1) * 30}&_update=true&type=1&audience_type=${options[0]}&date_type=${options[1]}`
            } else {
                if (category !== undefined && category !== null) param = CopyManga.category_param_dict[category] || "";
                options = options.map(e => e.replace("*", "-"))
                category_url = `${this.apiUrl}/api/v3/comics?limit=30&offset=${(page - 1) * 30}&ordering=${options[1]}&theme=${param}&top=${options[0]}`
            }
            await this.throttle();
            let res = await Network.get(category_url, this.headers)
            if (res.status === 210) throw "210：访问过于频繁，已被官方风控限制，请等待1小时、切换海外线路或尝试点击设置里的“重置设备指纹池”";
            if (res.status !== 200) throw `Invalid status code: ${res.status}`
            let data = JSON.parse(res.body)
            function parseComic(comic) {
                let sort = null, popular = 0, rise_sort = 0;
                if (comic["sort"] !== null && comic["sort"] !== undefined) { sort = comic["sort"]; rise_sort = comic["rise_sort"]; popular = comic["popular"] }
                if (comic["comic"] !== null && comic["comic"] !== undefined) comic = comic["comic"]
                let tags = []
                if (comic["theme"] !== null && comic["theme"] !== undefined) tags = comic["theme"].map(t => t["name"])
                let author = null, author_num = 0
                if (Array.isArray(comic["author"]) && comic["author"].length > 0) { author = comic["author"][0]["name"]; author_num = comic["author"].length }
                if (sort !== null) {
                    return {
                        id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags,
                        description: `${sort} ${rise_sort > 0 ? '▲' : rise_sort < 0 ? '▽' : '-'}\n${author_num > 1 ? `${author} 等${author_num}位` : author}\n🔥${(popular / 10000).toFixed(1)}W`
                    }
                } else {
                    return { id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags, description: comic["datetime_updated"] }
                }
            }
            return { comics: data["results"]["list"].map(parseComic), maxPage: (data["results"]["total"] - (data["results"]["total"] % 21)) / 21 + 1 }
        },
        optionList: [
            { options: ["-全部", "japan-日漫", "korea-韩漫", "west-美漫", "finish-已完结"], notShowWhen: null, showWhen: Object.keys(CopyManga.category_param_dict) },
            { options: ["*datetime_updated-时间倒序", "datetime_updated-时间正序", "*popular-热度倒序", "popular-热度正序"], notShowWhen: null, showWhen: Object.keys(CopyManga.category_param_dict) },
            { options: ["0-全部", "1-男性向", "2-女性向"], notShowWhen: null, showWhen: ["排行"] },
            { options: ["day-日榜", "week-周榜", "month-月榜"], notShowWhen: null, showWhen: ["排行"] }
        ]
    }

    // ========== 搜索 ==========
    search = {
        load: async (keyword, options, page) => {
            let author;
            if (keyword.startsWith("作者:")) author = keyword.substring("作者:".length).trim();
            let res;
            await this.throttle();
            if (author && author in this.author_path_word_dict) {
                let path_word = encodeURIComponent(this.author_path_word_dict[author]);
                res = await Network.get(`${this.apiUrl}/api/v3/comics?limit=30&offset=${(page - 1) * 30}&ordering=-datetime_updated&author=${path_word}`, this.headers)
            } else {
                let q_type = "";
                if (options && options[0]) q_type = options[0];
                keyword = encodeURIComponent(keyword)
                let search_url = this.loadSetting('search_api') === "webAPI" ? `${this.apiUrl}${CopyManga.searchApi}` : `${this.apiUrl}/api/v3/search/comic`
                res = await Network.get(`${search_url}?limit=30&offset=${(page - 1) * 30}&q=${keyword}&q_type=${q_type}`, this.headers)
            }
            if (res.status === 210) throw "210：访问过于频繁，已被官方风控限制，请等待1小时、切换海外线路或尝试点击设置里的“重置设备指纹池”";
            if (res.status !== 200) throw `Invalid status code: ${res.status}`
            let data = JSON.parse(res.body)
            function parseComic(comic) {
                if (comic["comic"] !== null && comic["comic"] !== undefined) comic = comic["comic"]
                let tags = []
                if (comic["theme"] !== null && comic["theme"] !== undefined) tags = comic["theme"].map(t => t["name"])
                let author = null
                if (Array.isArray(comic["author"]) && comic["author"].length > 0) author = comic["author"][0]["name"]
                return { id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags, description: comic["datetime_updated"] }
            }
            return { comics: data["results"]["list"].map(parseComic), maxPage: (data["results"]["total"] - (data["results"]["total"] % 21)) / 21 + 1 }
        },
        optionList: [{ type: "select", options: ["-全部", "name-名称", "author-作者", "local-汉化组"], label: "搜索选项" }]
    }

    // ========== 收藏（完整多账号） ==========
    favorites = {
        multiFolder: true,
        singleFolderForSingleComic: true,

        loadFolders: async (comicId) => {
            let folders = new Map();
            folders.set("-1", "全部");
            folders.set("0", "主号");
            let subAccounts = JSON.parse(this.loadSetting('sub_accounts') || '[]');
            for (let i = 0; i < subAccounts.length; i++) folders.set(String(i + 1), subAccounts[i].name);
            let favorited = [];
            if (comicId) favorited = await this._checkFavoriteAccounts(comicId);
            return { folders, favorited };
        },

        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            let token;
            if (folderId === "-1") throw "无法收藏到'全部'";
            if (folderId === "0") token = this.loadData("account_token_0");
            else token = this.loadData(`account_token_${folderId}`);
            if (!token) throw "未登录";
            let is_collect = isAdding ? 1 : 0;
            let headers = this._headersForToken(token);
            let reqId = await this.getReqID();
            let comicData = await Network.get(`${this.apiUrl}/api/v3/comic2/${comicId}?in_mainland=true&request_id=${reqId}&platform=3`, headers);
            if (comicData.status === 210) throw "210：访问过于频繁，请稍后再试";
            if (comicData.status !== 200) throw `Invalid status code: ${comicData.status}`;
            let comic_id = JSON.parse(comicData.body).results.comic.uuid;
            let res = await Network.post(`${this.apiUrl}/api/v3/member/collect/comic`, { ...headers, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, `comic_id=${comic_id}&is_collect=${is_collect}&authorization=Token+${token}`);
            if (res.status === 401) throw `Login expired`;
            if (res.status === 210) throw "210：操作过于频繁，请稍后再试";
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            return "ok";
        },

        loadComics: async (page, folder) => {
            if (String(folder) === "-1") return this._loadAllFavorites(page);
            let token;
            if (folder === "0") token = this.loadData("account_token_0");
            else token = this.loadData(`account_token_${folder}`);
            if (!token) throw "未登录";
            return this._loadSingleFavorites(token, page);
        }
    }

    // ---------- 辅助方法 ----------
    async _loadSingleFavorites(token, page) {
        let ordering = this.loadSetting('favorites_ordering') || '-datetime_updated';
        let result = await this._fetchFavoritesPage(token, (page - 1) * 30, ordering);
        function parseComic(comic) {
            if (comic["comic"] !== null && comic["comic"] !== undefined) comic = comic["comic"];
            let tags = [];
            if (comic["theme"] !== null && comic["theme"] !== undefined) tags = comic["theme"].map(t => t["name"]);
            let author = null;
            if (Array.isArray(comic["author"]) && comic["author"].length > 0) author = comic["author"][0]["name"];
            return { id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags, description: comic["datetime_updated"] };
        }
        return { comics: result.list.map(parseComic), maxPage: Math.ceil(result.total / 30) };
    }

    async _fetchFavoritesPage(token, offset, ordering, name) {
        let url = `${this.apiUrl}/api/v3/member/collect/comics?limit=30&offset=${offset}&free_type=1&ordering=${ordering}`;
        let res = await Network.get(url, this._headersForToken(token));
        if (res.status === 401) throw `${name ? name + " " : ""}Login expired`;
        if (res.status === 210) throw "210：访问过于频繁，请稍后再试";
        if (res.status !== 200) throw `Invalid status code: ${res.status}`;
        let data = JSON.parse(res.body);
        return { list: data.results.list, total: data.results.total };
    }

    async _checkFavoriteAccounts(comicId) {
        let subAccounts = JSON.parse(this.loadSetting('sub_accounts') || '[]');
        let totalAccounts = 1 + subAccounts.length;
        let checks = [];
        for (let i = 0; i < totalAccounts; i++) {
            checks.push((async () => {
                let token = this.loadData(`account_token_${i}`);
                if (!token) return null;
                try {
                    let headers = this._headersForToken(token);
                    let res = await Network.get(`${this.apiUrl}/api/v3/comic2/${comicId}/query`, headers);
                    if (res.status === 200) {
                        let data = JSON.parse(res.body);
                        if (data.results.collect != null) return String(i);
                    }
                } catch (e) {}
                return null;
            })());
        }
        let results = await Promise.all(checks);
        return results.filter(r => r !== null);
    }

    // ---------- 合并收藏流 ----------
    _clearMergeState() { this._mergeState = null; }

    async _initStreams() {
        let streams = [];
        let mainToken = this.loadData('account_token_0');
        if (mainToken) streams.push({ name: '主号', token: mainToken, eliminated: 0, total: -1 });
        let subAccounts = JSON.parse(this.loadSetting('sub_accounts') || '[]');
        for (let i = 0; i < subAccounts.length; i++) {
            let t = this.loadData(`account_token_${i + 1}`);
            if (!t) continue;
            streams.push({ name: subAccounts[i].name, token: t, eliminated: 0, total: -1 });
        }
        let pageCache = {};
        let seen = new Set();
        for (let s of streams) {
            try {
                let result = await this._fetchFavoritesPage(s.token, 0, '-datetime_updated', s.name);
                s.total = result.total;
                if (!pageCache[s.token]) pageCache[s.token] = {};
                pageCache[s.token][1] = result.list;
            } catch (e) {
                if (typeof UI !== 'undefined' && UI.showMessage) UI.showMessage(`${s.name}: ${e}`);
                else if (typeof APP !== 'undefined' && APP.toast) APP.toast(`${s.name}: ${e}`);
                else console.log(`${s.name}: ${e}`);
                s.total = 0;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        this._mergeState = { streams, pageCache, seen };
    }

    async _getPage(token, pageNo) {
        let pc = this._mergeState.pageCache;
        if (!pc[token]) pc[token] = {};
        let cached = pc[token][pageNo];
        if (cached) return cached;
        let result = await this._fetchFavoritesPage(token, (pageNo - 1) * 30, '-datetime_updated', '');
        pc[token][pageNo] = result.list;
        return result.list;
    }

    async _proportionalFindKth(streams, k) {
        const PAGE_SIZE = 30;
        while (true) {
            let active = streams.filter(s => s.total > 0 && s.eliminated < s.total);
            if (active.length === 0) return null;
            let M = active.length;
            if (k === 1 || k - 1 < M) {
                let best = null, bestDate = '';
                for (let s of active) {
                    let idx = s.eliminated;
                    let page = await this._getPage(s.token, Math.floor(idx / PAGE_SIZE) + 1);
                    let item = page[idx % PAGE_SIZE];
                    let dt = item.comic.datetime_updated || '';
                    if (!best || dt > bestDate) { best = { stream: s, item }; bestDate = dt; }
                }
                best.stream.eliminated++;
                if (k === 1) return best.item;
                k--;
                continue;
            }
            let totalRemaining = active.reduce((sum, s) => sum + s.total - s.eliminated, 0);
            let E = k - 1 - M;
            for (let s of active) {
                let remaining = s.total - s.eliminated;
                let bonus = Math.floor(E * remaining / totalRemaining);
                s._step = Math.min(remaining, 1 + bonus);
                s._probeIdx = s.eliminated + s._step - 1;
            }
            for (let s of active) {
                let pageNo = Math.floor(s._probeIdx / PAGE_SIZE) + 1;
                let wasCached = this._mergeState.pageCache[s.token] && this._mergeState.pageCache[s.token][pageNo];
                await this._getPage(s.token, pageNo);
                if (!wasCached) await new Promise(r => setTimeout(r, 500));
            }
            let bestStream = null, bestDate = '';
            for (let s of active) {
                let pageNo = Math.floor(s._probeIdx / PAGE_SIZE) + 1;
                let item = this._mergeState.pageCache[s.token][pageNo][s._probeIdx % PAGE_SIZE];
                let dt = item.comic.datetime_updated || '';
                if (!bestStream || dt > bestDate) { bestStream = s; bestDate = dt; }
            }
            bestStream.eliminated += bestStream._step;
            k -= bestStream._step;
        }
    }

    async _loadAllFavorites(page) {
        if (page === 1) this._clearMergeState();
        if (!this._mergeState) await this._initStreams();
        for (let s of this._mergeState.streams) s.eliminated = 0;
        let skipCount = (page - 1) * 30;
        if (skipCount > 0) await this._proportionalFindKth(this._mergeState.streams, skipCount);
        let uniqueItems = [];
        for (let i = 0; i < 30; i++) {
            let item = await this._proportionalFindKth(this._mergeState.streams, 1);
            if (!item) break;
            if (!this._mergeState.seen.has(item.comic.uuid)) {
                this._mergeState.seen.add(item.comic.uuid);
                uniqueItems.push(item);
            }
        }
        function parseComic(item) {
            let comic = item.comic;
            let tags = [];
            if (comic.theme) tags = comic.theme.map(t => t.name);
            let author = null;
            if (Array.isArray(comic.author) && comic.author.length > 0) author = comic.author[0].name;
            return { id: comic.path_word, title: comic.name, subTitle: author, cover: comic.cover, tags: tags, description: comic.datetime_updated };
        }
        let sumTotal = this._mergeState.streams.reduce((s, st) => s + Math.max(0, st.total), 0);
        let maxPage = Math.max(1, Math.ceil(sumTotal / 30));
        return { comics: uniqueItems.map(parseComic), maxPage: maxPage };
    }

    // ========== 漫画详情 ==========
    comic = {
        loadInfo: async (id) => {
            let getChapters = async (id, groups) => {
                let fetchSingle = async (id, path) => {
                    let reqId = await this.getReqID();
                    await this.throttle();
                    let res = await Network.get(`${this.apiUrl}/api/v3/comic/${id}/group/${path}/chapters?limit=100&offset=0&in_mainland=true&request_id=${reqId}`, this.headers);
                    if (res.status === 210) throw "210：章节列表访问过于频繁，已被官方风控限制，请尝试切换海外线路或点击设置里的“重置设备指纹池”";
                    if (res.status !== 200) throw `Invalid status code: ${res.status}`;
                    let data = JSON.parse(res.body);
                    let eps = new Map();
                    data.results.list.forEach((e) => { eps.set(e.uuid, e.name); });
                    let maxChapter = data.results.total;
                    if (maxChapter > 100) {
                        let offset = 100;
                        while (offset < maxChapter) {
                            await this.throttle();
                            res = await Network.get(`${this.apiUrl}/api/v3/comic/${id}/group/${path}/chapters?limit=100&offset=${offset}`, this.headers);
                            if (res.status === 210) throw "210：章节列表访问过于频繁，已被官方风控限制，请尝试切换海外线路或点击设置里的“重置设备指纹池”";
                            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
                            data = JSON.parse(res.body);
                            data.results.list.forEach((e) => { eps.set(e.uuid, e.name); });
                            offset += 100;
                        }
                    }
                    return eps;
                };
                let keys = Object.keys(groups);
                let result = {};
                let futures = [];
                for (let group of keys) {
                    let path = groups[group]["path_word"];
                    futures.push((async () => { result[group] = await fetchSingle(id, path); })());
                }
                await Promise.all(futures);
                if (this.isAppVersionAfter("1.3.0")) {
                    let sortedResult = new Map();
                    for (let key of keys) sortedResult.set(groups[key]["name"], result[key]);
                    return sortedResult;
                } else {
                    let merged = new Map();
                    for (let key of keys) for (let [k, v] of result[key]) merged.set(k, v);
                    return merged;
                }
            }

            let getFavoriteStatus = async (id) => {
                let favAccounts = await this._checkFavoriteAccounts(id);
                return favAccounts.length > 0;
            }
            let reqId = await this.getReqID();
            await this.throttle();
            let results = await Promise.all([
                Network.get(`${this.apiUrl}/api/v3/comic2/${id}?in_mainland=true&request_id=${reqId}&platform=3`, this.headers),
                getFavoriteStatus.bind(this)(id)
            ])
            if (results[0].status === 210) throw "210：漫画详情访问过于频繁，已被官方风控限制，请尝试切换海外线路或点击设置里的“重置设备指纹池”";
            if (results[0].status !== 200) throw `Invalid status code: ${results[0].status}`;
            let data = JSON.parse(results[0].body).results;
            let comicData = data.comic;
            let title = comicData.name;
            let cover = comicData.cover;
            let authors = comicData.author.map(e => e.name);
            if (Object.keys(this.author_path_word_dict).length > 100) this.author_path_word_dict = {};
            comicData.author.forEach(e => (this.author_path_word_dict[e.name] = e.path_word));
            let tags = comicData.theme.map(e => e?.name).filter(name => name !== undefined && name !== null);
            let updateTime = comicData.datetime_updated || "";
            let description = comicData.brief;
            let chapters = await getChapters(id, data.groups);
            let status = comicData.status.display;
            return {
                title, cover, description,
                tags: { "作者": authors, "更新": [updateTime], "标签": tags, "状态": [status] },
                chapters, isFavorite: results[1], subId: comicData.uuid
            }
        },
        loadEp: async (comicId, epId) => {
            let attempt = 0, maxAttempts = 6, res, data;
            while (attempt < maxAttempts) {
                try {
                    let reqId = await this.getReqID();
                    await this.throttle();
                    res = await Network.get(`${this.apiUrl}/api/v3/comic/${comicId}/chapter2/${epId}?in_mainland=true&request_id=${reqId}`, { ...this.headers });
                    if (res.status === 210) {
                        let waitTime = 10000 + attempt * 5000;
                        try {
                            let responseBody = JSON.parse(res.body);
                            if (responseBody.message && responseBody.message.includes("Expected available in")) {
                                let match = responseBody.message.match(/(\d+)\s*seconds/);
                                if (match && match[1]) waitTime = parseInt(match[1]) * 1000;
                            }
                        } catch (e) {}
                        console.log(`Chapter ${epId} 触发风控(210)，等待 ${waitTime / 1000}s 后重试 (${attempt + 1}/${maxAttempts})`);
                        await new Promise((resolve) => setTimeout(resolve, waitTime));
                        attempt++;
                        if (attempt >= maxAttempts) throw "210：章节内容加载频繁，已被官方风控限制。请尝试切换【海外线路】或点击设置里的“重置设备指纹池”。";
                        continue;
                    }
                    if (res.status !== 200) throw `Invalid status code: ${res.status}`;
                    data = JSON.parse(res.body);
                    let imagesUrls = data.results.chapter.contents.map((e) => e.url);
                    let orders = data.results.chapter.words;
                    let hdImagesUrls = imagesUrls.map((url) => url.replace(/([./])c\d+x\.[a-zA-Z]+$/, `$1c${this.imageQuality}x.webp`))
                    let images = new Array(hdImagesUrls.length).fill("");
                    for (let i = 0; i < hdImagesUrls.length; i++) images[orders[i]] = hdImagesUrls[i];
                    return { images };
                } catch (error) {
                    if (typeof error === 'string' && error.startsWith("210")) throw error;
                    attempt++;
                    if (attempt >= maxAttempts) throw error;
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                }
            }
        },
        loadComments: async (comicId, subId, page, replyTo) => {
            let url = `${this.apiUrl}/api/v3/comments?comic_id=${subId}&limit=20&offset=${(page - 1) * 20}`;
            if (replyTo) url = url + `&reply_id=${replyTo}&_update=true`;
            await this.throttle();
            let res = await Network.get(url, this.headers);
            if (res.status === 210) throw "210：评论加载频繁，请尝试点击设置里的“重置设备指纹池”";
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            let data = JSON.parse(res.body);
            let total = data.results.total;
            return {
                comments: data.results.list.map(e => ({
                    userName: replyTo ? `${e.user_name}  👉  ${e.parent_user_name}` : e.user_name,
                    avatar: e.user_avatar, content: e.comment, time: e.create_at, replyCount: e.count, id: e.id
                })),
                maxPage: (total - (total % 20)) / 20 + 1
            }
        },
        sendComment: async (comicId, subId, content, replyTo) => {
            let token = this.loadData("account_token_0");
            if (!token) throw "未登录";
            if (!replyTo) replyTo = '';
            await this.throttle();
            let res = await Network.post(`${this.apiUrl}/api/v3/member/comment`, { ...this.headers, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, `comic_id=${subId}&comment=${encodeURIComponent(content)}&reply_id=${replyTo}`);
            if (res.status === 401) throw `Login expired`;
            if (res.status === 210) throw "210：发送评论过于频繁，请尝试点击设置里的“重置设备指纹池”";
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            return "ok";
        },
        loadChapterComments: async (comicId, epId, page, replyTo) => {
            let url = `${this.apiUrl}/api/v3/roasts?chapter_id=${epId}&limit=20&offset=${(page - 1) * 20}`;
            await this.throttle();
            let res = await Network.get(url, this.headers);
            if (res.status === 210) throw "210：吐槽加载频繁，请尝试点击设置里的“重置设备指纹池”";
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            let data = JSON.parse(res.body);
            let total = data.results.total;
            return {
                comments: data.results.list.map(e => ({ userName: e.user_name, avatar: e.user_avatar, content: e.comment, time: e.create_at, replyCount: null, id: null })),
                maxPage: (total - (total % 20)) / 20 + 1
            }
        },
        sendChapterComment: async (comicId, epId, content, replyTo) => {
            let token = this.loadData("account_token_0");
            if (!token) throw "未登录";
            await this.throttle();
            let res = await Network.post(`${this.apiUrl}/api/v3/member/roast`, { ...this.headers, "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, `chapter_id=${epId}&roast=${encodeURIComponent(content)}`);
            if (res.status === 401) throw `Login expired`;
            if (res.status === 210) throw "210：评论过于频繁，请尝试点击设置里的“重置设备指纹池”";
            if (res.status !== 200) throw `Invalid status code: ${res.status}`;
            return "ok";
        },
        onClickTag: (namespace, tag) => {
            if (namespace === "标签") return { action: 'category', keyword: tag, param: null };
            if (namespace === "作者") return { action: 'search', keyword: `${namespace}:${tag}`, param: null };
            throw "未支持此类Tag检索";
        }
    }

    // ========== 设置项 ==========
    settings = {
        help: {
            title: "使用帮助",
            type: "callback",
            buttonText: "查看帮助",
            callback: () => {
                if (typeof UI !== 'undefined' && UI.showDialog) {
                    UI.showDialog("拷贝漫画多账号帮助",
`集成多账号收藏功能：
• 主账号：通过APP标准登录入口登录（用于评论、看漫画）
• 附属账号：在下方"附属账号列表"中配置，仅用于收藏合并
• 收藏："全部"视图合并所有账号收藏（去重），其他文件夹查看单个账号
• 排序方式仅对单个账号有效，"全部"固定按更新时间排序
附属账号配置格式：[{"name":"显示名","username":"用户名","password":"密码"}]
密码以明文存储，请注意安全。`, [{text: "知道了", callback: () => {}}]);
                }
            }
        },
        favorites_ordering: {
            title: "收藏排序方式",
            type: "select",
            options: [
                { value: '-datetime_updated', text: '更新时间' },
                { value: '-datetime_modifier', text: '收藏时间' },
                { value: '-datetime_browse', text: '阅读时间' }
            ],
            default: '-datetime_updated',
        },
        region: {
            title: "CDN线路",
            type: "select",
            options: [
                { value: "0", text: '海外线路 (推荐防风控)' },
                { value: "1", text: '大陆线路' }
            ],
            default: CopyManga.defaultCopyRegion,
        },
        image_quality: {
            title: "图片质量",
            type: "select",
            options: [
                { value: '800', text: '低 (800)' },
                { value: '1200', text: '中 (1200)' },
                { value: '1500', text: '高 (1500)' }
            ],
            default: CopyManga.defaultImageQuality,
        },
        search_api: {
            title: "搜索方式",
            type: "select",
            options: [
                { value: 'baseAPI', text: '基础API' },
                { value: 'webAPI', text: '网页端API' }
            ],
            default: 'baseAPI'
        },
        node_selection: {
            title: "节点选择",
            type: "select",
            options: [
                { value: 'www.2025copy.com', text: '2025copy.com（网页）' },
                { value: 'api.2025copy.com', text: '2025copy.com（api）' },
                { value: 'www.2026copy.com', text: '2026copy.com（网页）' },
                { value: 'api.2026copy.com', text: '2026copy.com（api）' },
                { value: 'www.2027copy.com', text: '2027copy.com（网页）' },
                { value: 'api.2027copy.com', text: '2027copy.com（api）' },
                { value: 'www.copy20.com', text: 'copy20.com（网页）' },
                { value: 'mapi.copy20.com', text: 'copy20.com（api）' },
                { value: 'www.mangacopy.com', text: 'mangacopy.com（网页）' },
                { value: 'www.copy-manga.com', text: 'copy-manga.com（网页）' },
                { value: 'api.copy-manga.com', text: 'copy-manga.com（api）' },
                { value: 'www.copymanga.tv', text: 'copymanga.tv（网页）' },
                { value: 'www.copy2000.online', text: 'copy2000.online（网页）' },
                { value: 'api.copy2000.online', text: 'copy2000.online（api）' },
                { value: 'www.copy2000.site', text: 'copy2000.site（网页）' },
                { value: 'mapi.copy2000.site', text: 'copy2000.site（api）' },
                { value: 'api.copy3000.com', text: 'copy3000.com（api）' },
                { value: 'custom', text: '自定义（使用API地址）' }
            ],
            default: 'custom',
            description: "选择预置节点，或选择“自定义”以使用下方“API地址”输入框中的域名"
        },
        base_url: {
            title: "API地址",
            type: "input",
            validator: '^(?!:\\/\\/)(?=.{1,253})([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$',
            default: CopyManga.defaultApiUrl,
            description: "当节点选择为“自定义”时生效"
        },
        // ---------- 优化后的速度测试 ----------
        speedtest: {
            title: "节点速度测试",
            type: "callback",
            buttonText: "测试所有节点速度",
            callback: async function() {
                const self = this;
                if (typeof UI !== 'undefined' && UI.showLoading) {
                    UI.showLoading('正在测试节点速度...');
                }
                try {
                    const hosts = [
                        'www.2025copy.com',
                        'api.2025copy.com',
                        'www.2026copy.com',
                        'api.2026copy.com',
                        'www.2027copy.com',
                        'api.2027copy.com',
                        'www.copy20.com',
                        'mapi.copy20.com',
                        'www.mangacopy.com',
                        'www.copy-manga.com',
                        'api.copy-manga.com',
                        'www.copymanga.tv',
                        'www.copy2000.online',
                        'api.copy2000.online',
                        'www.copy2000.site',
                        'api.copy2000.site',
                        'api.copy3000.com'
                    ];
                    // 使用并行请求，每个请求设置5秒超时
                    const timeoutPromise = (ms) => new Promise(resolve => setTimeout(resolve, ms));
                    const testHost = async (host) => {
                        const start = Date.now();
                        try {
                            const fetchPromise = Network.get(`https://${host}/`, {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                            });
                            const res = await Promise.race([fetchPromise, timeoutPromise(5000)]);
                            if (res === undefined) {
                                // 超时
                                return { host, success: false, latency: 999999, status: 0, timeout: true };
                            }
                            const latency = Date.now() - start;
                            if (res.status === 200) {
                                const body = res.body.toLowerCase();
                                const isValid = body.includes('content-box') || body.includes('swiperlist') || body.includes('comicrank');
                                return { host, success: isValid, latency, status: res.status };
                            } else {
                                return { host, success: false, latency, status: res.status };
                            }
                        } catch (e) {
                            return { host, success: false, latency: 999999, status: 0 };
                        }
                    };
                    // 并发执行所有测试
                    const promises = hosts.map(host => testHost(host));
                    const resultsArray = await Promise.allSettled(promises);
                    const results = {};
                    for (const result of resultsArray) {
                        if (result.status === 'fulfilled' && result.value) {
                            const r = result.value;
                            results[r.host] = {
                                success: r.success,
                                latency: r.latency,
                                status: r.status
                            };
                        } else {
                            // 如果某个请求完全失败，标记为超时
                            // 但由于上面已有超时机制，这里仅作兜底
                        }
                    }
                    let msg = "节点速度测试结果：\n";
                    const sorted = Object.entries(results).sort((a, b) => a[1].latency - b[1].latency);
                    for (const [host, result] of sorted) {
                        const status = result.success ? '✅' : '❌';
                        const latency = result.latency >= 999999 ? '超时' : `${result.latency}ms`;
                        msg += `${status} ${host} : ${latency}\n`;
                    }
                    if (typeof UI !== 'undefined' && UI.hideLoading) UI.hideLoading();
                    if (typeof UI !== 'undefined' && UI.showDialog) {
                        UI.showDialog("节点速度测试结果", msg, [{text: "确定", callback: () => {}}]);
                    } else {
                        alert(msg);
                    }
                } catch (e) {
                    if (typeof UI !== 'undefined' && UI.hideLoading) UI.hideLoading();
                    if (typeof UI !== 'undefined' && UI.showMessage) {
                        UI.showMessage('测试失败：' + e.message);
                    } else {
                        alert('测试失败：' + e.message);
                    }
                }
            }
        },
        // ---------- 重置设备指纹池 ----------
        clear_device_info: {
            title: "重置设备指纹池",
            type: "callback",
            buttonText: "点击切换真实设备指纹",
            callback: async () => {
                this.deleteData("_deviceinfo");
                this.deleteData("_device");
                this.deleteData("_pseudoid");
                await this.refreshAppApi();
                if (typeof UI !== 'undefined' && UI.showMessage) {
                    UI.showMessage('设备指纹已重置');
                } else if (typeof APP !== 'undefined' && APP.toast) {
                    APP.toast('设备指纹已重置');
                } else {
                    alert('设备指纹已重置');
                }
            }
        },
        // ---------- 附属账号管理 ----------
        sub_accounts: {
            title: "附属账号列表",
            type: "input",
            default: "[{\"name\":\"小号1\",\"username\":\"用户名1\",\"password\":\"密码1\"}]",
            description: "仅用于收藏合并。主账号请通过APP标准登录入口登录"
        },
        login_sub_accounts: {
            title: "登录附属账号",
            type: "callback",
            buttonText: "登录所有附属账号",
            callback: async () => {
                let subAccounts = JSON.parse(this.loadSetting('sub_accounts') || '[]');
                let ok = 0;
                for (let i = 0; i < subAccounts.length; i++) {
                    let acc = subAccounts[i];
                    let salt = Math.floor(1000 + Math.random() * 9000);
                    let base64 = Convert.encodeBase64(Convert.encodeUtf8(`${acc.password}-${salt}`));
                    let res = await Network.post(
                        `${this.apiUrl}/api/v3/login`,
                        {
                            ...this._headersForToken(""),
                            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
                        },
                        `username=${acc.username}&password=${base64}\n&salt=${salt}&authorization=Token+`
                    );
                    if (res.status === 200) {
                        let data = JSON.parse(res.body);
                        this.saveData(`account_token_${i + 1}`, data.results.token);
                        ok++;
                    }
                }
                const msg = `附属账号登录: ${ok}/${subAccounts.length} 成功`;
                if (typeof UI !== 'undefined' && UI.showMessage) {
                    UI.showMessage(msg);
                } else if (typeof APP !== 'undefined' && APP.toast) {
                    APP.toast(msg);
                } else {
                    alert(msg);
                }
            }
        },
        clear_sub_accounts: {
            title: "清除附属账号",
            type: "callback",
            buttonText: "清除所有附属账号TOKEN",
            callback: async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                let subAccounts = JSON.parse(this.loadSetting('sub_accounts') || '[]');
                if (subAccounts.length === 0) {
                    const msg = "没有附属账号需要清除";
                    if (typeof UI !== 'undefined' && UI.showMessage) {
                        UI.showMessage(msg);
                    } else if (typeof APP !== 'undefined' && APP.toast) {
                        APP.toast(msg);
                    } else {
                        alert(msg);
                    }
                    return;
                }
                for (let i = 0; i < subAccounts.length; i++) {
                    this.deleteData(`account_token_${i + 1}`);
                }
                this._clearMergeState();
                await new Promise(resolve => setTimeout(resolve, 800));
                const msg = "已清除所有附属账号TOKEN";
                if (typeof UI !== 'undefined' && UI.showMessage) {
                    UI.showMessage(msg);
                } else if (typeof APP !== 'undefined' && APP.toast) {
                    APP.toast(msg);
                } else {
                    alert(msg);
                }
            }
        }
    }

    // ========== 工具方法 ==========
    isAppVersionAfter(target) {
        let current = APP.version
        let targetArr = target.split('.')
        let currentArr = current.split('.')
        for (let i = 0; i < 3; i++) {
            if (parseInt(currentArr[i]) < parseInt(targetArr[i])) return false
        }
        return true
    }

    async refreshSearchApi() {
        let url = "https://www.copy20.com/search"
        let res = await fetch(url)
        let searchApi = ""
        if (res.status === 200) {
            let text = await res.text()
            let match = text.match(/const countApi = "([^"]+)"/)
            if (match && match[1]) CopyManga.searchApi = match[1]
        }
    }

    async refreshAppApi() {
        const url = "https://api.copy-manga.com/api/v3/system/network2?platform=3"
        const res = await fetch(url, { headers: this.headers });
        if (res.status === 200) {
            let data = await res.json();
            this.settings.base_url = data.results.api[0][0];
        }
    }
}