// Dữ liệu mẫu cho chế độ DEMO — tên người là hư cấu.
import { generateProject, defaultPayments } from './ev-core.js';
import { uid, todayStr, addDays, eachDay, weekday, recursOn, routineAppliesTo, isWorkday, DEFAULT_SETTINGS, weekStart } from './util.js';

export const PEOPLE = [
  { id: 'u_admin', full_name: 'Phạm Ngọc', role: 'admin', dept: null, title: 'CEO – Đạo diễn', notify: { push: true, telegram: true } },
  { id: 'u_mai', full_name: 'Nguyễn Mai Anh', role: 'staff', dept: 'd_content', title: 'Content Creator', emp_type: 'fulltime', notify: { push: true, telegram: false } },
  { id: 'u_kiet', full_name: 'Lê Tuấn Kiệt', role: 'manager', dept: 'd_edit', title: 'Trưởng nhóm Edit', emp_type: 'fulltime', notify: { push: false, telegram: true } },
  { id: 'u_bao', full_name: 'Trần Quốc Bảo', role: 'staff', dept: 'd_edit', title: 'Edit Creator (thực tập)', emp_type: 'intern', start_time: '13:30', notify: { push: true, telegram: true } },
  { id: 'u_ha', full_name: 'Phạm Thu Hà', role: 'staff', dept: 'd_kol', title: 'KOL Booking', emp_type: 'fulltime', notify: { push: true, telegram: false } },
  { id: 'u_bod', full_name: 'Nhà đầu tư', role: 'bod', dept: null, title: 'Chỉ xem', notify: { push: true, telegram: false } },
];

const R = (o) => ({ id: uid(), active: true, priority: 'mid', scope: 'work', ...o });
const ROUTINES = [
  // CEO
  R({ title: 'Duyệt kịch bản / bản dựng chờ duyệt', owner_id: 'u_admin', repeat: 'daily', time: '09:00', priority: 'high' }),
  R({ title: 'Check inbox fanpage & email đối tác', owner_id: 'u_admin', repeat: 'daily', time: '09:30' }),
  R({ title: 'Duyệt báo cáo ngày của team', owner_id: 'u_admin', repeat: 'weekdays', days: [1, 2, 3, 4, 5], time: '17:15', priority: 'high' }),
  // Content
  R({ id: 'r_fb', title: 'Lên ý tưởng & viết content trong ngày', dept: 'd_content', repeat: 'daily', time: '08:45', kpi_key: 'fb' }),
  R({ id: 'r_li', title: 'Đăng bài theo lịch (Fanpage, TikTok, Web)', dept: 'd_content', repeat: 'weekdays', days: [1, 2, 3, 4, 5], time: '11:00', kpi_key: 'li' }),
  R({ title: 'Seeding & trả lời bình luận', dept: 'd_content', repeat: 'daily', time: '16:00' }),
  // Edit
  R({ title: 'Nhận brief & sắp xếp việc dựng', dept: 'd_edit', repeat: 'daily', time: '08:45' }),
  R({ id: 'r_tt', title: 'Dựng video ngắn theo kịch bản', dept: 'd_edit', repeat: 'daily', time: '09:30', kpi_key: 'tt', priority: 'high' }),
  R({ title: 'Xuất file & gửi duyệt bản dựng', dept: 'd_edit', repeat: 'daily', time: '16:30' }),
  // KOL/KOC
  R({ id: 'r_fu', title: 'Liên hệ, deal & chốt lịch KOL/KOC', dept: 'd_kol', repeat: 'daily', time: '10:00', kpi_key: 'fu', priority: 'high' }),
  R({ id: 'r_new', title: 'Cập nhật danh sách KOL & báo giá', dept: 'd_kol', repeat: 'weekdays', days: [1, 3, 5], time: '09:00', kpi_key: 'new' }),
  R({ title: 'Theo dõi bài đăng KOL & số liệu', dept: 'd_kol', repeat: 'daily', time: '16:00' }),
];

const K = (o) => ({ id: uid(), type: 'count', period: 'week', active: true, manual: {}, ...o });
function makeKpis() {
  return [
    K({ key: 'fb', title: 'Bài content đăng', owner_id: 'u_mai', target: 10, unit: 'bài' }),
    K({ key: 'li', title: 'Bài đăng đúng lịch', owner_id: 'u_mai', target: 5, unit: 'bài' }),
    K({ key: 'tt', title: 'Video dựng xong', owner_id: 'u_kiet', target: 15, unit: 'video' }),
    K({ key: 'tt', title: 'Video dựng xong', owner_id: 'u_bao', target: 10, unit: 'video' }),
    K({ key: 'fu', title: 'KOL/KOC book thành công', owner_id: 'u_ha', target: 5, unit: 'KOL' }),
    K({ key: 'new', title: 'KOL mới cập nhật vào danh sách', owner_id: 'u_ha', target: 20, unit: 'KOL' }),
    K({ key: 'lp', title: 'Ra mắt series video "Để trở thành content creator"', owner_id: 'u_mai', type: 'bool', period: 'month', target: 1, unit: '' }),
  ];
}

// Hồ sơ "tính cách" để dữ liệu mẫu trông thật: giờ đến & tỉ lệ hoàn thành
const PROFILE = {
  u_admin: { start: [490, 515], done: 0.9 },
  u_mai: { start: [492, 511], done: 0.92, late: 0.1 },
  u_kiet: { start: [505, 540], done: 0.75, late: 0.55 },
  u_bao: { start: [796, 814], done: 0.85, late: 0.2 },
  u_ha: { start: [494, 512], done: 0.88, late: 0.15 },
};
let seedN = 7;
const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const iso = (date, mins) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(mins / 60), mins % 60).toISOString();
};

export function instantiateRoutines(state, p, date) {
  if (!isWorkday(state, p.id, date)) return [];
  const out = [];
  for (const r of state.routines) {
    if (!routineAppliesTo(r, p) || !recursOn(r, date)) continue;
    if (state.tasks.some((t) => t.routine_id === r.id && t.owner_id === p.id && t.date === date)) continue;
    const kpi = r.kpi_key && state.kpis.find((k) => k.key === r.kpi_key && k.owner_id === p.id);
    out.push({
      id: uid(), owner_id: p.id, title: r.title, date, time: r.time || null, end_time: r.end_time || null,
      source: r.kind === 'meeting' ? 'meeting' : 'routine', routine_id: r.id, scope: r.scope || 'work', group: r.group || null,
      priority: r.priority || 'mid', status: 'todo', progress: 0, kpi_id: kpi ? kpi.id : null, created_at: iso(date, 480),
    });
  }
  return out;
}

const ADHOC = {
  d_content: ['Viết kịch bản video review', 'Lên caption cho series mới', 'Nghiên cứu trend tuần này', 'Viết bài PR cho khoá học'],
  d_edit: ['Dựng teaser MV', 'Cắt clip highlight livestream', 'Làm phụ đề video', 'Sửa bản dựng theo góp ý khách'],
  d_kol: ['Gửi danh sách KOL cho khách duyệt', 'Deal giá với KOC mảng làm đẹp', 'Tổng hợp số liệu chiến dịch', 'Gửi brief cho KOL'],
  admin: ['Duyệt kế hoạch truyền thông tháng', 'Gặp khách hàng mới', 'Duyệt hợp đồng với khách'],
};

export function makeSeed() {
  seedN = 7;
  const today = todayStr();
  const state = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    depts: [{ id: 'd_content', name: 'Content', sort: 1 }, { id: 'd_edit', name: 'Edit / Hậu kỳ', sort: 2 }, { id: 'd_prod', name: 'Production (Quay)', sort: 3 }, { id: 'd_kol', name: 'KOL/KOC & Marketing', sort: 4 }, { id: 'd_edu', name: 'Đào tạo', sort: 5 }, { id: 'd_sales', name: 'Kinh doanh', sort: 6 }],
    people: PEOPLE.map((p) => ({ ...p, active: true })),
    routines: ROUTINES.map((r) => ({ ...r })),
    kpis: makeKpis(),
    tasks: [],
    daystarts: [],
    reports: [],
    weekly: [],
    leaves: [
      { id: uid(), person_id: 'u_ha', from: addDays(-9), to: addDays(-8), type: 'full', note: 'Nghỉ phép việc gia đình' },
      { id: uid(), person_id: 'u_kiet', from: addDays(5), to: addDays(5), type: 'am', note: 'Khám sức khỏe' },
      { id: uid(), person_id: null, from: addDays(-40), to: addDays(-39), type: 'holiday', note: 'Nghỉ lễ Quốc khánh 2/9' },
    ],
    habits: [
      { id: 'h_run', owner_id: 'u_admin', title: 'Chạy bộ', icon: '🏃', days: [1, 3, 5], unit: 'km', target: 5 },
      { id: 'h_water', owner_id: 'u_admin', title: 'Uống đủ 2 lít nước', icon: '💧', days: [0, 1, 2, 3, 4, 5, 6] },
      { id: 'h_sleep', owner_id: 'u_admin', title: 'Ngủ trước 23h', icon: '😴', days: [0, 1, 2, 3, 4, 5, 6] },
    ],
    habit_logs: [],
    chat: [],
  };
  const staffLike = state.people.filter((p) => p.role !== 'bod');
  const from = addDays(-75);
  for (const d of eachDay(from, today)) {
    const isToday = d === today;
    for (const p of staffLike) {
      if (!isWorkday(state, p.id, d)) continue;
      const pr = PROFILE[p.id];
      // Bắt đầu ngày làm việc
      if (!isToday || (p.id !== 'u_kiet' && p.id !== 'u_admin')) {
        let m = between(...pr.start);
        if (pr.late && rnd() < pr.late * 0.4) m += between(15, 50);
        if (isToday) m = Math.min(m, p.id === 'u_bao' ? 812 : 511);
        state.daystarts.push({ id: uid(), person_id: p.id, date: d, started_at: iso(d, m) });
      }
      const inst = instantiateRoutines(state, p, d);
      for (const t of inst) {
        if (isToday) {
          if (t.time && t.time < '10:30' && p.id !== 'u_kiet' && p.id !== 'u_admin') {
            t.status = 'done';
            t.done_at = iso(d, Math.max(560, Number(t.time.slice(0, 2)) * 60 + 20));
            if (t.kpi_id) t.qty = between(1, 3);
            t.output = t.kpi_id ? `${t.qty} ${t.title.includes('video') ? 'video' : 'bài'}` : '';
          }
        } else if (rnd() < pr.done) {
          t.status = 'done';
          t.done_at = iso(d, between(560, 1050));
          if (t.kpi_id) t.qty = between(1, 3);
        }
        state.tasks.push(t);
      }
      // Việc phát sinh
      if (!isToday && rnd() < 0.5) {
        const pool = ADHOC[p.dept || 'admin'];
        const recent = d >= addDays(-3);
        const done = !recent || rnd() < 0.7; // việc cũ coi như đã xử lý xong (có thể trễ hạn)
        const due = addDays(between(0, 3), d);
        state.tasks.push({
          id: uid(), owner_id: p.id, title: pool[between(0, pool.length - 1)], date: d, due_date: due, source: 'adhoc',
          scope: 'work', priority: rnd() < 0.3 ? 'high' : 'mid', status: done ? 'done' : 'todo', progress: 0,
          done_at: done ? iso(rnd() < 0.8 ? d : addDays(between(0, 2), due) > today ? today : addDays(between(0, 2), due), between(600, 1040)) : null, created_at: iso(d, 600),
        });
      }
      // Báo cáo ngày
      if (p.role === 'staff' && !isToday && weekday(d) !== 6 && rnd() < 0.93) {
        const m = rnd() < 0.85 ? between(960, 1019) : between(1021, 1080);
        state.reports.push({
          id: uid(), person_id: p.id, date: d, submitted_at: iso(d, m), blockers: '', plan: '',
          status: d < addDays(-1) || rnd() < 0.5 ? 'approved' : 'submitted', reviewed_at: iso(d, 1060), manager_note: '',
        });
      }
    }
  }

  // Một vài việc "thật" cho hôm nay
  const T = (o) => state.tasks.push({ id: uid(), scope: 'work', priority: 'mid', status: 'todo', progress: 0, created_at: new Date().toISOString(), ...o });
  T({ owner_id: 'u_mai', title: 'Kịch bản series "Để trở thành content creator"', date: addDays(-3), due_date: addDays(2), source: 'assigned', assigned_by: 'u_admin', priority: 'high', status: 'doing', progress: 60, note: 'Đã xong phần header + lịch thi đấu, còn form đăng ký', kpi_id: state.kpis.find((k) => k.key === 'lp').id });
  T({ owner_id: 'u_mai', title: 'Viết bài PR khoá học content creator', date: addDays(-2), due_date: addDays(-1), source: 'adhoc', priority: 'high' });
  T({ owner_id: 'u_bao', title: 'Dựng teaser MV cho khách', date: addDays(-1), due_date: today, source: 'assigned', assigned_by: 'u_admin', priority: 'high', status: 'blocked', block_reason: 'Chưa nhận đủ footage từ buổi quay', need_help: 'Nhờ nhóm Production gửi file' });
  T({ owner_id: 'u_kiet', title: 'Sửa bản dựng TVC theo góp ý vòng 1', date: today, due_date: today, source: 'adhoc', priority: 'high', status: 'doing', progress: 50 });
  T({ owner_id: 'u_ha', title: 'Chuẩn bị proposal giải bóng đá nội bộ Viettel', date: addDays(-1), due_date: addDays(3), source: 'plan', priority: 'mid' });
  T({ owner_id: 'u_admin', title: 'Gặp khách hàng chốt concept MV', date: today, time: '14:00', due_date: today, source: 'adhoc', priority: 'high' });
  T({ owner_id: 'u_admin', title: 'Duyệt kế hoạch truyền thông tháng 10', date: addDays(-2), due_date: addDays(1), source: 'adhoc', status: 'doing', progress: 40 });
  // Việc riêng của quản lý
  T({ owner_id: 'u_admin', title: 'Đóng tiền internet nhà', date: addDays(-1), due_date: addDays(2), source: 'adhoc', scope: 'private', group: 'family', priority: 'high' });
  T({ owner_id: 'u_admin', title: 'Thanh toán thẻ tín dụng', date: today, due_date: addDays(4), source: 'adhoc', scope: 'private', group: 'finance' });
  T({ owner_id: 'u_admin', title: 'Đặt lịch khám răng', date: today, source: 'adhoc', scope: 'private', group: 'health', priority: 'low' });

  // Nhật ký thói quen
  for (const d of eachDay(addDays(-80), addDays(-1))) {
    for (const h of state.habits) {
      if (!h.days.includes(weekday(d))) continue;
      if (rnd() < (h.id === 'h_run' ? 0.7 : 0.8)) state.habit_logs.push({ id: uid(), habit_id: h.id, date: d, value: h.unit ? between(3, 7) : 1 });
    }
  }

  // Báo cáo tuần trước
  const lastWeek = addDays(-7, weekStart());
  for (const p of state.people.filter((x) => x.role === 'staff')) {
    state.weekly.push({ id: uid(), person_id: p.id, week: lastWeek, highlights: 'Hoàn thành KPI chính của tuần', issues: '', next_plan: 'Duy trì tần suất, tập trung khách mới', submitted_at: iso(addDays(4, lastWeek), 860), status: 'approved' });
  }

  state.chat = [
    { role: 'bot', text: 'Chào bạn 👋 Mình là trợ lý Mummii. Bạn có thể nhắn kiểu:\n• "Mai 3h chiều nhắc duyệt bản dựng MV, quan trọng"\n• "Hôm nay còn gì?"\n• "Team hôm nay thế nào?"\n• "Sáng nay chạy 5km"', at: new Date().toISOString() },
  ];
  return state;
}

// Dự án mẫu cho chế độ demo
export function demoEvents() {
  const today = todayStr();
  const mk = (id, type, name, client, anchor, pm, rev) => ({ id, type, name, client_name: client, event_date: anchor, status: 'preparing', pm_id: pm, contract_signed_at: addDays(-5), revisions_included: 2, revisions_used: rev });
  const evs = [mk('ev_mv', 'video', 'MV "Mùa hè rực rỡ"', 'Ca sĩ A', addDays(12), 'u_kiet', 3), mk('ev_kol', 'kol', 'Booking 5 KOC mỹ phẩm', 'Brand B', addDays(9), 'u_ha', 0)];
  const pics = { 'Kịch bản': 'u_mai', 'Brief & ý tưởng': 'u_mai', 'Dựng': 'u_kiet', 'Hoàn thiện': 'u_bao', 'Đề xuất': 'u_ha', 'Ký kết': 'u_ha', 'Nội dung': 'u_ha' };
  const tasks = evs.flatMap((ev) => generateProject({ type: ev.type, anchor: ev.event_date, today, payments: defaultPayments(80000000, ev.event_date).map((p, i) => ({ ...p, offset_days: i ? 3 : -28 })), contractSigned: true })
    .map((t, i) => ({ ...t, id: uid(), event_id: ev.id, pic_id: pics[t.category] || ev.pm_id, sort: i, status: t.status === 'done' || (t.due_date && t.due_date < today) || /Gấp/.test(t.note) ? 'done' : 'todo', note: '' })));
  return { events: evs, ev_tasks: tasks };
}
