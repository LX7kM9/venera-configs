class Mkzhan extends ComicSource {
  name = "漫客栈";
  key = "mkzhan";
  version = "1.1.4";
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/mkzhan.js";

  static webBase = "https://www.mkzhan.com";
  static apiBase = "https://comic.mkzcdn.com";
  static headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/json,*/*",
  };

  static https(url) {
    if (!url) return "";
    return String(url).replace(/^http:/i, "https:");
  }

  static cover(url) {
    let u = Mkzhan.https(url);
    if (!u) return u;
    if (u.includes("app_logo")) return "";
    if (u.includes("!cover-")) return u;
    return u.replace(/\.(jpg|jpeg|png|webp)(\?.*)?$/i, ".$1!cover-400");
  }

  static parseList(jsonText) {
    let data = JSON.parse(jsonText);
    if (String(data.code) !== "200") {
      throw data.message || "API error";
    }
    return data.data;
  }

  static parseComicFromItem(item) {
    let titleA = item.querySelector(".comic__title a, .comic-title a");
    let anyA = titleA || item.querySelector("a");
    if (!anyA) return null;
    let href = anyA.attributes["href"] || "";
    let m = href.match(/\/(\d+)\/?/);
    if (!m) return null;

    let title = "";
    let titleBox = item.querySelector(".comic__title, .comic-title");
    if (titleBox) title = titleBox.text.trim();
    if (!title && titleA) title = titleA.text.trim();

    let img = item.querySelector("img");
    let cover = "";
    if (img) {
      cover = img.attributes["data-src"] || img.attributes["src"] || "";
      if (!title) title = (img.attributes["alt"] || "").trim();
    }

    if (!title) return null;

    return new Comic({
      id: m[1],
      title: title,
      cover: Mkzhan.cover(cover),
    });
  }

  static parseComicsFromDocument(doc) {
    let comics = [];
    let seen = {};

    function push(id, title, cover) {
      if (!id || !title || seen[id]) return;
      if (title.length > 60) return;
      seen[id] = true;
      comics.push(
        new Comic({
          id: id,
          title: title,
          cover: Mkzhan.cover(cover),
        })
      );
    }

    let items = doc.querySelectorAll(
      ".in-comic--type-b, .in-comic--type-a, .cs-item, .common-comic-item"
    );
    for (let item of items) {
      let c = Mkzhan.parseComicFromItem(item);
      if (c) push(c.id, c.title, c.cover);
    }

    if (comics.length === 0) {
      let links = doc.querySelectorAll("a[href]");
      for (let link of links) {
        let href = link.attributes["href"] || "";
        let m = href.match(/^\/(\d+)\/?$/);
        if (!m) continue;
        let id = m[1];
        if (seen[id]) continue;

        let img = link.querySelector("img");
        let cover = "";
        let title = "";
        if (img) {
          cover = img.attributes["data-src"] || img.attributes["src"] || "";
          title = (img.attributes["alt"] || "").trim();
        }
        if (!title) title = (link.attributes["title"] || "").trim();
        if (!title) title = (link.text || "").trim();

        push(id, title, cover);
      }
    }

    return comics;
  }

  // ========== 发现页 ==========
  explore = [
    {
      title: "漫客栈",
      type: "multiPartPage",
      load: async () => {
        let res = await Network.get(Mkzhan.webBase, Mkzhan.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        let doc = new HtmlDocument(res.body);

        let result = [];

        function extractComics(container) {
          let comics = [];
          if (!container) return comics;
          let items = container.querySelectorAll(
            ".in-comic--type-b, .in-comic--type-a, .cs-item"
          );
          let seen = {};
          for (let item of items) {
            let comic = Mkzhan.parseComicFromItem(item);
            if (comic && !seen[comic.id]) {
              seen[comic.id] = true;
              comics.push(comic);
            }
          }
          return comics;
        }

        let sections = doc.querySelectorAll(".in-sec-wr");
        for (let section of sections) {
          let headSpan = section.querySelector(".in-sec__head span");
          if (!headSpan) continue;
          let title = headSpan.text.trim();

          if (
            title !== "独家作品" &&
            title !== "上升最快" &&
            title !== "新作尝鲜" &&
            title !== "合作作品" &&
            title !== "完结大作" &&
            title !== "最近更新"
          ) {
            continue;
          }

          let comics = [];
          if (title === "最近更新") {
            let boxes = section.querySelectorAll(".in-sec__box");
            for (let box of boxes) {
              comics = comics.concat(extractComics(box));
            }
          } else {
            comics = extractComics(section.querySelector(".in-sec__box"));
          }

          if (comics.length > 0) {
            result.push({
              title: title,
              comics: comics,
              viewMore: {
                page: "category",
                attributes: {
                  category: "全部",
                  param: "",
                },
              },
            });
          }
        }

        if (result.length === 0) {
          throw "未能解析首页数据";
        }

        return result;
      },
    },
  ];

  // ========== 分类 ==========
  category = {
    title: "漫客栈",
    parts: [
      {
        name: "全部漫画",
        type: "fixed",
        categories: ["全部"],
        categoryParams: [""],
        itemType: "category",
      },
    ],
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      page = Math.max(1, parseInt(page) || 1);

      let url = `${Mkzhan.webBase}/category/?page=${page}`;

      function getOpt(idx) {
        if (!options || !options[idx]) return "";
        let s = String(options[idx]).replace(/^\*/, "");
        let i = s.indexOf("-");
        return i >= 0 ? s.substring(0, i) : s;
      }

      let theme = getOpt(0);
      let finish = getOpt(1);
      let audience = getOpt(2);
      let copyright = getOpt(3);
      let fee = getOpt(4);
      let order = getOpt(5);

      if (theme) url += `&theme_id=${theme}`;
      if (finish) url += `&finish=${finish}`;
      if (audience) url += `&audience=${audience}`;
      if (copyright) url += `&copyright=${copyright}`;
      if (fee) url += `&${fee}=1`;
      if (order) url += `&order=${order}`;

      let res = await Network.get(url, Mkzhan.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let doc = new HtmlDocument(res.body);

      let comics = [];
      let seen = {};
      let items = doc.querySelectorAll(".cate-comic-list .common-comic-item");
      for (let item of items) {
        let a = item.querySelector("a.cover");
        if (!a) continue;
        let href = a.attributes["href"] || "";
        let m = href.match(/^\/(\d+)\/?$/);
        if (!m) continue;
        let id = m[1];
        if (seen[id]) continue;
        seen[id] = true;

        let img = a.querySelector("img");
        let cover = img
          ? img.attributes["data-src"] || img.attributes["src"] || ""
          : "";

        let titleEl = item.querySelector(".comic__title a");
        let title = titleEl ? titleEl.text.trim() : "";
        if (!title && img) title = (img.attributes["alt"] || "").trim();
        if (!title) continue;

        let updEl = item.querySelector(".comic-update .hl");
        let subtitle = updEl ? updEl.text.trim() : "";

        comics.push(
          new Comic({
            id: id,
            title: title,
            cover: Mkzhan.cover(cover),
            subTitle: subtitle,
          })
        );
      }

      let maxPage = page;
      let pag = doc.querySelector("#Pagination");
      if (pag) {
        for (let link of pag.querySelectorAll("a.end, a.num")) {
          let n = parseInt((link.text || "").trim());
          if (!isNaN(n) && n > maxPage) maxPage = n;
        }
      }
      if (maxPage === page && comics.length > 0) maxPage = page + 1;

      return { comics, maxPage };
    },
    optionList: [
      {
        options: [
          "-全部",
          "1-霸总", "2-修真", "3-恋爱", "4-校园", "5-冒险", "6-搞笑",
          "7-生活", "8-热血", "9-架空", "10-后宫", "12-玄幻",
          "13-悬疑", "14-恐怖", "15-灵异", "16-动作", "17-科幻",
          "18-战争", "19-古风", "20-穿越", "21-竞技", "23-励志",
          "24-同人", "26-真人"
        ],
        notShowWhen: null,
        showWhen: null,
      },
      {
        options: ["-全部", "1-连载", "2-完结"],
        notShowWhen: null,
        showWhen: null,
      },
      {
        options: ["-全部", "1-少年", "2-少女", "3-青年", "4-少儿"],
        notShowWhen: null,
        showWhen: null,
      },
      {
        options: ["-全部", "1-独家", "2-合作"],
        notShowWhen: null,
        showWhen: null,
      },
      {
        options: ["-全部", "is_free-免费", "is_fee-付费", "is_vip-VIP"],
        notShowWhen: null,
        showWhen: null,
      },
      {
        options: ["1-热门人气", "2-更新时间"],
        notShowWhen: null,
        showWhen: null,
      },
    ],
  };

  // ========== 搜索 ==========
  search = {
    load: async (keyword, options, page) => {
      page = page || 1;
      let url = `${Mkzhan.webBase}/search/?keyword=${encodeURIComponent(
        keyword
      )}&page=${page}`;
      let res = await Network.get(url, Mkzhan.headers);
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let doc = new HtmlDocument(res.body);
      let comics = Mkzhan.parseComicsFromDocument(doc);
      return {
        comics,
        maxPage: comics.length > 0 ? page + 1 : page,
      };
    },
    optionList: [],
  };

  // ========== 漫画详情 ==========
  comic = {
    loadInfo: async (id) => {
      id = String(id);
      let chRes = await Network.get(
        `${Mkzhan.apiBase}/chapter/v1/?comic_id=${id}`,
        Mkzhan.headers
      );
      if (chRes.status !== 200) throw `Invalid status: ${chRes.status}`;
      let chData = Mkzhan.parseList(chRes.body);
      if (!Array.isArray(chData)) {
        chData = chData.list || chData.chapters || [];
      }

      let detailRes = await Network.get(
        `${Mkzhan.webBase}/${id}/`,
        Mkzhan.headers
      );
      let title = id;
      let cover = "";
      let description = "";
      let author = "";
      if (detailRes.status === 200) {
        let doc = new HtmlDocument(detailRes.body);
        let h1 = doc.querySelector("h1, .comic-title, .j-comic-title");
        if (h1) title = h1.text.trim() || title;

        // 精确选择封面，避免兜底选到页面 logo
        let img = doc.querySelector(
          ".de-info__cover img, .comic-cover img, #Cover img, .cover img"
        );
        if (img) {
          let src = img.attributes["data-src"] || img.attributes["src"] || "";
          if (src && !src.includes("app_logo")) {
            cover = Mkzhan.cover(src);
          }
        }

        let intro = doc.querySelector(
          ".comic-intro .intro-total, .comic-intro .intro, .comic-intro p"
        );
        if (intro) {
          description = intro.text.trim();
        }
        if (!description) {
          let introBox = doc.querySelector(".comic-intro");
          if (introBox) {
            description = introBox.text.replace(/^简介\s*[:：]?\s*/, "").trim();
          }
        }

        let authorEl = doc.querySelector(
          ".author a, .comic-author a, .name a"
        );
        if (authorEl) author = authorEl.text.trim();
      }

      let chapters = new Map();
      let sorted = chData.slice().sort((a, b) => {
        let na = parseInt(a.number || a.sort || 0);
        let nb = parseInt(b.number || b.sort || 0);
        if (a.number && b.number) return na - nb;
        return nb - na;
      });
      for (let c of sorted) {
        let cid = String(c.chapter_id);
        let name = c.title || c.title_alias || cid;
        if (String(c.is_vip) === "1") name += " [VIP]";
        chapters.set(cid, name);
      }

      let tags = {};
      if (author) tags["作者"] = [author];

      let url = `${Mkzhan.webBase}/${id}/`;

      return new ComicDetails({
        title: title,
        cover: cover,
        description: description,
        subtitle: author,
        tags: tags,
        chapters: chapters,
        url: url,
      });
    },

    loadEp: async (comicId, epId) => {
      let res = await Network.get(
        `${Mkzhan.apiBase}/chapter/content/?comic_id=${comicId}&chapter_id=${epId}`,
        Mkzhan.headers
      );
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let data = Mkzhan.parseList(res.body);
      if (!Array.isArray(data)) data = data.list || [];
      let images = data
        .map((p) => Mkzhan.https(p.image || p.url || ""))
        .filter((u) => !!u);
      if (images.length === 0) throw "No images";
      return { images };
    },

    onImageLoad: (url, comicId, epId) => {
      return {
        headers: {
          Referer: Mkzhan.webBase + "/",
          "User-Agent": Mkzhan.headers["User-Agent"],
        },
      };
    },

    link: {
      domains: ["www.mkzhan.com", "mkzhan.com", "m.mkzhan.com"],
      linkToId: (url) => {
        if (!url) return null;
        let match = url.match(/mkzhan\.com\/(\d+)(?:\/|$|\?)/);
        if (match) return match[1];
        return null;
      },
    },

    idMatch: "^\\d+$",
  };
}