'use strict';
// Novelia 后端 — 入口
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const metrics = require('./lib/metrics');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
// multipart/form-data (头像上传 + 表单 FormData): 内存存储, 字段进 req.body
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.use(upload.any());

// 统一响应头 (前端不强制, 便于调试)
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
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
app.get('/debug', sendAdminPage('debug.html'));
app.get(ADMIN_PATH, sendAdminPage('admin.html'));
app.get(ADMIN_PATH + '/accounts', sendAdminPage('admin_accounts.html'));

app.use(require('./routes/search'));
app.use(require('./routes/detail'));
app.use(require('./routes/catalog'));
app.use(require('./routes/content'));
app.use(require('./routes/misc'));
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
  require('./lib/jjlists').init();
  app.listen(PORT, () => console.log(`Novelia listening on :${PORT}`));
}

module.exports = app;
