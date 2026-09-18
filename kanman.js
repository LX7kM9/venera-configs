/** @type {import('./_venera_.js')} */
class Kanman extends ComicSource {
  name = "看漫画";
  key = "kanman";
  version = "2.2.7";   // 修复 abs 函数 + 分类页彻底删除专题 + 标题检测首页title
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/kanman.js";

  get baseUrl() { return "https://m.kanman.com"; }

  get headers() {
    return {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      "Accept": "text/html,application/json,*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": this.baseUrl + "/",
    };
  }

  static sortCategoryMap = {
    "题材": {
      "全部": "all", "热血": "rexue", "机战": "jizhan", "运动": "yundong",
      "推理": "tuili", "冒险": "maoxian", "搞笑": "gaoxiao", "战争": "zhanzhen",
      "神魔": "shenmo", "忍者": "renzhe", "竞技": "jingji", "悬疑": "xuanyi",
      "社会": "shehui", "恋爱": "lianai", "宠物": "chongwu", "吸血": "xixue",
      "萝莉": "luoli", "御姐": "yujie", "霸总": "bazong", "玄幻": "xuanhuan",
      "古风": "gufeng", "历史": "lishi", "漫改": "mangai", "游戏": "youxi",
      "穿越": "chuanyue", "恐怖": "kongbu", "真人": "zhenren", "科幻": "kehuan",
      "都市": "dushi", "武侠": "wuxia", "修真": "xiuzhen", "生活": "shenghuo",
      "动作": "dongzuo",
    },
    "地区": {
      "全部": "all", "大陆": "dalu", "日本": "riben", "港台": "gangtai",
      "欧美": "oumei", "韩国": "os",
    },
    "进度": {
      "全部": "all", "连载": "lianzai", "完结": "wanjie",
    },
    "色彩": {
      "全部": "all", "全彩": "quancai", "黑白": "heibai",
    },
    "主题": {
      "全部": "all", "精品": "jingpin", "限免": "mingjia",
      "小说改编": "xiaoshuo", "折扣专区": "baozou", "免费读": "zazhi",
    },
    "字母": {
      "全部": "all", "A": "A", "B": "B", "C": "C", "D": "D", "E": "E",
      "F": "F", "G": "G", "H": "H", "I": "I", "J": "J", "K": "K",
      "L": "L", "M": "M", "N": "N", "O": "O", "P": "P", "Q": "Q",
      "R": "R", "S": "S", "T": "T", "U": "U", "V": "V", "W": "W",
      "X": "X", "Y": "Y", "Z": "Z",
    },
  };

  // ★ 用字符串拼接，不依赖 new URL（Venera 里 new URL 不可用）
  abs(href) {
    if (!href) return "";
    const s = String(href).trim();
    if (/^https?:\/\//i.test(s)) return s.replace(/^http:/i, "https:");
    if (s.startsWith("//")) return "https:" + s;
    if (s.startsWith("/")) return this.baseUrl + s;
    return this.baseUrl + "/" + s;
  }

  text(el) { return el ? (el.text || "").trim() : ""; }
  attr(el, name) { return el && el.attributes ? (el.attributes[name] || "") : ""; }

  meta(doc, name) {
    const m = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    if (!m) return "";
    return String(this.attr(m, "content") || "").trim();
  }

  cidOf(id) {
    const m = String(id).match(/\/?(\d+)\/?$/);
    return m ? m[1] : String(id).replace(/\D/g, "");
  }

  extractStyleUrl(style) {
    if (!style) return "";
    const bm = String(style).match(/url\(['"]?([^'")]+)['"]?\)/);
    if (!bm || !bm[1]) return "";
    if (/loading\.gif|space\.gif|static\/images\/comm/i.test(bm[1])) return "";
    return bm[1];
  }

  isValidCover(url) {
    if (!url) return false;
    const u = String(url).trim();
    if (u.length < 5) return false;
    if (u.startsWith("data:")) return false;
    if (/loading\.gif|space\.gif|static\/images\/comm|ico_wave|ico_title|logo\.png|favicon/i.test(u)) return false;
    return true;
  }

  // 统一封面规律：yqmh.com 的封面统一用横版格式
  normalizeCover(id, url) {
    if (!url) return "";
    if (url.indexOf("_2_1.jpg") >= 0) return url;
    if (url.indexOf("image.yqmh.com") >= 0) {
      return `https://image.yqmh.com/mh/${id}_2_1.jpg-400x200.webp`;
    }
    return url;
  }

  findCoverFromImgs(imgs) {
    for (const img of imgs) {
      const styleCover = this.extractStyleUrl(this.attr(img, "style"));
      if (this.isValidCover(styleCover)) return styleCover;

      const dataPic = this.attr(img, "data-pic");
      if (this.isValidCover(dataPic)) return dataPic;

      const dataSrc = this.attr(img, "data-src");
      if (this.isValidCover(dataSrc)) return dataSrc;

      const dataOrig = this.attr(img, "data-original");
      if (this.isValidCover(dataOrig)) return dataOrig;

      const dataLazy = this.attr(img, "data-lazy-src");
      if (this.isValidCover(dataLazy)) return dataLazy;

      const src = this.attr(img, "src");
      if (this.isValidCover(src)) return src;
    }
    return "";
  }

  findCoverForAnchor(a) {
    let node = a;
    for (let depth = 0; depth < 5 && node; depth++) {
      const imgs = node.querySelectorAll("img");
      if (imgs.length > 5) break;
      const cover = this.findCoverFromImgs(imgs);
      if (cover) return cover;
      node = node.parentElement;
    }
    return "";
  }

  parseComicFromAnchor(a) {
    const href = this.attr(a, "href");
    const m = href.match(/^\/(\d+)\/?$/);
    if (!m) return null;
    const id = m[1];

    let title = this.attr(a, "title").trim();
    if (!title) {
      const tEl = a.querySelector(".card-title")
        || a.querySelector(".name-wrapper")
        || a.querySelector(".comic-name")
        || a.querySelector(".title");
      if (tEl) title = this.text(tEl);
    }
    if (!title) {
      const imgA = a.querySelector("img");
      if (imgA) title = this.attr(imgA, "alt").trim();
    }
    if (/^(点击速看|订阅|详情|下一话|开始阅读)$/.test(title)) title = "";
    title = title.replace(/,?[^,]*漫画\s*$/, "").trim() || title;
    if (!title) return null;

    let cover = "";
    const directImg = a.querySelector("img");
    if (directImg) {
      cover = this.attr(directImg, "data-pic")
        || this.attr(directImg, "data-src")
        || this.attr(directImg, "data-original")
        || this.attr(directImg, "data-lazy-src")
        || this.attr(directImg, "src");
      if (cover && !this.isValidCover(cover)) cover = "";
    }
    if (!cover) {
      cover = this.findCoverForAnchor(a);
    }

    cover = this.normalizeCover(id, cover);

    const tags = [];
    for (const t of a.querySelectorAll(".tags-list .item, ul li")) {
      const tx = this.text(t);
      if (tx) tags.push(tx);
    }

    let description = "";
    const cardTextEl = a.querySelector(".card-text");
    if (cardTextEl) description = this.text(cardTextEl).replace(/^\s*/, "");

    return new Comic({
      id,
      title,
      cover: cover ? this.abs(cover) : "",
      tags,
      description,
    });
  }

  parseComicsFromAnchors(container) {
    const comics = [];
    const seen = {};
    for (const a of container.querySelectorAll("a[href]")) {
      const c = this.parseComicFromAnchor(a);
      if (c && !seen[c.id]) {
        seen[c.id] = true;
        comics.push(c);
      }
    }
    return comics;
  }

  parseSortComics(doc) {
    const comics = [];
    const seen = {};

    let items = doc.querySelectorAll("ul.comic-sort > li.comic-item");
    if (items.length === 0) items = doc.querySelectorAll("li.comic-item");

    for (const li of items) {
      const a = li.querySelector("a[href]");
      if (!a) continue;

      const href = this.attr(a, "href");
      const m = href.match(/^\/(\d+)\/?$/);
      if (!m) continue;
      const id = m[1];
      if (seen[id]) continue;

      let title = "";
      const titleEl = li.querySelector("p.title") || li.querySelector(".title");
      if (titleEl) title = this.text(titleEl);
      if (!title) {
        const rawTitle = this.attr(a, "title");
        title = rawTitle.split(",")[0].trim();
      }
      if (!title) continue;

      const img = li.querySelector("img");
      let cover = "";
      if (img) {
        cover = this.attr(img, "data-pic")
          || this.attr(img, "data-src")
          || this.attr(img, "data-original")
          || this.attr(img, "data-lazy-src")
          || this.attr(img, "src");
        if (cover && !this.isValidCover(cover)) cover = "";
      }

      cover = this.normalizeCover(id, cover);

      const chapterEl = li.querySelector(".chapter");
      const subTitle = chapterEl ? this.text(chapterEl) : "";

      seen[id] = true;
      comics.push(new Comic({
        id,
        title,
        cover: this.abs(cover),
        subTitle,
      }));
    }

    return comics;
  }

  parseNewAndClassicList(doc) {
    const comics = [];
    const seen = {};

    for (const a of doc.querySelectorAll("a[href]")) {
      const href = this.attr(a, "href");

      let m = href.match(/^\/(\d+)\/?$/);
      if (!m) m = href.match(/\/book\/\d+\/(\d+)\/?/);
      if (!m) continue;

      const id = m[1];

      if (id === "497312" || id === "488566") continue;
      if (seen[id]) continue;

      let title = this.attr(a, "title").trim();
      if (!title) {
        const img = a.querySelector("img");
        if (img) title = this.attr(img, "alt").trim();
      }
      if (!title) {
        const tEl = a.querySelector(".card-title, .name-wrapper, .comic-name, .title");
        if (tEl) title = this.text(tEl);
      }
      if (!title) continue;
      title = title.replace(/,?[^,]*漫画\s*$/, "").trim() || title;

      let cover = this.findNewAndClassicCover(a);
      if (!cover) {
        let node = a.parentElement;
        for (let i = 0; i < 4 && node; i++) {
          cover = this.findNewAndClassicCover(node);
          if (cover) break;
          node = node.parentElement;
        }
      }

      cover = this.normalizeCover(id, cover);
      if (!cover) {
        cover = `https://image.yqmh.com/mh/${id}_2_1.jpg-400x200.webp`;
      }

      seen[id] = true;
      comics.push(new Comic({
        id,
        title,
        cover: this.abs(cover),
        tags: [],
        description: "",
      }));
    }

    return comics;
  }

  findNewAndClassicCover(node) {
    if (!node) return "";

    const imgCover = this.findCoverFromImgs(node.querySelectorAll("img"));
    if (imgCover) return imgCover;

    const bgEls = node.querySelectorAll("[style*='background-image'], [data-bg], [data-background], [data-original]");
    for (const el of bgEls) {
      const bg = this.extractStyleUrl(this.attr(el, "style"));
      if (this.isValidCover(bg)) return bg;

      const dataBg = this.attr(el, "data-bg")
        || this.attr(el, "data-background")
        || this.attr(el, "data-original");
      if (this.isValidCover(dataBg)) return dataBg;
    }

    for (const el of node.querySelectorAll("[data-src], [data-lazy-src]")) {
      const v = this.attr(el, "data-src") || this.attr(el, "data-lazy-src");
      if (this.isValidCover(v)) return v;
    }

    return "";
  }

  parseList(document) {
    return this.parseComicsFromAnchors(document);
  }

  parseMaxPage(doc, fallback) {
    let maxPage = fallback || 1;
    for (const a of doc.querySelectorAll("a[href]")) {
      const href = this.attr(a, "href");
      const m = href.match(/page\/?(\d+)/) || href.match(/[?&]page=(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxPage && n < 10000) maxPage = n;
      }
      const txt = this.text(a);
      const n2 = parseInt(txt, 10);
      if (!isNaN(n2) && n2 > maxPage && n2 < 10000) maxPage = n2;
    }
    return maxPage;
  }

  explore = [
    {
      title: "看漫画",
      type: "multiPartPage",
      load: async () => {
        const res = await Network.get(this.baseUrl + "/", this.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        const doc = new HtmlDocument(res.body);
        const result = [];

        const banner = doc.querySelector('div[data-tpl="74"]');
        if (banner) {
          const comics = this.parseComicsFromAnchors(banner);
          if (comics.length) result.push({ title: "精选推荐", comics, viewMore: null });
        }

        const sections = doc.querySelectorAll("div.mult.sow");
        for (const section of sections) {
          const titleEl = section.querySelector(".mult-title");
          const title = titleEl ? this.text(titleEl) : "";
          if (!title || /排行|分类|下载app/.test(title)) continue;

          let comics;
          if (/最近新作|特别推荐/.test(title)) {
            comics = this.parseNewAndClassicList(section);
          } else {
            comics = this.parseComicsFromAnchors(section);
          }
          if (comics.length === 0) continue;

          let viewMore = null;
          const moreEl = section.querySelector("a.mult-more");
          if (moreEl) {
            const href = this.attr(moreEl, "href");
            if (href) {
              viewMore = {
                page: "category",
                attributes: { category: title, param: this.abs(href) },
              };
            }
          }
          result.push({ title, comics, viewMore });
        }

        doc.dispose();
        if (result.length === 0) throw "首页没有解析到任何板块";
        return result;
      },
      onThumbnailLoad: () => ({ headers: this.headers }),
    },
  ];

  // ========== 分类页（只有 6 个部分，无任何推荐/专题） ==========
  category = {
    title: "看漫画",
    parts: [
      {
        name: "题材",
        type: "fixed",
        categories: Object.keys(Kanman.sortCategoryMap["题材"]),
        categoryParams: Object.values(Kanman.sortCategoryMap["题材"]),
        itemType: "category",
      },
      {
        name: "地区",
        type: "fixed",
        categories: Object.keys(Kanman.sortCategoryMap["地区"]),
        categoryParams: Object.values(Kanman.sortCategoryMap["地区"]),
        itemType: "category",
      },
      {
        name: "进度",
        type: "fixed",
        categories: Object.keys(Kanman.sortCategoryMap["进度"]),
        categoryParams: Object.values(Kanman.sortCategoryMap["进度"]),
        itemType: "category",
      },
      {
        name: "色彩",
        type: "fixed",
        categories: Object.keys(Kanman.sortCategoryMap["色彩"]),
        categoryParams: Object.values(Kanman.sortCategoryMap["色彩"]),
        itemType: "category",
      },
      {
        name: "主题",
        type: "fixed",
        categories: Object.keys(Kanman.sortCategoryMap["主题"]),
        categoryParams: Object.values(Kanman.sortCategoryMap["主题"]),
        itemType: "category",
      },
      {
        name: "字母",
        type: "fixed",
        categories: Object.keys(Kanman.sortCategoryMap["字母"]),
        categoryParams: Object.values(Kanman.sortCategoryMap["字母"]),
        itemType: "category",
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      const p = String(param || "").trim();

      // ★ 完整 URL 走专题页（发现页各板块「查看更多」走这里）
      if (/^https?:\/\//i.test(p)) {
        let url = p;
        if (page && page > 1) {
          url += (url.indexOf("?") >= 0 ? "&" : "?") + "page=" + page;
        }
        const res = await Network.get(url, this.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        const doc = new HtmlDocument(res.body);

        let comics;
        if (category === "最近新作·抢先看" || category === "特别推荐·经典回顾") {
          comics = this.parseNewAndClassicList(doc);
        } else {
          comics = this.parseList(doc);
        }

        const maxPage = this.parseMaxPage(doc, page || 1);
        doc.dispose();
        return { comics, maxPage };
      }

      // 普通分类：/sort/{code}.html
      const sortCode = p || "all";
      const orderby = (options && options[0]) ? String(options[0]).split("-")[0] : "click";
      let url = `${this.baseUrl}/sort/${sortCode}.html?orderby=${orderby}`;
      if (page && page > 1) url += `&page=${page}`;

      const res = await Network.get(url, this.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      const doc = new HtmlDocument(res.body);

      const comics = this.parseSortComics(doc);
      const maxPage = comics.length >= 30 ? page + 1 : page;
      doc.dispose();
      return { comics, maxPage };
    },
    onThumbnailLoad: () => ({ headers: this.headers }),
    optionList: [
      {
        type: "select",
        label: "排序",
        options: ["click-人气", "shoucang-收藏", "date-更新"],
        showWhen: ["题材", "地区", "进度", "色彩", "主题", "字母"],
      },
    ],
  };

  search = {
    load: async (keyword, options, page) => {
      const kw = String(keyword || "").trim();
      if (!kw) return { comics: [], maxPage: 1 };

      const url = `${this.baseUrl}/api/serachcomic/?product_id=1&productname=kmh&platformname=wap&serachKey=${encodeURIComponent(kw)}&topNumber=10`;
      const res = await Network.get(url, { ...this.headers, Accept: "application/json,*/*" });
      if (res.status !== 200) throw `Invalid status: ${res.status}`;

      let data;
      try { data = JSON.parse(res.body); } catch (_) { throw "搜索接口返回异常"; }

      let list = (data && data.data && data.data.data) || (data && data.data) || data || [];
      if (!Array.isArray(list)) list = [];

      const comics = [];
      const seen = {};
      for (const it of list) {
        const id = String(it.comic_id || it.id || "").replace(/\D/g, "");
        if (!id || seen[id]) continue;
        const title = String(it.comic_name || it.name || "").trim();
        if (!title) continue;
        const cover = this.normalizeCover(id, it.cover || "");
        const subTitle = String(it.latest_cartoon_topic_name || it.last_chapter_name || "").trim();
        seen[id] = true;
        comics.push(new Comic({ id, title, cover: this.abs(cover), subTitle }));
      }
      return { comics, maxPage: 1 };
    },
    optionList: [],
    enableTagsSuggestions: false,
  };

  comic = {
    idMatch: "^(https?://(m|www)\\.kanman\\.com)?/?\\d+/?$",

    link: {
      domains: ["m.kanman.com", "www.kanman.com"],
      linkToId: (url) => {
        const m = String(url || "").match(/(\d+)\/?$/);
        if (m) return m[1];
        return String(url || "").replace(/\D/g, "");
      },
    },

    loadInfo: async (id) => {
      const cid = this.cidOf(id);

      const listUrl = `${this.baseUrl}/api/getchapterlist?product_id=1&productname=kmh&platformname=wap&comic_id=${cid}`;
      const listRes = await Network.get(listUrl, {
        ...this.headers,
        Accept: "application/json,*/*",
        Referer: `${this.baseUrl}/${cid}/`,
      });
      if (listRes.status !== 200) throw `Invalid status: ${listRes.status}`;

      let listJson;
      try {
        listJson = JSON.parse(listRes.body);
      } catch (_) {
        throw "Invalid chapter list JSON";
      }

      let list = (listJson && listJson.data) || [];
      if (!Array.isArray(list)) list = [];
      if (list.length < 1) throw "No chapters";

      let title = "";
      let author = "";
      let categories = [];
      let description = "";

      try {
        const pageRes = await Network.get(`${this.baseUrl}/${cid}/`, this.headers);
        if (pageRes.status === 200) {
          const doc = new HtmlDocument(pageRes.body);

          // ★ 标题多级回退，且过滤掉站点通用 title
          let rawTitle = this.meta(doc, "og:title");

          // 如果 og:title 是站点通用标题，丢弃
          if (rawTitle && (rawTitle.indexOf("穿越西元3000后漫画") >= 0
              || rawTitle.indexOf("漫画大全") >= 0
              || rawTitle.indexOf("看漫网") >= 0)) {
            rawTitle = "";
          }
          if (rawTitle) {
            rawTitle = rawTitle.replace(/漫画.*$/, "").trim();
          }

          if (!rawTitle || /^\d+$/.test(rawTitle) || rawTitle === "漫画") {
            const h1El = doc.querySelector("h1")
              || doc.querySelector(".comic-title")
              || doc.querySelector(".comic-detail-info h1")
              || doc.querySelector(".comic-detail-cover h1");
            if (h1El) {
              rawTitle = this.text(h1El).replace(/漫画.*$/, "").trim();
            }
          }

          if (!rawTitle || /^\d+$/.test(rawTitle) || rawTitle === "漫画") {
            const bookName = this.meta(doc, "og:novel:book_name");
            if (bookName) rawTitle = bookName.trim();
          }

          title = rawTitle || cid;

          author = this.meta(doc, "og:novel:author");
          // 过滤通用 author
          if (author && author.indexOf("看漫画") >= 0) author = "";

          const kind = this.meta(doc, "og:novel:category");
          if (kind && kind.indexOf("漫画") < 0) {
            categories = kind.split(/[,\/|]/).map(s => s.trim()).filter(Boolean);
          }

          description = this.meta(doc, "og:description") || this.meta(doc, "description");
          // 过滤站点通用描述
          if (description && description.indexOf("看漫画致力于打造") >= 0) {
            description = "";
          }
        }
      } catch (_) {}

      if (!title) title = cid;

      const cover = `https://image.yqmh.com/mh/${cid}_2_1.jpg-400x200.webp`;

      const items = list.slice();
      items.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

      const chapters = new Map();
      for (const ch of items) {
        const chId = String(ch.chapter_newid || ch.chapter_id || ch.cartoon_id || ch.id || "");
        if (!chId) continue;
        let name = String(ch.chapter_name || ch.cartoon_name || ch.name || ch.title || chId).trim();
        if (ch.is_vip || (ch.price && Number(ch.price) > 0)) {
          name = `[VIP] ${name}`;
        }
        chapters.set(chId, name);
      }

      const tags = {};
      if (author) tags["作者"] = [author];
      if (categories.length) tags["类型"] = categories;

      return new ComicDetails({
        title,
        cover,
        description,
        tags,
        chapters,
        url: `${this.baseUrl}/${cid}/`,
      });
    },

    loadEp: async (comicId, epId) => {
      const cid = this.cidOf(comicId);
      const chId = String(epId);
      const url = `${this.baseUrl}/api/getchapterinfov2?product_id=1&productname=kmh&platformname=wap&comic_id=${cid}&chapter_newid=${encodeURIComponent(chId)}`;
      const res = await Network.get(url, {
        ...this.headers,
        Accept: "application/json,*/*",
        Referer: `${this.baseUrl}/${cid}/`,
      });
      if (res.status !== 200) throw `Invalid status: ${res.status}`;

      let data;
      try {
        data = JSON.parse(res.body);
      } catch (_) {
        throw "Invalid chapter info JSON";
      }

      const cur = (data && data.data && data.data.current_chapter) || {};
      let images = cur.chapter_img_list || [];
      if (!Array.isArray(images) || images.length < 1) throw "No images";

      images = images
        .map(u => this.abs(String(u || "")))
        .filter(u => /^https?:\/\//i.test(u));

      if (images.length < 1) throw "No images";
      return { images };
    },

    onThumbnailLoad: () => ({
      headers: {
        Referer: "https://m.kanman.com/",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      },
    }),

    onImageLoad: () => ({
      headers: {
        Referer: "https://m.kanman.com/",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      },
    }),
  };
}