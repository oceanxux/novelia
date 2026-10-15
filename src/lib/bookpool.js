'use strict';
// 书籍池: 从各适配器源聚合真实书籍, 供首页推荐使用。
// 抓取在后台进行, 结果缓存到磁盘 (data/bookpool.json, TTL 6h), 首页读缓存即时返回。
const fs = require('fs');
const path = require('path');
const adapters = require('../adapters');
const bookmeta = require('./bookmeta');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'bookpool.json');
const TTL = 6 * 60 * 60 * 1000;

// 用于抓取书目的关键词 (覆盖各源热门书)
const KEYWORDS = ['斗破苍穹', '剑来', '诡秘之主', '凡人修仙传', '完美世界', '遮天'];

let cache = { books: [], at: 0 };
let building = null;

function loadFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (j && Array.isArray(j.books)) { cache = j; return true; }
    }
  } catch (e) {
    console.error('[bookpool] load failed:', e.message);
  }
  return false;
}

function saveToDisk() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch (e) {
    console.error('[bookpool] save failed:', e.message);
  }
}

// 去重键: 源 + bookid
function keyOf(b) { return `${b.source}:${b.bookid || b.book_url}`; }

async function build() {
  if (building) return building;
  building = (async () => {
    const seen = new Set();
    const out = [];
    for (const name of adapters.list()) {
      const a = adapters.get(name);
      if (!a) continue;
      for (const kw of KEYWORDS) {
        try {
          const list = await a.search(kw, 1);
          for (const b of list || []) {
            if (!b || !b.title) continue;
            const k = keyOf(b);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push({
              title: b.title,
              author: b.author || '',
              cover: b.cover || '',
              desc: b.desc || '',
              tags: b.tags || '',
              source: b.source,
              book_url: b.book_url || '',
              bookid: b.bookid || '',
            });
          }
        } catch (e) {
          // 单源/单关键词失败不影响整体
        }
      }
    }
    if (out.length) {
      cache = { books: out, at: Date.now() };
      saveToDisk();
      console.log(`[bookpool] 聚合 ${out.length} 本书`);
    }
    building = null;
    return out;
  })();
  return building;
}

// 启动时: 读盘; 过期或空则后台重建 (不阻塞)
function init() {
  const ok = loadFromDisk();
  if (!ok || Date.now() - cache.at > TTL) build();
}

function ensureFresh() {
  if (!cache.books.length || Date.now() - cache.at > TTL) build();
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// 查询: sort = random | hot | new ; q = 关键词 (可选, 命中标题/作者)
function get({ sort = 'random', limit = 10, page = 1, q = '' } = {}) {
  ensureFresh();
  let list = cache.books.slice();

  const kw = String(q || '').trim().toLowerCase();
  if (kw) {
    list = list.filter((b) =>
      (b.title || '').toLowerCase().includes(kw) ||
      (b.author || '').toLowerCase().includes(kw));
  }

  if (sort === 'hot') {
    // 稳定的"热度"序: 按 bookid 哈希, 保证每次一致
    list.sort((a, b) => hash(a.source + a.bookid) - hash(b.source + b.bookid));
  } else if (sort === 'new') {
    list.reverse();
  } else {
    // random: 洗牌
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  const perPage = Math.max(1, parseInt(limit, 10) || 10);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const start = (p - 1) * perPage;
  return {
    books: list.slice(start, start + perPage),
    total: list.length,
    page: p,
    per_page: perPage,
    has_more: start + perPage < list.length,
    building: !!building,
  };
}

// 实时跨源搜索 (q 为空时回退到池)
// 各源并行抓取后按源轮询交错, 保证每个源都有代表, 不被单源大结果集挤掉
async function searchLive(q, limit = 60) {
  const names = adapters.list();
  const lists = await Promise.all(names.map(async (name) => {
    const a = adapters.get(name);
    if (!a) return [];
    try { return (await a.search(q, 1)) || []; } catch (e) { return []; }
  }));
  const out = [];
  const seen = new Set();
  const maxLen = lists.reduce((m, l) => Math.max(m, l.length), 0);
  for (let i = 0; i < maxLen && out.length < limit; i++) {
    for (const list of lists) {
      const b = list[i];
      if (!b || !b.title) continue;
      const k = keyOf(b);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ title: b.title, author: b.author || '', cover: b.cover || '', desc: b.desc || '', tags: b.tags || '', source: b.source, book_url: b.book_url || '', bookid: b.bookid || '' });
      if (out.length >= limit) break;
    }
  }
  return out;
}

// 列表页不提供封面/简介/分类的源 (得奇/错层/晋江等) 走一次详情页补齐。
// 补 cover + desc + tags: 详情规则里本就有这些字段, 只是列表页拿不到。
// 结果按 book_id 落到 bookmeta 缓存 (TTL 7 天), 重复调用不再抓取。
async function enrichBooks(books, { limit = 30, concurrency = 6, timeout = 8000, force = false } = {}) {
  const targets = (books || []).filter((b) =>
    b && b.source && (b.book_url || b.bookid)
    && (!b.cover || !b.desc || !b.tags)).slice(0, limit);
  if (!targets.length) return books;

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const b = targets[cursor++];
      // 命中元数据缓存: 直接回填, 不抓取
      if (!force) {
        const hit = bookmeta.get(b.source, b.bookid);
        if (hit) { applyMeta(b, hit); continue; }
      }
      const a = adapters.get(b.source);
      if (!a) continue;
      try {
        const info = await Promise.race([
          a.detail({ url: b.book_url, bookid: b.bookid }),
          new Promise((_, rej) => { const t = setTimeout(() => rej(new Error('timeout')), timeout); if (t.unref) t.unref(); }),
        ]);
        if (info) {
          applyMeta(b, info);
          bookmeta.set(b.source, b.bookid, info);
        }
      } catch (e) {
        // 单本补全失败: 保持原样, 由响应出口兜默认图
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return books;
}

// 只补空字段, 不覆盖列表页已有的值
function applyMeta(b, m) {
  if (!b.cover && m.cover) b.cover = m.cover;
  if (!b.desc && m.desc) b.desc = m.desc;
  if (!b.tags && m.tags) b.tags = m.tags;
  if (!b.wordCount && m.wordCount) b.wordCount = m.wordCount;
  if (!b.latestChapterTitle && m.latestChapterTitle) b.latestChapterTitle = m.latestChapterTitle;
}

module.exports = { init, build, get, searchLive, enrichBooks, enrichCovers: enrichBooks, size: () => cache.books.length };
