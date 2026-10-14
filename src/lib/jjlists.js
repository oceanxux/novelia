'use strict';
// 晋江书单本地数据: 从随项目提交的静态快照 data/jj_lists.json 加载, 供
// /booklist_jjdetail 离线渲染。快照含 listname/reader/books 等展示字段,
// 运行时无任何外部请求, 不依赖第三方服务。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SNAPSHOT = path.join(DATA_DIR, 'jj_lists.json');

let LISTS = new Map();

function load() {
  try {
    const j = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    LISTS = new Map(Object.entries(j.lists || {}));
    return true;
  } catch (e) {
    LISTS = new Map();
    return false;
  }
}

function init() {
  if (!load()) console.error('[jjlists] 本地快照加载失败:', SNAPSHOT);
}

function get(listid) {
  return LISTS.get(String(listid)) || null;
}

module.exports = { init, get };
