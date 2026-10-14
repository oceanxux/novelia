'use strict';
// 后台鉴权中间件
//   登录后前端发 X-Admin-Token; 挂载点下的 /api/* (除 auth 三件套) 都要通过
//   must_change_password=true 的账户仅放行改密相关接口
const admins = require('../lib/admins');

// 免鉴权白名单 (仅登录 / 改密 / 登出本身; 路径相对挂载点)
const OPEN = new Set(['/api/auth/login', '/api/auth/change_password', '/api/auth/logout']);

function required(req, res, next) {
  const p = req.path;
  // 非后台 API (如页面路径), 交回后续路由处理
  if (!p.startsWith('/api')) return next();
  if (OPEN.has(p)) return next();
  const token = req.get('X-Admin-Token') || '';
  const s = admins.resolve(token);
  if (!s) return res.status(401).json({ code: 401, message: '未登录或会话已过期', must_change_password: false });
  const rec = admins.get(s.username);
  if (rec && rec.must_change_password) {
    return res.status(403).json({ code: 403, message: '请先修改初始密码', must_change_password: true });
  }
  req.admin = { username: s.username };
  next();
}

module.exports = { required };
