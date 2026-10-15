'use strict';
// POST /catalog  body: { source, url, name?, bookid?, tab? }
// 响应包裹: { code, message, data: Chapter[] }
const express = require('express');
const adapters = require('../adapters');
const { normalizeBookParams } = require('../lib/bookurl');

const router = express.Router();

router.post('/catalog', async (req, res) => {
  const { source } = req.body || {};
  if (!source) return res.status(400).json({ code: 400, message: '缺少必要参数', data: [] });
  const adapter = adapters.get(source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: [] });

  // 书页 URL 可能来自旧书架的 base64 记录, 先容错还原; bookid 缺失时从还原后的 URL 推断
  // (如番茄 /page/(\d+)、得奇/爱下/看书网等 /read/(\d+) 或 /0/(\d+))
  const { url, bookid } = normalizeBookParams(req.body || {});

  try {
    const data = await adapter.catalog({ url, bookid });
    res.json({ code: 200, message: '请求成功', data: Array.isArray(data) ? data : [] });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: [] });
  }
});

module.exports = router;
