// 后台鉴权前端: 登录 / 强制改密 / 请求包装
// 用法:
//   AdminAuth.fetch('/api/sources')            // 自动带 X-Admin-Token
//   AdminAuth.boot(() => { loadList(); });     // 校验会话, 未登录先弹登录框
(function () {
  const P = (window.__ADMIN_BASE__ || '/admin').replace(/\/+$/, '');
  const KEY = 'zld_admin_token';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let token = localStorage.getItem(KEY) || '';

  function setToken(t) {
    token = t || '';
    if (token) localStorage.setItem(KEY, token); else localStorage.removeItem(KEY);
  }

  // 请求包装: 相对后台根拼接, 自动注入 token; 401 时清会话并回登录
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, token ? { 'X-Admin-Token': token } : {});
    return fetch(P + path, opts).then((r) => {
      if (r.status === 401) { setToken(''); showLogin(); }
      return r;
    });
  }

  // ---- 样式 (与前端登录统一的深邃夜空星光极光拟物美学) ----
  const css = `
  .zld-mask {
    position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center;
    background: #070913; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif;
    animation: zldFadeIn .3s ease; padding: 20px;
  }
  @keyframes zldFadeIn { from { opacity: 0; } to { opacity: 1; } }
  .zld-bg-canvas { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; }
  .zld-orb { position: absolute; border-radius: 50%; filter: blur(100px); pointer-events: none; z-index: 2; opacity: 0.45; }
  .zld-orb-1 { width: 380px; height: 380px; background: radial-gradient(circle, #6366f1 0%, transparent 70%); top: -10%; right: -5%; }
  .zld-orb-2 { width: 320px; height: 320px; background: radial-gradient(circle, #ec4899 0%, transparent 70%); bottom: -10%; left: -5%; }
  
  .zld-card-wrap { position: relative; z-index: 10; width: 100%; max-width: 430px; }
  .zld-card {
    background: rgba(22, 27, 46, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 24px; padding: 34px 30px 28px;
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    color: #f8fafc;
  }
  .zld-badge {
    display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px;
    background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px; font-size: 12.5px; color: #c7d2fe; margin-bottom: 16px;
  }
  .zld-card h2 {
    margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -.5px;
    background: linear-gradient(135deg, #ffffff 30%, #a5b4fc 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .zld-card p.sub { margin: 0 0 24px; font-size: 13.5px; color: #94a3b8; line-height: 1.5; }
  .zld-group { margin-bottom: 18px; }
  .zld-card label { display: block; font-size: 13px; color: #cbd5e1; font-weight: 500; margin-bottom: 8px; }
  .zld-input-wrap { position: relative; display: flex; align-items: center; }
  .zld-input-wrap .zld-ico { position: absolute; left: 14px; color: #64748b; font-size: 15px; pointer-events: none; }
  .zld-card input {
    width: 100%; box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px;
    padding: 13px 14px 13px 40px; font-size: 14.5px; font-family: inherit; outline: none;
    background: rgba(15, 23, 42, 0.6); color: #fff;
    transition: all .22s ease;
  }
  .zld-card input::placeholder { color: rgba(148, 163, 184, 0.45); }
  .zld-card input:focus {
    border-color: #818cf8; background: rgba(15, 23, 42, 0.9);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
  }
  .zld-card button.zld-btn-main {
    width: 100%; border: 0; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
    color: #fff; cursor: pointer; font-family: inherit;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.38); transition: all .28s ease; margin-top: 10px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .zld-card button.zld-btn-main:hover:not(:disabled) {
    transform: translateY(-2px); box-shadow: 0 8px 28px rgba(99, 102, 241, 0.52);
  }
  .zld-card button.zld-btn-main:disabled { opacity: .55; cursor: default; transform: none; }
  .zld-err { color: #f87171; font-size: 12.5px; min-height: 18px; margin: 4px 0 10px; font-weight: 500; }
  .zld-hint { color: #64748b; font-size: 12.5px; margin-top: 18px; text-align: center; }
  .zld-hint a { color: #818cf8; text-decoration: none; margin-left: 8px; }
  .zld-hint a:hover { text-decoration: underline; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  let mask = null;
  let animId = null;

  function close() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (mask) { mask.remove(); mask = null; }
  }

  function startCanvasAnim(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h;
    function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
    resize();
    window.addEventListener('resize', resize);
    const pts = [];
    for (let i = 0; i < 60; i++) {
      pts.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + .6, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, alpha: Math.random() * .5 + .2 });
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(165, 180, 252, ${p.alpha})`; ctx.fill();
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${(1 - dist / 110) * 0.16})`; ctx.lineWidth = .6; ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();
  }

  function mount(innerHtml) {
    close();
    mask = document.createElement('div');
    mask.className = 'zld-mask';
    mask.innerHTML = `
      <canvas class="zld-bg-canvas" id="zld-canvas"></canvas>
      <div class="zld-orb zld-orb-1"></div>
      <div class="zld-orb zld-orb-2"></div>
      <div class="zld-card-wrap">${innerHtml}</div>
    `;
    document.body.appendChild(mask);
    startCanvasAnim(mask.querySelector('#zld-canvas'));
    return mask;
  }

  // ---- 登录框 ----
  function showLogin(msg) {
    const m = mount(`<div class="zld-card">
      <div class="zld-badge">
        <i class="fas fa-shield-halved"></i>
        <span>自留地 · 管理控制台</span>
      </div>
      <h2>管理后台登录</h2>
      <p class="sub">请验证管理员身份以访问书源及账户系统</p>
      <div class="zld-group">
        <label>管理账号</label>
        <div class="zld-input-wrap">
          <span class="zld-ico">👤</span>
          <input id="zld_u" autocomplete="username" placeholder="输入管理员用户名" value="admin">
        </div>
      </div>
      <div class="zld-group">
        <label>管理密码</label>
        <div class="zld-input-wrap">
          <span class="zld-ico">🔒</span>
          <input id="zld_p" type="password" autocomplete="current-password" placeholder="输入访问密码">
        </div>
      </div>
      <div class="zld-err" id="zld_e">${esc(msg || '')}</div>
      <button class="zld-btn-main" id="zld_go">
        <span>立即登录</span>
        <span style="font-size:16px;">→</span>
      </button>
      <div class="zld-hint">
        初始凭据: admin / admin123
        <a href="/booklist_index">返回前台首页</a>
      </div>
    </div>`);
    const u = m.querySelector('#zld_u'), p = m.querySelector('#zld_p'), e = m.querySelector('#zld_e'), b = m.querySelector('#zld_go');
    if (u.value) p.focus(); else u.focus();
    const submit = async () => {
      e.textContent = '';
      b.disabled = true;
      b.innerHTML = '<span>登录中...</span>';
      try {
        const r = await fetch(P + '/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u.value.trim(), password: p.value }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          e.textContent = j.message || '登录失败，请检查账号密码';
          b.disabled = false;
          b.innerHTML = '<span>立即登录</span><span style="font-size:16px;">→</span>';
          return;
        }
        setToken(j.token);
        if (j.must_change_password) { showChange('首次登录, 请先修改初始密码'); return; }
        onReady();
      } catch (err) {
        e.textContent = '网络连接异常，请重试';
        b.disabled = false;
        b.innerHTML = '<span>立即登录</span><span style="font-size:16px;">→</span>';
      }
    };
    b.onclick = submit;
    p.onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };
  }

  // ---- 强制改密框 ----
  function showChange(msg) {
    const m = mount(`<div class="zld-card">
      <div class="zld-badge" style="color:#fcd34d;border-color:rgba(252,211,77,0.3);background:rgba(252,211,77,0.08);">
        <span>⚠️ 安全保障</span>
      </div>
      <h2>修改初始密码</h2>
      <p class="sub">${esc(msg || '首次登录系统，请修改默认初始密码')}</p>
      <div class="zld-group">
        <label>当前初始密码</label>
        <div class="zld-input-wrap">
          <span class="zld-ico">🔑</span>
          <input id="zld_o" type="password" placeholder="输入旧初始密码">
        </div>
      </div>
      <div class="zld-group">
        <label>设置新密码</label>
        <div class="zld-input-wrap">
          <span class="zld-ico">🔒</span>
          <input id="zld_n1" type="password" placeholder="至少 8 位，包含字母和数字">
        </div>
      </div>
      <div class="zld-group">
        <label>确认新密码</label>
        <div class="zld-input-wrap">
          <span class="zld-ico">✨</span>
          <input id="zld_n2" type="password" placeholder="再次输入新密码">
        </div>
      </div>
      <div class="zld-err" id="zld_e"></div>
      <button class="zld-btn-main" id="zld_go">
        <span>确认并提交修改</span>
        <span style="font-size:16px;">✓</span>
      </button>
      <div class="zld-hint">修改完成后旧凭据作废，需使用新密码重新登录</div>
    </div>`);
    const o = m.querySelector('#zld_o'), n1 = m.querySelector('#zld_n1'), n2 = m.querySelector('#zld_n2'), e = m.querySelector('#zld_e'), b = m.querySelector('#zld_go');
    o.focus();
    b.onclick = async () => {
      e.textContent = '';
      if (n1.value !== n2.value) { e.textContent = '两次输入的新密码不一致'; return; }
      b.disabled = true;
      b.innerHTML = '<span>提交中...</span>';
      try {
        const r = await api('/api/auth/change_password', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ old_password: o.value, new_password: n1.value }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          e.textContent = j.message || '修改失败';
          b.disabled = false;
          b.innerHTML = '<span>确认并提交修改</span>';
          return;
        }
        setToken(''); // 改密后旧会话作废, 重新登录
        showLogin('密码已成功修改, 请使用新密码登录');
      } catch (err) {
        e.textContent = '网络错误';
        b.disabled = false;
        b.innerHTML = '<span>确认并提交修改</span>';
      }
    };
  }

  let readyCb = null;
  function onReady() { close(); if (readyCb) readyCb(); }

  // 启动: 校验会话 -> 未登录/需改密则弹框, 通过后执行 cb
  function boot(cb) {
    readyCb = cb;
    if (!token) { showLogin(); return; }
    api('/api/auth/status').then(async (r) => {
      if (!r.ok) { showLogin(); return; }
      const j = await r.json().catch(() => ({}));
      if (j.must_change_password) { showChange('首次登录, 请先修改初始密码'); return; }
      onReady();
    }).catch(() => showLogin());
  }

  window.AdminAuth = { fetch: api, boot, path: P, logout: () => { setToken(''); showLogin(); } };
})();
