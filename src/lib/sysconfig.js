'use strict';
// 系统配置层 (JSON 持久化)
// 目前配置项:
//   allow_register: boolean (是否开放用户自主注册, 默认 true)
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'system_config.json');

const current = {
  allow_register: true,
  max_devices_normal: 1, // 普通用户允许同时在线设备数，0 为无限制
  max_devices_member: 3, // 会员允许同时在线设备数，0 为无限制
};

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (typeof data.allow_register === 'boolean') current.allow_register = data.allow_register;
      if (typeof data.max_devices_normal === 'number') current.max_devices_normal = data.max_devices_normal;
      if (typeof data.max_devices_member === 'number') current.max_devices_member = data.max_devices_member;
    }
  } catch (e) {
    console.error('[sysconfig] load failed:', e.message);
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(current, null, 2));
  } catch (e) {
    console.error('[sysconfig] save failed:', e.message);
  }
}

function get() {
  return { ...current };
}

function set(patch) {
  if (typeof patch.allow_register === 'boolean') {
    current.allow_register = patch.allow_register;
  }
  if (patch.max_devices_normal !== undefined) {
    const val = parseInt(patch.max_devices_normal, 10);
    if (!isNaN(val) && val >= 0) current.max_devices_normal = val;
  }
  if (patch.max_devices_member !== undefined) {
    const val = parseInt(patch.max_devices_member, 10);
    if (!isNaN(val) && val >= 0) current.max_devices_member = val;
  }
  save();
  return get();
}

load();

module.exports = { get, set };
