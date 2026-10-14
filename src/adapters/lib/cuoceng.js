'use strict';
// 错层小说 (m.cuoceng.com) 目录抓取: 详情页 (/book/{uuid}.html) 只有"最新章节"预览,
// 完整目录在同书号目录页 /book/chapter/{uuid}.html, 章节链接形如 /book/{uuid}/{cuuid}.html。
// 目录页每页 500 章, 末页无"下一页"链接; 站点会限流 (返回 200 但 #allchapter 为空), 需重试。
const { request } = require('../../lib/http');
const { cheerio } = require('../../lib/rule');

const BOOK_RE = /\/book\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.html$/;

// ctx: { $, html, bookUrl, base, headers, abs }
async function build(ctx) {
  const { bookUrl, base, headers, abs } = ctx;
  const m = String(bookUrl).match(BOOK_RE);
  if (!m) return [];
  const uuid = m[1];
  const chapterRe = new RegExp(`^/book/${uuid}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.html$`);
  const nextRe = new RegExp(`^/book/chapter/${uuid}/\\d+\\.html$`);
  const seen = new Set();
  const out = [];

  // 以"下一页"链接驱动翻页 (末页无该链接即停)。限流空页 (无章节) 退避重试。
  let path = `/book/chapter/${uuid}.html`;
  for (let page = 0; page < 60 && path; page++) {
    let $ = null;
    let added = 0;
    for (let t = 0; t < 6; t++) {
      let r;
      try { r = await request(base + path, { headers: { ...headers, Referer: bookUrl }, retries: 2 }); }
      catch (e) { await new Promise((res) => setTimeout(res, 1000 * (t + 1))); if (t === 5) throw e; continue; }
      $ = cheerio.load(r.text);
      $('div#allchapter a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!chapterRe.test(href)) return;
        const url = abs(base, href);
        if (seen.has(url)) return;
        seen.add(url);
        added++;
        out.push({ title: $(el).text().replace(/\s+/g, ' ').trim(), url });
      });
      if (added > 0) break;
      await new Promise((res) => setTimeout(res, 1200 * (t + 1)));
    }
    // 首页或中间页持续为空: 说明被限流/结构变化, 明确报错而非静默返回残缺目录
    if (added === 0) throw new Error(`cuoceng: 目录第 ${page + 1} 页未取到章节 (限流或结构变化)`);

    let next = '';
    $('a[href]').each((_, el) => {
      if (next) return;
      const h = $(el).attr('href') || '';
      if (nextRe.test(h) && /下一页|下页/.test($(el).text().replace(/\s+/g, ''))) next = h;
    });
    path = next;
    if (path) await new Promise((res) => setTimeout(res, 400));
  }
  return out;
}

module.exports = { build };
