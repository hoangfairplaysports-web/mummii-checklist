// Trợ lý AI. Bản DEMO: hiểu một số câu mẫu và thao tác thật trên dữ liệu demo.
// Bản thật: gửi tin nhắn tới Supabase Edge Function → Gemini (function calling) với cùng bộ "công cụ" bên dưới.
import { html } from './ui.js';
import { useState, useEffect, useRef } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js';
import { actions, getState, LIVE } from './store.js';
import { dayRow } from './team.js';
import { streakOf } from './habits.js';
import * as U from './util.js';

export function ChatPanel({ ctx, onClose }) {
  const { state } = ctx;
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef();
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [state.chat.length, busy]);
  async function send(text) {
    const q = (text ?? v).trim();
    if (!q) return;
    setV('');
    actions.pushChat({ role: 'me', text: q });
    setBusy(true);
    if (LIVE) {
      try {
        await actions.askAssistant(q); // máy chủ lưu cả câu hỏi & trả lời, rồi tải lại
      } catch (e) {
        actions.pushChat({ role: 'bot', text: '⚠️ ' + e.message });
      }
    } else {
      await new Promise((r) => setTimeout(r, 450));
      actions.pushChat({ role: 'bot', text: answer(q, ctx.me) });
    }
    setBusy(false);
  }
  const SUGGEST = ['Hôm nay còn gì?', 'Team hôm nay thế nào?', 'KPI tuần này', 'Sáng nay chạy 5km', 'Mai 3h chiều nhắc duyệt bản dựng MV, quan trọng'];
  return html`<div class="chat">
    <div class="chat-head"><b>🤖 Trợ lý Mummii</b><span class="muted small">Gemini${LIVE ? '' : ' · demo'}</span><button class="x" onClick=${onClose}>×</button></div>
    <div class="chat-body">
      ${!state.chat.length && html`<div class="msg bot"><div class="bubble pre">Chào bạn 👋 Mình là trợ lý Mummii. Bạn có thể nhắn kiểu:\n• "Mai 3h chiều nhắc duyệt bản dựng MV, quan trọng"\n• "Hôm nay còn gì?" · "Team hôm nay thế nào?"\n• "Sáng nay chạy 5km"</div></div>`}
      ${state.chat.map((m) => html`<div class=${'msg ' + m.role}><div class="bubble pre">${m.text}</div></div>`)}
      ${busy && html`<div class="msg bot"><div class="bubble typing">…</div></div>`}
      <div ref=${end}></div>
    </div>
    <div class="chat-suggest">${SUGGEST.map((s) => html`<button class="chip" onClick=${() => send(s)}>${s}</button>`)}</div>
    <form class="chat-input" onSubmit=${(e) => { e.preventDefault(); send(); }}>
      <input value=${v} onInput=${(e) => setV(e.target.value)} placeholder="Nhắn cho trợ lý…" />
      <button class="btn primary" disabled=${busy}>Gửi</button>
    </form>
  </div>`;
}

// ---------------------------------------------------------------------------
const short = (n) => n.split(' ').slice(-2).join(' ');
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

function answer(q, me) {
  const state = getState();
  const n = norm(q);
  const today = U.todayStr();

  // Ghi thói quen: "chạy 5km", "uống đủ nước", "ngủ sớm"
  const habit = state.habits.find((h) => h.owner_id === me.id && (
    (h.id === 'h_run' && /chay|run/.test(n)) || (/nuoc/.test(n) && /nuoc/.test(norm(h.title))) || (/\bngu (som|truoc|du)/.test(n) && /ngu/.test(norm(h.title))) ||
    n.includes(norm(h.title))));
  if (habit && !/nhac|them/.test(n)) {
    const num = q.match(/(\d+(?:[.,]\d+)?)/);
    actions.logHabit(habit.id, today, num ? Number(num[1].replace(',', '.')) : 1);
    const s = streakOf(getState(), habit);
    return `Đã ghi ${habit.icon} ${habit.title}${num && habit.unit ? ` — ${num[1]} ${habit.unit}` : ''} cho hôm nay.\nChuỗi hiện tại: 🔥 ${s} buổi liên tục. Tốt lắm!`;
  }

  // Thêm việc / nhắc việc
  if (/^(them|nhac|ghi|tao)|nhac (anh|em|toi)|^(mai|chieu|sang|toi)/.test(n)) {
    let date = today;
    if (/mai|ngay mai/.test(n)) date = U.addDays(1);
    const th = n.match(/thu (\d)/);
    if (th) {
      const target = +th[1] - 1;
      for (let i = 1; i <= 7; i++) if (U.weekday(U.addDays(i)) === target % 7) { date = U.addDays(i); break; }
    }
    let time = null;
    const tm = n.match(/(\d{1,2})\s*(?:h|gio|:)\s*(\d{2})?/);
    if (tm) {
      let h = +tm[1];
      if (/chieu|toi/.test(n) && h < 12) h += 12;
      time = `${String(h).padStart(2, '0')}:${tm[2] || '00'}`;
    }
    const priv = /rieng|ca nhan|gia dinh/.test(n);
    const high = /quan trong|gap|uu tien/.test(n);
    let title = q
      .replace(/^(thêm|nhắc|ghi|tạo)( việc)?( anh| em| tôi)?/i, '')
      .replace(/(ngày mai|mai|sáng|chiều|tối|thứ \d)/gi, '')
      .replace(/\d{1,2}\s*(h|giờ|:)\s*(\d{2})?/gi, '')
      .replace(/,?\s*(quan trọng|gấp|ưu tiên|việc riêng|cá nhân)/gi, '')
      .replace(/nhắc (anh|em|tôi)/gi, '')
      .replace(/\s+/g, ' ').replace(/^[\s,:-]+|[\s,.-]+$/g, '')
      .replace(/^(nhắc|thêm|ghi)\s+(anh\s+|em\s+|tôi\s+)?/i, '');
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (!title) return 'Bạn muốn thêm việc gì? VD: "Mai 9h nhắc gửi kịch bản cho khách"';
    actions.addTask({ owner_id: me.id, title, date, time, due_date: date, priority: high ? 'high' : 'mid', scope: priv ? 'private' : 'work', group: priv ? 'other' : null, source: date > today ? 'plan' : 'adhoc' });
    return `Đã thêm ${priv ? '🔒 việc riêng' : 'việc'}: "${title}"\n📅 ${U.fmtDayLong(date)}${time ? ` · 🕐 ${time}` : ''}${high ? ' · 🔴 ưu tiên cao' : ''}\n🔔 Mình sẽ nhắc trước 10 phút qua app và Telegram.`;
  }

  // Team hôm nay
  if (/team|nhan vien|moi nguoi|ai tre|ai di muon|ca nhom/.test(n)) {
    const staff = state.people.filter((p) => U.isWorker(p) && p.active !== false);
    const rows = staff.map((p) => dayRow(state, p, today)).filter((r) => r.workday);
    const notStarted = rows.filter((r) => !r.start);
    const late = rows.filter((r) => r.start && r.ss.cls !== 'ok');
    const blocked = rows.flatMap((r) => r.tasks.filter((t) => t.status === 'blocked').map((t) => ({ t, p: r.p })));
    const pend = state.reports.filter((r) => r.status === 'submitted').length;
    const lines = [`👥 Team hôm nay (${rows.length} người làm việc):`];
    lines.push(`• Đã bắt đầu: ${rows.length - notStarted.length}/${rows.length}${notStarted.length ? ' — chưa: ' + notStarted.map((r) => short(r.p.full_name)).join(', ') : ''}`);
    if (late.length) lines.push(`• Bắt đầu trễ: ${late.map((r) => `${short(r.p.full_name)} (${U.fmtTime(r.start.started_at)})`).join(', ')}`);
    const away = rows.filter((r) => r.start && (r.start.loc === 'outside' || r.start.loc === 'unknown'));
    if (away.length) lines.push(`• Bắt đầu ngoài văn phòng / chưa rõ vị trí: ${away.map((r) => `${short(r.p.full_name)} (${r.loc.label})`).join(', ')}`);
    for (const r of rows) lines.push(`• ${short(r.p.full_name)}: ${r.done}/${r.total} việc xong${r.overdue ? `, ${r.overdue} quá hạn` : ''}`);
    if (blocked.length) lines.push(`🚧 Đang vướng: ${blocked.map(({ t, p }) => `${short(p.full_name)} — "${t.title}"${t.need_help ? ` (cần: ${t.need_help})` : ''}`).join('; ')}`);
    if (pend) lines.push(`📨 ${pend} báo cáo đang chờ bạn duyệt.`);
    return lines.join('\n');
  }

  // KPI
  if (/kpi|chi tieu|muc tieu/.test(n)) {
    const lines = ['🎯 KPI tuần này:'];
    for (const k of state.kpis.filter((k) => k.active && k.period === 'week')) {
      const p = state.people.find((x) => x.id === k.owner_id);
      const prog = U.kpiProgress(state, k);
      const pace = U.kpiPace(prog);
      lines.push(`${pace.icon} ${short(p.full_name)} — ${k.title}: ${prog.value}/${prog.target} ${k.unit} (${prog.pct}%)`);
    }
    return lines.join('\n');
  }

  // Việc của tôi hôm nay
  if (/hom nay|con gi|con viec|viec cua (anh|toi)|lich/.test(n)) {
    const ts = U.sortTasks(U.tasksForDay(state, me.id, today).filter((t) => t.status !== 'done'));
    if (!ts.length) return 'Hôm nay bạn đã xong hết việc rồi 🎉';
    const work = ts.filter((t) => t.scope !== 'private');
    const priv = ts.filter((t) => t.scope === 'private');
    const fmt = (t) => `• ${t.time ? t.time + ' ' : ''}${t.title}${U.taskFlags(t, today).overdue ? ' ⚠️ quá hạn' : ''}${t.priority === 'high' ? ' 🔴' : ''}`;
    return [`📋 Còn ${ts.length} việc hôm nay:`, ...work.map(fmt), ...(priv.length ? ['🔒 Việc riêng:', ...priv.map(fmt)] : [])].join('\n');
  }

  // Xong việc: "xong check mail"
  if (/^(xong|da xong|hoan thanh)/.test(n)) {
    const kw = n.replace(/^(da )?(xong|hoan thanh)\s*(viec)?\s*/, '');
    const t = U.tasksForDay(state, me.id, today).find((x) => x.status !== 'done' && kw && norm(x.title).includes(kw));
    if (!t) return 'Mình chưa tìm thấy việc đó trong danh sách hôm nay. Bạn ghi rõ tên việc giúp mình nhé.';
    actions.updateTask(t.id, { status: 'done' });
    return `✅ Đã đánh dấu xong: "${t.title}"`;
  }

  return 'Mình là bản demo nên mới hiểu một số câu mẫu 😅 Bạn thử:\n• "Mai 9h nhắc gửi kịch bản cho khách"\n• "Hôm nay còn gì?" · "Team hôm nay thế nào?"\n• "KPI tuần này" · "Sáng nay chạy 5km"\n• "Xong check email"\nBản thật dùng Gemini sẽ hiểu câu tự nhiên bất kỳ.';
}
