'use strict';
// 首页书单种子数据 (取自公开页面样本, 用于本地复刻展示)
// 契约: 与 api/get_jj_booklists / api/get_random_booklists 返回的 booklist 结构一致
const jjBooklists = [
  {
    "id": "jj_649686",
    "title": "偏攻",
    "description": "萌攻酷攻强苏攻，??玩攻",
    "book_count": 1,
    "like_count": 4,
    "view_count": 0,
    "comment_count": 0,
    "books": [
      {
        "book_title": "攻略主角？小狗主播手拿把掐！",
        "book_cover": "https://i9-static.jjwxc.net/tmp/backend/authorspace/s1/65/64656/6465512/20250421203357_300_420.jpg",
        "author_name": "糖粒小丸"
      }
    ],
    "is_jj": true,
    "listid": "649686",
    "level": "B",
    "categories": [],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_200831",
    "title": "求主攻双强文",
    "description": "不要淡人攻，冷漠攻，不要一方当狗的。\n希望受强。可描述的，解决问题的能力强，智商高（非单一的数值背景强，或者地位高，但其实没啥用）不要背景板受\n比如贺海楼，庚衍，应潮盛",
    "book_count": 1,
    "like_count": 0,
    "view_count": 0,
    "comment_count": 0,
    "books": [
      {
        "book_title": "谋情游戏",
        "book_cover": "https://v.uuu.ovh/imgs/2025/04/12/cc29cb5668805208.jpg",
        "author_name": "成明青"
      }
    ],
    "is_jj": true,
    "listid": "200831",
    "level": "",
    "categories": [],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_602380",
    "title": "gb女主妈扫文中｜推文&排雷",
    "description": "雷点男非/女宠男/作精男飞舞男矫情男等等，特别讨厌女主扶贫，偏好萌妹1大小姐1，少量女尊/bg",
    "book_count": 2,
    "like_count": 178,
    "view_count": 0,
    "comment_count": 0,
    "books": [
      {
        "book_title": "被怪物女友抛弃后[gb]",
        "book_cover": "https://i0-static.jjwxc.net/tmp/backend/authorspace/s1/44/43106/4310563/20260913012018_300_420.jpeg",
        "author_name": "又逢年"
      },
      {
        "book_title": "虐文使我超强",
        "book_cover": "https://i5-static.jjwxc.net/tmp/backend/authorspace/s1/19/18607/1860605/20210607143211_300_420.jpg",
        "author_name": "公子永安"
      }
    ],
    "is_jj": true,
    "listid": "602380",
    "level": "B",
    "categories": [
      "言情 36"
    ],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_330789",
    "title": "无cp爽文",
    "description": "爽文/苏主角",
    "book_count": 1,
    "like_count": 82,
    "view_count": 0,
    "comment_count": 0,
    "books": [
      {
        "book_title": "七零之从高考开始",
        "book_cover": "https://i3-static.jjwxc.net/tmp/backend/authorspace/s1/7/6825/682440/20240402203817_300_420.jpg",
        "author_name": "远上天山"
      }
    ],
    "is_jj": true,
    "listid": "330789",
    "level": "A",
    "categories": [
      "无CP 42",
      "言情 1"
    ],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_649751",
    "title": "bg",
    "description": "我的爱妃们",
    "book_count": 1,
    "like_count": 0,
    "view_count": 0,
    "comment_count": 0,
    "books": [
      {
        "book_title": "如何阻止男主发疯",
        "book_cover": "https://i7-static.jjwxc.net/authorimagespace.php?path=MTAyMDM0Mg==&imageName=20250930190239.jpg",
        "author_name": "爆炒小黄瓜"
      }
    ],
    "is_jj": true,
    "listid": "649751",
    "level": "A",
    "categories": [],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_649719",
    "title": "你知道从天黑等到天亮的滋味吗？",
    "description": "神级免费文，不解释！很多缘更和坑，快跳进来！（在坑底注视……）",
    "book_count": 2,
    "like_count": 0,
    "view_count": 0,
    "comment_count": 0,
    "books": [
      {
        "book_title": "欢迎来到噩梦游戏",
        "book_cover": "https://i9-static.jjwxc.net/tmp/backend/authorspace/s1/4/3191/319052/20200716163715_300_420.jpg",
        "author_name": "薄暮冰轮"
      },
      {
        "book_title": "欢迎来到噩梦游戏Ⅱ",
        "book_cover": "https://i9-static.jjwxc.net/tmp/backend/authorspace/s1/4/3191/319052/20200716163714_300_420.jpg",
        "author_name": "薄暮冰轮"
      }
    ],
    "is_jj": true,
    "listid": "649719",
    "level": "A",
    "categories": [],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_200830",
    "title": "女主角姓景",
    "description": "先婚后爱",
    "book_count": 0,
    "like_count": 0,
    "view_count": 0,
    "comment_count": 0,
    "books": [],
    "is_jj": true,
    "listid": "200830",
    "level": "",
    "categories": [],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_649760",
    "title": "攻控自留地",
    "description": "坚决不吃泥受凝受，有的文太久了可能有小雷，都是全订看完的",
    "book_count": 2,
    "like_count": 0,
    "view_count": 0,
    "comment_count": 0,
    "books": [
      {
        "book_title": "顶流男主怎么爱上我了",
        "book_cover": "https://i9-static.jjwxc.net/tmp/backend/authorspace/s1/54/53314/5331358/20240903190508_300_420.jpeg",
        "author_name": "安则"
      },
      {
        "book_title": "开局送你一个富二代",
        "book_cover": "https://i9-static.jjwxc.net/tmp/backend/authorspace/s1/23/22263/2226240/20200422191800_300_420.jpg",
        "author_name": "似李"
      }
    ],
    "is_jj": true,
    "listid": "649760",
    "level": "B",
    "categories": [],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_649660",
    "title": "个人喜欢的bg",
    "description": "应该大部分是背景板男主，讨厌男主抢女主高光",
    "book_count": 2,
    "like_count": 10,
    "view_count": 0,
    "comment_count": 0,
    "books": [
      {
        "book_title": "让我寄生一下怎么了？",
        "book_cover": "https://i1-static.jjwxc.net/tmp/backend/authorspace/s1/57/56985/5698404/20241106015941_300_420.jpeg",
        "author_name": "别山去"
      },
      {
        "book_title": "为夫曾是龙傲天",
        "book_cover": "https://i9-static.jjwxc.net/tmp/backend/authorspace/s1/20/19519/1951880/20210216204320_300_420.jpg",
        "author_name": "墨书白"
      }
    ],
    "is_jj": true,
    "listid": "649660",
    "level": "B",
    "categories": [],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  },
  {
    "id": "jj_200832",
    "title": "找一本末世灵气复苏文，求求了",
    "description": "我记得文案是女主重生惠到世界毁灭之前，她的能力是只要有人相信就能设定成功，在国家的帮助下，最后设定灵气复苏还是全民修仙。拜托了帮我找找，真的很喜欢这个设定",
    "book_count": 0,
    "like_count": 0,
    "view_count": 0,
    "comment_count": 0,
    "books": [],
    "is_jj": true,
    "listid": "200832",
    "level": "",
    "categories": [],
    "nickname": "晋江",
    "avatar": "https://m-static.jjwxc.net/images/wap/logo2.png"
  }
];

// 本地书单样本 (random/featured/recommended 共用结构)
const localBooklists = [];

module.exports = { jjBooklists, localBooklists };
