class Zerobyw extends ComicSource {
  name = "zero搬运网"
  key = "zerobyw"
  version = "1.0.0"
  minAppVersion = "1.0.0"
  baseUrl = "https://www.zerobyw33.com"
  url = "https://cdn.jsdmirror.cn/gh/NinEvandesu/venera-configs@main/zero.js"
  currentEpMap = {}
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
  account = {
    loginWithWebview: {
      url: "https://www.zerobyw33.com/member.php?mod=logging&action=login",
      checkStatus: (url, title) => url.includes("home.php") || title.includes("个人中心") || !url.includes("logging"),
      onLoginSuccess: () => {}
    },
    isLoggedIn: async () => {
      try {
        const resp = await Network.get(`${this.baseUrl}/home.php?mod=space&do=profile`, {
          headers: this.getHeaders()
        })
        const html = await this.getHtml(resp, "检查登录")
        return html.includes("退出") || html.includes("我的中心") || !html.includes("请先登录")
      } catch (e) {
        return false
      }
    },
    logout: () => {},
    registerWebsite: "https://www.zerobyw33.com/member.php?mod=register"
  }
  category = {
    title: "Zero",
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
        const resp = await Network.get(url, {
          headers: this.getHeaders()
        })
        const html = await this.getHtml(resp, "分类页")
        const comics = []
        const regex = /<a[^>]+href="[^"]*kuid=(\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]+class="[^"]*manga-card-title[^"]*"[^>]*>([^<]+)<\/h3>/gi
        let m
        while ((m = regex.exec(html)) !== null && comics.length < 40) {
          const id = m[1].trim()
          const cover = m[2] ? m[2].trim() : ""
          let title = this.decodeHtmlEntities(m[3].trim()).replace(/\s+/g, " ")
          if (title.length > 2 && !/阅读|返回|榜单/.test(title)) {
            comics.push({
              id,
              title,
              cover
            })
          }
        }
        return {
          comics
        }
      } catch (e) {
        return {
          comics: []
        }
      }
    }
  }
  explore = [{
    title: "Zero",
    type: "multiPageComicList",
    load: async (page) => {
      const url = `${this.baseUrl}/pc/pc/?page=${page}`
      try {
        const resp = await Network.get(url, {
          headers: this.getHeaders()
        })
        const html = await this.getHtml(resp, "发现页")
        const comics = []
        const regex = /<a[^>]+href="[^"]*kuid=(\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]+class="[^"]*manga-card-title[^"]*"[^>]*>([^<]+)<\/h3>/gi
        let m
        while ((m = regex.exec(html)) !== null && comics.length < 40) {
          const id = m[1].trim()
          const cover = m[2] ? m[2].trim() : ""
          let title = this.decodeHtmlEntities(m[3].trim()).replace(/\s+/g, " ")
          if (title.length > 2 && !/阅读|返回|榜单/.test(title)) {
            comics.push({
              id,
              title,
              cover
            })
          }
        }
        return {
          comics
        }
      } catch (e) {
        return {
          comics: []
        }
      }
    }
  }]
  comic = {
    loadInfo: async (id) => {
      const url = `${this.baseUrl}/pc/details/?kuid=${id}`
      await this.account.isLoggedIn()
      return Network.get(url, {
        headers: this.getHeaders(this.baseUrl)
      }).then(async (resp) => {
        const html = await this.getHtml(resp, "详情页")
        // ====================== 标题抓取（新版修复） ======================
        let title = "未知标题"
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
        if (titleMatch) {
          title = this.decodeHtmlEntities(titleMatch[1].trim())
          title = title.replace(/\s*-\s*zero.*?$/i, "").trim()
        }
        if (title === "未知标题" || !title) {
          const titleFromH1 = html.match(/<h1[^>]*class="[^"]*text-gray-800[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
          const titleFromH3 = html.match(/<h3[^>]+class="[^"]*manga-card-title[^"]*"[^>]*>([^<]+)<\/h3>/i)
          if (titleFromH1) {
            title = this.decodeHtmlEntities(titleFromH1[1].trim()).replace(/\s+/g, " ")
          } else if (titleFromH3) {
            title = this.decodeHtmlEntities(titleFromH1[1].trim()).replace(/\s+/g, " ")
          }
        }
        // =================================================================
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
        // ====================== 描述抓取（直接命中 x-ref="summaryText"） ======================
        let description = "暂无简介"
        const summaryTextMatch = html.match(/<p[^>]+x-ref\s*=\s*["']summaryText["'][^>]*>([\s\S]*?)<\/p>/i)
        if (summaryTextMatch) {
          description = this.decodeHtmlEntities(summaryTextMatch[1]
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim())
        }
        if (!description || description === "暂无简介") {
          const pTags = html.matchAll(/<p[^>]*>([\s\S]{5,300})<\/p>/gi)
          for (const match of pTags) {
            const text = this.decodeHtmlEntities(match[1]
              .replace(/<[^>]+>/g, "")
              .replace(/\s+/g, " ")
              .trim())
            if (text.length > 5 &&
              !/(话|卷|作者|分类|状态|性质|人气|收藏|阅读|下载|生肉)/.test(text)) {
              description = text
              break
            }
          }
        }
        // ==================================================================================
        const eps = []
        const chapterRegex = /<a[^>]+href="[^"]*zjid=(\d+)[^>]*>([\s\S]{1,40})<\/a>/gi
        let match
        while ((match = chapterRegex.exec(html)) !== null) {
          const zjid = match[1].trim()
          let t = this.decodeHtmlEntities(match[2].trim().replace(/\s+/g, " ").replace(/&nbsp;/g, ""))
          if (!/阅读|查看|收藏|下载/.test(t) && !eps.some(e => e.id === zjid)) {
            eps.push({
              id: zjid,
              title: t
            })
          }
        }
        if (eps.length === 0) {
          const ids = new Set()
          let m
          const idRe = /zjid=(\d+)/g
          while ((m = idRe.exec(html)) !== null) ids.add(m[1])
          Array.from(ids).sort((a, b) => parseInt(a) - parseInt(b)).forEach((id, i) => {
            eps.push({
              id,
              title: `第${i}话`
            })
          })
        }
        this.currentEpMap = {}
        eps.forEach((ep, i) => {
          this.currentEpMap[i.toString()] = ep.id
        })
        const result = {
          title,
          cover,
          description,
          episodes: eps,
          chapters: {},
          tags
        }
        eps.forEach((ep, i) => {
          result.chapters[i.toString()] = ep.title
        })
        return result
      })
    },
    loadComments: async (comicId, subId, page, replyTo) => {
      const url = `${this.baseUrl}/pc/details/?kuid=${comicId}`;
      try {
        const resp = await Network.get(url, {
          headers: this.getHeaders(this.baseUrl)
        });
        const html = await this.getHtml(resp, "评论页");
        const comments = [];
        const itemReg = /<div class="flex gap-4">[\s\S]+?<\/div>\s*<\/div>/g;
        let singleItem;
        let index = 0;
        while ((singleItem = itemReg.exec(html)) !== null) {
          index++;
          const block = singleItem[0];
          // 通用匹配评论块内所有img标签
          const avatarReg = /<img\s+[^>]*src\s*=\s*["']([^"']+)["']/i;
          const avatarMatch = block.match(avatarReg);
          let avatar = "";
          if (avatarMatch) {
            let rawAvatar = avatarMatch[1].trim();
            // 补全相对路径
            if (rawAvatar.startsWith("/")) {
              rawAvatar = this.baseUrl + rawAvatar;
            }
            // 过滤SVG格式的默认头像，直接置空让APP显示默认头像
            if (rawAvatar.toLowerCase().endsWith(".svg")) {
              avatar = "";
            } else {
              avatar = rawAvatar;
            }
          }
          // 用户名解析
          const nameMatch = block.match(/<span class="font-bold">([^<]+)<\/span>/);
          const userName = nameMatch ? this.decodeHtmlEntities(nameMatch[1].trim()) : "";
          // 时间解析 + 清理HTML标签
          const timeMatch = block.match(/<span[^>]+class="[^"]*text-gray-400[^"]*"[^>]*>([\s\S]*?)<\/span>/);
          let time = timeMatch ? this.decodeHtmlEntities(timeMatch[1].trim()) : "";
          time = time.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, "").trim();
          // 评论内容解析
          const contentMatch = block.match(/<p[^>]+class="[^"]*text-sm[^"]*text-gray-700[^"]*"[^>]*>([\s\S]*?)<\/p>/);
          const content = contentMatch ? this.decodeHtmlEntities(contentMatch[1].trim().replace(/<br>/g, "\n")) : "";
          // 过滤Vue模板假评论
          if (userName.includes("${pl.") || content.includes("${pl.") || time.includes("${pl.")) {
            continue;
          }
          comments.push({
            id: String(comments.length + 1),
            userName,
            avatar,
            content,
            time,
            replyCount: null
          });
        }
        return {
          comments,
          maxPage: 1
        };
      } catch (err) {
        console.log(`[Zero评论日志] 解析异常: ${err.message}`);
        return {
          comments: [],
          maxPage: 0
        };
      }
    },
    onClickTag: (namespace, tag) => {
      const catMap = {
        "搞笑": "&category_id=13",
        "日常": "&category_id=28",
        "卖肉": "&category_id=1",
        "后宫": "&category_id=6",
        "冒险": "&category_id=22",
        "奇幻": "&category_id=23",
        "职业": "&category_id=35",
        "体育": "&category_id=29",
        "战斗": "&category_id=15",
        "爱情": "&category_id=31",
        "机甲": "&category_id=34",
        "悬疑": "&category_id=40",
        "美食": "&category_id=41",
        "百合": "&category_id=42"
      }
      const sxMap = {
        "一半中文一半生肉": "&shuxing=%E4%B8%80%E5%8D%8A%E4%B8%AD%E6%96%87%E4%B8%80%E5%8D%8A%E7%94%9F%E8%82%89",
        "全生肉": "&shuxing=%E5%85%A8%E7%94%9F%E8%82%89",
        "全中文": "&shuxing=%E5%85%A8%E4%B8%AD%E6%96%87"
      }
      const jdMap = {
        "连载中": "&jindu=0",
        "已完结": "&jindu=1"
      }
      if (namespace === "作者") return {
        action: "search",
        keyword: tag
      }
      if (namespace === "分类") return {
        action: "category",
        keyword: tag,
        param: catMap[tag] || ""
      }
      if (namespace === "性质") return {
        action: "category",
        keyword: tag,
        param: sxMap[tag] || ""
      }
      if (namespace === "状态") return {
        action: "category",
        keyword: tag,
        param: jdMap[tag] || ""
      }
      return {
        action: "search",
        keyword: tag
      }
    },
    loadEp: async (comicId, epId) => {
      const realZjid = this.currentEpMap[epId] || epId
      const url = `${this.baseUrl}/pc/view/index.php?zjid=${realZjid}`
      try {
        const resp = await Network.get(url, {
          headers: this.getHeaders(url)
        })
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
            if (imgUrl.startsWith("//")) {
              imgUrl = "https:" + imgUrl
            }
            images.push(imgUrl)
          }
        }
        const imgList = [...new Set(images)]
        return {
          images: imgList
        }
      } catch (e) {
        return {
          images: []
        }
      }
    }
  }
  search = {
    load: async (keyword, options, page) => {
      if (!keyword?.trim()) return {
        comics: []
      }
      const url = `${this.baseUrl}/pc/pc/?keyword=${encodeURIComponent(keyword)}&page=${page}`
      return Network.get(url, {
        headers: this.getHeaders()
      }).then(async (resp) => {
        const html = await this.getHtml(resp)
        const comics = []
        const regex = /<a[^>]+href="[^"]*kuid=(\d+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]+class="[^"]*manga-card-title[^"]*"[^>]*>([^<]+)<\/h3>/gi
        let m
        while ((m = regex.exec(html)) !== null && comics.length < 40) {
          const id = m[1].trim()
          const cover = m[2] ? m[2].trim() : ""
          let title = this.decodeHtmlEntities(m[3].trim()).replace(/\s+/g, " ")
          if (title.length > 2 && !/阅读|返回|榜单/.test(title)) {
            comics.push({
              id,
              title,
              cover
            })
          }
        }
        return {
          comics
        }
      }).catch(() => {
        return {
          comics: []
        }
      })
    }
  }
}
