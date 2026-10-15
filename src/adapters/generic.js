'use strict';
// 配置驱动的通用 HTML 适配器引擎。
// 一个引擎跑所有"公开 HTML 站点"源: 每个源只是一份声明式配置 (选择器 + 请求模板),
// 引擎据此实现 search/detail/catalog/content 四个方法。
//
// 配置格式 (选择器语法同 lib/rule.js: `sel@op##regex##repl`):
// {
//   name: '源站名', base: 'https://site.com',
//   headers: { Referer: '...' },              // 附加请求头 (可选)
//   search: {
//     request: { url: '/?q={{key}}&page={{page}}' }   // 或 { method:'POST', url, body }
//     list: 'dl.hot dd',                      // 列表项选择器
//     fields: { title:'h4 a@text', author:'...', bookUrl:'h4 a@href', cover:'img@src', desc:'...' },
//   },
//   detail: { fields: { title:'h1@text', author:'...', desc:'...', cover:'...', tags:'...' } },
//   catalog: { list:'ul.list li', title:'a@text', url:'a@href' },
//   content: { content:'#content@html', next:'#next@href' },   // next 可选 (分页)
// }
const { cheerio, evalRule } = require('../lib/rule');
const { request } = require('../lib/http');
const cfsession = require('../lib/cfsession');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function tmpl(str, vars) {
  return String(str).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}
function abs(base, href) {
  if (!href) return href;
  const url = /^https?:\/\//.test(href)
    ? href
    : base.replace(/\/$/, '') + (href.startsWith('/') ? '' : '/') + href;
  // 站点以 https 提供却回吐 http:// 绝对链接时, 升到 https:
  // CF 挑战站的 cf_clearance 绑定 https, 走 http 会在重定向前就被拦回挑战页。
  if (base.startsWith('https://') && url.startsWith('http://')) {
    try {
      if (new URL(url).host === new URL(base).host) return 'https://' + url.slice('http://'.length);
    } catch (e) { /* 非法 URL 原样返回 */ }
  }
  return url;
}
// 书籍 id: 取 URL 中最后一个数字段 (避免误抓 www.qb5 里的 5)
function lastNum(url) {
  return (String(url || '').match(/(\d+)(?!.*\d)/) || [])[1] || '';
}

function createAdapter(cfg) {
  const base = cfg.base;
  const headers = { 'User-Agent': DEFAULT_UA, ...(cfg.headers || {}) };
  const host = (() => { try { return new URL(base).hostname; } catch (e) { return ''; } })();

  // Cloudflare 挑战站 (cfg.cf): 所有网络请求都交给 cfsession.fetchText。它会先走纯 HTTP,
  // 只有响应确实是挑战页时才开浏览器过挑战; 若站点 WAF 按请求栈指纹判定 (如茶马),
  // 则自动切到浏览器内 fetch。非 CF 源仍走普通 request, 零额外开销。
  function cfReq(url, opts) {
    return cfsession.fetchText(host, base, url, opts);
  }
  async function req(url, opts = {}) {
    if (cfg.cf) return cfReq(url, opts);
    return request(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  }
  // 传给站点专属 build 钩子 (catalog/content) 的请求器: CF 源走 cfReq, 其余走普通 request。
  function ctxFetcher() {
    if (!cfg.cf) return (url, opts = {}) => request(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    return (url, opts = {}) => cfReq(url, opts);
  }

  // 书籍页 URL 归一化: 有的站点搜索给 /xs-1.html, 详情/目录在 /xs-1/
  function normalizeBookUrl(url) {
    if (!url || !cfg.bookUrlTransform) return url;
    try {
      // eslint-disable-next-line no-new-func
      return new Function('url', `return (${cfg.bookUrlTransform});`)(url);
    } catch (e) { return url; }
  }

  async function fetchDoc(path, { method = 'GET', body, vars = {} } = {}) {
    const url = /^https?:\/\//.test(path) ? tmpl(path, vars) : base + tmpl(path, vars);
    const h = {};
    if (body) h['Content-Type'] = cfg.search && cfg.search.request && cfg.search.request.contentType
      ? cfg.search.request.contentType : 'application/x-www-form-urlencoded';
    const r = await req(url, { method, headers: h, body });
    return cheerio.load(r.text);
  }

  function fieldList($, nodes, fields) {
    const out = [];
    nodes.each((_, el) => {
      const $el = $(el);
      const item = {};
      for (const [k, rule] of Object.entries(fields)) {
        let v = rule ? evalRule($, $el, rule) : '';
        if (k === 'bookUrl' && v) v = abs(base, v);
        if (k === 'cover' && v) v = abs(base, v);
        item[k] = v == null ? '' : v;
      }
      out.push(item);
    });
    return out;
  }

  async function search(keyword, page = 1) {
    const req = cfg.search.request;
    const vars = { key: encodeURIComponent(keyword), page };
    const $ = await fetchDoc(req.url, { method: req.method || 'GET', body: req.body ? tmpl(req.body, vars) : undefined, vars });
    const nodes = $(cfg.search.list);
    return fieldList($, nodes, cfg.search.fields).map((b) => ({
      title: b.title || '', author: b.author || '', cover: b.cover || '',
      desc: b.desc || '', tags: b.tags || '', wordCount: b.wordCount || '',
      latestChapterTitle: b.latestChapterTitle || '',
      source: cfg.name, tab: 'novel',
      book_url: b.bookUrl || '', bookid: lastNum(b.bookUrl),
    })).filter((b) => b.title && b.book_url);
  }

  async function detail({ url, bookid } = {}) {
    let bookUrl = url || (bookid ? tmpl(cfg.detail.urlFromId || '/book/{{id}}', { id: bookid }) : '');
    if (!bookUrl) throw new Error('detail: 缺少 url/bookid');
    bookUrl = normalizeBookUrl(bookUrl);
    const $ = await fetchDoc(bookUrl);
    const f = cfg.detail.fields;
    const pick = (rule) => (rule ? (evalRule($, $.root(), rule) || '') : '');
    const bookId = lastNum(bookUrl) || bookid || '';
    return {
      title: pick(f.title), author: pick(f.author),
      cover: abs(base, pick(f.cover)), desc: pick(f.desc), tags: pick(f.tags),
      wordCount: pick(f.wordCount), latestChapterTitle: pick(f.latestChapterTitle),
      source: cfg.name, tab: 'novel', book_url: bookUrl, bookid: bookId,
    };
  }

  async function catalog({ url, bookid } = {}) {
    let bookUrl = url || (bookid ? tmpl(cfg.detail.urlFromId || '/book/{{id}}', { id: bookid }) : '');
    if (!bookUrl) throw new Error('catalog: 缺少 url/bookid');
    bookUrl = normalizeBookUrl(bookUrl);
    const $ = await fetchDoc(bookUrl);

    // 站点专属目录构建钩子: 处理分页/JSONP/加密目录 (如 qb5)
    if (cfg.catalog.build) {
      const ctxHeaders = { ...headers };
      const raw = await cfg.catalog.build({ $, html: $.html(), bookUrl, base, headers: ctxHeaders, fetch: ctxFetcher(), abs });
      return raw.map((c, i) => ({
        title: c.title || '', url: c.url || '', cid: i,
        tag: '', isVolume: false, isVip: false, isPay: false,
      }));
    }

    const chapters = [];
    let cid = 0;
    $(cfg.catalog.list).each((_, el) => {
      const $el = $(el);
      const title = evalRule($, $el, cfg.catalog.title);
      const href = evalRule($, $el, cfg.catalog.url);
      if (!title || !href) return;
      chapters.push({
        title: String(title).trim(), url: abs(base, href), cid: cid++,
        tag: '', isVolume: false, isVip: false, isPay: false,
      });
    });
    return chapters;
  }

  async function content(chapterParams = {}) {
    // 未知源契约: chapterParams = { cid, source, url: 书籍页URL }
    // 先拉目录定位章节, 再抓正文 (分页沿 next 递归)
    const list = await catalog({ url: chapterParams.url, bookid: chapterParams.bookid });
    const idx = Number(chapterParams.cid);
    const chapter = list[idx];
    if (!chapter) throw new Error(`content: cid ${idx} 越界 (目录 ${list.length} 章)`);

    // 站点专属正文构建钩子: 处理两步取文/token 签名等 (如 得奇 ajax2.php)
    if (cfg.content.build) {
      const ctxHeaders = { ...headers };
      const text = await cfg.content.build({ chapter, list, bookUrl: chapterParams.url, base, headers: ctxHeaders, fetch: ctxFetcher(), abs });
      return { content: String(text || ''), source: cfg.name, tab: 'novel', notice: null };
    }

    let pageUrl = chapter.url;
    const parts = [];
    for (let guard = 0; guard < 30; guard++) {
      const $ = await fetchDoc(pageUrl);
      parts.push(evalRule($, $.root(), cfg.content.content) || '');
      const nextRule = cfg.content.next;
      if (!nextRule) break;
      const nextHref = evalRule($, $.root(), nextRule);
      if (!nextHref) break;
      pageUrl = abs(base, nextHref);
    }
    return { content: parts.join('\n'), source: cfg.name, tab: 'novel', notice: null };
  }

  return { name: cfg.name, base, search, detail, catalog, content };
}

module.exports = { createAdapter, abs, tmpl };
