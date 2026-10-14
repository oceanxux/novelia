'use strict';
// 番茄小说扫码登录 API
//   GET  /api/fq/login/scan      -> { token, csrf, qrImage, expireTime, notice, cookies }
//   POST /api/fq/login/check     -> { ok, status, cookies?, user? }  (前端轮询)
//   POST /api/fq/login/save      -> 手动保存 cookie 串 (备用)
//   GET  /api/fq/status          -> { logged_in, user? }
//   POST /api/fq/logout
//
// 说明: 番茄段落评论无 Web 端接口 (App 网关需 X-Gorgon 签名), 故本路由只做登录。
const express = require('express');
const fqlogin = require('../lib/fqlogin');
const fqtoken = require('../lib/fqtoken');

const router = express.Router();

router.get('/api/fq/login/scan', async (req, res) => {
  try {
    const s = await fqlogin.createQrSession(String(req.query.next || ''));
    // 前端每 1s 轮询, 需回带 token/csrf/cookies 以维持会话
    res.json({
      success: true,
      token: s.token,
      csrf: s.csrf,
      qrImage: s.qrcodeDataUrl,   // 已是 data:image/png;base64,... 可直接给 <img src>
      expireTime: s.expireTime,
      notice: s.notice,
      cookies: s.cookies,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
});

router.post('/api/fq/login/check', async (req, res) => {
  const { token, csrf, cookies } = req.body || {};
  try {
    const r = await fqlogin.checkQrLogin({ token, csrf, cookies });
    if (r.ok) fqtoken.setAccount({ cookies: r.cookies, user: r.user });
    res.json({ success: true, ok: r.ok, status: r.status, message: r.message || '', user: r.user || null, cookies: r.ok ? undefined : r.cookies });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
});

// 备用: 用户从浏览器/别处拿到完整 cookie 串后手动保存
router.post('/api/fq/login/save', (req, res) => {
  const raw = String((req.body && req.body.cookie) || '').trim();
  if (!raw) return res.json({ success: false, message: '缺少 cookie' });
  const cookies = {};
  for (const part of raw.split(';')) {
    const kv = part.trim();
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    cookies[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  if (!cookies.sessionid) return res.json({ success: false, message: 'cookie 中缺少 sessionid' });
  fqtoken.setAccount({ cookies, user: { user_id: '', name: '' } });
  res.json({ success: true, message: '已保存' });
});

router.get('/api/fq/status', async (req, res) => {
  if (!fqtoken.isLoggedIn()) return res.json({ success: true, logged_in: false });
  const saved = fqtoken.getUser();
  // 用真实请求校验 cookie 是否仍然有效
  try {
    const r = await fqlogin.fetchUserInfo(fqtoken.getCookieHeader());
    if (!r.ok) return res.json({ success: true, logged_in: false, expired: true });
    return res.json({ success: true, logged_in: true, user: { ...r.user, nickname: r.user.nickname || saved.nickname } });
  } catch (e) {
    // 网络异常时不误判为登出, 回退到本地记录
    return res.json({ success: true, logged_in: true, user: { user_id: saved.user_id, nickname: saved.nickname }, stale: true });
  }
});

router.post('/api/fq/logout', (req, res) => {
  fqtoken.clear();
  res.json({ success: true, message: '已退出番茄登录' });
});

module.exports = router;
