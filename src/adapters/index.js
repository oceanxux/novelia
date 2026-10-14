'use strict';
// 适配器注册表: source 名 -> adapter
// 两类适配器:
//   1. 定制模块 (src/adapters/*.js) — 处理特殊反爬/加密的站点 (含函数钩子, 不可序列化)
//   2. 声明式配置 (store.js) — 内置 sources.js + 用户 data/user-sources.json,
//      由 generic.js 引擎实例化, 覆盖所有公开 HTML 站
// 管理界面增删改用户源后调用 reload() 热重载, 无需重启进程。
const qianyew = require('./qianyew');
const fanqie = require('./fanqie');
const jjwxc = require('./jjwxc');
const { createAdapter } = require('./generic');
const store = require('./store');

let ADAPTERS = new Map();

function build() {
  const map = new Map();
  // 定制适配器优先 (同名的声明式配置被忽略)
  [qianyew, fanqie, jjwxc].forEach((a) => map.set(a.name, a));
  for (const cfg of store.list()) {
    if (map.has(cfg.name)) continue;
    map.set(cfg.name, createAdapter(cfg));
  }
  ADAPTERS = map;
  return map;
}

function reload() {
  return build();
}

function get(source) {
  return ADAPTERS.get(source) || null;
}

function list() {
  return [...ADAPTERS.keys()];
}

build();

module.exports = { get, list, reload, ADAPTERS: () => ADAPTERS };
