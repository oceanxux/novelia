'use strict';
// 书籍元数据缓存: 按 book_id 存简介/分类/封面/字数等详情字段。
//
// 为什么要单独一层: 番茄榜单只给排名 + 书名/作者/封面, 简介必须逐本抓详情页 (100 本 = 100 次
// 请求, 实测 10 路并发约 10 秒)。而一本书的简介/分类写出来之后基本不变, 因此:
//   榜单列表 TTL 短 (排名会变)  +  元数据 TTL 长 (内容不变)
// 结果: 那 100 次抓取一辈子只发生一次, 之后榜单刷新只花 1 次请求。
//
// 键为 `${source}:${bookid}`, 落盘 data/bookmeta.json (约 400B/本, 500 本约 200KB)。
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'bookmeta.json');
const TTL = 7 * 24 * 60 * 60 * 1000;   // 元数据 7 天

let store = {};        // key -> { at, data }
let loaded = false;
let dirty = false;
let flushTimer = null;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const j = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (j && typeof j === 'object') store = j;
    }
  } catch (e) {
    console.error('[bookmeta] load failed:', e.message);
    store = {};
  }
}

// 合并写盘: 批量抓取时避免每条都写一次文件
function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(store));
    } catch (e) {
      console.error('[bookmeta] save failed:', e.message);
    }
  }, 1500);
  if (flushTimer.unref) flushTimer.unref();
}

function keyOf(source, bookid) {
  return `${source || ''}:${bookid || ''}`;
}

// 取缓存 (未过期), 未命中返回 null
function get(source, bookid) {
  load();
  const k = keyOf(source, bookid);
  const e = store[k];
  if (!e || !e.data) return null;
  if (Date.now() - (e.at || 0) > TTL) return null;
  return e.data;
}

// 写入一条 (只保留需要的字段, 控制体积)
function set(source, bookid, data) {
  if (!data || !bookid) return;
  load();
  store[keyOf(source, bookid)] = {
    at: Date.now(),
    data: {
      desc: data.desc || '',
      tags: data.tags || '',
      cover: data.cover || '',
      wordCount: data.wordCount || '',
      latestChapterTitle: data.latestChapterTitle || '',
      status: data.status || '',
    },
  };
  scheduleFlush();
}

function size() {
  load();
  return Object.keys(store).length;
}

// 清空 (运维用)
function clear() {
  store = {};
  loaded = true;
  try {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  } catch (e) {}
}

module.exports = { get, set, size, clear, keyOf };
