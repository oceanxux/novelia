'use strict';
// 茶马小说 (chamabooks.net) 专属钩子。
// 站点每章一个静态页 /novel_<hash>_<n>.html:
//   - 目录: 详情页 select.pg-sel 的 option (value = 章节页 URL, 完整全量)
//   - 正文: 内联在 #novel-content (夹带 Google 广告节点, 需剥除)
// 详情页即"第 1 章"页 (URL 尾号 _1), 故目录/正文都从同一页取。
const { cheerio } = require('../../lib/rule');
const { request } = require('../../lib/http');

// 目录: 从 paginator 下拉解析全部章节
function build({ $, base, abs }) {
  const out = [];
  $('#novel-list-paginator-bar select.pg-sel option').each((_, el) => {
    const href = $(el).attr('value');
    const title = $(el).text().trim();
    if (href) out.push({ title, url: abs(base, href) });
  });
  return out;
}

// 正文: 取 #novel-content 的段落, 剥掉广告/脚本节点
async function contentBuild({ chapter, headers }) {
  const r = await request(chapter.url, { headers });
  const $ = cheerio.load(r.text);
  const $c = $('#novel-content');
  $c.find('script,style,ins,iframe,.google-auto-placed,[class*=adsbygoogle],[class*=ap_container]').remove();
  const paras = [];
  $c.find('p').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t) paras.push(t);
  });
  if (paras.length) return paras.join('\n');
  return $c.text().replace(/\s+/g, ' ').trim();
}

module.exports = { build, contentBuild };
