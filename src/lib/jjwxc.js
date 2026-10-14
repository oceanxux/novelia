'use strict';
// 晋江 (jjwxc.net) 集成模块: 扫码登录 + 段评 (章节段落评论)
//
// 登录链路 (两步, 全服务端可复现):
//   1) GET  android.jjwxc.com/.../Login/scanCodeLogin      -> 取 jjreader_key / device_key
//   2) POST android.jjwxc.com/.../Login/checkJjreaderLogin -> body 为 DES-CBC(Pkcs7) 密文
//      成功后返回 data.token, 形如 "<数字>_" (晋江阅读器凭证)
//   DES 密钥固定 (客户端内置), 用 crypto-js 复现 (node 内置 DES 在 OpenSSL 3 已移除)。
//
// 段评链路 (匿名可访问, 与登录无关):
//   GET  /app.jjwxc/Pc/comment/getNovelParagraphCommentNum?novelid=&chapterid=   -> 每段评论数
//   GET  /app.jjwxc/Pc/comment/getCommentList?novelId=&chapterId=&paragraph_id=&offset=&limit=
//   注意: 计数接口用小写参数, 列表接口用驼峰, 参数名大小写不通用。
//
// 段落编号 (paragraph_id) 为 1-based, 与章节正文按 <br><br> 切分后的段落一一对应。
const CryptoJS = require('crypto-js');
const { request } = require('./http');

const APP_HOST = 'https://android.jjwxc.com';
const PC_HOST = 'https://www.jjwxc.net';
const APP_HEADERS = { source: 'android', versiontype: 'reading', versioncode: '467', 'version-code': '467' };
const PC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Referer: PC_HOST + '/',
};
const VERSION_CODE = '467';

// 客户端内置 DES-CBC 密钥 (公开常量, 非用户密钥)
const DES_KEY = 'KW8Dvm2N';
const DES_IV = '1ae2c94b';

// CryptoJS 兼容的 DES-CBC/Pkcs7 加密, 输出 base64
function desEncrypt(plain) {
  const key = CryptoJS.enc.Utf8.parse(DES_KEY);
  const iv = CryptoJS.enc.Utf8.parse(DES_IV);
  return CryptoJS.DES.encrypt(plain, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString();
}

// 未设昵称的用户, 晋江用本章打分代替昵称 (如 "打分：-2"), 统一显示为「匿名读者」
function cleanAuthor(name) {
  const s = String(name || '').trim();
  if (!s || /^打分\s*[:：]/.test(s)) return '匿名读者';
  return s;
}

// 第一步: 申请扫码登录, 返回 { jjreader_key, device_key, qrUrl, use_notice, qr_code_notice }
async function createScanSession() {
  const r = await request(`${APP_HOST}/app.jjwxc/android/reading/Login/scanCodeLogin?versionCode=${VERSION_CODE}`, {
    headers: APP_HEADERS, timeout: 20000,
  });
  let json;
  try { json = JSON.parse(r.text); } catch (e) { throw new Error('扫码接口返回非 JSON: ' + r.text.slice(0, 120)); }
  const d = json.data;
  if (json.code !== '200' || !d || !d.jjreader_key) throw new Error('获取二维码失败: ' + (json.message || json.code));
  // 晋江 App 扫码实际跳转的地址 (二维码内容)
  const qrUrl = `https://www.jjwxc.net?action=scanCode&jjreader_key=${d.jjreader_key}&device_key=${d.device_key}`;
  return {
    jjreader_key: d.jjreader_key,
    device_key: d.device_key,
    qrUrl,
    use_notice: d.use_notice || '',
    qr_code_notice: d.qr_code_notice || '',
  };
}

// 第二步: 轮询扫码结果。成功返回 { ok:true, token }, 等待中返回 { ok:false, pending:true, message }
async function checkScanLogin({ jjreader_key, device_key }) {
  if (!jjreader_key || !device_key) throw new Error('缺少 jjreader_key/device_key');
  const body = desEncrypt(JSON.stringify({ versionCode: VERSION_CODE, jjreader_key, device_key }));
  const r = await request(`${APP_HOST}/app.jjwxc/android/reading/Login/checkJjreaderLogin`, {
    method: 'POST',
    headers: { ...APP_HEADERS, 'Content-Type': 'application/octet-stream' },
    body,
    timeout: 20000,
  });
  let json;
  try { json = JSON.parse(r.text); } catch (e) { throw new Error('校验接口返回非 JSON: ' + r.text.slice(0, 120)); }
  const token = json.data && json.data.token;
  // token 形如 "<数字>_"; 未扫码时 data 为空数组, message 为提示语
  if (typeof token === 'string' && /\d+_/.test(token)) return { ok: true, token, data: json.data };
  const msg = json.message || '请稍后重试';
  return { ok: false, pending: true, message: msg };
}

// 段评: 每段评论数。返回 { <paragraph_id>: count }
async function paragraphCommentCounts(novelid, chapterid) {
  const url = `${PC_HOST}/app.jjwxc/Pc/comment/getNovelParagraphCommentNum?novelid=${encodeURIComponent(novelid)}&chapterid=${encodeURIComponent(chapterid)}`;
  const r = await request(url, { headers: PC_HEADERS, timeout: 20000 });
  let json;
  try { json = JSON.parse(r.text); } catch (e) { return {}; }
  if (String(json.code) !== '200' || !Array.isArray(json.data)) return {};
  const map = {};
  for (const it of json.data) {
    const pid = String(it.paragraph_id || '');
    if (pid) map[pid] = Number(it.comment_total) || 0;
  }
  return map;
}

// 段评: 某段评论列表。返回 { total, list: [...] } (精简为前端展示所需字段)
async function paragraphComments({ novelId, chapterId, paragraphId, offset = 0, limit = 20 }) {
  const url = `${PC_HOST}/app.jjwxc/Pc/comment/getCommentList`
    + `?novelId=${encodeURIComponent(novelId)}&chapterId=${encodeURIComponent(chapterId)}`
    + `&paragraph_id=${encodeURIComponent(paragraphId)}&offset=${offset}&limit=${limit}`;
  const r = await request(url, { headers: PC_HEADERS, timeout: 20000 });
  let json;
  try { json = JSON.parse(r.text); } catch (e) { throw new Error('评论接口返回非 JSON'); }
  if (String(json.code) !== '200' || !json.data) return { total: 0, list: [] };
  const data = json.data;
  const raw = data.commentList || [];
  const list = raw.map((c) => ({
    commentId: String(c.commentId || ''),
    author: cleanAuthor(c.commentAuthor),
    body: c.commentBody || '',
    date: c.commentDateOrigin || c.commentDate || '',
    dateText: c.commentDate || '',
    ip: c.ip_pos || '',
    replyTotal: Number(c.replyTotal) || 0,
    isAuthor: c.isAuthor === '1' || c.isAuthor === 1,
    isTop: String(c.is_top) === '1',
    avatar: c.userCover || '',
  }));
  return { total: Number(data.commentTotal) || list.length, list };
}

// 段评: 某条评论的回复列表 (接口用全小写参数, 返回 data 为数组)
async function commentReplies({ novelId, chapterId, commentId, offset = 0, limit = 10 }) {
  const url = `${PC_HOST}/app.jjwxc/Pc/comment/getReplyList`
    + `?novelid=${encodeURIComponent(novelId)}&chapterid=${encodeURIComponent(chapterId)}`
    + `&commentid=${encodeURIComponent(commentId)}&offset=${offset}&limit=${limit}`;
  const r = await request(url, { headers: PC_HEADERS, timeout: 20000 });
  let json;
  try { json = JSON.parse(r.text); } catch (e) { throw new Error('回复接口返回非 JSON'); }
  const raw = Array.isArray(json.data) ? json.data : ((json.data && json.data.replyList) || []);
  const list = raw.map((c) => ({
    replyId: String(c.replyid || c.replyId || ''),
    author: cleanAuthor(c.commentauthor || c.commentAuthor),
    body: c.commentbody || c.commentBody || '',
    date: c.commentdate || '',
    dateText: c.commentdate || '',
    ip: c.ip_pos || '',
  }));
  return { total: list.length, list };
}

module.exports = {
  createScanSession,
  checkScanLogin,
  paragraphCommentCounts,
  paragraphComments,
  commentReplies,
  desEncrypt,
};
