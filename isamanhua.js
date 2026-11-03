/** @type {import('../venera-configs-main/_venera_.js'} */

/**
 * 爱飒漫画（正版）→ 现跳转看漫 kanman.com
 * 列表 /{comicId}/ ；章节 getchapterlist；图片 getchapterinfov2.chapter_img_list
 */
class Isamanhua extends ComicSource {
  name = "爱飒漫画";
  key = "isamanhua";
  version = "1.1.4";
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/isamanhua.js";

  static baseUrl = "https://m.kanman.com";
  static pcUrl = "https://www.kanman.com";
  
  static mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
  static pcUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  static headers = {
    "User-Agent": Isamanhua.mobileUA,
    Accept: "text/html,application/json,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };

  static abs(href) {
    if (!href) return "";
    if (href.startsWith("//")) return "https:" + href;
    if (/^https?:/i.test(href)) return href.replace(/^http:/i, "https:");
    try {
      return new URL(href, Isamanhua.baseUrl + "/").href.replace(/^http:/i, "https:");
    } catch (_) {
      return href;
    }
  }

  // 终极暴力解析，无视页面结构
  static parseListPage(document) {
    let comics = [];
    let seen = {};

    let links = document.querySelectorAll("a[href]");
    for (let a of links) {
      let href = a.attributes["href"] || "";
      let m = href.match(/^\/(\d+)\/?$/);
      if (!m) continue;

      let id = m[1];
      if (seen[id]) continue;

      let img = a.querySelector("img");
      
      let title = "";
      let titleEl = a.querySelector("p.title, h3, .card-title, .title");
      if (titleEl) {
        title = (titleEl.text || "").trim();
      }
      
      if (!title && img) {
        let alt = img.attributes["alt"] || "";
        title = alt.split(",")[0].trim();
      }

      if (!title) {
        title = (a.attributes["title"] || a.text || "").trim().split(",")[0].trim();
      }

      if (!title || title.length < 1) continue;
      if (/登录|注册|下载|App|书架|排行|分类|搜索/i.test(title)) continue;

      // 清理标题：去除逗号后面的描述，并去掉“漫画”后缀
      title = title.replace(/,.*$/, "").replace(/漫画/g, "").trim();

      seen[id] = true;
      comics.push(
        new Comic({
          id,
          title,
          cover: `https://image.yqmh.com/mh/${id}.jpg`,
        })
      );
    }
    return comics;
  }

  explore = [
    {
      title: "爱飒漫画",
      type: "multiPartPage",
      load: async () => {
        let url = `${Isamanhua.baseUrl}/`;
        let res = await Network.get(url, Isamanhua.headers);
        if (res.status !== 200) throw `Invalid status: ${res.status}`;
        
        let document = new HtmlDocument(res.body);
        let parts = [];
        
        let blocks = document.querySelectorAll(".mult");
        for (let block of blocks) {
            let titleEl = block.querySelector(".mult-title");
            if (!titleEl) continue;
            let title = titleEl.text.trim();
            if (!title) continue;
            
            let comics = [];
            let seen = {};
            let links = block.querySelectorAll("a[href]");
            for (let a of links) {
                let href = a.attributes["href"] || "";
                let m = href.match(/^\/(\d+)\/?$/);
                if (!m) continue;
                
                let id = m[1];
                if (seen[id]) continue;
                
                let img = a.querySelector("img");
                let cTitle = a.attributes["title"] || (img && img.attributes["alt"]) || "";
                cTitle = cTitle.replace(/,.*$/, "").replace(/漫画/g, "").trim();
                
                if (cTitle && id) {
                    seen[id] = true;
                    comics.push(new Comic({
                        id: id,
                        title: cTitle,
                        cover: `https://image.yqmh.com/mh/${id}.jpg`
                    }));
                }
            }
            
            let moreLink = block.querySelector(".mult-more");
            let viewMore = null;
            if (moreLink && moreLink.attributes["href"]) {
                let moreUrl = moreLink.attributes["href"];
                let m = moreUrl.match(/\/book\/(\d+)\/(\d+)\/?/);
                if (m) {
                    viewMore = {
                        page: "category",
                        attributes: {
                            category: title, // 把模块名称作为分类名，标题显示正确
                            param: "book_" + m[1] + "_" + m[2] // 加上 book_ 前缀方便区分
                        }
                    };
                }
            }
            if (comics.length > 0) {
                parts.push({ title: title, comics: comics, viewMore: viewMore });
            }
        }
        document.dispose();
        return parts;
      },
    },
  ];

  category = {
    title: "爱飒漫画",
    parts: [
      {
        name: "按题材",
        type: "fixed",
        categories: ["全部", "热血", "机战", "运动", "推理", "冒险", "搞笑", "战争", "神魔", "忍者", "竞技", "悬疑", "社会", "恋爱", "宠物", "吸血", "萝莉", "御姐", "霸总", "玄幻", "古风", "历史", "漫改", "游戏", "穿越", "恐怖", "真人", "科幻", "都市", "武侠", "修真", "生活", "动作"],
        categoryParams: ["all", "rexue", "jizhan", "yundong", "tuili", "maoxian", "gaoxiao", "zhanzhen", "shenmo", "renzhe", "jingji", "xuanyi", "shehui", "lianai", "chongwu", "xixue", "luoli", "yujie", "bazong", "xuanhuan", "gufeng", "lishi", "mangai", "youxi", "chuanyue", "kongbu", "zhenren", "kehuan", "dushi", "wuxia", "xiuzhen", "shenghuo", "dongzuo"],
        itemType: "category",
      },
      {
        name: "按地区",
        type: "fixed",
        categories: ["全部", "大陆", "日本", "港台", "欧美", "韩国"],
        categoryParams: ["all", "dalu", "riben", "gangtai", "oumei", "os"],
        itemType: "category",
      },
      {
        name: "按进度",
        type: "fixed",
        categories: ["全部", "连载", "完结"],
        categoryParams: ["all", "lianzai", "wanjie"],
        itemType: "category",
      },
      {
        name: "按色彩",
        type: "fixed",
        categories: ["全部", "全彩", "黑白"],
        categoryParams: ["all", "quancai", "heibai"],
        itemType: "category",
      },
      {
        name: "按专题",
        type: "fixed",
        categories: ["全部", "精品", "限免", "小说改编", "折扣专区", "免费读"],
        categoryParams: ["all", "jingpin", "mingjia", "xiaoshuo", "baozou", "zazhi"],
        itemType: "category",
      },
      {
        name: "按字母",
        type: "fixed",
        categories: ["全部", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
        categoryParams: ["all", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
        itemType: "category",
      },
    ]
  };

  categoryComics = {
    load: async (category, param, options, page) => {
        // 1. 拦截“查看更多”请求
        if (param && param.startsWith("book_")) {
            let parts = param.substring(5).split("_");
            if (parts.length === 2) {
                let url = `${Isamanhua.baseUrl}/book/${parts[0]}/${parts[1]}/`;
                let res = await Network.get(url, Isamanhua.headers);
                if (res.status !== 200) throw `Invalid status: ${res.status}`;
                let document = new HtmlDocument(res.body);
                let comics = Isamanhua.parseListPage(document);
                document.dispose();
                return { comics, maxPage: 1 };
            }
        }
        
        // 2. 普通分类请求：双端并发请求，暴力抓取合并
        let sort = options && options.length > 0 ? options[0] : "click";
        let qs = [];
        if (page > 1) qs.push(`page=${page}`);
        if (sort !== "click") qs.push(`orderby=${sort}`);
        let qsStr = qs.length > 0 ? "?" + qs.join("&") : "";

        let pcUrl = `${Isamanhua.pcUrl}/sort/${param || "all"}.html${qsStr}`;
        let mUrl = `${Isamanhua.baseUrl}/sort/${param || "all"}.html${qsStr}`;

        let [resPc, resM] = await Promise.all([
            Network.get(pcUrl, { ...Isamanhua.headers, "User-Agent": Isamanhua.pcUA }).catch(() => null),
            Network.get(mUrl, Isamanhua.headers).catch(() => null)
        ]);

        let comics = [];
        let seen = new Set();
        
        let parseAndAdd = (res) => {
            if (res && res.status === 200) {
                let doc = new HtmlDocument(res.body);
                let list = Isamanhua.parseListPage(doc);
                doc.dispose();
                for (let c of list) {
                    if (!seen.has(c.id)) {
                        seen.add(c.id);
                        comics.push(c);
                    }
                }
            }
        };

        parseAndAdd(resPc);
        parseAndAdd(resM);

        return { comics, maxPage: comics.length > 0 ? page + 1 : page };
    },
    optionList: [
      {
        label: "排序",
        options: [
          "click-人气",
          "shoucang-收藏",
          "date-更新"
        ],
      }
    ]
  };

  search = {
    load: async (keyword, options, page) => {
      page = page || 1;
      let encoded = encodeURIComponent(keyword);

      // 看漫画的官方搜索 API 经常变更且可能失效，这里同时并发请求多个可能有效的搜索端点
      let urls = [
          `https://www.kanman.com/api/search?keyword=${encoded}`,
          `https://m.kanman.com/api/search?keyword=${encoded}`,
          `https://m.kanman.com/search?keyword=${encoded}`, // 不带斜杠
          `https://www.kanman.com/search?keyword=${encoded}`
      ];

      let validRes = null;

      // 1. 尝试请求官方搜索 API
      for (let url of urls) {
          try {
              let r = await Network.get(url, {
                  ...Isamanhua.headers,
                  "User-Agent": Isamanhua.pcUA
              });
              if (r.status === 200 && r.body.length > 100) {
                  let testDoc = new HtmlDocument(r.body);
                  let list = Isamanhua.parseListPage(testDoc);
                  testDoc.dispose();
                  // 如果解析出的结果包含关键字，说明接口有效
                  if (list.some(c => c.title.includes(keyword))) {
                      validRes = r;
                      break;
                  }
              }
          } catch(e) {}
      }

      // 2. 如果 API 全挂，退回全站列表，做前端本地过滤（保证能搜出首页的热门结果）
      if (!validRes) {
          let url = `${Isamanhua.pcUrl}/sort/all.html?page=1`;
          validRes = await Network.get(url, { ...Isamanhua.headers, "User-Agent": Isamanhua.pcUA });
      }

      let document = new HtmlDocument(validRes.body);
      let comics = Isamanhua.parseListPage(document);
      document.dispose();

      // 如果是通过全站列表兜底，必须本地过滤标题，只保留包含关键字的漫画
      if (!urls.some(u => validRes.request && validRes.request.url === u)) {
          comics = comics.filter(c => c.title.includes(keyword));
      }

      return { comics, maxPage: 1 };
    },
    optionList: [],
  };

  comic = {
    link: {
      domains: ["m.kanman.com", "www.kanman.com", "kanman.com"],
      linkToId: (url) => {
        let m = String(url).match(/\/(\d+)\/?/);
        return m ? m[1] : null;
      }
    },

    loadInfo: async (id) => {
      id = String(id).replace(/\D/g, "");
      let listRes = await Network.get(
        `${Isamanhua.baseUrl}/api/getchapterlist?comic_id=${id}`,
        {
          ...Isamanhua.headers,
          Accept: "application/json,*/*",
          Referer: `${Isamanhua.baseUrl}/${id}/`,
        }
      );
      if (listRes.status !== 200) throw `Invalid status: ${listRes.status}`;
      let listJson;
      try {
        listJson = JSON.parse(listRes.body);
      } catch (_) {
        throw "Invalid chapter list JSON";
      }
      let list = (listJson && listJson.data) || [];
      if (!Array.isArray(list) || list.length < 1) throw "No chapters";

      let title = id;
      let cover = `https://image.yqmh.com/mh/${id}.jpg`;
      try {
        let pageRes = await Network.get(`${Isamanhua.baseUrl}/${id}/`, Isamanhua.headers);
        if (pageRes.status === 200) {
          let tm = String(pageRes.body).match(
            /property="og:title"\s+content="([^"]+)"/i
          );
          if (tm) title = tm[1].replace(/漫画.*$/, "").trim() || title;
          let nm = String(pageRes.body).match(/"comic_name"\s*:\s*"([^"]+)"/);
          if (nm) title = nm[1];
        }
      } catch (_) {}

      let items = list.slice();
      items.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
      let chapters = new Map();
      for (let ch of items) {
        let cid = String(ch.chapter_newid || ch.chapter_id || "");
        if (!cid) continue;
        let name = String(ch.chapter_name || cid).trim();
        if (ch.is_vip || (ch.price && Number(ch.price) > 0)) {
          name = `[VIP] ${name}`;
        }
        chapters.set(cid, name);
      }
      
      const detailUrl = `${Isamanhua.baseUrl}/${id}/`;

      return new ComicDetails({
        title,
        cover: Isamanhua.abs(cover),
        description: "",
        tags: {},
        chapters,
        url: detailUrl,
      });
    },

    loadEp: async (comicId, epId) => {
      comicId = String(comicId).replace(/\D/g, "");
      epId = String(epId);
      let url = `${Isamanhua.baseUrl}/api/getchapterinfov2?comic_id=${comicId}&chapter_newid=${encodeURIComponent(
        epId
      )}`;
      let res = await Network.get(url, {
        ...Isamanhua.headers,
        Accept: "application/json,*/*",
        Referer: `${Isamanhua.baseUrl}/${comicId}/`,
      });
      if (res.status !== 200) throw `Invalid status: ${res.status}`;
      let data;
      try {
        data = JSON.parse(res.body);
      } catch (_) {
        throw "Invalid chapter info JSON";
      }
      let cur = (data && data.data && data.data.current_chapter) || {};
      let images = cur.chapter_img_list || [];
      if (!Array.isArray(images) || images.length < 1) throw "No images";
      images = images
        .map((u) => Isamanhua.abs(String(u || "")))
        .filter((u) => /^https?:\/\//i.test(u));
      if (images.length < 1) throw "No images";
      return { images };
    },

    onImageLoad: (url, comicId, epId) => {
      return {
        headers: {
          Referer: Isamanhua.baseUrl + "/",
          "User-Agent": Isamanhua.headers["User-Agent"],
        },
      };
    },
  };
}