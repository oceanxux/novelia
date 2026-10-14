// 全源冒烟 + 边界测试: 逐源跑 search->details->catalog->content 全链路, 再打边界。
const assert = require('assert');

const BASE = 'http://127.0.0.1:7099';
// 测试账号: 由环境变量注入, 须与启动服务时的 SEED_USERS 一致 (见 README「测试」节)
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASS = process.env.TEST_PASS;
const API_KEY = Buffer.from(process.env.TEST_API_KEY || '', 'utf8').toString('base64');
const H = {
  'Content-Type': 'application/json',
  'X-Api-Key': API_KEY,
  'X-Device-Type': 'android',
  'X-Device-Id': 'demo0000demo0000',
  'X-Novel-Token': 'SHUSAN_READ_2025',
};
const cjk = (s) => ((s || '').match(/[一-龥]/g) || []).length;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('    FAIL ' + m); } };
const sec = (t) => console.log('\n===== ' + t + ' =====');
const get = async (p) => (await fetch(BASE + p, { headers: H })).json();
const post = async (p, b, h) => { const r = await fetch(BASE + p, { method: 'POST', headers: h || H, body: JSON.stringify(b) }); return { status: r.status, body: await r.json() }; };

// 各源搜索关键词 (源覆盖度不同, 用宽松词)
const KW = { '新御书屋': '剑来', '番茄小说': '剑来', '全本': '剑来', '得奇': '剑来', '爱下': '剑来', '看书网': '剑来', '星星': '剑来', '穿越小说': '剑来', '错层': '剑来', '半夏': '剑来', '茶马': '绿叶' };

(async () => {
  sec('0. 适配器清单');
  const adapters = require('../src/adapters/index.js').list();
  console.log('    ' + adapters.join(' | '));
  ok(adapters.length >= 9, `适配器数 >= 9 (${adapters.length})`);

  sec('1. 逐源全链路 (search -> details -> catalog -> content)');
  for (const src of adapters) {
    const kw = KW[src] || '剑来';
    process.stdout.write(`  [${src}] `);
    try {
      const s = await get(`/search?login=search&key=${encodeURIComponent(kw)}&page=1&source=${encodeURIComponent(src)}`);
      if (!s.isSuccess || !Array.isArray(s.data) || !s.data.length) { fail++; console.log(`搜索失败 isSuccess=${s.isSuccess} n=${(s.data || []).length}`); continue; }
      if (!s.data[0].title || !s.data[0].book_url || s.data[0].source !== src) { fail++; console.log('首项字段异常'); continue; }

      // 源站有"空书"(作者锁定/下架, 目录 0 章), 属内容问题非实现缺陷:
      // 依次尝试搜索结果前若干本, 取首个目录非空的完成全链路。
      let det = null, cat = null, b = null;
      for (const cand of s.data.slice(0, 5)) {
        const d = await post('/details', { source: src, url: cand.book_url, bookid: cand.bookid, name: cand.title, tab: 'novel' });
        const dt = d.body && d.body.data;
        if (!dt || !dt.title || !dt.bookid) continue;
        const c = await post('/catalog', { source: src, url: cand.book_url, bookid: dt.bookid, name: dt.title, tab: 'novel' });
        const ct = c.body && c.body.data;
        if (Array.isArray(ct) && ct.length) { b = cand; det = dt; cat = ct; break; }
      }
      if (!det) { fail++; console.log('details 失败 (前 5 本)'); continue; }
      if (!cat) { fail++; console.log('catalog 全空 (前 5 本, 疑似空书源站问题)'); continue; }
      // 番茄等分卷站点首个条目是卷标题 (isVolume=true, 无 url), 取首个真实章节
      const ch = cat.find((x) => !x.isVolume && x.url);
      if (!ch || typeof ch.cid !== 'number') { fail++; console.log('catalog 无真实章节'); continue; }

      const t = await post('/content', { cid: ch.cid, source: src, url: b.book_url });
      const content = t.body && t.body.data && t.body.data.content;
      const n = cjk(content);
      if (!content || n < 50) { fail++; console.log(`content 失败 code=${t.body && t.body.code} cjk=${n}`); continue; }
      pass++;
      console.log(`search=${s.data.length} details=${det.title} catalog=${cat.length} content=${n}cjk ✅`);
    } catch (e) { fail++; console.log(`异常 ${e.message}`); }
  }

  sec('2. 边界: 搜索');
  // 边界语义: 空/无匹配关键词不得崩溃或 500, 须返回 200 + 合法结构 (data 为数组)。
  // 注: 部分源 (如番茄) 对空/无匹配关键词返回推荐列表 (非空), 属源行为差异, 不算异常。
  const e1 = await get('/search?login=search&key=');
  ok(e1.isSuccess === true && Array.isArray(e1.data), `空 key 结构合法 (isSuccess=${e1.isSuccess} n=${(e1.data || []).length})`);
  const e2 = await get('/search?login=search&key=' + encodeURIComponent('zzzz不存在书名xyz'));
  ok(e2.isSuccess === true && Array.isArray(e2.data), `不存在书名结构合法 (n=${(e2.data || []).length})`);
  const e3 = await get('/search?login=search&key=' + encodeURIComponent('剑来') + '&source=' + encodeURIComponent('不存在的源'));
  ok(e3 !== null && e3.isSuccess === false, `未知 source 明确报错 (isSuccess=${e3.isSuccess})`);
  const e4 = await get('/search?login=search&key=' + encodeURIComponent('剑来') + '&page=99999&source=' + encodeURIComponent('错层'));
  ok(e4.isSuccess === true, `超大 page 不崩 (n=${(e4.data || []).length})`);

  sec('3. 边界: 详情/目录/正文');
  const b1 = await post('/details', { source: '不存在的源', url: 'http://x/y.html', bookid: 'x', name: 'x', tab: 'novel' });
  ok(b1.body && b1.body.code !== 200, `未知源 details 报错 code=${b1.body && b1.body.code}`);
  const b2 = await post('/details', { source: '错层', url: 'https://m.cuoceng.com/book/not-a-uuid.html', bookid: '', name: '', tab: 'novel' });
  ok(b2.body && b2.body.code !== undefined, `非法 bookUrl 不崩 code=${b2.body && b2.body.code}`);
  const b3 = await post('/catalog', { source: '穿越小说', url: 'http://www.kk169.la/book/info/0/0.html', bookid: '', name: '', tab: 'novel' });
  ok(b3.body && b3.body.code !== undefined, `越界目录不崩 code=${b3.body && b3.body.code}`);
  const r401 = await fetch(BASE + '/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid: 0, source: '错层', url: '' }) });
  ok(r401.status === 401, `无 X-Api-Key content 被拒 (HTTP ${r401.status})`);
  const b4 = await post('/content', { cid: 999999, source: '错层', url: 'https://m.cuoceng.com/book/00000000-0000-0000-0000-000000000000.html' });
  ok(b4.body && b4.body.code !== 200, `越界 cid 报错 code=${b4.body && b4.body.code}`);

  sec('4. 边界: 认证');
  const l1 = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `email=${TEST_EMAIL}&password=wrong` });
  const l1b = await l1.json();
  ok(l1b.code === 1000, `错误密码 code 1000 (${l1b.code})`);
  const l2 = await fetch(BASE + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `email=${TEST_EMAIL}&password=${TEST_PASS}` });
  const l2b = await l2.json();
  ok(l2b.code === 200 && l2b.data && l2b.data.user && l2b.data.user.api_key, '正确密码返回 api_key');

  console.log(`\n========== 结果: ${pass} PASS / ${fail} FAIL ==========`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('异常:', e); process.exit(2); });
