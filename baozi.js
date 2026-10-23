const baoziStandardReadPages = async function baoziStandardReadPages(startUrl, expected, loadPage, formatImage, initialBody) {
  const seenPages = new Set(), seenImages = new Set(), images = [];
  let current = startUrl, body = initialBody, page = 1, total = null, identity = null;
  const resolve = (value, base) => {
    const text = String(value || '').trim();
    if (/^https:\/\//i.test(text)) return text;
    if (text.startsWith('//')) return 'https:' + text;
    const origin = String(base).match(/^https:\/\/[^/]+/i)?.[0];
    if (!origin || !text || /^(?:[a-z]+:|#)/i.test(text)) throw new Error('包子：分页链接格式异常。');
    return text.startsWith('/') ? origin + text : String(base).replace(/[^/]*$/, '') + text;
  };
  const ref = url => {
    const m = String(url).match(/^https:\/\/([^/?#]+)\/(?:baozimhapp\/)?comic\/chapter\/([^/?#]+)\/(\d+)_(\d+)(?:_(\d+))?\.html(?:[?#].*)?$/i);
    if (!m) return null;
    const host = m[1].toLowerCase();
    if (!/(?:^|\.)(?:baozimh\.com|baozimhcn\.com|bzmgcn\.com|webmota\.com|kukuc\.co|twmanga\.com|dinnerku\.com|dzmanga\.com|cnbzmg\.com|twbzmg\.com)$/.test(host)) throw new Error('包子：分页跳到了未知阅读域名。');
    return { comic: m[2], section: Number(m[3]), chapter: Number(m[4]), page: Number(m[5] || 1) };
  };
  while (true) {
    if (page > 200 || seenPages.has(current)) throw new Error('包子：章节分页异常或循环，未返回不完整章节。');
    seenPages.add(current);
    if (body === undefined) body = await loadPage(current);
    if (typeof body !== 'string' || !/<\/html\s*>/i.test(body) || /<title[^>]*>\s*(?:Just a moment|Attention Required)/i.test(body)) throw new Error('包子：阅读页为空、验证页或传输不完整，请重试。');
    const doc = new HtmlDocument(body);
    let next = null, added = 0;
    try {
      const canonical = doc.querySelector('link[rel="canonical"]')?.attributes?.href;
      const base = canonical ? resolve(canonical, current) : current;
      const currentRef = ref(base) || ref(current);
      if (currentRef) {
        if (currentRef.section !== expected.section || currentRef.chapter !== expected.chapter || currentRef.page !== page) throw new Error('包子：阅读页不是所选章节或页码。');
        if (!identity) identity = currentRef.comic;
        if (identity !== currentRef.comic) throw new Error('包子：章节分页跨作品。');
      }
      const counter = String(doc.querySelector('title')?.text || '').match(/[（(](\d+)\s*\/\s*(\d+)[)）]/);
      if (counter) {
        const count = Number(counter[2]);
        if (Number(counter[1]) !== page || count < page || count > 200 || (total !== null && total !== count)) throw new Error('包子：分页总数正在变化或格式异常，请重开章节。');
        total = count;
      }
      for (const node of doc.querySelectorAll('.comic-contain .comic-contain__item')) {
        let url = String(node.attributes['data-src'] || node.attributes.src || '').trim();
        if (url.startsWith('//')) url = 'https:' + url;
        if (!/^https:\/\/[^\s]+$/i.test(url)) throw new Error('包子：正文图片地址缺失或无效。');
        if (seenImages.has(url)) continue;
        seenImages.add(url); images.push(formatImage(url)); added++;
      }
      if (!added) throw new Error('包子：正文分页为空或重复，未返回不完整章节。');
      for (const a of doc.querySelectorAll('a[href]')) {
        if (!/^(?:点击进入|點擊進入)?(?:下一页|下一頁|下页|下頁)$/.test(a.text.trim())) continue;
        const candidate = resolve(a.attributes.href, base), r = ref(candidate);
        if (!r || r.section !== expected.section || r.chapter !== expected.chapter || r.page !== page + 1 || (identity && r.comic !== identity)) throw new Error('包子：下一页链接跨章节、跨作品或页码不连续。');
        if (next && candidate !== next) throw new Error('包子：出现冲突的下一页链接。');
        if (!identity) identity = r.comic;
        next = candidate;
      }
      if (total !== null && (page < total) !== !!next) throw new Error('包子：章节分页未完整返回，请刷新重试。');
    } finally { doc.dispose(); }
    if (!next) return { images };
    current = next; page++; body = undefined;
  }
};

class Baozi extends ComicSource {
  // 此漫画源的名称
  name = "包子漫画";

  // 唯一标识符
  key = "baozi";

  version = "1.2.2";

  minAppVersion = "1.0.0";

  // 更新链接
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/baozi.js";

  settings = {
    language: {
      title: "简繁切换",
      type: "select",
      options: [
        { value: "cn", text: "简体" },
        { value: "tw", text: "繁體" },
      ],
      default: "cn",
    },
    domains: {
      title: "主域名",
      type: "select",
      options: [
        { value: "bzmgcn.com" },
        { value: "baozimhcn.com" },
        { value: "webmota.com" },
        { value: "kukuc.co" },
        { value: "twmanga.com" },
        { value: "dinnerku.com" },
      ],
      default: "bzmgcn.com",
    },
    cdn_domains: {
      title: "图片资源站域名",
      type: "select",
      options: [
        // ---------- 疑似失效的旧域名（排在最前面） ----------
        { value: "as-rsa1-usla.baozicdn.com", text: "as-rsa1-usla.baozicdn.com（疑似失效）" },
        { value: "ascn-a3.bzcdn.net", text: "ascn-a3.bzcdn.net（疑似失效）" },
        { value: "asgb-a3.bzcdn.net", text: "asgb-a3.bzcdn.net（疑似失效）" },
        { value: "s1.baozicdn.com", text: "s1.baozicdn.com（疑似失效）" },
        // ---------- 有效且稳定的域名 ----------
        { value: "as.baozimh.com", text: "as.baozimh.com" },
        // ---------- 从 recode 搬运的有效新域名 ----------
        { value: "as2.baozimh.com", text: "as2.baozimh.com" },
        { value: "static-tw.bzmgcn.com", text: "static-tw.bzmgcn.com（仅原图）" },
        { value: "static-tw.baozimh.com", text: "static-tw.baozimh.com（仅原图）" },
        // ---------- 从 1.1.7 版本补充的域名 ----------
        { value: "s1.bzcdn.net", text: "s1.bzcdn.net" },
        { value: "s2.bzcdn.net", text: "s2.bzcdn.net" },
        // ---------- 默认选项（空值）放在最底下 ----------
        { value: "", text: "默认" },
      ],
      default: "as.baozimh.com",
    },
    image_quality: {
      title: "图片质量",
      type: "select",
      options: [
        {
          value: "/w640",
          text: "640p"
        },
        {
          value: "",
          text: "原图"
        }
      ],
      default: "/w640",
    },
  };

  // 动态生成完整域名
  get lang() {
    return this.loadSetting("language") || this.settings.language.default;
  }
  get baseUrl() {
    let domain = this.loadSetting("domains") || this.settings.domains.default;
    return `https://${this.lang}.${domain}`;
  }

  /// 账号
  /// 设置为null禁用账号功能
  account = {
    /// 登录
    /// 返回任意值表示登录成功
    login: async (account, pwd) => {
      let res = await Network.post(
        `${this.baseUrl}/api/bui/signin`,
        {
          "content-type":
            "multipart/form-data; boundary=----WebKitFormBoundaryFUNUxpOwyUaDop8s",
        },
        '------WebKitFormBoundaryFUNUxpOwyUaDop8s\r\nContent-Disposition: form-data; name="username"\r\n\r\n' +
        account +
        '\r\n------WebKitFormBoundaryFUNUxpOwyUaDop8s\r\nContent-Disposition: form-data; name="password"\r\n\r\n' +
        pwd +
        "\r\n------WebKitFormBoundaryFUNUxpOwyUaDop8s--\r\n"
      );
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let json = JSON.parse(res.body);
      let token = json.data;
      Network.setCookies(this.baseUrl, [
        new Cookie({
          name: "TSID",
          value: token,
          domain: this.loadSetting("domains") || this.settings.domains.default,
        }),
      ]);
      return "ok";
    },

    // 退出登录时将会调用此函数
    logout: function () {
      Network.deleteCookies(
        this.loadSetting("domains") || this.settings.domains.default
      );
    },

    get registerWebsite() {
      return `${this.baseUrl}/user/signup`;
    },
  };

  /// 解析漫画列表
  parseComic(e) {
    let url = e.querySelector("a").attributes["href"];
    let id = url.split("/").pop();
    let title = e.querySelector("h3").text.trim();
    let cover = e.querySelector("a > amp-img").attributes["src"];
    let tags = e.querySelectorAll("div.tabs > span").map((e) => e.text.trim());
    let description = e.querySelector("small").text.trim();
    return {
      id: id,
      title: title,
      cover: cover,
      tags: tags,
      description: description,
    };
  }

  parseJsonComic(e) {
    return {
      id: e.comic_id,
      title: e.name,
      subTitle: e.author,
      cover: `https://static-tw.baozimh.com/cover/${e.topic_img}?w=285&h=375&q=100`,
      tags: e.type_names,
    };
  }

  /// 探索页面
  explore = [
    {
      title: "包子漫画",
      type: "singlePageWithMultiPart",
      load: async () => {
        var res = await Network.get(this.baseUrl);
        if (res.status !== 200) {
          throw "Invalid status code: " + res.status;
        }
        let document = new HtmlDocument(res.body);
        let parts = document.querySelectorAll("div.index-recommend-items");
        let result = {};
        for (let part of parts) {
          let title = part.querySelector("div.catalog-title").text.trim();
          let comics = part
            .querySelectorAll("div.comics-card")
            .map((e) => this.parseComic(e));
          if (comics.length > 0) {
            result[title] = comics;
          }
        }
        return result;
      },
    },
  ];

  /// 分类页面
  category = {
    title: "包子漫画",
    parts: [
      {
        name: "类型",
        type: "fixed",
        categories: [
          "全部",
          "恋爱",
          "纯爱",
          "古风",
          "异能",
          "悬疑",
          "剧情",
          "科幻",
          "奇幻",
          "玄幻",
          "穿越",
          "冒险",
          "推理",
          "武侠",
          "格斗",
          "战争",
          "热血",
          "搞笑",
          "大女主",
          "都市",
          "总裁",
          "后宫",
          "日常",
          "韩漫",
          "少年",
          "其它",
        ],
        itemType: "category",
        categoryParams: [
          "all",
          "lianai",
          "chunai",
          "gufeng",
          "yineng",
          "xuanyi",
          "juqing",
          "kehuan",
          "qihuan",
          "xuanhuan",
          "chuanyue",
          "mouxian",
          "tuili",
          "wuxia",
          "gedou",
          "zhanzheng",
          "rexie",
          "gaoxiao",
          "danuzhu",
          "dushi",
          "zongcai",
          "hougong",
          "richang",
          "hanman",
          "shaonian",
          "qita",
        ],
      },
    ],
    enableRankingPage: false,
  };

  /// 分类漫画页面, 即点击分类标签后进入的页面
  categoryComics = {
    load: async (category, param, options, page) => {
      let res = await Network.get(
        `${this.baseUrl}/api/bzmhq/amp_comic_list?type=${param}&region=${options[0]}&state=${options[1]}&filter=%2a&page=${page}&limit=36&language=${this.lang}&__amp_source_origin=${this.baseUrl}`
      );
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let maxPage = null;
      let json = JSON.parse(res.body);
      if (!json.next) {
        maxPage = page;
      }
      return {
        comics: json.items.map((e) => this.parseJsonComic(e)),
        maxPage: maxPage,
      };
    },
    optionList: [
      {
        options: ["all-全部", "cn-国漫", "jp-日本", "kr-韩国", "en-欧美"],
      },
      {
        options: ["all-全部", "serial-连载中", "pub-已完结"],
      },
    ],
  };

  /// 搜索
  search = {
    load: async (keyword, options, page) => {
      let res = await Network.get(`${this.baseUrl}/search?q=${keyword}`);
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let document = new HtmlDocument(res.body);
      let comics = document
        .querySelectorAll("div.comics-card")
        .map((e) => this.parseComic(e));
      return {
        comics: comics,
        maxPage: 1,
      };
    },
    optionList: [],
  };

  /// 收藏
  favorites = {
    multiFolder: false,
    addOrDelFavorite: async (comicId, folderId, isAdding) => {
      if (!isAdding) {
        let res = await Network.post(
          `${this.baseUrl}/user/operation_v2?op=del_bookmark&comic_id=${comicId}`
        );
        if (!res.status || res.status >= 400) {
          throw "Invalid status code: " + res.status;
        }
        return "ok";
      } else {
        let res = await Network.post(
          `${this.baseUrl}/user/operation_v2?op=set_bookmark&comic_id=${comicId}&chapter_slot=0`
        );
        if (!res.status || res.status >= 400) {
          throw "Invalid status code: " + res.status;
        }
        return "ok";
      }
    },
    loadFolders: null,
    loadComics: async (page, folder) => {
      let res = await Network.get(`${this.baseUrl}/user/my_bookshelf`);
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let document = new HtmlDocument(res.body);
      function parseComic(e) {
        let title = e.querySelector("h4 > a").text.trim();
        let url = e.querySelector("h4 > a").attributes["href"];
        let id = url.split("/").pop();
        let author = e
          .querySelector("div.info > ul")
          .children[1].text.split("：")[1]
          .trim();
        let description = e
          .querySelector("div.info > ul")
          .children[4].children[0].text.trim();

        return {
          id: id,
          title: title,
          subTitle: author,
          description: description,
          cover: e.querySelector("amp-img").attributes["src"],
        };
      }
      let comics = document
        .querySelectorAll("div.bookshelf-items")
        .map((e) => parseComic(e));
      return {
        comics: comics,
        maxPage: 1,
      };
    },
  };

  /// 单个漫画相关
  comic = {
    // 加载漫画信息
    loadInfo: async (id) => {
      let res = await Network.get(`${this.baseUrl}/comic/${id}`);
      if (res.status !== 200) {
        throw "Invalid status code: " + res.status;
      }
      let document = new HtmlDocument(res.body);

      let title = document.querySelector("h1.comics-detail__title").text.trim();
      let cover = document.querySelector("div.l-content > div > div > amp-img")
        .attributes["src"];
      let author = document
        .querySelector("h2.comics-detail__author")
        .text.trim();
      let tags = document
        .querySelectorAll("div.tag-list > span")
        .map((e) => e.text.trim());
      tags = [...tags.filter((e) => e !== "")];
      let updateTime = document
        .querySelector("div.supporting-text > div > span > em")
        ?.text.trim()
        .replace("(", "")
        .replace(")", "");
      if (!updateTime) {
        const getLastChapterText = () => {
          const containers = [
            ...document.querySelectorAll(
              "#chapter-items, #chapters_other_list"
            ),
          ];
          let allChapters = [];
          containers.forEach((container) => {
            const chapters = container.querySelectorAll(".comics-chapters > a");
            allChapters.push(...Array.from(chapters));
          });
          const lastChapter = allChapters[allChapters.length - 1];
          return (
            lastChapter?.querySelector("div > span")?.text.trim() ||
            "暂无更新信息"
          );
        };
        updateTime = getLastChapterText();
      }
      let description = document
        .querySelector("p.comics-detail__desc")
        .text.trim();
      let chapters = new Map();
      let i = 0;
      for (let c of document.querySelectorAll(
        "div#chapter-items > div.comics-chapters > a > div > span"
      )) {
        chapters.set(i.toString(), c.text.trim());
        i++;
      }
      for (let c of document.querySelectorAll(
        "div#chapters_other_list > div.comics-chapters > a > div > span"
      )) {
        chapters.set(i.toString(), c.text.trim());
        i++;
      }
      if (i === 0) {
        const spans = Array.from(
          document.querySelectorAll("div.comics-chapters > a > div > span")
        ).reverse();
        for (let c of spans) {
          chapters.set(i.toString(), c.text.trim());
          i++;
        }
      }
      let recommend = [];
      for (let c of document.querySelectorAll("div.recommend--item")) {
        if (c.querySelectorAll("div.tag-comic").length > 0) {
          let title = c.querySelector("span").text.trim();
          let cover = c.querySelector("amp-img").attributes["src"];
          let url = c.querySelector("a").attributes["href"];
          let id = url.split("/").pop();
          recommend.push({
            id: id,
            title: title,
            cover: cover,
          });
        }
      }
      let updateDate = updateTime
        .replace(/年/g, "-")
        .replace(/月/g, "-")
        .replace(/日/g, "");

      const comicUrl = `${this.baseUrl}/comic/${id}`;

      return new ComicDetails({
        title: title,
        cover: cover,
        description: description,
        tags: {
          作者: [author],
          标签: tags,
        },
        chapters: chapters,
        recommend: recommend,
        updateTime: updateDate,
        url: comicUrl,   // 右上角菜单将显示“复制链接”
      });
    },

    // ========== 合并了无(1)版的高级分页读取逻辑 ==========
    loadEp: async (comicId, epId) => {
      const match = String(epId).match(/^(?:(\d+)[_:/-])?(\d+)$/);
      if (!match || !/^[a-z0-9_-]+$/i.test(String(comicId))) throw new Error("包子：章节标识无效，请刷新目录。");
      const section = Number(match[1] || 0), chapter = Number(match[2]);
      const app = "https://appcn.baozimh.com/baozimhapp/comic/chapter/" + comicId + "/" + section + "_" + chapter + ".html";
      const load = async url => {
        const r = await Network.get(url, { "User-Agent": "Mozilla/5.0", Referer: this.baseUrl + "/", "cache-time": "no" });
        if (r.status !== 200) throw new Error("包子：阅读页请求失败（HTTP " + r.status + "）。");
        return String(r.body || "");
      };
      let first, start = app;
      try { first = await load(app); }
      catch (_) {
        let failure;
        for (const host of [...new Set([this.baseUrl, "https://" + this.lang + ".webmota.com"])]) {
          start = host + "/user/page_direct?comic_id=" + encodeURIComponent(comicId) + "&section_slot=" + section + "&chapter_slot=" + chapter;
          try { first = await load(start); break; } catch (error) { failure = error; }
        }
        if (first === undefined) throw failure || new Error("包子：没有可用阅读入口。");
      }
      return baoziStandardReadPages(start, { section, chapter }, load, url => {
        const parts = url.match(/^(https:\/\/)([^/]+)(\/.*)$/i);
        if (!parts) throw new Error("包子：图片地址异常。");
        const domain = this.loadSetting("cdn_domains") || parts[2];
        const setting = this.loadSetting("image_quality");
        const quality = setting == null ? this.settings.image_quality.default : setting;
        return parts[1] + domain + quality + parts[3].replace(/^\/w\d+(?=\/)/, "");
      }, first);
    },

    // ========== 合并了无(1)版的图片防盗链头 ==========
    onImageLoad: url => ({ 
      url, 
      headers: { 
        "User-Agent": "Mozilla/5.0", 
        "Referer": this.baseUrl + "/", 
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8" 
      } 
    }),

    // ========== 链接解析功能（适配所有预设域名及常见路径） ==========
    link: {
      // 包含所有可能的完整域名（基础域名 + 语言子域名）
      domains: [
        // 基础域名
        'bzmgcn.com',
        'baozimhcn.com',
        'webmota.com',
        'kukuc.co',
        'twmanga.com',
        'dinnerku.com',
        // 常见语言子域名（cn 和 tw）
        'cn.bzmgcn.com',
        'tw.bzmgcn.com',
        'cn.baozimhcn.com',
        'tw.baozimhcn.com',
        'cn.webmota.com',
        'tw.webmota.com',
        'cn.kukuc.co',
        'tw.kukuc.co',
        'cn.twmanga.com',
        'tw.twmanga.com',
        'cn.dinnerku.com',
        'tw.dinnerku.com',
      ],
      /**
       * 从 URL 中提取漫画 ID
       * 支持格式：
       *   https://cn.bzmgcn.com/comic/123
       *   https://tw.baozimhcn.com/comic/456/
       *   https://webmota.com/comic/789?foo=bar
       * @param {string} url - 完整的漫画详情页链接
       * @returns {string|null} - 漫画 ID，若无法解析则返回 null
       */
      linkToId: (url) => {
        // 匹配 /comic/ 后面紧跟的非空字符（直到 / 或 ? 或 # 或字符串结束）
        let match = url.match(/\/comic\/([^\/?#]+)/);
        return match ? match[1] : null;
      }
    }
  };
}