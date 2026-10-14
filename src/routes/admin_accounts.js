'use strict';
// 后台账户管理 + 兑换码管理
//   GET    /api/accounts                 账户列表
//   POST   /api/accounts/:email/member   手动设置/取消会员 {member:bool}
//   POST   /api/accounts/:email/password 重置密码 {password}
//   DELETE /api/accounts/:email          删除账户
//   GET    /api/codes                    兑换码列表
//   POST   /api/codes                    生成兑换码 {count, expires_days}
//   DELETE /api/codes/:code              删除兑换码
const express = require('express');
const store = require('../lib/userstore');
const codes = require('../lib/redeemcodes');

const router = express.Router();

function acct(u) {
  return {
    email: u.email,
    nickname: u.nickname,
    api_key: u.api_key,
    is_member: !!u.is_member,
    disabled: !!u.disabled,
    allow_web_read: u.allow_web_read !== undefined ? !!u.allow_web_read : true,
    created_at: u.created_at || 0,
    last_use_at: u.last_use_at || 0,
    devices: (u.devices || []).length,
    member_records: (u.member_records || []).length,
  };
}

router.get('/api/accounts', (req, res) => {
  res.json({ data: [...store.users.values()].map(acct) });
});

router.post('/api/accounts/:email/toggle_disable', (req, res) => {
  const u = store.get(String(req.params.email || '').toLowerCase());
  if (!u) return res.status(404).json({ error: '账户不存在' });
  const disabled = req.body && req.body.disabled !== undefined ? !!req.body.disabled : !u.disabled;
  u.disabled = disabled;
  store.save();
  res.json({ ok: true, email: u.email, disabled: u.disabled });
});

router.post('/api/accounts/:email/toggle_web_read', (req, res) => {
  const u = store.get(String(req.params.email || '').toLowerCase());
  if (!u) return res.status(404).json({ error: '账户不存在' });
  const allow = req.body && req.body.allow_web_read !== undefined ? !!req.body.allow_web_read : !(u.allow_web_read !== false);
  u.allow_web_read = allow;
  store.save();
  res.json({ ok: true, email: u.email, allow_web_read: u.allow_web_read });
});

router.post('/api/accounts/:email/member', (req, res) => {
  const u = store.get(String(req.params.email || '').toLowerCase());
  if (!u) return res.status(404).json({ error: '账户不存在' });
  const member = !!(req.body && req.body.member);
  u.is_member = member;
  if (member && !(u.member_records || []).length) {
    u.member_records = [{
      code: 'ADMIN', masked_code: '后台开通',
      created_at: Date.now(), created_at_text: new Date().toLocaleString('zh-CN'),
    }];
  }
  store.save();
  res.json({ ok: true, is_member: u.is_member });
});

// 管理员重置密码: 未提供则随机生成并回传, 便于转告用户
router.post('/api/accounts/:email/password', (req, res) => {
  const u = store.get(String(req.params.email || '').toLowerCase());
  if (!u) return res.status(404).json({ error: '账户不存在' });
  let password = String((req.body && req.body.password) || '').trim();
  if (password) {
    if (password.length < 6 || password.length > 12) {
      return res.status(400).json({ error: '密码长度需在6-12位之间' });
    }
  } else {
    password = store.genKey().slice(0, 10);
  }
  u.password = password;
  store.save();
  res.json({ ok: true, email: u.email, password });
});

router.delete('/api/accounts/:email', (req, res) => {
  const email = String(req.params.email || '').toLowerCase();
  const ok = store.users.delete(email);
  if (ok) store.save();
  res.json({ ok });
});

// ---- 兑换码 ----
router.get('/api/codes', (req, res) => {
  res.json({ data: codes.list() });
});

router.post('/api/codes', (req, res) => {
  const count = Math.min(100, Math.max(1, parseInt(req.body && req.body.count, 10) || 1));
  const days = Math.max(0, parseInt(req.body && req.body.expires_days, 10) || 0);
  res.json({ ok: true, codes: codes.generate(count, days) });
});

router.delete('/api/codes/:code', (req, res) => {
  res.json({ ok: codes.revoke(req.params.code) });
});

module.exports = router;
