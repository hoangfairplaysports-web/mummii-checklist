// Cài đặt: routine, nhân sự, nghỉ phép/lễ, giờ làm, thông báo, trợ lý AI.
import { html, Modal, Avatar, Badge, Seg, Section, Empty, ConfirmButton } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions, resetDemo, LIVE } from './store.js';
import { CONFIG } from './config.js';
import * as U from './util.js';

const WDAYS = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7']];

export function SettingsView({ ctx }) {
  const isAdmin = ctx.me.role === 'admin';
  const tabs = isAdmin
    ? [{ id: 'depts', label: '🏢 Phòng ban' }, { id: 'people', label: '👥 Nhân sự' }, { id: 'routine', label: '🔁 Routine' }, { id: 'leave', label: '🌴 Nghỉ phép & lễ' }, { id: 'rules', label: '⏰ Giờ làm & quyền' }, { id: 'notify', label: '🔔 Thông báo' }, { id: 'ai', label: '🤖 Trợ lý AI' }]
    : [{ id: 'notify', label: '🔔 Thông báo' }];
  const [tab, setTab] = useState(tabs[0].id);
  return html`<div class="page">
    <div class="page-head"><h1>⚙️ Cài đặt</h1></div>
    ${tabs.length > 1 && html`<div class="scroll-x mb"><${Seg} value=${tab} onChange=${setTab} options=${tabs} /></div>`}
    ${tab === 'depts' && html`<${Depts} ctx=${ctx} />`}
    ${tab === 'routine' && html`<${Routines} ctx=${ctx} />`}
    ${tab === 'leave' && html`<${Leaves} ctx=${ctx} />`}
    ${tab === 'people' && html`<${People} ctx=${ctx} />`}
    ${tab === 'rules' && html`<${Rules} ctx=${ctx} />`}
    ${tab === 'notify' && html`<${Notify} ctx=${ctx} />`}
    ${tab === 'ai' && html`<${AiSettings} ctx=${ctx} />`}
  </div>`;
}

// ---------------------------------------------------------------------------
function Depts({ ctx }) {
  const { state } = ctx;
  const [edit, setEdit] = useState(null);
  const list = (state.depts || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const count = (id) => state.people.filter((p) => p.dept === id && p.active !== false).length;
  const routines = (id) => state.routines.filter((r) => r.dept === id).length;
  return html`<div class="narrow-form">
    <div class="row between mb"><p class="muted">Nhóm / phòng ban dùng để chia routine, KPI, thống kê và để Quản lý nhóm duyệt báo cáo.</p>
      <button class="btn primary" onClick=${() => setEdit({ name: '' })}>+ Thêm nhóm</button></div>
    <div class="tlist card">${list.map((d) => html`<div class="trow" onClick=${() => setEdit(d)}>
      <span class="tcheck">🏢</span>
      <div class="tmain"><div class="ttitle">${d.name}</div><div class="tmeta"><span>${count(d.id)} người</span><span>${routines(d.id)} routine</span></div></div>
    </div>`)}</div>
    ${edit && html`<${Modal} title=${edit.id ? 'Sửa nhóm' : 'Thêm nhóm'} onClose=${() => setEdit(null)}>
      <form class="form" onSubmit=${(e) => { e.preventDefault(); if (!edit.name.trim()) return; actions.saveDept({ ...edit, name: edit.name.trim() }); ctx.notify('Đã lưu'); setEdit(null); }}>
        <label>Tên nhóm *<input id="d-name" value=${edit.name} onInput=${(e) => setEdit({ ...edit, name: e.target.value })} placeholder="VD: Livestream" /></label>
        <div class="row between">
          ${edit.id ? html`<${ConfirmButton} label="🗑 Xoá nhóm" ask=${`Xoá? ${count(edit.id)} người sẽ thành "chưa xếp nhóm", ${routines(edit.id)} routine bị xoá`} onConfirm=${() => { actions.deleteDept(edit.id); setEdit(null); }} />` : html`<span></span>`}
          <div class="row"><button type="button" class="btn" onClick=${() => setEdit(null)}>Huỷ</button><button class="btn primary">Lưu</button></div>
        </div>
      </form>
    </${Modal}>`}
  </div>`;
}

// ---------------------------------------------------------------------------
function Routines({ ctx }) {
  const { state } = ctx;
  const [edit, setEdit] = useState(null);
  const groups = [
    { key: 'all', label: '🗓️ Cả team (họp cố định)', filter: (r) => r.dept === 'all' },
    ...Object.entries(U.DEPTS).map(([id, name]) => ({ key: id, label: `🏢 ${name}`, filter: (r) => r.dept === id })),
    ...state.people.filter((p) => p.role !== 'bod').map((p) => ({ key: p.id, label: `👤 Riêng ${p.full_name}`, filter: (r) => r.owner_id === p.id })),
  ];
  return html`<div>
    <div class="row between mb"><p class="muted">Routine tự sinh thành việc trong checklist mỗi ngày phù hợp. Routine không làm sẽ bị ghi nhận <b>miss</b>.</p>
      <button class="btn primary" onClick=${() => setEdit({})}>+ Thêm routine</button></div>
    ${groups.map((g) => {
      const list = state.routines.filter(g.filter);
      if (!list.length) return null;
      return html`<${Section} key=${g.key} title=${g.label}>
        <div class="tlist card">${list.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map((r) => {
          const kpiName = r.kpi_key && state.kpis.find((k) => k.key === r.kpi_key)?.title;
          return html`<div class="trow" onClick=${() => setEdit(r)}>
            <span class="tcheck">${r.kind === 'meeting' ? '👥' : r.scope === 'private' ? '🔒' : '🔁'}</span>
            <div class="tmain"><div class="ttitle">${r.title}</div>
              <div class="tmeta"><span class="tag">${U.repeatLabel(r)}</span>${r.time && html`<span class="time">🕐 ${r.time}${r.end_time ? '–' + r.end_time : ''}</span>`}
              ${kpiName && html`<span class="tag kpi">🎯 ${kpiName}</span>`}${r.priority === 'high' && html`<span class="tag hi">🔴 Cao</span>`}</div></div>
          </div>`;
        })}</div>
      </${Section}>`;
    })}
    ${edit && html`<${RoutineForm} ctx=${ctx} r=${edit} onClose=${() => setEdit(null)} />`}
  </div>`;
}

function RoutineForm({ ctx, r, onClose }) {
  const { state, me } = ctx;
  const [f, setF] = useState({ title: '', target: r.owner_id ? 'p:' + r.owner_id : r.dept ? 'd:' + r.dept : 'd:all', repeat: 'daily', days: [1, 3, 5], month_day: 1, time: '', end_time: '', kind: 'task', priority: 'mid', scope: 'work', kpi_key: '', ...r });
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const keys = [...new Map(state.kpis.map((k) => [k.key, k.title])).entries()];
  function save(e) {
    e.preventDefault();
    if (!f.title.trim()) return;
    const [t, v] = f.target.split(':');
    const { target, ...rest } = f;
    actions.saveRoutine({ ...rest, title: f.title.trim(), owner_id: t === 'p' ? v : null, dept: t === 'd' ? v : null, time: f.time || null, end_time: f.end_time || null, kpi_key: f.kpi_key || null, scope: t === 'p' && v === me.id ? f.scope : 'work' });
    ctx.notify('Đã lưu routine');
    onClose();
  }
  return html`<${Modal} title=${r.id ? 'Sửa routine' : 'Thêm routine'} onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      <label>Tên việc *<input value=${f.title} onInput=${set('title')} placeholder="VD: Check inbox fanpage & lead mới" /></label>
      <div class="grid2">
        <label>Áp dụng cho<select value=${f.target} onChange=${set('target')}>
          <option value="d:all">Cả công ty</option>${Object.entries(U.DEPTS).map(([id, name]) => html`<option value=${'d:' + id}>Nhóm ${name}</option>`)}
          ${state.people.filter((p) => p.role !== 'bod').map((p) => html`<option value=${'p:' + p.id}>Riêng ${p.full_name}</option>`)}
        </select></label>
        <label>Loại<select value=${f.kind} onChange=${set('kind')}><option value="task">Công việc</option><option value="meeting">Cuộc họp</option></select></label>
      </div>
      <div class="chips">
        ${[['daily', 'Hằng ngày (T2–T7)'], ['weekdays', 'Chọn thứ'], ['monthly', 'Hằng tháng']].map(([k, l]) => html`<button type="button" class=${'chip ' + (f.repeat === k ? 'on' : '')} onClick=${() => setF({ ...f, repeat: k })}>${l}</button>`)}
      </div>
      ${f.repeat === 'weekdays' && html`<div class="chips">${WDAYS.map(([d, l]) => html`<button type="button" class=${'chip ' + (f.days.includes(d) ? 'on' : '')} onClick=${() => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })}>${l}</button>`)}</div>`}
      ${f.repeat === 'monthly' && html`<label>Ngày trong tháng<input type="number" min="1" max="31" value=${f.month_day} onInput=${set('month_day')} /></label>`}
      <div class="grid3">
        <label>Giờ bắt đầu<input type="time" value=${f.time} onInput=${set('time')} /></label>
        ${f.kind === 'meeting' && html`<label>Giờ kết thúc<input type="time" value=${f.end_time} onInput=${set('end_time')} /></label>`}
        <label>Ưu tiên<select value=${f.priority} onChange=${set('priority')}>${Object.entries(U.PRIORITIES).map(([k, p]) => html`<option value=${k}>${p.icon} ${p.label}</option>`)}</select></label>
      </div>
      ${f.kind === 'task' && keys.length > 0 && html`<label>Tự cộng vào KPI<select value=${f.kpi_key || ''} onChange=${set('kpi_key')}><option value="">— Không —</option>${keys.map(([k, t]) => html`<option value=${k}>${t}</option>`)}</select></label>`}
      ${f.target === 'p:' + me.id && html`<label class="check"><input type="checkbox" checked=${f.scope === 'private'} onChange=${(e) => setF({ ...f, scope: e.target.checked ? 'private' : 'work' })} /> 🔒 Việc riêng (BOD không thấy)</label>`}
      <p class="muted small">Sẽ nhắc qua kênh thông báo mỗi người đã chọn, trước giờ bắt đầu 10 phút.</p>
      <div class="row between">
        ${r.id ? html`<${ConfirmButton} label="Xoá routine" ask="Bấm lần nữa để xoá (lịch sử vẫn giữ)" onConfirm=${() => { actions.deleteRoutine(r.id); onClose(); }} />` : html`<span></span>`}
        <div class="row"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary">Lưu</button></div>
      </div>
    </form>
  </${Modal}>`;
}

// ---------------------------------------------------------------------------
function Leaves({ ctx }) {
  const { state } = ctx;
  const [f, setF] = useState(null);
  const name = (id) => (id ? state.people.find((p) => p.id === id)?.full_name : '🏢 Cả công ty');
  const list = state.leaves.slice().sort((a, b) => b.from.localeCompare(a.from));
  const upcoming = list.filter((l) => l.to >= U.todayStr()).reverse();
  const past = list.filter((l) => l.to < U.todayStr());
  const Row = (l) => html`<div class="trow ro">
    <span class="tcheck">${l.type === 'holiday' ? '🎉' : '🌴'}</span>
    <div class="tmain"><div class="ttitle">${name(l.person_id)} — ${U.LEAVE_TYPES[l.type]}</div>
      <div class="tmeta"><span>${U.fmtDayLong(l.from)}${l.to !== l.from ? ' → ' + U.fmtDayLong(l.to) : ''}</span>${l.note && html`<span class="muted">· ${l.note}</span>`}</div></div>
    <${ConfirmButton} label="Xoá" ask="Chắc chắn?" onConfirm=${() => actions.deleteLeave(l.id)} />
  </div>`;
  return html`<div>
    <div class="row between mb"><p class="muted">Chỉ quản lý đánh dấu. Ngày nghỉ không tính đi trễ, không tính miss việc.</p>
      <button class="btn primary" onClick=${() => setF({ person_id: state.people.find((p) => p.role === 'staff')?.id, from: U.todayStr(), to: U.todayStr(), type: 'full', note: '' })}>+ Đánh dấu nghỉ</button></div>
    <${Section} title="Sắp tới & đang nghỉ">${upcoming.length ? html`<div class="tlist card">${upcoming.map(Row)}</div>` : html`<${Empty}>Không có.</${Empty}>`}</${Section}>
    <${Section} title="Đã qua">${past.length ? html`<div class="tlist card">${past.map(Row)}</div>` : html`<${Empty}>Không có.</${Empty}>`}</${Section}>
    ${f && html`<${Modal} title="Đánh dấu nghỉ" onClose=${() => setF(null)}>
      <form class="form" onSubmit=${(e) => { e.preventDefault(); actions.saveLeave({ ...f, person_id: f.type === 'holiday' ? null : f.person_id, to: f.to < f.from ? f.from : f.to }); ctx.notify('Đã lưu'); setF(null); }}>
        <div class="chips">${Object.entries(U.LEAVE_TYPES).map(([k, l]) => html`<button type="button" class=${'chip ' + (f.type === k ? 'on' : '')} onClick=${() => setF({ ...f, type: k })}>${l}</button>`)}</div>
        ${f.type !== 'holiday' && html`<label>Nhân sự<select value=${f.person_id} onChange=${(e) => setF({ ...f, person_id: e.target.value })}>${state.people.filter((p) => p.role !== 'bod').map((p) => html`<option value=${p.id}>${p.full_name}</option>`)}</select></label>`}
        <div class="grid2"><label>Từ ngày<input type="date" value=${f.from} onInput=${(e) => setF({ ...f, from: e.target.value })} /></label>
          <label>Đến ngày<input type="date" value=${f.to} min=${f.from} onInput=${(e) => setF({ ...f, to: e.target.value })} /></label></div>
        <label>Ghi chú<input value=${f.note} onInput=${(e) => setF({ ...f, note: e.target.value })} placeholder="VD: Nghỉ phép việc gia đình" /></label>
        <div class="row end"><button type="button" class="btn" onClick=${() => setF(null)}>Huỷ</button><button class="btn primary">Lưu</button></div>
      </form>
    </${Modal}>`}
  </div>`;
}

// ---------------------------------------------------------------------------
function People({ ctx }) {
  const { state } = ctx;
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [resetPw, setResetPw] = useState('');
  const open = (p) => {
    setErr('');
    setResetPw('');
    setF(p);
  };
  async function save(e) {
    e.preventDefault();
    if (!f.full_name.trim()) return setErr('Nhập họ tên');
    const data = { ...f, full_name: f.full_name.trim(), dept: ['staff', 'manager'].includes(f.role) ? f.dept || null : null };
    if (f.id || !LIVE) {
      actions.savePerson(data);
      ctx.notify('Đã lưu');
      return setF(null);
    }
    if (!/^\S+@\S+\.\S+$/.test(f.email || '')) return setErr('Nhập email đăng nhập hợp lệ');
    if ((f.password || '').length < 8) return setErr('Mật khẩu tạm tối thiểu 8 ký tự');
    setBusy(true);
    setErr('');
    try {
      const res = await actions.createMember(data);
      ctx.notify(res?.existing ? 'Đã thêm tài khoản có sẵn vào Checklist (giữ mật khẩu cũ)' : 'Đã tạo tài khoản — gửi email + mật khẩu tạm cho nhân viên');
      setF(null);
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  }
  async function doReset() {
    if (resetPw.length < 8) return setErr('Mật khẩu tạm tối thiểu 8 ký tự');
    setBusy(true);
    try {
      await actions.resetMemberPassword(f.id, resetPw);
      ctx.notify('Đã đặt lại mật khẩu');
      setResetPw('');
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  }
  return html`<div>
    <div class="row between mb"><p class="muted">Mỗi người đăng nhập bằng email riêng. Nhân viên chỉ thấy checklist của mình; Quản lý nhóm xem & duyệt cho người trong nhóm; CEO và vai trò Chỉ xem thấy toàn công ty.</p>
      <button class="btn primary" onClick=${() => open({ full_name: '', role: 'staff', dept: Object.keys(U.DEPTS)[0] || '', title: '', email: '', password: '', emp_type: 'fulltime', track_late: true, needs_report: true, start_time: '' })}>+ Thêm người</button></div>
    <div class="tlist card">${state.people.map((p) => html`<div class="trow" onClick=${() => open(p)}>
      <${Avatar} p=${p} />
      <div class="tmain"><div class="ttitle">${p.full_name} ${p.active === false && html`<${Badge}>Đã nghỉ</${Badge}>`}</div>
        <div class="tmeta"><span class="tag">${U.ROLES[p.role]}</span>${U.isWorker(p) && html`<span class="tag">${U.deptName(p.dept)}</span>`}${p.emp_type && p.emp_type !== 'fulltime' && html`<span class="tag">${U.EMP_TYPES[p.emp_type]}</span>`}<span class="muted">${p.email || p.title || ''}</span>${p.telegram_linked && html`<span class="tag">✈️ Telegram</span>`}</div></div>
    </div>`)}</div>
    ${f && html`<${Modal} title=${f.id ? 'Sửa nhân sự' : 'Thêm nhân sự'} onClose=${() => setF(null)}>
      <form class="form" onSubmit=${save}>
        <label>Họ tên *<input id="m-name" value=${f.full_name} onInput=${(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <div class="grid2">
          <label>Vai trò<select id="m-role" value=${f.role} disabled=${f.id === ctx.me.id} onChange=${(e) => setF({ ...f, role: e.target.value })}>${Object.entries(U.ROLES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
          ${U.isWorker(f) && html`<label>Nhóm / phòng ban<select id="m-dept" value=${f.dept || ''} onChange=${(e) => setF({ ...f, dept: e.target.value })}><option value="">— Chưa xếp nhóm —</option>${Object.entries(U.DEPTS).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>`}
        </div>
        ${f.role === 'manager' && html`<p class="note small">Quản lý nhóm xem checklist, duyệt báo cáo và giao việc cho người trong nhóm của mình.</p>`}
        ${U.isWorker(f) && html`<fieldset class="fs"><legend>Add-on: loại nhân sự & giờ làm</legend>
          <div class="grid2">
            <label>Loại nhân sự<select id="m-emp" value=${f.emp_type || 'fulltime'} onChange=${(e) => {
              const t = e.target.value;
              setF({ ...f, emp_type: t, track_late: t === 'fulltime' ? true : f.track_late, needs_report: t === 'freelance' ? false : f.needs_report });
            }}>${Object.entries(U.EMP_TYPES).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label>
            <label>Giờ bắt đầu riêng <span class="muted small">(trống = giờ chung)</span><input id="m-start" type="time" value=${f.start_time || ''} onInput=${(e) => setF({ ...f, start_time: e.target.value })} /></label>
          </div>
          <label class="check"><input type="checkbox" checked=${f.track_late !== false} onChange=${(e) => setF({ ...f, track_late: e.target.checked })} /> Tính đi trễ (bỏ tick cho người làm giờ linh hoạt / remote)</label>
          <label class="check"><input type="checkbox" checked=${f.needs_report !== false} onChange=${(e) => setF({ ...f, needs_report: e.target.checked })} /> Phải nộp báo cáo cuối ngày</label>
        </fieldset>`}
        <label>Chức danh<input id="m-title" value=${f.title || ''} onInput=${(e) => setF({ ...f, title: e.target.value })} /></label>
        ${!f.id && html`
          <label>Email đăng nhập *<input id="m-email" type="email" value=${f.email} onInput=${(e) => setF({ ...f, email: e.target.value })} placeholder="ten@gmail.com" /></label>
          ${LIVE && html`<label>Mật khẩu tạm * <span class="muted small">(nhân viên tự đổi sau khi đăng nhập)</span><input id="m-pw" value=${f.password} onInput=${(e) => setF({ ...f, password: e.target.value })} autocomplete="off" /></label>
`}
          ${U.isWorker(f) && f.dept && html`<p class="note">Người mới tự nhận các routine của nhóm ${U.deptName(f.dept)}.</p>`}`}
        ${f.id && LIVE && f.id !== ctx.me.id && html`<div class="card pad">
          <b class="small">Đặt lại mật khẩu</b>
          <div class="row"><input id="m-reset" placeholder="Mật khẩu tạm mới" value=${resetPw} onInput=${(e) => setResetPw(e.target.value)} autocomplete="off" />
          <button type="button" class="btn" disabled=${busy} onClick=${doReset}>Đặt lại</button></div></div>`}
        ${err && html`<div class="err">${err}</div>`}
        <div class="row between">
          ${f.id && f.id !== ctx.me.id ? html`<label class="check"><input type="checkbox" checked=${f.active === false} onChange=${(e) => setF({ ...f, active: !e.target.checked })} /> Đã nghỉ việc (khoá)</label>` : html`<span></span>`}
          <div class="row"><button type="button" class="btn" onClick=${() => setF(null)}>Huỷ</button><button class="btn primary" disabled=${busy}>${busy ? 'Đang lưu…' : 'Lưu'}</button></div>
        </div>
      </form>
    </${Modal}>`}
  </div>`;
}

// ---------------------------------------------------------------------------
function Rules({ ctx }) {
  const s = ctx.state.settings;
  const [f, setF] = useState(s);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return html`<div class="card pad form narrow-form">
    <div class="grid2">
      <label>Giờ bắt đầu làm<input type="time" value=${f.work_start} onInput=${set('work_start')} /></label>
      <label>Giờ kết thúc<input type="time" value=${f.work_end} onInput=${set('work_end')} /></label>
      <label>Tính <b class="warn-t">trễ</b> nếu bấm Bắt đầu sau<input type="time" value=${f.late_after} onInput=${set('late_after')} /></label>
      <label>Tính <b class="bad-t">trễ nặng</b> nếu sau<input type="time" value=${f.very_late_after} onInput=${set('very_late_after')} /></label>
      <label>Hạn nộp báo cáo ngày<input type="time" value=${f.report_deadline} onInput=${set('report_deadline')} /></label>
      <label>Thứ 7 làm đến<input type="time" value=${f.sat_end || '12:30'} onInput=${set('sat_end')} /></label>
      <label>Hạn nộp báo cáo tuần (sáng thứ 7)<input type="time" value=${f.weekly_deadline} onInput=${set('weekly_deadline')} /></label>
      <label>Tab 🎬 Dự án hiển thị cho<select value=${f.projects_visible || 'admin'} onChange=${set('projects_visible')}>
        <option value="admin">Chỉ CEO / Quản trị</option><option value="managers">CEO + Quản lý nhóm</option><option value="all">Mọi người (không thấy phần tiền)</option></select></label>
    </div>
    <p class="muted small">Thứ 7 làm buổi sáng, vẫn bấm Bắt đầu và tính giờ, không phải nộp báo cáo ngày. Người có giờ bắt đầu riêng / không tính trễ: chỉnh trong Nhân sự. Phần tiền của dự án luôn chỉ CEO / Quản trị thấy.</p>
    <div class="row end"><button class="btn primary" onClick=${() => { actions.saveSettings(f); ctx.notify('Đã lưu'); }}>Lưu</button></div>
  </div>`;
}

// ---------------------------------------------------------------------------
function Notify({ ctx }) {
  const { me } = ctx;
  const isAdmin = me.role === 'admin';
  const n = me.notify || {};
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [code, setCode] = useState('');
  const toggle = (k) => actions.savePerson({ ...me, notify: { ...n, [k]: !n[k] } });
  async function enablePush() {
    if (!('serviceWorker' in navigator) || typeof Notification === 'undefined' || !('PushManager' in window))
      return ctx.notify('Trình duyệt này chưa hỗ trợ thông báo. iPhone: thêm app vào Màn hình chính rồi mở từ đó.', 'err');
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p !== 'granted') return ctx.notify('Bạn chưa cho phép thông báo', 'err');
    if (!LIVE || !CONFIG.VAPID_PUBLIC_KEY) {
      new Notification('Mummii Checklist', { body: '🔔 Thông báo thử: 10 phút nữa đến giờ "Dựng video ngắn theo kịch bản"', icon: 'assets/logo-mark.png' });
      return;
    }
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.VAPID_PUBLIC_KEY) }));
      await actions.savePushSub(sub);
      if (!n.push) actions.savePerson({ ...me, notify: { ...n, push: true } });
      await actions.testNotify();
      ctx.notify('Đã bật thông báo trên thiết bị này — vừa gửi 1 thông báo thử');
    } catch (e) {
      ctx.notify('Không bật được thông báo: ' + e.message, 'err');
    }
  }
  async function linkTelegram() {
    if (!LIVE) return ctx.notify('Bản thật: mở bot Telegram → bấm Start để liên kết');
    try {
      setCode(await actions.telegramCode());
    } catch (e) {
      ctx.notify(e.message, 'err');
    }
  }
  const botUrl = CONFIG.TELEGRAM_BOT && code ? `https://t.me/${CONFIG.TELEGRAM_BOT}?start=${code}` : '';
  const EVENTS = isAdmin
    ? ['Nhắc việc trước giờ (10 phút)', '9:15 — ai chưa bắt đầu ngày làm việc', 'Nhân viên báo vướng / cần hỗ trợ', 'Báo cáo ngày mới nộp, cần duyệt', '17:30 — tổng kết: ai chưa nộp báo cáo', 'Bản tin sáng từ trợ lý AI (8:30)']
    : ['8:50 — nhắc bấm Bắt đầu ngày làm việc', 'Nhắc việc trước giờ (10 phút)', 'Được giao việc mới', '16:30 — nhắc chốt báo cáo ngày', 'Việc quá hạn', 'Báo cáo được duyệt / bị trả lại'];
  return html`<div class="narrow-form">
    <div class="card pad mb">
      <h3>Nhận thông báo qua</h3>
      <div class="chan">
        <label class="check big"><input type="checkbox" checked=${isAdmin || n.push} disabled=${isAdmin} onChange=${() => toggle('push')} /> 📱 Thông báo của app <span class="muted small">(điện thoại & máy tính)</span></label>
        <button class="btn sm" onClick=${enablePush}>Bật trên thiết bị này</button>
      </div>
      ${perm === 'denied' && html`<p class="err small">Trình duyệt đang chặn thông báo — mở cài đặt trang để cho phép.</p>`}
      <p class="muted small">Bấm "Bật trên thiết bị này" trên <b>từng</b> máy/điện thoại muốn nhận. iPhone: mở app bằng Safari → Chia sẻ → <b>Thêm vào Màn hình chính</b>, mở app từ biểu tượng đó rồi bấm bật.</p>
      <div class="chan">
        <label class="check big"><input type="checkbox" checked=${isAdmin || n.telegram} disabled=${isAdmin} onChange=${() => toggle('telegram')} /> ✈️ Telegram ${me.telegram_linked && html`<span class="badge ok">Đã liên kết</span>`}</label>
        <button class="btn sm" onClick=${linkTelegram}>${me.telegram_linked ? 'Liên kết lại' : 'Liên kết Telegram'}</button>
      </div>
      ${code && html`<div class="note">
        ${botUrl ? html`Bấm <a href=${botUrl} target="_blank" rel="noopener"><b>mở bot Telegram</b></a> rồi nhấn <b>Start</b>.` : html`Mở bot Telegram của Mummii và gửi:`}
        Hoặc gửi cho bot dòng: <code>/start ${code}</code></div>`}
      ${isAdmin && html`<p class="note small">Quản lý luôn nhận qua cả 2 kênh (cần bật thông báo trên thiết bị và liên kết Telegram).</p>`}
    </div>
    <div class="card pad"><h3>Bạn sẽ được nhắc khi</h3><ul class="rlist">${EVENTS.map((e) => html`<li>🔔 ${e}</li>`)}</ul></div>
  </div>`;
}

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
function AiSettings({ ctx }) {
  return html`<div class="narrow-form">
    <div class="card pad mb form">
      <h3>🤖 Trợ lý AI — Google Gemini</h3>
      <p>Trợ lý chỉ dành cho tài khoản Quản lý. Chat được trong app (nút 🤖 góc phải) và qua Telegram.</p>
      <label>Model<select value=${ctx.state.settings.ai_model || 'gemini-flash'} onChange=${(e) => actions.saveSettings({ ai_model: e.target.value })}>
        <option value="gemini-flash">Gemini Flash — nhanh, gần như miễn phí (khuyên dùng)</option>
        <option value="gemini-pro">Gemini Pro — thông minh hơn, tốn tín dụng hơn</option>
      </select></label>
      <p class="note small">Chi phí trừ vào <b>$10 tín dụng Google Cloud/tháng</b> đi kèm gói Google AI Pro. Dữ liệu dùng theo điều khoản trả phí — không bị dùng để huấn luyện AI.</p>
      <h4>Trợ lý làm được gì</h4>
      <ul class="rlist">
        <li>➕ Thêm / dời / đánh dấu xong việc bằng lời nói thường</li>
        <li>📋 Trả lời "hôm nay còn gì?", "tuần này KPI thế nào?"</li>
        <li>👥 Tóm tắt tình hình team, ai trễ, ai đang vướng</li>
        <li>🏃 Ghi thói quen ("sáng nay chạy 5km")</li>
        <li>☀️ Gửi bản tin sáng 8:30 qua Telegram</li>
      </ul>
      ${!LIVE && html`<p class="muted small">Bản demo: trợ lý trả lời theo mẫu có sẵn (chưa gọi Gemini thật).</p>`}
    </div>
    ${!LIVE && html`<div class="card pad"><h3>Dữ liệu demo</h3><p class="muted">Xoá mọi thay đổi bạn đã bấm thử, quay về dữ liệu mẫu ban đầu.</p>
      <${ConfirmButton} cls="btn" label="↺ Khôi phục dữ liệu mẫu" ask="Bấm lần nữa để khôi phục" onConfirm=${() => { resetDemo(); ctx.notify('Đã khôi phục dữ liệu mẫu'); }} /></div>`}
  </div>`;
}
