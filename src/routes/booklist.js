'use strict';
// 首页书单 API + 图片代理
//   GET /booklist_index  /booklist_index.php   -> 首页
//   GET /api/get_featured_booklists?sort=&page=&limit=
//   GET /api/get_recommended_booklists?page=&limit=
//   GET /api/get_random_booklists
//   GET /api/get_jj_booklists
//   GET /api/search_jj_booklists?q=&page=&sort=
//   GET /proxy_image?url=
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const express = require('express');
const seed = require('../lib/seeddata');
const store = require('../lib/userstore');
const userRoute = require('./user');
const bookpool = require('../lib/bookpool');
const jjlists = require('../lib/jjlists');
const jjranks = require('../lib/jjranks');
const adapters = require('../adapters');

const router = express.Router();
const TPL = path.join(__dirname, '..', '..', 'public', 'booklist_index.html');
const DETAIL_TPL = path.join(__dirname, '..', '..', 'public', 'book_detail.html');
const JJ_TPL = path.join(__dirname, '..', '..', 'public', 'booklist_jjdetail.html');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- 首页 ----
function sendIndex(req, res) {
  const user = userRoute.resolveUser(req) || { nickname: '', avatar: '/uploads/avatars/default-avatar.png' };
  let html = fs.readFileSync(TPL, 'utf8');
  const vars = {
    NICKNAME: esc(user.nickname || ''),
    AVATAR: esc(user.avatar || '/uploads/avatars/default-avatar.png'),
    SEARCH_Q: esc(req.query.q || ''),
  };
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, name) => (name in vars ? vars[name] : m));
  res.type('html').send(html);
}
router.get('/booklist_index', sendIndex);
router.get('/booklist_index.php', sendIndex);

// ---- 首页书籍 API (从我们的源聚合, 点击进 /book_detail) ----
router.get('/api/books', (req, res) => {
  const r = bookpool.get({
    sort: String(req.query.sort || 'random'),
    limit: parseInt(req.query.limit, 10) || 10,
    page: parseInt(req.query.page, 10) || 1,
    q: String(req.query.q || ''),
  });
  res.json({ success: true, ...r });
});

// 实时跨源搜索 (搜索框用)
router.get('/api/search_books', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ success: true, books: [], total: 0 });
  const books = await bookpool.searchLive(q, parseInt(req.query.limit, 10) || 20);
  res.json({ success: true, books, total: books.length });
});

// ---- 书籍详情页 (信息 + 目录 + 正文, 全站自洽) ----
// 页面把渲染所需数据一次性注入 window.__BOOK__, 前端 Vue 直接消费。
// JSON 内联进 <script> 时需转义 </script> 与 U+2028/2029。
function jsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderDetail(vars) {
  let html = fs.readFileSync(DETAIL_TPL, 'utf8');
  const base = { TITLE: esc(vars.title || ''), BOOK_JSON: jsonForScript(vars.book || {}) };
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, name) => (name in base ? base[name] : m));
  return html;
}

router.get('/book_detail', async (req, res) => {
  const source = String(req.query.source || '');
  const url = String(req.query.url || '');
  const bookid = String(req.query.bookid || '');
  const adapter = adapters.get(source);
  if (!adapter) {
    return res.type('html').send(renderDetail({
      title: '未知来源',
      book: { error: '该书源不存在或已移除', info: null, chapters: [] },
    }));
  }
  try {
    const info = await adapter.detail({ url, bookid });
    const bookUrl = info.book_url || url;
    const bid = info.bookid || bookid;
    let chapters = [];
    try {
      chapters = await adapter.catalog({ url: bookUrl, bookid: bid });
    } catch (e) { chapters = []; }
    res.type('html').send(renderDetail({
      title: info.title,
      book: {
        source,
        bookid: bid,
        book_url: bookUrl,
        info: {
          title: info.title, author: info.author, cover: info.cover, desc: info.desc,
          source, wordCount: info.wordCount || 0,
        },
        chapters: chapters.map((c) => ({
          title: c.title, url: c.url, cid: c.cid,
          chapterid: c.chapterid || '',
          isVolume: !!c.isVolume, isVip: !!(c.isVip || c.isPay),
        })),
      },
    }));
  } catch (e) {
    res.type('html').send(renderDetail({
      title: '加载失败',
      book: { error: String(e.message || e), info: null, chapters: [] },
    }));
  }
});

// 正文 (供详情页阅读, 走适配器; 校验用户状态及网页看书权限)
router.post('/api/chapter', async (req, res) => {
  const user = userRoute.resolveUser(req);
  if (user) {
    if (user.disabled) {
      return res.status(403).json({ success: false, message: '您的账号已被管理员禁用' });
    }
    if (user.allow_web_read === false) {
      return res.status(403).json({ success: false, message: '管理员已关闭您的网页端看书权限，请在手机 App (如 Legado) 中使用' });
    }
  }
  const { source, url, bookid, cid } = req.body || {};
  const adapter = adapters.get(source);
  if (!adapter) return res.status(400).json({ success: false, message: '未知来源' });
  try {
    const data = await adapter.content({ source, url, bookid, cid: Number(cid) || 0 });
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
});

// ---- 晋江书单详情 ----
async function renderJjDetail(listid) {
  let html = fs.readFileSync(JJ_TPL, 'utf8');
  let data = null;
  if (String(listid).startsWith('rank_')) {
    data = await jjranks.getDetail(listid);
  }
  if (!data) data = jjlists.get(listid) || { listid, listname: '书单不存在', books: [] };
  html = html.replace('{{LIST_JSON}}', jsonForScript(data));
  return html;
}
async function sendJjDetail(req, res) {
  const listid = String(req.query.listid || req.query.id || '');
  res.type('html').send(await renderJjDetail(listid));
}
router.get('/booklist_jjdetail', sendJjDetail);
router.get('/booklist_jjdetail.php', sendJjDetail);

// 契约对齐: GET /details?source=&url=&name=  返回 { code, message, data: Book }
router.get('/details', async (req, res) => {
  const source = String(req.query.source || '');
  const url = String(req.query.url || '');
  const bookid = String(req.query.bookid || '');
  const adapter = adapters.get(source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: null });
  try {
    const data = await adapter.detail({ url, bookid });
    res.json({ code: 200, message: '请求成功', data });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

// ---- 书单数据 (优先晋江实时榜单派生, 失败降级本地样本) ----
async function loadLiveBooklists() {
  try {
    const ranks = await jjranks.getLists();
    if (ranks && ranks.length > 0) return ranks.slice();
  } catch (e) {}
  return seed.jjBooklists.map((b) => ({
    id: b.listid,
    listid: b.listid,
    title: b.title,
    listname: b.title,
    description: b.description,
    introduction: b.description,
    book_count: b.book_count,
    booknum: b.book_count,
    like_count: b.like_count,
    favnum: b.like_count,
    view_count: b.view_count,
    comment_count: b.comment_count || 0,
    books: b.books || [],
    nickname: b.nickname,
    reader_name: b.nickname,
    avatar: b.avatar,
    reader_avatar: b.avatar,
    time_label: '',
    has_new_books: false,
    custom_keywords: (b.categories || []).join(','),
  }));
}

// 洗牌
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- 推荐书单 ----
router.get('/api/get_recommended_booklists', async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 5;
  const all = shuffle(await loadLiveBooklists());
  const start = (page - 1) * limit;
  const slice = all.slice(start, start + limit);
  res.json({ success: true, booklists: slice, page, hasMore: start + limit < all.length });
});

// ---- 随机书单 ----
router.get('/api/get_random_booklists', async (req, res) => {
  const all = await loadLiveBooklists();
  res.json({ success: true, booklists: shuffle(all).slice(0, 8) });
});

// ---- 晋江书单 ----
router.get('/api/get_jj_booklists', async (req, res) => {
  const all = await loadLiveBooklists();
  res.json({ success: true, booklists: shuffle(all).slice(0, 10) });
});

// ---- 晋江搜索 ----
router.get('/api/search_jj_booklists', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = 20;
  let list = await loadLiveBooklists();
  if (q) {
    const kw = q.toLowerCase();
    list = list.filter((b) =>
      (b.title || '').toLowerCase().includes(kw) ||
      (b.description || '').toLowerCase().includes(kw) ||
      (b.books || []).some((x) => (x.book_title || '').toLowerCase().includes(kw))
    );
  }
  const start = (page - 1) * perPage;
  const slice = list.slice(start, start + perPage);
  res.json({ success: true, booklists: slice, total: list.length, page });
});

// ---- 书单广场 (featured) ----
router.get('/api/get_featured_booklists', async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = parseInt(req.query.limit, 10) || 10;
  const sort = String(req.query.sort || 'latest');
  let all = (await loadLiveBooklists()).slice();
  if (sort === 'likes') all.sort((a, b) => b.like_count - a.like_count);
  else if (sort === 'views') all.sort((a, b) => b.view_count - a.view_count);
  else if (sort === 'week' || sort === 'month') all.sort((a, b) => b.like_count - a.like_count);
  const start = (page - 1) * perPage;
  const slice = all.slice(start, start + perPage);
  res.json({ success: true, booklists: slice, page, per_page: perPage, has_more: start + perPage < all.length });
});

// ---- 图片代理 (仅允许 http/https) ----
router.get('/proxy_image', (req, res) => {
  const raw = String(req.query.url || '');
  let target;
  try { target = new URL(raw); } catch (e) { return res.status(400).send('bad url'); }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return res.status(400).send('bad protocol');
  const lib = target.protocol === 'https:' ? https : http;
  const proxyReq = lib.get(target, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: target.origin + '/' }, timeout: 8000 }, (r) => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
      return res.redirect(r.headers.location);
    }
    if (r.statusCode !== 200) { r.resume(); return res.status(502).send('upstream error'); }
    res.set('Content-Type', r.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    r.pipe(res);
  });
  proxyReq.on('error', () => { if (!res.headersSent) res.status(502).send('proxy error'); });
  proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) res.status(504).send('timeout'); });
});

module.exports = router;
