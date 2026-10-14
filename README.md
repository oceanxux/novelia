# 自留地聚合 · 后端 (Node.js)

自建聚合书源后端: 把多个书源适配器聚合成统一 API, 并对外导出一个标准 Legado 书源 (`/book_source.json`)。

前端页面与 API 同源, 导入书源后即可端到端跑通。

## 运行

### 本地

```bash
npm install
# 可选: 自定义用户 (JSON), 默认 demo@local / demo123456
SEED_USERS='[{"email":"me@x.com","password":"pass123","api_key":"MyKey0000000000"}]' \
  PORT=7001 node src/index.js
```

启动后监听 `:7001`。

### Docker

```bash
docker compose up -d --build
```

镜像基于 `node:20-alpine` (无原生依赖, 无需编译工具链), 以非 root 用户运行。
运行时数据持久化在 `./data`, 上传头像在 `./public/uploads`, 不随容器重建丢失。

也可用预构建镜像 (CI 推送到 GHCR):

```bash
docker run -d -p 7001:7001 -v "$PWD/data:/app/data" \
  ghcr.io/<owner>/<repo>:latest
```

环境变量: `PORT` (默认 7001)、`DATA_DIR` (默认 `./data`)、`SEED_USERS`、`ADMIN_PATH` (后台路径, 默认 `/admin`)、`ADMIN_USER` / `ADMIN_PASS` (初始管理员, 默认 `admin` / `admin123`)。

## 管理后台

后台 (书源管理 + 账户/兑换码管理) 默认在 `/admin`, **所有后台 API 均需登录**。

- **改后台路径 (安全)**: 设 `ADMIN_PATH=/my-panel-8x2` 即可把后台挪到任意难猜路径, 页面内链接与 API 调用自动跟随; 原 `/admin` 返回 404。
- **初始管理员**: 首次启动 (无 `data/admins.json`) 用 `ADMIN_USER`/`ADMIN_PASS` 创建 (默认 `admin` / `admin123`), 该账户**首次登录强制改密** (至少 8 位, 含字母和数字), 改密前无法使用任何后台功能。
- **忘记新密码**: 删除 `data/admins.json` 后重启, 即回到初始账户。

```bash
# 本地
ADMIN_PATH=/my-panel-8x2 ADMIN_PASS='换成强密码' PORT=7001 node src/index.js
```

```yaml
# docker-compose.yml
environment:
  ADMIN_PATH: "/my-panel-8x2"
  ADMIN_PASS: "换成强密码"
```

> 后台路径是可配置的隐藏入口, 不是访问控制; 真正的防线是登录鉴权 + 强制改密。

## 端点

| 端点 | 方法 | 鉴权 | 响应包裹 |
|------|------|------|---------|
| `/search` | GET | 否 | `{isSuccess,error,data,cached_at}` |
| `/details` | POST | 否 | `{code,message,data}` |
| `/detail?book_id=` | GET | 否 | `{code,message,data}` |
| `/catalog` | POST | 否 | `{code,message,data}` |
| `/content` | POST | **是** | `{code,message,data}` |
| `/login` | POST | 否 | `{success,code,data}` |
| `/version` `/api/get_config` `/sources` | GET | 否 | - |
| `{ADMIN_PATH}/api/auth/*` | POST/GET | 见下 | `{code,message,...}` |
| `{ADMIN_PATH}/api/sources` `.../accounts` `.../codes` `.../test` | - | **是** | `{data}` / `{ok}` |

`/content` 需请求头 `X-Api-Key` = `base64(api_key)`。
后台 API 需请求头 `X-Admin-Token` (登录后签发), 详见 [管理后台](#管理后台)。

聚合书源 (Legado 用): `/book_source.json`、`/api/bs/search`、`/api/bs/detail`、`/api/bs/content` (host 由请求头动态推导)。

## 已实现适配器 (12 个)

| source | 站点 | 类型 | 说明 |
|--------|------|------|------|
| `新御书屋` | qianyew.com 桌面站 | 定制 | 伪装爬虫 UA 绕过 challenge; 无需登录 |
| `番茄小说` | fanqienovel.com | 定制 | 分卷目录 + 章节接口 |
| `晋江` | jjwxc.net | 定制 | GBK 搜索; 匿名仅免费章, VIP 章需登录 |
| `全本` | qb5.io | 声明式 | JSONP 目录钩子 |
| `得奇` | deqixss.com | 声明式 | 两步签名取文钩子 |
| `爱下` | ixdzs8.com | 声明式 | challenge 握手钩子 |
| `看书网` | kanshuw.com | 声明式 | 内联正文 + 分页 |
| `星星` | xxtxt.com | 声明式 | 同看书网 CMS |
| `穿越小说` | kk169.la | 声明式 | 换目录页钩子 |
| `错层` | m.cuoceng.com | 声明式 | 目录分页 + 限流重试钩子 |
| `半夏` | xbanxia.cc | 声明式 | Cloudflare 挑战; POST 搜索 |
| `茶马` | chamabooks.net | 声明式 | Cloudflare 挑战; 详情页即首章 |

> 以上均为直连上游站点的独立实现。

> **Cloudflare 挑战源 (半夏 / 茶马)**: 依赖可选包 `patchright` 与本机已安装的 Chrome。
> 站点在 CF 的 JS 挑战后纯 HTTP 拿不到内容, 由 `src/lib/cfsession.js` 用 patchright 驱动
> 系统 Chrome 过一次挑战, 提取 `cf_clearance` + UA 按 host 缓存复用 (TTL 25 分钟);
> 仅首次 / 过期时开一次浏览器, 之后同 IP 的纯 HTTP 请求即被放行。
> 未安装 patchright 或系统无 Chrome 时, 这两个源会明确抛错, 不影响其他源。
> 浏览器 profile 目录可用 `CF_PROFILE` 环境变量覆盖 (默认 `$TMPDIR/zld-cf-profile`)。
>
> 无头启动时 UA 会带 `HeadlessChrome` 标记, CF 据此直接判定为机器人, 挑战永远过不去;
> 故启动前先探测本机 Chrome 真实版本, 用去掉该标记的同版本 UA 运行 (UA 版本必须与
> 浏览器一致, 否则会因指纹不符被拒)。若站点回吐 `http://` 绝对链接而自身是 `https`,
> 引擎会把同域链接升到 `https`, 否则 cf_clearance 不生效。

## 新增适配器

### 声明式 (大多数公开 HTML 站)

往 `src/adapters/sources.js` 加一项配置即可, 无需写代码:

```js
{
  name: '源站名', base: 'https://site.com',
  headers: { Referer: 'https://site.com/' },
  search: { request: { url: '/search?q={{key}}&p={{page}}' }, list: 'dl', fields: { title: 'h3 a@text', bookUrl: 'h3 a@href' } },
  detail: { fields: { title: 'h1@text', author: '...', desc: '...' } },
  catalog: { list: 'ul.list li', title: 'a@text', url: 'a@href' },
  content: { content: '#content@text' },
}
```

自动生成配置:

```bash
node tools/gen_source.js <网址>          # 丢网址, 自动探测选择器
node tools/gen_source.js <url1> <url2>   # 一次多个
```

详见 `tools/local/书源编写技术文档.md` §九、§十 (本地文档, 不入库)。

### 定制模块 (反爬/加密站)

在 `src/adapters/` 写模块, 实现 `{ name, search, detail, catalog, content }`:

```js
module.exports = {
  name: '源站名',
  async search(keyword, page) { return [Book, ...] },
  async detail({ url, bookid }) { return Book },
  async catalog({ url, bookid }) { return [Chapter, ...] },
  async content(chapterParams) { return { content, source, tab, notice } },
};
```

在 `src/adapters/index.js` 注册。

**Book 字段**: `title author cover desc tags wordCount latestChapterTitle source tab book_url bookid`
**Chapter 字段**: `title url cid tag isVolume isVip isPay`

## 测试

```bash
# 起服务 (端口与种子用户须匹配测试脚本)
PORT=7099 DATA_DIR="$TMPDIR/agg7099" \
  SEED_USERS='[{"email":"demo@local","password":"demo123456","api_key":"DemoKey12345678"}]' \
  node src/index.js &

node test/smoke.js   # 全源全链路 + 边界 (自动覆盖新源)
node test/e2e.js     # 前端 data-URI 契约链路
```

`smoke.js` 遍历 `adapters.list()` 逐源跑 `search → details → catalog → content`; `e2e.js` 模拟前端 `ruleSearch.bookUrl` / `ruleBookInfo.tocUrl` / `buildChapterUrl` 的 data-URI 编解码全链路。

## 书源导入

1. 启动服务后访问 `/book_source.json`, 得到标准 Legado 书源 JSON (host 由请求头动态推导)。
2. 在阅读 3.0 中导入该 JSON 即可搜索与阅读。

## 结构

```
src/
├── index.js              # Express 入口
├── lib/
│   ├── rule.js           # Legado 规则求值引擎 (cheerio)
│   ├── http.js           # HTTP 客户端 (UA/GBK/超时/重试)
│   ├── datari.js         # data-URI 协议编解码
│   ├── bookpool.js       # 跨源聚合搜索
│   └── admins.js         # 后台管理员 (scrypt 哈希 + 会话)
├── adapters/
│   ├── index.js          # 注册表 (定制模块优先, 声明式兜底)
│   ├── sources.js        # 声明式源配置表
│   ├── generic.js        # 声明式引擎
│   └── lib/              # 站点专属钩子 (目录/正文)
├── middleware/
│   ├── auth.js           # 前台 API 鉴权 (X-Api-Key)
│   └── adminauth.js      # 后台鉴权 (X-Admin-Token + 强制改密)
└── routes/               # search/detail/catalog/content/admin/adminauth/...
tools/gen_source.js       # 书源配置生成器
test/                     # smoke + e2e
```
