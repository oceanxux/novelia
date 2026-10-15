'use strict';
// 书旗小说 (shuqi.com) 专属钩子: 目录 + 正文。
//
// 站点反爬: 普通浏览器 UA 被 WAF 按指纹拦 (403), 但放行搜索引擎爬虫 ->
//   用默认 Baiduspider UA 直连全站 200, 无需 cookie/浏览器。
//
// 目录: 详情页 /book/{id}.html 只有首尾预览, 完整目录在 /chapter?bid={id}
//   的 table.chapterul (一行 3 章, 全量一页返回)。
//
// 正文 (非静态 HTML, 必须走接口):
//   1. 签名源: 阅读页 /reader?bid={id} 内嵌 <i class="page-data js-dataChapters"> 的 JSON,
//      含 freeContUrlPrefix / shortContUrlPrefix 与每章的 contUrlSuffix (带 sign)。
//      sign 由服务端按章节生成, 无法自算, 故先拉一次阅读页缓存该 JSON。
//   2. 免费章 (payStatus=0): GET {freeContUrlPrefix}{contUrlSuffix} -> {state:200, ChapterContent}
//   3. VIP 章: 走 {shortContUrlPrefix}{shortContUrlSuffix} 取试读片段。
//   4. ChapterContent 为自定义编码: 字母位移替换 -> Base64 解码 -> UTF-8 还原。
const { request, DEFAULT_UA } = require('../../lib/http');
const { cheerio } = require('../../lib/rule');

const BASE = 'https://www.shuqi.com';
const HEADERS = { 'User-Agent': DEFAULT_UA, Referer: BASE + '/' };

const unescapeHtml = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// 从阅读页 HTML 提取 js-dataChapters JSON
function extractChapters(html) {
  const key = 'js-dataChapters';
  const i = html.indexOf(key);
  if (i < 0) return null;
  const s = html.indexOf('>', i) + 1;
  const e = html.indexOf('</i>', s);
  if (s <= 0 || e < 0) return null;
  try { return JSON.parse(unescapeHtml(html.slice(s, e))); } catch (err) { return null; }
}

// 书旗自定义解码: 字母位移 -> Base64 -> UTF-8
function decodeContent(enc) {
  if (!enc) return '';
  const shifted = String(enc).split('').map((ch) => {
    if (!/[A-Za-z]/.test(ch)) return ch;
    const e = Math.floor(ch.charCodeAt(0) / 97);
    const i = (ch.toLowerCase().charCodeAt(0) - 83) % 26 || 26;
    return String.fromCharCode(i + (e === 0 ? 64 : 96));
  }).join('');
  const b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let out = '';
  const t = shifted.replace(/[^A-Za-z0-9+/=]/g, '');
  for (let l = 0; l < t.length;) {
    const a = b64chars.indexOf(t.charAt(l++));
    const b = b64chars.indexOf(t.charAt(l++));
    const c = b64chars.indexOf(t.charAt(l++));
    const d = b64chars.indexOf(t.charAt(l++));
    out += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== 64) out += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d !== 64) out += String.fromCharCode(((c & 3) << 6) | d);
  }
  try {
    const utf8 = out.split('').map((ch) => '%' + ('00' + ch.charCodeAt(0).toString(16)).slice(-2)).join('');
    return decodeURIComponent(utf8);
  } catch (e) { return out; }
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const infoCache = new Map(); // bookId -> { at, info }
// 一本书的 chaptersInfo 含全书所有章节的 sign, 拉一次即可覆盖全书正文。
// /reader 是源站唯一限流入口 (滑动窗口, 触发后须完全静默数十秒), 故长缓存以减少请求。
const TTL = 30 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getChaptersInfo(bookId, headers) {
  const hit = infoCache.get(bookId);
  if (hit && Date.now() - hit.at < TTL) return hit.info;
  const url = `${BASE}/reader?bid=${bookId}`;
  let lastErr;
  for (let i = 0; i < 3; i++) {
    const r = await request(url, { headers: { ...headers, Referer: `${BASE}/book/${bookId}.html` }, timeout: 25000, retries: 0 });
    if (r.status === 200) {
      const info = extractChapters(r.text);
      if (info) { infoCache.set(bookId, { at: Date.now(), info }); return info; }
      lastErr = new Error('阅读页未返回章节数据');
    } else if (r.status === 429) {
      // 源站按 Retry-After 指示剩余静默时间; 无该头则指数退避。
      const ra = Number(r.headers.get('retry-after') || 0);
      lastErr = new Error(`阅读页被限流 (HTTP 429, retry-after=${ra}s)`);
      if (i < 2) { await sleep(Math.min(ra > 0 ? (ra + 2) * 1000 : 5000 * (i + 1), 95000)); continue; }
    } else {
      lastErr = new Error(`阅读页 HTTP ${r.status}`);
    }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`书旗: 取章节签名失败 (${lastErr.message}); 该源 /reader 有频率限制, 稍后重试`);
}

// 目录钩子: 从 /chapter?bid={id} 抓全量章节
// ctx = { $, html, bookUrl, base, headers, fetch, abs }
async function build(ctx) {
  const { bookUrl, base, headers, abs } = ctx;
  const m = String(bookUrl).match(/\/book\/(\d+)\.html/) || String(bookUrl).match(/bid=(\d+)/);
  if (!m) return [];
  const bookId = m[1];
  const r = await request(`${BASE}/chapter?bid=${bookId}`, { headers: { ...headers, Referer: bookUrl }, timeout: 25000 });
  const $ = cheerio.load(r.text);
  const out = [];
  const seen = new Set();
  $('table.chapterul a[href*="/reader?bid="]').each((_, el) => {
    const href = $(el).attr('href');
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    if (!href || !title) return;
    const url = abs(base, href);
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ title, url });
  });
  return out;
}

// 正文钩子: ctx = { chapter, list, bookUrl, base, headers, fetch, abs }
async function contentBuild(ctx) {
  const { chapter, headers } = ctx;
  const m = String(chapter.url).match(/bid=(\d+)/);
  const cidM = String(chapter.url).match(/cid=(\d+)/);
  if (!m || !cidM) throw new Error('书旗: 无法从章节 URL 解析 bid/cid');
  const bookId = m[1], cid = cidM[1];
  const info = await getChaptersInfo(bookId, headers);

  let target = null;
  for (const vol of info.chapterList || []) {
    for (const c of vol.volumeList || []) {
      if (String(c.chapterId) === String(cid)) { target = c; break; }
    }
    if (target) break;
  }
  if (!target) throw new Error(`书旗: 目录中未找到章节 ${cid}`);

  const isFree = String(target.payStatus) === '0' || target.isFreeRead === true;
  const prefix = isFree ? info.freeContUrlPrefix : info.shortContUrlPrefix;
  const suffix = isFree ? target.contUrlSuffix : target.shortContUrlSuffix;
  if (!prefix || !suffix) throw new Error('书旗: 章节缺少正文地址');

  const r = await request(prefix + suffix, {
    headers: { ...headers, Referer: `${BASE}/reader?bid=${bookId}&cid=${cid}` },
    timeout: 25000,
  });
  let j;
  try { j = JSON.parse(r.text); } catch (e) { throw new Error('书旗: 正文接口返回非 JSON'); }
  if (String(j.state) !== '200' || !j.ChapterContent) {
    throw new Error(`书旗: 正文接口异常 state=${j.state} msg=${j.message || ''}`);
  }
  return htmlToText(decodeContent(j.ChapterContent));
}

module.exports = { build, contentBuild, extractChapters, decodeContent };
