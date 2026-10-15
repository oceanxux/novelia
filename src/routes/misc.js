'use strict';
// 杂项端点: /login /version /api/get_config
const express = require('express');
const adapters = require('../adapters');
const store = require('../adapters/store');

const router = express.Router();

// 登录 / 查询: form-encoded 或 JSON, 返回 { code, data: { user, device } }
// 兼容 Legado 手机书源中 source.getLoginInfoMap() -> /login 以及 get_user() -> /login(key) 契约
const userstore = require('../lib/userstore');
const devices = require('../lib/devices');
router.post('/login', (req, res) => {
  const key = String(req.body.key || '').trim();
  if (key) {
    let rawKey = key;
    try { rawKey = Buffer.from(key, 'base64').toString('utf8'); } catch (e) {}
    const user = userstore.findByKey(rawKey) || userstore.findByKey(key);
    if (!user) return res.json({ success: false, code: 1003, message: '密钥无效或用户不存在' });
    // 书源带设备号时按设备号登记, 保证同一台机器不重复计数
    const dev = devices.touch(user, req, String(req.body.device_id || '').trim());
    devices.refreshOnline(user);
    userstore.save();
    return res.json({
      success: true,
      code: 200,
      data: {
        user: {
          email: user.email,
          nickname: user.nickname || user.email.split('@')[0],
          api_key: user.api_key,
          is_member: !!user.is_member,
          status: user.disabled ? '封禁' : (user.is_member ? '会员' : '正常'),
        },
        device: {
          id: dev ? dev.id : 'dev_' + user.api_key.slice(0, 8),
          online_count: (user.devices || []).filter((d) => d.online).length,
          device_limit: 5,
          total_count: (user.devices || []).length,
          list: (user.devices || []).map((d) => ({
            device_id: d.id,
            name: d.name,
            ip_address: d.ip || '',
            is_online: !!d.online,
            last_active: d.last_active_text || '',
          })),
        },
      },
    });
  }

  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();
  if (!email || !password) return res.json({ success: false, code: 1001, message: '邮箱和密码不能为空' });
  const user = userstore.get(email);
  if (!user) return res.json({ success: false, code: 1003, message: '用户不存在' });
  if (user.disabled) return res.json({ success: false, code: 1004, message: '该账号已被禁用' });
  if (user.password !== password) return res.json({ success: false, code: 1000, message: '密码错误' });

  user.last_use_at = Date.now();
  const dev = devices.touch(user, req, String(req.body.device_id || '').trim());
  devices.refreshOnline(user);
  userstore.save();

  // 设置 Cookie (30天)，供 Legado CookieJar 与 WebView 跨域复用
  const maxAge = 30 * 24 * 60 * 60 * 1000;
  const cookieOpt = `path=/; Max-Age=${maxAge / 1000}; SameSite=Lax`;
  res.setHeader('Set-Cookie', [
    `user_token=${user.api_key}; ${cookieOpt}`,
    `X-Novel-Token=${user.api_key}; ${cookieOpt}`,
  ]);

  res.json({
    success: true,
    code: 200,
    data: {
      user: {
        email: user.email,
        nickname: user.nickname || user.email.split('@')[0],
        api_key: user.api_key,
        is_member: !!user.is_member,
      },
      device: {
        id: dev ? dev.id : 'dev_' + user.api_key.slice(0, 8),
        online_count: (user.devices || []).filter((d) => d.online).length,
        device_limit: 5,
        total_count: (user.devices || []).length,
        list: (user.devices || []).map((d) => ({
          device_id: d.id,
          name: d.name,
          ip_address: d.ip || '',
          is_online: !!d.online,
          last_active: d.last_active_text || '',
        })),
      },
    },
  });
});

// 版本校验与更新检查 (阅读 app 会通过浏览器弹窗访问 /version?id=5.65)
router.get('/version', (req, res) => {
  const isBrowser = (req.get('accept') || '').includes('text/html') || req.query.id !== undefined;
  if (isBrowser) {
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = req.get('host') || '';
    const base = `${proto}://${host}`;
    return res.type('html').send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Novelia · 书源更新</title>
<style>
  body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f8fafc; color:#1e293b; padding:24px; margin:0; }
  .card { max-width:440px; margin:20px auto; background:#fff; border-radius:18px; padding:24px; box-shadow:0 10px 30px rgba(0,0,0,0.06); text-align:center; }
  .badge { display:inline-block; padding:4px 12px; background:#e0e7ff; color:#4338ca; border-radius:999px; font-size:12px; font-weight:700; margin-bottom:12px; }
  h2 { margin:0 0 8px; font-size:20px; }
  p { font-size:13px; color:#64748b; line-height:1.6; margin:0 0 20px; }
  .btn { display:block; padding:12px; border-radius:12px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; text-decoration:none; font-weight:600; font-size:14px; box-shadow:0 4px 14px rgba(99,102,241,0.3); }
  .log-box { text-align:left; background:#f1f5f9; border-radius:12px; padding:14px; font-size:12px; line-height:1.7; color:#334155; margin-bottom:20px; }
</style>
</head>
<body>
<div class="card">
  <span class="badge">当前最新版本 v5.65</span>
  <h2>Novelia 聚合书源</h2>
  <p>书源核心与服务连接正常，可点击下方一键导入/更新到阅读 App。</p>
  <div class="log-box">
    <b>近期更新说明：</b><br>
    • 修复第三方源封面 403 防盗链代理问题<br>
    • 修复服务器连通性检测与接口探活<br>
    • 完善番茄小说与晋江文学城无缝扫码登录<br>
    • 优化多端同步与 Legado 契约兼容
  </div>
  <a class="btn" href="yuedu://booksource/importonline?src=${encodeURIComponent(base + '/book_source.json')}">一键更新 / 导入书源到阅读</a>
</div>
</body>
</html>`);
  }
  res.json({ version: '5.65', force: 'false', msg: '当前已是最新版本' });
});

// 服务器连通性探活接口 (阅读 App「服务器检测」功能调用)
router.get('/detection', (req, res) => {
  res.type('text/plain').send('书山Novel/Novelia-Server-OK');
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
