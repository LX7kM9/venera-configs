class Zerobyw extends ComicSource {
  name = "zero搬运网"
  key = "zerobyw"
  version = "1.0.5"   // 修改发现页和分类页标题为“zero搬运网”
  minAppVersion = "1.0.0"
  baseUrl = "https://www.zerobyw33.com"
  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/zero.js"
  currentEpMap = {}

  // ========== 工具方法 ==========
  async getHtml(resp, name = "") {
    let html = ""
    try {
      if (resp?.body != null) html = String(resp.body)
      else if (resp?.data != null) html = String(resp.data)
      else if (typeof resp === "string") html = resp
      else if (resp?.responseText != null) html = String(resp.responseText)
      else html = String(resp || "")
    } catch (e) {}
    return html.trim()
  }

  decodeHtmlEntities(str) {
    return str.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec))
  }

  getHeaders(referer = "") {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": referer || this.baseUrl
    }
  }

  // ========== 账号管理（仅主账号） ==========
  account = {
    loginWithWebview: {
      url: "https://www.zerobyw33.com/member.php?mod=logging&action=login",
      checkStatus: (url, title) => url.includes("home.php") || title.includes("个人中心") || !url.includes("logging"),
      onLoginSuccess: async () => {
        const cookies = await Network.getCookies(this.baseUrl);
        if (cookies && cookies.length > 0) {
          this.saveData('account_cookies', cookies);
        } else {
          throw "未能获取到主账号 Cookie";
        }
      }
    },
    isLoggedIn: async () => {
      try {
        const resp = await Network.get(`${this.baseUrl}/home.php?mod=space&do=profile`, { headers: this.getHeaders() })
        const html = await this.getHtml(resp, "检查登录")
        return html.includes("退出") || html.includes("我的中心") || !html.includes("请先登录")
      } catch (e) {
        return false
      }
    },
    logout: () => {
      this.deleteData('account_cookies');
      Network.deleteCookies(this.baseUrl);
    },
    registerWebsite: "https://www.zerobyw33.com/member.php?mod=register"
  }

  // ========== 网络收藏夹（修复版） ==========
  favorites = {
    multiFolder: false,

    loadFolders: async (comicId) => {
      let folders = { "0": "收藏" };
      let favorited = [];
      if (comicId) {
        const cookies = this.loadData('account_cookies');
        if (cookies) {
          Network.setCookies(this.baseUrl, cookies);
          const url = `${this.baseUrl}/pc/details/?kuid=${comicId}`;
          const resp = await Network.get(url, this.getHeaders(url));
          const html = await this.getHtml(resp, "检查收藏状态");
          if (html.includes('已收藏') || html.includes('取消收藏')) {
            favorited.push("0");
          }
        }
      }
      return { folders, favorited };
    },

    addOrDelFavorite: async (comicId, folderId, isAdding) => {
      const cookies = this.loadData('account_cookies');
      if (!cookies) throw "请先登录";
      Network.setCookies(this.baseUrl, cookies);

      // 1. 获取 formhash
      const profileUrl = `${this.baseUrl}/home.php?mod=space&do=profile`;
      const resp = await Network.get(profileUrl, this.getHeaders(profileUrl));
      const html = await this.getHtml(resp, "获取formhash");
      const formhashMatch = html.match(/<input\s+type="hidden"\s+name="formhash"\s+value="([^"]+)"/i);
      if (!formhashMatch) throw "获取 formhash 失败，请重新登录";
      const formhash = formhashMatch[1];

      // 2. 构造 POST 请求
      const action = isAdding ? "add" : "del";
      const url = `${this.baseUrl}/home.php?mod=spacecp&ac=favorite&op=${action}`;
      const headers = {
        ...this.getHeaders(url),
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest"
      };
      const body = `formhash=${formhash}&favid=${comicId}&favoritesubmit=true&handlekey=favorite&infloat=yes`;

      const postResp = await Network.post(url, body, { headers });
      const resultHtml = await this.getHtml(postResp);

      if (resultHtml.includes('成功') || resultHtml.includes('已收藏') || resultHtml.includes('取消收藏')) {
        return "ok";
      } else {
        if (resultHtml.includes('请先登录')) throw "会话已过期，请重新登录";
        throw "收藏操作失败，请检查网络或稍后重试";
      }
    },

    loadComics: async (page, folder) => {
      const cookies = this.loadData('account_cookies');
      if (!cookies) throw "请先登录";
      Network.setCookies(this.baseUrl, cookies);
      const url = `${this.baseUrl}/home.php?mod=space&do=favorite&page=${page}`;
      const resp = await Network.get(url, this.getHeaders(url));
      const html = await this.getHtml(resp, "收藏列表");
      const comics = [];
      const regex = /<a[^>]+href="[^"]*kuid=(\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]+class="[^"]*manga-card-title[^"]*"[^>]*>([^<]+)<\/h3>/gi;
      let m;
      while ((m = regex.exec(html)) !== null && comics.length < 40) {
        const id = m[1].trim();
        const cover = m[2] ? m[2].trim() : "";
        let title = this.decodeHtmlEntities(m[3].trim()).replace(/\s+/g, " ");
        if (title.length > 2 && !/阅读|返回|榜单/.test(title)) {
          comics.push({ id, title, cover });
        }
      }
      if (comics.length === 0) {
        const doc = new HtmlDocument(html);
        const items = doc.querySelectorAll('.favorite-item, .myfavorite-item, .comic-item');
        for (const item of items) {
          const a = item.querySelector('a[href*="kuid"]');
          const img = item.querySelector('img');
          const titleEl = item.querySelector('.title, h3, .comic-title');
          if (!a) continue;
          const id = a.attributes.href.match(/kuid=(\d+)/)?.[1] || "";
          const cover = img?.attributes.src || img?.attributes['data-src'] || "";
          const title = titleEl ? titleEl.text.trim() : "";
          if (id && title) comics.push({ id, title, cover });
        }
        doc.dispose();
      }
      const maxPage = comics.length > 0 ? page + 1 : page;
      return { comics, maxPage };
    }
  }

  // ========== 分类（标题已改为“zero搬运网”） ==========
  category = {
    title: "zero搬运网",   // 修改此处
    parts: [{
        name: "主题",
        type: "fixed",
        itemType: "category",
        categories: ["全部", "卖肉", "后宫", "冒险", "奇幻", "搞笑", "日常", "职业", "体育", "战斗", "爱情", "机甲", "悬疑", "美食", "百合"],
        categoryParams: ["", "&category_id=1", "&category_id=6", "&category_id=22", "&category_id=23", "&category_id=13", "&category_id=28", "&category_id=35", "&category_id=29", "&category_id=15", "&category_id=31", "&category_id=34", "&category_id=40", "&category_id=41", "&category_id=42"]
      },
      {
        name: "进度",
        type: "fixed",
        itemType: "category",
        categories: ["连载中", "已完结"],
        categoryParams: ["&jindu=0", "&jindu=1"]
      },
      {
        name: "性质",
        type: "fixed",
        itemType: "category",
        categories: ["一半中文一半生肉", "全生肉", "全中文"],
        categoryParams: ["&shuxing=%E4%B8%80%E5%8D%8A%E4%B8%AD%E6%96%87%E4%B8%80%E5%8D%8A%E7%94%9F%E8%82%89", "&shuxing=%E5%85%A8%E7%94%9F%E8%82%89", "&shuxing=%E5%85%A8%E4%B8%AD%E6%96%87"]
      }
    ]
  }

  categoryComics = {
    load: async (category, param, options, page) => {
      let url = `${this.baseUrl}/pc/pc/?page=${page}`
      if (param) url += param
      try {
        const resp = await Network.get(url, { headers: this.getHeaders() })
        const html = await this.getHtml(resp, "分类页")
        const comics = []
        const regex = /<a[^>]+href="[^"]*kuid=(\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]+class="[^"]*manga-card-title[^"]*"[^>]*>([^<]+)<\/h3>/gi
        let m
        while ((m = regex.exec(html)) !== null && comics.length < 40) {
          const id = m[1].trim()
          const cover = m[2] ? m[2].trim() : ""
          let title = this.decodeHtmlEntities(m[3].trim()).replace(/\s+/g, " ")
          if (title.length > 2 && !/阅读|返回|榜单/.test(title)) {
            comics.push({ id, title, cover })
          }
        }
        return { comics }
      } catch (e) {
        return { comics: [] }
      }
    }
  }

  // ========== 发现页（标题已改为“zero搬运网”） ==========
  explore = [{
    title: "zero搬运网",   // 修改此处
    type: "multiPageComicList",
    load: async (page) => {
      const url = `${this.baseUrl}/pc/pc/?page=${page}`
      try {
        const resp = await Network.get(url, { headers: this.getHeaders() })
        const html = await this.getHtml(resp, "发现页")
        const comics = []
        const regex = /<a[^>]+href="[^"]*kuid=(\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]+class="[^"]*manga-card-title[^"]*"[^>]*>([^<]+)<\/h3>/gi
        let m
        while ((m = regex.exec(html)) !== null && comics.length < 40) {
          const id = m[1].trim()
          const cover = m[2] ? m[2].trim() : ""
          let title = this.decodeHtmlEntities(m[3].trim()).replace(/\s+/g, " ")
          if (title.length > 2 && !/阅读|返回|榜单/.test(title)) {
            comics.push({ id, title, cover })
          }
        }
        return { comics }
      } catch (e) {
        return { comics: [] }
      }
    }
  }]

  // ========== 搜索 ==========
  search = {
    load: async (keyword, options, page) => {
      if (!keyword?.trim()) return { comics: [] }
      const url = `${this.baseUrl}/pc/pc/?keyword=${encodeURIComponent(keyword)}&page=${page}`
      return Network.get(url, { headers: this.getHeaders() }).then(async (resp) => {
        const html = await this.getHtml(resp)
        const comics = []
        const regex = /<a[^>]+href="[^"]*kuid=(\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]+class="[^"]*manga-card-title[^"]*"[^>]*>([^<]+)<\/h3>/gi
        let m
        while ((m = regex.exec(html)) !== null && comics.length < 40) {
          const id = m[1].trim()
          const cover = m[2] ? m[2].trim() : ""
          let title = this.decodeHtmlEntities(m[3].trim()).replace(/\s+/g, " ")
          if (title.length > 2 && !/阅读|返回|榜单/.test(title)) {
            comics.push({ id, title, cover })
          }
        }
        return { comics }
      }).catch(() => ({ comics: [] }))
    }
  }

  // ========== 漫画详情 ==========
  comic = {
    loadInfo: async (id) => {
      const url = `${this.baseUrl}/pc/details/?kuid=${id}`
      await this.account.isLoggedIn()
      return Network.get(url, { headers: this.getHeaders(this.baseUrl) }).then(async (resp) => {
        const html = await this.getHtml(resp, "详情页")
        let title = "未知标题"
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
        if (titleMatch) {
          title = this.decodeHtmlEntities(titleMatch[1].trim())
          title = title.replace(/\s*-\s*zero.*?$/i, "").trim()
        }
        if (title === "未知标题" || !title) {
          const titleFromH1 = html.match(/<h1[^>]*class="[^"]*text-gray-800[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
          if (titleFromH1) title = this.decodeHtmlEntities(titleFromH1[1].trim()).replace(/\s+/g, " ")
        }
        const coverMatch = html.match(/src="(http[^"]*tupa\.zerobyw33\.com[^"]*)"/)
        const cover = coverMatch ? coverMatch[1] : ""
        const tags = {}
        const authorMatch = html.match(/作者[:：]\s*([^\s<【】]+)/)
        if (authorMatch) tags["作者"] = [authorMatch[1].trim()]
        const catMatch = html.match(/(搞笑|日常|卖肉|后宫|冒险|奇幻|职业|体育|战斗|爱情|机甲|悬疑|美食|百合)/g)
        if (catMatch) tags["分类"] = [...new Set(catMatch)]
        const shuxingMatch = html.match(/(一半中文一半生肉|全生肉|全中文)/)
        if (shuxingMatch) tags["性质"] = [shuxingMatch[1]]
        const statusMatch = html.match(/(已完结|连载中)/)
        if (statusMatch) tags["状态"] = [statusMatch[1]]
        let description = "暂无简介"
        const summaryTextMatch = html.match(/<p[^>]+x-ref\s*=\s*["']summaryText["'][^>]*>([\s\S]*?)<\/p>/i)
        if (summaryTextMatch) {
          description = this.decodeHtmlEntities(summaryTextMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
        }
        if (!description || description === "暂无简介") {
          const pTags = html.matchAll(/<p[^>]*>([\s\S]{5,300})<\/p>/gi)
          for (const match of pTags) {
            const text = this.decodeHtmlEntities(match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
            if (text.length > 5 && !/(话|卷|作者|分类|状态|性质|人气|收藏|阅读|下载|生肉)/.test(text)) {
              description = text
              break
            }
          }
        }
        const eps = []
        const chapterRegex = /<a[^>]+href="[^"]*zjid=(\d+)[^>]*>([\s\S]{1,40})<\/a>/gi
        let match
        while ((match = chapterRegex.exec(html)) !== null) {
          const zjid = match[1].trim()
          let t = this.decodeHtmlEntities(match[2].trim().replace(/\s+/g, " ").replace(/&nbsp;/g, ""))
          if (!/阅读|查看|收藏|下载/.test(t) && !eps.some(e => e.id === zjid)) {
            eps.push({ id: zjid, title: t })
          }
        }
        if (eps.length === 0) {
          const ids = new Set()
          let m
          const idRe = /zjid=(\d+)/g
          while ((m = idRe.exec(html)) !== null) ids.add(m[1])
          Array.from(ids).sort((a, b) => parseInt(a) - parseInt(b)).forEach((id, i) => {
            eps.push({ id, title: `第${i}话` })
          })
        }
        this.currentEpMap = {}
        eps.forEach((ep, i) => { this.currentEpMap[i.toString()] = ep.id })
        const chapters = {}
        eps.forEach((ep, i) => { chapters[i.toString()] = ep.title })

        const detailUrl = `${this.baseUrl}/pc/details/?kuid=${id}`

        return {
          title,
          cover,
          description,
          tags,
          chapters,
          url: detailUrl
        }
      })
    },

    loadComments: async (comicId, subId, page, replyTo) => {
      const url = `${this.baseUrl}/pc/details/?kuid=${comicId}`;
      try {
        const resp = await Network.get(url, { headers: this.getHeaders(this.baseUrl) });
        const html = await this.getHtml(resp, "评论页");
        const comments = [];
        const itemReg = /<div class="flex gap-4">[\s\S]+?<\/div>\s*<\/div>/g;
        let singleItem;
        while ((singleItem = itemReg.exec(html)) !== null) {
          const block = singleItem[0];
          const avatarReg = /<img\s+[^>]*src\s*=\s*["']([^"']+)["']/i;
          const avatarMatch = block.match(avatarReg);
          let avatar = "";
          if (avatarMatch) {
            let rawAvatar = avatarMatch[1].trim();
            if (rawAvatar.startsWith("/")) rawAvatar = this.baseUrl + rawAvatar;
            if (!rawAvatar.toLowerCase().endsWith(".svg")) avatar = rawAvatar;
          }
          const nameMatch = block.match(/<span class="font-bold">([^<]+)<\/span>/);
          const userName = nameMatch ? this.decodeHtmlEntities(nameMatch[1].trim()) : "";
          const timeMatch = block.match(/<span[^>]+class="[^"]*text-gray-400[^"]*"[^>]*>([\s\S]*?)<\/span>/);
          let time = timeMatch ? this.decodeHtmlEntities(timeMatch[1].trim()) : "";
          time = time.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim();
          const contentMatch = block.match(/<p[^>]+class="[^"]*text-sm[^"]*text-gray-700[^"]*"[^>]*>([\s\S]*?)<\/p>/);
          const content = contentMatch ? this.decodeHtmlEntities(contentMatch[1].trim().replace(/<br>/g, "\n")) : "";
          if (userName.includes("${pl.") || content.includes("${pl.") || time.includes("${pl.")) continue;
          comments.push({ id: String(comments.length + 1), userName, avatar, content, time, replyCount: null });
        }
        return { comments, maxPage: 1 };
      } catch (err) {
        return { comments: [], maxPage: 0 };
      }
    },

    onClickTag: (namespace, tag) => {
      const catMap = {
        "搞笑": "&category_id=13", "日常": "&category_id=28", "卖肉": "&category_id=1",
        "后宫": "&category_id=6", "冒险": "&category_id=22", "奇幻": "&category_id=23",
        "职业": "&category_id=35", "体育": "&category_id=29", "战斗": "&category_id=15",
        "爱情": "&category_id=31", "机甲": "&category_id=34", "悬疑": "&category_id=40",
        "美食": "&category_id=41", "百合": "&category_id=42"
      }
      const sxMap = {
        "一半中文一半生肉": "&shuxing=%E4%B8%80%E5%8D%8A%E4%B8%AD%E6%96%87%E4%B8%80%E5%8D%8A%E7%94%9F%E8%82%89",
        "全生肉": "&shuxing=%E5%85%A8%E7%94%9F%E8%82%89",
        "全中文": "&shuxing=%E5%85%A8%E4%B8%AD%E6%96%87"
      }
      const jdMap = { "连载中": "&jindu=0", "已完结": "&jindu=1" }
      if (namespace === "作者") return { action: "search", keyword: tag }
      if (namespace === "分类") return { action: "category", keyword: tag, param: catMap[tag] || "" }
      if (namespace === "性质") return { action: "category", keyword: tag, param: sxMap[tag] || "" }
      if (namespace === "状态") return { action: "category", keyword: tag, param: jdMap[tag] || "" }
      return { action: "search", keyword: tag }
    },

    loadEp: async (comicId, epId) => {
      const realZjid = this.currentEpMap[epId] || epId
      const url = `${this.baseUrl}/pc/view/index.php?zjid=${realZjid}`
      try {
        const resp = await Network.get(url, { headers: this.getHeaders(url) })
        const html = await this.getHtml(resp, "阅读页")
        const images = []
        const rl = [
          /src="((?:https?:)?\/\/tupa\.zerobyw33\.com[^"]+)"/g,
          /data-original="((?:https?:)?\/\/tupa\.zerobyw33\.com[^"]+)"/g,
          /data-src="((?:https?:)?\/\/tupa\.zerobyw33\.com[^"]+)"/g
        ]
        for (const re of rl) {
          let m
          while ((m = re.exec(html)) !== null) {
            let imgUrl = m[1]
            if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl
            images.push(imgUrl)
          }
        }
        return { images: [...new Set(images)] }
      } catch (e) {
        return { images: [] }
      }
    },

    link: {
      domains: ['www.zerobyw33.com'],
      linkToId: (url) => {
        const match = String(url || "").match(/[?&]kuid=(\d+)/);
        return match ? match[1] : null;
      }
    },
    idMatch: "^\\d+$"
  }
}