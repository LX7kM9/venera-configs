/** @type {import('../_venera_.js')} */
class Manben extends ComicSource {
    name = "漫本"
    key = "manben"
    version = "1.1.0"   // 基于实际 HTML 结构解析简介/标签/分组章节
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/LX7kM9/venera-configs@main/manben.js"

    get baseUrl() { return "https://www.manben.com"; }

    _headers() {
        return {
            'user-agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'referer': this.baseUrl + '/',
        };
    }

    _imgHeaders(url, referer) {
        return {
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': referer || (this.baseUrl + '/'),
            'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        };
    }

    _abs(url) {
        if (!url) return '';
        let s = String(url).trim();
        if (/^https?:\/\//i.test(s)) return s.replace(/^http:/i, 'https:');
        if (s.startsWith('//')) return 'https:' + s;
        if (s.startsWith('/')) return this.baseUrl + s;
        return this.baseUrl + '/' + s;
    }

    _imgSrc(img) {
        if (!img || !img.attributes) return '';
        let a = img.attributes;
        return a['data-src'] || a['data-original'] || a['data-lazy-src'] || a['src'] || '';
    }

    _cleanTitle(t) {
        if (!t) return '';
        let s = String(t).trim();
        let m = s.match(/《([^》]+)》/);
        if (m) s = m[1];
        s = s.replace(/[，,。.、!！\?？]*\s*更新至.*$/, '');
        s = s.replace(/漫画$/, '');
        return s.trim();
    }

    // ============ 探索页 ============
    explore = [
        {
            title: "漫本",
            type: "singlePageWithMultiPart",
            load: async () => {
                let res = await Network.get(this.baseUrl + '/', this._headers());
                if (res.status !== 200) throw `Invalid status: ${res.status}`;
                let doc = new HtmlDocument(res.body);
                let comics = [];
                let seen = {};

                for (let a of doc.querySelectorAll('a[href]')) {
                    let href = a.attributes['href'] || '';
                    let m = href.match(/\/?(mh-[^\/\?#]+)/);
                    if (!m) continue;
                    let id = m[1];
                    if (seen[id]) continue;
                    if (/mh-(updated|boutique|recommend|rank|new|hot|categor|all|index|search|tags|top|list)/i.test(id)) continue;

                    let title = a.attributes['title'] || '';
                    if (!title) {
                        let tEl = a.querySelector('.title, .name, h3, h4, p');
                        if (tEl) title = tEl.text || '';
                    }
                    if (!title) title = a.text || '';
                    if (!title) {
                        let img = a.querySelector('img');
                        if (img && img.attributes) title = img.attributes['alt'] || '';
                    }
                    title = this._cleanTitle(title);
                    if (!title) continue;

                    let img = a.querySelector('img');
                    seen[id] = true;
                    comics.push(new Comic({
                        id: id,
                        title: title,
                        cover: this._abs(this._imgSrc(img)),
                    }));
                }

                if (comics.length === 0) throw "首页未解析到漫画";
                return { "全部漫画": comics };
            }
        }
    ];

    // ============ 搜索 ============
    search = {
        load: async (keyword, options, page) => {
            page = page || 1;
            let url = `${this.baseUrl}/search?page=${page}&title=${encodeURIComponent(keyword)}&language=1`;
            let res = await Network.get(url, this._headers());
            if (res.status !== 200) throw `Search failed: ${res.status}`;
            let doc = new HtmlDocument(res.body);
            let comics = [];
            let seen = {};

            for (let a of doc.querySelectorAll('a[href]')) {
                let href = a.attributes['href'] || '';
                let m = href.match(/\/?(mh-[^\/\?#]+)/);
                if (!m) continue;
                let id = m[1];
                if (seen[id]) continue;
                if (/mh-(updated|boutique|recommend|rank|new|hot|categor|all|index|search|tags|top|list)/i.test(id)) continue;

                let title = a.attributes['title'] || '';
                if (!title) {
                    let tEl = a.querySelector('.title, .name, h3, h4');
                    if (tEl) title = tEl.text || '';
                }
                if (!title) title = a.text || '';
                if (!title) {
                    let img = a.querySelector('img');
                    if (img && img.attributes) title = img.attributes['alt'] || '';
                }
                title = this._cleanTitle(title);
                if (!title) continue;

                let img = a.querySelector('img');
                seen[id] = true;
                comics.push(new Comic({
                    id: id,
                    title: title,
                    cover: this._abs(this._imgSrc(img)),
                }));
            }
            return { comics, maxPage: comics.length > 0 ? page + 1 : page };
        },
        optionList: [],
        enableTagsSuggestions: false
    };

    // ============ 详情页 ============
    comic = {
        idMatch: "^(https?://(www\\.)?manben\\.com)?/?mh-[^/?#]+/?$",

        link: {
            domains: ["www.manben.com", "manben.com"],
            linkToId: (url) => {
                let m = String(url || '').match(/(mh-[^\/\?#]+)/);
                if (m) return m[1];
                return null;
            }
        },

        loadInfo: async (id) => {
            let cid = String(id);
            if (/^https?:\/\//i.test(cid)) {
                let m = cid.match(/(mh-[^\/\?#]+)/);
                if (m) cid = m[1];
            }
            if (!cid.startsWith('mh-')) cid = 'mh-' + cid.replace(/^\/+|\/+$/g, '');

            let targetUrl = `${this.baseUrl}/${cid}/`;
            let res = await Network.get(targetUrl, this._headers());
            if (res.status !== 200) throw `请求失败: ${res.status}`;
            let doc = new HtmlDocument(res.body);

            // ===== 标题 =====
            let title = '';
            let tEl = doc.querySelector('.detailTop .info .title');
            if (tEl) title = (tEl.text || '').trim();
            if (!title) {
                let pt = doc.querySelector('title');
                if (pt) title = (pt.text || '').replace(/_.*$/, '').trim();
            }
            if (!title) title = cid;
            title = title.replace(/漫画$/, '').trim();

            // ===== 封面 =====
            let cover = '';
            let coverEl = doc.querySelector('.detailTop .info .cover')
                || doc.querySelector('.detailTop img.cover')
                || doc.querySelector('img.cover');
            if (coverEl) cover = this._imgSrc(coverEl);

            // ===== 作者 / 类型 从 .subtitle 解析 =====
            let author = '';
            let tags = [];
            let subtitles = doc.querySelectorAll('.detailTop .info .subtitle');
            for (let s of subtitles) {
                let t = (s.text || '').trim();
                if (!t) continue;
                // 作者： 邱福龙 瑛麒动漫
                if (t.startsWith('作者')) {
                    author = t.replace(/^作者[:：]\s*/, '').trim();
                }
                // 类型：热血/奇幻
                else if (t.startsWith('类型')) {
                    let raw = t.replace(/^类型[:：]\s*/, '').trim();
                    if (raw) {
                        tags = raw.split(/[\/、,，\s]+/).map(x => x.trim()).filter(x => x);
                    }
                }
            }

            // ===== 简介 =====
            let description = '';
            let descEl = doc.querySelector('.detailContent p');
            if (descEl) description = (descEl.text || '').trim();
            if (!description) {
                let md = doc.querySelector('meta[name="Description"], meta[name="description"]');
                if (md && md.attributes) {
                    let d = (md.attributes['content'] || '').trim();
                    if (d && !d.includes('漫本是首个华人原创')) description = d;
                }
            }

            // ===== 章节：分组 =====
            // tab 名称（去掉 ·）
            let tabNames = [];
            for (let li of doc.querySelectorAll('.detailSelectBar li')) {
                let t = (li.text || '').replace(/·/g, '').trim();
                if (t) tabNames.push(t);
            }

            // 章节分组：swiper-wrapper > .chapter
            let chapters = new Map();
            let groups = doc.querySelectorAll('#chapter .swiper-wrapper > .chapter');
            if (groups.length === 0) {
                // 兜底：整个页面
                groups = doc.querySelectorAll('.chapter');
            }

            let idx = 0;
            for (let g of groups) {
                let groupName = tabNames[idx] || ('分组' + (idx + 1));
                let groupChapters = new Map();

                for (let a of g.querySelectorAll('a[href]')) {
                    let href = a.attributes['href'] || '';
                    let m = href.match(/^\/(m\d+)\/?$/);
                    if (!m) continue;
                    let name = (a.text || '').trim();
                    if (!name) name = (a.attributes['title'] || '').trim();
                    if (!name) continue;
                    let absHref = this.baseUrl + '/m' + m[1] + '/';
                    if (!groupChapters.has(absHref)) {
                        groupChapters.set(absHref, name);
                    }
                }

                if (groupChapters.size > 0) {
                    chapters.set(groupName, groupChapters);
                }
                idx++;
            }

            if (chapters.size === 0) throw "No chapters";

            let tagsObj = {};
            if (author) tagsObj['作者'] = [author];
            if (tags.length > 0) tagsObj['类型'] = tags;

            return new ComicDetails({
                title,
                cover: this._abs(cover),
                description: description || '暂无描述',
                tags: tagsObj,
                chapters,
                url: targetUrl,
            });
        },

        // epId 是章节完整 URL（已含 /mxxxxxx/）
        loadEp: async (comicId, epId) => {
            let url = String(epId);
            if (!/^https?:\/\//i.test(url)) url = this._abs(url);
            // 确保末尾有斜杠
            if (!/\/$/.test(url)) url += '/';

            let res = await Network.get(url, {
                ...this._headers(),
                referer: `${this.baseUrl}/${comicId}/`,
            });
            if (res.status !== 200) throw `Invalid status: ${res.status}`;
            let html = res.body || '';

            let script = null;
            let m = html.match(/>eval\(([\s\S]*?)\)\s*<\/script>/);
            if (m) {
                script = m[1];
            } else {
                let doc = new HtmlDocument(html);
                for (let s of doc.querySelectorAll('script')) {
                    let content = s.innerHTML || s.text || '';
                    if (content.includes('eval(function(p,a,c,k,e,d)')) {
                        let mm = content.match(/eval\(([\s\S]*?)\)\s*$/);
                        if (mm) { script = mm[1]; break; }
                    }
                }
            }
            if (!script) throw "章节内容解析失败/付费章节";

            let fn = new Function(`
                var newImgs;
                var jseval = (${script});
                eval(jseval);
                return newImgs;
            `);
            let imgs = fn();
            if (!Array.isArray(imgs) || imgs.length === 0) throw "无图片";
            imgs = imgs.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u));
            if (imgs.length === 0) throw "无有效图片";
            return { images: imgs };
        },

        onImageLoad: (url, comicId, epId) => {
            return { headers: this._imgHeaders(url, this.baseUrl + '/') };
        },

        onThumbnailLoad: (url) => {
            return { headers: this._imgHeaders(url, this.baseUrl + '/') };
        }
    };
}