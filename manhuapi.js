class Manhuapi extends ComicSource {
  name = "漫画皮";
  key = "manhuapi";
  version = "1.4.2";   // 全部改用字符串匹配；封面用 og:image；章节按 id 升序；简介用 bookintro 定位
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/manhuapi.js";

  static baseUrl = "http://www.manhuapi.cc";
  static headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };

  static abs(href) {
    if (!href) return "";
    if (href.startsWith("//")) return "https:" + href;
    if (/^https?:/i.test(href)) return href.replace(/^http:/i, "https:");
    try {
      return new URL(href, Manhuapi.baseUrl + "/").href;
    } catch (_) {
      return href;
    }
  }

  static decodeEntities(s) {
    if (!s) return "";
    let r = String(s);
    r = r.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
    r = r.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
    r = r.replace(/&amp;/g, "&");
    r = r.replace(/&lt;/g, "<");
    r = r.replace(/&gt;/g, ">");
    r = r.replace(/&quot;/g, '"');
    r = r.replace(/&#39;/g, "'");
    r = r.replace(/&nbsp;/g, " ");
    return r;
  }

  // ===== 通用正则：从 HTML 里提取 meta content =====
  static extractMeta(html, key) {
    let idx = html.indexOf(key);
    if (idx === -1) return "";
    let cIdx = html.indexOf('content=', idx);
    if (cIdx === -1) return "";
    let s = html.indexOf('"', cIdx);
    if (s === -1) return "";
    let e = html.indexOf('"', s + 1);
    if (e === -1) return "";
    return html.substring(s + 1, e);
  }

  static parseList(document) {
    let comics = [];
    let seen = {};
    for (let a of document.querySelectorAll("a[href*='/manhua/']")) {
      let href = a.attributes["href"] || "";
      let m = href.match(/\/manhua\/(\d+)\.html/i);
      if (!m) continue;
      let id = m[1];
      if (seen[id]) continue;
      let title = (a.attributes["title"] || a.text || "").trim().replace(/\s+/g, " ");
      let img = a.querySelector("img");
      let cover = "";
      if (img) {
        cover = img.attributes["data-src"] || img.attributes["src"] || "";
        if (!title) title = (img.attributes["alt"] || "").trim();
      }
      if (!title || title.length < 2) continue;
      if (/list|onclick|rank/i.test(href)) continue;
      seen[id] = true;
      comics.push(new Comic({
        id,
        title: Manhuapi.decodeEntities(title),
        cover: Manhuapi.abs(cover),
      }));
    }
    return comics;
  }

  // ============ 发现页 ============
  explore = [
    {
      title: "漫画皮",
      type: "singlePageWithMultiPart",
      load: async () => {
        let sections = [
          { title: "精品漫画",     url: `${Manhuapi.baseUrl}/manhua/onclick/9/` },
          { title: "热门推荐漫画", url: `${Manhuapi.baseUrl}/manhua/onclick/1/` },
          { title: "最新章节漫画", url: `${Manhuapi.baseUrl}/manhua/onclick/10/` },
          { title: "收藏推荐漫画", url: `${Manhuapi.baseUrl}/manhua/onclick/5/` },
          { title: "最新上架漫画", url: `${Manhuapi.baseUrl}/manhua/` },
        ];

        let result = {};
        for (let sec of sections) {
          try {
            let res = await Network.get(sec.url, Manhuapi.headers);
            if (res.status !== 200) continue;
            let doc = new HtmlDocument(res.body);
            let comics = Manhuapi.parseList(doc);
            if (comics.length > 0) {
              result[sec.title] = comics.slice(0, 6);
            }
          } catch (e) {}
        }

        if (Object.keys(result).length === 0) throw "首页未解析到任何分区";
        return result;
      },
      onThumbnailLoad: (url) => {
        return {
          headers: {
            ...Manhuapi.headers,
            Referer: Manhuapi.baseUrl + "/",
          },
        };
      },
    },
  ];

  category = {
    title: "漫画皮",
    parts: [
      {
        name: "类型",
        type: "fixed",
        itemType: "category",
        categories: [
          "全部", "恋爱", "古风", "穿越", "玄幻", "游戏", "精品", "后宫",
          "热血", "武侠", "搞笑", "宠物", "日更", "霸总", "都市", "冒险",
          "修真", "运动", "神魔", "新作", "历史", "生活", "社会", "科幻",
          "动作", "战争", "竞技", "萝莉", "吸血", "推理", "悬疑", "漫改",
          "真人", "机战", "恐怖", "御姐", "爱情", "校园", "百合", "格斗",
          "职场", "欢乐向", "神鬼", "四格", "西方魔幻", "东方", "音乐舞蹈", "奇幻",
          "爆笑", "少女", "彩虹", "纯爱", "侦探", "架空", "轻小说", "伪娘",
          "魔幻", "搞笑喜剧", "灵异", "美食", "耽美BL", "复仇", "轻松搞笑", "同人漫画",
          "魔法", "节操", "治愈", "故事", "励志", "其他", "性转换", "萌系",
          "舰娘", "颜艺", "高清单行", "耽美", "忍者", "宅系", "杂志", "虐心",
          "惊悚", "魔幻神话", "校园青春", "布卡漫画", "玄幻穿越", "动作格斗", "科幻未来", "青年漫画",
          "剧情", "搞笑生活", "历史漫画", "震撼", "正剧", "惊奇", "家庭", "蔷薇",
          "唯美", "爆笑喜剧", "脑洞", "青春", "浪漫", "感动", "战斗", "史诗",
          "伦理", "轻松", "日常", "漫画岛", "恶搞", "段子", "温馨", "神话",
          "婚姻", "爽流", "体育", "娱乐圈", "仙侠", "宫廷", "性转", "手工",
          "科技", "异世界", "未来", "烧脑", "致郁", "mhuaquan", "宫斗", "同人",
          "动画", "机甲", "明星", "秀吉", "AA", "总裁", "美少女", "体育竞技",
          "霸总恋爱", "生活古风", "综合其它", "校园搞笑", "校园生活动作", "修真热血", "竞技体育", "泡泡",
          "悬疑探案", "短篇漫画", "萌", "恐怖鬼怪", "四格漫画", "防疫", "恐怖灵异", "僵尸",
          "栏目", "百合悬疑", "百合奇幻", "恋爱魔法", "校园百合", "校园神鬼", "冒险科幻", "热血冒险",
          "热血冒险科幻", "冒险搞笑", "校园悬疑", "校园彩虹", "冒险魔法", "恐怖神鬼", "热血奇幻", "热血恋爱百合",
          "科幻战争", "恋爱搞笑", "冒险奇幻", "恋爱后宫历史", "热血校园冒险", "热血冒险搞笑", "恋爱历史", "热血彩虹冒险",
          "热血冒险奇幻", "热血冒险后宫", "奇幻魔法", "热血冒险魔法", "恋爱奇幻", "热血神鬼", "少年漫画", "ゆり",
          "异能", "故事漫画", "橘味", "重生", "怪物", "系统", "末日", "高甜",
          "末世", "妖怪", "修仙", "逆袭", "神仙", "大女主", "青年", "电竞",
          "女神", "西幻", "惊险", "游戏竞技", "改编", "男生", "欧风", "少年",
          "现代", "古装", "动作冒险", "橘调", "奇幻冒险", "装逼", "兄弟情", "亲情",
          "武侠仙侠", "少男", "完结", "悬疑灵异", "智斗", "BL", "奇幻爱情", "韩漫",
          "欧式宫廷", "古风穿越", "女生", "幽默搞笑", "日漫", "浪漫爱情", "GL", "权谋",
          "腹黑", "猎奇", "生存", "其它", "TS", "未来漫画家", "泛爱", "福瑞",
          "耽美人生", "超级英雄", "养成", "古代宫廷", "少儿", "少年热血", "幻想", "暖萌",
          "生活漫画", "小僵尸", "快看漫画", "情感", "2021大赛", "长条", "国漫", "日本",
          "豪门总裁", "豪快", "现代言情", "韩国", "欧美", "幻想言情", "悬疑脑洞", "古言脑洞",
          "独特", "成长", "都市脑洞", "玄幻脑洞", "玄幻言情", "虐渣", "现言萌宝", "其他漫画",
          "战争漫画", "现言脑洞", "古代言情", "直播", "团宠", "双男主", "游戏体育", "偶像",
          "正能量", "LGBTQ+", "橘系", "军事", "TL", "台湾原创作品", "迪化", "regions.日本",
          "音乐", "regions.其它漫画", "金手指", "甜宠", "限制级", "古言萌宝", "黑暗", "神豪",
          "现言甜宠", "暗黑", "乡村", "高智商", "悬疑推理", "机智", "召唤兽", "内涵",
          "ABO", "热门", "救赎", "舞蹈", "聪颖", "92", "智商在线", "大小姐",
          "兽人", "穿书", "相爱相杀", "美强惨", "短篇", "精选", "连载",
        ],
        categoryParams: (() => {
          let r = ["/manhua/"];
          for (let i = 1; i <= 318; i++) r.push(`/manhua/list/${i}/`);
          return r;
        })(),
      },
      {
        name: "排序",
        type: "fixed",
        itemType: "category",
        categories: [
          "默认", "总点击", "月点击", "周点击", "日点击",
          "总推荐", "月推荐", "周推荐", "日推荐",
          "总收藏", "最新更新",
        ],
        categoryParams: [
          "/manhua/",
          "/manhua/onclick/1/",
          "/manhua/onclick/2/",
          "/manhua/onclick/3/",
          "/manhua/onclick/4/",
          "/manhua/onclick/5/",
          "/manhua/onclick/6/",
          "/manhua/onclick/7/",
          "/manhua/onclick/8/",
          "/manhua/onclick/9/",
          "/manhua/onclick/10/",
        ],
      },
      {
        name: "状态",
        type: "fixed",
        itemType: "category",
        categories: ["全部", "连载", "完本"],
        categoryParams: [
          "/manhua/",
          "/manhua/zt/1/",
          "/manhua/zt/2/",
        ],
      },
      {
        name: "字母",
        type: "fixed",
        itemType: "category",
        categories: [
          "全部",
          "A", "B", "C", "D", "E", "F", "G", "H", "I",
          "J", "K", "L", "M", "N", "O", "P", "Q", "R",
          "S", "T", "U", "V", "W", "X", "Y", "Z",
        ],
        categoryParams: (() => {
          let r = ["/manhua/"];
          for (let i = 1; i <= 26; i++) r.push(`/manhua/zm/${i}/`);
          return r;
        })(),
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      let path = String(param || "/manhua/");
      let url = Manhuapi.baseUrl + path;

      if (page && page > 1) {
        if (path === "/manhua/" || path === "") {
          url = `${Manhuapi.baseUrl}/manhua/0_0_0_0_0_${page}.html`;
        } else {
          let clean = path.replace(/\/$/, "");
          url = Manhuapi.baseUrl + clean + `_${page}.html`;
        }
      }

      let res = await Network.get(url, Manhuapi.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let body = res.body || "";
      let document = new HtmlDocument(body);
      let comics = Manhuapi.parseList(document);

      let maxPage = page || 1;
      let optRe = /<option[^>]*value="[^"]*_(\d+)\.html"[^>]*>/gi;
      let om;
      while ((om = optRe.exec(body))) {
        let n = parseInt(om[1], 10);
        if (n > maxPage) maxPage = n;
      }
      return { comics, maxPage };
    },
    onThumbnailLoad: () => ({ headers: Manhuapi.headers }),
    optionList: [],
  };

  search = {
    load: async (keyword, options, page) => {
      page = page || 1;
      let url = `${Manhuapi.baseUrl}/search/?keywords=${encodeURIComponent(keyword)}&page=${page}`;
      let res = await Network.get(url, Manhuapi.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let document = new HtmlDocument(res.body);
      let comics = Manhuapi.parseList(document);
      if (!comics.length) {
        let list = await Network.get(`${Manhuapi.baseUrl}/manhua/`, Manhuapi.headers);
        if (list.status === 200) comics = Manhuapi.parseList(new HtmlDocument(list.body));
      }
      return { comics, maxPage: comics.length > 0 ? page + 1 : page };
    },
    optionList: [],
  };

  comic = {
    loadInfo: async (id) => {
      id = String(id).replace(/\D/g, "");
      let url = `${Manhuapi.baseUrl}/manhua/${id}.html`;
      let res = await Network.get(url, Manhuapi.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let html = res.body || "";

      // ===== 标题 =====
      let title = "";
      let h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1) title = h1[1].replace(/<[^>]*>/g, "").trim();
      if (!title) {
        let t = html.match(/<title>([\s\S]*?)<\/title>/i);
        if (t) title = t[1].split("_")[0].trim();
      }
      if (!title) title = id;

      // ===== 封面：优先 og:image（完整 URL），其次 bookimg 里的 img =====
      let cover = "";
      cover = Manhuapi.extractMeta(html, "og:image");
      if (!cover) {
        let bi = html.indexOf("bookimg");
        if (bi !== -1) {
          let si = html.indexOf("src=", bi);
          if (si !== -1) {
            let s = html.indexOf('"', si);
            if (s !== -1) {
              let e = html.indexOf('"', s + 1);
              if (e !== -1) cover = html.substring(s + 1, e);
            }
          }
        }
      }

      // ===== 简介：字符串定位 "bookintro" =====
      let description = "";
      let bi = html.indexOf("bookintro");
      if (bi !== -1) {
        let tagEnd = html.indexOf(">", bi);
        if (tagEnd !== -1) {
          let divEnd = html.indexOf("</div>", tagEnd);
          if (divEnd !== -1) {
            description = html
              .substring(tagEnd + 1, divEnd)
              .replace(/<[^>]*>/g, "")
              .trim();
          }
        }
      }
      // 回退：og:description
      if (!description) {
        description = Manhuapi.extractMeta(html, "og:description");
      }

      // ===== 作者 =====
      let author = "";
      let authMatch = html.match(/作者[:：]\s*<a[^>]*>([\s\S]*?)<\/a>/i);
      if (authMatch) author = authMatch[1].replace(/<[^>]*>/g, "").trim();
      if (!author) author = Manhuapi.extractMeta(html, "og:novel:author");

      // ===== 类别 =====
      let categoryTags = [];
      let catMatch = html.match(/类别[:：]([\s\S]*?)<\/div>/i);
      if (catMatch) {
        let tagRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
        let tm;
        while ((tm = tagRe.exec(catMatch[1]))) {
          let t = tm[1].replace(/<[^>]*>/g, "").trim();
          if (t) categoryTags.push(t);
        }
      }

      // ===== 状态 =====
      let status = "";
      let stMatch = html.match(/状态[:：]\s*([^<\n]+)/i);
      if (stMatch) status = stMatch[1].trim();
      if (!status) status = Manhuapi.extractMeta(html, "og:novel:status");

      // ===== 人气 =====
      let hits = "";
      let hitsMatch = html.match(/id=["']Hits["'][^>]*>([\s\S]*?)<\/span>/i);
      if (hitsMatch) hits = hitsMatch[1].trim();

      // ===== 更新时间 =====
      let updateTime = "";
      let upMatch = html.match(/最新章节\s*(\d{4}-\d{2}-\d{2}\s*\d{2}:\d{2}:\d{2})/i);
      if (upMatch) updateTime = upMatch[1].trim();

      // ===== 章节：从 menu 页拿，按 chapter id 升序排序 =====
      let chapters = new Map();
      let items = [];
      let seen = {};

      try {
        let menu = await Network.get(`${Manhuapi.baseUrl}/menu/${id}.html`, Manhuapi.headers);
        if (menu.status === 200) {
          let mHtml = menu.body || "";
          let chapterRe = /<a[^>]*href=["']([^"']*\/chapter\/(\d+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
          let cm;
          while ((cm = chapterRe.exec(mHtml))) {
            let cid = cm[2];
            if (seen[cid]) continue;
            seen[cid] = true;
            let name = cm[3].replace(/<[^>]*>/g, "").trim();
            items.push([cid, name || cid]);
          }
        }
      } catch (e) {}

      // 回退：详情页内的章节
      if (items.length === 0) {
        let chapterRe = /<a[^>]*href=["']([^"']*\/chapter\/(\d+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let cm;
        while ((cm = chapterRe.exec(html))) {
          let cid = cm[2];
          if (seen[cid]) continue;
          seen[cid] = true;
          let name = cm[3].replace(/<[^>]*>/g, "").trim();
          items.push([cid, name || cid]);
        }
      }

      // 按 chapter id 升序：id 越小越旧，越大越新
      items.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));

      for (let [cid, name] of items) chapters.set(cid, name);

      let tags = {};
      if (author) tags["作者"] = [author];
      if (status) tags["状态"] = [status];
      if (categoryTags.length) tags["类别"] = categoryTags;
      if (hits) tags["人气"] = [hits];

      return new ComicDetails({
        title,
        cover: Manhuapi.abs(cover),
        description: description || "",
        tags: tags,
        chapters,
        updateTime: updateTime,
        url: url,
      });
    },

    loadEp: async (comicId, epId) => {
      epId = String(epId).replace(/\D/g, "");
      let url = `${Manhuapi.baseUrl}/chapter/${epId}.html`;
      let res = await Network.get(url, {
        ...Manhuapi.headers,
        Referer: `${Manhuapi.baseUrl}/manhua/${comicId}.html`,
      });
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let images = [];
      let seen = {};
      let re = /jhc-data=["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(res.body))) {
        let u = Manhuapi.abs(m[1]);
        if (!u || seen[u]) continue;
        if (!/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u) && !/tupian|kantu|upload/i.test(u))
          continue;
        seen[u] = true;
        images.push(u);
      }
      if (images.length < 1) throw "No images";
      return { images };
    },

    onImageLoad: (url, comicId, epId) => {
      return {
        headers: {
          Referer: Manhuapi.baseUrl + "/",
          "User-Agent": Manhuapi.headers["User-Agent"],
        },
      };
    },

    // ===== 历史记录封面：补全 onThumbnailLoad =====
    onThumbnailLoad: (url) => {
      return {
        headers: {
          ...Manhuapi.headers,
          Referer: Manhuapi.baseUrl + "/",
        },
      };
    },

    // ===== 链接解析与跳转 =====
    link: {
      domains: ["manhuapi.cc", "www.manhuapi.cc"],
      linkToId: (url) => {
        let m = url.match(/\/manhua\/(\d+)\.html/i);
        if (m) return m[1];
        return null;
      },
    },
  };
}