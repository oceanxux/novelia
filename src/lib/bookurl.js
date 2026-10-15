'use strict';
// 书页 URL 归一化。
// 书源规则 (Legado/阅读 动态书源) 会把书籍 URL 塞进 data: URI 传给 /details、/catalog、
// /content。历史规则 (见 template 里 base64Encode(book_url) 的分支) 编码的是 base64(url),
// 而早期导入到书架的书记录至今仍带着这层 base64。后端若按原样当主机名拼接, 会得到非法
// 主机 -> fetch failed -> 500 -> 前端规则解引用 null 崩溃 (章节列表为空 / 换源错误)。
// 这里统一做一次容错还原: 能解成合法 URL 就还原, 否则原样返回。

// 只接受可打印 ASCII 的 base64 文本, 并做往返校验, 避免把普通短串误判成 base64
function tryBase64(s) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null;
  if (s.length % 4 !== 0) return null;
  let txt;
  try {
    const buf = Buffer.from(s, 'base64');
    if (!buf.length) return null;
    if (buf.toString('base64') !== s) return null;
    txt = buf.toString('utf8');
  } catch (e) { return null; }
  if (!/^[\x09\x0a\x0d\x20-\x7e]+$/.test(txt)) return null;
  return txt;
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(String(s || ''));
}

// 还原被 base64 包裹的 URL; 已是 http(s):// 则原样返回。
// 兼容个别历史数据的双重编码。
function decodeBookUrl(url) {
  let s = String(url == null ? '' : url).trim();
  if (!s || isHttpUrl(s) || /^data:/i.test(s)) return s;
  for (let i = 0; i < 2; i++) {
    const dec = tryBase64(s);
    if (!dec || !isHttpUrl(dec)) break;
    s = dec.trim();
  }
  return s;
}

// 从书页 URL 推断书籍 id (无 bookid 时的兜底)
function deriveBookId(url) {
  const s = String(url || '');
  let m = s.match(/(?:page\/|bookId=|book_id=)(\d{6,})/i);
  if (m) return m[1];
  m = s.match(/(?:page|reader|book_id[=/])(\d{15,22})/i);
  if (m) return m[1];
  m = s.match(/\/(?:read|books|book|info|novel|0)?\/([0-9a-zA-Z_-]+)(?:\/|\.html|$)/i);
  if (m) return m[1];
  m = s.match(/(\d+)(?!.*\d)/);
  if (m) return m[1];
  return '';
}

// 归一化入参: 返回 { url, bookid }, 缺失的 bookid 从还原后的 URL 推断
function normalizeBookParams({ url, bookid } = {}) {
  const real = decodeBookUrl(url);
  const bid = bookid || deriveBookId(real);
  return { url: real, bookid: bid };
}

module.exports = { decodeBookUrl, deriveBookId, normalizeBookParams };
