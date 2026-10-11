// Màn hình "Hôm nay": checklist của 1 người + bắt đầu ngày + chốt báo cáo.
import { html, Modal, Badge, Bar, Seg, Empty, useNow, ConfirmButton } from './ui.js';
import { useState, useMemo, useEffect } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions } from './store.js';
import * as U from './util.js';
import { EvRow, myEventTasks } from './projects.js';

export function DayView({ ctx, person, date = U.todayStr(), readOnly = false, privacy = 'all', onPrivacy }) {
  useNow();
  const { state, me } = ctx;
  const isMe = person.id === me.id;
  const includePrivate = isMe && privacy !== 'work';
  const all = U.tasksForDay(state, person.id, date, { includePrivate });
  const tasks = privacy === 'private' ? all.filter((t) => t.scope === 'private') : all;
  const start = state.daystarts.find((x) => x.person_id === person.id && x.date === date);
  const leave = U.leaveOn(state, person.id, date);
  const workday = U.isWorkday(state, person.id, date);
  const isToday = date === U.todayStr();
  const canAct = !readOnly && isMe && isToday;
  const locked = canAct && workday && !start && U.isWorker(person);
  const [open, setOpen] = useState(null);
  const [showReport, setShowReport] = useState(false);

  const work = all.filter((t) => t.scope !== 'private');
  const doneN = work.filter((t) => t.status === 'done').length;
  const pending = U.sortTasks(tasks.filter((t) => t.status !== 'done'));
  const backlog = pending.filter((t) => {
    const f = U.taskFlags(t, date);
    return f.carried || f.overdue;
  });
  const counts = {
    doing: work.filter((t) => t.status === 'doing').length,
    blocked: work.filter((t) => t.status === 'blocked').length,
    overdue: work.filter((t) => U.taskFlags(t, date).overdue).length,
  };
  const yesterday = prevWorkday(state, person.id, date);
  const missed = yesterday
    ? state.tasks.filter((t) => t.owner_id === person.id && t.date === yesterday && (t.source === 'routine' || t.source === 'meeting') && t.status !== 'done' && t.scope !== 'private')
    : [];
  const report = state.reports.find((r) => r.person_id === person.id && r.date === date);

  return html`<div class="day">
    ${person.role !== 'bod' && html`<${StartCard} ctx=${ctx} person=${person} start=${start} leave=${leave} workday=${workday} canAct=${canAct} isToday=${isToday} />`}

    <div class="day-progress">
      <div class="row between">
        <div class="sumline">
          <b>${work.length} việc công ty</b>
          <span class="s-done">✅ ${doneN} xong</span>
          ${counts.doing > 0 && html`<span class="s-doing">🔄 ${counts.doing} đang làm</span>`}
          ${counts.blocked > 0 && html`<span class="s-blocked">🚧 ${counts.blocked} vướng</span>`}
          ${counts.overdue > 0 && html`<span class="s-over">⚠️ ${counts.overdue} quá hạn</span>`}
          <span class="muted">⬜ ${work.length - doneN - counts.doing - counts.blocked} chưa làm</span>
        </div>
        ${isMe && onPrivacy && html`<${Seg} value=${privacy} onChange=${onPrivacy} options=${[
          { id: 'all', label: 'Tất cả' },
          { id: 'work', label: '💼 Công việc' },
          { id: 'private', label: '🔒 Việc riêng' },
        ]} />`}
      </div>
      <${Bar} pct=${work.length ? (doneN / work.length) * 100 : 0} cls="brand" />
    </div>

    ${missed.length > 0 && privacy !== 'private' && html`<div class="alert warn">
      ⚠️ <b>${missed.length} việc routine bị miss</b> ngày ${U.fmtShort(yesterday)}: ${missed.map((t) => t.title).join(', ')}
    </div>`}

    ${canAct && !locked && html`<${QuickAdd} ctx=${ctx} person=${person} privacy=${privacy} />`}

    ${locked && html`<div class="alert info">👆 Bấm <b>Bắt đầu ngày làm việc</b> để mở checklist hôm nay.</div>`}

    ${isMe && isToday && privacy !== 'private' && myEventTasks(state, person.id).length > 0 && html`<section class="section">
      <div class="section-head"><h2>🏆 Việc giải đấu của tôi (3 ngày tới & quá hạn)</h2></div>
      <div class=${'ledger' + (locked ? ' dim' : '')}>${myEventTasks(state, person.id).map((t) => html`<${EvRow} key=${t.id} t=${t} ctx=${ctx} showEvent />`)}</div>
    </section>`}
    <${Ledger} ctx=${ctx} tasks=${tasks} backlog=${backlog} date=${date} locked=${locked} editable=${canAct && !locked} viewOnly=${readOnly || !isMe} onMore=${setOpen} privacy=${privacy} />

    ${U.isWorker(person) && person.needs_report !== false && isToday && workday && privacy !== 'private' && html`<${ReportCard} ctx=${ctx} person=${person} report=${report} canAct=${canAct} date=${date} onOpen=${() => setShowReport(true)} />`}

    ${open && html`<${TaskSheet} ctx=${ctx} task=${open.task} preset=${open.preset} readOnly=${readOnly || !isMe} onClose=${() => setOpen(null)} />`}
    ${showReport && html`<${ReportModal} ctx=${ctx} person=${person} date=${date} onClose=${() => setShowReport(false)} />`}
  </div>`;
}

// Sổ checklist: toàn bộ việc trong ngày trên 1 danh sách, cập nhật ngay tại dòng
function Ledger({ ctx, tasks, backlog, date, locked, editable, viewOnly, onMore, privacy }) {
  if (!tasks.length) return html`<${Empty}>Không có việc nào${privacy === 'private' ? ' riêng' : ''} hôm nay.</${Empty}>`;
  const rest = tasks.filter((t) => !backlog.includes(t)).sort((a, b) =>
    U.SLOTS.findIndex((x) => x.id === U.slotOfTask(a)) - U.SLOTS.findIndex((x) => x.id === U.slotOfTask(b)) ||
    (a.time || '99').localeCompare(b.time || '99') || U.PRIORITIES[a.priority || 'mid'].rank - U.PRIORITIES[b.priority || 'mid'].rank);
  const rows = [];
  if (backlog.length) {
    rows.push(html`<div class="lg-div bad">Tồn từ hôm trước / quá hạn · ${backlog.length}</div>`);
    backlog.forEach((t) => rows.push(html`<${CheckRow} key=${t.id} t=${t} ctx=${ctx} date=${date} editable=${editable} viewOnly=${viewOnly} onMore=${onMore} />`));
  }
  for (const s of U.SLOTS) {
    const list = rest.filter((t) => U.slotOfTask(t) === s.id);
    if (!list.length) continue;
    const dn = list.filter((t) => t.status === 'done').length;
    rows.push(html`<div class="lg-div">${s.label} · ${dn}/${list.length} xong</div>`);
    list.forEach((t) => rows.push(html`<${CheckRow} key=${t.id} t=${t} ctx=${ctx} date=${date} editable=${editable} viewOnly=${viewOnly} onMore=${onMore} />`));
  }
  return html`<div class=${'ledger' + (locked ? ' dim' : '') + (viewOnly ? ' view' : '')}>
    <div class="lg-head"><span>Giờ</span><span>Công việc</span><span>Trạng thái</span><span>Ghi chú / kết quả</span><span></span></div>
    ${rows}
  </div>`;
}

const STATUS_BTNS = [
  ['todo', '⬜', 'Chưa'],
  ['doing', '🔄', 'Đang làm'],
  ['blocked', '🚧', 'Vướng'],
  ['done', '✅', 'Xong'],
];

function CheckRow({ t, ctx, date, editable, viewOnly, onMore }) {
  const f = U.taskFlags(t, date);
  const kpi = t.kpi_id && ctx.state.kpis.find((k) => k.id === t.kpi_id);
  const [note, setNote] = useState(t.note || t.output || '');
  const [reason, setReason] = useState(t.block_reason || '');
  const [qty, setQty] = useState(t.qty ?? '');
  useEffect(() => setNote(t.note || t.output || ''), [t.note, t.output]);
  useEffect(() => setReason(t.block_reason || ''), [t.block_reason]);
  useEffect(() => setQty(t.qty ?? ''), [t.qty]);
  const save = (patch) => actions.updateTask(t.id, patch);
  const setStatus = (st) => {
    if (st === t.status) return;
    const patch = { status: st };
    if (st === 'done') patch.progress = 100;
    if (st === 'doing' && !t.progress) patch.progress = 50;
    if (st === 'done' && kpi && (qty === '' || qty == null)) patch.qty = 1;
    save(patch);
  };
  const meta = [];
  if (t.source === 'meeting') meta.push(html`<span class="m-meet">Họp</span>`);
  if (t.source === 'assigned') meta.push(html`<span class="m-assign">Được giao</span>`);
  if (t.source === 'adhoc') meta.push(html`<span>Phát sinh</span>`);
  if (t.source === 'plan') meta.push(html`<span>Kế hoạch</span>`);
  if (t.scope === 'private' && t.group) meta.push(html`<span>${U.groupOf(t.group).label}</span>`);
  if (kpi) meta.push(html`<span class="m-kpi">KPI: ${kpi.title}</span>`);
  if (f.overdue) meta.push(html`<span class="m-bad">${U.relDue(t.due_date, date)}</span>`);
  else if (f.dueToday) meta.push(html`<span class="m-warn">Hạn hôm nay</span>`);
  else if (t.due_date && t.status !== 'done' && t.source !== 'routine') meta.push(html`<span>${U.relDue(t.due_date, date)}</span>`);
  if (f.carried) meta.push(html`<span class="m-warn">Dời ${f.carriedDays} ngày</span>`);
  return html`<div class=${`crow st-${t.status} pr-${t.priority || 'mid'}`}>
    <div class="c-time">${t.time || '—'}${t.end_time ? html`<small>${t.end_time}</small>` : ''}</div>
    <div class="c-title">
      <div class="c-name">${t.scope === 'private' ? '🔒 ' : ''}${t.title}${t.priority === 'high' && t.status !== 'done' ? html` <span class="hi-dot" title="Ưu tiên cao">●</span>` : ''}</div>
      ${meta.length > 0 && html`<div class="c-meta">${meta}</div>`}
    </div>
    ${viewOnly ? html`<div class="c-status"><span class=${'spill sb-' + t.status}>${U.STATUS[t.status].icon} ${U.STATUS[t.status].label}${t.status === 'doing' ? ` ${t.progress || 0}%` : ''}${kpi && t.qty != null ? ` · ${t.qty} ${kpi.unit || ''}` : ''}</span></div>
    <div class="c-note">${t.status === 'blocked' && html`<div class="note-ro bad-t">🚧 ${reason || 'Chưa ghi lý do'}${t.need_help ? ' — cần: ' + t.need_help : ''}</div>`}${note && html`<div class="note-ro">${note}</div>`}</div>` : html`
    <div class="c-status" role="group" aria-label="Trạng thái">
      ${STATUS_BTNS.map(([k, ic, l]) => html`<button type="button" class=${'sb sb-' + k + (t.status === k ? ' on' : '')} disabled=${!editable} onClick=${() => setStatus(k)} title=${l}><span>${ic}</span><em>${l}</em></button>`)}

    </div>
    <div class="c-note">
      ${t.status === 'blocked' && !editable && html`<div class="note-ro bad-t">🚧 ${reason || 'Chưa ghi lý do'}</div>`}
      ${t.status === 'blocked' && editable && html`<input class="in-reason" value=${reason} placeholder="Lý do vướng, cần ai hỗ trợ…" onInput=${(e) => setReason(e.target.value)} onBlur=${() => reason !== (t.block_reason || '') && save({ block_reason: reason })} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`}
      <div class="note-line">
        ${t.status === 'doing' && html`<select class="pct" disabled=${!editable} value=${t.progress || 50} onChange=${(e) => save({ progress: Number(e.target.value) })} aria-label="Tiến độ">
          ${[...new Set([10, 25, 50, 75, 90, t.progress || 50])].sort((x, y) => x - y).map((v) => html`<option value=${v}>${v}%</option>`)}</select>`}
        ${kpi && html`<label class="qty" title=${'Số lượng tính KPI ' + kpi.title}><input type="number" min="0" disabled=${!editable} value=${qty} placeholder="0" onInput=${(e) => setQty(e.target.value)} onBlur=${() => String(qty) !== String(t.qty ?? '') && save({ qty: qty === '' ? null : Number(qty) })} /><span>${kpi.unit || 'sl'}</span></label>`}
        ${editable
          ? html`<input class="in-note" value=${note} placeholder="Ghi chú / kết quả…" onInput=${(e) => setNote(e.target.value)} onBlur=${() => note !== (t.note || t.output || '') && save({ note })} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`
          : html`<div class=${'note-ro' + (note ? '' : ' empty-ro')}>${note || '—'}</div>`}
      </div>
    </div>
    `}
    <button type="button" class="c-more" disabled=${!onMore} onClick=${() => onMore && onMore({ task: t })} title="Chi tiết: hạn chót, ưu tiên, xoá">⋯</button>
  </div>`;
}

function prevWorkday(state, pid, date) {
  for (let i = 1; i < 8; i++) {
    const d = U.addDays(-i, date);
    if (U.isWorkday(state, pid, d)) return d;
  }
  return null;
}

function StartCard({ ctx, person, start, leave, workday, canAct, isToday }) {
  const st = start && U.startStatus(start.started_at, ctx.state.settings, person);
  const sat = U.weekday(U.todayStr()) === 6;
  if (!workday)
    return html`<div class="startcard off"><span class="big">🌴</span><div><b>${leave ? U.LEAVE_TYPES[leave.type] : 'Ngày nghỉ'}</b><div class="muted">${leave?.note || 'Chủ nhật'}</div></div></div>`;
  if (start)
    return html`<div class=${'startcard ' + st.cls}>
      <span class="big">${st.cls === 'ok' ? '✅' : '⏰'}</span>
      <div><b>Đã bắt đầu lúc ${U.fmtTime(start.started_at)}</b>
        <div class="muted">${st.label}${sat ? ' · Thứ 7 làm việc tại nhà (WFH)' : ''}${leave ? ' · ' + U.LEAVE_TYPES[leave.type] : ''}</div></div>
    </div>`;
  if (!canAct)
    return html`<div class=${'startcard ' + (isToday && U.nowMin() > U.toMin(ctx.state.settings.late_after) ? 'bad' : '')}>
      <span class="big">⏳</span><div><b>Chưa bắt đầu ngày làm việc</b><div class="muted">${isToday ? 'Bây giờ ' + U.hm(U.nowMin()) : ''}</div></div></div>`;
  const late = U.nowMin() > U.toMin(ctx.state.settings.late_after);
  return html`<div class="startcard cta">
    <div>
      <b>${greet()}${U.isWorker(person) ? ' ' + person.full_name.split(' ').pop() : ''}!</b>
      <div class="muted">Giờ làm bắt đầu ${ctx.state.settings.work_start}${sat ? ' · Thứ 7 làm buổi sáng' : ''}. Hệ thống ghi nhận đúng thời điểm bạn bấm.</div>
    </div>
    <button class=${'btn start ' + (late ? 'late' : '')} onClick=${() => { actions.startDay(person.id); ctx.notify('Đã bắt đầu ngày làm việc lúc ' + U.hm(U.nowMin())); }}>
      ▶ Bắt đầu ngày làm việc <small>${U.hm(U.nowMin())}</small>
    </button>
  </div>`;
}
const greet = () => (U.nowMin() < 11 * 60 ? 'Chào buổi sáng' : U.nowMin() < 18 * 60 ? 'Chào buổi chiều' : 'Chào buổi tối');

function TaskGroup({ title, tasks, date, ctx, onOpen, tone }) {
  return html`<section class=${'tgroup ' + (tone || '')}>
    <div class="tgroup-head">${title} <span class="count">${tasks.length}</span></div>
    ${tasks.length ? html`<div class="tlist">${tasks.map((t) => html`<${TaskRow} key=${t.id} t=${t} date=${date} ctx=${ctx} onOpen=${onOpen} />`)}</div>` : html`<div class="tempty">Trống</div>`}
  </section>`;
}

export function TaskRow({ t, date, ctx, onOpen, showOwner }) {
  const f = U.taskFlags(t, date);
  const kpi = t.kpi_id && ctx.state.kpis.find((k) => k.id === t.kpi_id);
  const assigner = t.assigned_by && ctx.state.people.find((p) => p.id === t.assigned_by);
  const owner = showOwner && ctx.state.people.find((p) => p.id === t.owner_id);
  const open = (preset) => onOpen && onOpen({ task: t, preset });
  return html`<div class=${'trow st-' + t.status + (onOpen ? '' : ' ro')}>
    <button class="tcheck" aria-label="Cập nhật trạng thái" onClick=${() => open(t.status === 'done' ? null : 'done')}>${U.STATUS[t.status].icon}</button>
    <div class="tmain" onClick=${() => open(null)}>
      <div class="ttitle">${t.scope === 'private' && html`<span title="Việc riêng">🔒 </span>`}${t.title}</div>
      <div class="tmeta">
        ${owner && html`<span class="tag">${owner.full_name}</span>`}
        ${t.time && html`<span class="time">🕐 ${t.time}${t.end_time ? '–' + t.end_time : ''}</span>`}
        ${t.source === 'meeting' && html`<span class="tag meet">Họp</span>`}
        ${t.source === 'routine' && html`<span class="tag">Routine</span>`}
        ${t.source === 'assigned' && html`<span class="tag assign">Giao bởi ${assigner?.full_name || 'Quản lý'}</span>`}
        ${t.scope === 'private' && t.group && html`<span class="tag">${U.groupOf(t.group).icon} ${U.groupOf(t.group).label}</span>`}
        ${t.priority === 'high' && t.status !== 'done' && html`<span class="tag hi">🔴 Ưu tiên cao</span>`}
        ${kpi && html`<span class="tag kpi">🎯 ${kpi.title}</span>`}
        ${f.overdue && html`<${Badge} cls="bad">${U.relDue(t.due_date, date)}</${Badge}>`}
        ${!f.overdue && f.dueToday && html`<${Badge} cls="warn">Hạn hôm nay</${Badge}>`}
        ${!f.overdue && !f.dueToday && t.due_date && t.status !== 'done' && t.source !== 'routine' && html`<span class="muted small">${U.relDue(t.due_date, date)}</span>`}
        ${f.carried && html`<${Badge} cls="warn">Dời ${f.carriedDays} ngày</${Badge}>`}
        ${t.status === 'doing' && html`<${Badge} cls="info">Đang làm ${t.progress || 0}%</${Badge}>`}
        ${t.status === 'blocked' && html`<${Badge} cls="bad">🚧 Vướng</${Badge}>`}
      </div>
      ${(t.output || t.note || t.block_reason) && html`<div class="tnote">
        ${t.output && html`<span>📤 ${t.output}</span>`}
        ${t.block_reason && html`<span>🚧 ${t.block_reason}${t.need_help ? ' — cần: ' + t.need_help : ''}</span>`}
        ${t.note && html`<span>📝 ${t.note}</span>`}
      </div>`}
    </div>
  </div>`;
}

function QuickAdd({ ctx, person, privacy }) {
  const [v, setV] = useState('');
  const [more, setMore] = useState(false);
  const priv = privacy === 'private';
  function add(e) {
    e.preventDefault();
    if (!v.trim()) return setMore(true);
    actions.addTask({ owner_id: person.id, title: v.trim(), scope: priv ? 'private' : 'work', group: priv ? 'other' : null });
    ctx.notify(`Đã thêm ${priv ? 'việc riêng' : 'việc phát sinh'}`);
    setV('');
  }
  return html`<form class="quickadd" onSubmit=${add}>
    <input value=${v} onInput=${(e) => setV(e.target.value)} placeholder=${priv ? '+ Thêm việc riêng 🔒…' : '+ Thêm việc phát sinh… (Enter)'} />
    <button type="button" class="btn" onClick=${() => setMore(true)}>Chi tiết</button>
    ${more && html`<${TaskForm} ctx=${ctx} person=${person} initial=${{ title: v, scope: priv ? 'private' : 'work' }} onClose=${() => { setMore(false); setV(''); }} />`}
  </form>`;
}

// Thêm / giao việc với đủ thông tin
export function TaskForm({ ctx, person, initial = {}, assign = false, onClose }) {
  const { state, me } = ctx;
  const staff = U.visibleWorkers(state, me);
  const [f, setF] = useState({ title: '', priority: 'mid', date: U.todayStr(), due_date: '', time: '', scope: 'work', group: 'other', owner_id: assign ? staff[0]?.id : person.id, note: '', kpi_id: '', ...initial });
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const canPrivate = !assign && person.id === me.id && me.role === 'admin';
  const kpis = state.kpis.filter((k) => k.owner_id === f.owner_id && k.active);
  function save(e) {
    e.preventDefault();
    if (!f.title.trim()) return;
    actions.addTask({
      ...f, title: f.title.trim(), time: f.time || null, due_date: f.due_date || null, kpi_id: f.kpi_id || null,
      group: f.scope === 'private' ? f.group : null,
      source: assign ? 'assigned' : f.date > U.todayStr() ? 'plan' : 'adhoc', assigned_by: assign ? me.id : null,
    });
    ctx.notify(assign ? `Đã giao việc — ${state.people.find((p) => p.id === f.owner_id).full_name} sẽ nhận thông báo` : 'Đã thêm việc');
    onClose();
  }
  return html`<${Modal} title=${assign ? 'Giao việc cho nhân viên' : 'Thêm việc'} onClose=${onClose}>
    <form class="form" onSubmit=${save}>
      ${assign && html`<label>Giao cho
        <select value=${f.owner_id} onChange=${set('owner_id')}>${staff.map((p) => html`<option value=${p.id}>${p.full_name} — ${U.deptName(p.dept)}</option>`)}</select></label>`}
      <label>Tên công việc *<input value=${f.title} onInput=${set('title')} autofocus placeholder="VD: Gửi kịch bản cho khách duyệt" /></label>
      ${canPrivate && html`<div class="chips">
        <button type="button" class=${'chip ' + (f.scope === 'work' ? 'on' : '')} onClick=${() => setF({ ...f, scope: 'work' })}>💼 Công việc công ty</button>
        <button type="button" class=${'chip ' + (f.scope === 'private' ? 'on' : '')} onClick=${() => setF({ ...f, scope: 'private' })}>🔒 Việc riêng (chỉ mình tôi thấy)</button>
      </div>`}
      ${f.scope === 'private' && html`<div class="chips">${U.PRIVATE_GROUPS.map((g) => html`<button type="button" class=${'chip ' + (f.group === g.id ? 'on' : '')} onClick=${() => setF({ ...f, group: g.id })}>${g.icon} ${g.label}</button>`)}</div>`}
      <div class="grid2">
        <label>Bắt đầu từ ngày<input type="date" value=${f.date} onInput=${set('date')} /></label>
        <label>Hạn chót<input type="date" value=${f.due_date} min=${f.date} onInput=${set('due_date')} /></label>
      </div>
      <div class="grid2">
        <label>Giờ (nếu cố định)<input type="time" value=${f.time} onInput=${set('time')} /></label>
        <label>Ưu tiên
          <select value=${f.priority} onChange=${set('priority')}>${Object.entries(U.PRIORITIES).map(([k, p]) => html`<option value=${k}>${p.icon} ${p.label}</option>`)}</select></label>
      </div>
      ${f.scope === 'work' && kpis.length > 0 && html`<label>Tính vào KPI (không bắt buộc)
        <select value=${f.kpi_id} onChange=${set('kpi_id')}><option value="">— Không —</option>${kpis.map((k) => html`<option value=${k.id}>${k.title}</option>`)}</select></label>`}
      <label>Mô tả / ghi chú<textarea rows="2" value=${f.note} onInput=${set('note')}></textarea></label>
      <p class="muted small">Việc kéo dài nhiều ngày: đặt hạn chót xa hơn — việc sẽ hiện mỗi ngày đến khi xong, quá hạn sẽ báo đỏ.</p>
      <div class="row end"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary">${assign ? 'Giao việc' : 'Thêm'}</button></div>
    </form>
  </${Modal}>`;
}

// Cập nhật 1 việc: trạng thái + kết quả + ghi chú (tick ≠ xong)
export function TaskSheet({ ctx, task, preset, readOnly, onClose }) {
  const kpi = task.kpi_id && ctx.state.kpis.find((k) => k.id === task.kpi_id);
  const [f, setF] = useState({
    status: preset || task.status, progress: task.progress || 0, output: task.output || '', qty: task.qty ?? '', note: task.note || '',
    block_reason: task.block_reason || '', need_help: task.need_help || '', due_date: task.due_date || '', priority: task.priority || 'mid',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const editableMeta = task.source !== 'routine' && task.source !== 'meeting';
  function save() {
    const patch = { ...f, qty: f.qty === '' ? null : Number(f.qty), progress: f.status === 'done' ? 100 : Number(f.progress) };
    if (f.status === 'blocked' && !f.block_reason.trim()) return ctx.notify('Ghi lý do vướng để quản lý biết hỗ trợ', 'err');
    actions.updateTask(task.id, patch);
    ctx.notify(f.status === 'done' ? 'Đã xong ✓' : 'Đã cập nhật');
    onClose();
  }
  if (readOnly)
    return html`<${Modal} title=${task.title} onClose=${onClose}>
      <dl class="infolist">
        <dt>Trạng thái</dt><dd>${U.STATUS[task.status].icon} ${U.STATUS[task.status].label}${task.status === 'doing' ? ` (${task.progress}%)` : ''}</dd>
        ${task.output && html`<dt>Kết quả</dt><dd>${task.output}</dd>`}
        ${task.qty != null && html`<dt>Số lượng</dt><dd>${task.qty} ${kpi?.unit || ''}</dd>`}
        ${task.block_reason && html`<dt>Lý do vướng</dt><dd>${task.block_reason}</dd>`}
        ${task.need_help && html`<dt>Cần hỗ trợ</dt><dd>${task.need_help}</dd>`}
        ${task.note && html`<dt>Ghi chú</dt><dd class="pre">${task.note}</dd>`}
        ${task.due_date && html`<dt>Hạn chót</dt><dd>${U.fmtDate(task.due_date)}</dd>`}
        <dt>Bắt đầu</dt><dd>${U.fmtDate(task.date)}</dd>
        ${task.done_at && html`<dt>Xong lúc</dt><dd>${U.fmtTime(task.done_at)} ${U.fmtShort(U.dateStr(new Date(task.done_at)))}</dd>`}
      </dl>
      <div class="row mt"><${DeleteTask} ctx=${ctx} task=${task} onDone=${onClose} /></div>
    </${Modal}>`;
  return html`<${Modal} title=${task.title} onClose=${onClose}>
    <div class="form">
      <div class="statuschips">
        ${Object.entries(U.STATUS).map(([k, s]) => html`<button type="button" class=${'schip s-' + k + (f.status === k ? ' on' : '')} onClick=${() => setF({ ...f, status: k })}>${s.icon} ${s.label}</button>`)}
      </div>
      ${f.status === 'doing' && html`<label>Tiến độ: <b>${f.progress}%</b><input type="range" min="0" max="90" step="10" value=${f.progress} onInput=${set('progress')} /></label>`}
      ${f.status === 'blocked' && html`<div class="grid1">
        <label>Lý do vướng *<input value=${f.block_reason} onInput=${set('block_reason')} placeholder="VD: Chưa nhận được file từ khách" /></label>
        <label>Cần ai hỗ trợ gì?<input value=${f.need_help} onInput=${set('need_help')} placeholder="VD: Nhờ quản lý duyệt nội dung" /></label>
      </div>`}
      ${(f.status === 'done' || f.status === 'doing') && html`<div class=${kpi ? 'grid2' : ''}>
        <label>Kết quả / output<input value=${f.output} onInput=${set('output')} placeholder="VD: 2 bài, link…" /></label>
        ${kpi && html`<label>Số lượng tính KPI (${kpi.unit || 'đơn vị'})<input type="number" min="0" value=${f.qty} onInput=${set('qty')} placeholder="1" /></label>`}
      </div>`}
      <label>Ghi chú<textarea rows="2" value=${f.note} onInput=${set('note')} placeholder="Còn bất cập gì, bàn giao gì…"></textarea></label>
      ${editableMeta && html`<div class="grid2">
        <label>Hạn chót<input type="date" value=${f.due_date} onInput=${set('due_date')} /></label>
        <label>Ưu tiên<select value=${f.priority} onChange=${set('priority')}>${Object.entries(U.PRIORITIES).map(([k, p]) => html`<option value=${k}>${p.icon} ${p.label}</option>`)}</select></label>
      </div>`}
      <div class="row between">
        <${DeleteTask} ctx=${ctx} task=${task} onDone=${onClose} />
        <div class="row"><button class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary" onClick=${save}>Lưu</button></div>
      </div>
    </div>
  </${Modal}>`;
}

// Ai được xoá: chủ việc với việc tự thêm (phát sinh/kế hoạch); quản lý với mọi việc công ty.
// Việc routine/họp chỉ "bỏ" riêng ngày đó (ẩn đi), routine vẫn lặp các ngày sau.
function DeleteTask({ ctx, task, onDone }) {
  const { me } = ctx;
  const isAdmin = me.role === 'admin';
  const own = task.owner_id === me.id;
  const recurring = task.source === 'routine' || task.source === 'meeting';
  const owner = ctx.state.people.find((p) => p.id === task.owner_id);
  const allowed = (isAdmin && (task.scope === 'work' || own)) || (task.scope === 'work' && owner && U.canManage(me, owner)) || (own && (task.source === 'adhoc' || task.source === 'plan'));
  if (!allowed)
    return html`<span class="muted small">${task.source === 'assigned' ? 'Việc được giao — chỉ quản lý xoá được.' : recurring ? 'Việc lặp lại do quản lý đặt — nhờ quản lý bỏ nếu hôm nay không cần làm.' : ''}</span>`;
  const label = recurring ? 'Bỏ việc này hôm nay' : 'Xoá việc';
  const ask = recurring ? 'Bấm lần nữa để bỏ (các ngày sau vẫn lặp)' : 'Bấm lần nữa để xoá';
  return html`<${ConfirmButton} label=${'🗑 ' + label} ask=${ask} onConfirm=${() => {
    actions.deleteTask(task.id, recurring);
    ctx.notify(recurring ? 'Đã bỏ việc này cho hôm nay' : 'Đã xoá việc');
    onDone();
  }} />`;
}

function ReportCard({ ctx, person, report, canAct, date, onOpen }) {
  const s = ctx.state.settings;
  const sat = U.weekday(date) === 6;
  if (sat) return html`<div class="reportcard muted">🏠 Thứ 7 làm việc tại nhà — không cần nộp báo cáo ngày.</div>`;
  if (report)
    return html`<div class=${'reportcard ' + (report.status === 'approved' ? 'ok' : report.status === 'returned' ? 'bad' : 'info')}>
      <div><b>${report.status === 'approved' ? '✅ Báo cáo đã được duyệt' : report.status === 'returned' ? '↩ Báo cáo bị trả lại' : '📨 Đã nộp báo cáo — chờ duyệt'}</b>
        <div class="muted">Nộp lúc ${U.fmtTime(report.submitted_at)}${U.minutesOf(report.submitted_at) > U.toMin(s.report_deadline) ? ' (trễ hạn ' + s.report_deadline + ')' : ''}</div>
        ${report.manager_note && html`<div class="mnote">💬 Quản lý: ${report.manager_note}</div>`}</div>
      ${canAct && html`<button class="btn" onClick=${onOpen}>${report.status === 'returned' ? 'Sửa & nộp lại' : 'Xem / sửa'}</button>`}
    </div>`;
  const left = U.toMin(s.report_deadline) - U.nowMin();
  return html`<div class=${'reportcard ' + (left < 0 ? 'bad' : left < 60 ? 'warn' : '')}>
    <div><b>📝 Báo cáo cuối ngày</b>
      <div class="muted">${left < 0 ? `Đã quá hạn ${s.report_deadline}!` : `Hạn nộp ${s.report_deadline} (còn ${U.hm(left)})`} · Phần việc đã làm được tự điền từ checklist.</div></div>
    ${canAct && html`<button class="btn primary" onClick=${onOpen}>Chốt báo cáo</button>`}
  </div>`;
}

function ReportModal({ ctx, person, date, onClose }) {
  const { state } = ctx;
  const existing = state.reports.find((r) => r.person_id === person.id && r.date === date);
  const tasks = U.tasksForDay(state, person.id, date, { includePrivate: false });
  const done = tasks.filter((t) => t.status === 'done');
  const undone = tasks.filter((t) => t.status !== 'done');
  const adhoc = tasks.filter((t) => t.source === 'adhoc' && t.date === date);
  const tomorrow = U.addDays(1, date);
  const [blockers, setBlockers] = useState(existing?.blockers || '');
  const [reasons, setReasons] = useState(Object.fromEntries(undone.map((t) => [t.id, t.block_reason || ''])));
  const [plan, setPlan] = useState(existing?.plan ? existing.plan.split('\n') : ['', '', '']);
  const autoTomorrow = useMemo(() => U.tasksForDay(state, person.id, tomorrow, { includePrivate: false }).filter((t) => t.source === 'routine').length, []);
  function submit() {
    const items = plan.map((x) => x.trim()).filter(Boolean);
    if (items.length < 1) return ctx.notify('Ghi ít nhất 1 việc kế hoạch ngày mai', 'err');
    for (const t of undone) if (reasons[t.id] !== (t.block_reason || '')) actions.updateTask(t.id, { block_reason: reasons[t.id] });
    if (!existing) for (const title of items) actions.addTask({ owner_id: person.id, title, date: tomorrow, source: 'plan' });
    actions.submitReport(person.id, { blockers, plan: items.join('\n') });
    ctx.notify('Đã nộp báo cáo — quản lý sẽ nhận thông báo');
    onClose();
  }
  return html`<${Modal} title=${'Báo cáo cuối ngày — ' + U.fmtDayLong(date)} onClose=${onClose} wide>
    <div class="form report">
      <section><h3>1 · Đã hoàn thành (${done.length})</h3>
        ${done.length ? html`<ul class="rlist">${done.map((t) => html`<li>✅ ${t.title}${t.output ? html` — <span class="muted">${t.output}</span>` : ''}</li>`)}</ul>` : html`<p class="muted">Chưa có việc nào xong.</p>`}
      </section>
      <section><h3>2 · Chưa hoàn thành (${undone.length}) <small class="muted">— ghi lý do thực tế. Việc phát sinh tự dời sang mai; routine không làm sẽ tính miss</small></h3>
        ${undone.map((t) => html`<div class="rrow"><span>${U.STATUS[t.status].icon} ${t.title}${t.status === 'doing' ? ` (${t.progress}%)` : ''}</span>
          <input placeholder="Lý do chưa xong" value=${reasons[t.id]} onInput=${(e) => setReasons({ ...reasons, [t.id]: e.target.value })} /></div>`)}
        ${!undone.length && html`<p class="muted">Tuyệt vời, không còn việc tồn.</p>`}
      </section>
      ${adhoc.length > 0 && html`<section><h3>3 · Việc phát sinh trong ngày</h3><ul class="rlist">${adhoc.map((t) => html`<li>${U.STATUS[t.status].icon} ${t.title}</li>`)}</ul></section>`}
      <label>🚧 Vướng mắc / cần hỗ trợ từ ai?<textarea rows="2" value=${blockers} onInput=${(e) => setBlockers(e.target.value)}></textarea></label>
      <div><b>📋 Kế hoạch ngày mai</b> <span class="muted small">(${autoTomorrow} việc routine đã có sẵn — ghi thêm việc cụ thể)</span>
        ${plan.map((p, i) => html`<input class="planin" value=${p} placeholder=${`${i + 1}. Việc cụ thể…`} onInput=${(e) => setPlan(plan.map((x, j) => (j === i ? e.target.value : x)))} />`)}
        <button type="button" class="link" onClick=${() => setPlan([...plan, ''])}>+ Thêm dòng</button>
      </div>
      <div class="row end"><button class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary" onClick=${submit}>📨 Nộp báo cáo</button></div>
    </div>
  </${Modal}>`;
}
