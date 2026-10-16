'use strict';
// 书旗榜单采集与缓存服务: 把书旗官方排行榜 (shuqi.com/ranklist) 聚合为书单格式,
// 供首页精选/推荐/随机书单与书单详情页实时使用。
//
// 榜单页是静态 HTML (SSR), 每页 10 本, 字段含书名/作者/封面/简介/分类/标签。
// 站点放行搜索引擎爬虫, 用默认 Baiduspider UA 直连即 200, 无需 cookie 或浏览器。
const { request } = require('./http');
const { cheerio } = require('./rule');

const BASE = 'https://www.shuqi.com';
const HEADERS = { Referer: BASE + '/rank' };

// 榜单表 (key 为站点 ranklist 的 rank 参数); 新书榜 (allNew/boyNew/girlNew) 站点返回空, 不收
const RANKS = [
  { key: 'allClick', name: '点击榜', desc: '全站点击量最高的热门作品', tag: '热门,点击' },
  { key: 'allStore', name: '收藏榜', desc: '读者收藏最多的口碑佳作', tag: '口碑,收藏' },
  { key: 'allOrder', name: '订阅榜', desc: '订阅量领先的畅销作品', tag: '畅销,订阅' },
  { key: 'allWords', name: '字数榜', desc: '篇幅超长的连载作品', tag: '长篇,连载' },
  { key: 'allEnd', name: '完结榜', desc: '全站高分完结作品精选', tag: '完结,精选' },
  { key: 'boyhot', name: '男频人气榜', desc: '男频当前人气最高的作品', tag: '男频,人气' },
  { key: 'boyClick', name: '男频点击榜', desc: '男频点击量领先的热门作品', tag: '男频,点击' },
  { key: 'boyStore', name: '男频收藏榜', desc: '男频读者收藏最多的作品', tag: '男频,收藏' },
  { key: 'boyOrder', name: '男频订阅榜', desc: '男频订阅量领先的畅销作品', tag: '男频,订阅' },
  { key: 'boyEnd', name: '男频完结榜', desc: '男频高分完结作品精选', tag: '男频,完结' },
  { key: 'boyUpdate', name: '男频更新榜', desc: '男频日更稳定的连载作品', tag: '男频,更新' },
  { key: 'girlhot', name: '女频人气榜', desc: '女频当前人气最高的作品', tag: '女频,人气' },
  { key: 'girlClick', name: '女频点击榜', desc: '女频点击量领先的热门作品', tag: '女频,点击' },
  { key: 'girlStore', name: '女频收藏榜', desc: '女频读者收藏最多的作品', tag: '女频,收藏' },
  { key: 'girlOrder', name: '女频订阅榜', desc: '女频订阅量领先的畅销作品', tag: '女频,订阅' },
  { key: 'girlEnd', name: '女频完结榜', desc: '女频高分完结作品精选', tag: '女频,完结' },
  { key: 'girlUpdate', name: '女频更新榜', desc: '女频日更稳定的连载作品', tag: '女频,更新' },
];

const CACHE_TTL = 60 * 60 * 1000;   // 内存缓存 1 小时
const PAGES_PER_RANK = 2;           // 每榜取前 N 页 (每页 10 本)
const CONCURRENCY = 6;              // 榜单抓取并发

let CACHED_LISTS = null;
let LAST_FETCH_TIME = 0;
let isFetching = false;

// 解析一页榜单 HTML 为书籍数组; startIndex 为已累计条数 (用于连续编号)
function parseRankPage(html, startIndex) {
  const $ = cheerio.load(html);
  const books = [];
  $('ul.ranklist-ul > li').each((_, el) => {
    const $e = $(el);
    const title = $e.find('.ranklinst-bk h3').text().replace(/\s+/g, ' ').trim();
    if (!title) return;
    const href = $e.find('.ranklinst-bk a').first().attr('href') || '';
    const novelid = (href.match(/\/book\/(\d+)/) || [])[1] || '';
    const author = $e.find('.ranklist-autor .bkuser-icon a').text().trim();
    const category = $e.find('.ranklist-autor .bkcate-icon').text().trim();
    const desc = $e.find('.ranklist-des').text().replace(/\s+/g, ' ').trim();
    const cover = $e.find('img').first().attr('src') || '';
    const tags = $e.find('.ranklist-tag span a').map((_, a) => $(a).text().trim()).get().filter(Boolean);
    books.push({
      index: startIndex + books.length + 1,
      novelid,
      novelname: title,
      book_title: title,
      authorname: author,
      author_name: author,
      cover,
      book_cover: cover,
      novelclass_str: category,
      novelintroshort: desc,
      comment: '',
      novelstar: 0,
      novelstep_name: '',
      novelsize: '',
      novelbefavoritedcount: '',
      renewdate: '',
      novel_review_score: '',
      source: '书旗',
      tags,
    });
  });
  return books;
}

// 抓取单个榜单 (含分页); 无书则返回 null
async function fetchRank(rankDef) {
  const books = [];
  for (let page = 1; page <= PAGES_PER_RANK; page++) {
    const url = `${BASE}/ranklist?rank=${rankDef.key}${page > 1 ? `&page=${page}` : ''}`;
    const r = await request(url, { headers: HEADERS, timeout: 25000 });
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const pageBooks = parseRankPage(r.text, books.length);
    if (!pageBooks.length) break;
    books.push(...pageBooks);
  }
  if (!books.length) return null;
  return {
    id: `sq_${rankDef.key}`,
    listid: `sq_${rankDef.key}`,
    title: rankDef.name,
    listname: rankDef.name,
    description: rankDef.desc,
    introduction: rankDef.desc,
    book_count: books.length,
    booknum: books.length,
    like_count: 0,
    favnum: 0,
    view_count: 0,
    comment_count: 0,
    books,
    nickname: '书旗榜单',
    reader_name: '书旗小说',
    avatar: '/image/logo.svg',
    reader_avatar: '/image/logo.svg',
    time_label: '实时更新',
    has_new_books: false,
    custom_keywords: rankDef.tag,
    categories: rankDef.tag.split(','),
  };
}

// 刷新全部榜单 (并发池)
async function refreshAll() {
  if (isFetching) return;
  isFetching = true;
  try {
    const lists = [];
    let cursor = 0;
    async function worker() {
      while (cursor < RANKS.length) {
        const def = RANKS[cursor++];
        try {
          const item = await fetchRank(def);
          if (item) lists.push(item);
        } catch (err) {
          console.warn(`[sqranks] 获取榜单 ${def.name} 失败:`, err.message);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, RANKS.length) }, worker));
    if (lists.length > 0) {
      // 恢复榜单表顺序, 避免并发导致的乱序
      const order = new Map(RANKS.map((r, i) => [`sq_${r.key}`, i]));
      lists.sort((a, b) => order.get(a.id) - order.get(b.id));
      CACHED_LISTS = lists;
      LAST_FETCH_TIME = Date.now();
      console.log(`[sqranks] 成功加载 ${lists.length} 个书旗榜单书单`);
    }
  } finally {
    isFetching = false;
  }
}

// 获取榜单数据 (优先缓存, 过期或无缓存则触发拉取)
async function getLists() {
  if (CACHED_LISTS && Date.now() - LAST_FETCH_TIME < CACHE_TTL) {
    return CACHED_LISTS;
  }
  await refreshAll();
  return CACHED_LISTS || [];
}

// 获取单个榜单详情
async function getDetail(id) {
  const all = await getLists();
  return all.find((x) => x.id === id || x.listid === id) || null;
}

module.exports = { RANKS, getLists, getDetail, refreshAll };
