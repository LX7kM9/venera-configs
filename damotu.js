/** @type {import('./_venera_.js')} */
class Damotu extends ComicSource {
  name = "大魔兔";
  key = "damotu";
  version = "0.7.1";
  minAppVersion = "1.6.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/damotu.js";
  baseUrl = "http://m.damotu.com";

  get baseUrl() { return "http://m.damotu.com"; }

  get headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Referer": "http://www.damotu.com/"
    };
  }

  absolute(url, base = this.baseUrl) {
    if (!url || url === "null" || url === "undefined" || url.trim() === "") return "";
    let u = url.startsWith("//") ? "http:" + url : url;
    return /^https?:\/\//i.test(u) ? u : (u.startsWith("/") ? base + u : base + "/" + u);
  }

  text(el) { return el ? (el.text || "").trim() : ""; }
  attr(el, name) { return el && el.attributes ? (el.attributes[name] || "") : ""; }

  async html(url) {
    const r = await Network.get(url, this.headers);
    if (r.status !== 200) throw `请求失败：${r.status}`;
    return new HtmlDocument(r.body);
  }

  // 强化提取逻辑：既查子元素，也查自身
  extractCover(el) {
    if (!el) return "";
    // 1. 先查自己身上的 style
    const s = this.attr(el, "style") || "";
    let m = s.match(/url\(\s*['"]?(https?:\/\/[^'")]+)/);
    if (m) return this.absolute(m[1]);
    
    // 2. 再查内部子元素
    for (const child of el.querySelectorAll("*")) {
      const cs = this.attr(child, "style") || "";
      const cm = cs.match(/url\(\s*['"]?(https?:\/\/[^'")]+)/);
      if (cm) return this.absolute(cm[1]);
    }
    return "";
  }

  // ========== 分类页 ==========
  category = {
    title: "大魔兔",
    parts: (() => {
      const tags = [
        ["全部", "0"], ["神鬼", "2"], ["伪娘", "4"], ["侦探", "5"], ["后宫", "6"],
        ["性转换", "7"], ["恐怖", "8"], ["悬疑", "10"], ["治愈", "11"], ["校园", "12"],
        ["热血", "13"], ["亲情", "14"], ["百合", "15"], ["耽美", "16"], ["职场", "17"],
        ["萌系", "18"], ["搞笑", "19"], ["腐女", "20"], ["魔法", "21"], ["历史", "23"],
        ["冒险", "24"], ["励志", "27"], ["战争", "28"], ["机战", "29"], ["奇幻", "30"],
        ["格斗", "31"], ["科幻", "32"], ["爱情", "34"], ["魔幻", "35"], ["武侠", "36"],
        ["竞技", "37"], ["美食", "38"], ["音乐", "39"]
      ];
      const buildPart = (name, col) => {
          return {
              name: name,
              type: "fixed",
              categories: tags.map(x => x[0]),
              categoryParams: tags.map(x => `${col}_${x[1]}`),
              itemType: "category"
          };
      };
      return [
          buildPart("新番连载", "1"),
          buildPart("经典完结", "2"),
          buildPart("站长推荐", "4"),
          buildPart("单行本", "3")
      ];
    })()
  };

  categoryComics = {
    load: async (category, param, options, page) => {
      let parts = param.split("_");
      let col = parts[0];
      let tag = parts[1];
      
      let url = `http://www.damotu.com/list-${col}-${page}`;
      if (tag && tag !== "0") {
          url += `-t${tag}`;
      }
      url += ".htm";
      
      const doc = await this.html(url);
      const comics = [];
      const seen = new Set();
      
      for (let aCover of doc.querySelectorAll("a.list-book-col-240-icon, a.list-book-col-icon, a.list-book-col-480-icon")) {
          let a = this.attr(aCover, "href");
          let id = this.absolute(a);
          
          let title = this.attr(aCover, "title") || "未知标题";
          title = title.replace(/\s*第\d+[话章卷].*$/, "").trim();
          
          if (id && title && !seen.has(id)) {
              seen.add(id);
              // 调用强化后的封面提取
              let cover = this.extractCover(aCover);
              comics.push(new Comic({ id, title, cover: cover || "" }));
          }
      }
      
      let maxPage = 1;
      for (let a of doc.querySelectorAll(".page-box a")) {
          let text = this.text(a);
          let num = parseInt(text);
          if (!isNaN(num) && num > maxPage) {
              maxPage = num;
          }
      }
      
      return { comics, maxPage };
    },
    optionList: []
  };

  // ========== 发现页 ==========
  explore = [
    {
      title: "大魔兔",
      type: "singlePageWithMultiPart",
      load: async () => {
        const doc = await this.html(this.baseUrl);
        let result = {};
        let seen = new Set();

        let banners = [];
        for (let slide of doc.querySelectorAll(".swiper-slide")) {
          let a = slide.querySelector("a");
          if (!a) continue;
          let href = this.attr(a, "href");
          let id = href.replace(/\/\d+\.htm$/, ".htm");
          let url = this.absolute(id);
          let title = this.attr(a, "title") || "";
          title = title.replace(/\s*第\d+[话章].*$/, "").trim();

          if (url && title && !seen.has(url)) {
            seen.add(url);
            let img = a.querySelector("img");
            let cover = img ? (this.attr(img, "src") || this.attr(img, "data-src")) : "";
            banners.push(new Comic({ 
              id: url, 
              title: title, 
              cover: this.absolute(cover) || "" 
            }));
          }
        }
        if (banners.length > 0) result["最新更新"] = banners;

        for (let box of doc.querySelectorAll(".container-fluid.container-none-padding")) {
          let titleEl = box.querySelector(".list-book-category-tit");
          if (!titleEl) continue;
          let sectionTitle = this.text(titleEl);
          if (!sectionTitle) continue;

          let comics = [];
          for (let li of box.querySelectorAll("ul > li")) {
            let aCover = li.querySelector(".list-book-col-icon");
            if (!aCover) continue;
            let url = this.absolute(this.attr(aCover, "href"));
            let title = this.attr(aCover, "title") || "未知标题";

            if (url && title && !seen.has(url)) {
              seen.add(url);
              let cover = this.extractCover(li);
              comics.push(new Comic({ 
                id: url, 
                title: title, 
                cover: cover || "" 
              }));
            }
          }
          if (comics.length > 0) {
            result[sectionTitle] = comics;
          }
        }

        return result;
      }
    }
  ];

  // ========== 搜索 ==========
  search = {
    load: async (keyword, options, page) => {
      const bookUrl = "http://www.damotu.com/js/book.htm";
      const res = await Network.get(bookUrl, this.headers);
      if (res.status !== 200) throw `获取书库列表失败：${res.status}`;

      const body = res.body;
      const start = body.indexOf('[');
      const end = body.lastIndexOf(']');
      if (start === -1 || end === -1) throw "解析书库数据格式失败";

      let bookData;
      try {
        bookData = JSON.parse(body.substring(start, end + 1));
      } catch (e) {
        throw "书库数据解析失败";
      }

      const lowerKeyword = keyword.toLowerCase();
      const comics = [];
      
      for (const item of bookData) {
        if (item.name && item.name.toLowerCase().includes(lowerKeyword)) {
          
          const numId = parseInt(item.id);
          const prefix = Math.floor((numId - 1) / 1000) + 1;
          const coverUrl = `http://res.damotu.com/cover/book/${prefix}/${item.id}.jpg`;

          comics.push(new Comic({
            id: `http://m.damotu.com/manhua/${item.id}.htm`,
            title: item.name,
            cover: coverUrl
          }));
        }
      }

      return { comics, maxPage: 1 };
    },
    enableTagsSuggestions: false
  };

  // ========== 漫画详情 ==========
  comic = {
    link: {
      domains: ["m.damotu.com", "www.damotu.com", "damotu.com"],
      linkToId: (url) => {
        let m = String(url).match(/\/manhua\/(\d+)\.htm/);
        return m ? `http://m.damotu.com/manhua/${m[1]}.htm` : null;
      }
    },

    loadInfo: async (id) => {
      const doc = await this.html(id);

      let pageTitle = this.text(doc.querySelector("title"));
      let title = pageTitle.split("_")[0].trim() || "未知标题";

      let author = "", type = "", description = "";
      let metaDesc = this.attr(doc.querySelector('meta[name="description"]'), "content");
      if (metaDesc) {
        let m = metaDesc.match(/《(.*?)》是作者(.*?)倾情打造的一部(.*?)漫画/);
        if (m) {
          author = m[2].trim();
          type = m[3].trim();
        }
        description = metaDesc;
      }
      const tags = {};
      if (author) tags["作者"] = [author];
      if (type) tags["类型"] = [type];

      let cover = "";
      let imgEl = doc.querySelector(".cover img, .book-cover img, .book img, .comic-cover img");
      if (imgEl) {
        let src = this.attr(imgEl, "src") || this.attr(imgEl, "data-src");
        if (src) cover = this.absolute(src);
      }
      if (!cover) cover = this.extractCover(doc);

      let lianzaiList = [];
      const lianzaiBox = doc.querySelector("#book-part");
      if (lianzaiBox) {
        for (const a of lianzaiBox.querySelectorAll("a")) {
          const u = this.absolute(this.attr(a, "href"));
          if (u && /\/manhua\/\d+\/\d+\.htm/.test(u)) {
            let t = this.attr(a, "title") || this.text(a) || "未知章节";
            let match = t.match(/(第?\s*\d+[话章卷].*|\d+话.*)/);
            if (match) t = match[1];
            else t = t.replace(title, "").replace(/^[-_:：\s]+/, "").trim() || "未知章节";
            lianzaiList.push({ url: u, title: t });
          }
        }
      }

      let danxingbenList = [];
      const danxingbenBox = doc.querySelector("#book-one");
      if (danxingbenBox) {
        for (const a of danxingbenBox.querySelectorAll("a")) {
          const u = this.absolute(this.attr(a, "href"));
          if (u && /\/manhua\/\d+\/\d+\.htm/.test(u)) {
            let t = this.attr(a, "title") || this.text(a) || "未知章节";
            let match = t.match(/(第?\s*\d+[话章卷].*|\d+话.*)/);
            if (match) t = match[1];
            else t = t.replace(title, "").replace(/^[-_:：\s]+/, "").trim() || "未知章节";
            danxingbenList.push({ url: u, title: t });
          }
        }
      }

      if (lianzaiList.length === 0 && danxingbenList.length === 0) {
        for (const a of doc.querySelectorAll("a")) {
          const u = this.absolute(this.attr(a, "href"));
          if (u && /\/manhua\/\d+\/\d+\.htm/.test(u)) {
            let t = this.attr(a, "title") || this.text(a) || "未知章节";
            let match = t.match(/(第?\s*\d+[话章卷].*|\d+话.*)/);
            if (match) t = match[1];
            else t = t.replace(title, "").replace(/^[-_:：\s]+/, "").trim() || "未知章节";
            lianzaiList.push({ url: u, title: t });
          }
        }
      }

      lianzaiList.reverse();
      danxingbenList.reverse();

      const lianzai = {};
      for (let item of lianzaiList) lianzai[item.url] = item.title;

      const danxingben = {};
      for (let item of danxingbenList) danxingben[item.url] = item.title;

      const chapters = new Map();
      if (Object.keys(lianzai).length > 0) chapters.set("连载章节", lianzai);
      if (Object.keys(danxingben).length > 0) chapters.set("单行本", danxingben);

      return new ComicDetails({
        title: title,
        cover: cover || "",
        description: description || "",
        tags: tags,
        chapters: chapters,
        url: id
      });
    },

    loadEp: async (comicId, epId) => {
      const doc = await this.html(epId);
      const images = [];
      for (const img of doc.querySelectorAll(".swiper-container img, .swiper-slide img, .content img, img")) {
        let src = this.attr(img, "data-src") || this.attr(img, "src");
        if (src && src !== "null" && src !== "undefined" && !src.startsWith("data:") && !src.includes("blank") && !src.includes("Access_Denied")) {
          images.push(this.absolute(src));
        }
      }
      if (!images.length) throw "没有找到章节图片（原站可能无数据）";

      try {
        const testReq = await Network.get(images[0], this.headers);
        const contentLength = testReq.headers ? (testReq.headers["content-length"] || testReq.headers["Content-Length"] || "") : "";
        
        if (testReq.status !== 200 || contentLength === "0" || !testReq.body || testReq.body.length === 0) {
          throw "当前章节的图片已在原网站失效（空图片），请尝试阅读其他章节";
        }
      } catch (e) {
        if (typeof e === 'string') {
          throw e;
        }
        throw "图片连接失败，原网站的图片可能已失效";
      }

      return { images };
    }
  };
}