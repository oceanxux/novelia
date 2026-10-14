'use strict';
// 最简鉴权 (自建版, 不做设备绑定风控)
//   api_key: 16 字符短串, 登录时签发
//   前端 getSecretKey() 发 X-Api-Key = base64(api_key)
const crypto = require('crypto');

// 内存用户表: email -> { password, api_key }
// 用户由 SEED_USERS 环境变量注入 (JSON: [{email,password}]), 无内置默认账号
const users = new Map();

function genKey() {
  return crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
}

function seed() {
  const raw = process.env.SEED_USERS;
  if (!raw) return;
  const list = JSON.parse(raw);
  for (const u of list) {
    users.set(u.email, { password: u.password, api_key: u.api_key || genKey() });
  }
}

function login(email, password) {
  const u = users.get(email);
  if (!u) return { code: 1003, message: '用户不存在' };
  if (u.password !== password) return { code: 1000, message: '系统错误：密码错误' };
  return {
    code: 200,
    data: {
      user: { email, nickname: email.split('@')[0], api_key: u.api_key },
      device: { id: crypto.randomBytes(8).toString('hex') },
    },
  };
}

function findByKey(apiKey) {
  for (const [email, u] of users) if (u.api_key === apiKey) return { email, ...u };
  return null;
}

// 从 X-Api-Key 头解析并校验; 返回 user 或 null
function resolve(req) {
  const h = req.get('X-Api-Key');
  if (!h) return null;
  let key;
  try { key = Buffer.from(h, 'base64').toString('utf8'); } catch (e) { return null; }
  return findByKey(key);
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

seed();

module.exports = { login, resolve, required, optional, genKey, users };
