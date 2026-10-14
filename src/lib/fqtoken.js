'use strict';
// 番茄小说账号凭证存储 (本地文件持久化)
//   扫码成功后 passport 一次性下发全部登录 cookie, 这里整体保存。
//   仅本机使用, 不写入源码/日志。
//   文件: data/fq_account.json  { cookies: {name: value}, user_id, nickname, saved_at }
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'fq_account.json');

// 判定登录是否有效的核心凭证 (缺任一即视为未登录)
const REQUIRED = ['sessionid', 'sid_guard'];

let account = { cookies: {}, user_id: '', nickname: '', saved_at: 0 };

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (j && j.cookies && typeof j.cookies === 'object') account = j;
    }
  } catch (e) {
    console.error('[fqtoken] load failed:', e.message);
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(account, null, 2));
  } catch (e) {
    console.error('[fqtoken] save failed:', e.message);
  }
}

function getCookies() {
  return { ...account.cookies };
}

// 拼成 Cookie 请求头
function getCookieHeader() {
  return Object.entries(account.cookies)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function isLoggedIn() {
  return REQUIRED.every((k) => account.cookies && account.cookies[k]);
}

function setAccount({ cookies, user }) {
  account = {
    cookies: { ...(cookies || {}) },
    user_id: String((user && user.user_id) || ''),
    nickname: String((user && user.name) || ''),
    saved_at: Date.now(),
  };
  save();
}

function getUser() {
  return { user_id: account.user_id || '', nickname: account.nickname || '' };
}

function clear() {
  account = { cookies: {}, user_id: '', nickname: '', saved_at: 0 };
  save();
}

load();

module.exports = { getCookies, getCookieHeader, setAccount, getUser, isLoggedIn, clear, FILE };
