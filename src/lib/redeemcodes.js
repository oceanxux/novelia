'use strict';
// 兑换码管理: 后台生成, 前台兑换核销。JSON 持久化。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'redeem_codes.json');

let codes = new Map(); // code -> { code, member:true, expires_at, used_by, used_at, created_at }

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const arr = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const c of arr) codes.set(c.code, c);
    }
  } catch (e) { console.error('[redeemcodes] load failed:', e.message); }
}

let timer = null;
function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify([...codes.values()], null, 2));
    } catch (e) { console.error('[redeemcodes] save failed:', e.message); }
  }, 200);
}

function genCode() {
  // 形如 ZLD-XXXX-XXXX-XXXX
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `ZLD-${seg()}-${seg()}-${seg()}`;
}

// 批量生成
function generate(count = 1, expiresDays = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let code;
    do { code = genCode(); } while (codes.has(code));
    const rec = {
      code,
      member: true,
      expires_at: expiresDays > 0 ? Date.now() + expiresDays * 86400000 : 0,
      used_by: null,
      used_at: null,
      created_at: Date.now(),
    };
    codes.set(code, rec);
    out.push(rec);
  }
  save();
  return out;
}

function list() {
  return [...codes.values()].sort((a, b) => b.created_at - a.created_at);
}

function get(code) {
  return codes.get(String(code || '').trim().toUpperCase()) || null;
}

function revoke(code) {
  const ok = codes.delete(String(code || '').trim().toUpperCase());
  if (ok) save();
  return ok;
}

// 核销: 成功返回 true, 否则返回 { error }
function consume(code, byEmail) {
  const rec = get(code);
  if (!rec) return { error: '兑换码不存在' };
  if (rec.used_by) return { error: '该兑换码已被使用' };
  if (rec.expires_at && Date.now() > rec.expires_at) return { error: '该兑换码已过期' };
  rec.used_by = byEmail;
  rec.used_at = Date.now();
  save();
  return { ok: true, rec };
}

load();

module.exports = { generate, list, get, revoke, consume, save };
