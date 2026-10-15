'use strict';
// POST /catalog  body: { source, url, name?, bookid?, tab? }
// 响应包裹: { code, message, data: Chapter[] }
const express = require('express');
const adapters = require('../adapters');

const router = express.Router();

router.post('/catalog', async (req, res) => {
  let { source, url, bookid } = req.body || {};
  if (!source) return res.status(400).json({ code: 400, message: '缺少必要参数', data: [] });
  const adapter = adapters.get(source);
  if (!adapter) return res.status(400).json({ code: 400, message: '未知来源', data: [] });

  // 如果客户端未传递 bookid，尝试从 url 自动提取（如番茄 /page/(\d+)、得奇/爱下/看书网等 /read/(\d+) 或 /0/(\d+)）
  if (!bookid && url) {
    const fqM = String(url).match(/(?:page|reader|book_id[=/])(\d{15,22})/i);
    if (fqM) {
      bookid = fqM[1];
    } else {
      const anyNum = String(url).match(/\/(?:read|books|book|info|novel|0)?\/([0-9a-zA-Z_-]+)(?:\/|\.html|$)/i);
      if (anyNum) bookid = anyNum[1];
    }
  }

  try {
    const data = await adapter.catalog({ url, bookid });
    res.json({ code: 200, message: '请求成功', data: Array.isArray(data) ? data : [] });
  } catch (e) {
    res.status(500).json({ code: 500, message: String(e.message || e), data: [] });
  }
});

module.exports = router;
