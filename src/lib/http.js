'use strict';
// 统一 HTTP 客户端: 处理 UA 头、GBK/UTF-8 自动解码、超时
const iconv = require('iconv-lite');

const DEFAULT_UA = 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)';

// 从 Content-Type 或 HTML meta 推断编码
function sniffCharset(buf, contentType) {
  const ct = (contentType || '').toLowerCase();
  let m = ct.match(/charset=([\w-]+)/);
  if (m) return m[1];
  const head = buf.slice(0, 2048).toString('latin1');
  m = head.match(/charset=["']?([\w-]+)/i);
  if (m) return m[1];
  return 'utf-8';
}

async function requestOnce(url, { method = 'GET', headers = {}, body, timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
      body,
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const charset = sniffCharset(buf, res.headers.get('content-type'));
    const text = iconv.decode(buf, charset);
    return { status: res.status, headers: res.headers, text, buf };
  } finally {
    clearTimeout(timer);
  }
}

// 部分站点对密集请求会 RST 连接 (fetch: "other side closed"); 幂等请求重试。
async function request(url, opts = {}) {
  const retries = opts.retries != null ? opts.retries : 2;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await requestOnce(url, opts);
    } catch (e) {
      lastErr = e;
      const retriable = e.name === 'AbortError' || /fetch failed|other side closed|ECONNRESET|socket hang up/i.test(String(e.message) + ' ' + String(e.cause && e.cause.message));
      if (!retriable || i === retries) throw e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

// 取 HTML 文本 (自动解码)
async function getHtml(url, opts) {
  const r = await request(url, opts);
  return r.text;
}

module.exports = { request, getHtml, DEFAULT_UA };
