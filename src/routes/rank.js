'use strict';
// 番茄官方榜单代理: 客户端不再直连番茄, 改由本服务中转并补全简介/分类。
//
// 背景: 模板 exploreUrl 里巅峰/出版榜单的 URL 原本写死指向 fanqienovel.com, Legado App
// 直连番茄官方 API。那两个 API 的 payload 只有书名/作者/封面/分类, **没有简介字段**
// (实测 top_book_list: author,book_id,book_name,category,creation_status,rank_score,thumb_url;
//  publication: book_id,thumb_url,book_name,author,book_type,publisher,...)。
// 简介只存在于每本书的详情页, 必须逐本抓 -> 本模块负责并发抓取 + 缓存。
//
// 而爆更/黑马/热搜三个榜单走 api-lf.fanqiesdk.com, payload **自带 abstract + category**,
// 无需补全, 直接透传即可。
//
// 返回结构必须与番茄原 API 完全一致 (模板 ruleExplore.bookList 按 $.book_list / $.data[*] 解析),
// 只做字段补全, 不改结构。
const express = require('express');
const { request } = require('../lib/http');
const bookmeta = require('../lib/bookmeta');
const adapters = require('../adapters');
const fq = require('../adapters/fanqie');
// 默认补全源 = 番茄 (现有三个榜单都是番茄的)。以后接别家榜单时, 在 URL 上带 &source=<源名>
// 即可复用同一套补全逻辑, 无需再改代码。
const DEFAULT_SOURCE = fq.name;

const router = express.Router();

const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// 榜单列表缓存: 排名会变, TTL 短; 支持 ?refresh=1 强制重抓
const LIST_TTL = 6 * 60 * 60 * 1000;
const listCache = new Map();   // key -> { at, data }

function cachedList(key, refresh, fn) {
  const hit = listCache.get(key);
  if (!refresh && hit && Date.now() - hit.at < LIST_TTL) return Promise.resolve(hit.data);
  return Promise.resolve().then(fn).then((data) => {
    listCache.set(key, { at: Date.now(), data });
    return data;
  });
}

// 并发上限映射
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// 逐本补全简介/分类: 先查 bookmeta 缓存, 未命中才抓详情页。
// 按源分发: 榜单属于哪个源, 就用哪个源的 detail() 补全, 不再写死番茄。
async function enrichList(books, { concurrency = 8, source = DEFAULT_SOURCE } = {}) {
  const targets = (books || []).filter((b) => b && b.book_id && (!b.abstract || !b.category));
  if (!targets.length) return books;
  const adapter = adapters.get(source);
  if (!adapter) return books;
  await mapLimit(targets, concurrency, async (b) => {
    const id = String(b.book_id);
    let meta = bookmeta.get(source, id);
    if (!meta) {
      try {
        const info = await adapter.detail({ bookid: id });
        if (info) {
          bookmeta.set(source, id, info);
          meta = info;
        }
      } catch (e) { /* 单本失败: 保持原字段 */ }
    }
    if (!meta) return;
    if (!b.abstract && meta.desc) b.abstract = meta.desc;
    if (!b.category && meta.tags) b.category = meta.tags;
    if (!b.thumb_url && meta.cover) b.thumb_url = meta.cover;
    if (!b.word_number && meta.wordCount) b.word_number = meta.wordCount;
  });
  return books;
}

async function fetchJson(url) {
  const r = await request(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, timeout: 25000 });
  if (r.status !== 200) throw new Error(`上游 ${r.status}`);
  return JSON.parse(r.text);
}

// ---- 巅峰榜单: fanqienovel.com/api/author/misc/top_book_list/v1/ ----
router.get('/rank/top', async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const refresh = req.query.refresh === '1';
  const source = req.query.source || DEFAULT_SOURCE;
  try {
    const j = await cachedList(`top:${limit}:${offset}`, refresh, () =>
      fetchJson(`https://fanqienovel.com/api/author/misc/top_book_list/v1/?limit=${limit}&offset=${offset}`));
    await enrichList(j.book_list || [], { source });
    res.json(j);
  } catch (e) {
    res.status(502).json({ code: 502, message: String(e.message || e), book_list: [] });
  }
});

// ---- 出版榜单: fanqienovel.com/api/node/publication/list ----
router.get('/rank/publication', async (req, res) => {
  const pageIndex = Math.max(0, parseInt(req.query.page_index, 10) || 0);
  const pageCount = Math.min(100, Math.max(1, parseInt(req.query.page_count, 10) || 100));
  const refresh = req.query.refresh === '1';
  const source = req.query.source || DEFAULT_SOURCE;
  try {
    const j = await cachedList(`pub:${pageIndex}:${pageCount}`, refresh, () =>
      fetchJson(`https://fanqienovel.com/api/node/publication/list?page_index=${pageIndex}&page_count=${pageCount}`));
    const list = (j.data && j.data.publication_list) || j.publication_list || [];
    await enrichList(list, { source });
    res.json(j);
  } catch (e) {
    res.status(502).json({ code: 502, message: String(e.message || e), data: { publication_list: [] } });
  }
});

// ---- fanqiesdk 系榜单 (爆更/黑马/热搜): payload 自带 abstract, 直接透传 ----
// side_type: 15=爆更, 13=黑马, 12=热搜
router.get('/rank/sdk', async (req, res) => {
  const sideType = String(req.query.side_type || '15');
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const refresh = req.query.refresh === '1';
  try {
    const j = await cachedList(`sdk:${sideType}:${limit}:${offset}`, refresh, () =>
      fetchJson(`https://api-lf.fanqiesdk.com/api/novel/channel/homepage/rank/rank_list/v2/?aid=13&limit=${limit}&offset=${offset}&side_type=${sideType}&type=1`));
    res.json(j);
  } catch (e) {
    res.status(502).json({ code: 502, message: String(e.message || e), data: { result: [] } });
  }
});

// 运维: 清空榜单列表缓存 (元数据缓存不受影响)
router.post('/rank/clear', (req, res) => {
  listCache.clear();
  res.json({ code: 0, message: 'SUCCESS', data: { cleared: true } });
});

module.exports = router;
