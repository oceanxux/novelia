'use strict';
// 自定义 data-URI 协议编解码 (见契约第三节)
//   data:<kind>;base64,<base64(JSON)>,{"type":"susan"}
// kind ∈ { detailsUrl, catalogUrl, chapterUrl }

const SUFFIX = ',{"type":"susan"}';

function encode(kind, obj) {
  const b64 = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  return `data:${kind};base64,${b64}${SUFFIX}`;
}

// 解析 data-URI, 返回内层 JSON 对象; 非 data-URI 返回 null
function decode(uri) {
  if (typeof uri !== 'string' || !uri.startsWith('data:')) return null;
  const m = uri.match(/^data:[^;]+;base64,([^,]+)/);
  if (!m) return null;
  try {
    return JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));
  } catch (e) {
    return null;
  }
}

// 供 /content 的 chapterParams.url 解析: 前端对未知源传的是 catalog.url (源站书籍页 URL)
function bookIdFromUrl(url) {
  const m = String(url).match(/\/book\/(\d+)/);
  return m ? m[1] : null;
}

module.exports = { encode, decode, bookIdFromUrl };
