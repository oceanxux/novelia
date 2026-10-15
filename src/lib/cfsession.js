'use strict';
// Cloudflare 挑战会话 (按 host 缓存 + 磁盘 profile / JSON 双重复用)。
//
// 站点在 CF 的 JS 挑战后, 纯 HTTP 请求拿不到内容; 本模块用 patchright 驱动
// 浏览器过一次挑战, 提取 cf_clearance + UA 缓存复用。
// patchright 为可选依赖: 未安装或浏览器缺失时, 相关源会明确抛错, 不影响其他源。
//
// 三条经实测确认的必要条件 (缺一挑战必失败):
//   1. 有头模式: 无头 Chromium 会被这两站的 CF 判定为机器人, 挑战永远过不去。
//      容器内无显示器时用 xvfb-run 包住进程 (见 Dockerfile); CF_HEADLESS=1 可强制无头。
//   2. patchright 自带 chromium: 隐身补丁只作用于它, 系统 Chrome 不生效。
//      需执行 `npx patchright install chromium`; 仅在显式设置 CHROME_BIN 时才改用系统浏览器。
//   3. 不自定义 UA: patchright 官方最佳实践, 自定义 UA 会与 TLS/JS 指纹不符而被拒。
//
// 会话来源优先级 (高 -> 低), 越靠前越省 (越不弹窗):
//   0. 内存缓存            — 进程内, 零开销
//   1. data/cf-sessions.json — 跨重启, 零浏览器
//   2. 磁盘浏览器 profile   — 复用 patchright 已落盘的持久 cookie, 无需重过挑战
//   3. 完整挑战流程         — 兜底: 开有头浏览器过一次挑战
//
// 实测 (2026-10): cf_clearance 在 profile 里是持久 cookie, 有效期约 1 年。
//   node 模式 (茶马 chamabooks.net): 磁盘 cookie + Node 请求栈直接 200, 全程零窗口。
//   browser 模式 (半夏 xbanxia.cc): Node 栈被 WAF 按指纹拒 (403), 需有头浏览器常驻;
//                                   但复用磁盘 cookie 时 goto 直接放行, 不重过挑战。
let pw = null;
try { pw = require('patchright'); } catch (e) { /* 可选依赖未安装 */ }

const path = require('path');
const os = require('os');
const fs = require('fs');
const { request, DEFAULT_UA } = require('./http');

const TTL = 25 * 60 * 1000;   // 会话软 TTL: 到期后重新校验 (校验命中即续期, 不再重过挑战)
const cache = new Map();      // host -> { ua, cookie, at, mode, ctx?, page?, base, host }
const inflight = new Map();   // host -> Promise (并发去重)
// 持久化浏览器 profile: cf_clearance 是 session cookie, 非持久化 context 关闭即丢
const PROFILE = process.env.CF_PROFILE
  || path.join(os.tmpdir(), 'zld-cf-profile');
// 跨重启的会话落盘 (node 模式可完全免浏览器)
const STORE_FILE = process.env.CF_STORE
  || path.join(__dirname, '..', '..', 'data', 'cf-sessions.json');

const CHALLENGE_RE = /just a moment|attention required|checking your browser|请稍候|正在检查|cf_chl_opt|Enable JavaScript and cookies/i;
const LAUNCH_ARGS = ['--test-type', '--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'];

// 仅当用户显式指定时才用系统浏览器; 默认交给 patchright 用自带 chromium (带隐身补丁)。
function chromeExecutable() {
  for (const c of [process.env.CHROME_BIN, process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH]) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function getLaunchOptions(extra = {}) {
  const opts = {
    headless: process.env.CF_HEADLESS === '1',
    args: LAUNCH_ARGS,
    ...extra,
  };
  const exe = chromeExecutable();
  if (exe) opts.executablePath = exe;
  return opts;
}

// 该 host 的持久 profile 目录
function profileDir(host) {
  return path.join(PROFILE, String(host).replace(/[^a-zA-Z0-9_-]/g, '_'));
}
// 上次异常退出可能残留 SingletonLock, 挡住下次启动
function cleanLock(host) {
  try {
    const lockFile = path.join(profileDir(host), 'SingletonLock');
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  } catch (e) {}
}

// ---- JSON 落盘 (跨重启复用, 免浏览器) ----
function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) || {}; } catch (e) { return {}; }
}
function writeStore(host, s) {
  if (!s || s.mode !== 'node' || !s.cookie) return;
  try {
    const all = readStore();
    all[host] = { ua: s.ua, cookie: s.cookie, at: s.at, mode: 'node', base: s.base };
    fs.writeFileSync(STORE_FILE, JSON.stringify(all, null, 2));
  } catch (e) { /* 落盘失败不影响内存会话 */ }
}

function sessionHeaders(s) {
  return {
    'User-Agent': s.ua || DEFAULT_UA,
    Cookie: s.cookie || '',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: (s.base || '') + '/',
  };
}

// 用 Node 请求栈校验一份 cookie 是否仍被放行
async function probeNode(s) {
  try {
    const r = await request(s.base + '/', { headers: sessionHeaders(s), timeout: 15000 });
    return r.status === 200 && !CHALLENGE_RE.test(r.text);
  } catch (e) {
    return false;
  }
}

// 轮询直到挑战结束: 已下发 cf_clearance 且页面内容不再是挑战页。
// 用内容而非标题判定: 有头模式下标题可能是 "Loading <url>" 占位, 不代表已放行。
async function waitPass(page, ctx, base) {
  for (let i = 0; i < 60; i++) {
    const cookies = await ctx.cookies(base).catch(() => []);
    if (cookies.some((c) => c.name === 'cf_clearance')) {
      const html = await page.content().catch(() => '');
      if (html.length > 2000 && !CHALLENGE_RE.test(html)) return true;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`未能通过挑战 (title=${await page.title().catch(() => '')})`);
}

// 在浏览器会话内发请求 (页面同源 fetch, 带上 cf_clearance)。
async function browserFetch(s, url, opts = {}) {
  if (!s.page || s.page.isClosed()) throw new Error('CF 浏览器会话已关闭');
  const method = (opts.method || 'GET').toUpperCase();
  const headers = opts.headers || {};
  const body = opts.body;
  const res = await s.page.evaluate(async (a) => {
    const init = { method: a.method, headers: a.headers, credentials: 'same-origin', redirect: 'follow' };
    if (a.body && a.method !== 'GET' && a.method !== 'HEAD') init.body = a.body;
    try {
      const r = await fetch(a.url, init);
      return { status: r.status, text: await r.text() };
    } catch (e) {
      return { status: 0, text: '', error: String((e && e.message) || e) };
    }
  }, { url, method, headers, body });
  if (res.status === 0) throw new Error(`CF 浏览器请求失败: ${res.error}`);
  return { status: res.status, headers: {}, text: res.text };
}

// 用磁盘 profile 里已有的 cf_clearance 建会话 (单次启动, 避免同 profile 连续启动的竞态):
//   1. 有头启动 (半夏 CF 拒无头, 故统一有头; 只为读 cookie, 不导航)
//   2. Node 栈能过 -> 关掉浏览器, 走轻量 node 模式 (茶马属此类, 全程零窗口)
//   3. Node 栈被指纹拒 -> 复用同一 context goto, 有效 cookie 直接放行 (不重过挑战),
//      会话常驻 (半夏属此类); 只有 cookie 真失效时才等挑战。
async function fromProfile(host, base) {
  if (!pw) return null;
  const ck = path.join(profileDir(host), 'Default', 'Cookies');
  if (!fs.existsSync(ck)) return null;
  cleanLock(host);
  let ctx;
  try {
    ctx = await pw.chromium.launchPersistentContext(profileDir(host), getLaunchOptions({ viewport: null }));
  } catch (e) {
    return null;
  }
  let keepOpen = false;
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    const cookies = await ctx.cookies(base);
    if (!cookies.some((c) => c.name === 'cf_clearance')) return null;
    const ua = await page.evaluate(() => navigator.userAgent).catch(() => DEFAULT_UA);
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const session = { host, ua, cookie, at: Date.now(), mode: 'node', base };
    if (await probeNode(session)) return session;

    // Node 栈被指纹拒 -> 复用同一 context 放行
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (CHALLENGE_RE.test(await page.content().catch(() => ''))) {
      await waitPass(page, ctx, base);
    }
    const cookies2 = await ctx.cookies(base);
    session.cookie = cookies2.map((c) => `${c.name}=${c.value}`).join('; ');
    session.ua = await page.evaluate(() => navigator.userAgent).catch(() => ua);
    session.mode = 'browser';
    session.ctx = ctx;
    session.page = page;
    keepOpen = true;
    return session;
  } finally {
    if (!keepOpen) await ctx.close().catch(() => {});
  }
}

// 完整挑战流程 (兜底): 有头浏览器打开站点, 等挑战通过
async function challenge(host, base) {
  if (!pw) throw new Error(`CF 源 ${host}: 需要 patchright (npm i patchright)`);
  cleanLock(host);
  let ctx;
  try {
    ctx = await pw.chromium.launchPersistentContext(profileDir(host), getLaunchOptions({ viewport: null }));
  } catch (err) {
    throw new Error(`CF 源 ${host}: 浏览器启动失败, 请执行 npx patchright install chromium (${err.message})`);
  }
  let keepOpen = false;
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitPass(page, ctx, base);
    const ua = await page.evaluate(() => navigator.userAgent);
    const cookies = await ctx.cookies(base);
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const session = { host, ua, cookie, at: Date.now(), mode: 'node', base };
    // 探测 cf_clearance 能否被 Node 请求栈复用; 站点 WAF 按栈指纹判定时必须留在浏览器内。
    if (!(await probeNode(session))) {
      keepOpen = true;
      session.mode = 'browser';
      session.ctx = ctx;
      session.page = page;
    }
    return session;
  } finally {
    if (!keepOpen) await ctx.close().catch(() => {});
  }
}

function closeSession(s) {
  if (s && s.ctx) s.ctx.close().catch(() => {});
}

// 取该 host 的 CF 会话 (内存 -> JSON -> 磁盘 profile -> 完整挑战; 带缓存与并发去重)
async function getSession(host, base) {
  const c = cache.get(host);
  if (c && Date.now() - c.at < TTL) return c;
  // browser 模式常驻: 到期只续期, 不重开窗口 (cookie 失效由 fetchText 检测后 invalidate)
  if (c && c.mode === 'browser' && c.page && !c.page.isClosed()) {
    c.at = Date.now();
    return c;
  }
  if (c) { closeSession(c); cache.delete(host); }
  if (inflight.has(host)) return inflight.get(host);

  const p = (async () => {
    // 1) 跨重启 JSON 缓存
    const stored = readStore()[host];
    if (stored && stored.cookie) {
      const s = { host, ua: stored.ua, cookie: stored.cookie, at: Date.now(), mode: 'node', base };
      if (await probeNode(s)) return s;
    }
    // 2) 磁盘浏览器 profile
    try {
      const s = await fromProfile(host, base);
      if (s) return s;
    } catch (e) { /* 落到完整挑战 */ }
    // 3) 兜底: 完整挑战流程
    return await challenge(host, base);
  })()
    .then((s) => { cache.set(host, s); writeStore(host, s); inflight.delete(host); return s; })
    .catch((e) => { inflight.delete(host); throw e; });
  inflight.set(host, p);
  return p;
}

// 统一请求入口: 按会话模式选择 Node HTTP 或浏览器内 fetch; 命中挑战页则失效重取一次。
async function fetchText(host, base, url, opts = {}) {
  let s = await getSession(host, base);
  if (s.mode === 'browser') return browserFetch(s, url, opts);
  const r = await request(url, { ...opts, headers: { ...sessionHeaders(s), ...(opts.headers || {}) } });
  if (isChallenge(r.text)) {
    invalidate(host);
    s = await getSession(host, base);
    if (s.mode === 'browser') return browserFetch(s, url, opts);
    return request(url, { ...opts, headers: { ...sessionHeaders(s), ...(opts.headers || {}) } });
  }
  return r;
}

// 供调用方直接取请求头 (node 模式下的轻量路径)
async function headersFor(host, base) {
  const s = await getSession(host, base);
  return sessionHeaders(s);
}

// 内容看起来是挑战页 -> 缓存失效, 供调用方重试
function isChallenge(text) { return CHALLENGE_RE.test(String(text || '')); }
function invalidate(host) {
  const c = cache.get(host);
  if (c) { closeSession(c); cache.delete(host); }
  try {
    const all = readStore();
    if (all[host]) { delete all[host]; fs.writeFileSync(STORE_FILE, JSON.stringify(all, null, 2)); }
  } catch (e) {}
}

module.exports = { headersFor, fetchText, isChallenge, invalidate, getSession };
