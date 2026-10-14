// 端到端契约验证: 模拟前端完整调用链, 验证自建后端响应可被前端消费。
// 流程: /search -> ruleSearch.bookUrl -> /details -> ruleBookInfo.tocUrl
//       -> /catalog -> /content
const assert = require('assert');

const BASE = 'http://127.0.0.1:7099';
const API_KEY = Buffer.from('DemoKey12345678', 'utf8').toString('base64');
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY,
  'X-Device-Type': 'android',
  'X-Device-Id': 'demo0000demo0000',
  'X-Novel-Token': 'SHUSAN_READ_2025',
};

let pass = 0, fail = 0;
const check = (cond, msg) => { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } };
const sec = (t) => console.log('\n===== ' + t + ' =====');

// 模拟前端 ruleSearch.bookUrl 的 JS: 把 search 项编码成 data:detailsUrl
function frontendBookUrl(book) {
  const detail = { source: book.source, url: book.book_url, cover: book.cover, desc: book.desc, name: book.title };
  return `data:detailsUrl;base64,${Buffer.from(JSON.stringify(detail)).toString('base64')},{"type":"susan"}`;
}
// 模拟前端 ruleBookInfo.tocUrl 的 JS
function frontendTocUrl(d) {
  const catalog = { source: d.source, url: d.book_url, name: d.title, tab: d.tab || 'novel', bookid: d.bookid || '' };
  return `data:catalogUrl;base64,${Buffer.from(JSON.stringify(catalog)).toString('base64')},{"type":"susan"}`;
}
// 模拟前端 buildChapterUrl (未知源分支): { cid, source, url: catalog.url }
function frontendChapterParams(ch, catalog) {
  return { cid: ch.cid, source: catalog.source, url: catalog.url };
}
// 解析 data-URI
function decodeDataUri(uri) {
  const m = String(uri).match(/^data:[^;]+;base64,([^,]+)/);
  return m ? JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) : null;
}

(async () => {
  sec('1. GET /search -> 前端 ruleSearch 消费');
  // 默认源 (首个适配器) 可能临时不可达, 动态挑一个能返回结果的源跑完整契约
  const sources = require('../src/adapters/index.js').list();
  let s = null, usedSource = null;
  for (const src of sources) {
    const r = await (await fetch(`${BASE}/search?login=search&key=${encodeURIComponent('斩神')}&page=1&source=${encodeURIComponent(src)}`)).json();
    if (r.isSuccess && Array.isArray(r.data) && r.data.length) { s = r; usedSource = src; break; }
  }
  if (!s) { console.log('  FAIL 无任何源返回结果'); process.exit(1); }
  console.log(`  (使用源: ${usedSource})`);
  check(s.isSuccess === true, 'isSuccess === true');
  check(Array.isArray(s.data) && s.data.length > 0, `data 为非空数组 (${(s.data || []).length} 条)`);
  const book = s.data[0];
  check(!!book.title && !!book.author, '首项有 title/author');
  check(!!book.book_url && !!book.source, '首项有 book_url/source');
  check(String(book.book_url).startsWith('http'), 'book_url 为绝对 URL');
  const detailsUri = frontendBookUrl(book);
  check(detailsUri.startsWith('data:detailsUrl;base64,'), 'ruleSearch.bookUrl 产出合法 data-URI');

  sec('2. POST /details -> 前端 ruleBookInfo.init($.data) 消费');
  const detailPayload = decodeDataUri(detailsUri);
  const d = await (await fetch(`${BASE}/details`, { method: 'POST', headers: HEADERS, body: JSON.stringify(detailPayload) })).json();
  check(d.code === 200, 'code === 200');
  check(d.data && d.data.title, 'data.title 存在');
  check(!!d.data.author && !!d.data.cover, 'data.author/cover 存在');
  check(!!d.data.bookid, `data.bookid 存在 (${d.data.bookid})`);
  check(!!d.data.source && !!d.data.tab, 'data.source/tab 存在');

  sec('3. POST /catalog -> 前端 ruleToc.chapterList 消费');
  const tocPayload = decodeDataUri(frontendTocUrl(d.data));
  check(tocPayload.url && tocPayload.bookid, 'tocUrl 内含 url/bookid');
  const c = await (await fetch(`${BASE}/catalog`, { method: 'POST', headers: HEADERS, body: JSON.stringify(tocPayload) })).json();
  check(c.code === 200, 'code === 200');
  check(Array.isArray(c.data) && c.data.length > 0, `data 为非空数组 (${(c.data || []).length} 章)`);
  // 部分源 (如番茄) 首条为分卷标题 (isVolume=true, 无 url), 取首个真实章节
  const ch0 = (c.data || []).find((x) => !x.isVolume && x.url) || c.data[0];
  check(typeof ch0.cid === 'number', 'chapter.cid 为数字');
  check(!!ch0.title && !!ch0.url, 'chapter 有 title/url');
  check(ch0.isVolume === false && ch0.isVip === false && ch0.isPay === false, 'chapter 有 isVolume/isVip/isPay 布尔');

  sec('4. POST /content -> 前端 ruleContent 消费');
  const catalogObj = { source: d.data.source, url: d.data.book_url };
  const cp = frontendChapterParams(ch0, catalogObj);
  check(typeof cp.cid === 'number' && cp.source && cp.url, 'buildChapterUrl 产出 {cid,source,url}');
  // 4a 无 key -> 拒绝
  const r401 = await fetch(`${BASE}/content`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cp) });
  check(r401.status === 401, `无 X-Api-Key 被拒 (HTTP ${r401.status})`);
  // 4b 有 key -> 明文
  const ct = await (await fetch(`${BASE}/content`, { method: 'POST', headers: HEADERS, body: JSON.stringify(cp) })).json();
  check(ct.code === 200, 'code === 200');
  check(ct.data && typeof ct.data.content === 'string' && ct.data.content.length > 0, `data.content 非空 (${(ct.data || {}).content ? ct.data.content.length : 0} 字符)`);
  check(ct.data.source && ct.data.tab, 'data.source/tab 存在');

  sec('5. /login -> 前端 loginUrl 消费');
  const lg = await (await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=demo@local&password=demo123456' })).json();
  check(lg.code === 200 && lg.data && lg.data.user && lg.data.user.api_key, 'code 200 + data.user.api_key');
  const lgBad = await (await fetch(`${BASE}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=demo@local&password=wrong' })).json();
  check(lgBad.code === 1000, '错误密码返回 code 1000');

  console.log(`\n========== 结果: ${pass} PASS / ${fail} FAIL ==========`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('异常:', e); process.exit(2); });
