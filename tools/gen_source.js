'use strict';
// 书源配置生成器: 站点丢进来 -> 自动探测选择器 -> 直接产出可用的适配器配置。
//   node tools/gen_source.js                     # 跑内置 SITES 清单
//   node tools/gen_source.js 网址 [网址2 ...]     # 命令行传站点 (自动探测搜索入口)
//   node tools/gen_source.js 源名=网址             # 也可指定源名
// 产物: tools/gen_sources.json (全量判定) + tools/sources_draft.js (可直连配置, 可直接并入 src/adapters/sources.js)
// 原理: 搜索/详情/目录/正文 各用一组候选选择器逐个实测, 取能取到内容的那个;
//       自动加去噪/分页规则; 正文不可内联 (JS加载) 的站直接判死。
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const KW = '剑来';

// ---- 站点清单: 书山 75 源中所有 novel 类可达主机 ----
// {name, base, search 模板} ; search 里 {k}=关键词 {p}=页码 ; search 省略 -> 自动探测首页搜索表单
const BUILTIN = [
  // 已确认模板
  { name: '看书网', base: 'https://www.kanshuw.com', search: '/search.php?q={k}&p={p}' },
  { name: '星星', base: 'https://www.xxtxt.com', search: '/search.php?q={k}&p={p}' },
  { name: '得奇', base: 'https://www.deqixss.com', search: '/modules/article/search.php?searchkey={k}&page={p}' },
  { name: '爱下', base: 'https://ixdzs8.com', search: '/bsearch?q={k}&p={p}' },
  { name: '速读谷', base: 'https://www.suduguu.com', search: '/search.php?q={k}&p={p}' },
  { name: '书库阁', base: 'http://www.shukuge.com', search: '/search.php?q={k}&p={p}' },
  { name: '八零', base: 'http://www.80ge.info', search: '/modules/article/search.php?searchkey={k}&page={p}' },
  { name: 'kk169', base: 'http://www.kk169.la', search: '/search.php?q={k}&p={p}' },
  { name: '23uswx', base: 'http://www.23uswx.la', search: '/modules/article/search.php?searchkey={k}&page={p}' },
  { name: '随心看吧', base: 'https://m.suixkan.com', search: '/search.php?q={k}&p={p}' },
  { name: '错层', base: 'https://m.cuoceng.com', search: '/book/so?searchkey={k}&page={p}' },
  // 未确认模板 -> 自动探测
  { name: '无名书城', base: 'https://www.wxscs.com' },
  { name: '夜伴书屋', base: 'https://www.yybsw.com' },
];

// 命令行: node gen_source.js 网址 [网址2 ...]  (名称自动取域名; 支持 "名称=网址")
// 无参数时跑内置清单。网址给的搜索入口一律自动探测 (首页搜索表单)。
const argv = process.argv.slice(2);
const SITES = argv.length
  ? argv.map((a) => {
      const eq = a.indexOf('=');
      const name = eq > 0 ? a.slice(0, eq) : '';
      const base = (eq > 0 ? a.slice(eq + 1) : a).replace(/\/+$/, '');
      let host = base;
      try { host = new URL(base).host.replace(/^www\./, ''); } catch (e) { /* 保留原串 */ }
      return { name: name || host, base };
    })
  : BUILTIN;

// 自动探测搜索入口: 抓首页, 找含文本输入框的表单, 组装 {k}/{p} 模板
async function autodetectSearch(base) {
  const r = await get(base + '/');
  if (!r.html) return null;
  const $ = cheerio.load(r.html);
  let found = null;
  $('form').each((_, f) => {
    if (found) return;
    const $f = $(f);
    const inp = $f.find('input[type=text],input[type=search],input[name]').filter((_, i) => {
      const t = ($(i).attr('type') || 'text').toLowerCase();
      return t === 'text' || t === 'search' || !$(i).attr('type');
    }).first();
    if (!inp.length) return;
    const name = inp.attr('name') || 'q';
    const action = $f.attr('action') || '/';
    const method = ($f.attr('method') || 'get').toLowerCase();
    if (method !== 'get') return;
    const sep = action.includes('?') ? '&' : '?';
    found = action + sep + name + '={k}';
  });
  return found;
}

// ---- 候选选择器库 (按通用 CMS 覆盖度排序) ----
const CAND = {
  detailTitle: ['h1@text', 'h1.booktitle@text', '.booktitle@text', '#info h1@text', 'h2.booktitle@text'],
  detailAuthor: ['li:contains(作者) a@text', 'p:contains(作者) a@text', '.author a@text', '.bauthor@text', '#info p:eq(0)@text', '.book_other span@text', '.bookinfo .author@text'],
  detailDesc: ['#intro@text', '.intro@text', '#intro_m@text', '#book_intro@text', '.book_intro@text', '.description@text', '.bookinfo .update@text', '#bookintro@text'],
  detailCover: ['.n-img img@src', '#fmimg img@src', '.book img@src', '.cover img@src', '.bookimg img@src', '.book_cover img@src'],
  content: ['article@text', '#content@text', '#chaptercontent@text', '#booktext@text', '.read-content@text', '.content@text', '#nr1@text', '#acontent@text', '.article-content@text', '#chapter-content@text', '.showtxt@text', '#txt@text'],
  next: ['a#next1@href', '#next@href', 'a:contains(下一章)@href', '.bottem2 a:eq(3)@href', 'a.next@href', '.page_next a@href'],
};

const BAD = /^(#|javascript|mailto|tel)/i;
const NAVWORD = /search|login|register|logout|sort|list\d|top|full|home|index|\.css|\.js|\.png|\.jpg|\.ico|sitemap|about|help|bookcase|author\//i;
const abs = (base, h) => (!h ? '' : /^https?:/.test(h) ? h : base.replace(/\/$/, '') + (h.startsWith('/') ? '' : '/') + h);
const cjk = (s) => (String(s).match(/[一-龥]/g) || []).length;
const clsKey = ($, el) => el.tagName + (($(el).attr('class') || '').trim() ? '.' + ($(el).attr('class') || '').trim().split(/\s+/).join('.') : '') + (($(el).attr('id') || '').trim() ? '#' + $(el).attr('id') : '');
async function get(url) {
  try { const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: new URL(url).origin + '/' }, redirect: 'follow', signal: AbortSignal.timeout(15000) }); return { status: r.status, html: await r.text() }; }
  catch (e) { return { status: 0, html: '', err: e.message }; }
}
function evalRule($, root, rule) { // 复用 lib/rule 语义的简化版 (只 text/href/src)
  const [selOp] = String(rule).split('##');
  const at = selOp.lastIndexOf('@'); const sel = at < 0 ? selOp : selOp.slice(0, at); const op = at < 0 ? 'text' : selOp.slice(at + 1);
  const m = sel.match(/:eq\((\d+)\)\s*$/); let node;
  if (m) node = root.find(sel.slice(0, m.index)).eq(+m[1]); else node = root.find(sel);
  if (!node || !node.length) return '';
  if (op === 'href') return node.attr('href') || '';
  if (op === 'src') return node.attr('src') || '';
  return node.text().trim();
}

// 搜索列表识别
function findList($) {
  const groups = {};
  $('*').each((_, el) => {
    const t = el.tagName; if (!t || /^(html|head|body|script|style|meta|link|title|br|hr|img|a|span|em|b|i|strong)$/i.test(t)) return;
    (groups[clsKey($, el)] = groups[clsKey($, el)] || []).push(el);
  });
  let best = null;
  for (const [key, els] of Object.entries(groups)) {
    if (els.length < 3 || els.length > 80) continue;
    let good = 0;
    for (const el of els) { const h = $(el).find('a[href]').first().attr('href') || ''; if (h && !BAD.test(h) && !NAVWORD.test(h)) good++; }
    const ratio = good / els.length; if (ratio < 0.55) continue;
    const score = ratio * 100 - Math.abs(els.length - 15) + (/(dl|li|row|list|item|result|book)/i.test(key) ? 10 : 0);
    if (!best || score > best.score) best = { key, els, score };
  }
  return best;
}
function searchFields($, el) {
  const $el = $(el); const f = {};
  let titleSel = null;
  for (const s of ['h3 a', 'h4 a', 'h3', 'h4', '.bookname a', '.name a', '.title a', 'a']) { if ($el.find(s).length && cjk($el.find(s).first().text()) >= 2) { titleSel = s; break; } }
  f.title = `${titleSel}@text`; f.bookUrl = `${titleSel}@href`;
  if ($el.find('img[src]').length) f.cover = 'img@src';
  for (const s of ['.book_other span', '.author a', '.author', 'p:eq(0) span', '.bauthor', 'dd:eq(0) span']) { if ($el.find(s).length) { f.author = `${s}@text`; break; } }
  let bestLen = 0, bestSel = '';
  for (const s of ['.update', '.intro', 'p:eq(1)', 'dd:eq(2)', '.desc', 'p']) { if ($el.find(s).length) { const n = cjk($el.find(s).first().text()); if (n > bestLen) { bestLen = n; bestSel = s; } } }
  if (bestSel) f.desc = `${bestSel}@text`;
  return f;
}
function findToc($, bookPrefix) {
  let best = null;
  $('*').each((_, el) => {
    const t = el.tagName; if (!t || /^(html|head|body|script|style|meta|link|title|br|hr|img|a|span|em|b|i|strong)$/i.test(t)) return;
    const $el = $(el); const as = $el.find('a[href]'); if (as.length < 15) return;
    let same = 0; as.each((_, a) => { const h = $(a).attr('href') || ''; if (h.startsWith(bookPrefix) && /_\d+\.html$|\/\d+\.html$|p\d+\.html$/.test(h)) same++; });
    if (same / as.length < 0.7) return;
    const k = clsKey($, el);
    if (!best || as.length < best.n || (as.length === best.n && k.length > best.key.length)) best = { key: k, n: as.length };
  });
  return best;
}
function pickFirst($, root, cands) { for (const c of cands) { const v = evalRule($, root, c); if (v && cjk(v) >= 1) return { rule: c, val: v }; } return null; }

(async () => {
  const out = [];
  for (const s of SITES) {
    const rec = { name: s.name, base: s.base, verdict: '', _: {} };
    try {
      // 自动探测搜索入口
      let searchTpl = s.search;
      if (!searchTpl) { searchTpl = await autodetectSearch(s.base); rec._.auto = searchTpl ? 'auto' : ''; }
      if (!searchTpl) { rec.verdict = '未找到搜索入口'; out.push(rec); console.log(line(rec)); continue; }
      rec.searchTpl = searchTpl;
      const sUrl = s.base + searchTpl.replace('{k}', encodeURIComponent(KW)).replace('{p}', '1');
      const sr = await get(sUrl); rec._.s = sr.status;
      if (!sr.html || sr.status >= 400) { rec.verdict = 'search不可达'; out.push(rec); console.log(line(rec)); continue; }
      const $ = cheerio.load(sr.html);
      const list = findList($); if (!list) { rec.verdict = '未识别列表'; out.push(rec); console.log(line(rec)); continue; }
      const fields = searchFields($, list.els[0]);
      const bookUrl = abs(s.base, evalRule($, $(list.els[0]), fields.bookUrl));
      if (!bookUrl) { rec.verdict = '无书籍链接'; out.push(rec); console.log(line(rec)); continue; }
      rec._.book = bookUrl.replace(s.base, '');
      // 详情
      const br = await get(bookUrl); rec._.d = br.status; const $b = cheerio.load(br.html);
      const dT = pickFirst($b, $b.root(), CAND.detailTitle);
      const dA = pickFirst($b, $b.root(), CAND.detailAuthor);
      const dD = pickFirst($b, $b.root(), CAND.detailDesc);
      const dC = pickFirst($b, $b.root(), CAND.detailCover);
      if (!dT) { rec.verdict = '详情标题未识别'; out.push(rec); console.log(line(rec)); continue; }
      const bookPrefix = bookUrl.replace(s.base, '').replace(/\/[^/]*$/, '/');
      const toc = findToc($b, bookPrefix);
      // 首章
      let chap = '';
      $b('a[href]').each((_, a) => { if (chap) return; const h = $b(a).attr('href') || ''; if (h.startsWith(bookPrefix) && /_\d+\.html$|\/\d+\.html$|p\d+\.html$/.test(h) && !/_\d+_/.test(h)) chap = abs(s.base, h); });
      if (!toc || !chap) { rec.verdict = '无目录/章节'; out.push(rec); console.log(line(rec)); continue; }
      rec._.c = (await get(chap)).status;
      const $c = cheerio.load((await get(chap)).html);
      const cHit = pickFirst($c, $c.root(), CAND.content);
      if (!cHit || cjk(cHit.val) < 150) { rec.verdict = '正文JS加载/过短'; out.push(rec); console.log(line(rec)); continue; }
      const nHit = pickFirst($c, $c.root(), CAND.next);
      // 组装去噪规则
      let descRule = dD.rule;
      if (/^简介[：:]\s*/.test(dD.val)) descRule += '##^简介[：:]\\s*##';
      let contentRule = cHit.rule;
      if (/第\(\d+\/\d+\)页/.test(cHit.val)) contentRule += '##第\\(\\d+\\/\\d+\\)页##';
      let nextRule = '';
      if (nHit) { nextRule = nHit.rule; if (/_(\d+)\.html$/.test(nHit.val)) nextRule += '##^(?!.*_\\d+\\.html$).*$##'; }
      // 输出配置
      rec.verdict = '✅可直连';
      rec.config = {
        name: s.name, base: s.base, headers: { Referer: s.base + '/' },
        search: { request: { url: searchTpl.replace('{k}', '{{key}}').replace('{p}', '{{page}}') }, list: list.key, fields },
        detail: { fields: { title: dT.rule, author: dA ? dA.rule : '', cover: dC ? dC.rule : '', desc: descRule } },
        catalog: { list: toc.key + ' li', title: 'a@text', url: 'a@href' },
        content: { content: contentRule, ...(nextRule ? { next: nextRule } : {}) },
      };
    } catch (e) { rec.verdict = 'ERR:' + String(e.message).slice(0, 45); }
    out.push(rec); console.log(line(rec));
  }
  fs.writeFileSync(path.join(__dirname, "gen_sources.json"), JSON.stringify(out, null, 2));
  const ok = out.filter((r) => r.config);
  fs.writeFileSync(path.join(__dirname, "sources_draft.js"), 'module.exports = ' + JSON.stringify(ok.map((r) => r.config), null, 2) + ';\n');
  console.log('\n可直连 ' + ok.length + '/' + out.length + ' -> sources_draft.js');
})();

function line(r) {
  return [String(r.name).padEnd(9), ('s=' + (r._.s || '-')).padEnd(7), ('d=' + (r._.d || '-')).padEnd(7), ('c=' + (r._.c || '-')).padEnd(7), r.verdict || ''].join(' ');
}
