'use strict';
// 管理员账户 (后台专用, 与前台用户表隔离)
//   - 首次启动无 admins.json 时, 用 ADMIN_USER/ADMIN_PASS 建初始账户 (默认 admin/admin123)
//   - 初始账户 must_change_password=true, 登录后必须先改密才能用后台
//   - 密码 scrypt 加盐哈希, 不落明文; 会话 token 存内存 (重启失效)
//   忘记新密码时: 删除 data/admins.json 后重启, 即回到初始账户
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'admins.json');

const DEFAULT_USER = String(process.env.ADMIN_USER || 'admin').trim().toLowerCase() || 'admin';
const DEFAULT_PASS = process.env.ADMIN_PASS || 'admin123';

const SESSION_TTL = 12 * 60 * 60 * 1000; // 12h
const sessions = new Map(); // token -> { username, expires }

function hash(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

function makeRecord(username, password, mustChange) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    username,
    salt,
    hash: hash(password, salt),
    must_change_password: !!mustChange,
    created_at: Date.now(),
  };
}

function verify(rec, password) {
  const got = Buffer.from(hash(password, rec.salt), 'hex');
  const want = Buffer.from(rec.hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const admins = new Map(); // username(lower) -> record

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const arr = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const a of arr) if (a && a.username) admins.set(String(a.username).toLowerCase(), a);
    }
  } catch (e) {
    console.error('[admins] load failed:', e.message);
  }
  if (admins.size === 0) {
    admins.set(DEFAULT_USER, makeRecord(DEFAULT_USER, DEFAULT_PASS, true));
    save();
    console.log(`[admins] 已创建初始管理员 ${DEFAULT_USER} / ${DEFAULT_PASS} (首次登录须改密)`);
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify([...admins.values()], null, 2));
  } catch (e) {
    console.error('[admins] save failed:', e.message);
  }
}

function get(username) {
  return admins.get(String(username || '').toLowerCase()) || null;
}

function checkStrength(p) {
  const s = String(p || '');
  if (s.length < 8) return '新密码至少 8 位';
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return '新密码需同时包含字母和数字';
  return null;
}

function login(username, password) {
  const rec = get(username);
  if (!rec || !verify(rec, password)) return { ok: false, error: '账号或密码错误' };
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { username: rec.username, expires: Date.now() + SESSION_TTL });
  return { ok: true, token, username: rec.username, must_change_password: !!rec.must_change_password };
}

function changePassword(username, oldPwd, newPwd) {
  const rec = get(username);
  if (!rec) return { ok: false, error: '账户不存在' };
  if (!verify(rec, oldPwd)) return { ok: false, error: '当前密码错误' };
  const weak = checkStrength(newPwd);
  if (weak) return { ok: false, error: weak };
  if (String(newPwd) === String(oldPwd)) return { ok: false, error: '新密码不能与当前密码相同' };
  const salt = crypto.randomBytes(16).toString('hex');
  rec.salt = salt;
  rec.hash = hash(newPwd, salt);
  rec.must_change_password = false;
  save();
  return { ok: true };
}

function resolve(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { sessions.delete(token); return null; }
  return s;
}

function logout(token) { sessions.delete(token); }

load();

module.exports = { login, logout, resolve, changePassword, get, checkStrength, FILE };
