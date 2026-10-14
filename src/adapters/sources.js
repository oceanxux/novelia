'use strict';
// 声明式源配置表。每个源一份配置, 由 generic.js 引擎实例化为适配器。
// 加源 = 在此加一项, 无需写代码。

module.exports = [
  {
    name: '全本',
    base: 'https://www.qb5.io',
    headers: { Referer: 'https://www.qb5.io/' },
    // 搜索给 /xs-1.html, 详情/目录在 /xs-1/
    bookUrlTransform: "url.replace(/\\/xs-(\\d+)\\.html$/, '/xs-$1/')",
    search: {
      request: { url: '/?c=xs&a=sou&q={{key}}&page={{page}}' },
      list: 'dl.hot dd',
      fields: {
        title: 'h4 a@text',
        author: 'p:eq(0) span@text',
        bookUrl: 'h4 a@href',
        cover: 'img@src',
        desc: 'p:eq(1)@text',
      },
    },
    detail: {
      fields: {
        title: 'h1@text',
        author: '.book p:eq(0) span@text',
        cover: '.book img@src',
        desc: '.description p@text',
        tags: '.book p:eq(1) span@text',
        latestChapterTitle: '.list ul.list li:last-child a@text',
      },
    },
    // 目录被 load_more() 截断: 详情页只给首尾两段, 完整列表走 JSONP (见 lib/qb5.js)
    catalog: { build: require('./lib/qb5').build },
    content: { content: '#content@html' },
  },
  {
    name: '得奇',
    base: 'https://www.deqixss.com',
    headers: { Referer: 'https://www.deqixss.com/' },
    search: {
      request: { url: '/modules/article/search.php?searchkey={{key}}&page={{page}}' },
      list: '.bookbox',
      fields: {
        title: 'h4.bookname a@text',
        author: '.author:eq(0)@text##^作者[：:]\\s*##',
        bookUrl: 'h4.bookname a@href',
        desc: '.update@text##^简介[：:]\\s*##',
      },
    },
    detail: {
      fields: {
        title: 'h1.booktitle@text',
        author: '.booktag a:eq(0)@text',
        cover: '.thumbnail@src',
        desc: 'p.bookintro@text',
      },
    },
    // 详情页有两个目录块: dl.chapterlist 混了"最新章节"倒序预览+全目录; #list-chapterAll 是纯正序全目录
    catalog: { list: '#list-chapterAll dd', title: 'a@text', url: 'a@href' },
    // 正文走两步签名接口 (chapter.js.php 取 token -> ajax2.php 取文), 见 lib/deqix.js
    content: { build: require('./lib/deqix').build },
  },
  {
    name: '爱下',
    base: 'https://ixdzs8.com',
    headers: { Referer: 'https://ixdzs8.com/' },
    search: {
      request: { url: '/bsearch?q={{key}}&p={{page}}' },
      list: 'ul.u-list > li.burl',
      fields: {
        title: '.bname a@text',
        author: '.bauthor a@text',
        bookUrl: '.bname a@href',
        cover: '.l-img img@src',
        desc: '.l-p2@text',
        latestChapterTitle: '.l-chapter@text',
      },
    },
    detail: {
      fields: {
        title: 'h1@text',
        author: '.n-text a[href*=/author/]@text',
        cover: '.n-img img@src',
        desc: '#intro@text',
      },
    },
    // #a-list 是正序全目录 (u-chapter 折叠但 DOM 完整)
    catalog: { list: '#a-list ul.u-chapter li', title: 'a@text', url: 'a@href' },
    // 章节页有浏览器验证挑战 (?challenge=token 握手), 见 lib/ixdzs.js
    content: { build: require('./lib/ixdzs').build },
  },
  {
    name: '看书网',
    base: 'https://www.kanshuw.com',
    headers: { Referer: 'https://www.kanshuw.com/' },
    search: {
      request: { url: '/search.php?q={{key}}&p={{page}}' },
      list: 'dl',
      fields: {
        title: 'h3 a@text',
        bookUrl: 'h3 a@href',
        cover: 'img@src',
        author: '.book_other span@text',
        desc: 'dd:eq(2)@text',
      },
    },
    detail: {
      fields: {
        title: 'h1@text',
        author: 'li:contains(作者) a@text',
        desc: '.intro@text##^简介[：:]\\s*##',
      },
    },
    catalog: { list: 'div.book_list2 li', title: 'a@text', url: 'a@href' },
    // 正文分页: /13/13477/284791.html -> _2.html -> _3.html, 末页 next 非 _N 形式时清空停止
    content: {
      content: 'article@text##第\\(\\d+\\/\\d+\\)页##',
      next: 'a#next1@href##^(?!.*_\\d+\\.html$).*$##',
    },
  },
  {
    name: '星星',
    base: 'https://www.xxtxt.com',
    headers: { Referer: 'https://www.xxtxt.com/' },
    search: {
      request: { url: '/search.php?q={{key}}&p={{page}}' },
      list: 'dl',
      fields: {
        title: 'h3 a@text',
        bookUrl: 'h3 a@href',
        cover: 'img@src',
        author: '.book_other span@text',
        desc: 'dd:eq(2)@text',
      },
    },
    detail: {
      fields: {
        title: 'h1@text',
        author: 'li:contains(作者) a@text',
        desc: '.intro@text##^简介[：:]\\s*##',
      },
    },
    catalog: { list: 'div.book_list2 li', title: 'a@text', url: 'a@href' },
    content: {
      content: 'article@text##第\\(\\d+\\/\\d+\\)页##',
      next: 'a#next1@href##^(?!.*_\\d+\\.html$).*$##',
    },
  },
  {
    name: '穿越小说',
    base: 'http://www.kk169.la',
    headers: { Referer: 'http://www.kk169.la/' },
    search: {
      // 搜索必须 POST 且参数名是 q (GET/其它名返回 0 结果)
      request: { method: 'POST', url: '/modules/article/search.php', body: 'q={{key}}' },
      list: 'div.c_row',
      fields: {
        title: 'span.c_subject a@text',
        bookUrl: 'span.c_subject a@href',
        cover: '.fl img@src',
        author: '.c_tag .c_value:eq(0)@text',
        desc: '.c_description@text',
        latestChapterTitle: '.c_tag .c_value a@text',
      },
    },
    detail: {
      fields: {
        title: 'span[style*="font-size:20px"]@text',
        author: 'span:contains(作者) a@text',
        cover: 'img[src*=/article/image/]@src',
        desc: '.tabvalue@text',
      },
    },
    // 详情页不含完整目录, 目录在同书号 /html/{a}/{b}/ 的 ul.chapters; 正文 #acontent 需剥离噪声, 见 lib/kk169.js
    catalog: { build: require('./lib/kk169').build },
    content: { build: require('./lib/kk169').contentBuild },
  },
  {
    name: '错层',
    base: 'https://m.cuoceng.com',
    headers: { Referer: 'https://m.cuoceng.com/' },
    search: {
      // 搜索走路径段 /book/so/{kw}.html (带 .html 后缀; ?searchkey= 返 401)
      request: { url: '/book/so/{{key}}.html' },
      list: 'div.bookbox',
      fields: {
        title: 'h2.bookname a@text',
        bookUrl: 'h2.bookname a@href',
        author: '.author:eq(0)@text##^作者[：:]\\s*##',
        desc: '.update@text##^简介[：:]\\s*##',
        latestChapterTitle: '.cat a@text',
      },
    },
    detail: {
      fields: {
        title: 'h1.booktitle@text',
        author: '.booktag a:eq(0)@text',
        cover: 'img[src*=/bookCover/]@src',
        desc: '.bookintro@text',
      },
    },
    // 详情页只有"最新章节"预览, 完整目录在同书号 /book/chapter/{uuid}.html, 见 lib/cuoceng.js
    catalog: { build: require('./lib/cuoceng').build },
    content: { content: '#content@text' },
  },
  {
    name: '半夏',
    base: 'https://www.xbanxia.cc',
    cf: true,   // Cloudflare 挑战站: 由 lib/cfsession.js 取 cf_clearance 复用
    headers: { Referer: 'https://www.xbanxia.cc/' },
    search: {
      // 搜索为 POST, 参数名 searchkey
      request: { method: 'POST', url: '/modules/article/search_t.php', body: 'searchkey={{key}}' },
      list: 'li.pop-book2',
      fields: {
        title: 'h2.pop-tit@text',
        bookUrl: 'a:eq(1)@href',
        cover: 'img@data-original',
        author: '.pop-intro@text',
      },
    },
    detail: {
      fields: {
        title: '.book-describe h1@text',
        author: '.book-describe p:eq(0) a@text',
        cover: '.book-img img@data-original',
        desc: '.book-describe p:eq(6)@text',
        tags: '.book-describe p:eq(1)@text##^類型[：:︰]\\s*##',
        latestChapterTitle: '.book-describe p:eq(4) a@text',
      },
    },
    // 详情页 #content-list .book-list 内 ul 为完整正序目录
    catalog: { list: '#content-list .book-list ul li', title: 'a@text', url: 'a@href' },
    // 正文在 #nr1
    content: { content: '#nr1@text' },
  },
  {
    name: '茶马',
    base: 'https://www.chamabooks.net',
    cf: true,   // Cloudflare 挑战站
    headers: { Referer: 'https://www.chamabooks.net/' },
    search: {
      request: { url: '/search?s={{key}}' },
      list: '.novel-item',
      fields: {
        title: '.novel-subject a@text',
        bookUrl: '.novel-subject a@href',
        author: '.novel-misc .misc-value a@text',
        desc: '.novel-desc@text',
      },
    },
    detail: {
      fields: {
        title: '#novel-header h1@text##《(.*?)》.*##$1',
        author: '#novel-header h1 a@text##^作者[：:]\\s*##',
        cover: '#novel-header img@src',
        desc: '.novel-summary-content@text',
        tags: '.novel-subheader .category@text',
        wordCount: '.novel-subheader .misc-value:eq(1)@text',
      },
    },
    // 详情页 = 第 1 章页; 目录在 select.pg-sel option, 正文在 #novel-content, 见 lib/chama.js
    catalog: { build: require('./lib/chama').build },
    content: { build: require('./lib/chama').contentBuild },
  },
];
