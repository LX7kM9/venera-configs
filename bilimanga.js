/** @type {import('./_venera_.js')} */

// 【可選】圖片轉碼代理模板，留空 = 直連原站。
// 本站章節圖只有 AVIF，部分 Android 機型解不了；若你自建了能轉碼的代理，填在這裡即可全域生效。
//   const IMG_PROXY_TEMPLATE = "https://example.com/avif2jpg?url={url}";
// 說明：{url} 會被替換成經過 URL 編碼的原始圖片地址。
const IMG_PROXY_TEMPLATE = "";

class BiliManga extends ComicSource {
  name = "哔哩漫画";
  key = "bilimanga";
  version = "1.6.3"; // 移植 v1.1.7 图片加载加固 / 账号 WebView 登录
  minAppVersion = "1.6.0";

  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/bilimanga.js";

  get baseUrl() {
    return "https://www.bilimanga.net";
  }

  // ============================================================
  // 图片加载加固（移植自 v1.1.7）
  // ============================================================

  // 統一的手機 UA（Chrome 131 / Android 14）。
  // 舊版寫的是 "Android 10; Pixel 5"，Pixel 5 出廠就是 Android 11，UA 自相矛盾，
  // Cloudflare WAF 會把這種不自洽的 UA 當成機器人；這裡改成自洽的一組。
  mobileUA() {
    return "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
  }

  // 圖片請求頭檔位（依序輪換重試）。真網實測圖片 CDN 的 WAF 對請求頭很敏感：
  //   帶 Accept-Language（其它隨意） -> 200 image/avif
  //   不帶 Accept-Language           -> 403（5486 字節 Cloudflare 攔截頁）
  // 所以第一檔用完整的移動端瀏覽器指紋，後面幾檔逐步降級，避免被同一條規則反覆攔。
  imageHeaderProfiles(referer) {
    const ua = this.mobileUA();
    const accept = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
    const lang = "zh-TW,zh;q=0.9,en;q=0.8";
    return [
      // 1) 完整移動端瀏覽器（含 Client Hints + Sec-Fetch-*）
      {
        "User-Agent": ua,
        "Accept": accept,
        "Accept-Language": lang,
        "Referer": referer,
        "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "same-site",
      },
      // 2) 精簡版（只保留實測必需的 UA/Accept/Accept-Language/Referer）
      {
        "User-Agent": ua,
        "Accept": accept,
        "Accept-Language": lang,
        "Referer": referer,
      },
      // 3) iOS Safari（換一套指紋，繞開針對 Chrome 的規則）
      {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9",
        "Referer": referer,
      },
      // 4) 不帶 Referer（實測不帶 Referer 也可能 200，多一個組合多一分成功率）
      {
        "User-Agent": ua,
        "Accept": accept,
        "Accept-Language": lang,
      },
    ];
  }

  // 圖片字節校驗：確認真的是圖片再交給 Venera 寫緩存。
  // Venera 的圖片下載（lib/network/images.dart）拿到什麼都直接寫緩存，
  // 一旦把 Cloudflare 的 403 攔截頁 HTML 存進去，就會一直報
  // `Exception: Could not decompress image.`，重開章節也沒用。
  static validateImageBytes(buffer) {
    let b = null;
    try {
      b = new Uint8Array(buffer);
    } catch (e) {
      return buffer;
    }
    // 首字節是 '<' 說明是 HTML（Cloudflare 攔截頁）
    if (b.length > 0 && b[0] === 0x3c) {
      throw "圖片響應是 HTML（被站點風控攔截）";
    }
    if (b.length >= 12) {
      const ftyp = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70; // AVIF/HEIF 'ftyp'
      const jpeg = b[0] === 0xff && b[1] === 0xd8;
      const png = b[0] === 0x89 && b[1] === 0x50;
      const riff = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46; // WebP(RIFF)
      const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
      if (!ftyp && !jpeg && !png && !riff && !gif) {
        throw "圖片響應不是圖片格式（很可能被站點風控攔截）";
      }
    }
    return buffer;
  }

  // 關鍵：帶移動端 Client Hints + night=0 cookie，閱讀頁才會返回圖片
  pageHeaders() {
    return {
      "User-Agent": this.mobileUA(),
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
    };
  }

  init() {
    // 阅读页必须带 night=0 cookie 才返回图片；通过引擎 cookie 罐保存，
    // 避免手动 Cookie 头覆盖后续 WebView 登录产生的登录 cookie。
    try {
      Network.setCookies(this.baseUrl, [
        new Cookie({ name: "night", value: "0", domain: "www.bilimanga.net" }),
      ]);
    } catch (e) {}
  }

  // ============================================================
  // 账号（移植自 v1.1.7）
  // ============================================================

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

  // ============================================================
  // 通用
  // ============================================================

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

  // ============================================================
  // 搜索守卫（jieqi CMS 三步换票）
  // ============================================================

  async unlockSearch() {
    try {
      Network.setCookies(this.baseUrl, [
        new Cookie({ name: "jieqiSearchCss", value: "", domain: "www.bilimanga.net" }),
        new Cookie({ name: "jieqiSearchJs", value: "", domain: "www.bilimanga.net" }),
        new Cookie({ name: "jieqiSearchTicket", value: "", domain: "www.bilimanga.net" }),
      ]);
    } catch (e) {}

    const htmlHeaders = Object.assign({}, this.pageHeaders(), {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    });

    try {
      await Network.get(this.baseUrl + "/search.html", htmlHeaders);

      await Network.get(
        this.baseUrl + "/search.html?search_guard=css",
        Object.assign({}, htmlHeaders, { "Accept": "text/css,*/*;q=0.1" })
      );

      const js = await Network.get(
        this.baseUrl + "/search.html?search_guard=js",
        Object.assign({}, htmlHeaders, { "Accept": "*/*" })
      );

      const m = /jieqiSearchJs=([^";]+)/.exec(String(js.body || ""));
      if (m) {
        try {
          Network.setCookies(this.baseUrl, [
            new Cookie({ name: "jieqiSearchJs", value: m[1], domain: "www.bilimanga.net" }),
          ]);
        } catch (e) {}
      }

      await Network.get(
        this.baseUrl + "/search.html?search_guard=redeem&r=" + Date.now(),
        Object.assign({}, htmlHeaders, { "Accept": "*/*", "X-Requested-With": "XMLHttpRequest" })
      );

      return true;
    } catch (e) {
      return false;
    }
  }

  searchVariants(kw) {
    const out = [kw];
    const cjk = (kw.match(/[\u3400-\u9fff\u3040-\u30ff]{2,}/g) || [])
      .sort((a, b) => b.length - a.length)[0];
    const noisy = /[^\w\u3400-\u9fff\u3040-\u30ff]/.test(kw);
    if (noisy && cjk) return [cjk, kw];
    return out;
  }

  /**
   * 单次搜索：换票 → POST → 解析
   *   { comics, maxPage }   → 有结果
   *   { comics: [], empty: true } → 站内搜索页正常返回但 0 条
   *   { limited: true }     → 站点限流
   *   null                  → 请求失败 / 未拿到搜索页
   */
  async runSearch(q, attempts) {
    const enc = encodeURIComponent(q);

    for (let attempt = 0; attempt < (attempts || 1); attempt++) {
      if (attempt > 0) {
        try { await new Promise((r) => setTimeout(r, 1200)); } catch (e) {}
      }

      try { await this.unlockSearch(); } catch (e) {}

      try {
        const res = await Network.post(
          this.baseUrl + "/search.html",
          Object.assign({}, this.pageHeaders(), {
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
          }),
          "searchkey=" + enc
        );

        if (res.status === 200 && res.body) {
          const body = String(res.body);

          if (/兩次搜索的間隔|两次搜索的间隔|間隔時間不得少於|间隔时间不得少于/.test(body)) {
            return { limited: true };
          }

          const comics = this.parseBookList(body);
          if (comics.length > 0) {
            return { comics: comics, maxPage: this.extractMaxPage(body, 1) };
          }

          const single = this.parseSingleDetail(body);
          if (single) {
            return { comics: [single], maxPage: 1 };
          }

          if (/搜索結果|搜索结果/.test(body) || /page-finish/.test(body)) {
            return { comics: [], maxPage: 1, empty: true };
          }
        }

        const loc = res.headers && (res.headers.location || res.headers.Location);
        if (
          loc &&
          (res.status === 301 || res.status === 302 || res.status === 303 ||
           res.status === 307 || res.status === 308)
        ) {
          const target = /^https?:\/\//.test(loc)
            ? loc
            : this.baseUrl + (loc.charAt(0) === "/" ? loc : "/" + loc);
          const detail = await Network.get(target, this.pageHeaders());
          const single = detail && detail.status === 200
            ? this.parseSingleDetail(detail.body)
            : null;
          if (single) return { comics: [single], maxPage: 1 };
        }
      } catch (e) {}
    }

    return null;
  }

  parseSingleDetail(body) {
    const html = String(body || "");
    if (!/<img[^>]*class="book-cover"(?:\s|>|")[^>]*>/.test(html)) {
      return null;
    }

    let id = "";
    const share = /id="shareurl"[^>]*value="([^"]+)"/.exec(html);
    if (share) {
      const m = /(\d+)-/.exec(share[1]);
      if (m) id = m[1];
    }
    if (!id) {
      // v1.1.7 的兜底：从目录链接还原
      const m = /\/read\/(\d+)\/catalog/.exec(html);
      if (m) id = m[1];
    }
    if (!id) {
      const m = /\/detail\/(\d+)\.html/.exec(html);
      if (m) id = m[1];
    }
    if (!id) return null;

    let title = "";
    const h1 = /<h1[^>]*>([\s\S]{1,120}?)<\/h1>/.exec(html);
    if (h1) title = h1[1].replace(/<[^>]+>/g, "").trim();
    if (!title) {
      const bt = /<h4[^>]*class="book-title"[^>]*>([\s\S]{1,120}?)<\/h4>/.exec(html);
      if (bt) title = bt[1].replace(/<[^>]+>/g, "").trim();
    }

    let cover = "";
    const cv =
      /<img[^>]*class="book-cover"[^>]*src="([^"]+)"/.exec(html) ||
      /<img[^>]*src="([^"]+)"[^>]*class="book-cover"/.exec(html);
    if (cv) cover = cv[1];

    return new Comic({ id: id, title: title || id, cover: cover, subTitle: "" });
  }

  // ============================================================
  // 解析工具
  // ============================================================

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

    return new Comic({ id: id, title: title, subTitle: subTitle, cover: cover });
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
    const pager = /第\s*\d+\s*\/\s*(\d+)\s*页/.exec(String(html || ""));
    if (pager) {
      const n = parseInt(pager[1]);
      if (!isNaN(n) && n >= 1) return n;
    }

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

  // ============================================================
  // 发现页
  // ============================================================

  explore = [
    {
      title: "哔哩漫画-最近更新",
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
      title: "哔哩漫画-排行榜",
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

  // ============================================================
  // 分类页
  // ============================================================

  category = {
    title: "哔哩漫画",
    parts: [
      {
        name: "主題",
        type: "fixed",
        itemType: "category",
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
      let maxPage = this.extractMaxPage(body, comics.length > 0 ? page : 1);
      if (maxPage < 1) maxPage = 1;

      return { comics: comics, maxPage: maxPage };
    },
    optionList: [],
  };

  // ============================================================
  // 搜索
  // ============================================================

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword == null ? "" : keyword).trim();

      if (!kw) {
        return { comics: [], maxPage: 1 };
      }

      const variants = this.searchVariants(kw);
      let gotEmptyResult = false;
      let gotLimited = false;

      for (let i = 0; i < variants.length; i++) {
        if (i > 0) {
          try { await new Promise((r) => setTimeout(r, 6000)); } catch (e) {}
        }

        const r = await this.runSearch(variants[i], 1);

        if (r && r.comics && r.comics.length > 0) {
          return r;
        }
        if (r && r.empty) gotEmptyResult = true;
        if (r && r.limited) {
          gotLimited = true;
          break;
        }
      }

      if (gotLimited) {
        throw "搜索过于频繁，请等 5~10 秒后再试。";
      }

      if (gotEmptyResult) {
        throw "未搜到相关漫画。可缩短关键词重试，或浏览器搜索后复制链接到 Venera 解析。";
      }

      throw "搜索请求未通过源站 JS 校验。建议浏览器搜索漫画后复制链接到 Venera 解析。";
    },
    optionList: [],
    enableTagsSuggestions: false,
  };

  // ============================================================
  // 单本漫画
  // ============================================================

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

      // 【關鍵】給每個圖片地址帶上緩存版本號，用來**繞開已被污染的舊圖片緩存**。
      //
      // 原因：Venera 的圖片緩存 key 就是圖片 URL。只要歷史上某一次拿到 Cloudflare 的 403
      // 攔截頁並被寫進緩存，閱讀器再打開時會**優先使用緩存裡的字节**，於是永遠報
      // `Exception: Could not decompress image.`，點重試、重開章節都沒用。
      // 這裡統一加 ?v=<版本>，改一次版本號就等於給全部章節圖換一個 cache key，
      // 老用戶不用手動清緩存也能自動恢復。
      const CACHE_BUST = "v=163";
      let busted = [];
      for (let src of images) {
        busted.push(src + (src.indexOf("?") === -1 ? "?" : "&") + CACHE_BUST);
      }
      return { images: busted };
    },

    // 图片加载加固（移植自 v1.1.7）
    //
    // 真網複測糾正：決定性的是 **Accept-Language**：缺了必 403（5486 字節 CF 攔截頁）。
    // 攔截頁一旦被 Venera 寫進圖片緩存，就會一直報 `Exception: Could not decompress image.`。
    // 所以下面用 onResponse 做文件頭校驗，不是圖片就拋錯，讓 Venera 走 onLoadFailed 重試而不是
    // 把攔截頁存下來。
    onImageLoad: (url, comicId, epId) => {
      const referer =
        comicId && epId
          ? this.baseUrl + "/read/" + comicId + "/" + epId + ".html"
          : this.baseUrl + "/";
      const profiles = this.imageHeaderProfiles(referer);
      const targetUrl = IMG_PROXY_TEMPLATE
        ? IMG_PROXY_TEMPLATE.split("{url}").join(encodeURIComponent(url))
        : url;

      const validate = (buffer) => BiliManga.validateImageBytes(buffer);

      const build = (i) => {
        const headers = profiles[i < profiles.length ? i : profiles.length - 1];
        return {
          url: targetUrl,
          method: "GET",
          headers: headers,
          onResponse: (buffer) => validate(buffer),
          onLoadFailed: () => build(i + 1),
        };
      };
      return build(0);
    },

    onThumbnailLoad: (url) => {
      const headers = this.imageHeaderProfiles("https://www.bilimanga.net/")[0];
      return {
        url: IMG_PROXY_TEMPLATE
          ? IMG_PROXY_TEMPLATE.split("{url}").join(encodeURIComponent(url))
          : url,
        headers: headers,
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