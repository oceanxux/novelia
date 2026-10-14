'use strict';
// 番茄小说 (fanqienovel.com) 扫码登录 — 字节 passport, 全服务端可复现
//
// 链路:
//   1) GET  /passport/web/get_qrcode/            -> data.token / data.qrcode(base64 PNG) / data.expire_time
//                                                   同响应下发 passport_csrf_token
//   2) GET  /passport/web/check_qrconnect/?token=  (轮询, 约 1s 一次)
//      data.status: new -> scanned -> confirmed -> expired
//      confirmed 时同一次响应直接下发全部登录凭证 (多个 Set-Cookie), 响应体含 user_data。
//
// 全程无需 a_bogus 签名, 无需登录态; csrf 头非必需但带上。
const { request } = require('./http');

const BASE = 'https://fanqienovel.com';
const PASSPORT = BASE + '/passport/web';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// passport 前端固定参数
const QS_BASE = {
  need_logo: 'true',
  passport_jssdk_version: '3.0.16',
  passport_jssdk_type: 'normal',
  aid: '2503',
  language: 'zh',
  account_sdk_source: 'web',
};

// 非登录凭证 (csrf / 区域标记), 不纳入持久化 cookie
const NON_CRED = new Set(['passport_csrf_token', 'passport_csrf_token_default', 'reg-store-region']);

function qs(obj) {
  return Object.entries(obj).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

// Headers -> { name: value } (多值 Set-Cookie 逐条解析, 只取 name=value)
function parseSetCookies(headers) {
  let raw = [];
  if (typeof headers.getSetCookie === 'function') raw = headers.getSetCookie();
  else {
    const single = headers.get('set-cookie');
    if (single) raw = [single];
  }
  const out = {};
  for (const c of raw) {
    const kv = String(c).split(';')[0];
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    const name = kv.slice(0, i).trim();
    if (name) out[name] = kv.slice(i + 1).trim();
  }
  return out;
}

function pickCredentials(jar) {
  const out = {};
  for (const [k, v] of Object.entries(jar)) {
    if (!NON_CRED.has(k) && v) out[k] = v;
  }
  return out;
}

function statusText(status) {
  switch (status) {
    case 'new': return '等待扫码';
    case 'scanned': return '已扫码, 请在手机上确认';
    case 'confirmed': return '登录成功';
    case 'expired': return '二维码已过期, 请刷新';
    default: return '等待中';
  }
}

// 第一步: 申请二维码。返回 { token, csrf, qrcodeDataUrl, expireTime, notice, cookies }
async function createQrSession(next) {
  const url = `${PASSPORT}/get_qrcode/?` + qs({ ...QS_BASE, next: next || BASE + '/' });
  const r = await request(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: BASE + '/' },
    timeout: 20000,
  });
  let j;
  try { j = JSON.parse(r.text); } catch (e) { throw new Error('二维码接口返回非 JSON: ' + r.text.slice(0, 120)); }
  const d = (j && j.data) || {};
  if (!d.token) throw new Error('获取二维码失败: ' + ((j && j.message) || r.status));
  const cookies = parseSetCookies(r.headers);
  let notice = '';
  try { notice = (JSON.parse(d.copywriting || '{}').title) || ''; } catch (e) { notice = ''; }
  return {
    token: d.token,
    csrf: cookies.passport_csrf_token || '',
    qrcodeDataUrl: d.qrcode ? 'data:image/png;base64,' + d.qrcode : '',
    expireTime: Number(d.expire_time) || 0,
    notice,
    cookies,
  };
}

// 第二步: 轮询扫码结果。
//   未完成 -> { ok:false, status, cookies, message }
//   完成   -> { ok:true, status:'confirmed', cookies, user }
async function checkQrLogin({ token, csrf, cookies }) {
  if (!token) throw new Error('缺少 token');
  const url = `${PASSPORT}/check_qrconnect/?` + qs({ ...QS_BASE, next: BASE + '/', token });
  const jar = { ...(cookies || {}) };
  if (csrf) jar.passport_csrf_token = csrf;
  const headerCookie = Object.entries(jar)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const r = await request(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: BASE + '/',
      Cookie: headerCookie,
      'x-tt-passport-csrf-token': csrf || '',
    },
    timeout: 20000,
  });
  let j;
  try { j = JSON.parse(r.text); } catch (e) { throw new Error('校验接口返回非 JSON: ' + r.text.slice(0, 120)); }
  const d = (j && j.data) || {};
  const status = d.status || 'new';
  const merged = { ...jar, ...parseSetCookies(r.headers) };

  if (status === 'confirmed') {
    const u = d.user_data || {};
    return {
      ok: true,
      status,
      cookies: pickCredentials(merged),
      user: { user_id: String(u.user_id || ''), name: String(u.name || '') },
    };
  }
  return { ok: false, status, cookies: merged, message: statusText(status) };
}

// 校验登录态: 带 cookie 调 /api/user/info。
//   已登录 -> { ok:true, user:{ user_id, nickname, avatar, is_vip } }
//   未登录 -> { ok:false }
async function fetchUserInfo(cookieHeader) {
  if (!cookieHeader) return { ok: false };
  const r = await request(`${BASE}/api/user/info`, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: BASE + '/', Cookie: cookieHeader },
    timeout: 15000,
    retries: 0,
  });
  let j;
  try { j = JSON.parse(r.text); } catch (e) { return { ok: false }; }
  const d = (j && j.data) || {};
  if (j.code !== 0 || !d.id) return { ok: false };
  return {
    ok: true,
    user: { user_id: String(d.id), nickname: String(d.name || ''), avatar: String(d.avatar || ''), is_vip: !!d.isVip },
  };
}

module.exports = { createQrSession, checkQrLogin, fetchUserInfo, statusText };
