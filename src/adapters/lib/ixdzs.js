'use strict';
// 爱下电子书 (ixdzs8.com) 专属正文抓取。
// 站点对章节页做了一次"浏览器验证"挑战: 首次请求返回 <script>let token="..."; location=?challenge=token</script>,
// 带该 token 重新请求同一路径即得真实章节页 (正文在 <article> 内)。
// 纯属 cookie/token 握手, 非 JS 计算, 可服务端复现。
const { request } = require('../../lib/http');
const { cheerio } = require('../../lib/rule');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function build({ chapter }) {
  const url = chapter.url;
  const headers = { 'User-Agent': UA, Referer: 'https://ixdzs8.com/' };

  const first = await request(url, { headers });
  const m = first.text.match(/let\s+token\s*=\s*"([^"]+)"/);
  if (!m) {
    // 未触发挑战, 直接解析
    const $ = cheerio.load(first.text);
    const t = ($('article').first().text() || '').trim();
    if (t) return t;
    throw new Error('ixdzs: 未取到正文 (既无挑战也无 article)');
  }

  // challenge token 与本会话绑定: 必须把步骤1 下发的 cookie 带到步骤2, 否则 302 回挑战页
  const raw = (typeof first.headers.getSetCookie === 'function' ? first.headers.getSetCookie() : [first.headers.get('set-cookie') || '']).join('; ');
  const cookie = raw.split(/,\s*/).map((s) => (s.match(/^([^=;]+=[^;]+)/) || [])[1]).filter(Boolean).join('; ');

  const sep = url.includes('?') ? '&' : '?';
  const h2 = { ...headers, ...(cookie ? { Cookie: cookie } : {}) };
  const real = (await request(url + sep + 'challenge=' + encodeURIComponent(m[1]), { headers: h2 })).text;
  const $ = cheerio.load(real);
  const text = ($('article').first().text() || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('ixdzs: challenge 后仍未取到正文');
  return text;
}

module.exports = { build };
