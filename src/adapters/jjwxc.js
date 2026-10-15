'use strict';
// 晋江文学城 (jjwxc.net) 适配器
//   search  : www.jjwxc.net/search.php?kw=<GBK编码>&t=1  (站点 GBK, 关键词须按 GBK 编码)
//   detail  : www.jjwxc.net/onebook.php?novelid=<id>
//   catalog : 详情页 tr[itemprop=chapter]; 免费章 a[href*=chapterid], VIP 章 a[rel*=chapterid]
//   content : 免费章 #paragraph_comment_content (匿名可读); VIP 章匿名返回空 -> 需登录 token
// 正文段落按 <br><br> 切分, 段落序号 (1-based) 与段评 paragraph_id 对齐。
const iconv = require('iconv-lite');
const { cheerio, evalRule } = require('../lib/rule');
const { request } = require('../lib/http');

const NAME = '晋江';
const BASE = 'https://www.jjwxc.net';
// 封面服务: 仅凭 novelid 即可取到, 匿名可访问
const JJ_COVER = 'https://i9-static.jjwxc.net/novelimage.php';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: BASE + '/' };

function abs(href) {
  if (!href) return '';
  if (/^https?:\/\//.test(href)) return href;
  return href.startsWith('/') ? BASE + href : BASE + '/' + href;
}

function novelIdFromUrl(url, bookid) {
  if (bookid) return String(bookid);
  const m = String(url || '').match(/novelid=(\d+)/);
  return m ? m[1] : '';
}

function chapterIdFromUrl(url) {
  const m = String(url || '').match(/chapterid=(\d+)/);
  return m ? m[1] : '';
}

// GBK 百分号编码 (搜索关键词)
function gbkEncode(s) {
  const buf = iconv.encode(String(s), 'gbk');
  let out = '';
  for (const b of buf) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  return out;
}

// 搜索: 结果项 = 含单个 h3.title 的 div
async function search(keyword, page = 1) {
  const kw = gbkEncode(keyword);
  const pagePart = page > 1 ? `&page=${page}` : '';
  const r = await request(`${BASE}/search.php?kw=${kw}&t=1${pagePart}`, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(r.text);
  const books = [];
  $('h3.title a').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href') || '';
    const id = (href.match(/novelid=(\d+)/) || [])[1];
    if (!id) return;
    // 每本书的信息块: 向上找到同时含 h3.title 与 .intro 的容器
    let node = $a.closest('div');
    for (let i = 0; i < 6 && node.length; i++) {
      if (node.find('.intro').length) break;
      node = node.parent();
    }
    const infoText = node.find('.info').first().text().replace(/\s+/g, ' ').trim();
    books.push({
      title: $a.text().trim(),
      author: (infoText.match(/作者[：:]\s*([^\s]+)/) || [])[1] || '',
      // 搜索结果页不含封面图; 晋江封面可由 novelid 直接推导 (novelimage.php 匿名可访问)
      cover: `${JJ_COVER}?novelid=${id}`,
      desc: node.find('.intro').first().text().replace(/\s+/g, ' ').trim().slice(0, 200),
      tags: (infoText.match(/文章类型[：:]\s*([^\s]+)/) || [])[1] || '',
      wordCount: (infoText.match(/字数[：:]\s*(\d+)/) || [])[1] || '',
      latestChapterTitle: '',
      source: NAME,
      tab: 'novel',
      book_url: `${BASE}/onebook.php?novelid=${id}`,
      bookid: id,
    });
  });
  return books.filter((b) => b.title && b.book_url);
}

// 详情
async function detail({ url, bookid } = {}) {
  const id = novelIdFromUrl(url, bookid);
  if (!id) throw new Error('detail: 缺少 novelid');
  const bookUrl = `${BASE}/onebook.php?novelid=${id}`;
  const r = await request(bookUrl, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(r.text);
  const cover = $('[itemprop=image]').attr('content') || $('[itemprop=image]').attr('src') || '';
  const authorHref = $('a[href*=oneauthor]').first().attr('href') || '';
  const statusText = $('#novelintro').length ? '' : '';
  return {
    title: $('h1[itemprop=name]').first().text().trim() || $('h1 span').first().text().trim(),
    author: $('[itemprop=author]').first().text().trim() || $('a[href*=oneauthor]').first().text().trim(),
    cover,
    desc: $('#novelintro').text().trim(),
    tags: ($('meta[name=Description]').attr('content') || '').split('|')[0].split(',')[2] || '',
    wordCount: '',
    latestChapterTitle: '',
    status: statusText,
    source: NAME,
    tab: 'novel',
    book_url: bookUrl,
    bookid: id,
    author_url: authorHref,
  };
}

// 目录: 详情页章节表; 免费章 href, VIP 章 rel
async function catalog({ url, bookid } = {}) {
  const id = novelIdFromUrl(url, bookid);
  if (!id) throw new Error('catalog: 缺少 novelid');
  const r = await request(`${BASE}/onebook.php?novelid=${id}`, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(r.text);
  const chapters = [];
  let cid = 0;
  $('tr[itemprop=chapter]').each((_, el) => {
    const $tr = $(el);
    const freeA = $tr.find('a[href*=chapterid]').first();
    const vipA = $tr.find('a[rel*=chapterid]').first();
    const isVip = !freeA.length && vipA.length > 0;
    const href = freeA.length ? freeA.attr('href') : (vipA.attr('rel') || '');
    const chId = chapterIdFromUrl(href);
    if (!chId) return;
    const rawTitle = (freeA.length ? freeA.text() : vipA.text()).trim().replace(/\[VIP\]\s*$/i, '').trim();
    chapters.push({
      title: rawTitle,
      url: `${BASE}/onebook.php?novelid=${id}&chapterid=${chId}`,
      cid: cid++,
      tag: '',
      isVolume: false,
      isVip,
      isPay: isVip,
      chapterid: chId,
    });
  });
  return chapters;
}

// 正文: 免费章匿名可读; VIP 章匿名返回空正文 -> 提示需登录
async function content(chapterParams = {}) {
  const { cid, url, bookid } = chapterParams;
  const id = novelIdFromUrl(url, bookid);
  let chId = chapterParams.chapterid || chapterIdFromUrl(url);
  let isVip = false;
  let title = '';

  if (!chId) {
    if (!id) throw new Error('content: 缺少 novelid 且无 chapterid');
    const list = await catalog({ bookid: id });
    const ch = list[Number(cid)];
    if (!ch) throw new Error(`content: cid ${cid} 越界 (目录 ${list.length} 章)`);
    chId = ch.chapterid;
    isVip = ch.isVip;
    title = ch.title;
  }

  const chapterUrl = `${BASE}/onebook.php?novelid=${id}&chapterid=${chId}`;
  const r = await request(chapterUrl, { headers: HEADERS, timeout: 20000 });
  const $ = cheerio.load(r.text);
  const node = $('#paragraph_comment_content');
  const html = node.html() || '';
  // 段落切分: <br><br> -> 双换行; 保留纯文本, 供前端渲染与段评锚点
  const text = html
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 匿名取文为空 = 付费/VIP 章节 (免费章正文必定非空)
  const locked = text.length === 0;
  return {
    content: text,
    title,
    source: NAME,
    tab: 'novel',
    novelid: id,
    chapterid: chId,
    notice: locked ? '该章节为 VIP/付费章节, 匿名无法阅读, 请登录晋江账号后重试' : null,
  };
}

module.exports = { name: NAME, search, detail, catalog, content };
