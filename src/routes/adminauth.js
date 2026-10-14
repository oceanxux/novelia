'use strict';
// 后台鉴权 API (登录 / 改密 / 登出)
//   POST /api/auth/login           {username,password} -> {token,must_change_password}
//   POST /api/auth/change_password {old_password,new_password} (带 token)
//   POST /api/auth/logout          注销当前 token
//   GET  /api/auth/status          校验 token 是否有效
const express = require('express');
const admins = require('../lib/admins');

const router = express.Router();

function tokenOf(req) {
  return req.get('X-Admin-Token') || '';
}

router.post('/api/auth/login', (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return res.status(400).json({ code: 400, message: '请输入账号和密码' });
  const r = admins.login(username, password);
  if (!r.ok) return res.status(401).json({ code: 401, message: r.error });
  res.json({ code: 200, token: r.token, username: r.username, must_change_password: r.must_change_password });
});

router.post('/api/auth/change_password', (req, res) => {
  const s = admins.resolve(tokenOf(req));
  if (!s) return res.status(401).json({ code: 401, message: '未登录或会话已过期' });
  const body = req.body || {};
  const oldPwd = String(body.old_password || '');
  const newPwd = String(body.new_password || '');
  const r = admins.changePassword(s.username, oldPwd, newPwd);
  if (!r.ok) return res.status(400).json({ code: 400, message: r.error });
  res.json({ code: 200, message: '密码已更新' });
});

router.post('/api/auth/logout', (req, res) => {
  admins.logout(tokenOf(req));
  res.json({ code: 200 });
});

router.get('/api/auth/status', (req, res) => {
  const s = admins.resolve(tokenOf(req));
  if (!s) return res.status(401).json({ code: 401, message: '未登录' });
  const rec = admins.get(s.username);
  res.json({ code: 200, username: s.username, must_change_password: !!(rec && rec.must_change_password) });
});

module.exports = router;
