// Thói quen cá nhân (chỉ chủ tài khoản thấy): tick hằng ngày, chuỗi ngày, lịch nhiệt.
import { html, Modal, Section, Empty, ConfirmButton } from './ui.js';
import { useState } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions } from './store.js';
import * as U from './util.js';

const DAYS = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN']];

export function streakOf(state, h, today = U.todayStr()) {
  let n = 0;
  let d = today;
  const has = (x) => state.habit_logs.some((l) => l.habit_id === h.id && l.date === x);
  if (!has(d)) d = U.addDays(-1, d); // hôm nay chưa làm thì tính từ hôm qua
  for (let i = 0; i < 400; i++, d = U.addDays(-1, d)) {
    if (!h.days.includes(U.weekday(d))) continue;
    if (has(d)) n++;
    else break;
  }
  return n;
}

export function HabitsView({ ctx }) {
  const { state, me } = ctx;
  const [edit, setEdit] = useState(null);
  const today = U.todayStr();
  const habits = state.habits.filter((h) => h.owner_id === me.id);
  return html`<div class="page narrow">
    <div class="page-head"><div><h1>🏃 Thói quen</h1><div class="muted">🔒 Chỉ mình bạn thấy — BOD và nhân viên không thấy</div></div>
      <button class="btn primary" onClick=${() => setEdit({ title: '', icon: '🏃', days: [1, 2, 3, 4, 5, 6, 0], unit: '', target: '' })}>+ Thói quen</button></div>
    ${!habits.length && html`<${Empty}>Chưa có thói quen nào.</${Empty}>`}
    ${habits.map((h) => {
      const log = state.habit_logs.find((l) => l.habit_id === h.id && l.date === today);
      const due = h.days.includes(U.weekday(today));
      const streak = streakOf(state, h);
      const weeks = 10;
      const start = U.addDays(-(weeks * 7 - 1), U.addDays(6, U.weekStart(today)));
      const cells = [...U.eachDay(start, U.addDays(6, U.weekStart(today)))];
      const doneCount = cells.filter((d) => d <= today && state.habit_logs.some((l) => l.habit_id === h.id && l.date === d)).length;
      return html`<div class="card pad mb habit">
        <div class="row between">
          <div class="row"><span class="hicon">${h.icon}</span><div><b>${h.title}</b>
            <div class="muted small">${h.days.length === 7 ? 'Mỗi ngày' : DAYS.filter(([d]) => h.days.includes(d)).map(([, l]) => l).join(', ')}${h.target ? ` · mục tiêu ${h.target} ${h.unit}` : ''}</div></div></div>
          <div class="row"><span class="streak" title="Chuỗi ngày liên tục">🔥 ${streak}</span><button class="link" onClick=${() => setEdit(h)}>Sửa</button></div>
        </div>
        <div class="row mt">
          ${due ? html`<${HabitLog} h=${h} log=${log} today=${today} />`
            : html`<span class="muted">Hôm nay không có lịch</span>`}
        </div>
        <div class="heat" aria-label=${`${doneCount} lần trong ${weeks} tuần`}>
          ${cells.map((d) => {
            const l = state.habit_logs.find((x) => x.habit_id === h.id && x.date === d);
            const sched = h.days.includes(U.weekday(d));
            const cls = d > today ? 'fut' : l ? 'on' : sched ? 'miss' : 'off';
            return html`<i class=${cls} title=${`${U.fmtDayLong(d)}${l ? ' — ✓' + (h.unit ? ` ${l.value} ${h.unit}` : '') : sched && d <= today ? ' — bỏ lỡ' : ''}`}></i>`;
          })}
        </div>
        <div class="muted small">${weeks} tuần gần nhất · ${doneCount} lần</div>
      </div>`;
    })}
    <p class="muted small">Mẹo: nhắn trợ lý AI "sáng nay chạy 5km" là tự ghi vào đây.</p>
    ${edit && html`<${HabitForm} ctx=${ctx} h=${edit} onClose=${() => setEdit(null)} />`}
  </div>`;
}

function HabitLog({ h, log, today }) {
  const [v, setV] = useState(h.target || '');
  if (log)
    return html`<button class="btn ok" onClick=${() => actions.logHabit(h.id, today, null)} title="Bấm để bỏ đánh dấu">✓ Đã làm hôm nay${h.unit ? ` (${log.value} ${h.unit})` : ''}</button>`;
  if (!h.unit) return html`<button class="btn primary" onClick=${() => actions.logHabit(h.id, today, 1)}>Đánh dấu đã làm hôm nay</button>`;
  return html`<form class="row" onSubmit=${(e) => { e.preventDefault(); actions.logHabit(h.id, today, Number(v) || 1); }}>
    <input class="mini-in" type="number" min="0" step="0.1" value=${v} onInput=${(e) => setV(e.target.value)} aria-label=${'Số ' + h.unit} /> <span>${h.unit}</span>
    <button class="btn primary">Ghi hôm nay</button>
  </form>`;
}

function HabitForm({ ctx, h, onClose }) {
  const [f, setF] = useState(h);
  const ICONS = ['🏃', '💧', '😴', '🧘', '📚', '🏋️', '🥗', '🚭', '🏸', '⚽'];
  return html`<${Modal} title=${h.id ? 'Sửa thói quen' : 'Thêm thói quen'} onClose=${onClose}>
    <form class="form" onSubmit=${(e) => { e.preventDefault(); if (!f.title.trim()) return; actions.saveHabit({ ...f, owner_id: ctx.me.id }); onClose(); }}>
      <div class="chips">${ICONS.map((i) => html`<button type="button" class=${'chip ' + (f.icon === i ? 'on' : '')} onClick=${() => setF({ ...f, icon: i })}>${i}</button>`)}</div>
      <label>Tên *<input value=${f.title} onInput=${(e) => setF({ ...f, title: e.target.value })} placeholder="VD: Chạy bộ 30 phút" /></label>
      <div class="chips">${DAYS.map(([d, l]) => html`<button type="button" class=${'chip ' + (f.days.includes(d) ? 'on' : '')} onClick=${() => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })}>${l}</button>`)}</div>
      <div class="grid2">
        <label>Ghi số liệu (đơn vị)<input value=${f.unit} onInput=${(e) => setF({ ...f, unit: e.target.value })} placeholder="km, phút… (bỏ trống nếu chỉ tick)" /></label>
        <label>Mục tiêu mỗi lần<input type="number" value=${f.target} onInput=${(e) => setF({ ...f, target: e.target.value })} /></label>
      </div>
      <div class="row between">
        ${h.id ? html`<${ConfirmButton} label="Xoá" ask="Xoá cả lịch sử? Bấm lần nữa" onConfirm=${() => { actions.deleteHabit(h.id); onClose(); }} />` : html`<span></span>`}
        <div class="row"><button type="button" class="btn" onClick=${onClose}>Huỷ</button><button class="btn primary">Lưu</button></div>
      </div>
    </form>
  </${Modal}>`;
}
