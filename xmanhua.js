class Xmanhua extends ComicSource {
  name = "X漫画";
  key = "xmanhua";
  version = "1.8.1";
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/xmanhua.js";

  static baseUrl = "https://www.xmanhua.com";
  static headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Cookie: "xmanhua_lang=2",
    Accept: "text/html,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };

  static abs(href) {
    if (!href) return "";
    if (/^https?:/i.test(href)) return href.replace(/^http:/i, "https:");
    try {
      return new URL(href, Xmanhua.baseUrl + "/").href.replace(/^http:/i, "https:");
    } catch (_) {
      return href;
    }
  }

  static unpackImages(body) {
    if (!body || !String(body).trim()) return [];

    let m = body.match(/}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
    if (!m) return [];

    let p = m[1];
    let a = parseInt(m[2], 10);
    let c = parseInt(m[3], 10);
    let k = m[4].split("|");

    try {
      while (c--) {
        if (k[c]) {
          p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]);
        }
      }
    } catch (e) {
      return [];
    }

    let names = [];
    let re = /["']\/?(\d+_\d+)\.jpg["']/g;
    let mm;
    while ((mm = re.exec(p)) !== null) {
      if (names.indexOf(mm[1]) === -1) names.push(mm[1]);
    }
    if (names.length === 0) {
      let re2 = /(\d+_\d+)\.jpg/g;
      while ((mm = re2.exec(p)) !== null) {
        if (names.indexOf(mm[1]) === -1) names.push(mm[1]);
      }
    }
    if (names.length === 0) return [];

    let cidM = p.match(/\?cid=(\d+)/);
    let cid = cidM ? cidM[1] : "";

    let keyM = p.match(/([a-f0-9]{32})/);
    let key = keyM ? keyM[1] : "";

    let midM = p.match(/image\.xmanhua\.com\/1\/(\d+)\/\d+/);
    let mid = midM ? midM[1] : "";

    if (!cid || !key || !mid) return [];

    let pix = "https://image.xmanhua.com/1/" + mid + "/" + cid;
    return names.map(function (n) {
      return pix + "/" + n + ".jpg?cid=" + cid + "&key=" + key + "&uk=";
    });
  }

  static extractId(href) {
    if (!href) return null;
    let m = String(href).match(/\/(\d+)xm\/?/i);
    return m ? m[1] : null;
  }

  static _homeCache = null;
  static _homeCacheTime = 0;

  static async fetchHomeDoc() {
    let now = Date.now();
    if (Xmanhua._homeCache && now - Xmanhua._homeCacheTime < 120000) {
      return Xmanhua._homeCache;
    }
    let res = await Network.get(Xmanhua.baseUrl + "/", Xmanhua.headers);
    if (res.status !== 200) throw `Invalid status: ${res.status}`;
    let doc = new HtmlDocument(res.body);
    Xmanhua._homeCache = doc;
    Xmanhua._homeCacheTime = now;
    return doc;
  }

  static parseItem(li) {
    let a = li.querySelector("a");
    if (!a) return null;
    let id = Xmanhua.extractId(a.attributes["href"] || "");
    if (!id) return null;

    let title = "";
    if (a.attributes["title"]) title = a.attributes["title"].trim();
    if (!title) {
      let t = li.querySelector("h2, .title, .mh-item-title, .comic-title, .name");
      if (t) title = (t.text || "").trim();
    }
    if (!title) {
      for (let el of li.querySelectorAll("[title]")) {
        let t = (el.attributes["title"] || "").trim();
        if (t) { title = t; break; }
      }
    }
    if (!title) title = (a.text || "").trim();
    if (!title) title = id;

    let img = li.querySelector("img");
    let cover = "";
    if (img) cover = img.attributes["data-src"] || img.attributes["src"] || "";

    return { id, title, cover: Xmanhua.abs(cover) };
  }

  static parseList(document) {
    let comics = [];
    let seen = {};

    let nodes = document.querySelectorAll(
      ".mh-list li, .mh-item, .comic-item, .list-comic-item, .search-result li"
    );
    for (let li of nodes) {
      let item = Xmanhua.parseItem(li);
      if (!item || seen[item.id]) continue;
      seen[item.id] = true;
      comics.push(new Comic({ id: item.id, title: item.title, cover: item.cover }));
    }

    if (comics.length === 0) {
      for (let a of document.querySelectorAll("a")) {
        let href = a.attributes["href"] || "";
        let id = Xmanhua.extractId(href);
        if (!id || seen[id]) continue;
        seen[id] = true;
        let title = (a.attributes["title"] || a.text || id).trim();
        let img = a.querySelector("img");
        let cover = img ? (img.attributes["src"] || img.attributes["data-src"] || "") : "";
        comics.push(new Comic({ id, title, cover: Xmanhua.abs(cover) }));
      }
    }
    return comics;
  }

  static parseRankList(doc) {
    let comics = [];
    let seen = {};
    for (let el of doc.querySelectorAll(".rank-list .list")) {
      let a = el.querySelector("a");
      if (!a) continue;
      let id = Xmanhua.extractId(a.attributes["href"] || "");
      if (!id || seen[id]) continue;
      seen[id] = true;
      let title = a.attributes["title"] || id;
      let img = el.querySelector("img");
      let cover = img ? (img.attributes["src"] || img.attributes["data-src"] || "") : "";
      let tags = [];
      for (let s of el.querySelectorAll(".rank-item-right span")) {
        let t = (s.text || "").trim();
        if (t) tags.push(t);
      }
      comics.push(new Comic({ id, title, cover: Xmanhua.abs(cover), tags }));
    }
    return comics;
  }

  static parseRecommend(doc) {
    let comics = [];
    let seen = {};
    for (let a of doc.querySelectorAll(".index-list-con-info-inner a")) {
      let id = Xmanhua.extractId(a.attributes["href"] || "");
      if (!id || seen[id]) continue;
      seen[id] = true;
      let title = a.attributes["title"] || id;
      let img = a.querySelector("img");
      let cover = img ? (img.attributes["src"] || img.attributes["data-src"] || "") : "";
      comics.push(new Comic({ id, title, cover: Xmanhua.abs(cover) }));
    }
    return comics;
  }

  static parseRising(doc) {
    let comics = [];
    let seen = {};
    for (let a of doc.querySelectorAll(
      ".poster-list .poster-item a, .carousel-right-item > a"
    )) {
      let id = Xmanhua.extractId(a.attributes["href"] || "");
      if (!id || seen[id]) continue;
      seen[id] = true;
      let img = a.querySelector("img");
      let title =
        (img && img.attributes["data-title"]) || a.attributes["title"] || id;
      let cover = img ? (img.attributes["src"] || img.attributes["data-src"] || "") : "";
      comics.push(new Comic({ id, title, cover: Xmanhua.abs(cover) }));
    }
    return comics;
  }

  static parseIndexList(doc, sectionTitle) {
    let comics = [];
    let seen = {};
    for (let block of doc.querySelectorAll(".index-block")) {
      let span = block.querySelector(".list-con-title span");
      if (!span) continue;
      if (span.text.trim() !== sectionTitle) continue;
      for (let item of block.querySelectorAll(".index-manga-item")) {
        let a = item.querySelector("a");
        if (!a) continue;
        let id = Xmanhua.extractId(a.attributes["href"] || "");
        if (!id || seen[id]) continue;
        seen[id] = true;
        let title = a.attributes["title"] || id;
        let img = item.querySelector("img");
        let cover = img ? (img.attributes["src"] || img.attributes["data-src"] || "") : "";
        let tags = [];
        for (let s of item.querySelectorAll(".index-manga-item-subtitle span")) {
          let t = (s.text || "").trim();
          if (t) tags.push(t);
        }
        comics.push(new Comic({ id, title, cover: Xmanhua.abs(cover), tags }));
      }
    }
    return comics;
  }

  explore = [
    {
      title: "X漫画",
      type: "singlePageWithMultiPart",
      load: async () => {
        let doc = await Xmanhua.fetchHomeDoc();
        let res = {};
        res["熱度排行"] = Xmanhua.parseRankList(doc);
        res["吐血推薦"] = Xmanhua.parseRecommend(doc);
        res["上升最快"] = Xmanhua.parseRising(doc);
        res["今日更新"] = Xmanhua.parseIndexList(doc, "今日更新");
        res["最新上架"] = Xmanhua.parseIndexList(doc, "最新上架");
        return res;
      },
    },
  ];

  search = {
    load: async (keyword, options, page) => {
      page = page || 1;
      let url = `${Xmanhua.baseUrl}/search?title=${encodeURIComponent(
        keyword
      )}&page=${page}`;
      let res = await Network.get(url, Xmanhua.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let document = new HtmlDocument(res.body);
      let comics = Xmanhua.parseList(document);
      return { comics, maxPage: comics.length > 0 ? page + 1 : page };
    },
    optionList: [],
  };

  // ---------- 分类页 ----------
  category = {
    title: "X漫画",
    parts: [
      {
        name: "题材",
        type: "fixed",
        categories: ["全部", "熱血", "戀愛", "校園", "冒險", "科幻", "生活", "懸疑", "運動"],
        categoryParams: ["0", "31", "26", "1", "2", "25", "11", "17", "34"],
        itemType: "category",
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      // 题材：空或 0 → 0（全部）
      let themeId = param || "0";
      // 状态：空 → 0（全部），1 = 连载中，2 = 完结
      let statusId = (options && options[0]) || "0";
      // 排序：空 → 10（人气），2 = 更新时间
      let sortId = (options && options[1]) || "10";

      let pageStr = page > 1 ? `-p${page}` : "";
      let url = `${Xmanhua.baseUrl}/manga-list-${themeId}-${statusId}-${sortId}${pageStr}/`;

      let res = await Network.get(url, Xmanhua.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let document = new HtmlDocument(res.body);
      let comics = Xmanhua.parseList(document);

      // 通过分页组件判断是否有下一页
      let hasNext = false;
      let pageLinks = document.querySelectorAll(".page-pagination a");
      for (let a of pageLinks) {
        let t = (a.text || "").trim();
        if (t === ">" || t === "> ") { hasNext = true; break; }
      }

      return { comics, maxPage: hasNext ? page + 1 : page };
    },

    optionList: [
      {
        type: "select",
        options: ["0-全部", "1-連載中", "2-完結"],
        label: "狀態",
        default: "0",
      },
      {
        type: "select",
        options: ["10-人氣", "2-更新時間"],
        label: "排序",
        default: "10",
      },
    ],
  };

  comic = {
    loadInfo: async (id) => {
      id = String(id).replace(/xm$/i, "");
      let url = `${Xmanhua.baseUrl}/${id}xm/`;
      let res = await Network.get(url, Xmanhua.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let document = new HtmlDocument(res.body);

      let titleEl = document.querySelector(".detail-info-title, h1, .title");
      let title = titleEl ? titleEl.text.trim() : id;

      let cover = "";
      let coverImg = document.querySelector("img.detail-info-cover");
      if (!coverImg) coverImg = document.querySelector(".detail-info-cover img");
      if (!coverImg) coverImg = document.querySelector(".detail-info img");
      if (coverImg) {
        cover = coverImg.attributes["src"] || coverImg.attributes["data-src"] || "";
      }
      if (!cover) {
        let imgs = document.querySelectorAll("img");
        for (let img of imgs) {
          let src = img.attributes["src"] || img.attributes["data-src"] || "";
          if (src.indexOf("cover.xmanhua.com") !== -1) {
            cover = src;
            break;
          }
        }
      }
      cover = Xmanhua.abs(cover);

      let authors = [];
      let status = "";
      let themes = [];
      let tip = document.querySelector(".detail-info-tip");
      if (tip) {
        for (let span of tip.querySelectorAll("span")) {
          let text = (span.text || "").trim();
          if (text.indexOf("作者") !== -1) {
            for (let a of span.querySelectorAll("a")) {
              let n = (a.text || "").trim();
              if (n) authors.push(n);
            }
          } else if (text.indexOf("狀態") !== -1 || text.indexOf("状态") !== -1) {
            for (let s of span.querySelectorAll("span")) {
              let st = (s.text || "").trim();
              if (st && st.indexOf("：") === -1 && st.indexOf(":") === -1) {
                status = st;
                break;
              }
            }
            if (!status) {
              status = text.replace(/^[^:：]*[:：]\s*/, "").trim();
            }
          } else if (text.indexOf("題材") !== -1 || text.indexOf("题材") !== -1) {
            for (let item of span.querySelectorAll(".item")) {
              let t = (item.text || "").trim();
              if (t) themes.push(t);
            }
          }
        }
      }

      let description = "";
      let descEl = document.querySelector(".detail-info-content");
      if (descEl) {
        description = (descEl.text || "").trim();
        description = description
          .replace(/\[\+展開\]|\[-折疊\]|\[\+展开\]|\[\-折叠\]/g, "")
          .trim();
      }

      let tagsObj = {};
      if (authors.length > 0) tagsObj["作者"] = authors;
      if (status) tagsObj["状态"] = [status];
      if (themes.length > 0) tagsObj["题材"] = themes;

      let chapters = new Map();
      let items = [];
      let chapterLinks = document.querySelectorAll(
        "#chapterlistload a, .chapter-list a, .detail-chapter-list a, .list-chapter a, .chapter a"
      );
      for (let a of chapterLinks) {
        let href = a.attributes["href"] || "";
        let m = href.match(/\/m(\d+)\/?/i);
        if (!m) continue;
        let name = (a.text || "").trim().replace(/\s+/g, " ");
        items.push([m[1], name || m[1]]);
      }
      if (items.length === 0) {
        let html = res.body;
        let re = /\/m(\d+)\/["']?[^>]*>([^<]*)</g;
        let m;
        while ((m = re.exec(html)) !== null) {
          let cid = m[1];
          let name = (m[2] || "").trim().replace(/\s+/g, " ");
          if (cid && !items.some((x) => x[0] === cid)) {
            items.push([cid, name || cid]);
          }
        }
      }
      items.reverse();
      for (let [cid, name] of items) chapters.set(cid, name);

      return new ComicDetails({
        title,
        cover,
        description,
        tags: tagsObj,
        chapters,
        url: `${Xmanhua.baseUrl}/${id}xm/`,
      });
    },

    loadEp: async (comicId, epId) => {
      if (!epId) throw "Invalid episode id";
      let churl = `${Xmanhua.baseUrl}/m${epId}/`;
      let res = await Network.get(churl, {
        ...Xmanhua.headers,
        Referer: `${Xmanhua.baseUrl}/${comicId}xm/`,
      });
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let html = res.body;

      let cid = /XMANHUA_CID\s*=\s*(.*?)\s*;/.exec(html);
      let mid = /XMANHUA_MID\s*=\s*(.*?)\s*;/.exec(html);
      let dt = /XMANHUA_VIEWSIGN_DT\s*=\s*"(.*?)"\s*;/.exec(html);
      let sign = /XMANHUA_VIEWSIGN\s*=\s*"(.*?)"\s*;/.exec(html);
      if (!cid || !mid || !dt || !sign) throw "missing chapter sign vars";
      cid = cid[1];
      mid = mid[1];
      let dtQ = dt[1].replace(/ /g, "+").replace(/:/g, "%3A");
      let signV = sign[1];

      let countM = /XMANHUA_IMAGE_COUNT\s*=\s*(\d+)\s*;/.exec(html);
      let imageCount = countM ? parseInt(countM[1], 10) : 0;
      if (!imageCount) imageCount = 20;

      let pages = [];
      for (let p = 1; p <= imageCount; p += 2) pages.push(p);

      let images = [];
      let seen = {};
      const fetchPage = async (page) => {
        let api =
          `${Xmanhua.baseUrl}/m${cid}/chapterimage.ashx?cid=${cid}&page=${page}` +
          `&key=&_cid=${cid}&_mid=${mid}&_dt=${dtQ}&_sign=${signV}`;
        let r = await Network.get(api, {
          ...Xmanhua.headers,
          Referer: churl,
          "X-Requested-With": "XMLHttpRequest",
        });
        if (r.status !== 200 || !r.body || !String(r.body).trim()) return [];
        try {
          return Xmanhua.unpackImages(r.body);
        } catch (_) {
          return [];
        }
      };

      for (let i = 0; i < pages.length; i += 4) {
        let batch = pages.slice(i, i + 4);
        let parts = await Promise.all(batch.map(fetchPage));
        for (let part of parts) {
          for (let u of part) {
            if (seen[u]) continue;
            seen[u] = true;
            images.push(u);
          }
        }
        if (images.length >= imageCount) break;
      }
      images = images.slice(0, imageCount || images.length);
      if (images.length < 1) throw "No images";
      return { images };
    },

    onImageLoad: (url, comicId, epId) => {
      return {
        headers: {
          Referer: Xmanhua.baseUrl + "/",
          "User-Agent": Xmanhua.headers["User-Agent"],
        },
      };
    },

    link: {
      domains: ["www.xmanhua.com", "xmanhua.com", "m.xmanhua.com"],
      linkToId: (url) => {
        let m = url.match(/\/(\d+)xm\/?/);
        if (m) return m[1];
        return null;
      },
    },

    idMatch: "^\\d+$",
  };
}