'use strict';
// 聚合书源 (Legado) — 把本站全部源聚合成一个标准 JSON 书源
//   GET /book_source.json                        动态生成书源 JSON (host 取自请求, 不写死 IP/端口)
//   GET /api/bs/search?key=&page=                聚合搜索 (跨全部源)
//   GET /api/bs/detail?source=&url=&bookid=      详情 + 目录
//   GET /api/bs/content?source=&url=&bookid=&cid= 正文
// 书源规则全部走标准 JSONPath, 不含任何 JS, 便于跨平台导入。
const express = require('express');
const adapters = require('../adapters');
const bookpool = require('../lib/bookpool');
const { normalizeBookParams } = require('../lib/bookurl');

const router = express.Router();

// 基准地址: 取自请求 Host, 部署到任意域名/端口自动适配
function baseUrl(req) {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = req.get('host') || '';
  return `${proto}://${host}`;
}
const q = (s) => encodeURIComponent(String(s == null ? '' : s));

// 聚合搜索: 跨全部源
router.get('/api/bs/search', async (req, res) => {
  const base = baseUrl(req);
  const key = String(req.query.key || '').trim();
  if (!key) return res.json({ data: [] });
  let books = [];
  try { books = await bookpool.searchLive(key, 60); } catch (e) { books = []; }
  const data = books.map((b) => ({
    title: b.title,
    author: b.author || '',
    cover: b.cover || '',
    desc: b.desc || '',
    source: b.source,
    bookid: b.bookid || '',
    tab: b.tab || 'novel',
    book_url: `${base}/api/bs/detail?source=${q(b.source)}&url=${q(b.book_url || '')}&bookid=${q(b.bookid || '')}`,
  }));
  res.json({ data });
});

// 详情 + 目录 (同一响应, 供 ruleBookInfo 与 ruleToc 复用)
router.get('/api/bs/detail', async (req, res) => {
  const base = baseUrl(req);
  const source = String(req.query.source || '');
  const { url, bookid } = normalizeBookParams({ url: req.query.url, bookid: req.query.bookid });
  const adapter = adapters.get(source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: null });
  try {
    const info = await adapter.detail({ url, bookid });
    const bookUrl = info.book_url || url;
    const bid = info.bookid || bookid;
    let chapters = [];
    try { chapters = await adapter.catalog({ url: bookUrl, bookid: bid }); } catch (e) { chapters = []; }
    res.json({
      code: 200,
      message: 'ok',
      data: {
        title: info.title || '',
        author: info.author || '',
        cover: info.cover || '',
        desc: info.desc || '',
        tags: info.tags || '',
        latestChapterTitle: info.latestChapterTitle || '',
        source,
        bookid: bid,
        chapters: chapters.map((c) => ({
          title: c.title || '',
          cid: c.cid,
          isVolume: !!c.isVolume,
          isVip: !!c.isVip,
          isPay: !!c.isPay,
          tag: c.tag || '',
          url: c.isVolume ? '' : `${base}/api/bs/content?source=${q(source)}&url=${q(bookUrl)}&bookid=${q(bid)}&cid=${q(c.cid)}`,
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

// 正文
router.get('/api/bs/content', async (req, res) => {
  const source = String(req.query.source || '');
  const { url, bookid } = normalizeBookParams({ url: req.query.url, bookid: req.query.bookid });
  const cid = Number(req.query.cid) || 0;
  const adapter = adapters.get(source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: null });
  try {
    const data = await adapter.content({ source, url, bookid, cid });
    res.json({ code: 200, message: 'ok', data });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

const fs = require('fs');
const path = require('path');

const TEMPLATE_FILE = path.join(__dirname, '..', 'template', 'full_book_source.json');
let fullTemplateCache = null;

function loadFullTemplate() {
  if (fullTemplateCache) return fullTemplateCache;
  try {
    if (fs.existsSync(TEMPLATE_FILE)) {
      fullTemplateCache = JSON.parse(fs.readFileSync(TEMPLATE_FILE, 'utf8'));
      return fullTemplateCache;
    }
  } catch (e) {
    console.error('[book_source] load template failed:', e.message);
  }
  return null;
}

// 动态构建全功能书源配置（自动注入当前站点的动态协议/域名/端口）
function buildFullBookSource(base) {
  const tpl = loadFullTemplate();
  if (!tpl || !Array.isArray(tpl) || !tpl[0]) return null;

  // 深拷贝
  const src = JSON.parse(JSON.stringify(tpl[0]));

  src.bookSourceName = '📚Novelia聚合';
  src.bookSourceGroup = 'Novelia';
  src.bookSourceUrl = base;

  // 自定义说明信息
  src.bookSourceComment = `Novelia全功能聚合书源\n本源聚合全网多源站，包含完整登录中心、发现页分类、智能段评与排版。\n服务器基准地址：${base}\n当前更新时间：${new Date().toLocaleString('zh-CN')}`;

  // 替换 jsLib 中写死的远端服务器列表，将当前部署的基准站点设为主服务器
  const oldHostsBlock = `var hosts = [
    "https://v1.vossc.com",
    "https://v2.vossc.com",
    "https://v3.vossc.com",
    "https://v4.vossc.com",
    "http://1.94.248.5:7001",
    "http://113.44.163.166:7001"
];`;
  const newHostsBlock = `var hosts = [
    "${base}"
];`;

  if (src.jsLib) {
    src.jsLib = src.jsLib.replace(oldHostsBlock, newHostsBlock);
  }

  // 替换 loginUrl 中的外部链接为本站当前服务
  // 注意: 番茄登录页保持模板里的 https://fanqienovel.com/main/writer/login 不变。
  // 番茄官方 web 端唯一可用的登录入口就是该地址 (首页/书页的"登录"按钮都跳这里, 含扫码/
  // 验证码/密码三种方式); 曾误改为 https://fanqienovel.com/login, 该路径实测返回 404。
  if (src.loginUrl) {
    src.loginUrl = src.loginUrl.replace(/https:\/\/fb\.shushan\.vip/g, base + '/booklist_index');
    src.loginUrl = src.loginUrl.replace(/https:\/\/www\.kufaka\.com\/item\/9mbtvr/g, base + '/user_center');
  }

  // 替换 loginUi 按钮标题
  if (src.loginUi) {
    try {
      const uiList = JSON.parse(src.loginUi);
      uiList.forEach((btn) => {
        if (btn.name === '📚书山发布页') btn.name = '📚Novelia发现';
        if (btn.name === '☕打赏享福利') btn.name = '🎫会员兑换';
      });
      src.loginUi = JSON.stringify(uiList);
    } catch (e) {}
  }

  // 1. 去除 exploreUrl 中未登录番茄时的冗余 toast 弹窗提示
  if (src.exploreUrl) {
    src.exploreUrl = src.exploreUrl
      .replace(/java\.toast\("番茄登录已过期，请重新登录"\);/g, '// 无需提示')
      .replace(/java\.toast\("您还未登录番茄账号，无法同步数据"\);/g, '// 无需提示');
  }

  // 2. 补全 ruleSearch / ruleBookInfo 字段，保证在 Flutter (源阅/栖阅) 换源时非空，避免 "Null check operator used on a null value"
  if (src.ruleSearch) {
    src.ruleSearch.name = '$.title||$.name||$.book_name||未知书名';
    src.ruleSearch.author = '$.author||$.writer||未知作者';
    src.ruleSearch.kind = '$.tags||$.kind||$.source||小说';
    src.ruleSearch.lastChapter = '$.latestChapterTitle||{{$.source}}·{{$.latestChapterTitle}}||暂无最新章节';
    // 确保从搜索卡片直达详情时保留 bookid
    if (src.ruleSearch.bookUrl && typeof src.ruleSearch.bookUrl === 'string') {
      src.ruleSearch.bookUrl = src.ruleSearch.bookUrl.replace(
        'let detail = {\n    source: source,\n    url: book_url,\n    cover: cover,\n    desc: desc,\n    name: title\n};',
        'let detail = {\n    source: source,\n    url: book_url,\n    cover: cover,\n    desc: desc,\n    name: title,\n    bookid: result.bookid || result.book_id || ""\n};'
      );
    }
  }
  if (src.ruleBookInfo) {
    src.ruleBookInfo.name = '$.title||$.name||$.book_name||未知书名';
    src.ruleBookInfo.author = '$.author||$.writer||未知作者';
    src.ruleBookInfo.kind = '$.tags||$.kind||$.source||小说';
    src.ruleBookInfo.lastChapter = '$.latestChapterTitle||$.last_chapter_title||$.lastChapter||暂无最新章节';
    if (src.ruleBookInfo.tocUrl && typeof src.ruleBookInfo.tocUrl === 'string') {
      src.ruleBookInfo.tocUrl = src.ruleBookInfo.tocUrl.replace(
        'bookid: result.bookid || ""',
        'bookid: result.bookid || result.book_id || ""'
      );
    }
  }

  // 3. 增强 jsLib 中的 buildChapterUrl，修复番茄章节 /reader/(\\d+) 以及 itemId 提取，避免 item_id 成为 null
  if (src.jsLib) {
    src.jsLib = src.jsLib.replace(
      'chapterParams.item_id = x.url?.match(/item_id=(\\d+)/)?.[1] || null;',
      'chapterParams.item_id = x.itemId || x.url?.match(/\\/reader\\/(\\d+)/)?.[1] || x.url?.match(/item_id=(\\d+)/)?.[1] || null;'
    );
    src.jsLib = src.jsLib.replace(
      'const itemId = x.url?.match(/item_id=(\\d+)/)?.[1] || null;',
      'const itemId = x.itemId || x.url?.match(/\\/reader\\/(\\d+)/)?.[1] || x.url?.match(/item_id=(\\d+)/)?.[1] || null;'
    );
  }

  // 4. 增强 ruleToc.chapterList，避免 response 为 null 或 response.data 为 null 时崩溃导致“目录加载出错:章节列表为空”
  if (src.ruleToc && src.ruleToc.chapterList) {
    const rawChapterList = src.ruleToc.chapterList;
    const oldParse = 'JSON.parse(response).data.map((x) => {';
    const safeParse = `let parsedResp = null;
try { parsedResp = JSON.parse(response); } catch(e) {}
let rawChapterList = (parsedResp && Array.isArray(parsedResp.data)) ? parsedResp.data : [];
rawChapterList.map((x) => {`;
    if (rawChapterList.includes(oldParse)) {
      src.ruleToc.chapterList = rawChapterList.replace(oldParse, safeParse);
    }
  }

  // 5. 增强正文请求的容错性，避免后端返回 null 时 Rhino 抛出 TypeError: Cannot read property "content" from null
  if (src.ruleContent && src.ruleContent.content) {
    const rawContent = src.ruleContent.content;
    const oldFetchCode = 'let response=JSON.parse(java.ajax(chapterUrl));let finalResult=response.data.content;';
    const safeFetchCode = 'let response=null;try{response=JSON.parse(java.ajax(chapterUrl));}catch(e){};let finalResult=(response&&response.data&&response.data.content!=null)?response.data.content:(response&&response.message?response.message:"正文获取失败，请重试或检查登录状态");';
    if (rawContent.includes(oldFetchCode)) {
      src.ruleContent.content = rawContent.replace(oldFetchCode, safeFetchCode);
    }
  }

  // 6. 详情接口容错: /details 失败时后端回 data:null, 模板里 `response.data.tab` 会直接抛
  //    Rhino TypeError (无法读取 null 的属性 "tab"), 导致书籍对象构造中断, 表现为
  //    "初始化失败 / 章节列表为空 / 换源错误"。改为空安全访问。
  if (src.ruleBookInfo && src.ruleBookInfo.init) {
    const rawInit = src.ruleBookInfo.init;
    const oldDeref = 'let response = JSON.parse(result);\n    if (response.data.tab == "download") {';
    const safeDeref = 'let response = null;\n    try { response = JSON.parse(result); } catch (e) {}\n    if (response && response.data && response.data.tab == "download") {';
    if (rawInit.includes(oldDeref)) {
      src.ruleBookInfo.init = rawInit.replace(oldDeref, safeDeref);
    } else {
      src.ruleBookInfo.init = rawInit.replace(
        'if (response.data.tab == "download") {',
        'if (response && response.data && response.data.tab == "download") {'
      );
    }
  }

  return [src];
}

// 书源 JSON: host 由请求头动态推导，支持 mode=simple 获取纯净轻量版，默认返回全功能高级版
router.get('/book_source.json', (req, res) => {
  const base = baseUrl(req);
  const mode = String(req.query.mode || '').trim();

  // 若明确请求纯净版
  if (mode === 'simple') {
    const simpleSrc = {
      bookSourceName: '📚Novelia聚合 (纯净版)',
      bookSourceGroup: 'Novelia',
      bookSourceUrl: base,
      bookSourceType: 0,
      bookSourceComment: 'Novelia轻量聚合书源: 纯净无脚本，低延迟通用。',
      enabled: true,
      enabledExplore: false,
      enabledCookieJar: false,
      header: '',
      searchUrl: `${base}/api/bs/search?key={{key}}&page={{page}}`,
      ruleSearch: {
        bookList: '$.data',
        name: '$.title',
        author: '$.author',
        bookUrl: '$.book_url',
        coverUrl: '$.cover',
        intro: '$.desc',
        kind: '$.source',
      },
      ruleBookInfo: {
        name: '$.data.title',
        author: '$.data.author',
        coverUrl: '$.data.cover',
        intro: '$.data.desc',
        kind: '$.data.tags',
        lastChapter: '$.data.latestChapterTitle',
        tocUrl: '',
      },
      ruleToc: {
        chapterList: '$.data.chapters',
        chapterName: '$.title',
        chapterUrl: '$.url',
        isVolume: '$.isVolume',
        isVip: '$.isVip',
        isPay: '$.isPay',
        updateTime: '$.tag',
      },
      ruleContent: {
        content: '$.data.content',
      },
    };
    return res.type('application/json').send(JSON.stringify([simpleSrc], null, 2));
  }

  // 默认返回全功能版本
  const fullSrc = buildFullBookSource(base);
  if (fullSrc) {
    return res.type('application/json').send(JSON.stringify(fullSrc, null, 2));
  }

  // 回退保护
  res.type('application/json').send(JSON.stringify([{
    bookSourceName: '📚Novelia聚合',
    bookSourceUrl: base,
    enabled: true,
  }], null, 2));
});

module.exports = router;
