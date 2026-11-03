/** @type {import('./_venera_.js')} */
class M90mh extends ComicSource {
  name = "90漫画";
  key = "mh90";
  version = "0.3.9";
  minAppVersion = "1.6.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/90mh.js";

  get baseUrl() { return "https://m.90mh.cc"; }

  get headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Referer": this.baseUrl + "/",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
  }

  // ==================== 纯 JS Base64 ====================
  b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  b64decode(str) {
    let output = "";
    let buffer = 0, bits = 0;
    str = String(str).replace(/[^A-Za-z0-9+/=]/g, "");
    for (let i = 0; i < str.length; i++) {
      const c = str.charAt(i);
      if (c === "=") break;
      const val = this.b64chars.indexOf(c);
      if (val < 0) continue;
      buffer = (buffer << 6) | val;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }
    return output;
  }

  b64encode(str) {
    let output = "";
    str = String(str);
    for (let i = 0; i < str.length; i += 3) {
      const c1 = str.charCodeAt(i);
      const c2 = str.charCodeAt(i + 1);
      const c3 = str.charCodeAt(i + 2);
      output += this.b64chars.charAt(c1 >> 2);
      output += this.b64chars.charAt(((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4));
      output += isNaN(c2) ? "=" : this.b64chars.charAt(((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 6));
      output += isNaN(c3) ? "=" : this.b64chars.charAt(c3 & 63);
    }
    return output;
  }

  // ==================== 图片有效性校验 ====================
  isValidImage(src) {
    if (!src || !src.startsWith("http")) return false;
    if (src.includes("m.90mh.cc/themes") || src.includes("head_line") || src.includes("logo") || src.includes("avatar") || src.includes("icon") || src.includes("cover")) {
      return false;
    }
    if (src.includes("/images/comic/")) return true;
    if (src.endsWith(".gif")) return false;
    return true;
  }

  // ==================== 请求封装 ====================
  async fetch(url) {
    let currentUrl = url;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await Network.get(currentUrl, this.headers);
        
        if (r.status === 403 && r.body.includes("window.location.href")) {
          const m = r.body.match(/window\.location\.href\s*=\s*["']([^"']+)["']/);
          if (m && m[1]) {
             let nextUrl = m[1];
             if (nextUrl.startsWith("/")) nextUrl = this.baseUrl + nextUrl;
             currentUrl = nextUrl;
             continue;
          }
        }

        if (r.status === 500) {
           await new Promise(res => setTimeout(res, 1000));
           continue;
        }

        if (r.status !== 200) throw `HTTP状态码：${r.status}`;

        const body = r.body;
        const isJumpPage = body.length < 3000 && body.includes("window.atob") && body.includes("<title>Loading</title>");
        if (isJumpPage) {
          const m = body.match(/window\.atob\("([^"]+)"\)/);
          if (m && m[1]) {
            const target = this.b64decode(m[1]);
            const rParam = this.b64encode(url);
            currentUrl = target + (target.includes("?") ? "&" : "?") + "r=" + rParam;
            continue;
          }
        }
        
        return { body, finalUrl: currentUrl };

      } catch(e) {
        if (attempt === 2) throw e;
        await new Promise(res => setTimeout(res, 1000));
      }
    }
    throw "请求失败或超时";
  }

  async getDoc(url) {
    const res = await this.fetch(url);
    return { doc: new HtmlDocument(res.body), base: res.finalUrl };
  }

  absolute(url, base = this.baseUrl) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("//")) return "http:" + url;
    if (url.startsWith("/")) return base.replace(/\/+$/, "") + url;
    return base.replace(/\/+$/, "") + "/" + url;
  }

  text(el) { return el ? (el.text || "").trim() : ""; }
  attr(el, name) { return el && el.attributes ? (el.attributes[name] || "") : ""; }

  // ==================== 卡片解析 ====================
  parseCards(doc, base) {
    const comics = [];
    const seen = new Set();
    
    // 避免使用 ES6 展开符，提高 QuickJS 兼容性
    let nodes = [];
    const items = doc.querySelectorAll(".itemBox");
    for (let i = 0; i < items.length; i++) nodes.push(items[i]);
    const lists = doc.querySelectorAll(".list-comic");
    for (let i = 0; i < lists.length; i++) nodes.push(lists[i]);

    for (const card of nodes) {
      const link = card.querySelector("a");
      if (!link) continue;
      const href = this.attr(link, "href");
      if (!href) continue;

      let match = href.match(/\/manhua\/([^/]+)/);
      let id = match ? match[1] : this.absolute(href, base);
      if (seen.has(id)) continue;

      let image = card.querySelector("mip-img, img");
      let cover = "";
      if (image) {
        cover = this.attr(image, "data-original") || this.attr(image, "data-src") || this.attr(image, "src") || "";
        if (cover && !/^https?:\/\//i.test(cover)) cover = this.absolute(cover, base);
      }

      let title = this.text(card.querySelector(".title")) || this.text(card.querySelector(".txtA")) || this.attr(link, "title") || this.text(link);
      if (id && title) {
        seen.add(id);
        comics.push(new Comic({ id, title, cover }));
      }
    }
    return comics;
  }

  // ==================== 详情页多分组解析 ====================
  parseGroupedChapters(doc, base) {
    const groups = {};
    let currentGroup = "默认";

    const nodes = doc.querySelectorAll(".title1, .Drama");
    for (const node of nodes) {
      const cls = this.attr(node, "class") || "";
      if (cls.includes("title1")) {
        const h3 = node.querySelector("h3");
        if (h3) {
          let text = this.text(h3);
          if (text && text.length < 30 && !/热门推荐|更多|最近更新|友情链接/.test(text)) {
            currentGroup = text.replace(/[:：]/g, "").trim();
          }
        }
      } else if (cls.includes("Drama")) {
        const links = node.querySelectorAll("a");
        let groupMap = {};
        for (const a of links) {
          const u = this.absolute(this.attr(a, "href"), base);
          const t = this.text(a);
          if (u && t && !/首页|更新|排行|分类|国产/.test(t)) groupMap[u] = t;
        }
        if (Object.keys(groupMap).length > 0) {
          if (!groups[currentGroup]) groups[currentGroup] = {};
          Object.assign(groups[currentGroup], groupMap);
        }
      }
    }

    if (Object.keys(groups).length === 0) {
      let links = doc.querySelectorAll("#chapter-list-1 li a, .chapter-list-1 li a, .list ul li a, .detail-list-select li a");
      const fallback = {};
      for (const a of links) {
        const u = this.absolute(this.attr(a, "href"), base);
        const t = this.text(a);
        if (u && t) fallback[u] = t;
      }
      if (Object.keys(fallback).length > 0) groups["默认"] = fallback;
    }
    return groups;
  }

  // ==================== 发现页 ====================
  explore = [
    {
      title: "90漫画",
      type: "singlePageWithMultiPart",
      load: async () => {
        const { doc, base } = await this.getDoc(this.baseUrl + "/");
        const parts = {};
        const boxes = doc.querySelectorAll(".imgBox");
        for (const box of boxes) {
          const titleEl = box.querySelector(".Sub_H2 .Title");
          const title = this.text(titleEl);
          if (!title || /友情链接|底部|页脚/.test(title)) continue;
          const comics = this.parseCards(box, base);
          if (comics.length > 0) {
            parts[title] = comics;
          }
        }
        if (doc.dispose) doc.dispose();
        if (Object.keys(parts).length === 0) throw "发现页解析为空";
        return parts;
      },
    },
  ];

  // ==================== 搜索 ====================
  search = {
    load: async (keyword, options, page) => {
      let cleanKeyword = keyword.replace(/#/g, "").trim();
      if (!cleanKeyword) cleanKeyword = keyword;

      const url = `${this.baseUrl}/search/?keywords=${encodeURIComponent(cleanKeyword)}`;
      const { doc, base } = await this.getDoc(url);
      const comics = this.parseCards(doc, base);
      if (doc.dispose) doc.dispose();
      if (!comics.length) throw "没有解析到搜索结果";
      return { comics, maxPage: 1 };
    },
    enableTagsSuggestions: false,
  };

  // ==================== 分类页 ====================
  category = {
    title: "90漫画",
    parts: [
      {
        name: "按类型",
        type: "fixed",
        categories: ["全部", "儿童漫画", "少年漫画", "少女漫画", "青年漫画"],
        categoryParams: ["all", "ertong", "shaonian", "shaonv", "qingnian"],
        itemType: "category",
      },
      {
        name: "按地区",
        type: "fixed",
        categories: ["全部", "日本", "大陆", "香港", "台湾", "欧美", "韩国", "其他"],
        categoryParams: ["all", "riben", "dalu", "xianggang", "taiwan", "oumei", "hanguo", "qita"],
        itemType: "category",
      },
      {
        name: "按剧情",
        type: "fixed",
        categories: [
          "全部", "爱情", "魔法", "校园", "恐怖", "脑洞", "灵异", "恋爱", "虐心", "奇幻",
          "彩虹", "都市", "神鬼", "搞笑", "战争", "武侠", "热血", "冒险", "欢乐向", "格斗",
          "爆笑", "萌系", "机甲", "魔幻", "玄幻", "纯爱", "唯美", "科幻", "励志", "其它",
          "古风", "治愈", "震撼", "穿越", "青春", "剧情", "美食", "竞技", "悬疑", "推理",
          "幻想", "神魔", "生活", "动作", "耽美", "历史", "运动", "体育", "职场", "恶搞",
          "后宫", "百合", "社会", "机战", "伪娘", "性转换", "霸总", "漫改", "萝莉",
          "吸血", "侦探", "少女", "杂志", "日更", "诱惑", "音乐舞蹈", "老师", "轻小说",
          "宅男腐女", "节操", "战斗", "少年", "四格", "颜艺", "卖肉", "日常",
          "西方魔幻", "宅系", "高清单行", "东方", "限制级", "同人", "惊悚", "舰娘", "绅士",
          "乙女", "改编", "猎奇", "总裁", "异世界", "秀吉", "橘味", "家庭", "ゆり", "泡泡",
          "宫斗", "青年", "栏目", "泛爱", "装逼"
        ],
        categoryParams: [
          "all", "aiqing", "mofa", "xiaoyuan", "kongbu", "naodong", "lingyi", "lianai", "nuexin", "qihuan",
          "caihong", "dushi", "shengui", "gaoxiao", "zhanzheng", "wuxia", "rexue", "maoxian", "huanlexiang", "gedou",
          "baoxiao", "mengxi", "jijia", "mohuan", "xuanhuan", "chunai", "weimei", "kehuan", "lizhi", "qita",
          "gufeng", "zhiyu", "zhenhan", "chuanyue", "qingchun", "juqing", "meishi", "jingji", "xuanyi", "tuili",
          "huanxiang", "shenmo", "shenghuo", "dongzuo", "danmei", "lishi", "yundong", "tiyu", "zhichang", "egao",
          "hougong", "baihe", "shehui", "jizhan", "weiniang", "xingzhuanhuan", "bazong", "mangai", "luoli",
          "xixue", "zhentan", "shaonv", "zazhi", "rigeng", "youhuo", "yinyuewudao", "laoshi", "qingxiaoshuo",
          "zhainanfunv", "jiecao", "zhandou", "shaonian", "sige", "yanyi", "maimai", "richang",
          "xifangmohuan", "zhaixi", "gaoqingdanxing", "dongfang", "xianzhiji", "tongren", "jingsong", "jianniang", "shenshi",
          "yinv", "gaibian", "lieqi", "zongcai", "yishijie", "xiuji", "juwei", "jiating", "yuli", "paopao",
          "gongdou", "qingnian", "lanmu", "fanai", "zhuangbi"
        ],
        itemType: "category",
      },
      {
        name: "按字母",
        type: "fixed",
        categories: ["全部", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "其他"],
        categoryParams: ["all", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "qita"],
        itemType: "category",
      },
      {
        name: "按进度",
        type: "fixed",
        categories: ["全部", "已完结", "连载中"],
        categoryParams: ["all", "wanjie", "lianzai"],
        itemType: "category",
      },
    ],
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      let sort = options && options.length > 0 ? options[0] : "post";
      const p = (param === "all" || !param) ? "" : param;

      let candidates = [];
      
      let pathBase = `${this.baseUrl}/list/`;
      if (p) pathBase += `${p}/`;
      
      if (sort === "post" || sort === "-post") {
        if (page > 1) {
          candidates.push(`${pathBase}${page}/`);
          candidates.push(`${pathBase}?page=${page}`);
          candidates.push(`${this.baseUrl}/list_${page}/`); 
        }
        candidates.push(pathBase);
      } else {
        pathBase += `${sort}/`;
        if (page > 1) {
          candidates.push(`${pathBase}${page}/`);
          candidates.push(`${pathBase}?page=${page}`);
          candidates.push(`${this.baseUrl}/list_${page}/`);
        }
        candidates.push(pathBase);
      }

      let lastErr = null;
      for (const url of candidates) {
        try {
          const { doc, base } = await this.getDoc(url);
          const comics = this.parseCards(doc, base);
          if (doc.dispose) doc.dispose();
          if (comics.length > 0) {
            return { comics, maxPage: page + 1 };
          }
        } catch (e) {
          lastErr = String(e);
        }
      }
      throw `分类加载失败：${lastErr || "无结果"}`;
    },
    optionList: [
      {
        label: "排序",
        options: [
          "post-按发布排序",
          "update-按更新排序",
          "click-按点击排序"
        ]
      }
    ],
  };

  // ==================== 详情 / 阅读 ====================
  comic = {
    link: {
      domains: ["m.90mh.cc", "www.90mh.cc", "m.90mh.com", "www.90mh.com"],
      linkToId: (url) => {
        let match = url.match(/\/manhua\/([^/]+)/);
        return match ? match[1] : url;
      }
    },

    loadInfo: async (id) => {
      let fullUrl = id.startsWith("http") ? id : `${this.baseUrl}/manhua/${id}/`;
      const { doc, base } = await this.getDoc(fullUrl);

      const tags = { "作者": [], "类型": [] };
      for (const dd of doc.querySelectorAll("dl dd")) {
        const t = this.text(dd);
        if (t && t.length < 30) tags["作者"].push(t);
      }

      let coverEl = doc.querySelector(".Introduct_Sub .pic mip-img, .Introduct_Sub .pic img, .comic-view .pic mip-img, .comic-view .pic img, .pic mip-img, .pic img, #Cover img, img");
      let cover = "";
      if (coverEl) cover = this.attr(coverEl, "data-src") || this.attr(coverEl, "src") || "";
      if (!cover) {
        const ogImage = doc.querySelector('meta[property="og:image"]');
        if (ogImage) cover = this.attr(ogImage, "content") || "";
      }
      if (cover && !/^https?:\/\//i.test(cover)) cover = this.absolute(cover, base);

      const groupedChapters = this.parseGroupedChapters(doc, base);
      
      let h1 = doc.querySelector("h1");
      let title = h1 ? this.text(h1) : this.text(doc.querySelector(".title"));

      if (doc.dispose) doc.dispose();
      
      if (Object.keys(groupedChapters).length === 0) throw "未找到任何章节";

      return new ComicDetails({
        title: title || id,
        cover: cover || "",
        description: this.text(doc.querySelector(".txtDesc")),
        tags,
        chapters: groupedChapters,
        url: fullUrl
      });
    },

    loadEp: async (comicId, epId) => {
      let baseNoExt = epId.replace(/\.html$/, "");
      let totalPages = 1;
      let pageImagesMap = {};

      try {
        const { doc } = await this.getDoc(epId);
        let imgs = [];
        for (const img of doc.querySelectorAll("img, mip-img")) {
          let src = this.attr(img, "data-src") || this.attr(img, "data-original") || this.attr(img, "src");
          if (this.isValidImage(src)) {
            imgs.push(src);
          }
        }
        if (imgs.length > 0) pageImagesMap[1] = imgs;

        const totalEl = doc.querySelector("#k_total");
        if (totalEl) totalPages = parseInt(this.text(totalEl)) || 1;
        if (doc.dispose) doc.dispose();
      } catch (e) {}

      let pageUrls = [];
      for (let i = 2; i <= totalPages; i++) {
        pageUrls.push({ page: i, url: `${baseNoExt}-${i}.html` });
      }

      const CONCURRENCY = 3;
      for (let i = 0; i < pageUrls.length; i += CONCURRENCY) {
        let batch = pageUrls.slice(i, i + CONCURRENCY);
        let promises = batch.map(async (item) => {
          for (let retry = 0; retry < 2; retry++) {
            try {
              const { doc } = await this.getDoc(item.url);
              let imgs = [];
              for (const img of doc.querySelectorAll("img, mip-img")) {
                let src = this.attr(img, "data-src") || this.attr(img, "data-original") || this.attr(img, "src");
                if (this.isValidImage(src)) {
                  imgs.push(src);
                }
              }
              if (imgs.length > 0) {
                pageImagesMap[item.page] = imgs;
                if (doc.dispose) doc.dispose();
                break;
              }
              if (doc.dispose) doc.dispose();
            } catch (e) {
              if (retry === 1) break; 
              await new Promise(r => setTimeout(r, 800));
            }
          }
        });

        await Promise.all(promises);
        await new Promise(r => setTimeout(r, 300));
      }

      let images = [];
      for (let i = 1; i <= totalPages; i++) {
        if (pageImagesMap[i]) {
          images.push(...pageImagesMap[i]);
        }
      }

      if (images.length === 0) throw "没有找到章节图片";
      return { images };
    },

    onImageLoad: () => ({ headers: this.headers }),
  };
}