'use strict';
// Cloudflare 挑战会话 (按 host 缓存)。
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
// 两种复用模式 (过挑战后自动探测):
//   node    — cf_clearance 能被 Node 请求栈复用 (如半夏): 关掉浏览器, 走轻量 HTTP。
//   browser — 站点 WAF 按请求栈指纹判定 (如茶马): 保持浏览器会话, 所有请求在页面内 fetch。
let pw = null;
try { pw = require('patchright'); } catch (e) { /* 可选依赖未安装 */ }

const path = require('path');
const os = require('os');
const fs = require('fs');
const { request } = require('./http');

const TTL = 25 * 60 * 1000;   // cf_clearance 通常 30 分钟有效, 保守取 25 分钟
const cache = new Map();      // host -> { ua, cookie, at, mode, ctx?, page?, base }
const inflight = new Map();   // host -> Promise (并发去重)
// 持久化浏览器 profile: cf_clearance 是 session cookie, 非持久化 context 关闭即丢
const PROFILE = process.env.CF_PROFILE
  || path.join(os.tmpdir(), 'zld-cf-profile');

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

function sessionHeaders(s) {
  return {
    'User-Agent': s.ua,
    Cookie: s.cookie,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: s.base + '/',
  };
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

async function launchCtx(host) {
  const hostProfile = path.join(PROFILE, host.replace(/[^a-zA-Z0-9_-]/g, '_'));
  try {
    const lockFile = path.join(hostProfile, 'SingletonLock');
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  } catch (e) {}
  return pw.chromium.launchPersistentContext(hostProfile, getLaunchOptions({ viewport: null }));
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

async function challenge(host, base) {
  if (!pw) throw new Error(`CF 源 ${host}: 需要 patchright (npm i patchright)`);
  let ctx;
  try {
    ctx = await launchCtx(host);
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
    const session = { ua, cookie, at: Date.now(), mode: 'node', base };
    // 探测 cf_clearance 能否被 Node 请求栈复用; 站点 WAF 按栈指纹判定时必须留在浏览器内。
    try {
      const probe = await request(base + '/', { headers: sessionHeaders(session) });
      if (probe.status !== 200 || CHALLENGE_RE.test(probe.text)) session.mode = 'browser';
    } catch (e) {
      session.mode = 'browser';
    }
    if (session.mode === 'browser') {
      keepOpen = true;
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

// 取该 host 的 CF 会话 (带缓存与并发去重)
async function getSession(host, base) {
  const c = cache.get(host);
  if (c && Date.now() - c.at < TTL) return c;
  if (c) { closeSession(c); cache.delete(host); }
  if (inflight.has(host)) return inflight.get(host);
  const p = challenge(host, base)
    .then((s) => { cache.set(host, s); inflight.delete(host); return s; })
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
}

module.exports = { headersFor, fetchText, isChallenge, invalidate, getSession };
