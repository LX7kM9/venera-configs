class ComicWalker extends ComicSource {
  name = "カドコミ";
  key = "comic_walker";
  version = "1.3.2";   // 增强 ID 提取，修复链接解析
  minAppVersion = "1.6.0";
  url =
    "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/index.json";

  api_key = "ytBrdQ2ZYdRQguqEusVLxQVUgakNnVht";
  latestVersion = "2.1.0";
  api_base = "https://mobileapp.comic-walker.com";

  // 根级方法（避免框架报错）
  onTagSuggestionSelected = () => {};

  // ========== 请求头 ==========
  get headers() {
    const headers = {
      "X-API-Environment-Key": this.api_key,
      "User-Agent": `BookWalkerApp/${this.latestVersion} (Android 13; en_US; Phone; com.bookwalker)`,
      "Host": "mobileapp.comic-walker.com",
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    const token = this.loadData("token");
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  // ========== 刷新 Token ==========
  async refreshToken() {
    const res = await this.request(
      `${this.api_base}/v1/users`,
      this.headers,
      "POST",
      {}
    );
    if (res && res.resources && res.resources.access_token) {
      this.saveData("token", res.resources.access_token);
      return res.resources.access_token;
    }
    throw new Error("Failed to get access token");
  }

  // ========== 统一请求方法 ==========
  async request(url, headers, method = "GET", data) {
    let response;
    try {
      if (method === "GET") {
        response = await Network.get(url, headers);
      } else if (method === "POST") {
        response = await Network.post(url, headers, data);
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }
    } catch (e) {
      throw e;
    }

    if (response.status !== 200 && response.status !== 204) {
      throw new Error(`HTTP ${response.status}: ${response.body || "No body"}`);
    }
    if (response.status === 204) {
      return response;
    }

    let json;
    try {
      json = JSON.parse(response.body);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${response.body.substring(0, 100)}`);
    }

    if (
      json.code === "invalid_request_parameter" ||
      json.code === "free_daily_reward_quota_exceeded" ||
      json.code === "unauthorized"
    ) {
      await this.refreshToken();
      const newHeaders = { ...headers, ...this.headers };
      let retryResponse;
      if (method === "GET") {
        retryResponse = await Network.get(url, newHeaders);
      } else if (method === "POST") {
        retryResponse = await Network.post(url, newHeaders, data);
      }
      if (retryResponse.status !== 200 && retryResponse.status !== 204) {
        throw new Error(`Retry failed with status ${retryResponse.status}`);
      }
      if (retryResponse.status === 204) return retryResponse;
      try {
        json = JSON.parse(retryResponse.body);
      } catch (e) {
        throw new Error(`Retry invalid JSON: ${retryResponse.body.substring(0, 100)}`);
      }
    }
    return json;
  }

  // ========== 初始化（获取应用版本） ==========
  async init() {
    const itunes_api = "https://itunes.apple.com/lookup?bundleId=jp.co.bookwalker.cwapp.ios&country=jp";
    const fallbackVersion = "2.1.0";

    try {
      const resp = await fetch(itunes_api);
      if (resp.ok) {
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
          this.latestVersion = data.results[0].version;
          console.log(`[ComicWalker] 获取到最新版本: ${this.latestVersion}`);
        } else {
          throw new Error("No results in iTunes response");
        }
      } else {
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (e) {
      console.warn(`[ComicWalker] 获取版本失败，使用备用版本: ${fallbackVersion}`, e.message);
      this.latestVersion = fallbackVersion;
    }

    try {
      await this.refreshToken();
    } catch (e) {
      console.warn("[ComicWalker] 刷新 token 失败:", e.message);
    }
  }

  // ========== 辅助方法：获取详情页 HTML 并提取数字 ID ==========
  _fetchDetailPage(id) {
    const url = `https://comic-walker.com/detail/${id}`;
    return Network.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
  }

  // 增强 ID 提取，支持多种模式，优先提取 UUID 或数字 ID
  _extractComicId(html) {
    // 尝试多种模式提取 UUID 或数字 ID
    const patterns = [
      /"comic_id"\s*:\s*"([0-9a-f-]+)"/i,
      /"id"\s*:\s*"([0-9a-f-]+)"/i,
      /"comicId"\s*:\s*"([0-9a-f-]+)"/i,
      /"comic_id":"([0-9a-f-]+)"/,
      /"id":"([0-9a-f-]+)"/,
      /data-comic-id="([0-9a-f-]+)"/i,
      /comicId\s*=\s*['"]([0-9a-f-]+)['"]/i,
      // 也尝试匹配纯数字 ID（如果有）
      /"comic_id":"(\d+)"/,
      /"id":(\d+)/
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const extracted = match[1];
        // 验证提取的 ID 是否为有效格式（UUID 或数字）
        if (/^[0-9a-f-]+$/.test(extracted) || /^\d+$/.test(extracted)) {
          console.log(`[ComicWalker] _extractComicId 匹配到: ${extracted}`);
          return extracted;
        }
      }
    }
    console.warn('[ComicWalker] _extractComicId 未匹配到任何 ID');
    return null;
  }

  // ========== Explore ==========
  explore = [
    {
      title: "カドコミ",
      type: "singlePageWithMultiPart",
      load: async () => {
        const res = await this.request(
          `${this.api_base}/v2/screens/home`,
          this.headers,
        );

        const result = {};

        const newArrivals = res.resources.new_arrival_comics.map((item) =>
          new Comic({
            id: item.id,
            title: item.title,
            cover: item.thumbnail_1x1 || "",
            tags: item.comic_labels?.map((l) => l.name) || [],
          }),
        );
        result["今日の更新"] = newArrivals;

        const attention = res.resources.attention_comics.map((item) =>
          new Comic({
            id: item.comic_id,
            title: item.title,
            cover: item.image_url || "",
            tags: item.comic_labels?.map((l) => l.name) || [],
          }),
        );
        result["注目作品"] = attention;

        for (const pickup of res.resources.pickup_comics) {
            const comics = pickup.comics.map((item) =>
                new Comic({
                    id: item.id,
                    title: item.title,
                    cover: item.thumbnail_1x1 || "",
                    tags: item.comic_labels?.map((l) => l.name) || [],
                }),
            );
            result[pickup.name] = comics;
        }

        const newSerialization = res.resources.new_serialization_comics.map((item) =>
            new Comic({
                id: item.id,
                title: item.title,
                cover: item.thumbnail_1x1 || "",
                tags: item.comic_labels?.map((l) => l.name) || [],
            }),
        );
        result["新連載"] = newSerialization;

        return result;
      },
    },
  ];

  // ========== Search ==========
  search = {
    load: async (keyword, _, page) => {
      const res = await this.request(
        `${this.api_base}/v1/search/comics?keyword=${keyword}&limit=20&offset=${
          (page - 1) * 20
        }`,
        this.headers,
      );

      const comics = res.resources.map((item) =>
        new Comic({
          id: item.id,
          title: item.title,
          cover: item.thumbnail_1x1 || "",
          tags: [
            ...(item.authors?.map((a) => a.name) || []),
            ...(item.comic_labels?.map((l) => l.name) || []),
          ],
        })
      );
      const pageInfo = {
        hasNextPage: res.resources.length === 20,
        endCursor: null,
      };

      return {
        comics,
        maxPage: pageInfo.hasNextPage ? (page || 1) + 1 : (page || 1),
        endCursor: pageInfo.endCursor,
      };
    },
  };

  // ========== Comic ==========
  comic = {
    onTagSuggestionSelected: () => {},

    // ---------- 链接解析 ----------
    link: {
      domains: [
        'comic-walker.com'
      ],
      linkToId: (url) => {
        let match = url.match(/\/detail\/([^/?]+)/);
        if (match) return match[1];
        return null;
      }
    },

    idMatch: "^[A-Za-z0-9_]+$",

    // ---------- 加载详情（箭头函数，this 指向 ComicWalker 实例） ----------
    loadInfo: async (id) => {
      let realId = id;

      // 若 ID 为 KC_xxx 格式，尝试从网页提取数字 ID
      if (/^KC_\d+_[A-Z]$/.test(id)) {
        try {
          const response = await this._fetchDetailPage(id);
          if (response.status === 200) {
            const html = response.body;
            const extracted = this._extractComicId(html);
            if (extracted) {
              realId = extracted;
              console.log(`[ComicWalker] 从详情页提取到数字 ID: ${realId}`);
            } else {
              console.warn(`[ComicWalker] 无法从页面提取数字 ID，将使用原 ID: ${id}`);
            }
          } else {
            console.warn(`[ComicWalker] 获取详情页失败 (HTTP ${response.status})，将使用原 ID`);
          }
        } catch (e) {
          console.warn(`[ComicWalker] 获取详情页异常: ${e.message}，将使用原 ID`);
        }
      }

      // 使用 realId 请求 API
      const res = await this.request(
        `${this.api_base}/v2/screens/comics/${realId}`,
        this.headers,
      );
      const detail = res.resources.detail;

      const totalCount = res.resources.episode_total_count || 0;
      let episodes = { resources: [] };
      for (let offset = 0; offset < totalCount; offset += 100) {
        const chunk = await this.request(
          `${this.api_base}/v1/comics/${realId}/episodes?offset=${offset}&limit=100&sort=asc`,
          this.headers,
        );
        episodes.resources.push(...(chunk.resources || []));
      }

      const tags = new Map();

      if (detail.authors) {
        detail.authors.forEach((a) => {
          if (!tags.has(a.role)) tags.set(a.role, []);
          tags.get(a.role).push(a.name);
        });
      }

      if (detail.comic_labels) {
        detail.comic_labels.forEach((l) => {
          if (!tags.has("Labels")) tags.set("Labels", []);
          tags.get("Labels").push(l.name);
        });
      }

      if (detail.tags) {
        detail.tags.forEach((t) => {
          if (!tags.has(t.type)) tags.set(t.type, []);
          tags.get(t.type).push(t.name);
        });
      }

      const chapters = new Map();
      for (const ep of episodes.resources) {
        let canRent = false;
        const plans = (ep.plans || []).filter((plan) =>
          plan.type !== "paid"
        );
        if (Array.isArray(plans) && plans.length > 0) {
          canRent = true;
        }
        const title = canRent ? ep.title : `❌ ${ep.title}`;
        chapters.set(ep.id, title);
      }

      return new ComicDetails({
        title: detail.title,
        subtitle: detail.authors?.map((a) => a.name).join("・") || "",
        cover: detail.thumbnail_1x1 || "",
        description: detail.story?.replace(/<br\s*\/?>/gi, "\n") || "",
        tags,
        chapters,
        updateTime: detail.next_update_at,
        url: detail.share_url,
        maxPage: totalCount,
      });
    },

    // ---------- 加载章节 ----------
    loadEp: async (comicId, epId) => {
      let detail = await this.request(
        `${this.api_base}/v1/episodes/${epId}`,
        this.headers,
      );
      const plans = (detail.plans || []).filter((plan) =>
        plan.type !== "paid"
      );
      if (
        !Array.isArray(plans) ||
        plans.length === 0
      ) {
        throw new Error("No available rental plans after filtering");
      }
      const freePlan = plans.find((plan) => plan.type === "free");
      if (!freePlan) {
        const plan = plans[randomInt(0, plans.length - 1)];
        await this.request(
          `${this.api_base}/v1/users/me/rental_episodes`,
          this.headers,
          "POST",
          { episode_id: epId, reading_method: plan.type },
        );
      }
      let res = await this.request(
        `${this.api_base}/v1/screens/comics/${comicId}/episodes/${epId}/viewer`,
        this.headers,
      );
      const manuscripts = res.resources.manuscripts || [];
      return {
        images: manuscripts.map((m) =>
          `${m.drm_image_url}&drm_hash=${m.drm_hash}`
        ),
      };
    },

    // ---------- 图片加载处理 ----------
    onImageLoad: (url) => {
      if (!url || url.trim() === '') {
        return { url: '', headers: {} };
      }
      let drm_hash = null;
      let cleanUrl = url;
      const drmHashMatch = url.match(/[?&]drm_hash=([^&]+)/);
      if (drmHashMatch) {
        drm_hash = decodeURIComponent(drmHashMatch[1]);
        cleanUrl = url.replace(/([?&])drm_hash=[^&]+(&)?/, (match, p1, p2) => {
          if (p2) return p1;
          return "";
        }).replace(/[?&]$/, "");
      }
      cleanUrl = cleanUrl.replace(/([?&])weight=[^&]+(&)?/, (match, p1, p2) => {
        if (p2) return p1;
        return "";
      }).replace(/[?&]$/, "");
      cleanUrl = cleanUrl.replace(/([?&])height=[^&]+(&)?/, (match, p1, p2) => {
        if (p2) return p1;
        return "";
      }).replace(/[?&]$/, "");

      if (!drm_hash || drm_hash.length < 2) {
        return { url: cleanUrl, headers: this.headers };
      }
      var version = drm_hash.slice(0, 2);
      if (version !== "01") {
        throw new Error("Unsupported version: " + version);
      }
      var key_part = drm_hash.slice(2);
      if (key_part.length < 16) {
        throw new Error(
          "Key part must be 16 characters long (8 hex numbers)",
        );
      }
      var key = [];
      for (var i = 0; i < 8; i++) {
        key.push(parseInt(key_part.slice(i * 2, i * 2 + 2), 16));
      }

      const keyArray = key;
      const onResponseScript = `
        function onResponse(buffer) {
          var key = [${keyArray.join(',')}];
          var view = new Uint8Array(buffer);
          for (var i = 0; i < view.length; i++) {
            view[i] ^= key[i % key.length];
          }
          return buffer;
        }
        onResponse;
      `;
      return {
        url: cleanUrl,
        headers: this.headers,
        onResponse: async (buffer) => {
          return await compute(onResponseScript, buffer);
        }
      };
    },

    // ---------- Tag 点击跳转 ----------
    onClickTag: (namespace, tag) => {
      if (
        namespace === "漫画" || namespace === "原作" ||
        namespace === "キャラクター原案" || namespace === "著者"
      ) {
        return {
          action: "search",
          keyword: tag,
          param: null,
        };
      }
      throw "未支持此类Tag检索";
    },
  };
}