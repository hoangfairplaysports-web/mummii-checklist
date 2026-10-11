// Thống kê theo Tuần / Tháng / Quý / Năm cho Quản lý & BOD.
import { html, Avatar, Seg, Section } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { PersonDrawer } from './team.js';
import * as U from './util.js';

export function StatsView({ ctx }) {
  const { state } = ctx;
  const [period, setPeriod] = useState('week');
  const [ref, setRef] = useState(U.todayStr());
  const [openP, setOpenP] = useState(null);
  const [from, to] = U.periodRange(period, ref);
  const staff = U.visibleWorkers(state, ctx.me);
  const rows = staff.map((p) => ({ p, s: U.personStats(state, p, from, to), kpi: kpiAvg(state, p, period, ref) }));
  const team = sumStats(rows.map((r) => r.s));
  const trend = buildTrend(state, staff, period, from, to);

  return html`<div class="page">
    <div class="page-head">
      <div><h1>📊 Thống kê</h1><div class="muted">${U.periodLabel(period, ref)}</div></div>
      <div class="row">
        <${Seg} value=${period} onChange=${(v) => { setPeriod(v); setRef(U.todayStr()); }} options=${U.PERIODS} />
        <button class="btn" onClick=${() => setRef(U.shiftPeriod(period, ref, -1))}>‹</button>
        <button class="btn" disabled=${to >= U.todayStr()} onClick=${() => setRef(U.shiftPeriod(period, ref, 1))}>›</button>
      </div>
    </div>

    <div class="stats">
      <div class=${'stat ' + U.pctCls(team.onTimePct)}><b>${fmtPct(team.onTimePct)}</b><span>Bắt đầu đúng giờ</span><small>${team.late} lượt trễ · TB ${team.avgStart ? U.hm(team.avgStart) : '—'}</small></div>
      <div class=${'stat ' + U.pctCls(team.donePct, 85, 70)}><b>${fmtPct(team.donePct)}</b><span>Hoàn thành việc</span><small>${team.done}/${team.tasks} việc</small></div>
      <div class=${'stat ' + (team.missedRoutine ? 'warn' : '')}><b>${team.missedRoutine}</b><span>Routine bị miss</span></div>
      <div class=${'stat ' + (team.overdue ? 'bad' : '')}><b>${team.overdue}</b><span>Việc trễ hạn</span></div>
      <div class=${'stat ' + U.pctCls(team.reportPct)}><b>${fmtPct(team.reportPct)}</b><span>Báo cáo đúng hạn</span><small>${team.reportsMissing} lần không nộp</small></div>
    </div>

    <${Section} title=${trend.byWeek ? 'Tỉ lệ hoàn thành việc theo tuần' : 'Tỉ lệ hoàn thành việc theo ngày'} right=${html`<small class="muted">Cả team · việc công ty</small>`}>
      <div class="card pad"><${BarChart} data=${trend.points} /></div>
    </${Section}>

    <${Section} title="Theo từng người" right=${html`<small class="muted">Bấm vào tên để xem chi tiết</small>`}>
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Nhân sự</th><th class="num">Ngày làm</th><th class="num">Đúng giờ</th><th class="num">Giờ BĐ TB</th><th class="num">Trễ</th>
          <th class="num">Hoàn thành</th><th class="num">Routine miss</th><th class="num">Trễ hạn</th><th class="num">BC đúng hạn</th><th class="num">KPI đạt TB</th>
        </tr></thead>
        <tbody>${rows.map(({ p, s, kpi }) => html`<tr class="click" onClick=${() => setOpenP(p)}>
          <td><div class="row nowrap"><${Avatar} p=${p} size=${28} /><div><b>${p.full_name}</b><div class="muted small">${U.deptName(p.dept)}</div></div></div></td>
          <td class="num">${s.workdays}${s.leaveDays ? html`<small class="muted"> (+${s.leaveDays} nghỉ)</small>` : ''}</td>
          <td class=${'num ' + U.pctCls(s.onTimePct)}>${fmtPct(s.onTimePct)}</td>
          <td class="num">${s.avgStart ? U.hm(s.avgStart) : '—'}</td>
          <td class=${'num ' + (s.veryLate ? 'bad' : s.late ? 'warn' : '')}>${s.late + s.veryLate}${s.veryLate ? html`<small> (${s.veryLate} >30′)</small>` : ''}</td>
          <td class=${'num ' + U.pctCls(s.donePct, 85, 70)}>${fmtPct(s.donePct)}</td>
          <td class=${'num ' + (s.missedRoutine > 3 ? 'warn' : '')}>${s.missedRoutine}</td>
          <td class=${'num ' + (s.overdue ? 'bad' : '')}>${s.overdue}</td>
          <td class=${'num ' + U.pctCls(s.reportPct)}>${fmtPct(s.reportPct)}</td>
          <td class=${'num ' + U.pctCls(kpi, 100, 80)}>${fmtPct(kpi)}</td>
        </tr>`)}</tbody>
      </table></div>
      <p class="muted small">Đúng giờ = bấm "Bắt đầu ngày làm việc" trước ${state.settings.late_after}. Ngày nghỉ phép/lễ không bị tính. Việc riêng không nằm trong thống kê.</p>
    </${Section}>
    ${openP && html`<${PersonDrawer} ctx=${ctx} person=${openP} date=${to > U.todayStr() ? U.todayStr() : to} onClose=${() => setOpenP(null)} />`}
  </div>`;
}

const fmtPct = (v) => (v == null ? '—' : v + '%');

function sumStats(list) {
  const s = list.reduce((a, x) => {
    for (const k of Object.keys(x)) if (typeof x[k] === 'number') a[k] = (a[k] || 0) + x[k];
    return a;
  }, {});
  s.onTimePct = s.started ? Math.round((s.onTime / s.started) * 100) : null;
  s.donePct = s.tasks ? Math.round((s.done / s.tasks) * 100) : null;
  s.reportPct = s.reportsDue ? Math.round((s.reportsOnTime / s.reportsDue) * 100) : null;
  s.avgStart = s.started ? Math.round(s.startSum / s.started) : null;
  s.late = (s.late || 0) + (s.veryLate || 0);
  return s;
}

// KPI đạt trung bình: lấy các chu kỳ KPI nằm trong khoảng xem
function kpiAvg(state, p, period, ref) {
  const kpis = state.kpis.filter((k) => k.owner_id === p.id && k.active && k.type !== 'bool');
  if (!kpis.length) return null;
  const [from, to] = U.periodRange(period, ref);
  const vals = [];
  for (const k of kpis) {
    const seen = new Set();
    for (const d of U.eachDay(from, to > U.todayStr() ? U.todayStr() : to)) {
      const [ks] = U.periodRange(k.period, d);
      if (seen.has(ks)) continue;
      seen.add(ks);
      vals.push(Math.min(150, U.kpiProgress(state, k, d).pct));
    }
  }
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

function buildTrend(state, staff, period, from, to) {
  const end = to > U.todayStr() ? U.todayStr() : to;
  const byWeek = period === 'quarter' || period === 'year';
  const points = [];
  if (!byWeek) {
    for (const d of U.eachDay(from, end)) {
      if (U.weekday(d) === 0) continue;
      let tot = 0, done = 0;
      for (const p of staff) {
        if (!U.isWorkday(state, p.id, d)) continue;
        const ts = U.tasksForDay(state, p.id, d, { includePrivate: false });
        tot += ts.length;
        done += ts.filter((t) => t.status === 'done').length;
      }
      if (tot) points.push({ label: period === 'week' ? U.wdShort(d) : d.slice(8, 10), tip: U.fmtDayLong(d), v: Math.round((done / tot) * 100), sub: `${done}/${tot} việc` });
    }
  } else {
    for (let w = U.weekStart(from); w <= end; w = U.addDays(7, w)) {
      const a = w < from ? from : w;
      const b = U.addDays(6, w) > end ? end : U.addDays(6, w);
      const s = sumStats(staff.map((p) => U.personStats(state, p, a, b)));
      if (s.tasks) points.push({ label: U.fmtShort(w), tip: `Tuần ${U.fmtShort(a)}–${U.fmtShort(b)}`, v: s.donePct, sub: `${s.done}/${s.tasks} việc` });
    }
  }
  return { byWeek, points };
}

// Biểu đồ cột 1 chuỗi (0–100%), có tooltip khi rê chuột
function BarChart({ data }) {
  const [hover, setHover] = useState(null);
  if (!data.length) return html`<p class="muted">Chưa có dữ liệu.</p>`;
  const avg = Math.round(data.reduce((a, b) => a + b.v, 0) / data.length);
  return html`<div class="bchart" onMouseLeave=${() => setHover(null)}>
    <div class="bchart-grid">${[100, 50, 0].map((v) => html`<div style=${`bottom:${v}%`}><span>${v}%</span></div>`)}
      <div class="avgline" style=${`bottom:${avg}%`}><span>TB ${avg}%</span></div>
    </div>
    <div class="bchart-bars">${data.map((d, i) => html`<div class="bcol" onMouseEnter=${() => setHover(i)} onClick=${() => setHover(i)}>
      <i class=${hover === i ? 'on' : ''} style=${`height:${Math.max(1, d.v)}%`}></i>
      <span>${d.label}</span>
    </div>`)}</div>
    ${hover != null && html`<div class="btip" style=${`left:${((hover + 0.5) / data.length) * 100}%`}><b>${data[hover].v}%</b> · ${data[hover].sub}<br /><span>${data[hover].tip}</span></div>`}
  </div>`;
}
