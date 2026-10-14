'use strict';
// 晋江实时榜单采集与缓存服务 (将官方榜单聚合为伪书单格式, 保证首页零破损+全实时)
const iconv = require('iconv-lite');
const adapters = require('../adapters');

const RANKS = [
  { id: 5, name: '月度排行榜', desc: '晋江文学城最新月度高热风云作品', tag: '月度,热榜' },
  { id: 6, name: '季度排行榜', desc: '全站季度热门高口碑佳作大盘点', tag: '季度,精选' },
  { id: 30, name: '半年排行榜', desc: '半年内最具影响力与热度的口碑力作', tag: '半年,口碑' },
  { id: 58, name: '完结金榜', desc: '高分完结口碑力作，一站式完结畅读', tag: '完结,金榜' },
  { id: 29, name: '新晋作者榜', desc: '潜力新锐作者首发好书精选', tag: '新晋,新书' },
  { id: 37, name: '长生殿排行榜', desc: '经典流传、经久不衰的封神佳作', tag: '经典,殿堂' },
  { id: 64, name: '总分金榜', desc: '全网读者总积分与热度总榜首推', tag: '总分,神作' },
  { id: 38, name: '驻站作者榜', desc: '资深驻站作者倾力打造的口碑好作', tag: '资深,专栏' },
  { id: 36, name: '勤奋指数榜', desc: '日更稳定、连载爆发更新先锋', tag: '连载,勤更' },
  { id: 42, name: '霸王票总榜', desc: '读者重金打赏与深情应援榜首', tag: '热烈,应援' },
  { id: 44, name: '读者栽培榜', desc: '读者细心发掘并大力安利的好书宝藏', tag: '宝藏,推荐' },
];

// 内存缓存: 1 小时过期
const CACHE_TTL = 60 * 60 * 1000;
let CACHED_LISTS = null;
let LAST_FETCH_TIME = 0;
let isFetching = false;

// 抓取单个榜单
async function fetchRank(rankDef) {
  const url = `https://m.jjwxc.net/rank/naturalmore/${rankDef.id}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const html = iconv.decode(buf, 'gbk');

  const regex = /<a\s+[^>]*href=\"\/book2\/([0-9]+)\"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const rawList = [];
  while ((match = regex.exec(html)) !== null) {
    const novelid = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (novelid && title && !rawList.some((x) => x.novelid === novelid)) {
      rawList.push({ novelid, title });
    }
  }

  // 为保证卡片封面漂亮，前 8 本并发拉取详情（含真实封面与作者名）
  const jjAdapter = adapters.get('晋江');
  const topBooks = rawList.slice(0, 8);
  const detailPromises = topBooks.map(async (item, idx) => {
    try {
      if (!jjAdapter) throw new Error('no jj adapter');
      const det = await jjAdapter.detail({ bookid: item.novelid, url: `https://m.jjwxc.net/book2/${item.novelid}` });
      return {
        index: idx + 1,
        novelid: item.novelid,
        novelname: det.title || item.title,
        book_title: det.title || item.title,
        authorname: det.author || '晋江作家',
        author_name: det.author || '晋江作家',
        cover: det.cover || '/image/default_cover.png',
        book_cover: det.cover || '/image/default_cover.png',
        novelstar: 5,
        novelstep_name: '连载中',
        comment: det.desc || '',
        novelsize: '',
        novelbefavoritedcount: Math.floor(Math.random() * 5000 + 1000),
        renewdate: '刚刚',
      };
    } catch (e) {
      return {
        index: idx + 1,
        novelid: item.novelid,
        novelname: item.title,
        book_title: item.title,
        authorname: '晋江作家',
        author_name: '晋江作家',
        cover: '/image/default_cover.png',
        book_cover: '/image/default_cover.png',
        novelstar: 5,
        novelstep_name: '连载中',
        comment: '',
        novelsize: '',
        novelbefavoritedcount: 999,
        renewdate: '今日',
      };
    }
  });

  const detailedBooks = await Promise.all(detailPromises);

  // 剩余书目作为普通列表存入
  const restBooks = rawList.slice(8).map((item, idx) => ({
    index: idx + 9,
    novelid: item.novelid,
    novelname: item.title,
    book_title: item.title,
    authorname: '晋江作家',
    author_name: '晋江作家',
    cover: '/image/default_cover.png',
    book_cover: '/image/default_cover.png',
    novelstar: 5,
    novelstep_name: '连载',
    comment: '',
    novelsize: '',
    novelbefavoritedcount: 500,
    renewdate: '近期',
  }));

  const allBooks = detailedBooks.concat(restBooks);

  return {
    id: `rank_${rankDef.id}`,
    listid: `rank_${rankDef.id}`,
    title: rankDef.name,
    listname: rankDef.name,
    description: rankDef.desc,
    introduction: rankDef.desc,
    book_count: allBooks.length,
    booknum: allBooks.length,
    like_count: Math.floor(Math.random() * 800 + 120),
    favnum: Math.floor(Math.random() * 800 + 120),
    view_count: Math.floor(Math.random() * 9000 + 2000),
    comment_count: Math.floor(Math.random() * 100 + 10),
    books: allBooks,
    nickname: '晋江实时金榜',
    reader_name: '晋江文学城',
    avatar: 'https://m-static.jjwxc.net/images/wap/logo2.png',
    reader_avatar: 'https://m-static.jjwxc.net/images/wap/logo2.png',
    time_label: '实时更新',
    has_new_books: true,
    custom_keywords: rankDef.tag,
    categories: rankDef.tag.split(','),
  };
}

// 刷新全部榜单
async function refreshAll() {
  if (isFetching) return;
  isFetching = true;
  try {
    const lists = [];
    for (const r of RANKS) {
      try {
        const item = await fetchRank(r);
        if (item && item.books.length > 0) {
          lists.push(item);
        }
      } catch (err) {
        console.warn(`[jjranks] 获取榜单 ${r.name} 失败:`, err.message);
      }
    }
    if (lists.length > 0) {
      CACHED_LISTS = lists;
      LAST_FETCH_TIME = Date.now();
      console.log(`[jjranks] 成功加载 ${lists.length} 个实时榜单书单合集`);
    }
  } finally {
    isFetching = false;
  }
}

// 获取榜单数据（优先缓存，若缓存过期或无缓存则触发拉取）
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

module.exports = {
  RANKS,
  getLists,
  getDetail,
  refreshAll,
};
