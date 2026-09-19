class Mhkan extends ComicSource {
  name = "漫画看";
  key = "mhkan";
  version = "1.1.7";
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/mhkan.js";

  static baseUrl = "https://m.wmh1234.com";
  static readerBase = "https://reader.hqread.cc";
  static headers = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    Accept: "text/html,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };

  static abs(href) {
    if (!href) return "";
    if (/^https?:/i.test(href)) return href;
    try {
      return new URL(href, Mhkan.baseUrl + "/").href;
    } catch (_) {
      return href;
    }
  }

  // ===== 纯正则解析列表 =====
  static parseListFromHtml(html) {
    if (!html) return [];
    let comics = [];
    let seen = {};

    let re = /<article\s+class="comic-card"[\s\S]*?<\/article>/gi;
    let m;
    while ((m = re.exec(html))) {
      let card = m[0];
      let hrefM = card.match(/href="\/comic\/(\d+)\.html"/i);
      if (!hrefM) continue;
      let id = hrefM[1];
      if (seen[id]) continue;
      seen[id] = true;
      let title = "";
      let t1 = card.match(/<h3[^>]*class="[^"]*comic-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i);
      if (t1) title = t1[1].replace(/<[^>]+>/g, "").trim();
      if (!title) {
        let t2 = card.match(/alt="([^"]+)"/);
        if (t2) title = t2[1].trim();
      }
      if (!title) title = id;
      let cover = "";
      // 先抓 img 标签里的 data-src
      let imgM = card.match(/<img[^>]*class="[^"]*comic-card__image[^"]*"[^>]*>/i);
      if (!imgM) imgM = card.match(/<img[^>]*>/i);
      if (imgM) {
        let ds = imgM[0].match(/data-src="([^"]+)"/i);
        if (ds) cover = ds[1];
        if (!cover) {
          let sr = imgM[0].match(/src="([^"]+)"/i);
          if (sr) cover = sr[1];
        }
      }
      if (!cover) {
        let c1 = card.match(/data-src="([^"]+)"/i);
        if (c1) cover = c1[1];
      }
      if (/placeholder\.svg/i.test(cover)) cover = "";
      comics.push(new Comic({ id, title, cover: Mhkan.abs(cover) }));
    }

    // 兜底：只抓链接
    if (comics.length === 0) {
      let re2 = /<a[^>]*href="\/comic\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/gi;
      let m2;
      while ((m2 = re2.exec(html))) {
        let id = m2[1];
        if (seen[id]) continue;
        seen[id] = true;
        let inner = m2[2];
        let title = "";
        let t1 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
        if (t1) title = t1[1].replace(/<[^>]+>/g, "").trim();
        if (!title) {
          let t2 = inner.match(/alt="([^"]+)"/);
          if (t2) title = t2[1].trim();
        }
        if (!title) title = id;
        if (/开始阅读|查看更多|上一页|下一页|首页|末页/i.test(title)) continue;
        let cover = "";
        let c1 = inner.match(/data-src="([^"]+)"/i);
        if (c1) cover = c1[1];
        if (!cover) {
          let c2 = inner.match(/<img[^>]*src="([^"]+)"/i);
          if (c2) cover = c2[1];
        }
        if (/placeholder\.svg/i.test(cover)) cover = "";
        comics.push(new Comic({ id, title, cover: Mhkan.abs(cover) }));
      }
    }
    return comics;
  }

  static parseList(document) {
    let comics = [];
    let seen = {};
    for (let card of document.querySelectorAll("article.comic-card, .comic-card")) {
      let a = card.querySelector("a.comic-card__link, a[href*='/comic/']");
      if (!a) continue;
      let href = a.attributes["href"] || "";
      let m = href.match(/\/comic\/(\d+)\.html/i);
      if (!m) continue;
      let id = m[1];
      if (seen[id]) continue;
      seen[id] = true;
      let titleEl = card.querySelector(".comic-card__title, h3, h2");
      let title = titleEl ? titleEl.text.trim() : "";
      let img = card.querySelector("img");
      let cover = "";
      if (img) {
        cover = img.attributes["data-src"] || img.attributes["src"] || "";
        if (!title) title = (img.attributes["alt"] || "").trim();
      }
      if (!title) title = id;
      if (/placeholder\.svg/i.test(cover)) cover = img ? img.attributes["data-src"] || "" : "";
      comics.push(new Comic({ id, title, cover: Mhkan.abs(cover) }));
    }
    if (comics.length) return comics;
    for (let a of document.querySelectorAll("a[href*='/comic/']")) {
      let href = a.attributes["href"] || "";
      let m = href.match(/\/comic\/(\d+)\.html/i);
      if (!m) continue;
      let id = m[1];
      if (seen[id]) continue;
      let img = a.querySelector("img");
      let title = "";
      let cover = "";
      if (img) {
        cover = img.attributes["data-src"] || img.attributes["src"] || "";
        title = (img.attributes["alt"] || "").trim();
      }
      if (!title) title = (a.attributes["title"] || a.text || "").trim().replace(/\s+/g, " ");
      if (!title || /开始阅读|查看更多/i.test(title)) continue;
      seen[id] = true;
      comics.push(new Comic({ id, title, cover: Mhkan.abs(cover) }));
    }
    return comics;
  }

  static parseAny(html) {
    let comics = Mhkan.parseListFromHtml(html);
    if (comics.length) return comics;
    try {
      let document = new HtmlDocument(html);
      return Mhkan.parseList(document);
    } catch (e) {
      return [];
    }
  }

  explore = [
    {
      title: "漫画看",
      type: "multiPageComicList",
      load: async (page) => {
        page = page || 1;
        let url =
          page <= 1 ? `${Mhkan.baseUrl}/` : `${Mhkan.baseUrl}/?page=${page}`;
        let res = await Network.get(url, Mhkan.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        let comics = Mhkan.parseAny(res.body || "");
        return { comics, maxPage: comics.length > 0 ? page + 1 : page };
      },
    },
  ];

  search = {
    load: async (keyword, options, page) => {
      page = page || 1;
      let url = `${Mhkan.baseUrl}/search/?keywords=${encodeURIComponent(
        keyword
      )}&page=${page}`;
      let res = await Network.get(url, Mhkan.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let comics = Mhkan.parseAny(res.body || "");
      return { comics, maxPage: comics.length > 0 ? page + 1 : page };
    },
    optionList: [],
  };

  // ============ 分类页：只保留"题材" ============
  category = {
    title: "漫画看",
    parts: [
      {
        name: "题材",
        type: "fixed",
        itemType: "category",
        categories: [
          "全部", "恋爱", "搞笑", "日漫", "其他",
          "热血", "都市", "国漫", "少女", "科幻",
          "魔幻", "奇幻", "冒险", "生活", "韩漫",
          "纯爱", "少年", "校园", "耽美", "古风",
          "剧情", "喜剧", "日常", "悬疑", "玄幻",
          "格斗", "穿越", "恐怖", "武侠", "灵异",
          "大女主", "百合", "推理", "战斗", "治愈",
          "侦探", "竞技", "重生", "系统", "逆袭",
          "短篇", "浪漫", "职场", "动作", "魔法",
          "后宫", "ABO", "体育", "青春", "总裁",
          "霸总", "复仇", "架空", "西幻", "现代",
          "宫廷", "异能", "欧风", "神鬼", "蔷薇",
          "美食", "欢乐向", "欧美", "唯美", "四格",
          "女神", "励志", "故事漫画", "战争", "脑洞",
          "修真", "社会", "萌系", "高甜", "妖怪",
          "年下", "修仙", "轻小说", "末日", "怪物",
          "历史", "改编", "游戏", "神仙", "神魔",
          "惊悚", "娱乐圈", "东方", "轻松", "权谋",
          "宫斗", "SM", "同人", "多攻", "明星",
          "音乐", "仙侠", "机甲", "偶像", "虐心",
          "正能量",
        ],
        categoryParams: [
          "/category/tags/0", "/category/tags/17", "/category/tags/13", "/category/tags/240", "/category/tags/97",
          "/category/tags/6", "/category/tags/31", "/category/tags/257", "/category/tags/187", "/category/tags/8",
          "/category/tags/69", "/category/tags/96", "/category/tags/7", "/category/tags/29", "/category/tags/209",
          "/category/tags/77", "/category/tags/204", "/category/tags/11", "/category/tags/16", "/category/tags/28",
          "/category/tags/84", "/category/tags/380", "/category/tags/104", "/category/tags/18", "/category/tags/10",
          "/category/tags/94", "/category/tags/14", "/category/tags/19", "/category/tags/66", "/category/tags/26",
          "/category/tags/172", "/category/tags/27", "/category/tags/112", "/category/tags/107", "/category/tags/67",
          "/category/tags/80", "/category/tags/23", "/category/tags/171", "/category/tags/173", "/category/tags/126",
          "/category/tags/354", "/category/tags/100", "/category/tags/73", "/category/tags/21", "/category/tags/95",
          "/category/tags/15", "/category/tags/285", "/category/tags/132", "/category/tags/99", "/category/tags/170",
          "/category/tags/9", "/category/tags/124", "/category/tags/25", "/category/tags/224", "/category/tags/222",
          "/category/tags/136", "/category/tags/108", "/category/tags/228", "/category/tags/74", "/category/tags/93",
          "/category/tags/89", "/category/tags/70", "/category/tags/258", "/category/tags/65", "/category/tags/83",
          "/category/tags/226", "/category/tags/24", "/category/tags/60", "/category/tags/20", "/category/tags/90",
          "/category/tags/12", "/category/tags/150", "/category/tags/85", "/category/tags/181", "/category/tags/177",
          "/category/tags/387", "/category/tags/178", "/category/tags/79", "/category/tags/175", "/category/tags/176",
          "/category/tags/72", "/category/tags/188", "/category/tags/143", "/category/tags/174", "/category/tags/149",
          "/category/tags/117", "/category/tags/128", "/category/tags/86", "/category/tags/103", "/category/tags/137",
          "/category/tags/161", "/category/tags/384", "/category/tags/22", "/category/tags/391", "/category/tags/75",
          "/category/tags/278", "/category/tags/82", "/category/tags/133", "/category/tags/201", "/category/tags/68",
          "/category/tags/283",
        ],
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      // param 就是 categoryParams 里的值
      let tag = "0";
      let p = String(param === undefined || param === null ? "" : param);
      if (p.startsWith("/category/tags/")) {
        tag = p.substring(15) || "0";
      }

      let url = `${Mhkan.baseUrl}/category/tags/${tag}`;
      let pageNum = page || 1;
      if (pageNum > 1) url += `/page/${pageNum}`;

      let res = await Network.get(url, Mhkan.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;

      let comics = Mhkan.parseAny(res.body || "");

      let maxPage = pageNum;
      let re = /\/category\/[^"']*?page\/(\d+)/g;
      let m;
      while ((m = re.exec(res.body || ""))) {
        let n = parseInt(m[1], 10);
        if (n > maxPage) maxPage = n;
      }

      return { comics, maxPage };
    },
    optionList: [],
  };

  comic = {
    loadInfo: async (id) => {
      id = String(id).replace(/\D/g, "");
      let url = `${Mhkan.baseUrl}/comic/${id}.html`;
      let res = await Network.get(url, Mhkan.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let html = res.body || "";

      let title = "";
      let ogTitle = html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
      );
      if (ogTitle) {
        title = ogTitle[1].replace(/\s*[-_|]\s*漫画1234网\s*$/i, "").trim();
      }
      if (!title) {
        let t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (t) title = t[1].replace(/\s*[-_|]\s*漫画1234网\s*$/i, "").trim();
      }
      if (!title) title = id;

      let cover = "";
      let ogImg = html.match(
        /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
      );
      if (ogImg) cover = ogImg[1];
      if (!cover) {
        let imgM = html.match(
          /<img[^>]*id=["']mintWorkCover["'][^>]*src=["']([^"']+)["']/i
        );
        if (imgM) cover = imgM[1];
      }

      let author = "";
      let authorM = html.match(
        /<h2[^>]*id=["']mintWorkTitle["'][^>]*>[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/i
      );
      if (authorM) {
        author = authorM[1].replace(/<[^>]+>/g, "").replace(/著\s*$/, "").trim();
      }

      let tagList = [];
      let status = "";
      let tagM = html.match(
        /<p>([^<]*?)\s*<span class=["']mint-tag["']>([^<]+)<\/span>\s*<\/p>/i
      );
      if (tagM) {
        let rawTags = tagM[1].trim();
        if (rawTags) tagList = rawTags.split(/\s+/).filter((t) => t);
        status = tagM[2].trim();
      }

      let hits = "";
      let updateTime = "";
      let metaM = html.match(
        /<p[^>]*class=["']mint-work-meta["'][^>]*>([\s\S]*?)<\/p>/i
      );
      if (metaM) {
        let metaText = metaM[1].replace(/<[^>]+>/g, "").trim();
        let parts = metaText.split(/[·•·]/);
        for (let p of parts) {
          p = p.trim();
          if (/阅读|人气|点击/.test(p)) {
            hits = p.replace(/阅读|人气|点击/g, "").trim();
          } else if (/更新/.test(p)) {
            updateTime = p.replace(/更新/g, "").trim();
          }
        }
        if (!updateTime) updateTime = metaText;
      }

      let description = "";
      let introM = html.match(
        /<section[^>]*id=["']mintIntroPanel["'][^>]*>[\s\S]*?<div>([\s\S]*?)<\/div>/i
      );
      if (introM) {
        description = introM[1].replace(/<[^>]+>/g, "").trim();
      }
      if (!description) {
        let descM = html.match(
          /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
        );
        if (descM) description = descM[1].trim();
      }

      let comment = "";
      let ogDesc = html.match(
        /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
      );
      if (ogDesc) comment = ogDesc[1].trim();
      if (comment === description) comment = "";

      let chapterItems = [];
      let seenB64 = {};
      let re = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
      let m;
      while ((m = re.exec(html))) {
        let tag = m[0];
        let cidMatch = tag.match(/data-chapter-id=["'](\d+)["']/);
        if (!cidMatch) continue;
        let hrefMatch = tag.match(/href=["']\/go\/([^"']+)["']/);
        if (!hrefMatch) continue;
        let b64 = hrefMatch[1];
        if (seenB64[b64]) continue;
        seenB64[b64] = true;
        let nameMatch = tag.match(/>([\s\S]*?)<\/a>/);
        let name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        if (!name) name = b64;
        chapterItems.push({
          chapterId: parseInt(cidMatch[1], 10),
          b64,
          name,
        });
      }
      chapterItems.sort((a, b) => a.chapterId - b.chapterId);

      let chapters = new Map();
      for (let item of chapterItems) {
        chapters.set(item.b64, item.name);
      }

      const detailUrl = url;

      let tags = {};
      if (author) tags["作者"] = [author];
      if (status) tags["状态"] = [status];
      if (tagList.length) tags["标签"] = tagList;
      if (hits) tags["人气"] = [hits];

      return new ComicDetails({
        title,
        cover: Mhkan.abs(cover),
        description: description || "",
        tags: tags,
        chapters,
        updateTime: updateTime,
        url: detailUrl,
        comment: comment || undefined,
      });
    },

    loadEp: async (comicId, epId) => {
      comicId = String(comicId).replace(/\D/g, "");
      let b64 = String(epId || "");
      if (b64.startsWith("/go/")) b64 = b64.substring(4);
      if (b64.startsWith("/r/")) b64 = b64.substring(3);
      if (!b64) throw "Invalid chapter id";

      let targetUrl = `${Mhkan.readerBase}/r/${b64}`;
      let referer = `${Mhkan.readerBase}/r/${b64}`;

      let res = await Network.get(targetUrl, {
        ...Mhkan.headers,
        Referer: referer,
      });
      if (res.status !== 200) throw `Invalid status: ${res.status}`;

      let html = res.body || "";
      let images = [];
      let seen = {};

      let re = /<img[^>]*class=["'][^"']*reader-image[^"']*["'][^>]*data-src=["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(html))) {
        let u = m[1];
        if (!u || /placeholder\.svg|logo|icon/i.test(u)) continue;
        if (seen[u]) continue;
        seen[u] = true;
        images.push(u);
      }
      if (images.length === 0) {
        let re2 = /<img[^>]*data-src=["']([^"']+)["']/gi;
        let m2;
        while ((m2 = re2.exec(html))) {
          let u = m2[1];
          if (!u || /placeholder\.svg|logo|icon/i.test(u)) continue;
          if (!/\.(jpg|jpeg|png|webp|gif)/i.test(u)) continue;
          if (seen[u]) continue;
          seen[u] = true;
          images.push(u);
        }
      }
      if (images.length === 0) {
        let re3 = /(https?:)?\/\/[^"'\s]*wszwhg\.net[^"'\s]*\.(jpg|jpeg|png|webp|gif)[^"'\s]*/gi;
        let m3;
        while ((m3 = re3.exec(html))) {
          let u = m3[0];
          if (u.startsWith("//")) u = "https:" + u;
          if (seen[u]) continue;
          seen[u] = true;
          images.push(u);
        }
      }

      if (images.length < 1) throw "No images";
      return { images };
    },

    // 阅读页图片
    onImageLoad: (url, comicId, epId) => {
      let b64 = String(epId || "");
      if (b64.startsWith("/go/")) b64 = b64.substring(4);
      if (b64.startsWith("/r/")) b64 = b64.substring(3);
      let referer = b64
        ? `${Mhkan.readerBase}/r/${b64}`
        : Mhkan.readerBase + "/";
      return {
        headers: {
          Referer: referer,
          "User-Agent": Mhkan.headers["User-Agent"],
        },
      };
    },

    // ===== 封面/缩略图：加 Referer 防盗链 =====
    onThumbnailLoad: (url) => {
      return {
        headers: {
          Referer: Mhkan.baseUrl + "/",
          "User-Agent": Mhkan.headers["User-Agent"],
          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      };
    },

    link: {
      domains: [
        "m.wmh1234.com",
        "www.wmh1234.com",
        "wmh1234.com",
        "m.mhkan.com",
        "reader.hqread.cc",
      ],
      linkToId: (url) => {
        let m = url.match(/\/comic\/(\d+)\.html/i);
        if (m) return m[1];
        m = url.match(/\/(?:go|r)\/([A-Za-z0-9+\/=_-]+)/);
        if (m) {
          try {
            let decoded = Convert.decodeUtf8(Convert.decodeBase64(m[1]));
            let idMatch = decoded.match(/^(\d+)-/);
            if (idMatch) return idMatch[1];
          } catch (e) {}
        }
        return null;
      },
    },
  };
}