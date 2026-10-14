'use strict';
// Cloudflare 挑战会话 (按 host 缓存)。
// 站点在 CF 的 JS 挑战后, 纯 HTTP 请求拿不到内容; 本模块用 patchright 驱动
// 本机已安装的 Chrome 过一次挑战, 提取 cf_clearance + UA 缓存给 http.js 复用。
// 只在首次 / 过期时开一次浏览器, 之后同 IP 的纯 HTTP 请求即被放行。
// patchright 为可选依赖: 未安装或系统无 Chrome 时, 相关源会明确抛错, 不影响其他源。
//
// 注意: 无头 Chrome 默认 UA 带 "HeadlessChrome" 标记, CF 据此直接判定为机器人,
// 挑战永远过不去 (标题卡在"请稍候…"直到超时)。故先探测真实 Chrome 版本, 用去掉
// 该标记的同版本 UA 启动无头浏览器; UA 版本必须与浏览器一致, 否则 CF 会因 UA
// 与 TLS/JS 指纹不符而拒绝放行。
let pw = null;
try { pw = require('patchright'); } catch (e) { /* 可选依赖未安装 */ }

const path = require('path');
const os = require('os');

const TTL = 25 * 60 * 1000;   // cf_clearance 通常 30 分钟有效, 保守取 25 分钟
const cache = new Map();      // host -> { ua, cookie, at }
const inflight = new Map();   // host -> Promise (并发去重)
// 持久化浏览器 profile: cf_clearance 是 session cookie, 非持久化 context 关闭即丢
const PROFILE = process.env.CF_PROFILE
  || path.join(os.tmpdir(), 'zld-cf-profile');

const CHALLENGE_RE = /just a moment|attention required|checking your browser|请稍候|正在检查|cf_chl_opt|Enable JavaScript and cookies/i;
const LAUNCH_ARGS = ['--test-type', '--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'];

// 自动探测系统内可用的 Chrome / Chromium 路径
const fs = require('fs');
let detectedChrome = null;
function findChromeExecutable() {
  if (detectedChrome !== null) return detectedChrome;
  const candidates = [
    process.env.CHROME_BIN,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      detectedChrome = c;
      return detectedChrome;
    }
  }
  detectedChrome = false;
  return false;
}

function getLaunchOptions(extra = {}) {
  const exe = findChromeExecutable();
  const opts = {
    headless: true,
    args: LAUNCH_ARGS,
    ...extra,
  };
  if (exe) {
    opts.executablePath = exe;
  } else {
    opts.channel = 'chrome';
  }
  return opts;
}

// 探测桌面 UA: 去掉 "Headless" 标记, 保留真实版本号; 进程内只探测一次。
let uaPromise = null;
function desktopUA() {
  if (!uaPromise) {
    uaPromise = (async () => {
      const b = await pw.chromium.launch(getLaunchOptions());
      try {
        const page = await (await b.newContext()).newPage();
        const ua = await page.evaluate(() => navigator.userAgent);
        return ua.replace(/HeadlessChrome/g, 'Chrome');
      } finally {
        await b.close();
      }
    })().catch((e) => { uaPromise = null; throw e; });
  }
  return uaPromise;
}

// 轮询直到挑战结束: 已下发 cf_clearance 且标题离开挑战页; 再用浏览器网络栈复核一次,
// 排除"有 cookie 但仍被拦"的假通过 (标题可能先于放行变化)。
async function waitPass(page, ctx, base) {
  for (let i = 0; i < 60; i++) {
    const cookies = await ctx.cookies(base).catch(() => []);
    const title = await page.title().catch(() => '');
    if (cookies.some((c) => c.name === 'cf_clearance') && title && !CHALLENGE_RE.test(title)) {
      const probe = await page.request.get(base + '/').catch(() => null);
      if (probe && probe.ok() && !CHALLENGE_RE.test(await probe.text().catch(() => ''))) return title;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`未能通过挑战 (title=${await page.title().catch(() => '')})`);
}

async function challenge(host, base) {
  if (!pw) throw new Error(`CF 源 ${host}: 需要 patchright (npm i patchright)`);
  let ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  try {
    ua = await desktopUA();
  } catch (err) {
    // 若系统无 Chrome 报错，补充清晰中文提示
    throw new Error(`CF 源 ${host}: 环境未安装 Chrome/Chromium 浏览器，无法通过 Cloudflare 挑战 (${err.message})`);
  }
  const hostProfile = path.join(PROFILE, host.replace(/[^a-zA-Z0-9_-]/g, '_'));
  try {
    const lockFile = path.join(hostProfile, 'SingletonLock');
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
  } catch (e) {}

  const ctx = await pw.chromium.launchPersistentContext(hostProfile, getLaunchOptions({
    viewport: null,
    userAgent: ua,
  }));
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitPass(page, ctx, base);
    const cookies = await ctx.cookies(base);
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    return { ua, cookie, at: Date.now() };
  } finally {
    await ctx.close();
  }
}

// 取该 host 的 CF 会话 (带缓存与并发去重)
async function getSession(host, base) {
  const c = cache.get(host);
  if (c && Date.now() - c.at < TTL) return c;
  if (inflight.has(host)) return inflight.get(host);
  const p = challenge(host, base)
    .then((s) => { cache.set(host, s); inflight.delete(host); return s; })
    .catch((e) => { inflight.delete(host); throw e; });
  inflight.set(host, p);
  return p;
}

// 供 generic.js 合并进请求头
async function headersFor(host, base) {
  const s = await getSession(host, base);
  return {
    'User-Agent': s.ua,
    Cookie: s.cookie,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: base + '/',
  };
}

// 内容看起来是挑战页 -> 缓存失效, 供调用方重试
function isChallenge(text) { return CHALLENGE_RE.test(String(text || '')); }
function invalidate(host) { cache.delete(host); }

module.exports = { headersFor, isChallenge, invalidate, getSession };
