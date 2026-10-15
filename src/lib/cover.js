'use strict';
// 封面兜底与请求基准地址。
// 部分源 (茶马等) 的公开页面确实不提供书籍封面, 直接回空串会让客户端渲染成空白方块。
// 统一在响应出口补一张本站默认封面, 保证 cover 恒非空; 真实封面已在适配器层尽可能取全。
const DEFAULT_COVER_PATH = '/image/default_cover.png';

// 基准地址: 取自请求 Host, 部署到任意域名/端口自动适配
function baseUrl(req) {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = req.get('host') || '';
  return `${proto}://${host}`;
}

// 为缺失封面的书补默认封面 (不修改入参对象)
function withCover(books, base) {
  const fallback = String(base || '').replace(/\/$/, '') + DEFAULT_COVER_PATH;
  return (books || []).map((b) => (b && b.cover ? b : { ...b, cover: fallback }));
}

module.exports = { baseUrl, withCover, DEFAULT_COVER_PATH };
