class HotManga extends ComicSource {
  name = "热辣漫画";
  key = "hot_manga";
  version = "2.1.9";
  minAppVersion = "1.6.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/hot_manga.js";

  // ========== 预置 API 节点列表 ==========
  static apiNodes = [
    "mapi.fgjfghkkcenter.club",
    "mapi.fgjfghkk.club",
    "mapi.elfgjfghkk.club",
    "mapi.hotmangasd.com",
    "mapi.hotmangasg.com",
    "mapi.hotmangasf.com",
    "api.2024manga.com",
    "www.2024manga.com",
    "api.manga2025.com",
    "www.manga2025.com",
    "api.manga2026.xyz",
    "www.manga2026.xyz"   // 新增网页节点
  ];

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

  // ========== 静态配置 ==========
  static defaultImageQuality = "1500";
  static defaultApiUrl = "api.2024manga.com";

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
      let item = HotManga.realDevicePool[Math.floor(Math.random() * HotManga.realDevicePool.length)];
      info = item.deviceinfo;
      this.saveData("_deviceinfo", info);
      this.saveData("_device", item.device);
    }
    return info;
  }

  get device() {
    let dev = this.loadData("_device");
    if (!dev) {
      let item = HotManga.realDevicePool[Math.floor(Math.random() * HotManga.realDevicePool.length)];
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
    let base = (node && node !== 'custom') ? node : (this.loadSetting('base_url') || HotManga.defaultApiUrl);
    return `https://${base}`;
  }

  get imageQuality() {
    return this.loadSetting('image_quality') || HotManga.defaultImageQuality;
  }

  // ========== Headers ==========
  _headersForToken(token) {
    let headers = {
      Accept: "application/json",
      webp: "1",
      platform: "3",
      version: "2024.04.28",
      "X-Requested-With": "com.manga2020.app",
    };
    if (token) {
      headers["Authorization"] = `Token ${token}`;
    }
    return headers;
  }

  get headers() {
    let token = this.loadData("account_token_0") || this.loadData("token") || "";
    if (token && !this.loadData("account_token_0")) {
      this.saveData("account_token_0", token);
      this.deleteData("token");
    }
    return this._headersForToken(token);
  }

  // ========== 附属账号存储（不依赖设置项） ==========
  _getSubAccounts() {
    let data = this.loadData('sub_accounts');
    if (data) {
      try {
        let arr = JSON.parse(data);
        if (Array.isArray(arr)) return arr;
      } catch(e) {}
    }
    return [];
  }

  _setSubAccounts(arr) {
    this.saveData('sub_accounts', JSON.stringify(arr));
  }

  // ========== 初始化 ==========
  init() {
    this.author_path_word_dict = {};
    this._clearMergeState();
    let oldToken = this.loadData("token");
    if (oldToken && !this.loadData("account_token_0")) {
      this.saveData("account_token_0", oldToken);
      this.deleteData("token");
    }
    if (!this.loadData('sub_accounts')) {
      this.saveData('sub_accounts', '[]');
    }
  }

  // ========== 主账号 ==========
  account = {
    login: async (account, pwd) => {
      let salt = Math.floor(1000 + Math.random() * 9000);
      let base64 = Convert.encodeBase64(Convert.encodeUtf8(`${pwd}-${salt}`));
      await this.throttle();
      let res = await Network.post(
        `${this.apiUrl}/api/v3/login`,
        {
          ...this._headersForToken(""),
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
        },
        `username=${account}&password=${base64}&salt=${salt}&source=Official&version=2.2.0&platform=3`
      );
      if (res.status === 200) {
        let data = JSON.parse(res.body);
        let token = data.results.token;
        this.saveData('account_token_0', token);
        this.deleteData('token');
        return "ok";
      } else {
        throw `Invalid Status Code ${res.status}`;
      }
    },
    logout: () => {
      this.deleteData('account_token_0');
      this.deleteData('token');
    },
    registerWebsite: "https://www.manga2026.com/web/login/loginByAccount"
  };

  // ========== 探索页 ==========
  explore = [
    {
      title: "热辣漫画",
      type: "singlePageWithMultiPart",
      load: async () => {
        await this.throttle();
        let dataStr = await Network.get(
          `${this.apiUrl}/api/v3/h5/homeIndex`,
          this.headers
        );
        if (dataStr.status === 210) throw "210：访问过于频繁，已被官方风控限制，请等待1小时或切换网络";
        if (dataStr.status !== 200) throw `Invalid status code: ${dataStr.status}`;
        let data = JSON.parse(dataStr.body);

        function parseComic(comic) {
          if (comic["comic"] !== null && comic["comic"] !== undefined) comic = comic["comic"];
          let tags = [];
          if (comic["theme"] !== null && comic["theme"] !== undefined) tags = comic["theme"].map(t => t["name"]);
          let author = null;
          if (Array.isArray(comic["author"]) && comic["author"].length > 0) author = comic["author"][0]["name"];
          return { id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags };
        }

        let showPaid = this.loadSetting('show_paid_content') !== "0";
        let res = {};
        if (showPaid) {
          res["推荐漫画"] = data["results"]["recComics"]["list"].map(parseComic);
          res["每周付费漫画排行"] = data["results"]["rankWeeklyChargeComics"]["list"].map(parseComic);
          res["付费漫画更新"] = data["results"]["updateWeeklyChargeComics"]["list"].map(parseComic);
        }
        res["每周免费漫画排行"] = data["results"]["rankWeeklyFreeComics"]["list"].map(parseComic);
        res["免费漫画更新"] = data["results"]["updateWeeklyFreeComics"]["list"].map(parseComic);
        return res;
      }
    }
  ];

  // ========== 分类 ==========
  static category_param_dict = {
    全部: "", 愛情: "aiqing", 歡樂向: "huanlexiang", 冒險: "maoxian", 奇幻: "qihuan",
    百合: "baihe", 校园: "xiaoyuan", 科幻: "kehuan", 東方: "dongfang", 耽美: "danmei",
    生活: "shenghuo", 格鬥: "gedou", 轻小说: "qingxiaoshuo", 其他: "qita", 悬疑: "xuanyi",
    TL: "teenslove", 萌系: "mengxi", 神鬼: "shengui", 职场: "zhichang", 治愈: "zhiyu",
    节操: "jiecao", 四格: "sige", 長條: "changtiao", 舰娘: "jianniang", 搞笑: "gaoxiao",
    竞技: "jingji", 伪娘: "weiniang", 魔幻: "mohuan", 热血: "rexue", 性转换: "xingzhuanhuan",
    美食: "meishi", 励志: "lizhi", 彩色: "COLOR", 後宮: "hougong", 侦探: "zhentan",
    惊悚: "jingsong", AA: "aa", 音乐舞蹈: "yinyuewudao", 异世界: "yishijie", 战争: "zhanzheng",
    历史: "lishi", 机战: "jizhan", 都市: "dushi", 穿越: "chuanyue", 恐怖: "kongbu",
    生存: "shengcun", 武侠: "wuxia", 宅系: "zhaixi", 转生: "zhuansheng", 無修正: "Uncensored",
    仙侠: "xianxia", LoveLive: "loveLive",
    C95: "comiket95", C96: "comiket96", C97: "comiket97", C98: "C98", C99: "comiket99",
    C100: "comiket100", C101: "comiket101", C102: "comiket102", C103: "comiket103",
    C104: "comiket104", C105: "comiket105",
    玄幻: "xuanhuan", 異能: "yineng", 遊戲: "youxi", 真人: "zhenren",
    雜誌附贈寫真集: "zazhifuzengxiezhenji", FATE: "fate"
  };

  static homepage_param_dict = {
    全彩: "color", 韩漫: "korea", 单行本: "volume", 已完结: "finish", 同志: "yaoi"
  };

  category = {
    title: "热辣漫画",
    parts: [
      { name: "免费漫画排行", type: "fixed", categories: ["排行"], categoryParams: ["ranking"], itemType: "category" },
      { name: "免费漫画主题", type: "fixed", categories: Object.keys(HotManga.category_param_dict), categoryParams: Object.values(HotManga.category_param_dict), itemType: "category" },
      { name: "主页", type: "fixed", categories: Object.keys(HotManga.homepage_param_dict), categoryParams: Object.values(HotManga.homepage_param_dict), itemType: "category" }
    ]
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      let category_url;
      if (category === "排行" || param === "ranking") {
        category_url = `${this.apiUrl}/api/v3/ranks?free_type=1&limit=30&offset=${(page - 1) * 30}&_update=true&type=1&region=${options[0]}&date_type=${options[1]}`;
      } else if (Object.keys(HotManga.homepage_param_dict).includes(category)) {
        category_url = `${this.apiUrl}/api/v3/h5/homeIndex/comics?limit=20&offset=${(page - 1) * 20}&top=${param}&ordering=${options[0]}`;
      } else {
        if (category !== undefined && category !== null) param = HotManga.category_param_dict[category] || "";
        options = options.map(e => e.replace("*", "-"));
        category_url = `${this.apiUrl}/api/v3/comics?free_type=1&limit=30&offset=${(page - 1) * 30}&ordering=${options[0]}&theme=${param}`;
      }
      await this.throttle();
      let res = await Network.get(category_url, this.headers);
      if (res.status === 210) throw "210：访问过于频繁，请稍后再试";
      if (res.status !== 200) throw `Invalid status code: ${res.status}`;
      let data = JSON.parse(res.body);
      function parseComic(comic) {
        let sort = null, popular = 0, rise_sort = 0;
        if (comic["sort"] !== null && comic["sort"] !== undefined) { sort = comic["sort"]; rise_sort = comic["rise_sort"]; popular = comic["popular"]; }
        if (comic["comic"] !== null && comic["comic"] !== undefined) comic = comic["comic"];
        let tags = [];
        if (comic["theme"] !== null && comic["theme"] !== undefined) tags = comic["theme"].map(t => t["name"]);
        let author = null, author_num = 0;
        if (Array.isArray(comic["author"]) && comic["author"].length > 0) { author = comic["author"][0]["name"]; author_num = comic["author"].length; }
        if (sort !== null) {
          return {
            id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags,
            description: `${sort} ${rise_sort > 0 ? '▲' : rise_sort < 0 ? '▽' : '-'}\n${author_num > 1 ? `${author} 等${author_num}位` : author}\n🔥${(popular / 10000).toFixed(1)}W`
          };
        } else {
          return { id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags, description: comic["datetime_updated"] };
        }
      }
      return { comics: data["results"]["list"].map(parseComic), maxPage: (data["results"]["total"] - (data["results"]["total"] % 21)) / 21 + 1 };
    },
    optionList: [
      { options: ["-非韩漫", "1-韩漫"], notShowWhen: null, showWhen: ["排行"] },
      { options: ["day-上升最快", "week-最近7天", "month-最近30天", "total-總榜單"], notShowWhen: null, showWhen: ["排行"] },
      { options: ["*datetime_updated-时间倒序", "datetime_updated-时间正序", "*popular-热度倒序", "popular-热度正序"], notShowWhen: null, showWhen: Object.keys(HotManga.category_param_dict) },
      { options: ["*datetime_updated-时间倒序", "datetime_updated-时间正序", "*popular-热度倒序", "popular-热度正序"], notShowWhen: null, showWhen: Object.keys(HotManga.homepage_param_dict) }
    ]
  };

  // ========== 搜索 ==========
  search = {
    load: async (keyword, options, page) => {
      let author;
      if (keyword.startsWith("作者:")) author = keyword.substring("作者:".length).trim();
      let res;
      await this.throttle();
      if (author && author in this.author_path_word_dict) {
        let path_word = encodeURIComponent(this.author_path_word_dict[author]);
        res = await Network.get(`${this.apiUrl}/api/v3/comics?limit=30&offset=${(page - 1) * 30}&ordering=-datetime_updated&author=${path_word}`, this.headers);
      } else {
        res = await Network.get(`${this.apiUrl}/api/v3/search/comic?platform=3&q=${encodeURIComponent(keyword)}&limit=20&offset=${(page - 1) * 20}&free_type=1&_update=true`, this.headers);
      }
      if (res.status === 210) throw "210：搜索过于频繁，请稍后再试";
      if (res.status !== 200) throw `Invalid status code: ${res.status}`;
      let data = JSON.parse(res.body);
      function parseComic(comic) {
        if (comic["comic"] !== null && comic["comic"] !== undefined) comic = comic["comic"];
        let tags = [];
        if (comic["theme"] !== null && comic["theme"] !== undefined) tags = comic["theme"].map(t => t["name"]);
        let author = null;
        if (Array.isArray(comic["author"]) && comic["author"].length > 0) author = comic["author"][0]["name"];
        return { id: comic["path_word"], title: comic["name"], subTitle: author, cover: comic["cover"], tags: tags, description: comic["datetime_updated"] };
      }
      return { comics: data["results"]["list"].map(parseComic), maxPage: (data["results"]["total"] - (data["results"]["total"] % 21)) / 21 + 1 };
    },
    optionList: []
  };

  // ========== 收藏（多账号合并） ==========
  favorites = {
    multiFolder: true,
    singleFolderForSingleComic: true,

    loadFolders: async (comicId) => {
      let folders = new Map();
      folders.set("-1", "全部");
      folders.set("0", "主号");
      let subAccounts = this._getSubAccounts();
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
      let comicData = await Network.get(`${this.apiUrl}/api/v3/comic2/${comicId}?in_mainland=true&platform=3`, headers);
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
  };

  // ---------- 收藏辅助方法 ----------
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
    let subAccounts = this._getSubAccounts();
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
    let subAccounts = this._getSubAccounts();
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
          await this.throttle();
          let res = await Network.get(`${this.apiUrl}/api/v3/comic/${id}/group/${path}/chapters?limit=100&offset=0`, this.headers);
          if (res.status === 210) throw "210：章节列表访问过于频繁，请稍后再试";
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
              if (res.status === 210) throw "210：章节列表访问过于频繁，请稍后再试";
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
      };

      let getFavoriteStatus = async (id) => {
        let favAccounts = await this._checkFavoriteAccounts(id);
        return favAccounts.length > 0;
      };

      await this.throttle();
      let results = await Promise.all([
        Network.get(`${this.apiUrl}/api/v3/comic2/${id}?in_mainland=true&platform=3`, this.headers),
        getFavoriteStatus.bind(this)(id)
      ]);
      if (results[0].status === 210) throw "210：漫画详情访问过于频繁，请稍后再试";
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
      };
    },

    loadEp: async (comicId, epId) => {
      let attempt = 0, maxAttempts = 6, res, data;
      while (attempt < maxAttempts) {
        try {
          await this.throttle();
          res = await Network.get(`${this.apiUrl}/api/v3/comic/${comicId}/chapter/${epId}?platform=3&_update=true`, { ...this.headers });
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
            if (attempt >= maxAttempts) throw "210：章节内容加载频繁，已被官方风控限制。请稍后再试或切换网络。";
            continue;
          }
          if (res.status !== 200) throw `Invalid status code: ${res.status}`;
          data = JSON.parse(res.body);
          let imagesUrls = data.results.chapter.contents.map((e) => e.url);
          let hdImagesUrls = imagesUrls.map((url) =>
            url.replace(/\.jpg\.h\d+x\.jpg$/, `.jpg.h${this.imageQuality}x.jpg`)
          );
          return { images: hdImagesUrls };
        } catch (error) {
          if (typeof error === 'string' && error.startsWith("210")) throw error;
          attempt++;
          if (attempt >= maxAttempts) throw error;
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    },

    onClickTag: (namespace, tag) => {
      if (namespace === "标签") return { action: 'category', keyword: tag, param: null };
      if (namespace === "作者") return { action: 'search', keyword: `${namespace}:${tag}`, param: null };
      throw "未支持此类Tag检索";
    },

    // ========== 链接解析跳转（支持 www. 和 m.） ==========
    link: {
      domains: [
        'www.2024manga.com',
        'www.manga2025.com',
        'www.manga2026.xyz',
        'm.2024manga.com',
        'm.manga2025.com',
        'm.manga2026.xyz'
      ],
      linkToId: (url) => {
        // 匹配 /v2h5/details/comic/{path_word}
        let match = url.match(/\/v2h5\/details\/comic\/([^\/?#]+)/);
        return match ? match[1] : null;
      }
    }
  };

  // ========== 设置项 ==========
  settings = {
    help: {
      title: "使用帮助",
      type: "callback",
      buttonText: "查看帮助",
      callback: () => {
        if (typeof UI !== 'undefined' && UI.showDialog) {
          UI.showDialog("热辣漫画多账号帮助",
`• 主账号：通过登录入口登录，退出登录可清除主账号Token，不影响附属账号。
• 附属账号：点击「添加附属账号」依次输入显示名称、用户名、密码，配置后需点击「登录所有附属账号」获取Token。收藏文件夹中会按顺序显示主号、各附属号，以及一个「全部」合并视图（去重，按更新时间排序）。
• 收藏：可对单部漫画进行收藏/取消收藏，选择主号或某个附属号操作。「全部」视图自动合并所有账号的收藏，并按更新时间倒序排列，重复项自动去重。
• API地址：默认使用 api.2024manga.com，您也可以从下拉列表中选择其他节点，或自定义输入。
• 图片质量：低(800)、中(1200)、高(1500)，影响加载清晰度与流量消耗。
• 收藏排序方式：可单独设置各账号收藏列表的排序（更新时间、收藏时间、阅读时间），仅对单个账号有效，「全部」固定按更新时间。
• 发现页付费内容开关：可隐藏推荐漫画、每周付费漫画排行、付费漫画更新。更改后需刷新页面（重新加载插件）才能生效。
• 密码以明文存储，请注意安全。`, [{text: "知道了", callback: () => {}}]);
        }
      }
    },

    show_paid_content: {
      title: "发现页显示付费内容",
      type: "select",
      options: [
        { value: "1", text: "显示" },
        { value: "0", text: "隐藏" }
      ],
      default: "1",
      description: "更改后需刷新页面（重新加载插件）才能生效"
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

    image_quality: {
      title: "图片质量",
      type: "select",
      options: [
        { value: '800', text: '低 (800)' },
        { value: '1200', text: '中 (1200)' },
        { value: '1500', text: '高 (1500)' }
      ],
      default: HotManga.defaultImageQuality,
    },

    node_selection: {
      title: "节点选择",
      type: "select",
      options: (() => {
        let opts = [];
        for (let node of HotManga.apiNodes) {
          // 同时识别 www. 和 m. 开头的节点为网页节点
          let isWeb = node.startsWith("www.") || node.startsWith("m.");
          let display = node.replace(/^[^.]*\./, '') + (isWeb ? "（网页）" : "（api）");
          opts.push({ value: node, text: display });
        }
        opts.push({ value: 'custom', text: '自定义 (使用下方API地址)' });
        return opts;
      })(),
      default: 'custom',
      description: "选择预置节点，或选择“自定义”以使用下方“API地址”输入框中的域名"
    },

    base_url: {
      title: "API地址",
      type: "input",
      validator: '^(?!:\\/\\/)(?=.{1,253})([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$',
      default: HotManga.defaultApiUrl,
      description: "当节点选择为“自定义”时生效，仅填写域名（如 api.2024manga.com）"
    },

    speedtest: {
      title: "节点速度测试",
      type: "callback",
      buttonText: "测试所有节点速度",
      callback: async () => {
        if (typeof UI !== 'undefined' && UI.showLoading) {
          UI.showLoading('正在测试所有节点速度...');
        }
        try {
          const hosts = HotManga.apiNodes;
          const timeoutPromise = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          const testHost = async (host) => {
            const start = Date.now();
            try {
              const fetchPromise = Network.get(`https://${host}/api/v3/h5/homeIndex`, this.headers);
              const res = await Promise.race([fetchPromise, timeoutPromise(5000)]);
              if (res === undefined) {
                return { host, success: false, latency: 999999, status: 0, timeout: true };
              }
              const latency = Date.now() - start;
              const isSuccess = (res.status >= 200 && res.status < 400) && res.body && res.body.length > 0;
              return { host, success: isSuccess, latency, status: res.status };
            } catch (e) {
              return { host, success: false, latency: 999999, status: 0 };
            }
          };
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

    clear_device_info: {
      title: "重置设备指纹池",
      type: "callback",
      buttonText: "点击切换真实设备指纹",
      callback: async () => {
        this.deleteData("_deviceinfo");
        this.deleteData("_device");
        this.deleteData("_pseudoid");
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
    add_sub_account: {
      title: "添加附属账号",
      type: "callback",
      buttonText: "添加附属账号（弹窗输入）",
      callback: async () => {
        let name = await UI.showInputDialog("附属账号 - 显示名称", (v) => v && v.trim() ? null : "名称不能为空");
        if (!name) return;
        name = name.trim();
        let username = await UI.showInputDialog("附属账号 - 用户名", (v) => v && v.trim() ? null : "用户名不能为空");
        if (!username) return;
        username = username.trim();
        let password = await UI.showInputDialog("附属账号 - 密码", (v) => v ? null : "密码不能为空");
        if (!password) return;
        let subs = this._getSubAccounts();
        subs.push({ name, username, password });
        this._setSubAccounts(subs);
        UI.showMessage(`已添加附属账号「${name}」，请点击「登录所有附属账号」完成登录`);
      }
    },

    manage_sub_accounts: {
      title: "管理附属账号",
      type: "callback",
      buttonText: "查看 / 删除附属账号",
      callback: async () => {
        let subs = this._getSubAccounts();
        if (subs.length === 0) {
          UI.showMessage("还没有附属账号，请先点「添加附属账号」");
          return;
        }
        let options = subs.map((s, i) => `${i + 1}. ${s.name} (${s.username})`);
        options.push("清空全部附属账号");
        let idx = await UI.showSelectDialog("选择要删除的附属账号", options);
        if (idx === null || idx === undefined) return;
        if (idx === subs.length) {
          UI.showDialog("确认清空", `将删除全部 ${subs.length} 个附属账号配置及其 token，确定？`, [
            { text: "清空", style: "danger", callback: () => {
              for (let i = 0; i < subs.length; i++) this.deleteData(`account_token_${i + 1}`);
              this._setSubAccounts([]);
              this._clearMergeState();
              UI.showMessage("已清空全部附属账号");
            }},
            { text: "取消", callback: () => {} }
          ]);
          return;
        }
        let target = subs[idx];
        UI.showDialog("确认删除", `删除「${target.name}」(${target.username})？`, [
          { text: "删除", style: "danger", callback: () => {
            for (let i = idx; i < subs.length - 1; i++) {
              let t = this.loadData(`account_token_${i + 2}`);
              if (t) this.saveData(`account_token_${i + 1}`, t);
            }
            this.deleteData(`account_token_${subs.length}`);
            subs.splice(idx, 1);
            this._setSubAccounts(subs);
            this._clearMergeState();
            UI.showMessage(`已删除「${target.name}」`);
          }},
          { text: "取消", callback: () => {} }
        ]);
      }
    },

    login_sub_accounts: {
      title: "登录附属账号",
      type: "callback",
      buttonText: "登录所有附属账号",
      callback: async () => {
        let subAccounts = this._getSubAccounts();
        if (subAccounts.length === 0) {
          UI.showMessage("没有附属账号，请先添加");
          return;
        }
        if (typeof UI !== 'undefined' && UI.showMessage) {
          UI.showMessage('正在登录附属账号...');
        } else if (typeof APP !== 'undefined' && APP.toast) {
          APP.toast('正在登录附属账号...');
        }
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
            `username=${acc.username}&password=${base64}&salt=${salt}&source=Official&version=2.2.0&platform=3`
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
    }
  };

  // ========== 工具方法 ==========
  isAppVersionAfter(target) {
    let current = APP.version;
    let targetArr = target.split('.');
    let currentArr = current.split('.');
    for (let i = 0; i < 3; i++) {
      if (parseInt(currentArr[i]) < parseInt(targetArr[i])) return false;
    }
    return true;
  }
}