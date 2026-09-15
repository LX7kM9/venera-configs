class BiliManga extends ComicSource {
  name = "哔哩漫画";
  key = "bilimanga";
  version = "1.5.0"; // 合并无括号版的移动端 Client Hints 与扩展分类
  minAppVersion = "1.6.0";

  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/bilimanga.js";

  get baseUrl() {
    return "https://www.bilimanga.net";
  }

  // 合并：保留有括号版的 Referer/搜索守卫，加入无括号版的移动端 Client Hints。
  pageHeaders() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Referer": "https://www.bilimanga.net/",
      "sec-ch-ua": '"Chromium";v="125", "Not.A/Brand";v="24"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
    };
  }

  init() {
    try {
      Network.setCookies(this.baseUrl, [
        new Cookie({ name: "night", value: "0", domain: "www.bilimanga.net" }),
      ]);
    } catch (e) {}
  }

  account = {
    loginWithWebview: {
      url: "https://www.bilimanga.net/login.php",
      checkStatus: (url, title) => {
        return (
          url.indexOf("bilimanga.net") !== -1 &&
          url.indexOf("/login.php") === -1
        );
      },
    },
    logout: () => {
      Network.deleteCookies("https://www.bilimanga.net/");
      try {
        Network.setCookies("https://www.bilimanga.net/", [
          new Cookie({ name: "night", value: "0", domain: "www.bilimanga.net" }),
        ]);
      } catch (e) {}
    },
    registerWebsite: "https://www.bilimanga.net/register.php",
  };

  async fetchBody(label, url) {
    let res = await Network.get(url, this.pageHeaders());
    if (res.status !== 200) throw label + " 请求失败: " + res.status;
    return res.body;
  }

  _abs(url) {
    if (!url) return "";
    let s = String(url);
    if (s.startsWith("//")) return "https:" + s;
    if (s.startsWith("/")) return "https://www.bilimanga.net" + s;
    if (!/^https?:/i.test(s)) return "https://www.bilimanga.net/" + s;
    return s;
  }

  // ===== search_guard 处理 =====
  // 保留有括号版的完整搜索守卫流程。
  async _runSearchGuard() {
    if (this._guardExpire && Date.now() < this._guardExpire) return;

    let t = Date.now();

    try {
      await Network.get(this.baseUrl + "/search.html?search_guard=0&_t=" + t, {
        ...this.pageHeaders(),
        "Accept": "text/css,*/*;q=0.1",
        "Sec-Fetch-Dest": "style",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-origin",
      });
    } catch (e) {}

    let js = "";
    try {
      let res = await Network.get(
        this.baseUrl + "/search.html?search_guard=2&_t=" + (t + 1),
        {
          ...this.pageHeaders(),
          "Accept": "*/*",
          "Sec-Fetch-Dest": "script",
          "Sec-Fetch-Mode": "no-cors",
          "Sec-Fetch-Site": "same-origin",
        }
      );
      if (res.status === 200) js = res.body || "";
    } catch (e) {}

    if (!js || js.length > 20000) return;

    let unesc = (s) => String(s).replace(/\\\//g, "/");

    let name = null, value = null, maxAge = 3600;
    let cm = js.match(/document\.cookie\s*=\s*["']([^"']+)["']/);
    if (cm) {
      let raw = unesc(cm[1]);
      let firstSeg = raw.split(";")[0];
      let eq = firstSeg.indexOf("=");
      if (eq > 0) {
        name = firstSeg.slice(0, eq).trim();
        value = firstSeg.slice(eq + 1).trim();
      }
      let ma = raw.match(/max-age\s*=\s*(\d+)/i);
      if (ma) maxAge = parseInt(ma[1], 10);
    }
    if (!name || !value) return;

    Network.setCookies(this.baseUrl, [
      new Cookie({
        name: name,
        value: value,
        domain: "www.bilimanga.net",
        path: "/",
      }),
    ]);

    let redeemPath = null;
    let rm = js.match(
      /\.open\s*\(\s*["'](?:GET|POST)["']\s*,\s*["']([^"']+)["']/i
    );
    if (rm) redeemPath = unesc(rm[1]);
    if (!redeemPath) {
      rm = js.match(/["']([^"']*search_guard=redeem[^"']*)["']/);
      if (rm) redeemPath = unesc(rm[1]);
    }
    if (!redeemPath) redeemPath = "/search.html?search_guard=redeem&r=";

    try {
      await Network.get(this.baseUrl + redeemPath + Date.now(), {
        ...this.pageHeaders(),
        "Accept": "*/*",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      });
    } catch (e) {}

    this._guardExpire = Date.now() + Math.max(60, maxAge - 60) * 1000;
  }

  parseBookLi(el) {
    if (!el) return null;
    let a = el.querySelector('a[href*="/detail/"]') || el.querySelector("a[href]");
    if (!a) return null;
    let href = a.attributes["href"] || "";
    let m = href.match(/\/detail\/(\d+)\.html/);
    if (!m) return null;
    let id = m[1];

    let img = el.querySelector("img");
    let cover = img
      ? this._abs(img.attributes["data-src"] || img.attributes["src"] || "")
      : "";

    let title = "";
    let titleEl = el.querySelector(".book-title");
    if (titleEl) title = titleEl.text.trim();
    if (!title && img) title = img.attributes["alt"] || "";
    if (!title) title = id;

    let subTitle = "";
    let authorEl = el.querySelector(".book-author");
    if (authorEl) subTitle = authorEl.text.trim();

    return new Comic({
      id: id,
      title: title,
      subTitle: subTitle,
      cover: cover,
    });
  }

  parseBookList(html) {
    let doc = new HtmlDocument(html);
    let seen = {};
    let comics = [];
    for (let el of doc.querySelectorAll(".book-li")) {
      let c = this.parseBookLi(el);
      if (!c || seen[c.id]) continue;
      seen[c.id] = true;
      comics.push(c);
    }
    doc.dispose();
    return comics;
  }

  extractMaxPage(html, fallback) {
    let doc = new HtmlDocument(html);
    let max = 1;
    for (let a of doc.querySelectorAll("a")) {
      let href = a.attributes["href"] || "";
      let text = a.text ? a.text.trim() : "";
      if (href.indexOf("/filter/") !== -1 && /^\d+$/.test(text)) {
        let n = parseInt(text);
        if (n > max) max = n;
      }
    }
    doc.dispose();
    return max > 1 ? max : fallback;
  }

  explore = [
    {
      title: "嗶哩漫畫-最近更新",
      type: "multiPageComicList",
      load: async (page) => {
        let url =
          this.baseUrl +
          `/filter/postdate_0_0_0_0_0_0_0_${page}_0_0_0.html`;
        let body = await this.fetchBody("home", url);
        let comics = this.parseBookList(body);
        let maxPage = this.extractMaxPage(body, 54);
        if (maxPage < 1) maxPage = 1;
        return { comics: comics, maxPage: maxPage };
      },
    },
    {
      title: "嗶哩漫畫-排行榜",
      type: "mixed",
      load: async (page) => {
        let ranks = [
          { key: "monthvisit", title: "月點擊榜" },
          { key: "weekvisit", title: "週點擊榜" },
          { key: "monthvote", title: "月推薦榜" },
          { key: "weekvote", title: "週推薦榜" },
          { key: "monthflower", title: "月鮮花榜" },
          { key: "weekflower", title: "週鮮花榜" },
          { key: "monthegg", title: "月雞蛋榜" },
          { key: "weekegg", title: "週雞蛋榜" },
          { key: "lastupdate", title: "最近更新" },
          { key: "postdate", title: "最新入庫" },
          { key: "goodnum", title: "收藏榜" },
          { key: "newhot", title: "新書榜" },
        ];
        let parts = [];
        await Promise.all(
          ranks.map(async (r) => {
            try {
              let body = await this.fetchBody(
                "top-" + r.key,
                this.baseUrl + "/top/" + r.key + "/1.html"
              );
              parts.push({
                title: r.title,
                comics: this.parseBookList(body),
                viewMore: null,
              });
            } catch (e) {
              parts.push({ title: r.title, comics: [], viewMore: null });
            }
          })
        );
        return { data: parts, maxPage: 1 };
      },
    },
  ];

  category = {
    title: "嗶哩漫畫",
    parts: [
      {
        name: "主題",
        type: "fixed",
        itemType: "category",
        // 移植无括号版扩展分类：52-65
        categories: [
          "奇幻", "冒險", "異世界", "龍傲天", "魔法", "仙俠", "戰爭", "熱血",
          "戰鬥", "競技", "懸疑", "驚悚", "獵奇", "神鬼", "偵探", "校園",
          "日常", "JK", "JC", "青梅竹馬", "妹妹", "大小姐", "女兒", "戀愛",
          "耽美", "百合", "NTR", "後宮", "職場", "經營", "犯罪", "旅行",
          "群像", "女性視角", "歷史", "武俠", "東方", "勵志", "宅系", "科幻",
          "機戰", "遊戲", "異能", "腦洞", "病嬌", "人外", "復仇", "鬥智",
          "惡役", "間諜", "治癒",
          "歡樂", "萌系", "末日", "大逃殺", "音樂", "美食", "性轉",
          "偽娘", "穿越", "童話", "轉生", "黑暗", "溫馨", "超自然",
        ],
        categoryParams: [
          "1", "2", "3", "4", "5", "6", "7", "8",
          "9", "10", "11", "12", "13", "14", "15", "16",
          "17", "18", "19", "20", "21", "22", "23", "24",
          "25", "26", "27", "28", "29", "30", "31", "32",
          "33", "34", "35", "36", "37", "38", "39", "40",
          "41", "42", "43", "44", "45", "46", "47", "48",
          "49", "50", "51",
          "52", "53", "54", "55", "56", "57", "58",
          "59", "60", "61", "62", "63", "64", "65",
        ],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      let tagid = param || "0";
      let url =
        this.baseUrl +
        `/filter/lastupdate_${tagid}_0_0_0_0_0_0_${page}_0_0_0.html`;

      let body = await this.fetchBody("categoryComics", url);
      let comics = this.parseBookList(body);
      let maxPage = this.extractMaxPage(
        body,
        comics.length > 0 ? page : 1
      );
      if (maxPage < 1) maxPage = 1;

      return { comics: comics, maxPage: maxPage };
    },
    optionList: [],
  };

  // 搜索：保留有括号版的 search_guard + POST；请求头改为使用 pageHeaders()，
  // 从而自动带上移动端 Client Hints。
  search = {
    load: async (keyword, options, page) => {
      let kw = encodeURIComponent(keyword);

      try {
        await this._runSearchGuard();
      } catch (e) {}

      let res = await Network.post(
        this.baseUrl + "/search.html",
        {
          ...this.pageHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
          "Origin": this.baseUrl,
          "Referer": this.baseUrl + "/search.html",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "same-origin",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
        "searchkey=" + kw
      );

      if (res.status !== 200) {
        throw "搜索请求失败: HTTP " + res.status;
      }

      let body = res.body || "";
      if (body.length < 500 || body.indexOf(".book-li") === -1) {
        throw "搜索被源站拒绝（返回空页面）。站点要求通过完整的浏览器环境执行搜索守卫 JS，当前 Venera 环境无法满足。建议网页搜索好漫画后复制链接在 Venera 内解析查看。";
      }

      let comics = this.parseBookList(body);
      return { comics: comics, maxPage: 1 };
    },
    optionList: [],
    enableTagsSuggestions: false,
  };

  comic = {
    idMatch: "^\\d+$",

    getShareLink: (id) => {
      return `https://www.bilimanga.net/detail/${id}.html`;
    },

    loadInfo: async (id) => {
      let detail = await this.fetchBody(
        "detail",
        this.baseUrl + "/detail/" + id + ".html"
      );
      let doc = new HtmlDocument(detail);

      let title = "";
      let titleEl = doc.querySelector(".book-title");
      if (titleEl) title = titleEl.text.trim();

      let cover = "";
      let coverImg =
        doc.querySelector("img.book-cover") ||
        doc.querySelector(".module-item-cover img") ||
        doc.querySelector("#bookDetailWrapper img.book-cover");
      if (coverImg) {
        cover =
          coverImg.attributes["data-src"] ||
          coverImg.attributes["src"] ||
          "";
      }
      if (!cover) {
        let og = doc.querySelector('meta[property="og:image"]');
        if (og) cover = og.attributes["content"] || "";
      }
      cover = this._abs(cover);

      let authors = [];
      for (let a of doc.querySelectorAll(".authorname a, .illname a")) {
        let t = a.text ? a.text.trim() : "";
        if (t && authors.indexOf(t) === -1) authors.push(t);
      }

      let tags = [];
      for (let a of doc.querySelectorAll(
        ".tag-small-group.origin-left a.tag-small"
      )) {
        let t = a.text ? a.text.trim() : "";
        if (t) tags.push(t);
      }

      let description = "";
      let summary = doc.querySelector("#bookSummary content");
      if (summary) description = summary.text.trim();
      doc.dispose();

      let chapters = new Map();
      let catalog = await this.fetchBody(
        "catalog",
        this.baseUrl + "/read/" + id + "/catalog"
      );
      let cdoc = new HtmlDocument(catalog);
      for (let a of cdoc.querySelectorAll('li.chapter-li a[href*="/read/"]')) {
        let href = a.attributes["href"] || "";
        let m = href.match(/\/read\/\d+\/(\d+)\.html/);
        if (!m) continue;
        let chTitle = a.text ? a.text.trim() : "";
        if (!chTitle) continue;
        chapters.set(m[1], chTitle);
      }
      cdoc.dispose();

      if (chapters.size === 0) throw "未解析到章節列表";

      let tagMap = {};
      if (authors.length) tagMap["作者"] = authors;
      if (tags.length) tagMap["標籤"] = tags;

      const shareUrl = `https://www.bilimanga.net/detail/${id}.html`;

      return new ComicDetails({
        title: title || id,
        cover: cover,
        description: description,
        tags: tagMap,
        chapters: chapters,
        url: shareUrl,
      });
    },

    loadEp: async (comicId, epId) => {
      let body = await this.fetchBody(
        "ep",
        this.baseUrl + "/read/" + comicId + "/" + epId + ".html"
      );
      let doc = new HtmlDocument(body);
      let images = [];
      let content = doc.querySelector("#acontentz") || doc;
      for (let img of content.querySelectorAll("img")) {
        let src =
          img.attributes["data-src"] || img.attributes["src"] || "";
        if (!src) continue;
        if (src.indexOf("motiezw.com") === -1) continue;
        if (images.indexOf(src) === -1) images.push(src);
      }
      doc.dispose();
      if (images.length === 0) {
        throw "未解析到圖片（可能需要移動端環境，或章節為 VIP）";
      }
      return { images: images };
    },

    onImageLoad: (url) => {
      let abs = this._abs(url);
      return {
        url: abs,
        headers: {
          ...this.pageHeaders(),
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.bilimanga.net/",
        },
      };
    },

    onThumbnailLoad: (url) => {
      let abs = this._abs(url);
      return {
        url: abs,
        headers: {
          ...this.pageHeaders(),
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://www.bilimanga.net/",
        },
      };
    },

    link: {
      domains: ["bilimanga.net", "www.bilimanga.net"],
      linkToId: (url) => {
        let m = url.match(/\/detail\/(\d+)\.html/);
        if (m) return m[1];
        m = url.match(/\/read\/(\d+)\/\d+\.html/);
        return m ? m[1] : null;
      },
    },
  };
}