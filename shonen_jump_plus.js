class ShonenJumpPlus extends ComicSource {
  name = "少年ジャンプ＋";
  key = "shonen_jump_plus";
  version = "1.3.1"; // 修复空封面和空章节崩溃
  minAppVersion = "1.2.1";
  url =
    "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/shonen_jump_plus.js";

  deviceId = this.generateDeviceId();
  bearerToken = null;
  userAccountId = null;
  tokenExpiry = 0;
  latestVersion = "4.3.0";
  _retryCount = 0;
  _fetchingToken = null;

  // ========== UA 池 ==========
  _fallbackUAPool = [
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  ];
  _uaPool = this._fallbackUAPool.slice();
  _uaPoolLoadedAt = 0;
  _currentUA = null;

  _uaPoolSources = [
    "https://cdn.jsdelivr.net/gh/microlinkhq/top-user-agents@master/src/index.json",
    "https://raw.githubusercontent.com/microlinkhq/top-user-agents/master/src/index.json",
  ];
  _uaPoolTTL = 24 * 60 * 60 * 1000;

  get headers() {
    const ua = this._getCurrentUA();
    return {
      Origin: "https://shonenjumpplus.com",
      Referer: "https://shonenjumpplus.com/",
      "X-Giga-Device-Id": this.deviceId,
      "User-Agent": ua,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
    };
  }

  apiBase = `https://shonenjumpplus.com/api/v1`;

  _getCurrentUA() {
    if (!this._currentUA) {
      this._currentUA = this._pickRandomUA();
    }
    return this._currentUA;
  }

  _pickRandomUA() {
    const pool =
      this._uaPool && this._uaPool.length > 0
        ? this._uaPool
        : this._fallbackUAPool;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _rotateUA() {
    this._currentUA = this._pickRandomUA();
    console.log(`[ShonenJumpPlus] 切换 UA: ${this._currentUA}`);
  }

  async _loadUAPool() {
    const now = Date.now();
    if (this._uaPoolLoadedAt > 0 && now - this._uaPoolLoadedAt < this._uaPoolTTL) {
      return;
    }

    for (const url of this._uaPoolSources) {
      try {
        const resp = await Network.get(url, {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
        });
        if (resp.status !== 200) continue;

        const data = JSON.parse(resp.body);
        let list = [];
        if (Array.isArray(data)) {
          list = data;
        } else if (data && Array.isArray(data.userAgents)) {
          list = data.userAgents;
        } else if (data && Array.isArray(data.data)) {
          list = data.data;
        }

        list = list
          .filter(
            (ua) =>
              typeof ua === "string" &&
              ua.length > 30 &&
              /Mozilla\/5\.0/.test(ua) &&
              !/bot|crawler|spider|curl|wget|python|java|okhttp/i.test(ua),
          )
          .slice(0, 200);

        if (list.length >= 5) {
          this._uaPool = list;
          this._uaPoolLoadedAt = now;
          console.log(`[ShonenJumpPlus] UA 池已更新，共 ${list.length} 条`);
          return;
        }
      } catch (e) {
        console.warn(`[ShonenJumpPlus] 加载 UA 池失败: ${e.message}`);
      }
    }

    this._uaPoolLoadedAt = now;
    console.warn("[ShonenJumpPlus] UA 池更新失败，使用兜底池");
  }

  generateDeviceId() {
    let result = "";
    const chars = "0123456789abcdef";
    for (let i = 0; i < 16; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.floor(ms)));
  }

  async init() {
    try {
      await this._loadUAPool();
    } catch (e) {
      console.warn("[ShonenJumpPlus] init 加载 UA 池异常:", e);
    }

    try {
      const url = "https://itunes.apple.com/jp/lookup?id=875750302";
      const resp = await Network.get(url, {
        "User-Agent": this._pickRandomUA(),
      });
      if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
      const data = JSON.parse(resp.body);
      if (data.results && data.results.length > 0) {
        const version = data.results[0].version;
        if (version) {
          this.latestVersion = version;
          console.log(`[ShonenJumpPlus] 获取到最新版本: ${version}`);
          return;
        }
      }
      throw new Error("无法从 iTunes 解析版本号");
    } catch (e) {
      console.warn("[ShonenJumpPlus] 获取版本失败，使用备用版本", e);
    }
  }

  explore = [
    {
      title: "少年ジャンプ＋",
      type: "singlePageWithMultiPart",
      load: async () => {
        await this.ensureAuth();
        const result = {};

        try {
          const response = await this.graphqlRequest("HomeCacheable", {});

          if (response && response.data && response.data.homeSections) {
            const sections = response.data.homeSections;
            const dailyRankingSection = sections.find(
              (section) => section.__typename === "DailyRankingSection",
            );

            if (dailyRankingSection && dailyRankingSection.dailyRankings) {
              const dailyRanking = dailyRankingSection.dailyRankings.find(
                (ranking) =>
                  ranking.ranking &&
                  ranking.ranking.__typename === "DailyRanking",
              );

              if (
                dailyRanking &&
                dailyRanking.ranking &&
                dailyRanking.ranking.items &&
                dailyRanking.ranking.items.edges
              ) {
                const rankingItems = dailyRanking.ranking.items.edges
                  .map((edge) => edge.node)
                  .filter(
                    (node) =>
                      node.__typename === "DailyRankingValidItem" &&
                      node.product,
                  );

                const parseComic = (item) => {
                  const series = item.product.series;
                  if (!series) return null;
                  const cover =
                    series.squareThumbnailUriTemplate ||
                    series.horizontalThumbnailUriTemplate;
                  return {
                    id: series.databaseId,
                    title: series.title || "",
                    cover: this.replaceCoverUrl(cover),
                    tags: [],
                    description: `Ranking: ${item.rank} · Views: ${
                      item.viewCount || "Unknown"
                    }`,
                  };
                };

                const comics = rankingItems
                  .map(parseComic)
                  .filter((comic) => comic !== null);

                if (comics.length > 0) {
                  result["Daily Ranking"] = comics;
                }
              }
            }
          }
        } catch (e) {
          console.warn("[ShonenJumpPlus] HomeCacheable 失败，回退到搜索:", e);
        }

        if (Object.keys(result).length === 0) {
          // 优化回退关键词，避免搜出一堆没有章节的杂志
          const fallbackGroups = [
            { title: "连载中", keyword: "連載中" },
            { title: "新连載", keyword: "新連載" },
            { title: "热门作品", keyword: "週刊少年ジャンプ" },
          ];

          for (const group of fallbackGroups) {
            try {
              const resp = await this.graphqlRequest("SearchResult", {
                keyword: group.keyword,
              });
              const edges = resp?.data?.search?.edges || [];
              const comics = edges
                .map(({ node }) => {
                  if (node.__typename === "Series") {
                    const cover = node.thumbnailUriTemplate;
                    return {
                      id: node.databaseId,
                      title: node.title || "",
                      cover: this.replaceCoverUrl(cover),
                      tags: [],
                      description: node.description || "",
                    };
                  }
                  return null;
                })
                .filter(Boolean);
              if (comics.length > 0) {
                result[group.title] = comics.slice(0, 20);
              }
            } catch (e) {
              console.warn(
                `[ShonenJumpPlus] 回退搜索 "${group.keyword}" 失败:`,
                e,
              );
            }
          }
        }

        if (Object.keys(result).length === 0) {
          throw "无法加载发现页内容";
        }

        return result;
      },
    },
  ];

  search = {
    load: async (keyword, _, page) => {
      if (!this.bearerToken || Date.now() > this.tokenExpiry) {
        await this.fetchBearerToken();
      }

      const operationName = "SearchResult";

      const response = await this.graphqlRequest(operationName, {
        keyword,
      });
      const edges = response?.data?.search?.edges || [];
      const pageInfo = response?.data?.search?.pageInfo || {};

      const comics = edges
        .map(({ node }) => {
          const authors = (node.author?.name || "")
            .split(/\s*\/\s*/)
            .filter(Boolean);
          const cover =
            node.latestIssue?.thumbnailUriTemplate || node.thumbnailUriTemplate;
          if (node.__typename === "Series") {
            return new Comic({
              id: node.databaseId,
              title: node.title || "",
              cover: this.replaceCoverUrl(cover),
              description: node.description || "",
              tags: authors,
            });
          }
          if (node.__typename === "MagazineLabel") {
            return new Comic({
              id: node.databaseId,
              title: node.title || "",
              cover: this.replaceCoverUrl(cover),
            });
          }
          return null;
        })
        .filter(Boolean);

      return {
        comics,
        maxPage: pageInfo.hasNextPage ? (page || 1) + 1 : page || 1,
        endCursor: pageInfo.endCursor,
      };
    },
  };

  comic = {
    loadInfo: async (id) => {
      if (typeof id === "string" && id.startsWith("ep:")) {
        const episodeId = id.slice(3);
        const seriesId = await this.getSeriesIdFromEpisode(episodeId);
        id = seriesId;
      }

      await this.ensureAuth();
      const seriesData = await this.fetchSeriesDetail(id);
      const episodes = await this.fetchEpisodes(id);

      const { chapters, latestPublishAt } = episodes.reduce(
        (acc, ep) => ({
          chapters: {
            ...acc.chapters,
            [ep.databaseId]: ep.title || "",
          },
          latestPublishAt:
            ep.publishedAt && ep.publishedAt > acc.latestPublishAt
              ? ep.publishedAt
              : acc.latestPublishAt,
        }),
        { chapters: {}, latestPublishAt: "" },
      );

      const maxDate =
        latestPublishAt > seriesData.openAt
          ? latestPublishAt
          : seriesData.openAt;
      const updateDate = new Date(new Date(maxDate) - 60 * 60 * 1000);
      const authors = (seriesData.author?.name || "")
        .split(/\s*\/\s*/)
        .filter(Boolean);

      return new ComicDetails({
        title: seriesData.title || "",
        subtitle: authors.join(" / "),
        cover: this.replaceCoverUrl(seriesData.thumbnailUriTemplate),
        description: seriesData.description || "",
        tags: {
          Author: authors,
          Update: [updateDate.toISOString().slice(0, 10)],
        },
        url: `https://shonenjumpplus.com/app/episode/${seriesData.publisherId}`,
        chapters,
      });
    },

    loadEp: async (comicId, epId) => {
      await this.ensureAuth();

      // 修复：处理章节为空的情况
      if (epId === null || epId === undefined) {
        throw "此漫画没有可阅读的章节";
      }

      const episodeId = this.normalizeEpisodeId(epId);
      if (!episodeId) {
        throw "无效的章节 ID";
      }

      const episodeData = await this.fetchEpisodePages(episodeId);

      if (!this.isEpisodeAccessible(episodeData)) {
        await this.handleEpisodePurchase(episodeData);
        return this.comic.loadEp(comicId, epId);
      }

      return this.buildImageUrls(episodeData);
    },

    onImageLoad: (url) => {
      const [cleanUrl, token] = url.split("?token=");
      return {
        url: cleanUrl,
        headers: { "X-Giga-Page-Image-Auth": token },
      };
    },

    onClickTag: (namespace, tag) => {
      if (namespace === "Author") {
        return {
          action: "search",
          keyword: `${tag}`,
          param: null,
        };
      }
      throw "Unsupported tag namespace: " + namespace;
    },

    link: {
      domains: ["shonenjumpplus.com"],
      linkToId: (url) => {
        let match = url.match(/\/app\/series\/(\d+)/);
        if (match) return match[1];
        match = url.match(/\/app\/episode\/([^\/?#]+)/);
        if (match) return "ep:" + match[1];
        return null;
      },
    },
  };

  async ensureAuth() {
    if (!this.bearerToken || Date.now() > this.tokenExpiry) {
      await this.fetchBearerToken();
    }
  }

  async graphqlRequest(operationName, variables, retry = true) {
    try {
      const payload = {
        operationName,
        variables,
        query: GraphQLQueries[operationName],
      };
      const response = await Network.post(
        `${this.apiBase}/graphql?opname=${operationName}`,
        {
          ...this.headers,
          Authorization: `Bearer ${this.bearerToken}`,
          Accept: "application/json",
          "X-APOLLO-OPERATION-NAME": operationName,
          "Content-Type": "application/json",
        },
        JSON.stringify(payload),
      );

      if (response.status === 403) {
        if (retry && this._retryCount < 3) {
          this._retryCount++;
          this._rotateUA();
          console.warn("[ShonenJumpPlus] GraphQL 403，换 UA 重试");
          await this._sleep(2000);
          return this.graphqlRequest(operationName, variables, false);
        }
        throw new Error("GraphQL 请求被 CloudFront 拦截 (403)");
      }

      if (response.status === 410) {
        if (retry && this._retryCount < 3) {
          this._retryCount++;
          console.warn("[ShonenJumpPlus] 收到 410，尝试更新版本并重试");
          await this.init();
          await this.fetchBearerToken();
          return this.graphqlRequest(operationName, variables, false);
        } else {
          throw new Error(`GraphQL 请求失败，状态码 410，版本可能需要手动更新`);
        }
      }

      if (response.status !== 200) throw `Invalid status: ${response.status}`;
      return JSON.parse(response.body);
    } catch (e) {
      console.error("[ShonenJumpPlus] graphqlRequest 异常:", e);
      throw e;
    }
  }

  normalizeEpisodeId(epId) {
    // 修复：安全处理 null 和 undefined
    if (epId === null || epId === undefined) return null;
    if (typeof epId === "object") return epId.id || null;
    if (typeof epId === "string" && epId.includes("/")) {
      return epId.split("/").pop();
    }
    return epId;
  }

  replaceCoverUrl(url) {
    // 修复：封面为空时返回 null，避免 Venera 请求空 URL
    if (!url) return null;
    return url.replace("{height}", "1500").replace("{width}", "1500") || null;
  }

  async fetchBearerToken(retry = true) {
    if (this._fetchingToken) {
      return this._fetchingToken;
    }
    this._fetchingToken = this._doFetchBearerToken(retry);
    try {
      return await this._fetchingToken;
    } finally {
      this._fetchingToken = null;
    }
  }

  async _doFetchBearerToken(retry) {
    try {
      await this._sleep(1000 + Math.random() * 2000);

      const response = await Network.post(
        `${this.apiBase}/user_account/access_token`,
        this.headers,
        "",
      );

      if (response.status === 403) {
        if (retry && this._retryCount < 3) {
          this._retryCount++;
          this.deviceId = this.generateDeviceId();
          this._rotateUA();
          console.warn("[ShonenJumpPlus] access_token 403，更换设备 ID 和 UA 后重试");
          await this._sleep(3000);
          return this._doFetchBearerToken(false);
        }
        throw new Error(
          `获取 access_token 失败，状态码 403，可能被 CloudFront 拦截`,
        );
      }

      if (response.status === 410) {
        if (retry && this._retryCount < 3) {
          this._retryCount++;
          console.warn(
            "[ShonenJumpPlus] token 请求收到 410，尝试更新版本并重试",
          );
          await this.init();
          return this._doFetchBearerToken(false);
        } else {
          throw new Error("获取 access_token 失败，状态码 410，版本过旧");
        }
      }

      if (response.status !== 200) {
        throw new Error(`获取 access_token 失败，状态码 ${response.status}`);
      }

      const { access_token, user_account_id } = JSON.parse(response.body);
      this.bearerToken = access_token;
      this.userAccountId = user_account_id;
      this.tokenExpiry = Date.now() + 3600000;
      this._retryCount = 0;
    } catch (e) {
      console.error("[ShonenJumpPlus] fetchBearerToken 异常:", e);
      throw e;
    }
  }

  async fetchSeriesDetail(id) {
    const response = await this.graphqlRequest("SeriesDetail", { id });
    return response?.data?.series || {};
  }

  async fetchEpisodes(id) {
    const response = await this.graphqlRequest("SeriesDetailEpisodeList", {
      id,
      episodeOffset: 0,
      episodeFirst: 1500,
      episodeSort: "NUMBER_ASC",
    });
    const episodes = (response?.data?.series?.episodes?.edges || []).map(
      (edge) => edge.node,
    );
    return episodes;
  }

  async fetchEpisodePages(episodeId) {
    const response = await this.graphqlRequest(
      "EpisodeViewerConditionallyCacheable",
      { episodeID: episodeId },
    );
    return response?.data?.episode || {};
  }

  isEpisodeAccessible({ purchaseInfo }) {
    return (
      purchaseInfo?.isFree ||
      purchaseInfo?.hasPurchased ||
      purchaseInfo?.hasRented
    );
  }

  async handleEpisodePurchase(episodeData) {
    const { id, purchaseInfo } = episodeData;
    const { purchasableViaOnetimeFree, rentable, unitPrice } =
      purchaseInfo || {};

    if (purchasableViaOnetimeFree) await this.consumeOnetimeFree(id);
    if (rentable) await this.rentChapter(id, unitPrice);
  }

  buildImageUrls({ pageImages, pageImageToken }) {
    const validImages = pageImages.edges
      .flatMap((edge) => edge.node?.src)
      .filter(Boolean);
    return {
      images: validImages.map((url) => `${url}?token=${pageImageToken}`),
    };
  }

  async consumeOnetimeFree(episodeId) {
    const response = await this.graphqlRequest("ConsumeOnetimeFree", {
      input: { id: episodeId },
    });
    return response?.data?.consumeOnetimeFree?.isSuccess;
  }

  async rentChapter(episodeId, unitPrice, retryCount = 0) {
    if (retryCount > 3) {
      throw "Failed to rent chapter after multiple attempts.";
    }
    const response = await this.graphqlRequest("Rent", {
      input: { id: episodeId, unitPrice },
    });

    if (response.errors?.[0]?.extensions?.code === "FAILED_TO_USE_POINT") {
      await this.refreshAccount();
      return this.rentChapter(episodeId, unitPrice, retryCount + 1);
    }

    this.userAccountId = response?.data?.rent?.userAccount?.databaseId;
    return true;
  }

  async refreshAccount() {
    this.deviceId = this.generateDeviceId();
    this.bearerToken = this.userAccountId = null;
    this.tokenExpiry = 0;
    await this.fetchBearerToken();
    await this.addUserDevice();
  }

  async addUserDevice() {
    await this.graphqlRequest("AddUserDevice", {
      input: {
        deviceName: `Android ${21 + Math.floor(Math.random() * 14)}`,
        modelName: `Device-${Math.random().toString(36).slice(2, 10)}`,
        osName: `Android ${9 + Math.floor(Math.random() * 6)}`,
      },
    });
    this.addUserDeviceCalled = true;
  }

  async _fetchEpisodePage(publisherId) {
    const url = `https://shonenjumpplus.com/app/episode/${publisherId}`;
    const headers = {
      "User-Agent": this._getCurrentUA(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    };
    return Network.get(url, headers);
  }

  _extractSeriesIdFromHtml(html) {
    const patterns = [
      /"series":\{"databaseId":"(\d+)"/,
      /"series":\{"id":"[^"]*","databaseId":"(\d+)"/,
      /"databaseId":"(\d+)"/,
      /data-series-id="(\d+)"/,
      /seriesId:\s*['"](\d+)['"]/,
      /"series":\{"__typename":"Series","id":"[^"]*","databaseId":"(\d+)"/,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        console.log(`[ShonenJumpPlus] 从网页提取到 seriesId: ${match[1]}`);
        return match[1];
      }
    }
    console.warn("[ShonenJumpPlus] 无法从网页提取 seriesId");
    return null;
  }

  async getSeriesIdFromEpisode(publisherId) {
    try {
      const response = await this._fetchEpisodePage(publisherId);
      if (response.status === 200) {
        const html = response.body;
        const extracted = this._extractSeriesIdFromHtml(html);
        if (extracted) {
          return extracted;
        }
      }
    } catch (e) {
      console.warn(`[ShonenJumpPlus] 抓取章节页面失败: ${e.message}`);
    }

    try {
      const response = await this.graphqlRequest("EpisodeSeriesId", {
        episodeID: publisherId,
      });
      const series = response?.data?.episode?.series;
      if (series && series.databaseId) {
        return series.databaseId;
      }
    } catch (e) {
      console.warn(`[ShonenJumpPlus] GraphQL 查询系列ID失败: ${e.message}`);
    }

    throw new Error(`无法从章节 ${publisherId} 获取对应的系列ID`);
  }
}

const GraphQLQueries = {
  SearchResult: `query SearchResult($after: String, $keyword: String!) {
        search(after: $after, first: 50, keyword: $keyword, types: [SERIES,MAGAZINE_LABEL]) {
            pageInfo { hasNextPage endCursor }
            edges {
                node {
                    __typename
                    ... on Series { id databaseId title thumbnailUriTemplate author { name } description }
                    ... on MagazineLabel { id databaseId title thumbnailUriTemplate latestIssue { thumbnailUriTemplate } }
                }
            }
        }
    }`,
  SeriesDetail: `query SeriesDetail($id: String!) {
        series(databaseId: $id) {
            id databaseId title thumbnailUriTemplate
            author { name }
            description
            hashtags serialUpdateScheduleLabel
            openAt
            publisherId
        }
    }`,
  SeriesDetailEpisodeList: `query SeriesDetailEpisodeList($id: String!, $episodeOffset: Int, $episodeFirst: Int, $episodeSort: ReadableProductSorting) {
        series(databaseId: $id) {
            episodes: readableProducts(types: [EPISODE], first: $episodeFirst, offset: $episodeOffset, sort: $episodeSort) {
                edges { node { databaseId title publishedAt } }
            }
        }
    }`,
  EpisodeViewerConditionallyCacheable: `query EpisodeViewerConditionallyCacheable($episodeID: String!) {
        episode(databaseId: $episodeID) {
            id pageImages { edges { node { src } } } pageImageToken
            purchaseInfo {
                isFree hasPurchased hasRented
                purchasableViaOnetimeFree rentable unitPrice
            }
        }
    }`,
  ConsumeOnetimeFree: `mutation ConsumeOnetimeFree($input: ConsumeOnetimeFreeInput!) {
        consumeOnetimeFree(input: $input) { isSuccess }
    }`,
  Rent: `mutation Rent($input: RentInput!) {
        rent(input: $input) {
            userAccount { databaseId }
        }
    }`,
  AddUserDevice: `mutation AddUserDevice($input: AddUserDeviceInput!) {
        addUserDevice(input: $input) { isSuccess }
    }`,
  HomeCacheable: `query HomeCacheable {
    homeSections(includePreview: true) {
      __typename
      ...DailyRankingSection
    }
  }
  fragment DesignSectionImage on DesignSectionImage {
    imageUrl width height
  }
  fragment SerialInfoIcon on SerialInfo {
    isOriginal isIndies
  }
  fragment DailyRankingSeries on Series {
    id databaseId publisherId title
    horizontalThumbnailUriTemplate: subThumbnailUri(type: HORIZONTAL_WITH_LOGO)
    squareThumbnailUriTemplate: subThumbnailUri(type: SQUARE_WITHOUT_LOGO)
    isNewOngoing supportsOnetimeFree
    serialInfo {
      __typename ...SerialInfoIcon
      status isTrial
    }
    jamEpisodeWorkType
  }
  fragment DailyRankingItem on DailyRankingItem {
    __typename
    ... on DailyRankingValidItem {
      product {
        __typename
        ... on Episode {
          id databaseId publisherId commentCount
          series {
            __typename ...DailyRankingSeries
          }
        }
        ... on SpecialContent {
          publisherId linkUrl
          series {
            __typename ...DailyRankingSeries
          }
        }
      }
      badge { name label }
      label rank viewCount
    }
    ... on DailyRankingInvalidItem {
      publisherWorkId
    }
  }
  fragment DailyRanking on DailyRanking {
    date firstPositionSeriesId
    items {
      edges {
        node {
          __typename ...DailyRankingItem
        }
      }
    }
  }
  fragment DailyRankingSection on DailyRankingSection {
    title
    titleImage {
      __typename ...DesignSectionImage
    }
    dailyRankings {
      ranking {
        __typename ...DailyRanking
      }
    }
  }`,
  EpisodeSeriesId: `query EpisodeSeriesId($episodeID: String!) {
    episode(databaseId: $episodeID) {
      series {
        databaseId
      }
    }
  }`,
};