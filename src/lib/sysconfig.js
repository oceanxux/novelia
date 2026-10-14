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
};

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (typeof data.allow_register === 'boolean') current.allow_register = data.allow_register;
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
  save();
  return get();
}

load();

module.exports = { get, set };
