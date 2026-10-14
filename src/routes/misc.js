'use strict';
// 杂项端点: /login /version /api/get_config
const express = require('express');
const auth = require('../middleware/auth');
const adapters = require('../adapters');
const store = require('../adapters/store');

const router = express.Router();

// 登录: form-encoded 或 JSON, 返回 { code, data: { user, device } }
router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '').trim();
  if (!email || !password) return res.json({ success: false, code: 1001, message: '邮箱和密码不能为空' });
  const r = auth.login(email, password);
  if (r.code !== 200) return res.json({ success: false, code: r.code, message: r.message });
  res.json({ success: true, ...r });
});

// 版本校验 (前端会读 version/force/msg)
router.get('/version', (req, res) => {
  res.json({ version: '5.65', force: 'false', msg: '' });
});

// 源站列表 (前端 exploreUrl 会读; 也供调试面板)
router.get('/api/get_config', (req, res) => {
  res.json(adapters.list().map((name) => ({ key: name, name, type: 'novel' })));
});

// 已注册来源列表 (公开: 仅名称/base, 供发现页与调试面板; 不含任何可编辑配置)
router.get('/sources', (req, res) => {
  const data = adapters.list().map((name) => {
    const cfg = store.list().find((c) => c.name === name) || null;
    return { name, base: cfg ? cfg.base : '', builtin: !(cfg && !store.isBuiltin(name)) };
  });
  res.json({ data });
});

module.exports = router;
