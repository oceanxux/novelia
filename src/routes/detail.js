'use strict';
// POST /details  body: { source, url, name?, bookid?, tab? }  (必填 source + url)
// GET  /detail?book_id=<id>[,<id>...]
// 响应包裹: { code, message, data: Book }  (对齐原站)
const express = require('express');
const adapters = require('../adapters');

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
  try {
    const data = await adapter.detail({ url, bookid });
    res.json({ code: 200, message: '请求成功', data });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

// GET /detail?book_id=<id>  (支持逗号分隔多个 -> 数组)
router.get('/detail', async (req, res) => {
  const ids = String(req.query.book_id || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return res.status(400).json({ code: 400, message: '缺少 book_id', data: null });
  const adapter = pickAdapter(req.query.source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: null });
  try {
    const list = [];
    for (const id of ids) list.push(await adapter.detail({ bookid: id }));
    res.json({ code: 200, message: '请求成功', data: ids.length === 1 ? list[0] : list });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

module.exports = router;
