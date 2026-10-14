'use strict';
// GET /search?login=search&key=<kw>&page=<n>&source=<源站名?>
// 响应包裹: { isSuccess, error, data: Book[], cached_at }  (对齐原站)
const express = require('express');
const adapters = require('../adapters');

const router = express.Router();

// 未指定 source 时的默认源优先级。站点会临时抖动/不可达 (TLS reset / 限流),
// 若写死首个适配器, 默认搜索会因单点抖动整体落空, 故按序取首个"可达且有结果"的源。
// 不在列表中的新源自动追加到末尾, 保证兜底覆盖。
const PREFERRED = ['番茄小说', '爱下', '错层', '得奇', '看书网', '星星', '全本', '穿越小说', '新御书屋'];

function defaultCandidates() {
  const all = adapters.list();
  const head = PREFERRED.filter((n) => all.includes(n));
  const rest = all.filter((n) => !head.includes(n));
  return [...head, ...rest];
}

router.get('/search', async (req, res) => {
  const key = req.query.key || '';
  const page = parseInt(req.query.page, 10) || 1;
  const source = req.query.source;

  // 显式 source: 只打该源, 行为与错误原样透传
  if (source) {
    const adapter = adapters.get(source);
    if (!adapter) {
      return res.json({ isSuccess: false, error: 'unknown source: ' + source, data: [], cached_at: Date.now() });
    }
    try {
      const data = await adapter.search(key, page);
      return res.json({ isSuccess: true, error: 'success', data, cached_at: Date.now() });
    } catch (e) {
      return res.json({ isSuccess: false, error: String(e.message || e), data: [], cached_at: Date.now() });
    }
  }

  // 未指定 source: 按优先级逐个尝试, 取首个非空结果
  let lastErr = 'no adapter registered';
  for (const name of defaultCandidates()) {
    const adapter = adapters.get(name);
    if (!adapter) continue;
    try {
      const data = await adapter.search(key, page);
      if (Array.isArray(data) && data.length) {
        return res.json({ isSuccess: true, error: 'success', data, cached_at: Date.now() });
      }
    } catch (e) {
      lastErr = String(e.message || e);
    }
  }
  res.json({ isSuccess: false, error: lastErr, data: [], cached_at: Date.now() });
});

module.exports = router;
