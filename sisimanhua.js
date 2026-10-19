class Xmanhua extends ComicSource {
  name = "思思漫画";
  key = "sisimanhua";
  version = "2.7.0";
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/sisimanhua.js";

  static baseUrl = "https://m.sisimanhua.com";
  static headers = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    Accept: "text/html,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept-Encoding": "identity",
  };

  static categoryMap = {
    "最近更新": "/new/",
    "热门推荐": "/paihang/",
    "日韩漫画": "/rihan/",
    "内地漫画": "/neidi/",
    "港台漫画": "/gangntai/",
    "欧美漫画": "/oumei/"
  };

  static abs(href) {
    if (!href) return "";
    let u = href.trim();
    if (u.startsWith("http://")) return u.replace("http://", "https://");
    if (u.startsWith("https://")) return u;
    if (u.startsWith("//")) return "https:" + u;
    return Xmanhua.baseUrl + (u.startsWith("/") ? u : "/" + u);
  }

  static extractId(href) {
    if (!href) return null;
    let m = String(href).match(/\/manhua\/([^\/]+)\/?/i);
    return m ? m[1] : null;
  }

  static getCover(img) {
    if (!img) return "";
    let src = img.attributes["data-src"] || img.attributes["src"] || "";
    if (!src) return "";
    return Xmanhua.abs(src);
  }

  static parseList(doc) {
    let comics = [];
    let seen = {};
    let items = doc.querySelectorAll(".col_3_1 li, .UpdateList .itemBox, .mh-list li, #listbody li");
    
    for (let li of items) {
      let aImg = li.querySelector("a.ImgA") || li.querySelector("a[href*='/manhua/']");
      if (!aImg) continue;
      
      let href = aImg.attributes["href"] || "";
      let id = Xmanhua.extractId(href);
      if (!id || seen[id]) continue;
      seen[id] = true;
      
      let title = "";
      let titleNode = li.querySelector(".txtA") || li.querySelector(".title");
      if (titleNode && titleNode.text) {
        title = String(titleNode.text).trim();
      }
      if (!title) {
        let html = li.innerHTML || "";
        let match = html.match(/class="[^"]*(?:txtA|title)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        if (match) title = match[1].replace(/<[^>]+>/g, "").trim();
      }
      
      if (!title) title = id;
      
      let img = li.querySelector("img");
      let cover = Xmanhua.getCover(img);
      
      comics.push(new Comic({ id, title, cover }));
    }
    return comics;
  }

  explore = [
    {
      title: "思思漫画",
      type: "multiPartPage",
      load: async () => {
        let res = await Network.get(Xmanhua.baseUrl + "/", Xmanhua.headers);
        if (res.status !== 200) throw `Status: ${res.status}`;
        let doc = new HtmlDocument(res.body);
        
        let sections = [];
        for (let box of doc.querySelectorAll(".imgBox")) {
          let titleEl = box.querySelector(".Sub_H2 .Title");
          if (!titleEl) continue;
          let sectionTitle = String(titleEl.text || "").trim();
          
          let comics = Xmanhua.parseList(box);
          
          if (comics.length > 0) {
            let section = { title: sectionTitle, comics };
            if (Xmanhua.categoryMap[sectionTitle]) {
              section.viewMore = `search:${sectionTitle}`;
            }
            sections.push(section);
          }
        }
        return sections;
      }
    }
  ];

  // 【核心修复】彻底改写 category 配置，确保参数一一对应
  category = {
    title: "思思漫画",
    parts: [
      {
        name: "全部分类",
        type: "fixed",
        categories: [
          "完结", "连载中", "日韩", "内地", "港台", "欧美", "其他", 
          "少年", "少女", "青年", "少儿", 
          "热血", "格斗", "科幻", "竞技", "搞笑", "推理", "恐怖", "耽美", "少女题材", "恋爱", "生活", "战争", "故事", "冒险", "魔幻", "玄幻", "校园", "悬疑", "萌系", "穿越", "后宫", "都市", "武侠", "历史", "同人", "励志", "百合", "治愈", "机甲", "纯爱", "美食", "血腥", "僵尸", "恶搞", "虐心", "动作", "惊险", "唯美", "震撼", "复仇", "侦探", "脑洞", "奇幻", "宫斗", "爆笑", "运动", "青春", "灵异", "古风", "权谋", "节操", "明星", "暗黑", "社会", "浪漫", "栏目", "仙侠"
        ],
        itemType: "category",
        categoryParams: [
          "/wanjie/", "/lianzai/", "/rihan/", "/neidi/", "/gangntai/", "/oumei/", "/qita/", 
          "/shaonianqu/", "/shaonvqu/", "/qingnian/", "/shaoer/", 
          "/rexue/", "/gedou/", "/kehuan/", "/jingji/", "/gaoxiao/", "/tuili/", "/kongbu/", "/danmei/", "/shaonv/", "/lianai/", "/shenghuo/", "/zhanzheng/", "/gushi/", "/maoxian/", "/mohuan/", "/xuanhuan/", "/xiaoyuan/", "/xuanyi/", "/mengxi/", "/chuanyue/", "/hougong/", "/dushi/", "/wuxia/", "/lishi/", "/tongren/", "/lizhi/", "/baihe/", "/zhiyu/", "/jijia/", "/chunai/", "/meishi/", "/xuexing/", "/jiangshi/", "/egao/", "/nuexin/", "/dongzuo/", "/jingxian/", "/weimei/", "/zhenhan/", "/fuchou/", "/zhentan/", "/naodong/", "/qihuan/", "/gongdou/", "/baoxiao/", "/yundong/", "/qingchun/", "/lingyi/", "/gufeng/", "/quanmou/", "/jiecao/", "/mingxing/", "/anhei/", "/shehui/", "/langman/", "/lanmu/", "/xianxia/"
        ]
      }
    ],
    enableRankingPage: false
  };

  categoryComics = {
    load: async (category, params, options, page) => {
      // 默认目标路径
      let targetPath = "/new/";
      
      // 提取 Venera 传过来的真实 URL 参数
      if (params) {
        if (typeof params === "string" && params.startsWith("/")) {
          targetPath = params;
        } else if (Array.isArray(params) && params.length > 0) {
          for (let p of params) {
            if (typeof p === "string" && p.startsWith("/")) {
              targetPath = p;
              break;
            }
          }
        }
      }
      
      let url = `${Xmanhua.baseUrl}${targetPath}`;
      let res = await Network.get(url, Xmanhua.headers);
      if (res.status !== 200) throw `Status: ${res.status}`;
      
      let doc = new HtmlDocument(res.body);
      let comics = Xmanhua.parseList(doc);
      
      // 动态加载页面，只能返回 1 页
      return { comics, maxPage: 1 };
    }
  };

  search = {
    load: async (keyword, options, page) => {
      page = page || 1;
      
      if (Xmanhua.categoryMap[keyword]) {
        let catUrl = Xmanhua.baseUrl + Xmanhua.categoryMap[keyword];
        let res = await Network.get(catUrl, Xmanhua.headers);
        if (res.status !== 200) throw `Status: ${res.status}`;
        let doc = new HtmlDocument(res.body);
        let comics = Xmanhua.parseList(doc);
        return { comics, maxPage: 1 };
      }
      
      let url = `${Xmanhua.baseUrl}/statics/search.aspx?key=${encodeURIComponent(keyword)}&page=${page}`;
      let res = await Network.get(url, Xmanhua.headers);
      if (res.status !== 200) throw `Status: ${res.status}`;
      let doc = new HtmlDocument(res.body);
      let comics = Xmanhua.parseList(doc);
      return { comics, maxPage: comics.length > 0 ? page + 1 : page };
    },
    optionList: [],
  };

  comic = {
    link: {
      domains: ['sisimanhua.com', 'www.sisimanhua.com', 'm.sisimanhua.com'],
      linkToId: (url) => {
        let match = url.match(/\/manhua\/([^\/]+)\/?/i);
        return match ? match[1] : null;
      }
    },

    loadInfo: async (id) => {
      let url = `${Xmanhua.baseUrl}/manhua/${id}/`;
      let res = await Network.get(url, Xmanhua.headers);
      if (res.status !== 200) throw `Status: ${res.status}`;
      let document = new HtmlDocument(res.body);
      
      let titleEl = document.querySelector(".detail-info-title, h1, .title");
      let title = titleEl ? String(titleEl.text || "").trim() : id;
      
      let coverEl = document.querySelector(".detail-info-cover, img");
      let cover = Xmanhua.getCover(coverEl);
      
      let chapters = new Map();
      let items = [];
      let chapterLinks = document.querySelectorAll("#chapterlistload a");
      if (chapterLinks.length === 0) chapterLinks = document.querySelectorAll("a");
      
      for (let a of chapterLinks) {
        let href = a.attributes["href"] || "";
        if (!href.endsWith(".html")) continue;
        let m = href.match(/\/(\d+)\.html$/i);
        if (!m) continue;
        let name = String(a.text || a.innerHTML || "").trim().replace(/\s+/g, " ");
        if (!name) name = m[1];
        if (!items.find(i => i[0] === m[1])) {
          items.push([m[1], name]);
        }
      }
      
      items.reverse();
      for (let [cid, name] of items) chapters.set(cid, name);
      
      return new ComicDetails({ 
        title, 
        cover, 
        description: "", 
        tags: {}, 
        chapters,
        url: url 
      });
    },

    loadEp: async (comicId, epId) => {
      let churl = `${Xmanhua.baseUrl}/manhua/${comicId}/${epId}.html`;
      let res = await Network.get(churl, {
        ...Xmanhua.headers,
        Referer: `${Xmanhua.baseUrl}/manhua/${comicId}/`,
      });
      if (res.status !== 200) throw `Status: ${res.status}`;
      
      let html = res.body;
      let base64Match = html.match(/var\s+qTcms_S_m_murl_e\s*=\s*"([^"]+)"/);
      if (!base64Match) throw "未找到图片数据";
      
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      let str = String(base64Match[1]).replace(/[=]+$/, '');
      let output = '';
      for (let bc = 0, bs, buffer, idx = 0; (buffer = str.charAt(idx++)); ) {
        buffer = chars.indexOf(buffer);
        if (~buffer) {
          bs = bc % 4 ? bs * 64 + buffer : buffer;
          if (bc++ % 4) {
            output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
          }
        }
      }
      
      let rawImages = output.split("$qingtiandy$");
      let images = [];
      for (let img of rawImages) {
        img = img.trim();
        if (!img) continue;
        if (img.startsWith("http://")) img = img.replace("http://", "https://");
        images.push(img);
      }
      
      if (images.length === 0) throw "No images";
      return { images };
    },

    onImageLoad: (url, comicId, epId) => {
      if (url.startsWith("http://")) {
        url = url.replace("http://", "https://");
      }
      return {
        url: url,
        headers: {
          Referer: Xmanhua.baseUrl + "/",
          "User-Agent": Xmanhua.headers["User-Agent"],
        },
      };
    },
  };
}