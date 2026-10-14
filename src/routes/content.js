'use strict';
// POST /content  body: chapterParams = { cid, source, url, ... }
// 响应包裹: { code, message, data: { content, source, tab, notice } }
// 鉴权: 对齐原站, /content 强制要求 X-Api-Key
const express = require('express');
const adapters = require('../adapters');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/content', auth.required, async (req, res) => {
  const params = req.body || {};
  const adapter = adapters.get(params.source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: null });
  try {
    const data = await adapter.content(params);
    res.json({ code: 200, message: '请求成功', data });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: null });
  }
});

module.exports = router;
