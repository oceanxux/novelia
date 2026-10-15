'use strict';
// multipart/form-data 解析 (头像上传 + 登录/注册表单 FormData)
// 内存存储, 单文件上限 5MB; 只挂在确实需要 multipart 的路由上,
// 避免对全部公开路由做 5MB 级的内存缓冲。
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4, fields: 40 },
});

module.exports = upload.any();
