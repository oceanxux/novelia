'use strict';
// POST /details  body: { source, url, name?, bookid?, tab? }  (必填 source + url)
// GET  /detail?book_id=<id>[,<id>...]
// 响应包裹: { code, message, data: Book }  (对齐原站)
const express = require('express');
const adapters = require('../adapters');
const bookmeta = require('../lib/bookmeta');
const { normalizeBookParams } = require('../lib/bookurl');

const router = express.Router();

// 未知来源返回 null (由调用方回 400), 不再静默回退到第一个适配器
function pickAdapter(source) {
  return source ? adapters.get(source) : null;
}

router.post('/details', async (req, res) => {
  const { source, url, bookid } = req.body || {};
  if (!source || !url) {
    return res.status(400).json({ code: 400, message: '缺少必要参数', data: { required: ['source', 'url'] } });
  }
  const adapter = pickAdapter(source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: null });
  const p = normalizeBookParams({ url, bookid });
  try {
    const data = await adapter.detail({ url: p.url, bookid: p.bookid });
    res.json({ code: 200, message: '请求成功', data });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

// GET /detail?book_id=<id>  (支持逗号分隔多个 -> 数组)
// 批量时并发抓取: 榜单一次可能带 100 个 id, 串行会等到超时 (实测 100 本串行 >> 100s)。
// 单本失败不影响其它条目, 失败位返回 null 以保持数组下标与入参 id 一一对应。
router.get('/detail', async (req, res) => {
  const ids = String(req.query.book_id || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return res.status(400).json({ code: 400, message: '缺少 book_id', data: null });
  const adapter = pickAdapter(req.query.source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: null });
  try {
    const list = await mapLimit(ids, 8, async (id) => {
      // 命中元数据缓存: 免抓取; 缓存只有元数据字段, 需补回标识字段
      const hit = bookmeta.get(req.query.source, id);
      if (hit) {
        return { title: '', author: '', source: req.query.source, tab: 'novel', book_url: '', bookid: id, ...hit };
      }
      try {
        const info = await adapter.detail({ bookid: id });
        if (info) bookmeta.set(req.query.source, id, info);
        return info;
      } catch (e) {
        return null;
      }
    });
    res.json({ code: 200, message: '请求成功', data: ids.length === 1 ? list[0] : list });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

// 并发上限映射, 保持入参顺序
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

module.exports = router;
