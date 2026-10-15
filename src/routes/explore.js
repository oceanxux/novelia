'use strict';
// 发现页 (Legado explore) 契约实现。
// 书源模板的 exploreUrl / ruleExplore.bookList 会调以下端点渲染分类磁贴:
//   GET /type_api            分类磁贴 (source 指定源) / 分类下的书单 (带 url=cat:<id>)
//   GET /style_top           榜单书单
//   GET /type_style          分类导航树 / 分类书单
//   GET /read_recommend      个性推荐
//   GET /book_user           番茄账号昵称 (未登录返回空)
//   GET /book_shelf          番茄书架 (未登录返回空)
//   GET /read_history        番茄阅读历史 (未登录返回空)
// 这些端点原先全部缺失 (404), 导致发现页只显示"暂无数据"。
// 书单全部由本站适配器实时检索供给, 不依赖任何单一站点的私有分类接口,
// 因此每一个已注册源都能出分类。
const express = require('express');
const adapters = require('../adapters');
const bookpool = require('../lib/bookpool');
const cats = require('../lib/explore-categories');

const router = express.Router();

const TILE_STYLE = { layout_flexGrow: 1, layout_flexBasisPercent: 0.29 };
const HEAD_STYLE = { layout_flexGrow: 1, layout_flexBasisPercent: 1 };

// ---- 检索预算 ----
// 分类页是高频只读, 用短 TTL 缓存 + 单源超时: 慢源被跳过而不是拖垮整页。
const CACHE_TTL = 5 * 60 * 1000;
const SOURCE_TIMEOUT = 6000;
const FAIL_COOLDOWN = 10 * 60 * 1000;

const cache = new Map();
const cooldown = new Map();

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.val;
  const val = Promise.resolve().then(fn).catch(() => []);
  cache.set(key, { at: Date.now(), val });
  return val;
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    if (t.unref) t.unref();
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function toBook(b) {
  return {
    title: b.title || '',
    author: b.author || '',
    cover: b.cover || '',
    desc: b.desc || '',
    source: b.source || '',
    book_url: b.book_url || '',
    bookid: b.bookid || '',
  };
}

// 单源分类检索
async function listBySource(source, kw, page) {
  const a = adapters.get(source);
  if (!a) return [];
  try {
    const list = await withTimeout(a.search(kw, page), SOURCE_TIMEOUT * 2);
    return (list || []).map(toBook).filter((b) => b.title && b.book_url);
  } catch (e) {
    return [];
  }
}

// 聚合分类检索: 各源并行, 慢源跳过, 按源轮询交错避免被单源大结果集挤占
async function aggregateSearch(kw, limit) {
  const names = adapters.list().filter((n) => {
    const until = cooldown.get(n) || 0;
    return Date.now() >= until;
  });
  const lists = await Promise.all(names.map(async (name) => {
    const a = adapters.get(name);
    if (!a) return [];
    try {
      const list = await withTimeout(a.search(kw, 1), SOURCE_TIMEOUT);
      return (list || []).map(toBook).filter((b) => b.title && b.book_url);
    } catch (e) {
      // 单源超时/失败: 冷处理一段时间, 避免每次刷新都白等
      cooldown.set(name, Date.now() + FAIL_COOLDOWN);
      return [];
    }
  }));
  const out = [];
  const seen = new Set();
  const maxLen = lists.reduce((m, l) => Math.max(m, l.length), 0);
  for (let i = 0; i < maxLen && out.length < limit; i++) {
    for (const list of lists) {
      const b = list[i];
      if (!b) continue;
      const k = `${b.source}:${b.bookid || b.book_url}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// 聚合检索的兜底: 书池已缓存真实书籍, 慢源全挂时仍能出内容
function poolFallback(kw, limit) {
  try {
    const r = bookpool.get({ sort: 'hot', limit: limit || 30, page: 1, q: kw });
    const list = (r.books || []).map(toBook).filter((b) => b.title && b.book_url);
    if (list.length) return list;
  } catch (e) { /* 书池未就绪 */ }
  try {
    const r = bookpool.get({ sort: 'hot', limit: limit || 30, page: 1 });
    return (r.books || []).map(toBook).filter((b) => b.title && b.book_url);
  } catch (e) {
    return [];
  }
}

async function browse(kw, limit) {
  const live = await cached(`agg:${kw}:${limit}`, () => aggregateSearch(kw, limit));
  return live.length ? live : poolFallback(kw, limit);
}

function catKw(id) {
  const c = cats.findCategory(`cat:${id}`);
  return c ? c.kw : '小说';
}

// ---- /type_api ----
// 无 url: 分类磁贴; 带 url=cat:<id>: 该分类下的书单
router.get('/type_api', async (req, res) => {
  const source = String(req.query.source || '').trim();
  const gender = String(req.query.gender || '').toLowerCase();
  const ref = String(req.query.url || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  if (ref) {
    const cat = cats.findCategory(ref);
    if (!cat) return res.json({ code: 0, message: 'ok', data: { data: [], has_more: false } });
    const books = source
      ? await cached(`src:${source}:${cat.id}:${page}`, () => listBySource(source, cat.kw, page))
      : await browse(cat.kw, 30);
    return res.json({ code: 0, message: 'ok', data: { data: books, has_more: books.length >= 10 } });
  }

  const groups = cats.CATEGORIES[gender === 'girl' ? 'girl' : 'boy'];
  const found = [];
  for (const g of groups) {
    found.push({ title: `❤️${g.group}❤️`, url: '', style: HEAD_STYLE });
    for (const it of g.items) {
      found.push({ title: it.name, url: `cat:${it.id}`, style: TILE_STYLE });
    }
  }
  res.json({ isSuccess: true, errorMsg: 'success', data: { found } });
});

// ---- /style_top ---- 榜单书单
router.get('/style_top', async (req, res) => {
  const id = Number(req.query.category_id);
  const cat = cats.findCategory(`cat:${id}`);
  const kw = cat ? cat.kw : '小说';
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const books = await browse(kw, 60);
  res.json({
    code: 0,
    message: 'SUCCESS',
    data: {
      book_list: books.slice(offset, offset + limit),
      total_num: books.length,
      rankTypeText: cat ? cat.name : '',
    },
  });
});

// ---- /type_style ---- 分类导航树 (new_category_tab) / 分类书单 (category_id)
router.get('/type_style', async (req, res) => {
  if (req.query.new_category_tab !== undefined) {
    const tab = String(req.query.new_category_tab) === '0' ? 'girl' : 'boy';
    const data = cats.CATEGORIES[tab].map((g) => ({
      name: g.group,
      data: g.items.map((it) => ({ name: it.name, category_id: it.id })),
    }));
    return res.json({ code: 0, msg: 'success', data });
  }

  const id = Number(req.query.category_id);
  const limit = 20;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const books = await browse(catKw(id), 60);
  res.json({
    code: 0,
    message: 'SUCCESS',
    data: {
      book_info: books.slice(offset, offset + limit),
      offset,
      has_more: books.length > offset + limit,
    },
  });
});

// ---- /read_recommend ---- 个性推荐
router.get('/read_recommend', (req, res) => {
  const books = poolFallback('', 30);
  res.json({ code: 0, message: 'SUCCESS', data: { data: books } });
});

// ---- 番茄账号相关: 本站没有该 App 的会话, 返回结构合法的空值 ----
router.get('/book_user', (req, res) => res.json({ code: 0, message: 'SUCCESS', data: { name: '' } }));
router.get('/book_shelf', (req, res) => res.json({ code: 0, message: 'SUCCESS', data: { book_shelf_info: [] } }));
router.get('/read_history', (req, res) => res.json({ code: 0, message: 'SUCCESS', data: { data_list: [] } }));

module.exports = router;
