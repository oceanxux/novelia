'use strict';
// 七猫小说适配器 (qimao.com)
//
// 反爬与实现要点:
//   1. 响应头畸形: 七猫回包带 obs-fold 折行头 (续行以空格开头, 如 " content-security-policy:")。
//      Node 的 llhttp/undici 严格解析直接抛 "Unexpected whitespace after header value", fetch 无开关可绕;
//      故全站请求走 lib/http.js 的 requestLenient (原生 http/https + insecureHTTPParser)。
//   2. 搜索/详情/目录走 JSON 接口 (/qimaoapi/api/...), 非 HTML 选择器; 用 Baiduspider UA 直连即可 200。
//   3. 正文: 免费章静态渲染在 .chapter-detail-article; VIP 章 (is_vip=1) 付费墙, 正文为空 (源站行为, 非实现缺陷)。
//
// 接口:
//   搜索 /qimaoapi/api/search/result?keyword=&page=
//   详情 /qimaoapi/api/book-detail/main-info?book_id=  + /book-detail/intro?book_id= (简介/首章)
//   目录 /qimaoapi/api/book/chapter-list?book_id=
//   章节页 /shuku/{book_id}-{chapter_id}/
const cheerio = require('cheerio');
const { requestLenient, DEFAULT_UA } = require('../lib/http');

const NAME = '七猫';
const BASE = 'https://www.qimao.com';
const HEADERS = { 'User-Agent': DEFAULT_UA, Referer: BASE + '/' };

const json = (text) => { try { return JSON.parse(text); } catch (e) { throw new Error('返回非 JSON: ' + String(text).slice(0, 120)); } };

async function api(path) {
  const r = await requestLenient(BASE + path, { headers: HEADERS, timeout: 25000 });
  if (r.status !== 200) throw new Error(`七猫接口 ${r.status}: ${path}`);
  return json(r.text);
}

function bookIdOf(url, bookid) {
  if (bookid) return String(bookid);
  const m = String(url || '').match(/\/shuku\/(\d+)/);
  return m ? m[1] : '';
}

// 搜索: JSON 接口, 15 条/页
async function search(keyword, page = 1) {
  const j = await api(`/qimaoapi/api/search/result?keyword=${encodeURIComponent(keyword)}&page=${page}`);
  const list = (j.data && j.data.search_list) || [];
  return list.map((b) => ({
    title: b.title || '',
    author: b.author || '',
    cover: b.image_link || '',
    desc: b.intro || '',
    tags: b.category2_name || '',
    wordCount: b.words_num || '',
    latestChapterTitle: b.latest_chapter_title || '',
    source: NAME,
    tab: 'novel',
    book_url: b.read_url || `${BASE}/shuku/${b.book_id}/`,
    bookid: String(b.book_id || ''),
  })).filter((b) => b.title && b.book_url);
}

// 详情: main-info (元数据) + intro (简介)
async function detail({ url, bookid } = {}) {
  const id = bookIdOf(url, bookid);
  if (!id) throw new Error('detail: 缺少 bookid');
  const [main, intro] = await Promise.all([
    api(`/qimaoapi/api/book-detail/main-info?book_id=${id}`),
    api(`/qimaoapi/api/book-detail/intro?book_id=${id}`).catch(() => null),
  ]);
  const bd = (main.data && main.data.book_detail) || {};
  const it = (intro && intro.data) || {};
  return {
    title: bd.title || '',
    author: bd.author || '',
    cover: bd.image_link || bd.free_image_link || '',
    desc: it.intro || '',
    tags: [bd.category_1_name, bd.category_2_name].filter(Boolean).join(' / '),
    wordCount: bd.words_num || '',
    latestChapterTitle: bd.latest_chapter_title || '',
    status: String(bd.is_over) === '1' ? '完结' : '连载中',
    source: NAME,
    tab: 'novel',
    book_url: `${BASE}/shuku/${id}/`,
    bookid: id,
  };
}

// 目录: chapter-list, 返回全部章节 (无分页)
async function catalog({ url, bookid } = {}) {
  const id = bookIdOf(url, bookid);
  if (!id) throw new Error('catalog: 缺少 bookid');
  const j = await api(`/qimaoapi/api/book/chapter-list?book_id=${id}`);
  const chapters = (j.data && j.data.chapters) || [];
  return chapters.map((c, i) => ({
    title: c.title || '',
    url: `${BASE}/shuku/${id}-${c.id}/`,
    cid: i,
    tag: '',
    isVolume: false,
    isVip: String(c.is_vip) !== '0',
    isPay: String(c.is_vip) !== '0',
  })).filter((c) => c.title && c.url);
}

// 正文: 章节页静态 HTML 的 .chapter-detail-article; VIP 章付费墙 (正文为空)
async function content(chapterParams = {}) {
  const { cid, url, bookid } = chapterParams;
  let list = null;
  let chapter = null;

  // 优先按 cid 回查目录拿章节 URL; 否则用传入的 url
  if (url && !/\/shuku\/\d+-\d+\//.test(url)) {
    // url 是书籍页而非章节页 -> 回查目录
    list = await catalog({ url, bookid });
    chapter = list[Number(cid)];
  } else if (url) {
    chapter = { url, title: '', isVip: false };
  }
  if (!chapter) {
    const id = bookIdOf(url, bookid);
    if (!id) throw new Error('content: 缺少 url/bookid');
    list = list || await catalog({ bookid: id });
    chapter = list[Number(cid)];
  }
  if (!chapter) throw new Error(`content: cid ${cid} 越界`);

  const r = await requestLenient(chapter.url, { headers: { ...HEADERS, Referer: chapter.url }, timeout: 25000 });
  const $ = cheerio.load(r.text);
  const art = $('.chapter-detail-article');
  const paras = [];
  art.find('p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t) paras.push(t);
  });
  let text = paras.join('\n');
  if (!text) text = art.text().replace(/\s+/g, ' ').trim();
  const title = $('.chapter-title').text().trim();
  const locked = !text;
  return {
    content: text,
    title,
    source: NAME,
    tab: 'novel',
    notice: locked ? '该章节为 VIP 付费章节, 需在七猫 APP 内开通会员后阅读' : null,
  };
}

module.exports = { name: NAME, search, detail, catalog, content };
