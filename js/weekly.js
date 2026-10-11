// Báo cáo tuần (nhân viên) + trang duyệt báo cáo (quản lý).
import { html, Avatar, Badge, Bar, Seg, Section, Empty } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions } from './store.js';
import { KpiList } from './kpi.js';
import { ReportBody, WeeklyBody, PersonDrawer } from './team.js';
import * as U from './util.js';

export function WeekView({ ctx }) {
  const { state, me } = ctx;
  const [ref, setRef] = useState(U.todayStr());
  const ws = U.weekStart(ref);
  const we = U.addDays(6, ws);
  const existing = state.weekly.find((w) => w.person_id === me.id && w.week === ws);
  const [f, setF] = useState({ highlights: existing?.highlights || '', issues: existing?.issues || '', next_plan: existing?.next_plan || '' });
  const s = U.personStats(state, me, ws, we);
  const days = [...U.eachDay(ws, U.addDays(5, ws))];
  const doneList = state.tasks.filter((t) => t.owner_id === me.id && t.scope !== 'private' && t.status === 'done' && t.source !== 'routine' && t.source !== 'meeting' && t.done_at && U.dateStr(new Date(t.done_at)) >= ws && U.dateStr(new Date(t.done_at)) <= we);
  const isCurrent = ws === U.weekStart();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return html`<div class="page narrow">
    <div class="page-head">
      <div><h1>📅 Tuần của tôi</h1><div class="muted">${U.periodLabel('week', ref)}</div></div>
      <div class="row">
        <button class="btn" onClick=${() => setRef(U.addDays(-7, ref))}>‹</button>
        <button class="btn" disabled=${isCurrent} onClick=${() => setRef(U.addDays(7, ref))}>›</button>
      </div>
    </div>
    <div class="stats">
      <div class=${'stat ' + U.pctCls(s.onTimePct)}><b>${s.onTimePct ?? '—'}%</b><span>Bắt đầu đúng giờ</span></div>
      <div class=${'stat ' + U.pctCls(s.donePct, 85, 70)}><b>${s.donePct ?? '—'}%</b><span>Hoàn thành việc (${s.done}/${s.tasks})</span></div>
      <div class=${'stat ' + (s.missedRoutine ? 'warn' : '')}><b>${s.missedRoutine}</b><span>Routine bị miss</span></div>
      <div class=${'stat ' + (s.overdue ? 'bad' : '')}><b>${s.overdue}</b><span>Việc trễ hạn</span></div>
    </div>
    <${Section} title="Từng ngày">
      <div class="weekstrip">${days.map((d) => {
        const ts = U.tasksForDay(state, me.id, d, { includePrivate: false });
        const dn = ts.filter((t) => t.status === 'done').length;
        const st = state.daystarts.find((x) => x.person_id === me.id && x.date === d);
        const ss = st && U.startStatus(st.started_at, state.settings, me);
        const off = !U.isWorkday(state, me.id, d);
        return html`<div class=${'wday' + (d === U.todayStr() ? ' today' : '')}>
          <b>${U.wdShort(d)} ${U.fmtShort(d)}</b>
          ${off ? html`<span class="muted">Nghỉ</span>` : d > U.todayStr() ? html`<span class="muted">—</span>` : html`
            <span class=${'small ' + (ss ? ss.cls + '-t' : 'bad-t')}>${st ? U.fmtTime(st.started_at) : 'Không BĐ'}</span>
            <${Bar} pct=${ts.length ? (dn / ts.length) * 100 : 0} cls="brand" />
            <span class="small muted">${dn}/${ts.length}</span>`}
        </div>`;
      })}</div>
    </${Section}>
    <${Section} title="🎯 KPI tuần (tự tổng hợp)"><div class="card pad"><${KpiList} ctx=${ctx} ownerId=${me.id} at=${ref} /></div></${Section}>
    <${Section} title=${`✅ Việc đã hoàn thành ngoài routine (${doneList.length})`}>
      ${doneList.length ? html`<ul class="rlist card pad">${doneList.map((t) => html`<li>${t.title}${t.output ? html` — <span class="muted">${t.output}</span>` : ''}</li>`)}</ul>` : html`<${Empty}>Chưa có.</${Empty}>`}
    </${Section}>
    <${Section} title="📝 Báo cáo tuần" right=${html`<small class="muted">Hạn: sáng thứ 7 trước ${state.settings.weekly_deadline}</small>`}>
      <div class="card pad form">
        ${existing && html`<p class="note">Đã nộp lúc ${U.fmtTime(existing.submitted_at)} ${U.fmtShort(U.dateStr(new Date(existing.submitted_at)))} · ${existing.status === 'approved' ? '✓ Quản lý đã xác nhận' : 'Chờ xác nhận'}${existing.manager_note ? ' — ' + existing.manager_note : ''}</p>`}
        <p class="muted small">Số liệu KPI và việc đã làm ở trên được đính kèm tự động — chỉ cần viết phần nhận định.</p>
        <label>🌟 Thành tích nổi bật tuần này<textarea rows="3" value=${f.highlights} onInput=${set('highlights')} placeholder="VD: 1 video đạt 300K view…"></textarea></label>
        <label>⚠️ Vấn đề tồn đọng + hướng xử lý + deadline<textarea rows="3" value=${f.issues} onInput=${set('issues')}></textarea></label>
        <label>📋 Kế hoạch tuần tới (3–5 việc quan trọng nhất)<textarea rows="3" value=${f.next_plan} onInput=${set('next_plan')}></textarea></label>
        <div class="row end"><button class="btn primary" onClick=${() => { actions.submitWeekly(me.id, ws, f); ctx.notify('Đã nộp báo cáo tuần'); }}>📨 ${existing ? 'Nộp lại' : 'Nộp báo cáo tuần'}</button></div>
      </div>
    </${Section}>
  </div>`;
}

export function ReviewView({ ctx }) {
  const { state } = ctx;
  const [tab, setTab] = useState('day');
  const [open, setOpen] = useState(null);
  const staff = U.visibleWorkers(state, ctx.me);
  const name = (id) => state.people.find((p) => p.id === id);
  const mine = (r) => staff.some((p) => p.id === r.person_id);
  const pending = state.reports.filter((r) => r.status === 'submitted' && mine(r)).sort((a, b) => b.date.localeCompare(a.date));
  const recent = state.reports.filter((r) => r.status !== 'submitted' && mine(r) && r.date >= U.addDays(-6)).sort((a, b) => b.date.localeCompare(a.date) || b.submitted_at.localeCompare(a.submitted_at));
  const ws = U.weekStart();
  const lastWs = U.addDays(-7, ws);
  return html`<div class="page narrow">
    <div class="page-head"><h1>📨 Duyệt báo cáo</h1>
      <${Seg} value=${tab} onChange=${setTab} options=${[{ id: 'day', label: `Báo cáo ngày${pending.length ? ` (${pending.length})` : ''}` }, { id: 'week', label: 'Báo cáo tuần' }]} /></div>
    ${tab === 'day' && html`
      <${Section} title=${`Chờ duyệt (${pending.length})`} right=${pending.length > 1 && html`<button class="btn sm" onClick=${() => { pending.forEach((r) => actions.reviewReport(r.id, 'approved')); ctx.notify(`Đã duyệt ${pending.length} báo cáo`); }}>✓ Duyệt tất cả</button>`}>
        ${pending.length ? pending.map((r) => html`<${ReportCardFull} ctx=${ctx} r=${r} p=${name(r.person_id)} onOpen=${() => setOpen({ p: name(r.person_id), date: r.date })} />`) : html`<${Empty}>Không còn báo cáo nào chờ duyệt 🎉</${Empty}>`}
      </${Section}>
      <${Section} title="Đã xử lý 7 ngày gần đây">
        <div class="tlist card">${recent.map((r) => html`<div class="trow ro" onClick=${() => setOpen({ p: name(r.person_id), date: r.date })}>
          <span class="tcheck">${r.status === 'approved' ? '✅' : '↩'}</span>
          <div class="tmain"><div class="ttitle">${name(r.person_id)?.full_name} — ${U.fmtDayLong(r.date)}</div>
          <div class="tmeta"><span class="muted">Nộp ${U.fmtTime(r.submitted_at)}</span>${U.minutesOf(r.submitted_at) > U.toMin(state.settings.report_deadline) && html`<${Badge} cls="warn">Nộp trễ</${Badge}>`}</div></div>
        </div>`)}</div>
      </${Section}>`}
    ${tab === 'week' && [ws, lastWs].map((w) => html`<${Section} key=${w} title=${U.periodLabel('week', w)}>
      ${staff.map((p) => {
        const rep = state.weekly.find((x) => x.person_id === p.id && x.week === w);
        return html`<div class="card pad mb">
          <div class="row between"><div class="row"><${Avatar} p=${p} size=${28} /><b>${p.full_name}</b></div>
            ${rep ? html`<${Badge} cls=${rep.status === 'approved' ? 'ok' : 'info'}>${rep.status === 'approved' ? '✓ Đã xác nhận' : 'Chờ xác nhận'}</${Badge}>` : html`<${Badge} cls=${w < ws ? 'bad' : ''}>Chưa nộp</${Badge}>`}</div>
          <details><summary class="small">KPI tuần</summary><${KpiList} ctx=${ctx} ownerId=${p.id} at=${w} /></details>
          ${rep && html`<${WeeklyBody} w=${rep} />`}
          ${rep?.status === 'submitted' && html`<div class="row end"><button class="btn primary sm" onClick=${() => actions.reviewWeekly(rep.id, 'approved')}>✓ Xác nhận</button></div>`}
        </div>`;
      })}
    </${Section}>`)}
    ${open && html`<${PersonDrawer} ctx=${ctx} person=${open.p} date=${open.date} onClose=${() => setOpen(null)} />`}
  </div>`;
}

function ReportCardFull({ ctx, r, p, onOpen }) {
  const [note, setNote] = useState('');
  const late = U.minutesOf(r.submitted_at) > U.toMin(ctx.state.settings.report_deadline);
  return html`<div class="card pad mb">
    <div class="row between">
      <div class="row click" onClick=${onOpen}><${Avatar} p=${p} size=${30} /><div><b>${p.full_name}</b><div class="muted small">${U.fmtDayLong(r.date)} · nộp ${U.fmtTime(r.submitted_at)}</div></div></div>
      ${late && html`<${Badge} cls="warn">Nộp trễ</${Badge}>`}
    </div>
    <${ReportBody} state=${ctx.state} person=${p} date=${r.date} report=${r} />
    <div class="review">
      <input placeholder="Nhận xét (không bắt buộc)" value=${note} onInput=${(e) => setNote(e.target.value)} />
      <div class="row end">
        <button class="btn" onClick=${() => { actions.reviewReport(r.id, 'returned', note || 'Bổ sung thêm chi tiết nhé'); ctx.notify('Đã trả lại — nhân viên sẽ nhận thông báo'); }}>↩ Trả lại</button>
        <button class="btn primary" onClick=${() => { actions.reviewReport(r.id, 'approved', note); ctx.notify('Đã xác nhận'); }}>✓ Xác nhận</button>
      </div>
    </div>
  </div>`;
}
