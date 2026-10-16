'use strict';
// Novelia 后端 — 入口
const express = require('express');
const path = require('path');
const fs = require('fs');
const metrics = require('./lib/metrics');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 统一响应头 (前端不强制, 便于调试)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 诊断: 请求日志 (仅记录业务端点, 避免静态资源噪声)
app.use((req, res, next) => {
  if (!/^\/(search|api\/|type_|style_|read_|book_|user_|book_source|login)/.test(req.path)) return next();
  const t0 = Date.now();
  res.on('finish', () => {
    console.log(`[req] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now() - t0}ms`);
  });
  next();
});

// 后台路径 (安全: 可用环境变量 ADMIN_PATH 改成任意难猜路径, 默认 /admin)
const ADMIN_PATH = (process.env.ADMIN_PATH || '/admin').replace(/\/+$/, '') || '/admin';

// 界面 (静态)
app.use(express.static(path.join(__dirname, '..', 'public')));

// 后台页面: 注入实际 ADMIN_PATH, 使页面内所有 API 调用与跳转跟随配置
function sendAdminPage(file) {
  return (req, res) => {
    fs.readFile(path.join(__dirname, '..', 'public', file), 'utf8', (err, html) => {
      if (err) return res.status(500).send('admin page missing');
      res.type('html').send(html.replace(/__ADMIN_PATH__/g, ADMIN_PATH));
    });
  };
}
// 发现页是公开页面, 其中的后台入口链接必须回退到默认 /admin,
// 否则任何访客都能从发现页读出隐藏的 ADMIN_PATH, 隐藏入口即失效。
function sendPublicPage(file) {
  return (req, res) => {
    fs.readFile(path.join(__dirname, '..', 'public', file), 'utf8', (err, html) => {
      if (err) return res.status(500).send('page missing');
      res.type('html').send(html.replace(/__ADMIN_PATH__/g, ADMIN_PATH));
    });
  };
}
app.get('/discover', sendPublicPage('discover.html'));
app.get('/debug', (req, res) => res.redirect(301, '/discover'));
app.get(ADMIN_PATH, sendAdminPage('admin.html'));
app.get(ADMIN_PATH + '/accounts', sendAdminPage('admin_accounts.html'));

app.use(require('./routes/search'));
app.use(require('./routes/detail'));
app.use(require('./routes/catalog'));
app.use(require('./routes/content'));
app.use(require('./routes/misc'));
app.use(require('./routes/explore'));
app.use(require('./routes/rank'));
// 后台 API: 挂在 ADMIN_PATH 下, 统一鉴权 (路径与页面路径一致)
const adminApi = express.Router();
adminApi.use(require('./middleware/adminauth').required);
adminApi.use(require('./routes/adminauth'));
adminApi.use(require('./routes/admin'));
adminApi.use(require('./routes/admin_accounts'));
app.use(ADMIN_PATH, adminApi);
app.use(require('./routes/booklist'));
app.use(require('./routes/book_source'));
app.use(require('./routes/auth'));
app.use(require('./routes/jj'));
app.use(require('./routes/fq'));
app.use(require('./routes/user').router);

app.get('/', (req, res) => res.redirect('/user_login'));

const PORT = process.env.PORT || 7001;
if (require.main === module) {
  metrics.start();
  require('./lib/bookpool').init();
  app.listen(PORT, () => console.log(`Novelia listening on :${PORT}`));
}

module.exports = app;
