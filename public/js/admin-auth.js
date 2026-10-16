// 后台鉴权前端: 登录 / 强制改密 / 请求包装
// 统一采用方案三清新活泼手帐风格 (米蓝网格 + 和纸胶带 + 便签贴纸 + 软萌按钮)
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

  // ---- 样式 (方案三活泼手帐风格) ----
  const css = `
  .zld-mask {
    position: fixed; inset: 0; z-index: 99999; display: flex; align-items: center; justify-content: center;
    background-color: #eef5fc;
    background-image: radial-gradient(#cbd5e1 1.2px, transparent 1.2px);
    background-size: 18px 18px;
    overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif;
    animation: zldFadeIn .25s ease; padding: 20px;
  }
  @keyframes zldFadeIn { from { opacity: 0; } to { opacity: 1; } }

  .zld-sticker {
    position: fixed; pointer-events: none; z-index: 1; user-select: none; font-weight: 800;
    box-shadow: 0 4px 14px rgba(0,0,0,0.06); border-radius: 12px; padding: 6px 14px; font-size: 12px;
    animation: zldFloat 5s ease-in-out infinite alternate;
  }
  .zld-sticker-1 { top: 8%; left: 8%; background: #fef08a; color: #854d0e; border: 1px solid #fde047; transform: rotate(-5deg); }
  .zld-sticker-2 { bottom: 8%; right: 8%; background: #bae6fd; color: #0369a1; border: 1px solid #7dd3fc; transform: rotate(5deg); animation-delay: -2.5s; }
  @keyframes zldFloat { 0% { transform: translateY(0px) rotate(var(--r, 0deg)); } 100% { transform: translateY(-8px) rotate(var(--r, 0deg)); } }

  .zld-card-wrap { position: relative; z-index: 10; width: 100%; max-width: 410px; }
  .zld-tape {
    position: absolute; top: -12px; left: 50%; transform: translateX(-50%) rotate(-1.5deg);
    width: 120px; height: 24px; background: rgba(254, 240, 138, 0.95);
    border-left: 2px dashed rgba(234, 179, 8, 0.4); border-right: 2px dashed rgba(234, 179, 8, 0.4);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08); z-index: 20; pointer-events: none;
  }
  .zld-card {
    position: relative; background: #ffffff;
    border: 1.5px solid #dbeafe; border-radius: 26px; padding: 34px 28px 26px;
    box-shadow: 0 16px 36px -6px rgba(14, 165, 233, 0.12), 0 4px 12px rgba(0,0,0,0.04);
    color: #1e293b;
  }
  .zld-badge {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px;
    background: #f0f9ff; border: 1px solid #bae6fd;
    border-radius: 999px; font-size: 12px; color: #0284c7; font-weight: 700; margin-bottom: 12px;
  }
  .zld-card h2 {
    margin: 0 0 4px; font-size: 24px; font-weight: 900; letter-spacing: -.4px; color: #0f172a;
  }
  .zld-card p.sub { margin: 0 0 20px; font-size: 13px; color: #64748b; line-height: 1.5; }
  .zld-group { margin-bottom: 15px; }
  .zld-card label { display: block; font-size: 12.5px; color: #334155; font-weight: 700; margin-bottom: 6px; }
  .zld-input-wrap { position: relative; display: flex; align-items: center; }
  .zld-input-wrap .zld-ico { position: absolute; left: 14px; color: #94a3b8; font-size: 14px; pointer-events: none; }
  .zld-card input {
    width: 100%; box-sizing: border-box;
    border: 1.5px solid #cbd5e1; border-radius: 12px;
    padding: 11px 14px 11px 38px; font-size: 14px; font-family: inherit; outline: none;
    background: #f8fafc; color: #0f172a;
    transition: all .2s ease;
  }
  .zld-card input::placeholder { color: #94a3b8; font-size: 13px; }
  .zld-card input:focus {
    border-color: #0284c7; background: #ffffff;
    box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.16);
  }
  .zld-card button.zld-btn-main {
    width: 100%; border: 0; border-radius: 14px; padding: 12px; font-size: 14.5px; font-weight: 800;
    background: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%);
    color: #fff; cursor: pointer; font-family: inherit;
    box-shadow: 0 4px 16px rgba(2, 132, 199, 0.35); transition: all .22s ease; margin-top: 14px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .zld-card button.zld-btn-main:hover:not(:disabled) {
    transform: translateY(-2px); box-shadow: 0 8px 24px rgba(2, 132, 199, 0.45);
  }
  .zld-card button.zld-btn-main:active:not(:disabled) { transform: scale(0.98); }
  .zld-card button.zld-btn-main:disabled { opacity: .55; cursor: default; transform: none; }
  .zld-err { color: #ef4444; font-size: 12.5px; min-height: 18px; margin: 4px 0 6px; font-weight: 700; }
  .zld-hint { color: #64748b; font-size: 12.5px; margin-top: 16px; text-align: center; }
  .zld-hint a { color: #0284c7; text-decoration: none; font-weight: 700; margin-left: 6px; }
  .zld-hint a:hover { text-decoration: underline; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  let mask = null;

  function mount(innerHtml) {
    close();
    mask = document.createElement('div');
    mask.className = 'zld-mask';
    mask.innerHTML = `
      <div class="zld-sticker zld-sticker-1" style="--r:-5deg;">🛡️ 管理工作台</div>
      <div class="zld-sticker zld-sticker-2" style="--r:5deg;">⚡ Novelia Studio</div>
      <div class="zld-card-wrap">
        <div class="zld-tape"></div>
        ${innerHtml}
      </div>
    `;
    document.body.appendChild(mask);
    return mask;
  }

  // ---- 登录框 ----
  function showLogin(msg) {
    const m = mount(`<div class="zld-card">
      <div class="zld-badge">
        <span>⚙️ Novelia 控制中心</span>
      </div>
      <h2>管理后台登录</h2>
      <p class="sub">请验证管理员权限以管理书源与账号</p>
      <div class="zld-group">
        <label>管理账号</label>
        <div class="zld-input-wrap">
          <span class="zld-ico">👤</span>
          <input id="zld_u" autocomplete="username" placeholder="输入管理用户名">
        </div>
      </div>
      <div class="zld-group">
        <label>管理密码</label>
        <div class="zld-input-wrap">
          <span class="zld-ico">🔒</span>
          <input id="zld_p" type="password" autocomplete="current-password" placeholder="输入管理密码">
        </div>
      </div>
      <div class="zld-err" id="zld_e">${esc(msg || '')}</div>
      <button class="zld-btn-main" id="zld_go">
        <span>立即登录</span>
        <span style="font-size:15px;">→</span>
      </button>
      <div class="zld-hint"><a href="/booklist_index">← 返回首页</a></div>
    </div>`);
    const u = m.querySelector('#zld_u'), p = m.querySelector('#zld_p'), e = m.querySelector('#zld_e'), b = m.querySelector('#zld_go');
    u.focus();
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
          b.innerHTML = '<span>立即登录</span><span style="font-size:15px;">→</span>';
          return;
        }
        setToken(j.token);
        if (j.must_change_password) { showChange('首次登录, 请先修改初始密码'); return; }
        onReady();
      } catch (err) {
        e.textContent = '网络连接异常，请重试';
        b.disabled = false;
        b.innerHTML = '<span>立即登录</span><span style="font-size:15px;">→</span>';
      }
    };
    b.onclick = submit;
    p.onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };
  }

  // ---- 强制改密框 ----
  function showChange(msg) {
    const m = mount(`<div class="zld-card">
      <div class="zld-badge" style="color:#b45309;border-color:#fde047;background:#fef9c3;">
        <span>⚠️ 安全防护</span>
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
        <span style="font-size:15px;">✓</span>
      </button>
    </div>`);
    const o = m.querySelector('#zld_o'), n1 = m.querySelector('#zld_n1'), n2 = m.querySelector('#zld_n2');
    const e = m.querySelector('#zld_e'), b = m.querySelector('#zld_go');
    o.focus();
    b.onclick = async () => {
      e.textContent = '';
      if (!o.value || !n1.value) { e.textContent = '请填写全部字段'; return; }
      if (n1.value !== n2.value) { e.textContent = '两次输入的新密码不一致'; return; }
      if (n1.value.length < 8) { e.textContent = '新密码至少需 8 位'; return; }
      b.disabled = true;
      b.innerHTML = '<span>修改中...</span>';
      try {
        const r = await fetch(P + '/api/auth/change_password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
          body: JSON.stringify({ old_password: o.value, new_password: n1.value }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          e.textContent = j.message || '修改失败';
          b.disabled = false;
          b.innerHTML = '<span>确认并提交修改</span><span>✓</span>';
          return;
        }
        onReady();
      } catch (err) {
        e.textContent = '网络异常，请重试';
        b.disabled = false;
        b.innerHTML = '<span>确认并提交修改</span><span>✓</span>';
      }
    };
  }

  function close() {
    if (mask) { mask.remove(); mask = null; }
  }

  let readyCb = null;
  function onReady() {
    close();
    if (typeof readyCb === 'function') readyCb();
  }

  // ---- 页面就绪检查 ----
  function boot(cb) {
    readyCb = cb;
    if (!token) { showLogin(); return; }
    fetch(P + '/api/auth/status', { headers: { 'X-Admin-Token': token } })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => {
        if (j.code !== 200) { setToken(''); showLogin(); return; }
        if (j.must_change_password) { showChange('必须先修改初始密码后方可进入管理后台'); return; }
        onReady();
      })
      .catch(() => { setToken(''); showLogin(); });
  }

  function logout() {
    fetch(P + '/api/auth/logout', { method: 'POST', headers: { 'X-Admin-Token': token } })
      .finally(() => { setToken(''); showLogin('已安全退出登录'); });
  }

  window.AdminAuth = { fetch: api, boot, logout, setToken, getToken: () => token };
})();
