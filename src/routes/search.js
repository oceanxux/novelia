'use strict';
// GET /search?login=search&key=<kw>&page=<n>&source=<源站名?>
// 响应包裹: { isSuccess, error, data: Book[], cached_at }  (对齐原站)
//
// 未指定 source 时跨全部源聚合: 各源并行检索后按源轮询交错, 保证每个源都有代表。
// 这是"搜到一本书 -> 换源找同书异站"的必要前提: 只回单源结果时客户端拿不到其它站
// 的同名/同作者书, 换源列表自然只剩一个站。
const express = require('express');
const adapters = require('../adapters');
const { baseUrl, withCover } = require('../lib/cover');

const router = express.Router();

// 聚合检索的单源超时: 慢源跳过, 不拖垮整次搜索
const SOURCE_TIMEOUT = 8000;
// 单页返回条数 (与客户端 pageSize 对齐)
const PAGE_SIZE = 60;
// 聚合结果短缓存: 翻页时复用同一次全量检索, 避免每页都重打全部源
const AGG_TTL = 3 * 60 * 1000;
const aggCache = new Map();

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

function keyOf(b) { return `${b.source}:${b.bookid || b.book_url}`; }

// 各源都只有一页 (站点忽略 page 参数), 因此分页必须由本站自己做:
// 先取每源的第 1 页, 按源轮询交错成一条全局稳定有序的列表, 再按 offset 切片。
// 若每页都从 i=0 重新交错, page N 会与 page 1 高度重合, 客户端去重后判定"没有更多数据"。
async function collect(key) {
  const names = adapters.list();
  const lists = await Promise.all(names.map(async (name) => {
    const a = adapters.get(name);
    if (!a) return [];
    try {
      const list = await withTimeout(a.search(key, 1), SOURCE_TIMEOUT);
      return (Array.isArray(list) ? list : []).filter((b) => b && b.title);
    } catch (e) {
      return [];
    }
  }));

  const out = [];
  const seen = new Set();
  const maxLen = lists.reduce((m, l) => Math.max(m, l.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      const b = list[i];
      if (!b || !b.title) continue;
      const k = keyOf(b);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
  }
  return out;
}

// 全量列表带 TTL 缓存, 翻页期间只打一次源
function allBooks(key) {
  const hit = aggCache.get(key);
  if (hit && Date.now() - hit.at < AGG_TTL) return hit.val;
  const val = collect(key).catch(() => []);
  aggCache.set(key, { at: Date.now(), val });
  if (aggCache.size > 200) {
    for (const [k, v] of aggCache) {
      if (Date.now() - v.at >= AGG_TTL) aggCache.delete(k);
    }
  }
  return val;
}

router.get('/search', async (req, res) => {
  const key = String(req.query.key || '').trim();
  const page = parseInt(req.query.page, 10) || 1;
  const source = req.query.source;

  // 显式 source: 只打该源, 行为与错误原样透传
  if (source) {
    const adapter = adapters.get(source);
    if (!adapter) {
      return res.json({ isSuccess: false, error: 'unknown source: ' + source, data: [], has_more: false, cached_at: Date.now() });
    }
    try {
      const data = await adapter.search(key, page);
      res.json({
        isSuccess: true,
        error: 'success',
        data,
        has_more: Array.isArray(data) && data.length >= PAGE_SIZE,
        cached_at: Date.now(),
      });
    } catch (e) {
      res.json({ isSuccess: false, error: String(e.message || e), data: [], has_more: false, cached_at: Date.now() });
    }
    return;
  }

  if (!key) {
    return res.json({ isSuccess: false, error: 'empty key', data: [], has_more: false, cached_at: Date.now() });
  }

  const all = await allBooks(key);
  const start = Math.max(0, (page - 1) * PAGE_SIZE);
  const data = all.slice(start, start + PAGE_SIZE);
  res.json({
    isSuccess: true,
    error: 'success',
    data: withCover(data, baseUrl(req)),
    total: all.length,
    has_more: start + PAGE_SIZE < all.length,
    cached_at: Date.now(),
  });
});

module.exports = router;
