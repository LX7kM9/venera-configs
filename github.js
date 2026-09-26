class GitHubAuth extends ComicSource {
  name = "GitHub";
  key = "github_auth";
  version = "6.1.9";                // 移除网络收藏夹（使用 Venera 内置本地收藏）
  minAppVersion = "1.6.0";

  url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/github.js";

  get baseUrl() {
    return "https://github.com";
  }

  get token() {
    return this.loadData("github_token") || "";
  }

  // ========== 目标用户管理 ==========
  _getTargetUsers() {
    let data = this.loadData('target_users');
    if (data) {
      try {
        let arr = JSON.parse(data);
        if (Array.isArray(arr)) return arr;
      } catch(e) {}
    }
    return [];
  }

  _setTargetUsers(arr) {
    this.saveData('target_users', JSON.stringify(arr));
  }

  // ========== 实时验证 Token（彻底绕过缓存） ==========
  async _verifyTokenRealTime(token) {
    if (!token) return null;
    try {
      const unique = `_=${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const url = `https://api.github.com/user?${unique}`;
      const headers = {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "Venera-GitHub-Viewer/5.11",
        "Accept": "application/vnd.github.v3+json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "If-None-Match": "",
        "If-Modified-Since": "0"
      };
      const res = await Network.get(url, headers);
      if (res.status === 200) {
        const data = JSON.parse(res.body);
        this.saveData("_last_valid_user", data.login);
        return data.login;
      }
    } catch (e) {}
    return null;
  }

  // ========== 统一打开浏览器 ==========
  openUrl(url) {
    if (typeof UI !== "undefined" && UI.launchUrl) {
      UI.launchUrl(url);
      return true;
    }
    if (typeof APP !== "undefined" && APP.launchUrl) {
      APP.launchUrl(url);
      return true;
    }
    if (typeof Venera !== "undefined" && Venera.openBrowser) {
      Venera.openBrowser(url);
      return true;
    }
    if (typeof UI !== "undefined" && UI.showMessage) {
      UI.showMessage("请手动在浏览器打开: " + url);
    } else {
      alert("请手动在浏览器打开: " + url);
    }
    return false;
  }

  // ========== 获取仓库列表（自动降级） ==========
  async fetchRepos(owner, isSelf, sort, page) {
    let apiUrl;
    let hasToken = this.token && this.token.length > 0;

    if (isSelf && hasToken) {
      apiUrl = `https://api.github.com/user/repos?type=all&sort=${sort}&direction=desc&per_page=100&page=${page}`;
    } else {
      apiUrl = `https://api.github.com/users/${owner}/repos?type=public&sort=${sort}&direction=desc&per_page=100&page=${page}`;
      isSelf = false;
    }

    const headers = {
      "User-Agent": "Venera-GitHub-Viewer/5.11",
      "Accept": "application/vnd.github.v3+json",
      "Cache-Control": "no-cache, no-store"
    };

    if (isSelf && hasToken) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await Network.get(apiUrl, headers);
    if (res.status !== 200) {
      if (res.status === 404) {
        return { repos: [], maxPage: 1, userExists: false, error: "user_not_found" };
      }
      if (res.status === 401 && isSelf) {
        delete headers["Authorization"];
        const retryRes = await Network.get(
          `https://api.github.com/users/${owner}/repos?type=public&sort=${sort}&direction=desc&per_page=100&page=${page}`,
          headers
        );
        if (retryRes.status === 200) {
          const repos = JSON.parse(retryRes.body);
          const linkHeader = retryRes.headers["link"];
          let maxPage = page;
          if (linkHeader && linkHeader.includes(`rel="next"`)) {
            maxPage = page + 1;
          }
          return { repos, maxPage, userExists: true, error: null };
        } else {
          return { repos: [], maxPage: 1, userExists: true, error: "token_invalid" };
        }
      }
      if (!isSelf && (res.status === 403 || res.status === 429)) {
        return { repos: [], maxPage: 1, userExists: true, error: "rate_limit" };
      }
      throw `HTTP ${res.status}`;
    }
    const repos = JSON.parse(res.body);
    const linkHeader = res.headers["link"];
    let maxPage = page;
    if (linkHeader && linkHeader.includes(`rel="next"`)) {
      maxPage = page + 1;
    }
    return { repos, maxPage, userExists: true, error: null };
  }

  // ========== 获取单个仓库信息 ==========
  async fetchSingleRepo(fullName) {
    const url = `https://api.github.com/repos/${fullName}`;
    const headers = {
      "User-Agent": "Venera-GitHub-Viewer/5.11",
      "Accept": "application/vnd.github.v3+json",
      "Cache-Control": "no-cache, no-store"
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const res = await Network.get(url, headers);
    if (res.status === 401) {
      delete headers["Authorization"];
      const res2 = await Network.get(url, headers);
      if (res2.status === 200) {
        return JSON.parse(res2.body);
      } else {
        return { private: true, needToken: true, name: fullName.split('/')[1], full_name: fullName };
      }
    }
    if (res.status !== 200) {
      return null;
    }
    return JSON.parse(res.body);
  }

  // ========== 获取 Releases（全部） ==========
  async fetchReleases(fullName) {
    let allReleases = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    while (hasMore) {
      const url = `https://api.github.com/repos/${fullName}/releases?per_page=${perPage}&page=${page}`;
      const headers = {
        "User-Agent": "Venera-GitHub-Viewer/5.11",
        "Accept": "application/vnd.github.v3+json",
        "Cache-Control": "no-cache, no-store"
      };
      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }
      const res = await Network.get(url, headers);
      if (res.status !== 200) break;
      const data = JSON.parse(res.body);
      if (data.length === 0) break;
      allReleases = allReleases.concat(data);
      const linkHeader = res.headers["link"];
      if (linkHeader && linkHeader.includes(`rel="next"`)) {
        page++;
      } else {
        hasMore = false;
      }
    }
    return allReleases;
  }

  // ========== 获取 Commits（全部） ==========
  async fetchCommits(fullName) {
    let allCommits = [];
    let page = 1;
    const perPage = 100;
    let hasMore = true;
    while (hasMore) {
      const url = `https://api.github.com/repos/${fullName}/commits?per_page=${perPage}&page=${page}`;
      const headers = {
        "User-Agent": "Venera-GitHub-Viewer/5.11",
        "Accept": "application/vnd.github.v3+json",
        "Cache-Control": "no-cache, no-store"
      };
      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }
      const res = await Network.get(url, headers);
      if (res.status !== 200) break;
      const data = JSON.parse(res.body);
      if (data.length === 0) break;
      allCommits = allCommits.concat(data);
      const linkHeader = res.headers["link"];
      if (linkHeader && linkHeader.includes(`rel="next"`)) {
        page++;
      } else {
        hasMore = false;
      }
    }
    return allCommits;
  }

  // ========== 构建仓库 Comic 对象 ==========
  buildComicWithUpdate(repo, isSelf, hasToken, updateInfo) {
    const privateLabel = (isSelf && hasToken) ? (repo.private ? "🔒" : "🌐") : "🌐";
    let subTitle = `${privateLabel} ${repo.language || "无语言"} | ⭐ ${repo.stargazers_count}`;
    let hasNew = false;
    let newChapterCount = 0;

    if (updateInfo && updateInfo.hasUpdate) {
      subTitle += ` 🔔 有新${updateInfo.type === 'release' ? ' Release' : ' Commit'}`;
      hasNew = true;
      newChapterCount = 1;
    }
    if (repo.needToken) {
      subTitle = "🔒 需 Token 查看更新";
    }

    return new Comic({
      id: repo.full_name,
      title: repo.name || repo.full_name,
      subTitle: subTitle,
      cover: repo.owner?.avatar_url || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
      description: repo.description || repo.full_name,
      favoriteId: repo.full_name,
      hasNew: hasNew,
      newChapterCount: newChapterCount,
      unread: hasNew,
      newChapters: hasNew ? [{}] : []
    });
  }

  // ========== 账号登录 ==========
  account = {
    loginWithWebview: {
      url: "https://github.com/login",
      checkStatus: (url, title) => {
        if (url.indexOf("github.com") === -1) return false;
        if (url.indexOf("/login") !== -1) return false;
        if (url.indexOf("/session") !== -1) return false;
        if (url.indexOf("/verify") !== -1) return false;
        if (url.indexOf("/challenge") !== -1) return false;
        if (url.endsWith("/") || url.indexOf("/dashboard") !== -1 || url.indexOf("/organizations") !== -1) {
          return true;
        }
        if (url.indexOf("?code=") !== -1 || url.indexOf("?state=") !== -1) {
          return true;
        }
        return false;
      },
      onLoginSuccess: async () => {
        try {
          const res = await Network.get("https://github.com/", {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          });
          if (res.status === 200) {
            let match = res.body.match(/<meta\s+name=["']user-login["']\s+content=["']([^"']+)["']/i);
            if (!match) {
              match = res.body.match(/window\.SETTINGS\s*=\s*{[\s\S]*?"user_login"\s*:\s*"([^"]+)"/i);
            }
            if (!match) {
              match = res.body.match(/"login"\s*:\s*"([^"]+)"/i);
            }
            if (match && match[1]) {
              this.saveData("_webview_username", match[1]);
              this.saveData("_last_valid_user", match[1]);
              if (typeof UI !== "undefined" && UI.showMessage) {
                UI.showMessage(`已自动获取用户名: ${match[1]}`);
              }
            }
          }
        } catch (e) {}
      }
    },
    logout: () => {
      Network.deleteCookies("https://github.com/");
      this.deleteData("token");
      this.deleteData("github_token");
      this.deleteData("_webview_username");
      this.deleteData("_last_valid_user");
      this.deleteData("_token_invalid_shown");
    },
    registerWebsite: "https://github.com/signup",
  };

  // ========== 设置项 ==========
  settings = {
    get_token: {
      title: "获取 Token（必填以跟踪私有仓库）",
      type: "callback",
      buttonText: "跳转到 GitHub 生成 Token",
      description: "如需跟踪私有仓库更新，请生成具有 repo 权限的 Token",
      callback: () => {
        this.openUrl("https://github.com/settings/tokens/new?scopes=repo");
      },
    },
    github_token: {
      title: "GitHub Token",
      type: "input",
      default: "",
      description: "输入后自动保存（清除内容即清空 Token）",
      onChange: (value) => {
        if (value && value.trim()) {
          this.saveData("github_token", value.trim());
          this.deleteData("_token_invalid_shown");
          this.deleteData("_webview_username");
          if (typeof UI !== "undefined" && UI.showMessage) {
            UI.showMessage("Token 已自动保存");
          }
        } else {
          this.deleteData("github_token");
          this.deleteData("_token_invalid_shown");
          this.deleteData("_webview_username");
          if (typeof UI !== "undefined" && UI.showMessage) {
            UI.showMessage("Token 已清除");
          }
        }
      },
    },
    verify_token: {
      title: "验证 Token 是否有效",
      type: "callback",
      buttonText: "点击验证 Token（实时，无缓存）",
      callback: async () => {
        const currentInputValue = this.loadSetting("github_token") || "";
        if (currentInputValue && currentInputValue.trim()) {
          this.saveData("github_token", currentInputValue.trim());
        } else {
          this.deleteData("github_token");
        }
        this.deleteData("_webview_username");
        this.deleteData("_token_invalid_shown");

        const token = this.token;
        if (!token) {
          UI.showMessage("未设置 Token，请先获取并保存");
          return;
        }

        try {
          const user = await this._verifyTokenRealTime(token);
          if (user) {
            this.deleteData("_token_invalid_shown");
            UI.showMessage(`✅ Token 有效，归属用户：${user}`);
          } else {
            this.saveData("_token_invalid_shown", "1");
            UI.showMessage("❌ Token 无效或已过期，请检查并重新生成");
          }
        } catch (e) {
          UI.showMessage("❌ 验证失败：" + e.message);
        }
      },
    },
    reset_source: {
      title: "重置源（强制刷新状态）",
      type: "callback",
      buttonText: "点击重置源",
      callback: () => {
        this.deleteData("_webview_username");
        this.deleteData("_token_invalid_shown");
        this.deleteData("_last_identifier_");
        this.deleteData("_last_check_");
        if (typeof UI !== "undefined" && UI.showMessage) {
          UI.showMessage("已重置，请重新加载源或重启 Venera");
        }
        if (typeof this.reload === "function") {
          this.reload();
        }
      },
    },
    update_track: {
      title: "更新跟踪方式",
      type: "select",
      options: [
        { value: "release", text: "Release（发行版）" },
        { value: "commit", text: "Commit（提交）" }
      ],
      default: "commit",
      description: "详情页显示的章节类型，以及追更检测的依据",
    },
    load_all: {
      title: "加载全部 Commit/Release",
      type: "switch",
      default: true,
      description: "开启后详情页加载全部条目（推荐）；关闭则只加载最新指定数量",
    },
    max_items: {
      title: "最大加载条目数",
      type: "input",
      default: "30",
      description: "当「加载全部」关闭时，指定加载最新的多少个 Commit/Release",
    },
    add_target_user: {
      title: "添加目标用户",
      type: "callback",
      buttonText: "添加目标用户名",
      callback: async () => {
        let username = await UI.showInputDialog("输入 GitHub 用户名", (v) => v && v.trim() ? null : "用户名不能为空");
        if (!username) return;
        username = username.trim();
        let users = this._getTargetUsers();
        if (users.includes(username)) {
          UI.showMessage("该用户已存在");
          return;
        }
        users.push(username);
        this._setTargetUsers(users);
        UI.showMessage(`已添加目标用户「${username}」`);
      }
    },
    manage_target_users: {
      title: "管理目标用户",
      type: "callback",
      buttonText: "查看 / 删除目标用户",
      callback: async () => {
        let users = this._getTargetUsers();
        if (users.length === 0) {
          UI.showMessage("还没有目标用户");
          return;
        }
        let options = users.map((u, i) => `${i + 1}. ${u}`);
        options.push("清空全部");
        let idx = await UI.showSelectDialog("选择要删除的目标用户", options);
        if (idx === null || idx === undefined) return;
        if (idx === users.length) {
          UI.showDialog("确认清空", `将删除全部 ${users.length} 个目标用户？`, [
            { text: "清空", style: "danger", callback: () => {
              this._setTargetUsers([]);
              UI.showMessage("已清空全部目标用户");
            }},
            { text: "取消", callback: () => {} }
          ]);
          return;
        }
        let target = users[idx];
        UI.showDialog("确认删除", `删除「${target}」？`, [
          { text: "删除", style: "danger", callback: () => {
            users.splice(idx, 1);
            this._setTargetUsers(users);
            UI.showMessage(`已删除「${target}」`);
          }},
          { text: "取消", callback: () => {} }
        ]);
      }
    },
    info: {
      title: "使用说明",
      type: "callback",
      buttonText: "查看说明",
      callback: () => {
        if (typeof UI !== "undefined" && UI.showDialog) {
          UI.showDialog(
            "使用说明",
            "1. 点击「登录」通过 WebView 登录 GitHub（支持 2FA）\n" +
              "   登录成功后显示该用户的公开仓库\n" +
              "2. 如需跟踪私有仓库更新，请点击「获取 Token」生成具有 repo 权限的 Token\n" +
              "   在「GitHub Token」输入框中粘贴后自动保存\n" +
              "3. Token 失效时，发现页「快捷入口」顶部会显示「⚠️ Token已过期，请点击更新」\n" +
              "   点击后可直接跳转至设置页面\n" +
              "4. 即使 Token 无效，您仍可正常查看自己的公开仓库（基于上次有效用户名）\n" +
              "5. 点击「验证 Token」可手动检查 Token 有效性（实时验证，无缓存）\n" +
              "6. 添加的目标用户（非您自己）的公开仓库不受 Token 影响\n" +
              "7. 搜索框输入关键词可搜索全 GitHub 的公开仓库\n" +
              "8. 点击收藏按钮将使用 Venera 内置的本地收藏功能（不进行网络同步）",
            [{ text: "知道了", callback: () => {} }]
          );
        }
      },
    },
  };

  // ========== 发现页 ==========
  explore = [
    {
      title: "GitHub",
      type: "singlePageWithMultiPart",
      load: async () => {
        const result = {};

        let tokenValid = false;
        let tokenUser = null;
        const token = this.token;
        if (token && token.length > 0) {
          try {
            const user = await this._verifyTokenRealTime(token);
            if (user) {
              tokenValid = true;
              tokenUser = user;
            }
          } catch (e) {}
        }

        let currentUser = null;
        if (tokenValid && tokenUser) {
          currentUser = tokenUser;
          this.saveData("_last_valid_user", currentUser);
        } else {
          currentUser = this.loadData("_last_valid_user") || null;
          if (token && token.length > 0 && !tokenValid) {
            this.saveData("_token_invalid_shown", "1");
          }
        }

        let allUsers = [];

        if (currentUser) {
          allUsers.push({ name: currentUser, isSelf: true });
        }

        const targetUsers = this._getTargetUsers();
        for (let u of targetUsers) {
          if (u.trim()) {
            const exists = allUsers.some(user => user.name === u.trim());
            if (!exists) {
              allUsers.push({ name: u.trim(), isSelf: false });
            }
          }
        }

        if (allUsers.length === 0) {
          result["❌ 无用户"] = [
            new Comic({
              id: "no_user",
              title: "请先登录或填写 Token",
              cover: "",
              description: "点击「登录」通过 WebView 登录，或填写 Token 后保存",
            })
          ];
          return result;
        }

        const shortcutComics = [];
        if (token && token.length > 0 && !tokenValid) {
          shortcutComics.push(new Comic({
            id: "token_warning",
            title: "⚠️ Token已过期，请点击更新",
            cover: "",
            description: "点击进入设置页面更新 Token",
            subTitle: "点击跳转设置",
          }));
        }
        for (let user of allUsers) {
          const { name } = user;
          shortcutComics.push(new Comic({
            id: `open_github_${name}`,
            title: `🌐 在浏览器中打开 ${name} 的主页`,
            cover: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
            description: `点击打开 ${name} 的主页`,
            subTitle: "点击即打开内置浏览器",
          }));
        }
        result["🚀 快捷入口"] = shortcutComics;

        const hasToken = token && token.length > 0;
        const multiUsers = allUsers.length > 1;

        for (let user of allUsers) {
          const { name, isSelf } = user;
          try {
            const reposResult = await this.fetchRepos(name, isSelf, "updated", 1);
            if (reposResult.error) {
              if (reposResult.error === "user_not_found") {
                result[`⚠️ 用户 "${name}" 不存在`] = [
                  new Comic({
                    id: "not_found",
                    title: "用户不存在",
                    cover: "",
                    description: "请检查用户名是否正确",
                  })
                ];
                continue;
              } else if (reposResult.error === "token_invalid" && isSelf) {
                let comics = [];
                if (reposResult.repos.length > 0) {
                  if (multiUsers) {
                    comics = reposResult.repos.slice(0, 6).map(repo => this.buildComicWithUpdate(repo, isSelf, hasToken, null));
                    comics.push(new Comic({
                      id: isSelf ? "more_self" : `more_${name}`,
                      title: "📋 查看更多...",
                      cover: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
                      description: `点击查看 ${name} 的全部仓库`,
                      subTitle: "跳转到 GitHub 主页",
                    }));
                  } else {
                    comics = reposResult.repos.map(repo => this.buildComicWithUpdate(repo, isSelf, hasToken, null));
                  }
                }
                let sectionTitle = multiUsers ? `📦 ${name} 的仓库（预览）` : `📦 ${name} 的全部仓库`;
                if (!tokenValid && isSelf) {
                  sectionTitle += " ⚠️ Token已过期（仅公开）";
                }
                result[sectionTitle] = comics;
                continue;
              } else if (reposResult.error === "rate_limit") {
                result[`⚠️ 加载 ${name} 的仓库失败`] = [
                  new Comic({
                    id: "rate_limit",
                    title: "请求过于频繁",
                    cover: "",
                    description: "GitHub 限制了未认证请求的速率，请稍后再试，或配置 Token 以提高限制。",
                  })
                ];
                continue;
              } else {
                result[`⚠️ 加载 ${name} 的仓库失败`] = [
                  new Comic({
                    id: "error",
                    title: "无法加载仓库内容",
                    cover: "",
                    description: "请检查网络连接或稍后重试。",
                  })
                ];
                continue;
              }
            }

            if (reposResult.userExists === false) {
              result[`⚠️ 用户 "${name}" 不存在`] = [
                new Comic({
                  id: "not_found",
                  title: "用户不存在",
                  cover: "",
                  description: "请检查用户名是否正确",
                })
              ];
              continue;
            }
            if (reposResult.repos.length === 0) {
              result[isSelf ? "📦 仓库为空" : `📦 ${name} 的仓库为空`] = [
                new Comic({
                  id: "empty",
                  title: "该用户没有仓库",
                  cover: "",
                  description: "",
                })
              ];
              continue;
            }

            let comics;
            if (multiUsers) {
              comics = reposResult.repos.slice(0, 6).map(repo => this.buildComicWithUpdate(repo, isSelf, hasToken, null));
              comics.push(new Comic({
                id: isSelf ? "more_self" : `more_${name}`,
                title: "📋 查看更多...",
                cover: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
                description: `点击查看 ${name} 的全部仓库`,
                subTitle: "跳转到 GitHub 主页",
              }));
            } else {
              comics = reposResult.repos.map(repo => this.buildComicWithUpdate(repo, isSelf, hasToken, null));
            }

            let sectionTitle;
            if (isSelf) {
              sectionTitle = multiUsers ? "📦 我的仓库（预览）" : "📦 我的全部仓库";
            } else {
              sectionTitle = multiUsers ? `📦 ${name} 的仓库（预览）` : `📦 ${name} 的全部仓库`;
            }
            if (!tokenValid && isSelf && token) {
              sectionTitle += " ⚠️ Token已过期（仅公开）";
            }
            result[sectionTitle] = comics;
          } catch (e) {
            result[`⚠️ 加载 ${name} 的仓库失败`] = [
              new Comic({
                id: "error",
                title: "无法加载仓库内容",
                cover: "",
                description: e.message || "请检查网络连接或稍后重试。",
              })
            ];
          }
        }

        return result;
      },
    },
  ];

  // ========== 搜索 ==========
  search = {
    load: async (keyword, options, page) => {
      if (!keyword || keyword.trim() === '') {
        return { comics: [], maxPage: 1 };
      }
      const sort = (options && options[0]) || 'stars';
      const order = 'desc';
      const perPage = 30;
      const currentPage = page || 1;
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(keyword)}&sort=${sort}&order=${order}&per_page=${perPage}&page=${currentPage}`;

      const headers = {
        "User-Agent": "Venera-GitHub-Viewer/5.11",
        "Accept": "application/vnd.github.v3+json",
        "Cache-Control": "no-cache, no-store"
      };
      if (this.token) {
        headers["Authorization"] = `Bearer ${this.token}`;
      }

      const res = await Network.get(url, headers);
      if (res.status !== 200) {
        throw `搜索失败 (HTTP ${res.status})`;
      }
      const data = JSON.parse(res.body);
      const total = data.total_count || 0;
      const maxPage = Math.ceil(total / perPage) || 1;

      const comics = data.items.map(repo => {
        const privateLabel = repo.private ? "🔒" : "🌐";
        return new Comic({
          id: repo.full_name,
          title: repo.name,
          subTitle: `${privateLabel} ${repo.language || "无语言"} | ⭐ ${repo.stargazers_count}`,
          cover: repo.owner.avatar_url || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
          description: repo.description || repo.full_name,
          favoriteId: repo.full_name,
        });
      });

      return { comics, maxPage };
    },
    optionList: [
      {
        label: "排序方式",
        options: [
          "stars-按星标",
          "updated-按更新时间",
          "forks-按复刻数"
        ]
      }
    ],
    enableTagsSuggestions: false,
  };

  // ========== 检查更新（仅供追更调用，不涉及收藏） ==========
  checkUpdates = async (comicIds) => {
    if (!Array.isArray(comicIds)) comicIds = [comicIds];
    const result = {};
    const updateType = this.loadSetting('update_track') || 'commit';
    const hasToken = this.token && this.token.length > 0;

    for (const id of comicIds) {
      let hasUpdate = false;
      try {
        const repo = await this.fetchSingleRepo(id);
        if (!repo || repo.needToken) {
          result[id] = false;
          continue;
        }
        const lastIdentifier = this.loadData(`_last_identifier_${id}`) || '';
        let latestIdentifier = null;
        if (hasToken || !repo.private) {
          if (updateType === 'release') {
            const releases = await this.fetchReleases(id);
            if (releases.length > 0) {
              latestIdentifier = releases[0].tag_name || releases[0].name;
            }
          } else {
            const commits = await this.fetchCommits(id);
            if (commits.length > 0) {
              latestIdentifier = commits[0].sha;
            }
          }
        }
        if (latestIdentifier && latestIdentifier !== lastIdentifier) {
          hasUpdate = true;
        }
      } catch (e) {}
      result[id] = hasUpdate;
    }
    return result;
  };

  // ========== 必须的空方法 ==========
  loadThumbnails(comics, options) { return comics; }

  category = null;
  categoryComics = null;

  // ========== 单个漫画 ==========
  comic = {
    idMatch: "^[A-Za-z0-9_/.-]+$",

    getShareLink: (id) => `https://github.com/${id}`,

    loadInfo: async (id) => {
      if (id === "token_warning") {
        if (typeof Venera !== "undefined" && Venera.openSourceSettings) {
          Venera.openSourceSettings(this.key);
        } else {
          UI.showMessage("请手动进入设置页面更新 Token");
        }
        return new ComicDetails({
          title: "正在打开设置...",
          cover: "",
          description: "请更新 Token",
          tags: {},
          chapters: new Map(),
        });
      }

      if (id.startsWith("open_github_")) {
        const username = id.replace("open_github_", "");
        const url = `https://github.com/${username}`;
        this.openUrl(url);
        return new ComicDetails({
          title: `正在打开 ${username} 的主页...`,
          cover: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
          description: `已尝试打开 ${url}`,
          tags: {},
          chapters: new Map(),
          url: url,
        });
      }

      if (id === "more_self") {
        const token = this.token;
        let currentUser = null;
        if (token) {
          try {
            currentUser = await this._verifyTokenRealTime(token);
          } catch (e) {}
        }
        if (!currentUser) {
          currentUser = this.loadData("_last_valid_user") || null;
        }
        const url = currentUser ? `https://github.com/${currentUser}` : "https://github.com";
        this.openUrl(url);
        return new ComicDetails({
          title: "正在打开主页...",
          cover: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
          description: `已尝试打开 ${url}`,
          tags: {},
          chapters: new Map(),
          url: url,
        });
      }
      if (id.startsWith("more_")) {
        const targetName = id.replace("more_", "");
        const targetUsers = this._getTargetUsers();
        if (targetUsers.includes(targetName)) {
          const url = `https://github.com/${targetName}`;
          this.openUrl(url);
          return new ComicDetails({
            title: "正在打开主页...",
            cover: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
            description: `已尝试打开 ${url}`,
            tags: {},
            chapters: new Map(),
            url: url,
          });
        }
      }

      const repo = await this.fetchSingleRepo(id);
      if (!repo) {
        return new ComicDetails({
          title: "仓库不存在",
          cover: "",
          description: "无法获取仓库信息",
          tags: {},
          chapters: new Map(),
        });
      }

      if (repo.needToken) {
        return new ComicDetails({
          title: repo.name || id,
          subtitle: "私有仓库",
          cover: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
          description: "需要具有 repo 权限的 Token 才能查看详情",
          tags: { "状态": ["需要 Token"] },
          chapters: new Map(),
          url: `https://github.com/${id}`,
          favoriteId: id,
        });
      }

      const updateType = this.loadSetting('update_track') || 'commit';
      const loadAll = this.loadSetting('load_all') !== false;
      let maxItems = parseInt(this.loadSetting('max_items') || '30', 10);
      if (isNaN(maxItems) || maxItems < 1) maxItems = 30;

      let items = [];
      let latestTime = 0;
      let latestIdentifier = null;

      if (loadAll) {
        if (updateType === 'release') {
          items = await this.fetchReleases(id);
        } else {
          const commits = await this.fetchCommits(id);
          items = commits.map(c => ({
            sha: c.sha,
            commit: c.commit,
            html_url: c.html_url,
            tag_name: c.sha.substring(0,7),
            name: c.commit.message.split('\n')[0],
            published_at: c.commit.committer.date,
            _raw: c
          }));
        }
      } else {
        if (updateType === 'release') {
          const releases = await this.fetchReleases(id);
          items = releases.slice(0, maxItems);
        } else {
          const commits = await this.fetchCommits(id);
          items = commits.slice(0, maxItems).map(c => ({
            sha: c.sha,
            commit: c.commit,
            html_url: c.html_url,
            tag_name: c.sha.substring(0,7),
            name: c.commit.message.split('\n')[0],
            published_at: c.commit.committer.date,
            _raw: c
          }));
        }
      }

      const chapters = new Map();
      if (items.length > 0) {
        for (let item of items) {
          let key, title;
          if (updateType === 'release') {
            key = item.tag_name || item.name || item.id;
            title = `Release: ${item.tag_name || item.name}`;
            if (item.body) {
              const desc = item.body.split('\n')[0];
              if (desc) title += ` - ${desc.substring(0, 30)}`;
            }
          } else {
            const sha = item.sha ? item.sha.substring(0,7) : '';
            const msg = item.commit?.message?.split('\n')[0] || '';
            key = sha;
            title = `Commit: ${sha} - ${msg.substring(0, 50)}`;
          }
          chapters.set(key, title);
        }
        const first = items[0];
        if (updateType === 'release' && first.published_at) {
          latestTime = new Date(first.published_at).getTime();
          latestIdentifier = first.tag_name || first.name;
        } else if (first.commit && first.commit.committer && first.commit.committer.date) {
          latestTime = new Date(first.commit.committer.date).getTime();
          latestIdentifier = first.sha;
        }
        if (latestTime > 0 && latestIdentifier) {
          this.saveData(`_last_check_${id}`, latestTime);
          this.saveData(`_last_identifier_${id}`, latestIdentifier);
        }
      }

      let updateTime = repo.updated_at;
      if (latestTime > 0) {
        updateTime = new Date(latestTime).toISOString();
      }

      const tags = {};
      if (repo.language) tags["语言"] = [repo.language];
      if (repo.license) tags["许可"] = [repo.license.name];
      if (repo.owner) tags["所有者"] = [repo.owner.login];
      tags["星标"] = [String(repo.stargazers_count)];
      tags["复刻"] = [String(repo.forks_count)];
      tags["公开"] = [repo.private ? "私有" : "公开"];

      return new ComicDetails({
        title: repo.name,
        subtitle: repo.full_name,
        cover: repo.owner?.avatar_url || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
        description: repo.description || "无描述",
        tags: tags,
        chapters: chapters,
        isFavorite: false,        // 由 Venera 根据 favoriteId 自动判断
        favoriteId: id,
        url: repo.html_url,
        updateTime: updateTime,
      });
    },

    loadEp: async (comicId, epId) => {
      const updateType = this.loadSetting('update_track') || 'commit';
      let url;
      if (updateType === 'release') {
        url = `https://github.com/${comicId}/releases/tag/${epId}`;
      } else {
        url = `https://github.com/${comicId}/commit/${epId}`;
      }
      this.openUrl(url);

      const inlineImage = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      return {
        images: [inlineImage]
      };
    },

    onImageLoad: (url) => ({ url: url }),
    onThumbnailLoad: (url) => ({ url: url }),

    link: {
      domains: ["github.com", "www.github.com"],
      linkToId: (url) => {
        const match = url.match(/github\.com\/([^/]+\/[^/?#]+)/);
        return match ? match[1] : null;
      },
    },
  };

  // =============================================
  // 网络收藏夹（已移除）
  // 注意：Venera 将使用内置的本地收藏功能。
  // =============================================
}