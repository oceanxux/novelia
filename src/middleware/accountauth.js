'use strict';
// 账号级操作鉴权: 晋江/番茄扫码登录与登出操作的是"整台服务器共用"的账号凭证,
// 不是某个访客的私有状态, 因此必须要求已登录 (前台用户或管理员) 才能读改。
// 前台用户凭证来源: X-Api-Key(base64) / X-Novel-Token 头 / user_token Cookie
// 管理员凭证:       X-Admin-Token
const admins = require('../lib/admins');
const store = require('../lib/userstore');
const userauth = require('./auth');

function resolveUser(req) {
  const byHeaderKey = userauth.resolve(req);
  if (byHeaderKey) return byHeaderKey;
  const headerToken = req.get('X-Novel-Token');
  if (headerToken) {
    const u = store.findByKey(String(headerToken).trim());
    if (u) return u;
  }
  return resolveFromCookie(req);
}

// 前台页面用 Cookie 持有 user_token; /api/jj /api/fq 的请求头不带 api_key
function resolveFromCookie(req) {
  const header = req.get('cookie') || '';
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    if (name !== 'user_token' && name !== 'X-Novel-Token') continue;
    let val;
    try { val = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { val = part.slice(i + 1).trim(); }
    const u = store.findByKey(val);
    if (u) return u;
  }
  return null;
}

function required(req, res, next) {
  const admin = admins.resolve(req.get('X-Admin-Token') || '');
  if (admin) {
    req.account_actor = { role: 'admin', name: admin.username };
    return next();
  }
  const user = resolveUser(req);
  if (user) {
    req.account_actor = { role: 'user', name: user.email };
    req.user = user;
    return next();
  }
  return res.status(401).json({ success: false, code: 401, message: '未登录, 无法操作共享账号凭证' });
}

module.exports = { required, resolveUser };
