'use strict';
// 前台用户鉴权 (自建版, 不做设备绑定风控)
//   api_key: 16 字符短串, 登录/注册时签发, 存于 lib/userstore
//   前端 getSecretKey() 发 X-Api-Key = base64(api_key)
//   数据源与 /user_center、/api/chapter 完全一致, 避免出现两套用户表。
const store = require('../lib/userstore');

function decodeKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const decoded = Buffer.from(s, 'base64').toString('utf8');
    // base64 解出的必须是可打印短串, 否则视为原始 key
    if (/^[\x20-\x7e]{8,64}$/.test(decoded)) return decoded;
  } catch (e) { /* 非 base64, 按原文处理 */ }
  return s;
}

// 从 X-Api-Key 头解析并校验; 返回 user 或 null
function resolve(req) {
  const h = req.get('X-Api-Key');
  if (!h) return null;
  return store.findByKey(decodeKey(h));
}

// 强制鉴权中间件 (仅 /content 用, 对齐原站)
function required(req, res, next) {
  const user = resolve(req);
  if (!user) return res.status(401).json({ code: 401, message: '未登录或凭证无效', data: { content: '未登录' } });
  req.user = user;
  next();
}

// 宽松: 有则挂载, 无则放行 (/search /details /catalog)
function optional(req, res, next) {
  req.user = resolve(req);
  next();
}

module.exports = { resolve, required, optional };
