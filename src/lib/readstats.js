'use strict';
// 阅读计数: 用户真实读正文时累加, 供用户中心展示「累计阅读 / 今日阅读」。
// 计数落在服务端正文出口, 不依赖客户端是否实现上报, 因此浏览器网页与 App 书源都可统计。
const DEDUPE_MS = 5 * 60 * 1000;   // 同章节 5 分钟内重复请求不重复计数 (挡重试/双请求)
const MAX_SEEN = 30;               // 每用户保留的去重记录上限

function dayKey(ts) {
  const d = new Date(ts || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 记一次阅读; 计入返回 true。就地修改 user, 由调用方 store.save() 落盘。
function record(user, params) {
  if (!user) return false;
  const p = params || {};
  const key = `${p.source || ''}|${p.bookid || ''}|${p.cid || ''}|${p.url || ''}`;
  const now = Date.now();

  // 跨天: 今日计数归零后重新累加
  const today = dayKey(now);
  if (user.stat_date !== today) {
    user.stat_date = today;
    user.stat_today = 0;
  }

  user.read_seen = user.read_seen || {};
  const last = user.read_seen[key];
  if (last && now - last < DEDUPE_MS) return false;

  user.read_seen[key] = now;
  const keys = Object.keys(user.read_seen);
  if (keys.length > MAX_SEEN) {
    keys.sort((a, b) => user.read_seen[a] - user.read_seen[b]);
    for (const k of keys.slice(0, keys.length - MAX_SEEN)) delete user.read_seen[k];
  }

  user.stat_online = (user.stat_online || 0) + 1;  // 累计阅读
  user.stat_today = (user.stat_today || 0) + 1;    // 今日阅读
  return true;
}

// 读取时校正: 跨天则今日视为 0 (不改动内存, 写盘由 record 触发)
function snapshot(user) {
  const u = user || {};
  return {
    total: u.stat_online || 0,
    today: u.stat_date === dayKey() ? (u.stat_today || 0) : 0,
  };
}

module.exports = { record, snapshot, dayKey, DEDUPE_MS };
