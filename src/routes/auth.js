'use strict';
// 认证: 登录 / 注册 / 忘记密码
//   GET  /user_login(.php)         登录注册页
//   POST /user_login               登录 (JSON)
//   POST /register_api             注册 (FormData: send_code / verify_code)
//   GET  /forgot_password(.php)    忘记密码页
//   POST /forgot_password          重置密码 (JSON: send_reset_code / reset_password)
const path = require('path');
const express = require('express');
const store = require('../lib/userstore');
const sysconfig = require('../lib/sysconfig');
const devices = require('../lib/devices');
const upload = require('../middleware/upload');

const router = express.Router();
const PUBLIC = path.join(__dirname, '..', '..', 'public');

// 公开系统配置 (如自主注册开关, 供登录注册页前端查询)
router.get('/api/public_config', (req, res) => {
  res.json({ success: true, allow_register: sysconfig.get().allow_register });
});

// 邮箱验证码: email -> { code, password, expire, cooldownUntil, purpose }
const codes = new Map();
const CODE_TTL = 5 * 60 * 1000;
const COOLDOWN = 60 * 1000;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function validEmail(e) {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(e || ''));
}

// 演示环境: 验证码不回传前端, 仅写日志 (生产应走邮件)
function deliverCode(email, code) {
  console.log(`[auth] 验证码 -> ${email}: ${code}`);
}

function publicUser(u) {
  return {
    user_id: u.user_id || 1,
    email: u.email,
    nickname: u.nickname,
    avatar: u.avatar,
    is_member: !!u.is_member,
    api_key: u.api_key,
  };
}

// ---- 登录 / 注册页 ----
function sendLogin(req, res) { res.sendFile(path.join(PUBLIC, 'user_login.html')); }
router.get('/user_login', sendLogin);
router.get('/user_login.php', sendLogin);

// ---- 忘记密码页 ----
function sendForgot(req, res) { res.sendFile(path.join(PUBLIC, 'forgot_password.html')); }
router.get('/forgot_password', sendForgot);
router.get('/forgot_password.php', sendForgot);

// ---- 登录 ----
router.post('/user_login', (req, res) => {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const returnUrl = String(body.return_url || 'user_center');
  if (!email || !password) return res.json({ success: false, code: 1001, message: '邮箱和密码不能为空' });
  const user = store.get(email);
  if (!user) return res.json({ success: false, code: 1003, message: '该账号不存在，请检查登录账号' });
  if (user.disabled) return res.json({ success: false, code: 1004, message: '该账号已被禁用，请联系管理员' });
  if (user.password !== password) return res.json({ success: false, code: 1000, message: '密码错误' });
  user.last_use_at = Date.now();
  devices.touch(user, req);
  devices.refreshOnline(user);
  store.save();

  const remember = body.remember !== false && body.remember !== 'false';
  const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const cookieOpt = `path=/; Max-Age=${maxAge / 1000}; SameSite=Lax`;
  res.setHeader('Set-Cookie', [
    `user_token=${user.api_key}; ${cookieOpt}`,
    `X-Novel-Token=${user.api_key}; ${cookieOpt}`,
  ]);

  res.json({ success: true, token: user.api_key, user: publicUser(user), redirect: returnUrl });
});

// ---- 注册 ----
router.post('/register_api', upload, (req, res) => {
  if (!sysconfig.get().allow_register) {
    return res.json({ success: false, message: '系统当前已关闭自主注册功能，请联系管理员分配账户' });
  }

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const email = String(body.email || '').trim().toLowerCase();

  if (action === 'send_code') {
    if (!validEmail(email)) return res.json({ success: false, message: '请输入有效的邮箱地址' });
    if (store.get(email)) return res.json({ success: false, message: '该邮箱已注册，请直接登录' });
    const password = String(body.password || '');
    if (password.length < 6 || password.length > 12) return res.json({ success: false, message: '密码长度需在6-12位之间' });
    const prev = codes.get(email);
    if (prev && prev.cooldownUntil && Date.now() < prev.cooldownUntil) {
      return res.json({ success: false, message: `请 ${Math.ceil((prev.cooldownUntil - Date.now()) / 1000)} 秒后再试` });
    }
    const code = genCode();
    codes.set(email, { code, password, purpose: 'register', expire: Date.now() + CODE_TTL, cooldownUntil: Date.now() + COOLDOWN });
    deliverCode(email, code);
    return res.json({ success: true, message: '验证码已发送', data: { cooldown: 60 } });
  }

  if (action === 'verify_code') {
    const code = String(body.code || '').trim();
    const rec = codes.get(email);
    if (!rec || rec.purpose !== 'register') return res.json({ success: false, message: '请先获取验证码' });
    if (Date.now() > rec.expire) { codes.delete(email); return res.json({ success: false, message: '验证码已过期，请重新获取' }); }
    if (code !== rec.code) return res.json({ success: false, message: '验证码错误' });
    codes.delete(email);
    const user = store.add({ email, password: rec.password, nickname: email.split('@')[0] });
    return res.json({ success: true, message: '注册成功', data: { api_key: user.api_key, auto_approved: true } });
  }

  res.json({ success: false, message: '未知操作' });
});

// ---- 忘记密码 ----
router.post('/forgot_password', (req, res) => {
  const body = req.body || {};
  const action = String(body.action || '').trim();
  const email = String(body.email || '').trim().toLowerCase();

  if (action === 'send_reset_code') {
    if (!validEmail(email)) return res.json({ success: false, message: '请输入有效的邮箱地址' });
    if (!store.get(email)) return res.json({ success: false, message: '该邮箱未注册' });
    const prev = codes.get(email);
    if (prev && prev.cooldownUntil && Date.now() < prev.cooldownUntil) {
      return res.json({ success: false, message: `请 ${Math.ceil((prev.cooldownUntil - Date.now()) / 1000)} 秒后再试` });
    }
    const code = genCode();
    codes.set(email, { code, purpose: 'reset', expire: Date.now() + CODE_TTL, cooldownUntil: Date.now() + COOLDOWN });
    deliverCode(email, code);
    return res.json({ success: true, message: '验证码已发送', data: { cooldown: 60 } });
  }

  if (action === 'reset_password') {
    const code = String(body.code || '').trim();
    const password = String(body.password || '');
    const user = store.get(email);
    if (!user) return res.json({ success: false, message: '该邮箱未注册' });
    const rec = codes.get(email);
    if (!rec || rec.purpose !== 'reset') return res.json({ success: false, message: '请先获取验证码' });
    if (Date.now() > rec.expire) { codes.delete(email); return res.json({ success: false, message: '验证码已过期，请重新获取' }); }
    if (code !== rec.code) return res.json({ success: false, message: '验证码错误' });
    if (password.length < 6 || password.length > 12) return res.json({ success: false, message: '密码长度需在6-12位之间' });
    codes.delete(email);
    user.password = password;
    store.save();
    return res.json({ success: true, message: '密码修改成功' });
  }

  res.json({ success: false, message: '未知操作' });
});

module.exports = router;
