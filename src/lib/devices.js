'use strict';
// 设备登记: 仅当客户端带稳定设备码 (阅读 App / 书源请求头 X-Device-Id) 时记录设备,
// 供用户中心展示与远程下线。浏览器网页登录/访问不带设备码, 不计入设备。
// 同一设备码重复请求只刷新最后活跃时间, 不会重复计数。
const crypto = require('crypto');

const ONLINE_TTL = 15 * 60 * 1000; // 15 分钟内有请求视为在线
const MAX_DEVICES = 20;            // 单账号保留的设备上限 (超出淘汰最旧)

function clientIp(req) {
  const xff = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = xff || req.ip || (req.socket && req.socket.remoteAddress) || '';
  return ip.replace(/^::ffff:/, '');
}

function parseDeviceName(ua) {
  const s = String(ua || '');
  if (/iPhone OS (\d+[_.]\d+)/i.test(s)) {
    const v = s.match(/iPhone OS (\d+[_.]\d+)/i)[1].replace(/_/g, '.');
    return `iPhone (iOS ${v})`;
  }
  if (/iPad.*OS (\d+[_.]\d+)/i.test(s)) {
    const v = s.match(/OS (\d+[_.]\d+)/i)[1].replace(/_/g, '.');
    return `iPad (iPadOS ${v})`;
  }
  if (/Android\s*([\d.]+)?/i.test(s)) {
    const m = s.match(/Android\s*([\d.]+)?/i);
    const model = s.match(/;\s*([^;)]+)\s*Build/i);
    const modelStr = model ? ' ' + model[1].trim() : '';
    return 'Android' + (m && m[1] ? ' ' + m[1] : '') + modelStr;
  }
  if (/Macintosh|Mac OS X/i.test(s)) return 'Mac 浏览器';
  if (/Windows NT/i.test(s)) return 'Windows 浏览器';
  if (/Linux/i.test(s)) return 'Linux 客户端';
  if (/okhttp|legado|yuedu/i.test(s)) return '阅读 App';
  return '移动端设备';
}

function parseDeviceIcon(ua) {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(s)) return 'mobile-alt';
  if (/Macintosh|Windows|Linux/i.test(s)) return 'laptop';
  return 'tablet-alt';
}

// 设备码来源: 优先显式传入 (登录体 device_id), 其次请求头 X-Device-Id / device-id。
// 均无则返回 null —— 浏览器网页登录/访问不带设备码, 不登记设备。
function fingerprint(req, explicitId) {
  const headerId = String(explicitId || req.get('x-device-id') || req.get('device-id') || '').trim();
  if (!headerId) return null;
  return 'dev_' + crypto.createHash('sha1').update(headerId).digest('hex').slice(0, 12);
}

// 设备码展示用掩码: 首 4 位 + **** + 末 4 位
function maskDeviceId(id) {
  const s = String(id || '').replace(/^dev_/, '');
  if (s.length <= 8) return s || '未知';
  return s.slice(0, 4) + '****' + s.slice(-4);
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

const sysconfig = require('./sysconfig');

// 登记/刷新一台设备; 返回该设备记录。无设备码 (浏览器访问) 返回 null, 不登记。
function touch(user, req, explicitId) {
  if (!user) return null;
  const id = fingerprint(req, explicitId);
  if (!id) return null; // 无设备码: 浏览器登录/访问不产生设备记录
  user.devices = user.devices || [];
  const ua = req.get('user-agent') || '';
  const now = Date.now();
  let dev = user.devices.find((d) => d.id === id);
  if (!dev) {
    dev = {
      id,
      name: parseDeviceName(ua),
      icon: parseDeviceIcon(ua),
      created_at: now
    };
    user.devices.unshift(dev);
    if (user.devices.length > MAX_DEVICES) user.devices.length = MAX_DEVICES;
  } else if (!dev.icon) {
    dev.icon = parseDeviceIcon(ua);
  }
  dev.online = true;
  dev.kicked = false; // 该设备重新活跃, 清除被顶下线标记
  dev.last_active_at = now;
  dev.last_active_text = relTime(now);
  dev.ip = clientIp(req);
  dev.platform = parseDeviceName(ua);

  // 刷新所有设备在线态
  refreshOnline(user);

  // 根据当前系统配置判断是否超过允许的最大在线设备数 (0 为无限制)
  const cfg = sysconfig.get();
  const maxOnline = user.is_member ? (cfg.max_devices_member ?? 3) : (cfg.max_devices_normal ?? 1);
  if (maxOnline > 0) {
    const onlineDevs = user.devices.filter((d) => d.online && d.id !== dev.id);
    // 按最后活跃时间升序排序，最久未活跃的优先顶下线
    onlineDevs.sort((a, b) => (a.last_active_at || 0) - (b.last_active_at || 0));
    while (onlineDevs.length >= maxOnline) {
      const oldest = onlineDevs.shift();
      if (oldest) {
        oldest.online = false;
        oldest.kicked = true; // 标记被顶下线, 防止仅凭 last_active_at 被 refreshOnline 复活
        oldest.last_active_text = relTime(oldest.last_active_at);
      }
    }
  }

  return dev;
}

// 读取时刷新在线态 (不需要写盘): 超过 ONLINE_TTL 未活跃即视为离线
// 被强制下线/顶下线的设备 (kicked) 在重新活跃前保持离线
function refreshOnline(user) {
  const now = Date.now();
  for (const d of (user && user.devices) || []) {
    if (d.kicked) {
      d.online = false;
    } else {
      d.online = !!d.last_active_at && now - d.last_active_at < ONLINE_TTL;
    }
    d.last_active_text = relTime(d.last_active_at);
  }
}

module.exports = { touch, refreshOnline, fingerprint, maskDeviceId, clientIp, deviceName: parseDeviceName, relTime, ONLINE_TTL, MAX_DEVICES };
