'use strict';
// 统一 HTTP 客户端: 处理 UA 头、GBK/UTF-8 自动解码、超时
const iconv = require('iconv-lite');
const httpMod = require('http');
const httpsMod = require('https');

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

// 宽松解析请求 (基于 node 原生 http/https + insecureHTTPParser)。
// 个别站点 (如七猫) 响应头带 obs-fold 折行 (续行以空格开头), llhttp/undici 严格解析会
// 直接抛 "Unexpected whitespace after header value" 导致请求失败; fetch 无开关可绕。
// 这里用原生栈并开启 insecureHTTPParser, 手动跟 3xx 跳转。仅此类站点使用。
function lenientOnce(url, { method = 'GET', headers = {}, body, timeout = 20000, _redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const mod = u.protocol === 'http:' ? httpMod : httpsMod;
    const req = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method,
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
      insecureHTTPParser: true,
      timeout,
    }, (res) => {
      const status = res.statusCode;
      if (status >= 300 && status < 400 && res.headers.location && _redirects < 5) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(lenientOnce(next, { method: 'GET', headers, timeout, _redirects: _redirects + 1 }));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const charset = sniffCharset(buf, res.headers['content-type']);
        resolve({ status, headers: res.headers, text: iconv.decode(buf, charset), buf });
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// 宽松请求 + 幂等重试 (语义同 request)
async function requestLenient(url, opts = {}) {
  const retries = opts.retries != null ? opts.retries : 2;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await lenientOnce(url, opts);
    } catch (e) {
      lastErr = e;
      const retriable = /timeout|ECONNRESET|socket hang up|EPIPE|ETIMEDOUT/i.test(String(e.message));
      if (!retriable || i === retries) throw e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
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

module.exports = { request, requestLenient, getHtml, DEFAULT_UA };
