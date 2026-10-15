'use strict';
// 设备登记: 用户每次登录/带凭证访问时记录设备, 供用户中心展示与远程下线。
// 设备身份优先取书源在请求头里带的稳定设备号 (Legado java.deviceID/androidId),
// 没有则按 UA 指纹生成, 同一台机器重复登录只会刷新最后活跃时间, 不会重复计数。
const crypto = require('crypto');

const ONLINE_TTL = 15 * 60 * 1000; // 15 分钟内有请求视为在线
const MAX_DEVICES = 20;            // 单账号保留的设备上限 (超出淘汰最旧)

function fingerprint(req, explicitId) {
  if (explicitId) return 'dev_' + crypto.createHash('sha1').update(String(explicitId)).digest('hex').slice(0, 12);
  const ua = String(req.get('user-agent') || '');
  const lang = String(req.get('accept-language') || '');
  const ip = clientIp(req);
  return 'dev_' + crypto.createHash('sha1').update(`${ua}|${lang}|${ip}`).digest('hex').slice(0, 12);
}

// 取真实客户端 IP: 反向代理后取 X-Forwarded-For 首个地址
function clientIp(req) {
  const xff = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = xff || req.ip || (req.socket && req.socket.remoteAddress) || '';
  return ip.replace(/^::ffff:/, '');
}

function deviceName(ua) {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod/i.test(s)) return 'iOS 设备';
  if (/Android/i.test(s)) return 'Android 设备';
  if (/Macintosh|Mac OS X/i.test(s)) return 'Mac 浏览器';
  if (/Windows/i.test(s)) return 'Windows 浏览器';
  if (/okhttp|legado|yuedu/i.test(s)) return '阅读 App';
  return '未知设备';
}

function relTime(ts) {
  if (!ts) return '未知';
  const d = Date.now() - ts;
  if (d < 60 * 1000) return '刚刚';
  if (d < 60 * 60 * 1000) return `${Math.floor(d / 60000)} 分钟前`;
  if (d < 24 * 60 * 60 * 1000) return `${Math.floor(d / 3600000)} 小时前`;
  if (d < 30 * 24 * 60 * 60 * 1000) return `${Math.floor(d / 86400000)} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

// 登记/刷新一台设备; 返回该设备记录
function touch(user, req, explicitId) {
  if (!user) return null;
  user.devices = user.devices || [];
  const id = fingerprint(req, explicitId);
  const now = Date.now();
  let dev = user.devices.find((d) => d.id === id);
  if (!dev) {
    dev = { id, name: deviceName(req.get('user-agent')), created_at: now };
    user.devices.unshift(dev);
    if (user.devices.length > MAX_DEVICES) user.devices.length = MAX_DEVICES;
  }
  dev.online = true;
  dev.last_active_at = now;
  dev.last_active_text = relTime(now);
  dev.ip = clientIp(req);
  dev.platform = deviceName(req.get('user-agent'));
  return dev;
}

// 读取时刷新在线态 (不需要写盘): 超过 ONLINE_TTL 未活跃即视为离线
function refreshOnline(user) {
  const now = Date.now();
  for (const d of (user && user.devices) || []) {
    d.online = !!d.last_active_at && now - d.last_active_at < ONLINE_TTL;
    d.last_active_text = relTime(d.last_active_at);
  }
}

module.exports = { touch, refreshOnline, fingerprint, clientIp, deviceName, relTime, ONLINE_TTL, MAX_DEVICES };
