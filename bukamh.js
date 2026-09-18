class Bukamh extends ComicSource {
  name = "布卡漫画";
  key = "bukamh";
  version = "1.2.9";
  minAppVersion = "1.4.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/bukamh.js";

  static baseUrl = "https://www.bukamh.com";
  static ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
  static headers = {
    "User-Agent": Bukamh.ua,
    Accept: "text/html,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    Referer: Bukamh.baseUrl + "/",
  };

  static paramsKey = "9S8$vJnU2ANeSRoF";
  static imageKey = "my2ecret782ecret";

  static abs(href) {
    if (!href) return "";
    if (href.startsWith("//")) return "https:" + href;
    if (/^https?:/i.test(href)) return href.replace(/^http:/i, "https:");
    // 用字符串拼接替代 URL
    return (Bukamh.baseUrl + "/" + String(href).replace(/^\/+/, "")).replace(
      /^http:/i,
      "https:",
    );
  }

  static normalizeId(href) {
    if (!href) return "";
    let h = String(href).trim();
    // 用正则提取路径部分
    const match = h.match(/^https?:\/\/[^\/]+(\/.*)$/);
    if (match) {
      h = match[1];
    }
    h = h.replace(/^\/+|\/+$/g, "");
    return h;
  }

  static isNonComicPath(slug) {
    if (!slug) return true;
    return /^(custom|category|search|packs|template|api|index\.php)(\/|$)/i.test(slug);
  }

  static parseList(document) {
    const comics = [];
    const seen = {};

    const items = Array.from(document.querySelectorAll("ul.u_list > li"));
    for (const li of items) {
      const nameA = li.querySelector("a.name") || li.querySelector(".neirong a");
      const picA = li.querySelector(".pic a") || li.querySelector("a");
      const a = nameA || picA;
      if (!a) continue;
      const href = a.attributes.href || "";
      const id = Bukamh.normalizeId(href);
      if (!id || Bukamh.isNonComicPath(id)) continue;
      if (seen[id]) continue;
      seen[id] = true;

      let title = (nameA && nameA.text) || "";
      title = title.trim();
      const img = li.querySelector("img");
      let cover = "";
      if (img) {
        cover = img.attributes["data-original"] || img.attributes.src || "";
        if (!title) title = (img.attributes.alt || "").trim();
      }
      const authorEl = li.querySelector(".neirong .tage") || li.querySelector(".author");
      const author = authorEl ? authorEl.text.trim() : "";
      if (!title) continue;

      comics.push(
        new Comic({
          id,
          title,
          cover: Bukamh.abs(cover),
          subtitle: author,
        }),
      );
    }

    if (comics.length) return comics;

    const gridItems = Array.from(document.querySelectorAll(".comic_box li, .likebox li"));
    for (const li of gridItems) {
      const a = li.querySelector("a.txt") || li.querySelector("a.pic") || li.querySelector("a");
      if (!a) continue;
      const href = a.attributes.href || "";
      const id = Bukamh.normalizeId(href);
      if (!id || seen[id] || Bukamh.isNonComicPath(id)) continue;
      seen[id] = true;
      let title = (a.text || "").trim() || (a.attributes.title || "").trim();
      const img = li.querySelector("img");
      let cover = "";
      if (img) {
        cover = img.attributes["data-original"] || img.attributes.src || "";
        if (!title) title = (img.attributes.alt || "").trim();
      }
      const authorEl = li.querySelector(".author");
      if (!title) continue;
      comics.push(
        new Comic({
          id,
          title,
          cover: Bukamh.abs(cover),
          subtitle: authorEl ? authorEl.text.trim() : "",
        }),
      );
    }
    return comics;
  }

  // ========== 新增：分类参数配置 ==========
  static categoryParamDict = {
    tags: {
      "爆笑": "tags/215", "生活": "tags/216", "修真": "tags/221", "神魔": "tags/218",
      "日常": "tags/219", "总裁": "tags/220", "灵异": "tags/217", "精品": "tags/222",
      "战斗": "tags/223", "漫改": "tags/224", "新作": "tags/225", "神仙": "tags/226",
      "改编": "tags/227", "校园": "tags/228", "治愈": "tags/229", "霸总": "tags/230",
      "爆更": "tags/231", "社会": "tags/232", "防疫": "tags/233", "剧情": "tags/234",
      "美食": "tags/235", "奇幻": "tags/236", "恐怖": "tags/237", "动作": "tags/238"
    },
    readerGroups: {
      "国产漫画": "list/1", "日本漫画": "list/2", "韩国漫画": "list/3", "欧美漫画": "list/4"
    },
    progress: {
      "全部": "", "连载": "finish/1", "完结": "finish/2"
    },
    regions: {
      "全部": "", "内地": "city/42", "港台": "city/43", "韩国": "city/44", "日本": "city/45", "欧美": "city/134"
    }
  };

  // ========== 新增：分类列表解析 ==========
  static parseCategoryList(document) {
    const comics = [];
    const items = Array.from(document.querySelectorAll("ul.catagory-list > li"));
    for (const li of items) {
      const aImg = li.querySelector("a.img");
      if (!aImg) continue;
      const href = aImg.attributes.href || "";
      const id = Bukamh.normalizeId(href);
      if (!id) continue;

      const img = li.querySelector("img");
      const cover = img ? Bukamh.abs(img.attributes.src || "") : "";

      const aTxt = li.querySelector("a.txt");
      const title = aTxt ? aTxt.text.trim() : "";

      const info = li.querySelector("span.info");
      const subtitle = info ? info.text.trim() : "";

      if (title) {
        comics.push(new Comic({
          id,
          title,
          cover,
          subtitle
        }));
      }
    }
    return comics;
  }

  static removePkcs7(buffer) {
    const len = buffer.length;
    if (!len) return buffer;
    const pad = buffer[len - 1];
    if (pad > 0 && pad <= 16) return buffer.slice(0, len - pad);
    return buffer;
  }

  static async decryptParams(encryptedParams) {
    const keyBuffer = await Convert.encodeUtf8(Bukamh.paramsKey);
    const decoded = await Convert.decodeBase64(encryptedParams);
    const decodedBytes = new Uint8Array(decoded);
    const ivBytes = decodedBytes.slice(0, 16);
    const ciphertextBytes = decodedBytes.slice(16);
    const decryptedBuffer = await Convert.decryptAesCbc(
      ciphertextBytes.buffer,
      keyBuffer,
      ivBytes.buffer,
    );
    let decryptedBytes = new Uint8Array(decryptedBuffer);
    decryptedBytes = Bukamh.removePkcs7(decryptedBytes);
    const text = await Convert.decodeUtf8(decryptedBytes.buffer);
    return JSON.parse(text);
  }

  static isImageMagic(buf) {
    if (!buf || buf.byteLength < 3) return false;
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b[0] === 0xff && b[1] === 0xd8) return true;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e) return true;
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46) return true;
    return false;
  }

  explore = [
    {
      title: "最新",
      type: "multiPageComicList",
      load: async (page) => {
        page = page || 1;
        const url =
          page <= 1
            ? `${Bukamh.baseUrl}/custom/update`
            : `${Bukamh.baseUrl}/custom/update/page/${page}`;
        const res = await Network.get(url, Bukamh.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        const document = new HtmlDocument(res.body);
        const comics = Bukamh.parseList(document);
        return { comics, maxPage: comics.length >= 20 ? page + 1 : page };
      },
    },
    {
      title: "热门",
      type: "multiPageComicList",
      load: async (page) => {
        page = page || 1;
        const url =
          page <= 1
            ? `${Bukamh.baseUrl}/custom/hot`
            : `${Bukamh.baseUrl}/custom/hot/page/${page}`;
        const res = await Network.get(url, Bukamh.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        const document = new HtmlDocument(res.body);
        const comics = Bukamh.parseList(document);
        return { comics, maxPage: comics.length >= 20 ? page + 1 : page };
      },
    },
    {
      title: "完结",
      type: "multiPageComicList",
      load: async (page) => {
        page = page || 1;
        const url =
          page <= 1
            ? `${Bukamh.baseUrl}/custom/end`
            : `${Bukamh.baseUrl}/custom/end/page/${page}`;
        const res = await Network.get(url, Bukamh.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        const document = new HtmlDocument(res.body);
        const comics = Bukamh.parseList(document);
        return { comics, maxPage: comics.length >= 20 ? page + 1 : page };
      },
    },
  ];

  search = {
    load: async (keyword, options, page) => {
      page = page || 1;
      const q = encodeURIComponent(String(keyword || "").trim());
      if (!q) return { comics: [], maxPage: 0 };
      let url = `${Bukamh.baseUrl}/index.php/search?key=${q}`;
      if (page > 1) url += `&page=${page}`;
      const res = await Network.get(url, Bukamh.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      const document = new HtmlDocument(res.body);
      const comics = Bukamh.parseList(document);
      return { comics, maxPage: comics.length >= 20 ? page + 1 : page };
    },
  };

  // ========== 新增：分类页面配置 ==========
  category = {
    title: "布卡漫画",
    parts: [
      {
        name: "题材",
        type: "fixed",
        categories: Object.keys(Bukamh.categoryParamDict.tags),
        categoryParams: Object.values(Bukamh.categoryParamDict.tags),
        itemType: "category"
      },
      {
        name: "读者群",
        type: "fixed",
        categories: Object.keys(Bukamh.categoryParamDict.readerGroups),
        categoryParams: Object.values(Bukamh.categoryParamDict.readerGroups),
        itemType: "category"
      },
      {
        name: "进度",
        type: "fixed",
        categories: Object.keys(Bukamh.categoryParamDict.progress),
        categoryParams: Object.values(Bukamh.categoryParamDict.progress),
        itemType: "category"
      },
      {
        name: "地区",
        type: "fixed",
        categories: Object.keys(Bukamh.categoryParamDict.regions),
        categoryParams: Object.values(Bukamh.categoryParamDict.regions),
        itemType: "category"
      }
    ]
  };

  // ========== 新增：分类漫画列表 ==========
  categoryComics = {
    load: async (category, param, options, page) => {
      // 构建URL路径，param为空时代表“全部”
      let basePath = "/category";
      if (param) basePath += `/${param}`;
      if (page > 1) basePath += `/page/${page}`;
      else if (!param) basePath += "/"; // 无参数时默认访问 /category/

      const url = `${Bukamh.baseUrl}${basePath}`;
      const res = await Network.get(url, Bukamh.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;

      const document = new HtmlDocument(res.body);
      try {
        const comics = Bukamh.parseCategoryList(document);
        let maxPage = page;

        // 解析最大页码
        const datanumEl = document.querySelector(".pagebox .datanum");
        if (datanumEl) {
          const match = datanumEl.text.match(/共(\d+)页/);
          if (match && match[1]) {
            maxPage = parseInt(match[1]);
          }
        }

        return { comics, maxPage };
      } finally {
        document.dispose();
      }
    }
  };

  comic = {
    idMatch: "^[A-Za-z0-9_%\\-]+$",

    link: {
      domains: ["www.bukamh.com", "bukamh.com"],
      linkToId: (url) => {
        // 用正则提取 path 部分
        const match = String(url).match(/^https?:\/\/[^\/]+(\/.*)$/);
        if (!match) return null;
        let slug = match[1].replace(/^\/+|\/+$/g, "");
        if (!slug) return null;
        if (Bukamh.isNonComicPath(slug)) return null;
        if (/\.html$/i.test(slug) || /\/\d+\/\d+/.test(slug)) return null;
        return slug;
      },
    },

    loadInfo: async (id) => {
      // 统一用 normalizeId 处理，兼容纯 slug 和完整 URL
      const slug = Bukamh.normalizeId(id);
      if (!slug) throw "Invalid comic id";
      const url = `${Bukamh.baseUrl}/${slug}`;
      const res = await Network.get(url, Bukamh.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      const html = res.body;
      const document = new HtmlDocument(html);
      try {
        const titleEl = document.querySelector(".infobox .title");
        const title = titleEl ? titleEl.text.trim() : slug;
        const coverImg = document.querySelector(".infobox .img img");
        const cover = coverImg ? Bukamh.abs(coverImg.attributes.src || "") : "";

        let author = "";
        let updateTo = "";
        const tagList = [];
        const tages = Array.from(document.querySelectorAll(".infobox .tage"));
        for (const p of tages) {
          const text = (p.text || "").trim();
          if (text.startsWith("作者：") || text.startsWith("作者:")) {
            author = text.replace(/^作者[:：]\s*/, "").trim();
          } else if (text.startsWith("更新至")) {
            updateTo = text.replace(/^更新至[:：]\s*/, "").trim();
          } else if (text.startsWith("类型：") || text.startsWith("类型:")) {
            const tagAs = Array.from(p.querySelectorAll("a"));
            for (const a of tagAs) {
              const t = (a.text || "").trim();
              if (t) tagList.push(t);
            }
          }
        }

        const descEl = document.querySelector(".infocomic .text");
        const description = descEl ? descEl.text.trim() : "";

        const eps = new Map();
        const chapterAs = Array.from(document.querySelectorAll(".chapterbox .list a"));
        for (const a of chapterAs) {
          const href = a.attributes.href || "";
          const m = String(href).match(/\/(\d+)\/(\d+)\.html$/);
          if (!m) continue;
          const chKey = `${m[1]}_${m[2]}`;
          const chTitle = (a.text || "").trim() || chKey;
          eps.set(chKey, chTitle);
        }

        const tags = {};
        if (author) tags["作者"] = [author];
        if (tagList.length > 0) tags["类型"] = tagList;
        if (updateTo) tags["更新至"] = [updateTo];

        const detailUrl = url;

        return new ComicDetails({
          title,
          cover,
          description,
          tags,
          chapters: eps,
          url: detailUrl,
        });
      } finally {
        document.dispose();
      }
    },

    loadEp: async (comicId, epId) => {
      const parts = String(epId).split("_");
      if (parts.length !== 2) throw "Invalid ep id format";
      const numId = parts[0];
      const chNum = parts[1];
      const fullPath = `${numId}/${chNum}.html`;

      const res = await Network.get(`${Bukamh.baseUrl}/${fullPath}`, Bukamh.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      const body = res.body || "";

      const paramsMatch = body.match(/params\s*=\s*'([^']+)'/);
      if (paramsMatch) {
        const data = await Bukamh.decryptParams(paramsMatch[1]);
        const images = (data && data.images) || [];
        if (!images.length) throw "no images in decrypted params";
        return {
          images: images.map((u) => Bukamh.abs(String(u))),
        };
      }

      const document = new HtmlDocument(body);
      try {
        const images = [];
        const imgs = Array.from(document.querySelectorAll("img.lazy-read, #images img"));
        for (const img of imgs) {
          const src = img.attributes["data-original"] || img.attributes.src || "";
          if (/^https?:/i.test(src)) images.push(Bukamh.abs(src));
        }
        if (images.length < 1) throw "no images";
        return { images };
      } finally {
        document.dispose();
      }
    },

    onImageLoad: (url) => {
      const keyStr = Bukamh.imageKey;
      return {
        url,
        headers: {
          "User-Agent": Bukamh.ua,
          Referer: Bukamh.baseUrl + "/",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        onResponse: (data) => {
          if (Bukamh.isImageMagic(data)) return data;
          const key = Convert.encodeUtf8(keyStr);
          try {
            return Convert.decryptAesCbc(data, key, key);
          } catch (_) {
            return data;
          }
        },
      };
    },
  };
}