'use strict';
// 穿越小说 (kk169.la) 目录 + 正文:
// - 详情页 (/book/info/{a}/{b}.html) 不含完整目录, 完整目录在同书号目录页 /html/{a}/{b}/ 的 ul.chapters。
// - 正文 #acontent 头部混有 <h1>标题</h1> / <script>read2();</script> / div.tishi 推荐语, 需剥离。
const { request } = require('../../lib/http');
const { cheerio } = require('../../lib/rule');

// ctx: { $, html, bookUrl, base, headers, abs }
async function build(ctx) {
  const { bookUrl, base, headers, abs } = ctx;
  const m = String(bookUrl).match(/\/book\/info\/(\d+)\/(\d+)\.html/);
  if (!m) return [];
  const tocUrl = `${base}/html/${m[1]}/${m[2]}/`;
  const r = await request(tocUrl, { headers: { ...headers, Referer: bookUrl } });
  const $ = cheerio.load(r.text);
  const seen = new Set();
  const out = [];
  $('ul.chapters a[href]').each((_, el) => {
    const title = $(el).text().replace(/\s+/g, ' ').trim();
    const href = $(el).attr('href');
    if (!title || !href || !/\d+\.html$/.test(href)) return;
    const url = abs(base, href);
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ title, url });
  });
  return out;
}

function htmlToText(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ctx: { chapter, list, bookUrl, base, headers, abs }
async function contentBuild(ctx) {
  const { chapter, headers } = ctx;
  const r = await request(chapter.url, { headers: { ...headers, Referer: chapter.url } });
  const $ = cheerio.load(r.text);
  const box = $('#acontent');
  if (!box.length) return '';
  box.find('script, style, .tishi, h1').remove();
  return htmlToText(box.html() || '')
    .replace(/read2\(\);/g, '')
    .replace(/\(穿越小说 www\.kk169\.la\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { build, contentBuild };
