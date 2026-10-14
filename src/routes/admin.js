'use strict';
// 书源管理 API (供 /admin 界面调用)
//   GET    /api/sources          列出全部源 (内置 + 用户)
//   GET    /api/sources/:name     取单个源的配置
//   POST   /api/sources           新增用户源
//   PUT    /api/sources/:name     修改用户源
//   DELETE /api/sources/:name     删除用户源
//   POST   /api/test              试跑一份配置 (搜索->详情->目录->正文), 不落盘
const express = require('express');
const store = require('../adapters/store');
const adapters = require('../adapters');
const { createAdapter } = require('../adapters/generic');

const router = express.Router();

function meta(name) {
  const cfg = store.list().find((c) => c.name === name) || null;
  return {
    name,
    base: cfg ? cfg.base : '',
    builtin: cfg ? store.isBuiltin(name) : true, // 定制模块 (如 qianyew) 视为内置只读
    editable: !!cfg && !store.isBuiltin(name),
    config: cfg,
  };
}

router.get('/api/sources', (req, res) => {
  res.json({ data: adapters.list().map(meta) });
});

router.get('/api/sources/:name', (req, res) => {
  const name = req.params.name;
  // 定制模块 (如 新御书屋/qianyew) 无声明式配置, 但仍是有效源: 返回只读元数据而非 404
  if (!store.list().some((c) => c.name === name) && !adapters.list().includes(name)) {
    return res.status(404).json({ error: '书源不存在: ' + name });
  }
  res.json({ data: meta(name) });
});

router.post('/api/sources', (req, res) => {
  const r = store.addUser(req.body);
  if (!r.ok) return res.status(400).json({ error: r.error });
  adapters.reload();
  res.json({ ok: true, name: r.name });
});

router.put('/api/sources/:name', (req, res) => {
  const r = store.updateUser(req.params.name, req.body);
  if (!r.ok) return res.status(400).json({ error: r.error });
  adapters.reload();
  res.json({ ok: true, name: r.name });
});

router.delete('/api/sources/:name', (req, res) => {
  const r = store.removeUser(req.params.name);
  if (!r.ok) return res.status(400).json({ error: r.error });
  adapters.reload();
  res.json({ ok: true });
});

// 试跑: 优先使用系统已注册并实例化的适配器; 若为新建/临时配置则动态实例化
router.post('/api/test', async (req, res) => {
  const cfg = req.body && req.body.config;
  const keyword = (req.body && req.body.keyword) || '斗破苍穹';
  const sourceName = (req.body && req.body.sourceName) || (cfg && cfg.name);

  let adapter = sourceName ? adapters.get(sourceName) : null;

  // 只有在不是已有源（即纯新建且未注册的源）时，才强行校验并临时动态实例化
  if (!adapter) {
    if (!cfg) return res.status(400).json({ error: '配置为空且未指定有效源: ' + sourceName });
    const err = store.validate(cfg);
    if (err) return res.status(400).json({ error: err });
    try {
      adapter = createAdapter(cfg);
    } catch (e) {
      return res.status(400).json({ error: '适配器创建失败: ' + e.message });
    }
  }

  const report = { name: (adapter && adapter.name) || (cfg && cfg.name) || '未知源', keyword, steps: [] };
  const step = async (label, fn) => {
    const t0 = Date.now();
    try {
      const value = await fn();
      report.steps.push({ label, ok: true, ms: Date.now() - t0, value });
      return value;
    } catch (e) {
      report.steps.push({ label, ok: false, ms: Date.now() - t0, error: String(e.message || e) });
      return null;
    }
  };

  try {
    const books = await step('搜索', () => adapter.search(keyword, 1));
    if (!books || !books.length) return res.json({ ok: false, report });
    report.bookCount = books.length;
    report.sample = books.slice(0, 5);

    const book = books[0];
    const info = await step('详情', () => adapter.detail({ url: book.book_url, bookid: book.bookid }));
    if (!info) return res.json({ ok: false, report });

    const chapters = await step('目录', () => adapter.catalog({ url: info.book_url, bookid: info.bookid }));
    if (!chapters || !chapters.length) return res.json({ ok: false, report });
    report.chapterCount = chapters.length;

    const firstChapter = chapters.find((c) => !c.isVolume && c.url) || chapters[0];
    await step('正文', () => adapter.content({
      cid: firstChapter.cid != null ? firstChapter.cid : 0,
      source: adapter.name,
      url: (info && info.book_url) || book.book_url,
      bookid: (info && info.bookid) || book.bookid,
      chapterUrl: firstChapter.url,
      chapterid: firstChapter.chapterid,
      itemId: firstChapter.itemId,
    }));
    return res.json({ ok: true, report });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e), report });
  }
});

module.exports = router;
