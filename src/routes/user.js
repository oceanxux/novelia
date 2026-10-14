'use strict';
// 用户中心 + 服务器状态 + 登出
// 页面: GET /user_center, /user_center.php
// 动作: POST /user_center (form-urlencoded / multipart)
// 状态: GET /api/server_status
// 登出: POST /api/logout
const fs = require('fs');
const path = require('path');
const express = require('express');
const store = require('../lib/userstore');
const metrics = require('../lib/metrics');
const redeemcodes = require('../lib/redeemcodes');

const router = express.Router();
const TPL = path.join(__dirname, '..', '..', 'public', 'user_center.html');
const AVATAR_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'avatars');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function maskKey(key) {
  const k = String(key || '');
  if (k.length <= 8) return k;
  return k.slice(0, 4) + '*******' + k.slice(-4);
}

function fmtDate(ts) {
  if (!ts) return '从未';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 未登录时的占位用户 (用于渲染空状态, 不硬编码任何真实密钥)
function guestUser() {
  return {
    email: '', nickname: '游客', api_key: '',
    avatar: '/uploads/avatars/default-avatar.png', is_member: false,
    created_at: Date.now(), last_use_at: 0, stat_online: 0, stat_today: 0, devices: [],
  };
}

// 从请求解析用户: X-Api-Key(base64) / body.api_key / X-Novel-Token / Cookie
function resolveUser(req) {
  const h = req.get('X-Api-Key');
  if (h) {
    let key;
    try { key = Buffer.from(h, 'base64').toString('utf8'); } catch (e) { key = h; }
    const u = store.findByKey(key);
    if (u) return u;
  }
  const bodyKey = req.body && req.body.api_key;
  if (bodyKey) {
    const u = store.findByKey(String(bodyKey).trim());
    if (u) return u;
  }
  // 解析 Cookie 字符串
  let cookieToken = '';
  const cookieHeader = req.get('cookie') || '';
  if (cookieHeader) {
    const parts = cookieHeader.split(';');
    for (const p of parts) {
      const kv = p.trim().split('=');
      if (kv[0] === 'user_token' || kv[0] === 'X-Novel-Token') {
        cookieToken = decodeURIComponent(kv.slice(1).join('='));
        break;
      }
    }
  }

  const token = req.get('X-Novel-Token') || cookieToken || (req.cookies && req.cookies.user_token);
  if (token) {
    const u = store.findByKey(String(token).trim());
    if (u) return u;
  }
  return null;
}

function renderDevices(user) {
  const devices = user.devices || [];
  if (!devices.length) {
    return '<div class="empty-state"><i class="fas fa-mobile-alt"></i><h5>暂无设备</h5><p class="text-muted">登录使用后设备将自动记录</p></div>';
  }
  return devices.map((d) => {
    const online = !!d.online;
    return `<div class="device-item" data-device-id="${esc(d.id)}">
        <div class="device-icon"><i class="fas fa-${d.icon || 'mobile-alt'}"></i><span class="device-dot ${online ? 'online' : 'offline'}"></span></div>
        <div class="device-info">
            <div class="device-name"><span class="device-name-text">${esc(d.name || '未命名设备')}</span></div>
            <div class="device-meta">${online ? '在线' : '离线'} · 最后活跃 ${esc(d.last_active_text || '未知')}</div>
        </div>
        <div class="device-actions">
            <button class="btn btn-sm rename-device-btn" data-device-id="${esc(d.id)}" data-device-name="${esc(d.name || '')}" title="重命名"><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm offline-device-btn" data-device-id="${esc(d.id)}" title="强制下线"><i class="fas fa-power-off"></i></button>
            <button class="btn btn-sm delete-device-btn" data-device-id="${esc(d.id)}" title="删除"><i class="fas fa-trash"></i></button>
        </div>
    </div>`;
  }).join('');
}

function renderPage(user) {
  let html = fs.readFileSync(TPL, 'utf8');
  const isMember = !!user.is_member;
  const devices = user.devices || [];
  const vars = {
    API_KEY: esc(user.api_key),
    API_KEY_MASKED: esc(maskKey(user.api_key)),
    USER_ID: String(user.user_id || 1),
    NICKNAME: esc(user.nickname || '用户'),
    EMAIL_MASKED: esc(store.maskEmail(user.email)),
    AVATAR: esc(user.avatar || '/uploads/avatars/default-avatar.png'),
    BADGE_CLASS: isMember ? 'member' : '',
    BADGE_ICON: isMember ? 'fa-crown' : 'fa-user',
    BADGE_TEXT: isMember ? '会员' : '普通用户',
    STAT_ONLINE: String(user.stat_online || 0),
    STAT_TODAY: String(user.stat_today || 0),
    STAT_DEVICES: String(devices.length),
    STAT_STATUS: String(devices.filter((d) => d.online).length),
    REGISTERED: fmtDate(user.created_at),
    LAST_USE: user.last_use_at ? fmtDate(user.last_use_at) : '从未',
    DEVICES_HTML: renderDevices(user),
    MEMBER_STATUS_CLASS: isMember ? 'member-active' : '',
    MEMBER_ICON: isMember ? 'fa-crown' : 'fa-user',
    MEMBER_TITLE: isMember ? '永久会员' : '普通用户',
    MEMBER_DESC: isMember ? '您已开通永久会员，感谢支持' : '使用会员兑换码即可升级为永久会员',
  };
  html = html.replace(/\{\{([A-Z_]+)\}\}/g, (m, name) => (name in vars ? vars[name] : m));
  return html;
}

// ---- 页面 ----
function sendPage(req, res) {
  const user = resolveUser(req);
  if (!user) {
    return res.redirect('/user_login?error=' + encodeURIComponent('未登录或登录已过期，请先登录账号'));
  }
  res.type('html').send(renderPage(user));
}
router.get('/user_center', sendPage);
router.get('/user_center.php', sendPage);

// ---- 服务器状态 ----
router.get('/api/server_status', (req, res) => {
  res.json({ success: true, data: metrics.snapshot() });
});

// ---- 登出 ----
router.post('/api/logout', (req, res) => {
  res.json({ success: true, message: '已退出登录' });
});

// ---- 动作分发 ----
router.post('/user_center', (req, res) => {
  const user = resolveUser(req);
  if (!user) return res.json({ success: false, message: '未登录或凭证无效' });
  user.last_use_at = Date.now();

  // 头像上传 (multipart, 无 action 字段, 文件在 req.files.avatar)
  const avatarFile = (req.files || []).find((f) => f.fieldname === 'avatar');
  if (avatarFile) {
    const ext = (path.extname(avatarFile.originalname) || '.png').toLowerCase();
    const allow = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (!allow.includes(ext)) return res.json({ success: false, message: '仅支持 jpg/png/gif/webp 图片' });
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    const name = `avatar_${user.user_id || 1}_${Date.now()}${ext}`;
    fs.writeFileSync(path.join(AVATAR_DIR, name), avatarFile.buffer);
    user.avatar = `/uploads/avatars/${name}`;
    store.save();
    return res.json({ success: true, message: '头像上传成功', avatar_url: user.avatar });
  }

  const action = String((req.body && req.body.action) || '').trim();

  switch (action) {
    case 'redeem_member_code': {
      const code = String((req.body.code || '')).trim().toUpperCase();
      if (!code) return res.json({ success: false, message: '请输入兑换码' });
      if (user.is_member) return res.json({ success: false, message: '您已是会员，无需重复兑换' });
      const r = redeemcodes.consume(code, user.email);
      if (r.error) return res.json({ success: false, message: r.error });
      user.is_member = true;
      user.member_records = user.member_records || [];
      user.member_records.unshift({
        code, masked_code: code.slice(0, 4) + '****' + code.slice(-4),
        created_at: Date.now(), created_at_text: new Date().toLocaleString('zh-CN'),
      });
      store.save();
      return res.json({ success: true, message: '兑换成功，您已成为永久会员' });
    }

    case 'get_member_records': {
      return res.json({ success: true, list: user.member_records || [] });
    }

    case 'rename_device': {
      const id = String(req.body.device_id || '');
      const name = String(req.body.name || '').trim();
      if (!name) return res.json({ success: false, message: '名称不能为空' });
      const dev = (user.devices || []).find((d) => d.id === id);
      if (!dev) return res.json({ success: false, message: '设备不存在' });
      dev.name = name.slice(0, 15);
      store.save();
      return res.json({ success: true, message: '设备名称已更新' });
    }

    case 'offline_device': {
      const id = String(req.body.device_id || '');
      const dev = (user.devices || []).find((d) => d.id === id);
      if (!dev) return res.json({ success: false, message: '设备不存在' });
      dev.online = false;
      dev.last_active_text = '刚刚';
      store.save();
      return res.json({ success: true, message: '设备已强制下线' });
    }

    case 'delete_device': {
      const id = String(req.body.device_id || '');
      user.devices = (user.devices || []).filter((d) => d.id !== id);
      store.save();
      return res.json({ success: true, message: '设备已删除' });
    }

    case 'update_profile': {
      const nickname = String(req.body.nickname || '').trim();
      if (nickname) user.nickname = nickname.slice(0, 20);
      const avatar = String(req.body.avatar || '').trim();
      if (avatar) user.avatar = avatar;
      store.save();
      return res.json({ success: true, message: '个人信息已更新' });
    }

    case 'reset_api_key': {
      user.api_key = store.genKey();
      store.save();
      return res.json({ success: true, message: 'API 密钥已重置', api_key: user.api_key, api_key_masked: maskKey(user.api_key) });
    }

    case 'change_password': {
      const cur = String(req.body.current_password || '');
      const next = String(req.body.new_password || '');
      const confirm = String(req.body.confirm_password || '');
      if (cur !== user.password) return res.json({ success: false, message: '当前密码错误' });
      if (next.length < 6) return res.json({ success: false, message: '新密码至少 6 位' });
      if (next !== confirm) return res.json({ success: false, message: '两次输入的新密码不一致' });
      user.password = next;
      store.save();
      return res.json({ success: true, message: '密码修改成功' });
    }

    default:
      return res.json({ success: false, message: '未知操作' });
  }
});

module.exports = { router, resolveUser, renderPage };
