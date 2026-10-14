'use strict';
// 晋江账号凭证存储 (本地文件持久化)
//   token 形如 "<数字>_", 由扫码登录获得; 仅本机使用, 不写入源码/日志。
//   文件: data/jj_account.json  { token, saved_at, nickname? }
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'jj_account.json');

let account = { token: '', saved_at: 0 };

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (j && typeof j.token === 'string') account = j;
    }
  } catch (e) {
    console.error('[jjtoken] load failed:', e.message);
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(account, null, 2));
  } catch (e) {
    console.error('[jjtoken] save failed:', e.message);
  }
}

function getToken() {
  return account.token || '';
}

function isLoggedIn() {
  return /\d+_/.test(account.token || '');
}

function setToken(token) {
  account = { token: String(token || ''), saved_at: Date.now() };
  save();
}

function clear() {
  account = { token: '', saved_at: 0 };
  save();
}

load();

module.exports = { getToken, setToken, clear, isLoggedIn, FILE };
