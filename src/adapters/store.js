'use strict';
// 源配置存储: 内置源 (sources.js, 可含函数钩子) + 用户源 (data/user-sources.json, 纯声明式)。
// 管理界面增删改的源写 user-sources.json, 与内置源合并后交给 generic 引擎实例化。
const fs = require('fs');
const path = require('path');

const USER_FILE = path.join(__dirname, '..', '..', 'data', 'user-sources.json');
const builtin = require('./sources');

function readUser() {
  try {
    const arr = JSON.parse(fs.readFileSync(USER_FILE, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function writeUser(list) {
  fs.mkdirSync(path.dirname(USER_FILE), { recursive: true });
  fs.writeFileSync(USER_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function builtinNames() {
  return builtin.map((c) => c.name);
}

function isBuiltin(name) {
  return builtinNames().includes(name);
}

// 校验一份声明式源配置; 通过返回 null, 否则返回错误文案
function validate(cfg) {
  if (!cfg || typeof cfg !== 'object') return '配置为空';
  if (!cfg.name || !String(cfg.name).trim()) return '缺少源站名 (name)';
  // 如果是内置源或代码定制源，跳过严格的选择器字段校验
  if (isBuiltin(cfg.name)) return null;
  if (!cfg.base || !/^https?:\/\//.test(cfg.base)) return '缺少或非法 base (须以 http/https 开头)';
  const s = cfg.search;
  if (!s || !s.request || !s.request.url) return '缺少 search.request.url (搜索地址模板)';
  if (!s.list) return '缺少 search.list (结果列表项选择器)';
  if (!s.fields || !s.fields.title || !s.fields.bookUrl) return '缺少 search.fields.title / bookUrl';
  if (!cfg.detail || !cfg.detail.fields || !cfg.detail.fields.title) return '缺少 detail.fields.title';
  const hasCatalogRule = cfg.catalog && cfg.catalog.list && cfg.catalog.title && cfg.catalog.url;
  const hasCatalogBuild = cfg.catalog && typeof cfg.catalog.build === 'function';
  if (!hasCatalogRule && !hasCatalogBuild) return '缺少 catalog.list / title / url';
  const hasContentRule = cfg.content && cfg.content.content;
  const hasContentBuild = cfg.content && typeof cfg.content.build === 'function';
  if (!hasContentRule && !hasContentBuild) return '缺少 content.content (正文选择器)';
  return null;
}

// 合并后的配置列表 (内置在前, 用户源在后)
function list() {
  return builtin.concat(readUser());
}

function getUser(name) {
  return readUser().find((c) => c.name === name) || null;
}

function addUser(cfg) {
  const err = validate(cfg);
  if (err) return { ok: false, error: err };
  if (isBuiltin(cfg.name)) return { ok: false, error: '同名内置源已存在, 请换一个名字' };
  const arr = readUser();
  if (arr.some((c) => c.name === cfg.name)) return { ok: false, error: '同名源已存在' };
  arr.push(cfg);
  writeUser(arr);
  return { ok: true, name: cfg.name };
}

function updateUser(name, cfg) {
  if (isBuiltin(name)) return { ok: false, error: '内置源不可修改' };
  const arr = readUser();
  const i = arr.findIndex((c) => c.name === name);
  if (i < 0) return { ok: false, error: '源不存在' };
  const next = { ...cfg, name: (cfg.name || name).trim() };
  const err = validate(next);
  if (err) return { ok: false, error: err };
  if (next.name !== name && (isBuiltin(next.name) || arr.some((c, j) => j !== i && c.name === next.name))) {
    return { ok: false, error: '改名后与已有源冲突' };
  }
  arr[i] = next;
  writeUser(arr);
  return { ok: true, name: next.name };
}

function removeUser(name) {
  if (isBuiltin(name)) return { ok: false, error: '内置源不可删除' };
  const arr = readUser();
  const i = arr.findIndex((c) => c.name === name);
  if (i < 0) return { ok: false, error: '源不存在' };
  arr.splice(i, 1);
  writeUser(arr);
  return { ok: true };
}

module.exports = {
  list, getUser, addUser, updateUser, removeUser,
  isBuiltin, validate, builtinNames, USER_FILE,
};
