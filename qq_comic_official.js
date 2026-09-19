class TencentComicOfficial extends ComicSource {
    name = "腾讯动漫（正版）"
    key = "qq_comic_official"
    version = "2.0.0"   // 合并 tencent_comics.js 的账号/收藏/分页探测/nonce 解析器
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/qq_comic_offcial.js"

    baseUrl = "https://m.ac.qq.com"
    desktopBaseUrl = "https://ac.qq.com"
    desktopUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    mobileUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
    accountProbeComicId = "531490"
    searchUrlTemplate = "https://m.ac.qq.com/search/result?word={keyword}&page={page}&pageSize=10&style=items"
    listPageCache = {}

    // ==================== HTTP / URL 工具 ====================
    requestHeaders(targetUrl, referer) {
        let ua = this.mobileUserAgent;
        if (String(targetUrl || "").startsWith(this.desktopBaseUrl + "/")) {
            ua = this.desktopUserAgent;
        }
        return {
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
            "User-Agent": ua,
            "Referer": referer || this.baseUrl,
        };
    }

    apiHeaders(targetUrl, referer, isForm) {
        const headers = this.requestHeaders(targetUrl, referer);
        headers["Accept"] = "application/json,text/plain,*/*";
        headers["X-Requested-With"] = "XMLHttpRequest";
        headers["Cache-Control"] = "no-cache";
        headers["Pragma"] = "no-cache";
        if (isForm) headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
        return headers;
    }

    toAbsolute(value, base) {
        if (!value) return "";
        value = String(value).trim();
        if (/^https?:\/\//i.test(value)) return value;
        if (value.startsWith("//")) return "https:" + value;
        const baseValue = String(base || this.baseUrl);
        const origin = baseValue.match(/^(https?:\/\/[^/]+)/i)?.[1] || this.baseUrl;
        if (value.startsWith("/")) return origin + value;
        const cleanBase = baseValue.split("#")[0].split("?")[0];
        const folder = cleanBase.endsWith("/") ? cleanBase : cleanBase.slice(0, cleanBase.lastIndexOf("/") + 1);
        const stack = (folder.slice(origin.length) + value).split("/");
        const output = [];
        for (const part of stack) {
            if (part === "..") output.pop();
            else if (part && part !== ".") output.push(part);
        }
        return origin + "/" + output.join("/");
    }

    absoluteUrl(path) { return this.toAbsolute(path, this.baseUrl); }
    applyPage(url, page) { return String(url).replace("{page}", String(page)); }

    readAttribute(element, names) {
        if (!element) return "";
        for (const name of names) {
            const value = element.attributes?.[name];
            if (value) return String(value).trim();
        }
        return "";
    }

    readValue(document, selector, attribute) {
        const element = document.querySelector(selector);
        if (!element) return "";
        if (attribute) return this.readAttribute(element, [attribute]);
        return String(element.text || "").trim();
    }

    normalizeText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }

    async loadDocument(url, referer) {
        const res = await Network.get(url, this.requestHeaders(url, referer));
        if (res.status < 200 || res.status >= 400) throw "Invalid status code: " + res.status;
        return new HtmlDocument(res.body);
    }

    // ==================== 动态分页探测 ====================
    readServerMaxPage(document, pageSize) {
        const text = Array.from(document.querySelectorAll("script,[class*='page'],[class*='total'],[class*='count']"))
            .map((node) => String(node.text || "")).join("\n").slice(0, 1000000);
        const pageLabel = text.match(/(?:page\s*)?\d+\s*(?:\/|of)\s*(\d{1,5})|(?:共|总计)\s*(\d{1,5})\s*页/i);
        const labeled = Number(pageLabel?.[1] || pageLabel?.[2] || 0);
        if (Number.isSafeInteger(labeled) && labeled > 0) return labeled;
        const totalMatch = text.match(/(?:["']?total(?:Num|Count|_count)?["']?)\s*[:=]\s*["']?(\d{1,9})/i);
        const sizeMatch = text.match(/(?:["']?pageSize["']?)\s*[:=]\s*["']?(\d{1,5})/i);
        const total = Number(totalMatch?.[1] || 0);
        const size = Number(sizeMatch?.[1] || pageSize || 0);
        if (Number.isSafeInteger(total) && total > 0 && Number.isSafeInteger(size) && size > 0) {
            return Math.max(1, Math.ceil(total / size));
        }
        return 0;
    }

    async resolveListMaxPage(cacheKey, document, currentPage, pageSize, loadPage) {
        const exact = this.readServerMaxPage(document, pageSize);
        if (exact) {
            this.listPageCache[cacheKey] = exact;
            return exact;
        }
        if (this.listPageCache[cacheKey]) return this.listPageCache[cacheKey];
        const inspect = async (probePage) => {
            let probeDocument;
            try {
                probeDocument = await loadPage(probePage);
                const comics = this.parseComicItems(probeDocument, ".comic-item", "");
                const probeExact = this.readServerMaxPage(probeDocument, Math.max(pageSize, comics.length));
                return { valid: comics.length > 0, exact: probeExact };
            } catch (_) {
                return { valid: false, exact: 0 };
            } finally {
                if (probeDocument) probeDocument.dispose();
            }
        };
        let lower = Math.max(1, Number(currentPage) || 1);
        let upper = 0;
        let candidate = Math.max(2, lower + 1);
        for (let attempt = 0; attempt < 13 && candidate <= 9999; attempt += 1) {
            const probe = await inspect(candidate);
            if (probe.exact) {
                this.listPageCache[cacheKey] = probe.exact;
                return probe.exact;
            }
            if (!probe.valid) {
                upper = candidate;
                break;
            }
            lower = candidate;
            if (candidate === 9999) break;
            candidate = Math.min(9999, candidate * 2);
        }
        for (let attempt = 0; upper > lower + 1 && attempt < 14; attempt += 1) {
            const middle = Math.floor((lower + upper) / 2);
            const probe = await inspect(middle);
            if (probe.exact) {
                this.listPageCache[cacheKey] = probe.exact;
                return probe.exact;
            }
            if (probe.valid) lower = middle;
            else upper = middle;
        }
        this.listPageCache[cacheKey] = lower;
        return lower;
    }

    // ==================== JSON / 登录态 ====================
    parseTencentJson(response, context) {
        if (response.status < 200 || response.status >= 400) {
            throw context + "请求失败（HTTP " + response.status + "）";
        }
        let payload;
        try {
            payload = JSON.parse(String(response.body || ""));
        } catch (error) {
            throw context + "返回的不是有效 JSON";
        }
        if (!payload || typeof payload !== "object") throw context + "返回内容为空";
        return payload;
    }

    isLoginStatus(status) {
        const value = String(status == null ? "" : status);
        return value === "-99" || value === "-97";
    }

    loginRequiredMessage() {
        return "腾讯动漫账号未登录或登录状态已失效，请在源设置中重新点击“登录”";
    }

    apiFailure(context, payload) {
        const message = String(payload?.msg || payload?.message || payload?.data || payload?.status || "未知错误");
        return context + "失败：" + message.slice(0, 160);
    }

    // ==================== 账号 / 收藏 ====================
    normalizeComicId(value) {
        const text = String(value == null ? "" : value).trim();
        const match = text.match(/\/(?:comic\/index|Comic\/comicInfo)\/id\/(\d+)(?:[/?#]|$)/i) || text.match(/^(\d+)$/);
        if (!match || !/^[1-9]\d{0,11}$/.test(match[1])) throw "腾讯动漫漫画 ID 无效";
        return match[1];
    }

    mobileComicUrl(comicId) {
        return this.baseUrl + "/comic/index/id/" + this.normalizeComicId(comicId);
    }

    isCollected(value) {
        const normalized = String(value == null ? "" : value).toLowerCase();
        return value === true || normalized === "1" || normalized === "true";
    }

    async getComicUserInfo(comicId, allowLoggedOut) {
        const numericId = this.normalizeComicId(comicId);
        const referer = this.mobileComicUrl(numericId);
        const url = this.baseUrl + "/comic/getUserInfo?id=" + numericId;
        const response = await Network.get(url, this.apiHeaders(url, referer, false));
        const payload = this.parseTencentJson(response, "腾讯动漫账号探针");
        if (String(payload.status) === "2" && payload.data && typeof payload.data === "object") {
            return payload.data;
        }
        if (this.isLoginStatus(payload.status)) {
            if (allowLoggedOut) return null;
            throw this.loginRequiredMessage();
        }
        throw this.apiFailure("腾讯动漫账号探针", payload);
    }

    async probeTencentAccount() {
        const data = await this.getComicUserInfo(this.accountProbeComicId, false);
        const token = String(data.token || "").trim();
        if (!token) throw "腾讯动漫账号探针未返回收藏校验 token，请重新登录";
        return { data: data, token: token };
    }

    async showAccountStatus() {
        try {
            await this.probeTencentAccount();
            UI.showMessage("腾讯动漫账号状态正常；可同步单一云收藏夹。网页没有可验证的签到接口，因此本源不提供签到。");
            return "ok";
        } catch (error) {
            UI.showMessage("腾讯动漫账号检查失败：" + error);
            throw error;
        }
    }

    async readFavoriteState(comicId) {
        try {
            const data = await this.getComicUserInfo(comicId, true);
            return data ? this.isCollected(data.is_coll) : false;
        } catch (error) {
            return false;
        }
    }

    async getUserCollection() {
        const url = this.desktopBaseUrl + "/MyPersonalCenter/getUserCollection";
        const response = await Network.get(url, this.apiHeaders(url, this.desktopBaseUrl + "/", false));
        const payload = this.parseTencentJson(response, "腾讯动漫收藏列表");
        if (this.isLoginStatus(payload.status)) throw this.loginRequiredMessage();
        if (String(payload.status) !== "2") throw this.apiFailure("腾讯动漫收藏列表", payload);
        const entries = Array.isArray(payload.data) ? payload.data : payload.data?.list;
        if (!Array.isArray(entries)) throw "腾讯动漫收藏列表格式已变化";
        return entries;
    }

    async loadFavoriteComics(page) {
        const entries = await this.getUserCollection();
        const comics = [];
        const seen = new Set();
        const pageSize = 12;
        const currentPage = Math.max(1, Math.trunc(Number(page) || 1));
        const pageEntries = entries.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        for (const entry of pageEntries) {
            let numericId;
            try {
                numericId = this.normalizeComicId(entry?.id ?? entry?.comicId);
            } catch (error) {
                continue;
            }
            let title = String(entry?.title || entry?.comicTitle || "").trim();
            let cover = this.toAbsolute(entry?.coverUrl || entry?.cover || "", this.desktopBaseUrl + "/");
            if (!title || !cover) {
                const detailUrl = this.mobileComicUrl(numericId);
                const document = await this.loadDocument(detailUrl, this.baseUrl);
                try {
                    if (!title) title = this.readValue(document, "h1.top-title", "") || this.readValue(document, "h1", "");
                    if (!cover) cover = this.toAbsolute(this.readValue(document, "img.head-cover", "src"), detailUrl);
                } finally {
                    document.dispose();
                }
            }
            if (!title || !cover || seen.has(numericId)) continue;
            seen.add(numericId);
            comics.push(new Comic({ id: numericId, title: title, cover: cover }));
        }
        const maxPage = Math.max(1, Math.ceil(entries.length / pageSize));
        return { comics: comics, maxPage: maxPage };
    }

    formEncode(entries) {
        return entries
            .map((entry) => encodeURIComponent(String(entry[0])) + "=" + encodeURIComponent(String(entry[1])))
            .join("&");
    }

    async setFavoriteState(comicId, isAdding) {
        const numericId = this.normalizeComicId(comicId);
        const probe = await this.probeTencentAccount();
        const before = await this.getComicUserInfo(numericId, false);
        if (this.isCollected(before.is_coll) === isAdding) return;

        const url = isAdding
            ? this.desktopBaseUrl + "/MyPersonalCenter/addUserCollection"
            : this.desktopBaseUrl + "/Ajax/delCollection/comic_id/" + numericId;
        const bodyEntries = isAdding
            ? [["tokenKey", probe.token], ["comicId", numericId], ["seqNo", "0"]]
            : [["tokenKey", probe.token]];
        const response = await Network.post(
            url,
            this.apiHeaders(url, this.desktopBaseUrl + "/Comic/comicInfo/id/" + numericId, true),
            this.formEncode(bodyEntries),
        );
        const payload = this.parseTencentJson(response, isAdding ? "添加腾讯动漫收藏" : "删除腾讯动漫收藏");
        if (this.isLoginStatus(payload.status)) throw this.loginRequiredMessage();
        const accepted = isAdding
            ? String(payload.status) === "2" || String(payload.status) === "3"
            : String(payload.status) === "1";
        if (!accepted) throw this.apiFailure(isAdding ? "添加腾讯动漫收藏" : "删除腾讯动漫收藏", payload);

        for (let attempt = 0; attempt < 2; attempt += 1) {
            const after = await this.getComicUserInfo(numericId, false);
            if (this.isCollected(after.is_coll) === isAdding) return;
        }
        throw (isAdding ? "添加" : "删除") + "腾讯动漫收藏后，官网回读状态未确认";
    }

    // ==================== 卡片解析 ====================
    comicIdFromHref(href) {
        const match = String(href || "").match(/\/comic\/index\/id\/(\d+)/i);
        return match ? match[1] : "";
    }

    parseComicItem(item, pageUrl) {
        const link = item.querySelector(".comic-link");
        const titleEl = item.querySelector(".comic-title");
        if (!link || !titleEl) return null;

        const coverEl = item.querySelector(".cover-image");
        const update = this.normalizeText(item.querySelector(".comic-update")?.text);
        const tagsText = this.normalizeText(item.querySelector(".comic-tag")?.text);
        const desc = this.normalizeText(item.querySelector(".comic-desc")?.text);
        const subTitle = [update, tagsText].filter(e => e).join(" · ");

        return new Comic({
            id: this.comicIdFromHref(link.attributes.href),
            title: this.normalizeText(titleEl.text),
            cover: this.toAbsolute(coverEl?.attributes.src || coverEl?.attributes["data-original"] || "", pageUrl),
            subTitle: subTitle,
            description: desc,
            tags: tagsText ? tagsText.split(/\s+/) : []
        });
    }

    parseComicItems(doc, selector, pageUrl) {
        const comics = [];
        const seen = new Set();
        for (const item of doc.querySelectorAll(selector)) {
            const comic = this.parseComicItem(item, pageUrl);
            if (comic && comic.id && !seen.has(comic.id)) {
                seen.add(comic.id);
                comics.push(comic);
            }
        }
        return comics;
    }

    findHomepageRoot(document, definition) {
        const roots = Array.from(document.querySelectorAll(definition.rootSelector || "section.mod-item"));
        const expectedHeading = String(definition.headingText || definition.title || "").replace(/\s+/g, " ").trim();
        if (expectedHeading) {
            const headingMatch = roots.find((root) => {
                const heading = root.querySelector("h2.sub-title .title-content,h2.sub-title,h2,h3");
                return String(heading?.text || "").replace(/\s+/g, " ").trim() === expectedHeading;
            });
            if (headingMatch) return headingMatch;
        }
        return roots[Number(definition.rootIndex) || 0] || null;
    }

    // ==================== 手写 Nonce 算术解析器 ====================
    // 支持 Math.pow / Math.round / parseInt / charCodeAt / substring /
    // document.getElementsByTagName / 一元 / 算术 / 比较 / 按位 / 三目
    // 强制结果落在 0..255 字节范围内，避免执行服务端注入的任意 JS。
    evaluateSafeArithmetic(expression) {
        if (!expression || expression.length > 256) throw "Invalid nonce expression length";
        let index = 0;
        const skip = () => { while (/\s/.test(expression[index] || "")) index += 1; };
        const expect = (value) => {
            skip();
            if (!expression.startsWith(value, index)) throw "Unsupported nonce expression";
            index += value.length;
        };
        const primary = () => {
            skip();
            if (expression[index] === "(") {
                index += 1;
                const value = conditional();
                skip();
                if (expression[index] !== ")") throw "Invalid nonce parentheses";
                index += 1;
                return value;
            }
            if (expression.startsWith("Math.pow", index)) {
                index += "Math.pow".length;
                expect("(");
                const base = conditional();
                expect(",");
                const exponent = conditional();
                expect(")");
                return Math.pow(base, exponent);
            }
            if (expression.startsWith("Math.round", index)) {
                index += "Math.round".length;
                expect("(");
                const value = conditional();
                expect(")");
                return Math.round(value);
            }
            if (expression.startsWith("parseInt", index)) {
                index += "parseInt".length;
                expect("(");
                const value = conditional();
                expect(")");
                return Math.trunc(value);
            }
            for (const documentExpression of [
                "document.getElementsByTagName('html')",
                'document.getElementsByTagName("html")',
            ]) {
                if (expression.startsWith(documentExpression, index)) {
                    index += documentExpression.length;
                    return 1;
                }
            }
            if (expression[index] === "'" || expression[index] === '"') {
                const quote = expression[index];
                const end = expression.indexOf(quote, index + 1);
                if (end < 0) throw "Invalid nonce string";
                const literal = expression.slice(index + 1, end);
                if (!/^[A-Za-z0-9]{1,16}$/.test(literal)) throw "Unsupported nonce string";
                index = end + 1;
                if (expression.startsWith(".charCodeAt()", index)) {
                    index += ".charCodeAt()".length;
                    return literal.charCodeAt(0);
                }
                if (expression.startsWith(".substring", index)) {
                    index += ".substring".length;
                    expect("(");
                    const start = conditional();
                    skip();
                    let result;
                    if (expression[index] === ",") {
                        index += 1;
                        const endIndex = conditional();
                        expect(")");
                        result = literal.substring(Math.trunc(start), Math.trunc(endIndex));
                    } else {
                        expect(")");
                        result = literal.substring(Math.trunc(start));
                    }
                    const numeric = Number(result);
                    if (!Number.isFinite(numeric)) throw "Invalid nonce substring result";
                    return numeric;
                }
                throw "Unsupported nonce string method";
            }
            const match = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
            if (!match) throw "Invalid nonce number";
            index += match[0].length;
            return Number(match[0]);
        };
        const unary = () => {
            skip();
            const operator = expression[index];
            if (operator === "+" || operator === "-" || operator === "!" || operator === "~") {
                index += 1;
                const value = unary();
                if (operator === "+") return value;
                if (operator === "-") return -value;
                if (operator === "~") return ~value;
                return value ? 0 : 1;
            }
            return primary();
        };
        const multiply = () => {
            let value = unary();
            while (true) {
                skip();
                const operator = expression[index];
                if (operator !== "*" && operator !== "/" && operator !== "%") return value;
                index += 1;
                const right = unary();
                value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
            }
        };
        const addition = () => {
            let value = multiply();
            while (true) {
                skip();
                const operator = expression[index];
                if (operator !== "+" && operator !== "-") return value;
                index += 1;
                const right = multiply();
                value = operator === "+" ? value + right : value - right;
            }
        };
        const comparison = () => {
            let value = addition();
            while (true) {
                skip();
                const operator = ["===", "!==", "<=", ">=", "==", "!=", "<", ">"].find((item) =>
                    expression.startsWith(item, index),
                );
                if (!operator) return value;
                index += operator.length;
                const right = addition();
                if (operator === "<") value = value < right ? 1 : 0;
                else if (operator === "<=") value = value <= right ? 1 : 0;
                else if (operator === ">") value = value > right ? 1 : 0;
                else if (operator === ">=") value = value >= right ? 1 : 0;
                else if (operator === "!=" || operator === "!==") value = value !== right ? 1 : 0;
                else value = value === right ? 1 : 0;
            }
        };
        const bitwiseAnd = () => {
            let value = comparison();
            while (true) {
                skip();
                if (expression[index] !== "&" || expression[index + 1] === "&") return value;
                index += 1;
                value &= comparison();
            }
        };
        const conditional = () => {
            const condition = bitwiseAnd();
            skip();
            if (expression[index] !== "?") return condition;
            index += 1;
            const whenTrue = conditional();
            expect(":");
            const whenFalse = conditional();
            return condition ? whenTrue : whenFalse;
        };
        const result = conditional();
        skip();
        if (
            index !== expression.length ||
            !Number.isFinite(result) ||
            !Number.isSafeInteger(result) ||
            result < 0 ||
            result > 255
        ) throw "Unsafe nonce expression";
        return result;
    }

    findNonceAssignmentIndex(plainResponse) {
        const match = String(plainResponse || "").match(/window\[\s*"[^"]+"\s*\+\s*"[^"]+"\s*\]\s*=/);
        return match ? match.index : -1;
    }

    extractNonce(plainResponse, start) {
        const index = start === undefined ? this.findNonceAssignmentIndex(plainResponse) : start;
        if (index < 0) throw "章节响应中未找到 nonce";
        const nonceLine = String(plainResponse).substring(index).split(/\r?\n/)[0];
        const equalIndex = nonceLine.indexOf("=");
        if (equalIndex < 0) throw "章节 nonce 格式不匹配";
        const assignment = nonceLine.substring(equalIndex + 1).trim().replace(/;$/, "");

        let nonce = "";
        const partPattern = /\(\s*\+\s*eval\(\s*(["'])(.*?)\1\s*\)\s*\)\s*\.toString\(\s*\)|(["'])([A-Za-z0-9]*)\3/g;
        let part;
        while ((part = partPattern.exec(assignment)) !== null) {
            nonce += part[2] !== undefined
                ? String(this.evaluateSafeArithmetic(part[2]))
                : part[4];
        }
        if (!nonce) throw "章节 nonce 为空";
        return nonce;
    }

    normalizeChapterIdentifiers(comicId, epId) {
        const rawComicId = String(comicId || "");
        const rawEpId = String(epId || "");
        const combined = rawComicId + " " + rawEpId;
        const urlMatch = combined.match(/\/chapter\/index\/id\/(\d+)\/cid\/(\d+)/i);
        if (urlMatch) return { comicId: urlMatch[1], cid: urlMatch[2] };

        const pairMatch = combined.match(/(?:^|\s)(\d+)\s*[|,:_]\s*(\d+)(?:$|\s)/);
        if (pairMatch) return { comicId: pairMatch[1], cid: pairMatch[2] };

        if (/^\d+$/.test(rawComicId) && /^\d+$/.test(rawEpId)) {
            return { comicId: rawComicId, cid: rawEpId };
        }
        return null;
    }

    decodePlainChapter(plainResponse) {
        const response = String(plainResponse || "").trim();
        const markerIndex = this.findNonceAssignmentIndex(response);
        const raw = markerIndex >= 0 ? response.substring(0, markerIndex).trim() : response;
        const nonce = markerIndex >= 0 ? this.extractNonce(response, markerIndex) : null;
        const instructions = nonce ? (nonce.match(/\d+[a-zA-Z]+/g) || []) : [];
        const chars = raw.split("");

        for (let index = instructions.length - 1; index >= 0; index--) {
            const instruction = instructions[index];
            const position = parseInt(instruction.match(/\d+/)[0], 10) & 255;
            const interference = instruction.replace(/\d+/g, "");
            chars.splice(position, interference.length);
        }

        let encoded = chars.join("").replace(/-/g, "+").replace(/_/g, "/");
        const padding = (4 - encoded.length % 4) % 4;
        if (padding > 0) encoded += "=".repeat(padding);
        const jsonText = Convert.decodeUtf8(Convert.decodeBase64(encoded));
        return JSON.parse(jsonText);
    }

    isImageBytes(value) {
        if (!value || value.byteLength < 3) return false;
        const bytes = new Uint8Array(value);
        return (
            (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
            (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
            (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) ||
            (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[8] === 0x57)
        );
    }

    // ==================== 设置 ====================
    settings = {
        tencent_account_status: {
            title: "账号",
            type: "callback",
            buttonText: "检查",
            callback: async () => this.showAccountStatus(),
        },
        source_self_test: {
            title: "连接测试",
            type: "callback",
            buttonText: "测试",
            callback: async () => this.runSelfTest(),
        },
    };

    async runSelfTest() {
        try {
            await this.probeTencentAccount();

            const searchResult = await this.search.load("腾讯", [], 1);
            if (!searchResult.comics?.length) throw "搜索没有返回漫画";
            const first = searchResult.comics[0];
            const thumbnailConfig = this.comic.onThumbnailLoad(first.cover);
            const thumbnailResponse = await Network.fetchBytes(
                thumbnailConfig.method || "GET",
                thumbnailConfig.url || first.cover,
                thumbnailConfig.headers || {},
                new ArrayBuffer(0),
            );
            if (thumbnailResponse.status < 200 || thumbnailResponse.status >= 400 || !this.isImageBytes(thumbnailResponse.body)) {
                throw "搜索封面不是有效图片";
            }

            const categoryResult = await this.categoryComics.load("条漫", "tm|upt", [], 1);
            if (!categoryResult.comics?.length) throw "分类没有返回漫画";

            const exploreParts = await this.explore[0].load();
            if (!exploreParts || Array.isArray(exploreParts) || Object.keys(exploreParts).length === 0) {
                throw "腾讯动漫首页推荐分区为空";
            }
            let someSectionOk = false;
            for (const title of Object.keys(exploreParts)) {
                if (Array.isArray(exploreParts[title]) && exploreParts[title].length > 0) {
                    someSectionOk = true;
                    break;
                }
            }
            if (!someSectionOk) throw "腾讯动漫首页所有分区均为空";

            const info = await this.comic.loadInfo(first.id);
            if (!info.title || !info.cover || !info.chapters || info.chapters.size === 0) {
                throw "详情或公开章节不完整";
            }

            let epId = "";
            let pages = null;
            let chapterError = "没有找到网页公开可读章节";
            for (const candidateEpId of Array.from(info.chapters.keys()).slice(0, 8)) {
                try {
                    const candidatePages = await this.comic.loadEp(first.id, candidateEpId);
                    if (candidatePages.images?.length) {
                        epId = candidateEpId;
                        pages = candidatePages;
                        break;
                    }
                } catch (error) {
                    chapterError = String(error);
                }
            }
            if (!pages || !pages.images?.length) throw chapterError;

            const imageConfig = this.comic.onImageLoad(pages.images[0], first.id, epId);
            const imageResponse = await Network.fetchBytes(
                imageConfig.method || "GET",
                imageConfig.url || pages.images[0],
                imageConfig.headers || {},
                new ArrayBuffer(0),
            );
            if (imageResponse.status < 200 || imageResponse.status >= 400 || !this.isImageBytes(imageResponse.body)) {
                throw "正文首图不是有效图片";
            }
            UI.showMessage("自检通过：账号 Cookie、搜索、分类、发现、详情、服务器授权章节与首图均可用");
            return "ok";
        } catch (error) {
            UI.showMessage("自检失败：" + error);
            throw error;
        }
    }

    // ==================== 账号 ====================
    account = {
        loginWithWebview: {
            url: "https://m.ac.qq.com/Home/login?ret_url=https%3A%2F%2Fm.ac.qq.com%2F%3Fvenera_login_success%3D1",
            checkStatus: (url) => String(url || "") === "https://m.ac.qq.com/?venera_login_success=1",
            onLoginSuccess: () => UI.showMessage("网页登录已返回腾讯动漫；请在“账号”一项点“检查”确认 Cookie 是否生效"),
        },
        logout: () => {
            Network.deleteCookies("https://m.ac.qq.com");
            Network.deleteCookies("https://ac.qq.com");
            try {
                if (typeof this.deleteData === "function") this.deleteData("_localStorage");
            } catch (error) {
            }
        },
        registerWebsite: null,
    };

    // ==================== 收藏 ====================
    favorites = {
        multiFolder: false,
        addOrDelFavorite: async (comicId, folderId, isAdding) => {
            await this.setFavoriteState(comicId, Boolean(isAdding));
            return "ok";
        },
        loadComics: async (page, folder) => this.loadFavoriteComics(page),
        singleFolderForSingleComic: false,
        isOldToNewSort: false,
    };

    // ==================== 搜索 ====================
    search = {
        load: async (keyword, options, page) => {
            try {
                const pageNumber = Math.max(1, Number(page) || 1);
                const url = this.searchUrlTemplate
                    .replace("{keyword}", encodeURIComponent(keyword))
                    .replace("{page}", String(pageNumber));
                const document = await this.loadDocument(url, this.baseUrl + "/search/index");
                try {
                    const comics = this.parseComicItems(document, "#lst_searchResult .comic-item, .comic-item", url);
                    const maxPage = await this.resolveListMaxPage(
                        "search:" + String(keyword || ""),
                        document,
                        pageNumber,
                        Math.max(1, comics.length),
                        async (probePage) => this.loadDocument(
                            this.searchUrlTemplate
                                .replace("{keyword}", encodeURIComponent(keyword))
                                .replace("{page}", String(probePage)),
                            url,
                        ),
                    );
                    return { comics: comics, maxPage: maxPage };
                } finally {
                    document.dispose();
                }
            } catch (e) {
                return { comics: [], maxPage: 1 };
            }
        },
        optionList: [],
    };

    // ==================== 分类 ====================
    category = {
        title: "腾讯动漫（正版）",
        parts: [
            {
                name: "作品类型",
                type: "fixed",
                categories: ["条漫", "独家", "完结", "日漫", "恋爱", "玄幻", "热血", "悬疑", "少女", "韩漫", "科幻", "逗比", "校园", "都市", "治愈", "恐怖", "妖怪"],
                categoryParams: ["tm|upt", "dj|upt", "wj|upt", "rm|upt", "na|pgv", "xh|pgv", "rx|pgv", "xy|pgv", "sv|pgv", "hm|pgv", "kh|pgv", "db|pgv", "qcxy|pgv", "ds|pgv", "zy|pgv", "kb|pgv", "yg|pgv"],
                itemType: "category"
            }
        ],
        enableRankingPage: false,
    };

    categoryComics = {
        load: async (category, param, options, page) => {
            try {
                const sourceUrl = String(param || "na|pgv");
                const values = sourceUrl.split("|");
                const type = values[0] || "na";
                const rank = values[1] || "pgv";
                const buildUrl = (p) =>
                    this.baseUrl + "/category/listAll/type/" + encodeURIComponent(type) +
                    "/rank/" + encodeURIComponent(rank) +
                    "?page=" + p + "&pageSize=15&style=items";

                const pageNumber = Math.max(1, Number(page) || 1);
                const url = buildUrl(pageNumber);
                const document = await this.loadDocument(url, this.baseUrl + "/category/index");
                try {
                    const comics = this.parseComicItems(document, ".comic-item", url);
                    const maxPage = await this.resolveListMaxPage(
                        "category:" + sourceUrl,
                        document,
                        pageNumber,
                        Math.max(1, comics.length),
                        async (probePage) => this.loadDocument(buildUrl(probePage), url),
                    );
                    return { comics: comics, maxPage: maxPage };
                } finally {
                    document.dispose();
                }
            } catch (e) {
                return { comics: [], maxPage: page };
            }
        },
        optionList: [],
    };

    // ==================== 探索 ====================
    explore = [
        {
            title: "腾讯动漫（正版）",
            type: "singlePageWithMultiPart",
            load: async () => {
                try {
                    const res = await Network.get(this.baseUrl + "/", this.requestHeaders(this.baseUrl + "/"));
                    if (!res || !res.body) return {};
                    const doc = new HtmlDocument(res.body);
                    const result = {};
                    const sections = doc.querySelectorAll("section.mod-item");

                    for (const section of sections) {
                        const titleEl = section.querySelector(".title-content") || section.querySelector(".sub-title");
                        const title = this.normalizeText(titleEl?.text);
                        const comics = this.parseComicItems(section, ".comic-item", this.baseUrl + "/");
                        if (title && comics.length > 0) result[title] = comics;
                    }
                    doc.dispose();
                    return result;
                } catch (e) {
                    return {};
                }
            }
        }
    ];

    // ==================== 漫画 ====================
    comic = {
        loadInfo: async (id) => {
            try {
                const numericId = this.normalizeComicId(id);
                const detailUrl = this.baseUrl + "/comic/index/id/" + numericId;
                const res = await Network.get(detailUrl, this.requestHeaders(detailUrl, this.baseUrl));
                if (!res || !res.body) throw "详情页为空";
                const doc = new HtmlDocument(res.body);

                const title = this.normalizeText(doc.querySelector(".head-title-tags h1")?.text || doc.querySelector("h1")?.text);
                let cover = this.toAbsolute(doc.querySelector(".head-cover")?.attributes.src || "", detailUrl);
                const description = this.normalizeText(doc.querySelector(".head-info-desc")?.text);
                const author = this.normalizeText(doc.querySelector(".head-info-author")?.text).replace(/^作者[：:]?/, "");
                const tags = {};
                if (author) tags["作者"] = [author];

                const chapters = new Map();
                const previewChapter = doc.querySelector(".chapter-link");
                const firstCid = previewChapter?.attributes["data-cid"];
                for (const chapter of doc.querySelectorAll(".chapter-link")) {
                    const cid = chapter.attributes["data-cid"];
                    const chapterTitle = this.normalizeText(chapter.querySelector(".chapter-title")?.text);
                    if (cid && chapterTitle && !chapters.has(cid)) chapters.set(cid, chapterTitle);
                }
                doc.dispose();

                if (firstCid) {
                    const chapterUrl = this.baseUrl + "/chapter/index/id/" + numericId + "/cid/" + firstCid;
                    const chapterRes = await Network.get(chapterUrl, this.requestHeaders(chapterUrl, detailUrl));
                    if (chapterRes && chapterRes.body) {
                        const chapterDoc = new HtmlDocument(chapterRes.body);
                        const chapterCover = this.toAbsolute(
                            chapterDoc.querySelector('meta[itemprop="image"]')?.attributes.content || "",
                            chapterUrl,
                        );
                        if (chapterCover) cover = chapterCover;
                        const chapterDataText = chapterDoc.getElementById("data_chapterInfo")?.text;
                        if (chapterDataText) {
                            try {
                                const chapterData = JSON.parse(chapterDataText);
                                for (const chapter of chapterData) {
                                    const cid = String(chapter.cid || "");
                                    const chapterTitle = this.normalizeText(chapter.title || chapter.cTitle);
                                    if (cid && chapterTitle && !chapters.has(cid)) chapters.set(cid, chapterTitle);
                                }
                            } catch (err) {}
                        }
                        chapterDoc.dispose();
                    }
                }

                const isFavorite = await this.readFavoriteState(numericId);

                return new ComicDetails({
                    title,
                    cover,
                    description,
                    tags,
                    chapters,
                    isFavorite: isFavorite,
                    thumbnails: cover ? [cover] : [],
                    url: detailUrl,
                });
            } catch (e) {
                return new ComicDetails({ title: "加载失败", chapters: new Map() });
            }
        },

        loadEp: async (comicId, epId) => {
            const ids = this.normalizeChapterIdentifiers(comicId, epId);
            if (!ids) return { images: [] };

            const url = this.baseUrl + "/chapter/index/id/" + ids.comicId + "/cid/" + ids.cid + "?style=plain";
            const res = await Network.get(url, this.requestHeaders(url, this.baseUrl + "/comic/index/id/" + ids.comicId));
            if (!res || res.status < 200 || res.status >= 400) {
                throw "Invalid chapter status: " + (res ? res.status : "no response");
            }
            const data = this.decodePlainChapter(String(res.body || ""));
            const chapter = data.chapter || {};
            if (Number(chapter.is_app_chapter) > 0) throw "该章节为腾讯动漫 APP 专属内容";
            if (chapter.canRead !== true) throw "腾讯动漫服务器未授予该账号网页阅读权限";

            const images = [];
            const seen = new Set();
            for (const picture of (data.picture || [])) {
                const imageUrl = this.toAbsolute(picture.url || "", url);
                if (imageUrl && !seen.has(imageUrl)) {
                    seen.add(imageUrl);
                    images.push(imageUrl);
                }
            }
            if (images.length === 0) throw "Public chapter has no images";
            return { images: images };
        },

        onThumbnailLoad: (url) => ({
            url: this.toAbsolute(String(url || ""), this.baseUrl),
            method: "GET",
            headers: {
                "Referer": this.baseUrl + "/",
                "User-Agent": this.mobileUserAgent,
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            },
        }),

        onImageLoad: (url, comicId, epId) => ({
            url: url,
            method: "GET",
            headers: {
                "Referer": epId && comicId
                    ? this.baseUrl + "/comic/index/id/" + this.normalizeComicId(comicId)
                    : this.baseUrl + "/",
                "User-Agent": this.mobileUserAgent,
                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            },
        }),

        link: {
            domains: ["m.ac.qq.com", "ac.qq.com"],
            linkToId: (url) => {
                const match = String(url || "").match(/\/comic\/index\/id\/(\d+)/i);
                return match ? match[1] : null;
            }
        },

        idMatch: "^\\d+$",
    };

    // ==================== 历史页封面钩子（顶层）====================
    onThumbnailLoad(url) {
        return {
            url: this.toAbsolute(String(url || ""), this.baseUrl),
            headers: {
                "Referer": this.baseUrl + "/",
                "User-Agent": this.mobileUserAgent,
            }
        };
    }
}