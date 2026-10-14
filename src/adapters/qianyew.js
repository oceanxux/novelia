'use strict';
// 新御书屋适配器 (qianyew.com 桌面站)
// 站点反爬: 普通浏览器 UA 被 challenge 门拦截, 但主动放行搜索引擎爬虫 ->
//   用 Baiduspider UA 直连即可 200, 无需 cookie。
// 规则来源: 参考站导出书源规则 (直连复刻实现)
const { cheerio, evalRule, evalList } = require('../lib/rule');
const { getHtml, DEFAULT_UA } = require('../lib/http');

const BASE = 'https://www.qianyew.com';
const HEADERS = { 'User-Agent': DEFAULT_UA };

// 列表项封面: 详情页 .bookintro img 的 data-original 为真封面; 列表页无 img,
// 按规律「封面ID = 书号 - 32」推算
function coverFromId(bookId) {
  const i = Number(bookId) - 32;
  return `https://img.21too.com/${Math.floor(i / 1000)}/${i}/${i}s.jpg`;
}

// 从 .bookbox 列表解析为 Book[]
function parseList($, nodes) {
  const books = [];
  nodes.each((_, el) => {
    const $el = $(el);
    const raw = $el.find('.bookname a').attr('href') || '';
    const href = raw.startsWith('http') ? raw : BASE + raw;
    const idMatch = href.match(/\/(\d+)\/?$/);
    const bookId = idMatch ? idMatch[1] : null;
    books.push({
      title: $el.find('.bookname a').text().trim(),
      author: ($el.find('.author').eq(0).text().trim() || '').replace(/^作者：/, ''),
      cover: bookId ? coverFromId(bookId) : '',
      desc: ($el.find('.update').text().trim() || '').replace(/^简介：/, ''),
      tags: '',
      wordCount: '',
      latestChapterTitle: $el.find('.cat a').text().trim(),
      source: '新御书屋',
      tab: 'novel',
      book_url: href,          // 源站书籍页绝对 URL (明文)
      bookid: bookId || '',
    });
  });
  return books;
}

async function search(keyword, page = 1) {
  const body = 'searchkey=' + encodeURIComponent(keyword);
  const html = await getHtml(BASE + '/search/', {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const $ = cheerio.load(html);
  return parseList($, $('.bookbox'));
}

// 详情: 入参为源站书籍页 URL (明文) 或 bookid
async function detail({ url, bookid } = {}) {
  let bookUrl = url;
  if (!bookUrl && bookid) bookUrl = `${BASE}/book/${bookid}/`;
  if (!bookUrl) throw new Error('detail: 缺少 url/bookid');
  if (bookUrl.startsWith('/')) bookUrl = BASE + bookUrl;

  const html = await getHtml(bookUrl, { headers: HEADERS });
  const $ = cheerio.load(html);
  const bookId = (bookUrl.match(/\/book\/(\d+)/) || [])[1] || bookid || '';
  return {
    title: $('h1.booktitle').text().trim(),
    author: ($('.booktag a').attr('title') || '').replace(/^作者：/, ''),
    cover: $('.bookintro img').attr('data-original') || coverFromId(bookId),
    desc: $('.bookintro').text().trim(),
    tags: $('.breadcrumb a[href*="/sort/"]').first().text().trim(),
    wordCount: '',
    latestChapterTitle: $('.bookchapter').text().trim(),
    source: '新御书屋',
    tab: 'novel',
    book_url: bookUrl,
    bookid: bookId,
  };
}

// 目录: 详情页 #list-chapterAll dd (正序, 无需翻页)
async function catalog({ url, bookid } = {}) {
  let bookUrl = url;
  if (!bookUrl && bookid) bookUrl = `${BASE}/book/${bookid}/`;
  if (!bookUrl) throw new Error('catalog: 缺少 url/bookid');
  if (bookUrl.startsWith('/')) bookUrl = BASE + bookUrl;

  const html = await getHtml(bookUrl, { headers: HEADERS });
  const $ = cheerio.load(html);
  const chapters = [];
  let cid = 0;
  $('#list-chapterAll dd').each((_, el) => {
    const $el = $(el);
    const href = $el.find('a').attr('href');
    if (!href) return;
    chapters.push({
      title: $el.find('a').text().trim(),
      url: href.startsWith('http') ? href : BASE + href,
      cid: cid++,
      tag: '',
      isVolume: false,
      isVip: false,
      isPay: false,
    });
  });
  return chapters;
}

// 正文: chapterParams = { cid, source, url: 书籍页URL } (未知源契约)
//   cid 为目录序号, 需先拉目录定位章节页, 再取 #rtext。
async function content(chapterParams = {}) {
  const { cid, url } = chapterParams;
  const list = await catalog({ url });
  const idx = Number(cid);
  const chapter = list[idx];
  if (!chapter) throw new Error(`content: cid ${cid} 越界 (目录 ${list.length} 章)`);

  let chapterUrl = chapter.url;
  let parts = [];
  // 处理单章分页: #linkNext 文本为「下一页」时继续抓
  for (let guard = 0; guard < 30; guard++) {
    const html = await getHtml(chapterUrl, { headers: HEADERS });
    const $ = cheerio.load(html);
    parts.push($('#rtext').html() || '');
    const nextHref = $('#linkNext:contains(下一页)').attr('href');
    if (!nextHref) break;
    chapterUrl = nextHref.startsWith('http') ? nextHref : BASE + nextHref;
  }
  return {
    content: parts.join('\n'),
    source: '新御书屋',
    tab: 'novel',
    notice: null,
  };
}

module.exports = { name: '新御书屋', search, detail, catalog, content };
