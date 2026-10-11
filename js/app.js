import { html, render, useState, useEffect, useCallback } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { initStore, subscribe, getState, LIVE, auth, loadLive, setErrorHandler, actions } from './store.js';
import { Avatar, Modal } from './ui.js';
import { DayView } from './today.js';
import { TeamView } from './team.js';
import { KpiView } from './kpi.js';
import { StatsView } from './stats.js';
import { WeekView, ReviewView } from './weekly.js';
import { HabitsView } from './habits.js';
import { SettingsView } from './manage.js';
import { ChatPanel } from './chat.js';
import { ProjectsView } from './projects.js';
import * as U from './util.js';

// Menu theo vai trò. Tab "Dự án" chỉ hiện khi CEO cho phép (Cài đặt → Giờ làm & quyền)
const reportsBadge = (s, me) => s.reports.filter((r) => r.status === 'submitted' && U.visibleWorkers(s, me).some((p) => p.id === r.person_id)).length;
const NAV = {
  admin: [
    { id: 'today', label: 'Hôm nay', icon: '☀️' },
    { id: 'team', label: 'Team', icon: '👥' },
    { id: 'review', label: 'Duyệt BC', icon: '📨', badge: reportsBadge },
    { id: 'projects', label: 'Dự án', icon: '🎬' },
    { id: 'stats', label: 'Thống kê', icon: '📊', more: true },
    { id: 'kpi', label: 'KPI', icon: '🎯', more: true },
    { id: 'habits', label: 'Thói quen', icon: '🏃', more: true },
    { id: 'settings', label: 'Cài đặt', icon: '⚙️', more: true },
  ],
  manager: [
    { id: 'today', label: 'Hôm nay', icon: '☀️' },
    { id: 'team', label: 'Nhóm', icon: '👥' },
    { id: 'review', label: 'Duyệt BC', icon: '📨', badge: reportsBadge },
    { id: 'projects', label: 'Dự án', icon: '🎬', gate: 'managers' },
    { id: 'week', label: 'Tuần', icon: '📅', more: true },
    { id: 'stats', label: 'Thống kê', icon: '📊', more: true },
    { id: 'kpi', label: 'KPI', icon: '🎯', more: true },
    { id: 'settings', label: 'Thông báo', icon: '🔔', more: true },
  ],
  staff: [
    { id: 'today', label: 'Hôm nay', icon: '☀️' },
    { id: 'week', label: 'Tuần', icon: '📅' },
    { id: 'projects', label: 'Dự án', icon: '🎬', gate: 'all' },
    { id: 'kpi', label: 'KPI', icon: '🎯' },
    { id: 'settings', label: 'Thông báo', icon: '🔔' },
  ],
  bod: [
    { id: 'team', label: 'Tổng quan', icon: '👥' },
    { id: 'lead', label: 'Ban lãnh đạo', icon: '💼' },
    { id: 'projects', label: 'Dự án', icon: '🎬', gate: 'all' },
    { id: 'stats', label: 'Thống kê', icon: '📊' },
    { id: 'kpi', label: 'KPI', icon: '🎯' },
  ],
};
const gateOk = (gate, settings) => !gate || settings.projects_visible === 'all' || (gate === 'managers' && settings.projects_visible === 'managers');

function App({ meId, onSignOut }) {
  const [state, setState] = useState(getState());
  const [asId, setAsId] = useState(() => {
    if (meId) return meId;
    try {
      return localStorage.getItem('fp-demo-as') || 'u_admin';
    } catch {
      return 'u_admin';
    }
  });
  const me = state.people.find((p) => p.id === asId) || state.people[0];
  const [menu, setMenu] = useState(false);
  const [pw, setPw] = useState(false);
  const nav = NAV[me.role].filter((n) => gateOk(n.gate, state.settings));
  const [view, setView] = useState(() => location.hash.replace(/^#\/?/, '') || nav[0].id);
  const [toast, setToast] = useState(null);
  const [chat, setChat] = useState(false);
  const [more, setMore] = useState(false);
  const [privacy, setPrivacy] = useState('all');

  useEffect(() => subscribe(setState), []);
  useEffect(() => {
    const f = () => setView(location.hash.replace(/^#\/?/, '') || nav[0].id);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, [nav]);
  const notify = useCallback((msg, type = 'ok') => setToast({ msg, type, k: Date.now() }), []);
  useEffect(() => setErrorHandler((m) => notify(m, 'err')), []);
  // Bản thật: tự làm mới dữ liệu mỗi phút và khi quay lại tab
  useEffect(() => {
    if (!LIVE) return;
    const tick = () => document.visibilityState === 'visible' && Date.now() - (getState().loadedAt || 0) > 55000 && loadLive().catch(() => {});
    const t = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const cur = nav.find((n) => n.id === view) ? view : nav[0].id;
  const go = (id) => {
    location.hash = '#' + id;
    setView(id);
    setMore(false);
    scrollTo(0, 0);
  };
  function switchUser(id) {
    try {
      localStorage.setItem('fp-demo-as', id);
    } catch {}
    setAsId(id);
    setChat(false);
    const p = state.people.find((x) => x.id === id);
    go(NAV[p.role][0].id);
  }
  const ctx = { state, me, notify };
  const lead = state.people.find((p) => p.role === 'admin' && /ceo|giám đốc/i.test(p.title || '')) || state.people.find((p) => p.role === 'admin');

  return html`
    ${!LIVE && html`<div class="demobar">
      <b>DEMO</b> Xem với vai trò:
      <select value=${me.id} onChange=${(e) => switchUser(e.target.value)}>
        ${state.people.filter((p) => p.active !== false).map((p) => html`<option value=${p.id}>${p.full_name} — ${U.ROLES[p.role]}${p.dept ? ' ' + U.DEPTS[p.dept] : ''}</option>`)}
      </select>
      <span class="muted hide-sm">Dữ liệu mẫu, lưu trên trình duyệt này.</span>
    </div>`}
    <header class="topbar">
      <div class="brand"><img src="assets/logo-mark.png" alt="" /><div class="wordmark"><b>Mummii</b><small>CHECKLIST</small></div></div>
      <nav class="tabs">
        ${nav.map((n) => html`<a href=${'#' + n.id} class=${(cur === n.id ? 'on ' : '') + (n.more ? 'more-item' : '')} onClick=${(e) => { e.preventDefault(); go(n.id); }}>
          <span class="ic">${n.icon}</span><span>${n.label}</span>${n.badge && n.badge(state, me) > 0 && html`<i class="nbadge">${n.badge(state, me)}</i>`}</a>`)}
        ${nav.some((n) => n.more) && html`<a href="#" class=${'more-btn ' + (nav.find((n) => n.id === cur)?.more ? 'on' : '')} onClick=${(e) => { e.preventDefault(); setMore(!more); }}><span class="ic">☰</span><span>Thêm</span></a>`}
      </nav>
      <div class="usermenu">
        <button class="me" onClick=${() => LIVE && setMenu(!menu)} aria-label="Tài khoản"><${Avatar} p=${me} size=${34} /><div class="hide-sm"><b>${me.full_name}</b><small>${U.ROLES[me.role]}</small></div></button>
        ${menu && html`<div class="menu" onMouseLeave=${() => setMenu(false)}>
          <div class="menu-head"><b>${me.full_name}</b><small>${me.email || ''}</small></div>
          <button onClick=${() => { setMenu(false); setPw(true); }}>🔑 Đổi mật khẩu</button>
          <button onClick=${() => { setMenu(false); onSignOut(); }}>↪ Đăng xuất</button>
        </div>`}
      </div>
    </header>
    ${pw && html`<${ChangePassword} notify=${notify} onClose=${() => setPw(false)} />`}
    ${more && html`<div class="moresheet" onClick=${() => setMore(false)}><div onClick=${(e) => e.stopPropagation()}>
      ${nav.filter((n) => n.more).map((n) => html`<button onClick=${() => go(n.id)}>${n.icon} ${n.label}</button>`)}
    </div></div>`}
    <main class="main">
      ${cur === 'today' && html`<div class="page mid">
        <div class="page-head"><div><h1>${me.role === 'admin' ? 'Hôm nay của tôi' : 'Hôm nay'}</h1><div class="muted">${U.fmtDayLong(U.todayStr())}</div></div>
          ${me.role === 'admin' && privacy !== 'work' && html`<button class="btn" onClick=${() => { setPrivacy('work'); notify('Chế độ trình chiếu: đã ẩn việc riêng'); }} title="Ẩn việc riêng khi trình chiếu cho BOD">📽️ Trình chiếu BOD</button>`}</div>
        <${DayView} ctx=${ctx} person=${me} privacy=${me.role === 'admin' ? privacy : 'work'} onPrivacy=${me.role === 'admin' && setPrivacy} />
      </div>`}
      ${cur === 'team' && html`<${TeamView} ctx=${ctx} />`}
      ${cur === 'lead' && html`<${LeadView} ctx=${ctx} lead=${lead} />`}
      ${cur === 'review' && html`<${ReviewView} ctx=${ctx} />`}
      ${cur === 'stats' && html`<${StatsView} ctx=${ctx} />`}
      ${cur === 'projects' && html`<${ProjectsView} ctx=${ctx} key=${me.id} />`}
      ${cur === 'kpi' && html`<${KpiView} ctx=${ctx} />`}
      ${cur === 'week' && html`<${WeekView} ctx=${ctx} key=${me.id} />`}
      ${cur === 'habits' && html`<${HabitsView} ctx=${ctx} />`}
      ${cur === 'settings' && html`<${SettingsView} ctx=${ctx} key=${me.id} />`}
    </main>
    ${me.role === 'admin' && !chat && html`<button class="fab" onClick=${() => setChat(true)} aria-label="Mở trợ lý AI">🤖</button>`}
    ${chat && html`<${ChatPanel} ctx=${ctx} onClose=${() => setChat(false)} />`}
    ${toast && html`<div class=${'toast ' + toast.type} key=${toast.k}>${toast.msg}</div>`}
  `;
}

// Vai trò chỉ xem: xem công việc công ty của CEO (không bao giờ có việc riêng)
function LeadView({ ctx, lead }) {
  const [date, setDate] = useState(U.todayStr());
  return html`<div class="page mid">
    <div class="page-head"><div><h1>💼 Công việc của ${lead.full_name}</h1><div class="muted">${U.fmtDayLong(date)}</div></div>
      <div class="row"><button class="btn" onClick=${() => setDate(U.addDays(-1, date))}>‹</button>
        <button class="btn" disabled=${date >= U.todayStr()} onClick=${() => setDate(U.addDays(1, date))}>›</button></div></div>
    <${DayView} ctx=${ctx} person=${lead} date=${date} readOnly />
  </div>`;
}

function ChangePassword({ notify, onClose }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  async function save(e) {
    e.preventDefault();
    if (a.length < 8) return setErr('Mật khẩu tối thiểu 8 ký tự');
    if (a !== b) return setErr('Hai lần nhập không khớp');
    try {
      await auth.changePassword(a);
      notify('Đã đổi mật khẩu');
      onClose();
    } catch (x) {
      setErr(x.message);
    }
  }
  return html`<${Modal} title="Đổi mật khẩu" onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <label>Mật khẩu mới<input type="password" id="pw-new" autocomplete="new-password" value=${a} onInput=${(e) => setA(e.target.value)} /></label>
      <label>Nhập lại<input type="password" id="pw-again" autocomplete="new-password" value=${b} onInput=${(e) => setB(e.target.value)} /></label>
      ${err && html`<div class="err">${err}</div>`}
      <div class="row end"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary">Lưu</button></div>
    </form>
  </${Modal}>`;
}

function Login({ onDone }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await auth.signIn(email, pw);
      await onDone();
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  }
  async function forgot() {
    if (!/\S+@\S+/.test(email)) return setErr('Nhập email trước, rồi bấm "Quên mật khẩu"');
    try {
      await auth.resetPassword(email);
      setSent(true);
    } catch (x) {
      setErr(x.message);
    }
  }
  return html`<div class="login">
    <form class="login-card" onSubmit=${submit}>
      <div class="brand center-brand"><img src="assets/logo-mark.png" alt="" /><div class="wordmark"><b>Mummii</b><small>CHECKLIST</small></div></div>
      <p class="muted">Đăng nhập bằng tài khoản Mummii được cấp</p>
      <label>Email<input type="email" id="login-email" autocomplete="username" value=${email} onInput=${(e) => setEmail(e.target.value)} required /></label>
      <label>Mật khẩu<input type="password" id="login-pw" autocomplete="current-password" value=${pw} onInput=${(e) => setPw(e.target.value)} required /></label>
      ${err && html`<div class="err">${err}</div>`}
      ${sent && html`<div class="note">Đã gửi email đặt lại mật khẩu — kiểm tra hộp thư.</div>`}
      <button class="btn primary block" disabled=${busy}>${busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      <button type="button" class="link" onClick=${forgot}>Quên mật khẩu?</button>
    </form>
  </div>`;
}

function Root() {
  const [phase, setPhase] = useState(LIVE ? 'loading' : 'ready');
  const [info, setInfo] = useState(null);
  async function boot() {
    try {
      const st = await loadLive();
      if (!st) return setPhase('login');
      if (st.notMember) {
        setInfo(st);
        return setPhase('notmember');
      }
      setInfo(st);
      setPhase('ready');
    } catch (e) {
      setInfo({ error: e.message });
      setPhase('error');
    }
  }
  useEffect(() => {
    if (!LIVE) return;
    boot();
    return auth.onChange((ev) => {
      if (ev === 'SIGNED_OUT') setPhase('login');
      if (ev === 'PASSWORD_RECOVERY') setPhase('recovery');
    });
  }, []);
  const signOut = async () => {
    await auth.signOut();
    setPhase('login');
  };
  if (phase === 'loading') return html`<div class="splash">Đang tải…</div>`;
  if (phase === 'login') return html`<${Login} onDone=${boot} />`;
  if (phase === 'recovery') return html`<div class="login"><div class="login-card"><h3>Đặt mật khẩu mới</h3><${ChangePassword} notify=${() => {}} onClose=${boot} /></div></div>`;
  if (phase === 'error')
    return html`<div class="splash">Không tải được dữ liệu: ${info?.error}<br /><button class="btn" onClick=${boot}>Thử lại</button></div>`;
  if (phase === 'notmember')
    return html`<div class="splash">Tài khoản ${info?.email} chưa được thêm vào Mummii Checklist.<br />Nhờ quản lý thêm bạn trong Cài đặt → Nhân sự.<br /><button class="btn" onClick=${signOut}>Đăng xuất</button></div>`;
  return html`<${App} meId=${LIVE ? info?.meId : null} onSignOut=${signOut} />`;
}

await initStore();
render(html`<${Root} />`, document.getElementById('app'));
