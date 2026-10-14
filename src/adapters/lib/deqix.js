'use strict';
// 得奇小说 (deqixss.com) 专属正文抓取。
// 站点把章节正文从 HTML 剥离, 改由两步接口下发:
//   1) GET /scripts/chapter.js.php?aid=&cid=&referrer=  -> 下发本章 chapterToken / timestamp / nonce
//   2) GET /modules/article/ajax2.php?aid=&cid=&token=&timestamp=&nonce=  -> JSON {status:1, data:{content}}
// token 与 aid/cid 绑定且短时有效; 必须带 X-Requested-With / Referer, 否则返回 "仅支持网页端访问"。
const { request } = require('../../lib/http');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BAD = /仅支持网页端访问|获取章节内容失败/;

function stripTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// 章节页 URL -> {aid, cid}
function parseIds(url) {
  const m = String(url).match(/\/books\/(\d+)\/(\d+)\.html/);
  return m ? { aid: m[1], cid: m[2] } : null;
}

async function build({ chapter, base }) {
  const ids = parseIds(chapter.url);
  if (!ids) throw new Error('deqix: 无法从章节 URL 解析 aid/cid');
  const referrer = chapter.url;
  const common = { 'User-Agent': UA, Referer: referrer, 'X-Requested-With': 'XMLHttpRequest' };

  const tokUrl = `${base}/scripts/chapter.js.php?aid=${ids.aid}&cid=${ids.cid}&referrer=${encodeURIComponent(referrer)}`;
  const tok = (await request(tokUrl, { headers: common })).text;
  const token = (tok.match(/chapterToken\s*=\s*'([^']+)'/) || [])[1];
  const timestamp = (tok.match(/timestamp\s*=\s*(\d+)/) || [])[1];
  const nonce = (tok.match(/nonce\s*=\s*'([^']+)'/) || [])[1];
  if (!token || !timestamp || !nonce) throw new Error('deqix: token 接口未返回有效凭证');

  const apiUrl = `${base}/modules/article/ajax2.php?aid=${ids.aid}&cid=${ids.cid}`
    + `&token=${token}&timestamp=${timestamp}&nonce=${nonce}`;
  const r = await request(apiUrl, { headers: common });
  let j;
  try { j = JSON.parse(r.text); } catch (e) { throw new Error('deqix: 正文接口非 JSON'); }
  if (j.status !== 1 || !j.data || !j.data.content) {
    throw new Error('deqix: 正文接口失败: ' + (j.message || '') + (BAD.test(r.text) ? ' (被风控拦截)' : ''));
  }
  return stripTags(j.data.content).replace(/\n{3,}/g, '\n\n').trim();
}

module.exports = { build };
