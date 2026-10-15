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

// 番茄分类 (cat: { id, name, kw, aliases? }) 归一化到本站分类表 (cats: { 本站分类名: 路径值 })。
// 三级匹配: 精确 -> 本站分类名含番茄词 (如「玄幻言情」含「玄幻」) -> 番茄词含本站分类名。
// 匹配不到返回 null, 由调用方回退关键词检索 (绝不因缺分类而返回空列表)。
function matchCatKey(cats, cat) {
  if (!cats || !cat) return null;
  const keys = [cat.name, cat.kw, ...(cat.aliases || [])]
    .filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
  if (!keys.length) return null;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(cats, k)) return cats[k];
  }
  const names = Object.keys(cats);
  for (const n of names) for (const k of keys) if (k.length >= 2 && n.includes(k)) return cats[n];
  for (const n of names) for (const k of keys) if (n.length >= 2 && k.includes(n)) return cats[n];
  return null;
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
    // 站点命中唯一结果时直接 302 到书籍详情页, 列表选择器会落空 (如得奇)。
    // 此时详情页字段 (detail.fields) 就是这次搜索的唯一结果, 用同一套选择器兜底解析。
    if (!nodes.length && cfg.search.singleAsDetail) {
      const f = cfg.detail.fields;
      const pick = (rule) => (rule ? (evalRule($, $.root(), rule) || '') : '');
      const href = pick(cfg.search.singleUrlRule || 'link[rel=canonical]@href') || '';
      const title = pick(f.title);
      if (title && href) {
        const bookUrl = abs(base, href);
        return [{
          title, author: pick(f.author) || '', cover: abs(base, pick(f.cover)) || '',
          desc: pick(f.desc) || '', tags: pick(f.tags) || '', wordCount: pick(f.wordCount) || '',
          latestChapterTitle: pick(f.latestChapterTitle) || '',
          source: cfg.name, tab: 'novel',
          book_url: bookUrl, bookid: lastNum(bookUrl),
        }];
      }
      return [];
    }
    return fieldList($, nodes, cfg.search.fields).map((b) => ({
      title: b.title || '', author: b.author || '', cover: b.cover || '',
      desc: b.desc || '', tags: b.tags || '', wordCount: b.wordCount || '',
      latestChapterTitle: b.latestChapterTitle || '',
      source: cfg.name, tab: 'novel',
      book_url: b.bookUrl || '', bookid: lastNum(b.bookUrl),
    })).filter((b) => b.title && b.book_url);
  }

  // 分类浏览 (声明式源可选能力): 按站点真实分类页取书单, 而非把分类名当关键词搜。
  // cat = { id, name, kw } (来自 explore-categories); page >= 1。
  // 返回 null 表示本站无分类页配置或该分类未映射 -> 调用方回退 search()。
  // 返回数组表示已命中真实分类页 (含空数组, 即该页确无书)。
  async function browse(cat, page = 1) {
    if (!cfg.browse || !cfg.browse.list) return null;
    const key = matchCatKey(cfg.browse.categories, cat);
    if (key == null) return null;
    const vars = { page, key };
    const tpl = (page > 1 && cfg.browse.pageUrl) ? cfg.browse.pageUrl : cfg.browse.url;
    const $ = await fetchDoc(tpl, { vars });
    const nodes = $(cfg.browse.list);
    return fieldList($, nodes, cfg.browse.fields || cfg.search.fields).map((b) => ({
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

  const api = { name: cfg.name, base, search, detail, catalog, content, browse };
  api.diagnose = makeDiagnose(api, cfg, fetchDoc);
  return api;
}

// 选择器自检: 逐字段跑一遍 search/detail/catalog, 报告每个选择器是否真抓到值。
// 加源时一键调用, 避免"选择器写错/抓错层 -> 静默返回空"的坑 (如茶马 tags 取错容器)。
// 目标书籍来源优先级: 显式 url/bookid > 用 keyword 搜索取第一条结果。
function makeDiagnose(adapter, cfg, fetchDoc) {
  const evalRule = require('../lib/rule').evalRule;

  return async function diagnose({ url, bookid, keyword, page = 1 } = {}) {
    const report = { name: cfg.name, target: null, keyword: keyword || '', checks: [] };
    const push = (scope, field, rule, value) => {
      const v = value == null ? '' : String(value);
      report.checks.push({
        scope, field, rule: rule || '',
        value: v.length > 120 ? v.slice(0, 120) + '…' : v,
        len: v.trim().length,
        ok: v.trim().length > 0,
      });
    };
    const summary = (scope) => {
      const rows = report.checks.filter((c) => c.scope === scope);
      return { total: rows.length, hit: rows.filter((c) => c.ok).length, miss: rows.filter((c) => !c.ok).map((c) => c.field) };
    };

    // 1) 搜索字段命中率 (逐条汇总, 不逐条展开以免报告爆炸)
    if (keyword) {
      try {
        const books = await adapter.search(keyword, page);
        report.searchCount = books.length;
        for (const f of Object.keys(cfg.search.fields || {})) {
          const hit = books.filter((b) => {
            const v = f === 'bookUrl' ? b.book_url : b[f];
            return v != null && String(v).trim() !== '';
          }).length;
          report.checks.push({
            scope: 'search', field: f, rule: cfg.search.fields[f] || '',
            value: `命中 ${hit}/${books.length}`, len: hit, ok: hit > 0,
          });
        }
        if (!report.target && books[0]) report.target = { book_url: books[0].book_url, bookid: books[0].bookid, title: books[0].title };
      } catch (e) {
        report.checks.push({ scope: 'search', field: '(搜索请求)', rule: cfg.search.request.url, value: '', len: 0, ok: false, error: String(e.message || e) });
      }
    }

    // 2) 详情字段自检 (核心: 逐字段报 raw 值 + 是否为空)
    const targetUrl = url || (report.target && report.target.book_url) || '';
    const targetId = bookid || (report.target && report.target.bookid) || '';
    if (targetUrl || targetId) {
      report.target = report.target || { book_url: targetUrl, bookid: targetId };
      try {
        const bookUrl = targetUrl || tmpl(cfg.detail.urlFromId || '/book/{{id}}', { id: targetId });
        report.target.book_url = bookUrl;
        const $ = await fetchDoc(bookUrl);
        for (const [k, rule] of Object.entries(cfg.detail.fields || {})) {
          push('detail', k, rule, evalRule($, $.root(), rule));
        }
      } catch (e) {
        report.checks.push({ scope: 'detail', field: '(详情页请求)', rule: targetUrl, value: '', len: 0, ok: false, error: String(e.message || e) });
      }
    }

    // 3) 目录计数 (声明式直接数; build 钩子跑一遍拿条数)
    try {
      const chapters = await adapter.catalog({ url: report.target && report.target.book_url, bookid: report.target && report.target.bookid });
      report.catalogCount = chapters.length;
      report.checks.push({ scope: 'catalog', field: '章节数', rule: cfg.catalog.list || '(build 钩子)', value: String(chapters.length), len: chapters.length, ok: chapters.length > 0 });
    } catch (e) {
      report.checks.push({ scope: 'catalog', field: '章节数', rule: cfg.catalog.list || '(build 钩子)', value: '', len: 0, ok: false, error: String(e.message || e) });
    }

    report.summary = { search: summary('search'), detail: summary('detail'), catalog: summary('catalog') };
    report.ok = report.checks.every((c) => c.ok);
    report.missFields = report.checks.filter((c) => !c.ok && c.scope !== 'catalog').map((c) => `${c.scope}.${c.field}`);
    return report;
  };
}

module.exports = { createAdapter, abs, tmpl, matchCatKey };
