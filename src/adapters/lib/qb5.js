'use strict';
// 全本小说网 (qb5.io) 目录抓取: 该站目录被 load_more() 截断成
// "详情页只给首 24 章 + 末 23 章", 完整列表走 JSONP:
//   /?c=xs&a=list.json&callback=<cb>&book_id=<id>&b=<obf(cb)>
// callback 每本书随机生成 (写在详情页 var callback='xxxxxx'), 且服务端校验
// callback 属于该书 + deobf(b)===callback, 因此必须先从详情页抓 cb。
// obf 规则: 每个字符 c -> 随机字符 + shift(c,+3) + 随机字符 (字符表 62 长)。
const { request } = require('../../lib/http');

const TABLE = 'PXhw7UT1B0a9kQDKZsjIASmOezxYG4CHo5Jyfg2b8FLpEvRr3WtVnlqMidu6cN';

function obf(str) {
  let out = '';
  for (const ch of str) {
    const n = TABLE.indexOf(ch);
    const code = n < 0 ? ch : TABLE[(n + 3) % 62];
    out += TABLE[(Math.random() * 62) | 0] + code + TABLE[(Math.random() * 62) | 0];
  }
  return out;
}
function deobf(str) {
  let out = '';
  for (let i = 1; i < str.length; i += 3) {
    const n = TABLE.indexOf(str[i]);
    out += n < 0 ? str[i] : TABLE[(n + 59) % 62];
  }
  return out;
}

// 从一段 HTML 里抽 du-N.html 章节
function chaptersFromHtml(html) {
  const out = [];
  const re = /<li>\s*<a href="([^"]*du-(\d+)\.html)"[^>]*>([^<]*)<\/a>/g;
  let m;
  while ((m = re.exec(html))) out.push({ du: Number(m[2]), url: m[1], title: m[3].trim() });
  return out;
}

// ctx: { $, html, bookUrl, base, headers, abs }
async function build(ctx) {
  const { html, bookUrl, base, headers } = ctx;
  const cb = (html.match(/var callback='([^']+)'/) || [])[1];
  const bookId = (html.match(/load_more\('(\d+)'\)/) || [])[1]
    || (String(bookUrl).match(/(\d+)/) || [])[1];

  // 详情页自带的首尾两段
  const merged = new Map();
  for (const c of chaptersFromHtml(html)) merged.set(c.du, c);

  // JSONP 拉全量中间段
  if (cb && bookId) {
    const jsonpUrl = `${base}/?c=xs&a=list.json&callback=${cb}&book_id=${bookId}&b=${obf(cb)}`;
    try {
      const r = await request(jsonpUrl, { headers: { ...headers, Referer: base + bookUrl } });
      const body = r.text.trim();
      // 响应回调名为 'd' + callback (页面里 function d<cb>(data){...})
      if (/^\w+\(/.test(body)) {
        const json = JSON.parse(body.replace(/^[^(]+\(/, '').replace(/\)\s*;?\s*$/, ''));
        for (const c of chaptersFromHtml(json.content || '')) {
          const prev = merged.get(c.du);
          merged.set(c.du, { du: c.du, url: c.url, title: c.title || (prev && prev.title) || '' });
        }
      }
    } catch (_) { /* 失败则退化为详情页两段 */ }
  }

  return [...merged.values()]
    .sort((a, b) => a.du - b.du)
    .map((c) => ({ title: c.title, url: ctx.abs(base, c.url) }));
}

module.exports = { build, obf, deobf };
