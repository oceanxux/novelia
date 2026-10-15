'use strict';
// 发现页分类表 — 分类磁贴的 id / 名称 / 检索词。
// id 沿用番茄小说的分类 id, 便于与既有书源生态对齐;
// kw 是喂给各适配器 search() 的检索词 (比 name 短, 命中率更高)。
// 分类磁贴统一映射为 search(kw), 因此任意已注册源都能出分类,
// 不依赖任何单一站点的分类接口。

const BOY = [
  { group: '热门标签', items: [
    { id: 7, name: '玄幻', kw: '玄幻' },
    { id: 1, name: '都市', kw: '都市' },
    { id: 12, name: '历史', kw: '历史' },
    { id: 10, name: '悬疑', kw: '悬疑' },
    { id: 259, name: '奇幻仙侠', kw: '仙侠' },
    { id: 8, name: '科幻末世', kw: '科幻' },
    { id: 23, name: '种田', kw: '种田' },
    { id: 746, name: '游戏体育', kw: '游戏' },
    { id: 517, name: '修仙', kw: '修仙' },
    { id: 36, name: '重生', kw: '重生' },
    { id: 37, name: '穿越', kw: '穿越' },
    { id: 19, name: '系统', kw: '系统' },
  ] },
  { group: '题材', items: [
    { id: 511, name: '东方玄幻', kw: '玄幻' },
    { id: 512, name: '异世大陆', kw: '异世' },
    { id: 1014, name: '都市高武', kw: '高武' },
    { id: 1141, name: '西方奇幻', kw: '奇幻' },
    { id: 1140, name: '东方仙侠', kw: '仙侠' },
    { id: 273, name: '历史古代', kw: '历史' },
    { id: 504, name: '抗战谍战', kw: '谍战' },
    { id: 16, name: '武侠', kw: '武侠' },
    { id: 100, name: '灵异', kw: '灵异' },
    { id: 81, name: '盗墓', kw: '盗墓' },
    { id: 66, name: '洪荒', kw: '洪荒' },
    { id: 71, name: '诸天万界', kw: '诸天' },
    // 书源默认视图的榜单磁贴会带这些 id, 缺项会退化成泛关键词导致榜单不对题
    { id: 257, name: '玄幻脑洞', kw: '玄幻' },
    { id: 258, name: '传统玄幻', kw: '玄幻' },
    { id: 261, name: '都市日常', kw: '都市' },
    { id: 262, name: '都市脑洞', kw: '都市' },
    { id: 263, name: '都市种田', kw: '种田' },
    { id: 272, name: '历史脑洞', kw: '历史' },
    { id: 718, name: '动漫衍生', kw: '动漫' },
    { id: 751, name: '悬疑灵异', kw: '灵异' },
    { id: 1016, name: '男频衍生', kw: '同人' },
  ] },
  { group: '情节', items: [
    { id: 124, name: '都市修真', kw: '修真' },
    { id: 70, name: '无限流', kw: '无限流' },
    { id: 77, name: '星际', kw: '星际' },
    { id: 372, name: '网游', kw: '网游' },
    { id: 20, name: '神豪', kw: '神豪' },
    { id: 384, name: '无敌', kw: '无敌' },
    { id: 27, name: '战神赘婿', kw: '赘婿' },
    { id: 93, name: '扮猪吃虎', kw: '扮猪吃虎' },
    { id: 520, name: '大佬', kw: '大佬' },
    { id: 69, name: '直播', kw: '直播' },
    { id: 78, name: '美食', kw: '美食' },
    { id: 43, name: '娱乐圈', kw: '娱乐圈' },
  ] },
];

const GIRL = [
  { group: '热门标签', items: [
    { id: 3, name: '现代言情', kw: '言情' },
    { id: 5, name: '古代言情', kw: '古言' },
    { id: 1012, name: '纯爱', kw: '纯爱' },
    { id: 10, name: '悬疑', kw: '悬疑' },
    { id: 36, name: '重生', kw: '重生' },
    { id: 37, name: '穿越', kw: '穿越' },
    { id: 96, name: '甜宠', kw: '甜宠' },
    { id: 29, name: '总裁', kw: '总裁' },
    { id: 79, name: '年代', kw: '年代' },
    { id: 24, name: '快穿', kw: '快穿' },
    { id: 248, name: '玄幻言情', kw: '玄幻' },
    { id: 748, name: '豪门总裁', kw: '豪门' },
  ] },
  { group: '题材', items: [
    { id: 749, name: '青春甜宠', kw: '青春' },
    { id: 246, name: '宫斗宅斗', kw: '宫斗' },
    { id: 1317, name: '古言权谋', kw: '权谋' },
    { id: 473, name: '豪门世家', kw: '豪门' },
    { id: 1139, name: '古风世情', kw: '古风' },
    { id: 1017, name: '民国言情', kw: '民国' },
    { id: 747, name: '女频悬疑', kw: '悬疑' },
    { id: 2, name: '都市生活', kw: '都市' },
    { id: 485, name: '职场商战', kw: '职场' },
    { id: 4, name: '校园', kw: '校园' },
    { id: 392, name: '无CP', kw: '无cp' },
    { id: 23, name: '种田', kw: '种田' },
    // 书源女频默认视图的榜单磁贴会带这些 id
    { id: 253, name: '古言脑洞', kw: '古言' },
    { id: 267, name: '现言脑洞', kw: '言情' },
    { id: 539, name: '悬疑脑洞', kw: '悬疑' },
    { id: 745, name: '星光璀璨', kw: '明星' },
    { id: 750, name: '职场婚恋', kw: '职场' },
    { id: 1015, name: '女频衍生', kw: '同人' },
  ] },
  { group: '角色', items: [
    { id: 86, name: '女强', kw: '女强' },
    { id: 380, name: '病娇', kw: '病娇' },
    { id: 28, name: '萌宝', kw: '萌宝' },
    { id: 94, name: '团宠', kw: '团宠' },
    { id: 519, name: '大小姐', kw: '大小姐' },
    { id: 83, name: '公主', kw: '公主' },
    { id: 85, name: '王妃', kw: '王妃' },
    { id: 84, name: '皇后', kw: '皇后' },
    { id: 88, name: '嫡女', kw: '嫡女' },
    { id: 275, name: '双男主', kw: '双男主' },
  ] },
  { group: '情节', items: [
    { id: 616, name: '追妻火葬场', kw: '追妻' },
    { id: 95, name: '虐文', kw: '虐文' },
    { id: 387, name: '青梅竹马', kw: '青梅竹马' },
    { id: 265, name: '先婚后爱', kw: '先婚后爱' },
    { id: 382, name: '穿书', kw: '穿书' },
    { id: 43, name: '娱乐圈', kw: '娱乐圈' },
    { id: 557, name: '逃荒', kw: '逃荒' },
    { id: 78, name: '美食', kw: '美食' },
  ] },
];

// id -> 分类项 (男频优先, 两频同 id 时取先出现的)
const BY_ID = new Map();
for (const g of [...BOY, ...GIRL]) {
  for (const it of g.items) if (!BY_ID.has(it.id)) BY_ID.set(it.id, it);
}

// 解析 "cat:<id>" 引用
function findCategory(ref) {
  const m = String(ref == null ? '' : ref).match(/^cat:(\d+)$/);
  if (!m) return null;
  return BY_ID.get(Number(m[1])) || null;
}

module.exports = { CATEGORIES: { boy: BOY, girl: GIRL }, findCategory };
