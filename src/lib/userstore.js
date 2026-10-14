'use strict';
// 用户数据层 (演示版): JSON 文件持久化, 内存缓存
// 用户字段: email/nickname/api_key/avatar/is_member/devices/member_records
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 数据文件放子项目内约定目录, 避免污染代码树
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');

let users = new Map();

function genKey() {
  return crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16);
}

function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  const head = name.slice(0, 2);
  return `${head}***@${domain}`;
}

function seed() {
  // 用户由 SEED_USERS 环境变量注入 (JSON 数组), 无内置默认账号
  const raw = process.env.SEED_USERS;
  if (!raw) return;
  const list = JSON.parse(raw);
  const now = Date.now();
  for (const u of list) {
    users.set(u.email, {
      email: u.email,
      password: u.password,
      nickname: u.nickname || u.email.split('@')[0],
      api_key: u.api_key || genKey(),
      avatar: u.avatar || '/uploads/avatars/default-avatar.png',
      is_member: !!u.is_member,
      disabled: !!u.disabled,
      allow_web_read: u.allow_web_read !== undefined ? !!u.allow_web_read : true,
      created_at: u.created_at || now,
      last_use_at: now,
      stat_online: u.stat_online ?? 0,
      stat_today: u.stat_today ?? 0,
      devices: u.devices || [],
      member_records: u.member_records || [],
    });
  }
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const arr = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      users = new Map();
      for (const u of arr) {
        if (u.disabled === undefined) u.disabled = false;
        if (u.allow_web_read === undefined) u.allow_web_read = true;
        users.set(u.email, u);
      }
      if (users.size > 0) return;
    }
  } catch (e) {
    console.error('[userstore] load failed:', e.message);
  }
  seed();
  save();
}

let saveTimer = null;
function save() {
  // 合并写, 避免高频 IO
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify([...users.values()], null, 2));
    } catch (e) {
      console.error('[userstore] save failed:', e.message);
    }
  }, 200);
}

function findByKey(apiKey) {
  if (!apiKey) return null;
  for (const u of users.values()) if (u.api_key === apiKey) return u;
  return null;
}

function findByName(nickname) {
  if (!nickname) return null;
  for (const u of users.values()) if (u.nickname === nickname) return u;
  return null;
}

function get(email) {
  return users.get(email) || null;
}

// 新建用户 (注册用)
function add({ email, password, nickname }) {
  const key = String(email).trim().toLowerCase();
  if (users.has(key)) return users.get(key);
  const u = {
    user_id: users.size + 1,
    email: key,
    password,
    nickname: nickname || key.split('@')[0],
    api_key: genKey(),
    avatar: '/uploads/avatars/default-avatar.png',
    is_member: false,
    disabled: false,
    allow_web_read: true,
    created_at: Date.now(),
    last_use_at: Date.now(),
    stat_online: 0,
    stat_today: 0,
    devices: [],
    member_records: [],
  };
  users.set(key, u);
  save();
  return u;
}

load();

module.exports = { users, findByKey, findByName, get, add, maskEmail, genKey, save, DATA_FILE };
