'use strict';
// 番茄小说适配器 (fanqienovel.com)
// 反爬与加密:
//   1. 官方搜索 /api/author/search/search_book/v1 被 bdturing 滑块验证拦截
//      (需 a_bogus 签名 + 国内 IP), 改用第三方 SDK 代理 api-lf.fanqiesdk.com 的
//      search/v1 接口, 关键词参数名为 q, 匿名可用。
//   2. 正文是字体混淆: 汉字被替换为 PUA 码位 (U+E000-U+F8FF), 通过稳定字体
//      dc027189e0ba4cd.woff2 渲染真实字形。映射表固化在 lib/fanqie-font.json。
//   3. 详情页偶发返回验证码变体 (无 __INITIAL_STATE__), 重试即可。
// 目录/详情/正文均为匿名接口, 无需登录, 与番茄账号体系无关。
const fs = require('fs');
const path = require('path');
const { request } = require('../lib/http');

const NAME = '番茄小说';
const BASE = 'https://fanqienovel.com';
const SDK = 'https://api-lf.fanqiesdk.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', Referer: BASE + '/' };

// PUA -> 汉字 映射 (字体哈希稳定, 全书通用)
const FONT_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib', 'fanqie-font.json'), 'utf8'));

// 解码字体混淆文本
function decode(text) {
  if (!text) return '';
  let out = '';
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xe000 && cp <= 0xf8ff) out += FONT_MAP[ch] !== undefined ? FONT_MAP[ch] : ch;
    else out += ch;
  }
  return out;
}

// 从 HTML 中提取 window.__INITIAL_STATE__ 的 JSON 对象 (花括号配对, 跳过字符串/转义)
function extractInitialState(html) {
  const marker = html.indexOf('__INITIAL_STATE__');
  if (marker === -1) return null;
  const start = html.indexOf('{', marker);
  if (start === -1) return null;
  let depth = 0, esc = false, inStr = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) return null;
  try { return JSON.parse(html.slice(start, end)); } catch (e) { return null; }
}

// 带重试地拉取详情页 __INITIAL_STATE__ (规避验证码变体)
async function fetchPageState(bookId, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const r = await request(`${BASE}/page/${bookId}`, { headers: HEADERS, timeout: 25000 });
    const state = extractInitialState(r.text);
    if (state && state.page && state.page.bookId) return state;
    lastErr = new Error('详情页未返回有效数据 (可能被验证码拦截)');
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw lastErr;
}

// 带重试地拉取正文页 __INITIAL_STATE__
async function fetchReaderState(itemId, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const r = await request(`${BASE}/reader/${itemId}`, { headers: HEADERS, timeout: 25000 });
    const state = extractInitialState(r.text);
    const cd = state && state.reader && state.reader.chapterData;
    if (cd && cd.content != null) return state;
    lastErr = new Error('正文页未返回有效数据 (可能被验证码拦截)');
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  throw lastErr;
}

// 把正文 HTML 转为纯文本: <p> -> 换行, 去掉图片占位与其余标签
function htmlToText(html) {
  return String(html)
    .replace(/<img[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fromBookId(bookId) {
  return { book_url: `${BASE}/page/${bookId}`, bookid: String(bookId) };
}

// 搜索: 第三方 SDK 代理, 参数名 q
async function search(keyword, page = 1) {
  const url = `${SDK}/api/novel/channel/homepage/search/search/v1`
    + `?q=${encodeURIComponent(keyword)}&aid=1967&page_count=10&page_index=${Math.max(0, page - 1)}`;
  const r = await request(url, { headers: { 'User-Agent': UA }, timeout: 20000 });
  let json;
  try { json = JSON.parse(r.text); } catch (e) { throw new Error('搜索返回非 JSON: ' + r.text.slice(0, 120)); }
  const list = (json.data && json.data.ret_data) || [];
  return list.map((b) => ({
    title: b.title || '',
    author: b.author || '',
    cover: b.thumb_url || b.audio_thumb_uri || '',
    desc: b.abstract || '',
    tags: b.category || '',
    wordCount: '',
    latestChapterTitle: '',
    source: NAME,
    tab: 'novel',
    book_url: `${BASE}/page/${b.book_id}`,
    bookid: String(b.book_id || ''),
  }));
}

// 从 categoryV2 (JSON 数组字符串) 提取分类名; 退化时用 category
function parseTags(page) {
  if (page.category) return page.category;
  try {
    const arr = JSON.parse(page.categoryV2 || '[]');
    return arr.map((x) => x && x.Name).filter(Boolean).join(' / ');
  } catch (e) { return ''; }
}

// 详情: 官方匿名页 __INITIAL_STATE__.page
async function detail({ url, bookid } = {}) {
  let bookId = bookid;
  if (!bookId && url) {
    const m = String(url).match(/(?:page\/|bookId=)(\d{6,})/);
    if (m) bookId = m[1];
  }
  if (!bookId) throw new Error('detail: 缺少 bookid');
  const state = await fetchPageState(bookId);
  const p = state.page;
  const finished = String(p.creationStatus) === '1' || String(p.status) === '1';
  return {
    title: p.bookName || '',
    author: p.author || '',
    cover: p.thumbUri || '',
    desc: p.abstract || '',
    tags: parseTags(p),
    wordCount: p.wordNumber ? String(p.wordNumber) : '',
    latestChapterTitle: p.lastChapterTitle || '',
    status: finished ? '完结' : '连载中',
    source: NAME,
    tab: 'novel',
    book_url: `${BASE}/page/${bookId}`,
    bookid: String(bookId),
  };
}

// 目录: 官方匿名 directory API, 按卷展开并插入卷标题
async function catalog({ url, bookid } = {}) {
  let bookId = bookid;
  if (!bookId && url) {
    const m = String(url).match(/(?:page\/|bookId=)(\d{6,})/);
    if (m) bookId = m[1];
  }
  if (!bookId) throw new Error('catalog: 缺少 bookid');

  const api = `${BASE}/api/reader/directory/detail?bookId=${bookId}`;
  let json;
  for (let i = 0; i < 3; i++) {
    const r = await request(api, { headers: HEADERS, timeout: 25000 });
    try { json = JSON.parse(r.text); break; } catch (e) {
      if (i === 2) throw new Error('目录接口返回损坏 JSON');
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  const volumes = (json.data && json.data.chapterListWithVolume) || [];
  const chapters = [];
  const fmtTime = (s) => {
    const n = Number(s);
    if (!n) return '';
    const d = new Date(n * 1000);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  let cid = 0;
  volumes.forEach((vol, vi) => {
    const volName = (vol[0] && vol[0].volume_name) || `第${vi + 1}卷`;
    chapters.push({ title: volName, url: '', cid: cid++, tag: '', isVolume: true, isVip: false, isPay: false });
    vol.forEach((c) => {
      chapters.push({
        title: c.title || '',
        url: `${BASE}/reader/${c.itemId}`,
        cid: cid++,
        tag: fmtTime(c.firstPassTime),
        isVolume: false,
        isVip: !!c.isChapterLock,
        isPay: !!(c.needPay || c.isPaidPublication),
        itemId: c.itemId,
      });
    });
  });
  return chapters;
}

// 正文: 官方匿名 reader 页 + 字体解码
// chapterParams: { cid, source, url, bookid, itemId/item_id }
async function content(chapterParams = {}) {
  const { cid, url, bookid } = chapterParams;
  let itemId = chapterParams.itemId || chapterParams.item_id;

  // 未直接给 itemId: 从 reader URL 取, 或按 cid 索引回查目录
  if (!itemId && url) {
    const m = String(url).match(/\/reader\/(\d{6,})/);
    if (m) itemId = m[1];
  }
  if (!itemId) {
    let bookId = bookid;
    if (!bookId && url) {
      const m = String(url).match(/(?:page\/|bookId=)(\d{6,})/);
      if (m) bookId = m[1];
    }
    if (!bookId) throw new Error('content: 缺少 itemId 且无法从 url 推出 bookid');
    const list = await catalog({ bookid: bookId });
    const chapter = list[Number(cid)];
    if (!chapter || chapter.isVolume) throw new Error(`content: cid ${cid} 越界或为卷标题 (目录 ${list.length} 项)`);
    itemId = chapter.itemId;
  }

  const state = await fetchReaderState(itemId);
  const cd = state.reader.chapterData;
  const text = htmlToText(decode(cd.content || ''));
  const locked = cd.isChapterLock || cd.needPay;
  return {
    content: text,
    title: cd.title || '',
    source: NAME,
    tab: 'novel',
    notice: locked ? '该章节可能需要付费或登录后阅读' : null,
  };
}

module.exports = { name: NAME, search, detail, catalog, content };
