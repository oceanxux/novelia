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
    // 真实分类页 (列表结构与搜索页同构, 复用 search.fields)
    browse: {
      url: '/shuku-{{key}}.html',
      pageUrl: '/shuku-{{key}}-{{page}}.html',
      list: 'dl.hot dd',
      categories: {
        奇幻玄幻: '1', 武侠仙侠: '2', 都市官场: '3', 历史军事: '4',
        言情穿越: '5', 灵异悬疑: '6', 游戏竞技: '7', 青春耽美: '8',
        科幻同人: '9', 经典畅销: '10', 图书杂志: '11', 其它分类: '0',
      },
    },
  },
  {
    name: '得奇',
    base: 'https://www.deqixss.com',
    headers: { Referer: 'https://www.deqixss.com/' },
    search: {
      request: { url: '/modules/article/search.php?searchkey={{key}}&page={{page}}' },
      list: '.bookbox',
      // 命中唯一结果时站点 302 到详情页, .bookbox 落空, 改用 detail 选择器解析
      singleAsDetail: true,
      singleUrlRule: 'link[rel=canonical]@href',
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
    // 真实分类页 /sort/{id}/{page}.html, 列表结构与搜索页同构
    browse: {
      url: '/sort/{{key}}/1.html',
      pageUrl: '/sort/{{key}}/{{page}}.html',
      list: '.bookbox',
      categories: {
        玄幻小说: '1', 都市小说: '2', 仙侠小说: '3', 历史小说: '4', 科幻小说: '5',
        诸天无限: '6', 悬疑小说: '7', 体育小说: '8', 游戏小说: '9', 综合其他: '10',
        书库: '0',
      },
    },
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
    // 真实分类页 /sort/{id}/, 翻页 index-0-0-0-{page}.html; 列表结构与搜索页同构
    browse: {
      url: '/sort/{{key}}/',
      pageUrl: '/sort/{{key}}/index-0-0-0-{{page}}.html',
      list: 'ul.u-list > li.burl',
      categories: {
        分类: '1', 修真仙侠: '2', 都市青春: '3', 军事历史: '4', 网游竞技: '5',
        科幻灵异: '6', 言情穿越: '7', 耽美同人: '8', 台言古言: '9',
        武侠小说: '10', 其他小说: '0',
        // 站内无「玄幻」类目, 就近映射到修真仙侠 (避免退化成关键词检索)
        玄幻: '2', 奇幻: '2', 仙侠: '2', 修真: '2',
      },
    },
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
    // 真实分类页 /list{id}/, 翻页 /list{id}/{page}.html; 列表结构与搜索页同构
    browse: {
      url: '/list{{key}}/',
      pageUrl: '/list{{key}}/{{page}}.html',
      list: 'dl',
      categories: {
        玄幻: '1', 武侠: '2', 都市: '3', 历史: '4',
        网游: '5', 科幻: '6', 言情: '7', 其他: '8',
      },
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
    // 真实分类页 (与看书网同构)
    browse: {
      url: '/list{{key}}/',
      pageUrl: '/list{{key}}/{{page}}.html',
      list: 'dl',
      categories: {
        玄幻: '1', 武侠: '2', 都市: '3', 历史: '4',
        网游: '5', 科幻: '6', 言情: '7', 其他: '8',
      },
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
    // 真实分类页 /book/sort{id}/0/{page}.html
    // 注意: 分类页书名容器是 div.c_subject, 与搜索页的 span.c_subject 不同, 故单独覆盖字段
    browse: {
      url: '/book/sort{{key}}/0/1.html',
      pageUrl: '/book/sort{{key}}/0/{{page}}.html',
      list: 'div.c_row',
      fields: {
        title: 'div.c_subject a:eq(1)@text',
        bookUrl: 'div.c_subject a:eq(1)@href',
        cover: '.fl img@src',
        author: '.c_tag .c_value:eq(0)@text',
      },
      categories: {
        玄幻魔法: '1', 武侠修真: '2', 都市言情: '3', 历史军事: '4', 穿越架空: '5',
        游戏竞技: '6', 经部: '11', 史部: '12', 子部: '13', 集部: '14', 古典名著: '16',
      },
    },
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
        // .booktag 内 a.red=作者, a.blue=分类链接(如 奇幻); span.blue 是字数/阅读量, 故只取 a.blue
        tags: '.booktag a.blue@text',
      },
    },
    // 详情页只有"最新章节"预览, 完整目录在同书号 /book/chapter/{uuid}.html, 见 lib/cuoceng.js
    catalog: { build: require('./lib/cuoceng').build },
    content: { content: '#content@text' },
    // 真实分类页 /book/category/{uuid}.html, 翻页 /book/category/{uuid}/{page}.html
    browse: {
      url: '/book/category/{{key}}.html',
      pageUrl: '/book/category/{{key}}/{{page}}.html',
      list: 'div.bookbox',
      categories: {
        仙侠: 'c91e0ef9-ad94-480e-a629-4cbddcdd1e3f',
        玄幻: '6b09b233-4d99-4f8f-aeb0-f9772e107d49',
        言情: 'ed26a15a-9704-459c-9098-532d5edb6b28',
        都市: '951b15a8-ba9f-4fbd-9790-6df513be5343',
        科幻: 'f7ba5880-1f1e-4938-adb6-ebf4b2217e24',
        悬疑: '5456c937-4501-4328-b3b9-c101249539ec',
        游戏: '5ebd2d1f-6efb-478a-b5f9-628aba9146f9',
        奇幻: 'c19ac87c-fad1-4924-8d9f-5d0d6445a62e',
        穿越: 'b96517a8-4171-455f-9cff-89aea91f52d6',
        军事: '322eb578-6830-4080-9c54-66a06869aa90',
        重生: 'c4f8bd09-5cfa-4098-b31f-a55528cda380',
        诸天无限: '8dcf411a-99c9-4348-a924-990474f67296',
        历史: 'fa7b085f-64ff-4763-a9b9-d0f4f8b98585',
      },
    },
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
    // 真实分类页 /list/{id}_1.html, 翻页 /list/{id}_{page}.html; 列表结构与搜索页同构
    browse: {
      url: '/list/{{key}}_1.html',
      pageUrl: '/list/{{key}}_{{page}}.html',
      list: 'li.pop-book2',
      categories: {
        耽美同人: '1', 男頻熱文: '2', 現代情感: '3', 古裝迷情: '4', 穿越重生: '5',
        其他言情: '6', 臺灣言情: '7', 網游科幻: '8', 恐怖推理: '9',
        仙俠言情: '10', 玄幻言情: '11', BG同人: '12',
        // 站内无对应类目时就近映射 (避免退化成关键词检索)
        都市: '3', 历史: '4', 玄幻: '11', 仙侠: '10', 科幻: '8', 悬疑: '9', 穿越: '5',
      },
    },
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
        tags: '.novel-misc .category@text',
        wordCount: '.novel-misc .misc-value:eq(1)@text',
      },
    },
    // 详情页 = 第 1 章页; 目录在 select.pg-sel option, 正文在 #novel-content, 见 lib/chama.js
    catalog: { build: require('./lib/chama').build },
    content: { build: require('./lib/chama').contentBuild },
    // 真实分类页 /main?c={id}, 翻页 /main?c={id}&p={page}; 列表结构与搜索页同构
    browse: {
      url: '/main?c={{key}}',
      pageUrl: '/main?c={{key}}&p={{page}}',
      list: '.novel-item',
      categories: {
        言情: '2', 耽美: '3', 百合: '4', 武侠: '5', 玄幻: '6',
        科幻: '7', 恐怖: '8', 推理: '9', 短篇: '12', 书单: '100',
        // 站内无对应类目时就近映射
        都市: '2', 历史: '5', 悬疑: '8', 穿越: '6',
      },
    },
  },
  {
    name: '书旗',
    base: 'https://www.shuqi.com',
    // WAF 按浏览器指纹拦 (403), 只放行爬虫 UA; 引擎默认给 Chrome UA, 此处显式覆盖。
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
      Referer: 'https://www.shuqi.com/',
    },
    search: {
      request: { url: '/search?keyword={{key}}&page={{page}}' },
      list: 'ul.clearfix > li',
      fields: {
        title: '.ellipsis@text',
        author: '.book-autor a@text##^作者[：:]\\s*##',
        bookUrl: '.ellipsis@href',
        cover: '.book-cover img@src',
        desc: '.book-newc@text',
      },
    },
    detail: {
      fields: {
        title: '.view-book-info-book-title-box .bname@text',
        author: '.bauthor a@text',
        cover: '.infoarea .view img.cover@src',
        desc: '.bookDesc@text',
        tags: '.tags li a@text',
      },
    },
    // 详情页只有首尾预览, 完整目录在 /chapter?bid={id}, 见 lib/shuqi.js
    catalog: { build: require('./lib/shuqi').build },
    // 正文走签名接口 + 自定义编码解码, 见 lib/shuqi.js
    content: { build: require('./lib/shuqi').contentBuild },
  },
];
