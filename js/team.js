// Dashboard team theo ngày (Quản lý & BOD) + chi tiết từng người + duyệt báo cáo.
import { html, Modal, Avatar, Badge, Bar, Stat, Section, Empty, useNow } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions } from './store.js';
import { DayView, TaskForm, TaskRow } from './today.js';
import { KpiList } from './kpi.js';
import * as U from './util.js';

export function TeamView({ ctx }) {
  useNow();
  const { state, me } = ctx;
  const [date, setDate] = useState(U.todayStr());
  const [openP, setOpenP] = useState(null);
  const [assign, setAssign] = useState(false);
  const isAdmin = U.isLeader(me);
  const people = [...U.visibleWorkers(state, me), ...(me.role === 'bod' ? state.people.filter((p) => p.role === 'admin' && p.active !== false) : [])];
  const rows = people.map((p) => dayRow(state, p, date));
  const workers = rows.filter((r) => r.workday);
  const started = workers.filter((r) => r.start);
  const onTime = started.filter((r) => r.ss.cls === 'ok');
  const totalT = rows.reduce((a, r) => a + r.total, 0);
  const doneT = rows.reduce((a, r) => a + r.done, 0);
  const blocked = rows.flatMap((r) => r.tasks.filter((t) => t.status === 'blocked'));
  const overdue = rows.reduce((a, r) => a + r.overdue, 0);
  const staffRows = rows.filter((r) => U.isWorker(r.p) && r.p.needs_report !== false && r.workday && U.weekday(date) !== 6);
  const submitted = staffRows.filter((r) => r.report);
  const pendingReview = submitted.filter((r) => r.report.status === 'submitted');
  const isToday = date === U.todayStr();

  return html`<div class="page">
    <div class="page-head">
      <div><h1>Team ${isToday ? 'hôm nay' : ''}</h1><div class="muted">${U.fmtDayLong(date)}${U.weekday(date) === 6 ? ' · Thứ 7 làm buổi sáng' : ''}</div></div>
      <div class="row">
        <button class="btn" onClick=${() => setDate(U.addDays(-1, date))}>‹</button>
        <input type="date" value=${date} max=${U.todayStr()} onInput=${(e) => e.target.value && setDate(e.target.value)} />
        <button class="btn" disabled=${isToday} onClick=${() => setDate(U.addDays(1, date))}>›</button>
        ${isAdmin && html`<button class="btn primary" onClick=${() => setAssign(true)}>+ Giao việc</button>`}
      </div>
    </div>

    <div class="stats">
      <${Stat} value=${`${started.length}/${workers.length}`} label="Đã bắt đầu làm việc" cls=${started.length < workers.length && isToday && U.nowMin() > U.toMin(state.settings.late_after) ? 'warn' : ''} />
      <${Stat} value=${`${onTime.length}/${started.length}`} label="Bắt đầu đúng giờ" cls=${onTime.length < started.length ? 'warn' : 'ok'} />
      <${Stat} value=${totalT ? Math.round((doneT / totalT) * 100) + '%' : '—'} label=${`Việc đã xong (${doneT}/${totalT})`} />
      <${Stat} value=${blocked.length} label="Việc đang vướng" cls=${blocked.length ? 'bad' : ''} />
      <${Stat} value=${overdue} label="Việc quá hạn" cls=${overdue ? 'bad' : ''} />
      ${U.weekday(date) !== 6 && html`<${Stat} value=${`${submitted.length}/${staffRows.length}`} label=${`Báo cáo đã nộp${pendingReview.length ? ` · ${pendingReview.length} chờ duyệt` : ''}`} cls=${pendingReview.length ? 'info' : ''} />`}
    </div>

    ${blocked.length > 0 && html`<${Section} title="🚧 Đang vướng — cần hỗ trợ">
      <div class="tlist card">${blocked.map((t) => html`<${TaskRow} t=${t} date=${date} ctx=${ctx} showOwner />`)}</div>
    </${Section}>`}

    ${Object.entries({ ...(me.role === 'bod' ? { lead: 'Ban lãnh đạo' } : {}), ...U.DEPTS, _none: 'Chưa xếp nhóm' }).map(([dk, dl]) => {
      const list = rows.filter((r) => (dk === 'lead' ? r.p.role === 'admin' : U.isWorker(r.p) && (dk === '_none' ? !U.DEPTS[r.p.dept] : r.p.dept === dk)));
      if (!list.length) return null;
      return html`<${Section} title=${dl} key=${dk}>
        <div class="pgrid">${list.map((r) => html`<${PersonCard} r=${r} ctx=${ctx} date=${date} onOpen=${() => setOpenP(r.p)} />`)}</div>
      </${Section}>`;
    })}

    ${openP && html`<${PersonDrawer} ctx=${ctx} person=${openP} date=${date} onClose=${() => setOpenP(null)} />`}
    ${assign && html`<${TaskForm} ctx=${ctx} person=${me} assign onClose=${() => setAssign(false)} />`}
  </div>`;
}

export function dayRow(state, p, date) {
  const tasks = U.tasksForDay(state, p.id, date, { includePrivate: false });
  const done = tasks.filter((t) => t.status === 'done').length;
  const start = state.daystarts.find((x) => x.person_id === p.id && x.date === date);
  return {
    p, tasks, total: tasks.length, done, start,
    ss: start && U.startStatus(start.started_at, state.settings, p),
    workday: U.isWorkday(state, p.id, date),
    leave: U.leaveOn(state, p.id, date),
    overdue: tasks.filter((t) => U.taskFlags(t, date).overdue).length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    report: state.reports.find((r) => r.person_id === p.id && r.date === date),
  };
}

function PersonCard({ r, ctx, date, onOpen }) {
  const { p } = r;
  const isAdmin = U.canManage(ctx.me, r.p);
  const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
  const notStartedLate = !r.start && r.workday && date === U.todayStr() && U.nowMin() > U.toMin(ctx.state.settings.late_after);
  return html`<div class="pcard" onClick=${onOpen}>
    <div class="pcard-head">
      <${Avatar} p=${p} size=${38} />
      <div class="grow"><b>${p.full_name}</b><div class="muted small">${p.title || U.ROLES[p.role]}</div></div>
      ${!r.workday ? html`<${Badge} cls="info">🌴 ${r.leave ? U.LEAVE_TYPES[r.leave.type] : 'Nghỉ'}</${Badge}>`
        : r.start ? html`<${Badge} cls=${r.ss.cls} title="Giờ bấm Bắt đầu">${U.fmtTime(r.start.started_at)} · ${r.ss.label}</${Badge}>`
        : html`<${Badge} cls=${notStartedLate ? 'bad' : ''}>Chưa bắt đầu</${Badge}>`}
    </div>
    ${r.workday && html`<div>
      <div class="row between small"><span>${r.done}/${r.total} việc xong</span><b>${pct}%</b></div>
      <${Bar} pct=${pct} cls=${date < U.todayStr() ? U.pctCls(pct, 80, 50) : 'brand'} />
      <div class="row small gap">
        ${r.blocked > 0 && html`<${Badge} cls="bad">🚧 ${r.blocked} vướng</${Badge}>`}
        ${r.overdue > 0 && html`<${Badge} cls="bad">${r.overdue} quá hạn</${Badge}>`}
        ${U.isWorker(p) && p.needs_report !== false && U.weekday(date) !== 6 && (r.report
          ? html`<${Badge} cls=${r.report.status === 'approved' ? 'ok' : r.report.status === 'returned' ? 'bad' : 'info'}>${r.report.status === 'approved' ? '✓ Đã duyệt BC' : r.report.status === 'returned' ? 'BC bị trả lại' : '📨 BC chờ duyệt'}</${Badge}>`
          : html`<span class="muted">Chưa nộp BC</span>`)}
        ${isAdmin && r.report?.status === 'submitted' && html`<button class="btn sm primary push" onClick=${(e) => { e.stopPropagation(); actions.reviewReport(r.report.id, 'approved'); ctx.notify('Đã duyệt báo cáo của ' + p.full_name); }}>✓ Duyệt</button>`}
      </div>
    </div>`}
  </div>`;
}

export function PersonDrawer({ ctx, person, date, onClose }) {
  const { state, me } = ctx;
  const isAdmin = U.canManage(me, person);
  const [tab, setTab] = useState('day');
  const [note, setNote] = useState('');
  const report = state.reports.find((r) => r.person_id === person.id && r.date === date);
  const ws = U.weekStart(date);
  const weekly = state.weekly.find((w) => w.person_id === person.id && w.week === ws);
  const [from, to] = U.periodRange('month', date);
  const st = U.personStats(state, person, from, to);
  return html`<div class="drawer-overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose()}>
    <aside class="drawer">
      <div class="drawer-head">
        <div class="row"><${Avatar} p=${person} size=${42} /><div><h2>${person.full_name}</h2><div class="muted">${person.title || ''} · ${U.isWorker(person) ? U.deptName(person.dept) : U.ROLES[person.role]}${person.emp_type && person.emp_type !== 'fulltime' ? ' · ' + U.EMP_TYPES[person.emp_type] : ''}</div></div></div>
        <button class="x" onClick=${onClose}>×</button>
      </div>
      <div class="drawer-tabs">
        ${[['day', 'Checklist ' + U.fmtShort(date)], ['report', 'Báo cáo'], ['kpi', 'KPI'], ['month', 'Tháng này']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}
      </div>
      <div class="drawer-body">
        ${tab === 'day' && html`<${DayView} ctx=${ctx} person=${person} date=${date} readOnly />`}
        ${tab === 'report' && html`<div class="grid1">
          ${!U.isWorker(person) || person.needs_report === false ? html`<${Empty}>Người này không cần nộp báo cáo.</${Empty}>`
            : !report ? html`<${Empty}>${U.weekday(date) === 6 ? 'Thứ 7 không cần nộp báo cáo ngày.' : 'Chưa nộp báo cáo ngày ' + U.fmtShort(date) + '.'}</${Empty}>`
            : html`<div class="card pad">
              <div class="row between"><b>Báo cáo ngày ${U.fmtShort(date)}</b><span class="muted">Nộp ${U.fmtTime(report.submitted_at)}</span></div>
              <${ReportBody} state=${state} person=${person} date=${date} report=${report} />
              ${isAdmin && html`<div class="review">
                <input placeholder="Nhận xét (không bắt buộc)" value=${note} onInput=${(e) => setNote(e.target.value)} />
                <div class="row end">
                  <button class="btn" onClick=${() => { actions.reviewReport(report.id, 'returned', note || 'Bổ sung thêm chi tiết nhé'); ctx.notify('Đã trả lại báo cáo'); }}>↩ Trả lại</button>
                  <button class="btn primary" onClick=${() => { actions.reviewReport(report.id, 'approved', note); ctx.notify('Đã duyệt'); }}>✓ Xác nhận</button>
                </div>
              </div>`}
              ${report.status !== 'submitted' && html`<p class="muted small">Trạng thái: ${report.status === 'approved' ? '✓ Đã xác nhận' : '↩ Đã trả lại'}${report.manager_note ? ' — ' + report.manager_note : ''}</p>`}
            </div>`}
          ${U.isWorker(person) && html`<div class="card pad"><b>Báo cáo tuần ${U.fmtShort(ws)}</b>
            ${weekly ? html`<${WeeklyBody} w=${weekly} />` : html`<p class="muted">Chưa nộp.</p>`}
            ${isAdmin && weekly?.status === 'submitted' && html`<div class="row end"><button class="btn primary" onClick=${() => actions.reviewWeekly(weekly.id, 'approved')}>✓ Xác nhận báo cáo tuần</button></div>`}
          </div>`}
        </div>`}
        ${tab === 'kpi' && html`<${KpiList} ctx=${ctx} ownerId=${person.id} at=${date} />`}
        ${tab === 'month' && html`<div class="stats">
          <${Stat} value=${st.workdays} label="Ngày làm việc" sub=${st.leaveDays ? `${st.leaveDays} ngày nghỉ` : ''} />
          <${Stat} value=${st.onTimePct != null ? st.onTimePct + '%' : '—'} label="Bắt đầu đúng giờ" cls=${U.pctCls(st.onTimePct)} />
          <${Stat} value=${st.avgStart ? U.hm(st.avgStart) : '—'} label="Giờ bắt đầu TB" />
          <${Stat} value=${st.late + st.veryLate} label="Ngày bắt đầu trễ" cls=${st.late + st.veryLate ? 'warn' : ''} />
          <${Stat} value=${st.donePct != null ? st.donePct + '%' : '—'} label="Hoàn thành việc" cls=${U.pctCls(st.donePct, 85, 70)} />
          <${Stat} value=${st.missedRoutine} label="Routine bị miss" cls=${st.missedRoutine ? 'warn' : ''} />
          <${Stat} value=${st.overdue} label="Việc trễ hạn" cls=${st.overdue ? 'bad' : ''} />
          ${U.isWorker(person) && html`<${Stat} value=${st.reportPct != null ? st.reportPct + '%' : '—'} label="Báo cáo đúng hạn" cls=${U.pctCls(st.reportPct)} sub=${st.reportsMissing ? `${st.reportsMissing} lần không nộp` : ''} />`}
        </div>`}
      </div>
    </aside>
  </div>`;
}

export function ReportBody({ state, person, date, report }) {
  const tasks = U.tasksForDay(state, person.id, date, { includePrivate: false });
  const done = tasks.filter((t) => t.status === 'done');
  const undone = tasks.filter((t) => t.status !== 'done');
  return html`<div class="rbody">
    <h4>✅ Đã hoàn thành (${done.length})</h4>
    <ul class="rlist">${done.map((t) => html`<li>${t.title}${t.output ? html` — <span class="muted">${t.output}</span>` : ''}${t.note ? html` <span class="muted">· ${t.note}</span>` : ''}</li>`)}</ul>
    ${undone.length > 0 && html`<h4>⏳ Chưa hoàn thành (${undone.length})</h4>
      <ul class="rlist">${undone.map((t) => html`<li>${U.STATUS[t.status].icon} ${t.title}${t.block_reason ? html` — <span class="bad-t">${t.block_reason}</span>` : ''}</li>`)}</ul>`}
    ${report.blockers && html`<h4>🚧 Vướng mắc</h4><p class="pre">${report.blockers}</p>`}
    ${report.plan && html`<h4>📋 Kế hoạch ngày mai</h4><ul class="rlist">${report.plan.split('\n').map((x) => html`<li>${x}</li>`)}</ul>`}
  </div>`;
}

export function WeeklyBody({ w }) {
  return html`<div class="rbody">
    ${w.highlights && html`<h4>🌟 Highlight</h4><p class="pre">${w.highlights}</p>`}
    ${w.issues && html`<h4>⚠️ Tồn đọng & hướng xử lý</h4><p class="pre">${w.issues}</p>`}
    ${w.next_plan && html`<h4>📋 Kế hoạch tuần tới</h4><p class="pre">${w.next_plan}</p>`}
    <p class="muted small">Nộp ${U.fmtTime(w.submitted_at)} ${U.fmtShort(U.dateStr(new Date(w.submitted_at)))} · ${w.status === 'approved' ? '✓ Đã xác nhận' : 'Chờ xác nhận'}</p>
  </div>`;
}
