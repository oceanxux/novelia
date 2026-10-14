'use strict';
// POST /catalog  body: { source, url, name?, bookid?, tab? }
// 响应包裹: { code, message, data: Chapter[] }
const express = require('express');
const adapters = require('../adapters');

const router = express.Router();

router.post('/catalog', async (req, res) => {
  const { source, url, bookid } = req.body || {};
  if (!source) return res.status(400).json({ code: 400, message: '缺少必要参数', data: { required: ['source', 'url'] } });
  const adapter = adapters.get(source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: null });
  try {
    const data = await adapter.catalog({ url, bookid });
    res.json({ code: 200, message: '请求成功', data });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

module.exports = router;
