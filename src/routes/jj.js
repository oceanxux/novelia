'use strict';
// 晋江扫码登录 + 段评 API
//   登录:
//     GET  /api/jj/login/scan          -> { jjreader_key, device_key, qrUrl, notice }
//     POST /api/jj/login/check         -> { ok, token? }  (前端轮询)
//     POST /api/jj/login/save          -> 保存 token (扫码成功后)
//     GET  /api/jj/status              -> { logged_in }
//     POST /api/jj/logout
//   段评 (匿名可用, 登录非必需):
//     GET  /api/jj/paragraph_counts?novelid=&chapterid=   -> { counts: {pid: n} }
//     GET  /api/jj/comments?novelid=&chapterid=&pid=&offset=&limit=
//     GET  /api/jj/replies?novelid=&chapterid=&commentid=&offset=&limit=
const express = require('express');
const QRCode = require('qrcode');
const jj = require('../lib/jjwxc');
const jjtoken = require('../lib/jjtoken');

const router = express.Router();

// 本地生成二维码 PNG (避免依赖第三方二维码服务)
router.get('/api/jj/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text) return res.status(400).send('missing text');
  try {
    const buf = await QRCode.toBuffer(text, { type: 'png', width: 480, margin: 1 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) {
    res.status(500).send('qr error');
  }
});

// ---- 登录 ----
router.get('/api/jj/login/scan', async (req, res) => {
  try {
    const s = await jj.createScanSession();
    s.qrImage = '/api/jj/qr?text=' + encodeURIComponent(s.qrUrl);
    res.json({ success: true, ...s });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
});

router.post('/api/jj/login/check', async (req, res) => {
  const { jjreader_key, device_key } = req.body || {};
  try {
    const r = await jj.checkScanLogin({ jjreader_key, device_key });
    if (r.ok) jjtoken.setToken(r.token);
    res.json({ success: true, ...r });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
});

// 手动保存 token (备用: 用户从别处拿到 token)
router.post('/api/jj/login/save', (req, res) => {
  const token = String((req.body && req.body.token) || '').trim();
  if (!/\d+_/.test(token)) return res.json({ success: false, message: 'token 格式不正确' });
  jjtoken.setToken(token);
  res.json({ success: true, message: '已保存' });
});

router.get('/api/jj/status', (req, res) => {
  res.json({ success: true, logged_in: jjtoken.isLoggedIn() });
});

router.post('/api/jj/logout', (req, res) => {
  jjtoken.clear();
  res.json({ success: true, message: '已退出晋江登录' });
});

// ---- 段评 ----
router.get('/api/jj/paragraph_counts', async (req, res) => {
  const novelid = String(req.query.novelid || '');
  const chapterid = String(req.query.chapterid || '');
  if (!novelid || !chapterid) return res.status(400).json({ success: false, message: '缺少 novelid/chapterid' });
  try {
    const counts = await jj.paragraphCommentCounts(novelid, chapterid);
    res.json({ success: true, counts });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
});

router.get('/api/jj/comments', async (req, res) => {
  const novelId = String(req.query.novelid || req.query.novelId || '');
  const chapterId = String(req.query.chapterid || req.query.chapterId || '');
  const paragraphId = String(req.query.pid || req.query.paragraph_id || '');
  if (!novelId || !chapterId || !paragraphId) {
    return res.status(400).json({ success: false, message: '缺少 novelid/chapterid/pid' });
  }
  try {
    const data = await jj.paragraphComments({
      novelId, chapterId, paragraphId,
      offset: parseInt(req.query.offset, 10) || 0,
      limit: Math.min(parseInt(req.query.limit, 10) || 20, 50),
    });
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
});

router.get('/api/jj/replies', async (req, res) => {
  const novelId = String(req.query.novelid || req.query.novelId || '');
  const chapterId = String(req.query.chapterid || req.query.chapterId || '');
  const commentId = String(req.query.commentid || req.query.commentId || '');
  if (!novelId || !chapterId || !commentId) {
    return res.status(400).json({ success: false, message: '缺少 novelid/chapterid/commentid' });
  }
  try {
    const data = await jj.commentReplies({
      novelId, chapterId, commentId,
      offset: parseInt(req.query.offset, 10) || 0,
      limit: Math.min(parseInt(req.query.limit, 10) || 10, 50),
    });
    res.json({ success: true, ...data });
  } catch (e) {
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
});

module.exports = router;
