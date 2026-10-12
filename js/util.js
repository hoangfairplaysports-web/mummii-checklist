// Tiện ích chung: ngày giờ, hằng số, các phép tính thống kê.

export const fold = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
export const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Ngày giờ (luôn dùng chuỗi 'YYYY-MM-DD' theo giờ máy)
// ---------------------------------------------------------------------------
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dateStr(new Date());
export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (n, from) => {
  const d = from ? parseDate(from) : new Date();
  d.setDate(d.getDate() + n);
  return dateStr(d);
};
export const weekday = (s) => parseDate(s).getDay(); // 0 = CN
export const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export const weekStart = (s = todayStr()) => addDays(-((weekday(s) + 6) % 7), s); // thứ 2
export const monthStart = (s = todayStr()) => s.slice(0, 8) + '01';
export const quarterStart = (s = todayStr()) => `${s.slice(0, 4)}-${pad(Math.floor((+s.slice(5, 7) - 1) / 3) * 3 + 1)}-01`;
export const yearStart = (s = todayStr()) => s.slice(0, 4) + '-01-01';
export function periodRange(period, ref = todayStr()) {
  if (period === 'day') return [ref, ref];
  if (period === 'week') return [weekStart(ref), addDays(6, weekStart(ref))];
  if (period === 'month') {
    const s = monthStart(ref);
    const d = parseDate(s);
    d.setMonth(d.getMonth() + 1);
    return [s, addDays(-1, dateStr(d))];
  }
  if (period === 'quarter') {
    const s = quarterStart(ref);
    const d = parseDate(s);
    d.setMonth(d.getMonth() + 3);
    return [s, addDays(-1, dateStr(d))];
  }
  return [yearStart(ref), ref.slice(0, 4) + '-12-31'];
}
export const PERIODS = [
  { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' },
  { id: 'quarter', label: 'Quý' },
  { id: 'year', label: 'Năm' },
];
export function shiftPeriod(period, ref, dir) {
  const d = parseDate(ref);
  if (period === 'day') d.setDate(d.getDate() + dir);
  else if (period === 'week') d.setDate(d.getDate() + 7 * dir);
  else if (period === 'month') d.setMonth(d.getMonth() + dir, 1);
  else if (period === 'quarter') d.setMonth(d.getMonth() + 3 * dir, 1);
  else d.setFullYear(d.getFullYear() + dir, 0, 1);
  return dateStr(d);
}
export function periodLabel(period, ref) {
  const [a, b] = periodRange(period, ref);
  if (period === 'week') return `Tuần ${fmtShort(a)} – ${fmtShort(b)}`;
  if (period === 'month') return `Tháng ${+a.slice(5, 7)}/${a.slice(0, 4)}`;
  if (period === 'quarter') return `Quý ${Math.floor((+a.slice(5, 7) - 1) / 3) + 1}/${a.slice(0, 4)}`;
  return `Năm ${a.slice(0, 4)}`;
}
export function* eachDay(from, to) {
  for (let d = from; d <= to; d = addDays(1, d)) yield d;
}

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WD_LONG = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export const wdShort = (s) => WD[weekday(s)];
export const fmtShort = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
export const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
export const fmtDayLong = (s) => `${WD_LONG[weekday(s)]}, ${fmtDate(s)}`;
export const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const minutesOf = (iso) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
export const hm = (mins) => `${pad(Math.floor(mins / 60))}:${pad(Math.round(mins % 60))}`;
export const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
export function relDue(due, today = todayStr()) {
  const n = diffDays(today, due);
  if (n === 0) return 'Hạn hôm nay';
  if (n === 1) return 'Hạn mai';
  if (n < 0) return `Quá hạn ${-n} ngày`;
  return `Hạn ${fmtShort(due)}`;
}

// ---------------------------------------------------------------------------
// Hằng số nghiệp vụ
// ---------------------------------------------------------------------------
// Phòng ban do CEO tự thêm/sửa/xoá (bảng cl_depts) — nạp vào đây khi tải dữ liệu
export const DEPTS = {};
export function setDepts(list) {
  for (const k of Object.keys(DEPTS)) delete DEPTS[k];
  for (const d of list || []) DEPTS[d.id] = d.name;
}
export const ROLES = { admin: 'CEO / Quản trị', manager: 'Quản lý nhóm', staff: 'Nhân viên', bod: 'Chỉ xem' };
// Loại nhân sự (add-on): thực tập, part-time, remote… — mỗi người có thể có giờ làm riêng
export const isRemote = (p) => !!p && (p.emp_type === 'remote' || p.emp_type === 'freelance');
export const EMP_TYPES = { fulltime: 'Full-time', parttime: 'Part-time', intern: 'Thực tập sinh', remote: 'Remote', freelance: 'Cộng tác viên' };
// Ai được quản lý (xem chi tiết, duyệt báo cáo, giao việc) người này
export const canManage = (me, p) => me.role === 'admin' || (me.role === 'manager' && !!me.dept && p.dept === me.dept && p.id !== me.id);
export const isLeader = (me) => me.role === 'admin' || me.role === 'manager';
export const isWorker = (p) => p.role === 'staff' || p.role === 'manager';
// Những người "tôi" được xem checklist/báo cáo: CEO & chỉ xem → mọi người; quản lý → nhóm mình
export const visibleWorkers = (state, me) =>
  state.people.filter((p) => p.active !== false && isWorker(p) && (me.role === 'admin' || me.role === 'bod' || canManage(me, p)));
export const deptName = (id) => DEPTS[id] || 'Chưa xếp nhóm';
export const SLOTS = [
  { id: 'morning', label: 'Sáng', icon: '🌅', until: 12 * 60 },
  { id: 'afternoon', label: 'Chiều', icon: '☀️', until: 18 * 60 },
  { id: 'evening', label: 'Tối', icon: '🌙', until: 24 * 60 },
];
export const slotOfTime = (t) => (!t ? null : toMin(t) < 12 * 60 ? 'morning' : toMin(t) < 18 * 60 ? 'afternoon' : 'evening');
export const PRIORITIES = {
  high: { label: 'Cao', icon: '🔴', rank: 0 },
  mid: { label: 'Trung bình', icon: '🟡', rank: 1 },
  low: { label: 'Thấp', icon: '⚪', rank: 2 },
};
export const STATUS = {
  todo: { label: 'Chưa làm', icon: '⬜' },
  doing: { label: 'Đang làm', icon: '🔄' },
  blocked: { label: 'Vướng', icon: '🚧' },
  done: { label: 'Xong', icon: '✅' },
};
export const SOURCES = {
  routine: 'Routine',
  meeting: 'Họp',
  adhoc: 'Phát sinh',
  assigned: 'Được giao',
  plan: 'Kế hoạch',
};
export const PRIVATE_GROUPS = [
  { id: 'health', label: 'Sức khỏe', icon: '🏃' },
  { id: 'family', label: 'Gia đình', icon: '🏠' },
  { id: 'finance', label: 'Tài chính', icon: '💰' },
  { id: 'other', label: 'Khác', icon: '📌' },
];
export const groupOf = (id) => PRIVATE_GROUPS.find((g) => g.id === id) || PRIVATE_GROUPS[3];
export const KPI_TYPES = {
  count: { label: 'Số lượng', icon: '🔢' },
  bool: { label: 'Có / Không', icon: '✅' },
  percent: { label: 'Phần trăm', icon: '📊' },
};
export const KPI_PERIODS = { week: 'tuần', month: 'tháng', quarter: 'quý' };
export const LEAVE_TYPES = {
  full: 'Nghỉ cả ngày',
  am: 'Nghỉ buổi sáng',
  pm: 'Nghỉ buổi chiều',
  holiday: 'Nghỉ lễ (cả công ty)',
};
export const DEFAULT_SETTINGS = {
  work_start: '08:30',
  late_after: '08:30', // bấm "Bắt đầu" sau mốc này = trễ
  very_late_after: '09:00',
  report_deadline: '17:30',
  work_end: '17:30',
  sat_end: '12:30', // sáng thứ 7 làm đến 12:30
  weekly_deadline: '12:00', // báo cáo tuần: sáng thứ 7
  projects_visible: 'admin', // tab Dự án: 'admin' | 'managers' | 'all'
  ai_model: 'gemini-flash',
};

// ---------------------------------------------------------------------------
// Lặp lịch routine
// ---------------------------------------------------------------------------
export function recursOn(r, date) {
  const wd = weekday(date);
  if (r.repeat === 'daily') return wd !== 0; // T2 → T7
  if (r.repeat === 'weekdays') return (r.days || []).includes(wd);
  if (r.repeat === 'monthly') return +date.slice(8, 10) === +r.month_day && wd !== 0;
  return false;
}
export function repeatLabel(r) {
  if (r.repeat === 'daily') return 'Hằng ngày (T2–T7)';
  if (r.repeat === 'weekdays') return (r.days || []).slice().sort().map((d) => WD[d]).join(', ');
  if (r.repeat === 'monthly') return `Ngày ${r.month_day} hằng tháng`;
  return '';
}
export const routineAppliesTo = (r, p) =>
  r.active !== false && (r.owner_id ? r.owner_id === p.id : r.dept === 'all' ? p.role !== 'bod' : r.dept === p.dept);

// ---------------------------------------------------------------------------
// Ngày làm việc, nghỉ phép
// ---------------------------------------------------------------------------
export function leaveOn(state, pid, date) {
  return state.leaves.find((l) => l.from <= date && date <= l.to && (l.person_id === pid || l.type === 'holiday'));
}
export const isWorkday = (state, pid, date) => weekday(date) !== 0 && !(leaveOn(state, pid, date)?.type in { full: 1, holiday: 1 });

export function startStatus(startedAt, settings, person) {
  if (!startedAt) return null;
  if (person && person.track_late === false) return { cls: 'ok', label: 'Giờ linh hoạt', icon: '✓' };
  if (person?.start_time) settings = { ...settings, late_after: person.start_time, very_late_after: hm(toMin(person.start_time) + 30) };
  const m = minutesOf(startedAt);
  if (m <= toMin(settings.late_after)) return { cls: 'ok', label: 'Đúng giờ', icon: '✓' };
  const d = m - toMin(settings.late_after);
  const label = d < 60 ? `Trễ ${d} phút` : `Trễ ${Math.floor(d / 60)}h${d % 60 ? String(d % 60).padStart(2, '0') : ''}`;
  if (m <= toMin(settings.very_late_after)) return { cls: 'warn', label, icon: '!' };
  return { cls: 'bad', label, icon: '‼' };
}

// Vị trí lúc bấm Bắt đầu (máy chủ gắn nhãn, xem migration_06_checkin.sql)
export const LOCS = {
  office_wifi: { icon: '🏢', label: 'Tại văn phòng', cls: 'ok', hint: 'Mạng wifi văn phòng' },
  office_gps: { icon: '🏢', label: 'Tại văn phòng', cls: 'ok', hint: 'Theo định vị GPS' },
  outside: { icon: '📍', label: 'Ngoài văn phòng', cls: 'bad', hint: 'Không dùng wifi văn phòng, GPS ngoài bán kính' },
  unknown: { icon: '❔', label: 'Chưa rõ vị trí', cls: 'warn', hint: 'Không dùng wifi văn phòng và không cho phép định vị' },
  wfh: { icon: '🏠', label: 'Làm từ xa', cls: 'info', hint: 'Nhân sự Remote / Cộng tác viên, không kiểm tra vị trí' },
};
export function locInfo(st) {
  if (!st || !st.loc) return null;
  const l = LOCS[st.loc];
  if (!l) return null;
  const dist = st.distance_m != null ? (st.distance_m >= 1000 ? `${(st.distance_m / 1000).toFixed(1)} km` : `${st.distance_m} m`) : '';
  return { ...l, title: l.hint + (dist ? ` · cách văn phòng ${dist}` : ''), dist };
}
// Lấy GPS 1 lần; lỗi / từ chối / quá giờ → null (không bao giờ ném lỗi)
export function getPosition(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

// ---------------------------------------------------------------------------
// Công việc trong ngày
// ---------------------------------------------------------------------------
const doneDate = (t) => (t.done_at ? dateStr(new Date(t.done_at)) : null);

// Việc hiển thị cho 1 người vào 1 ngày:
// - routine/họp: chỉ đúng ngày của nó (không dồn sang hôm sau, nhưng bị ghi nhận "miss")
// - việc phát sinh / được giao / kế hoạch: hiện từ ngày bắt đầu đến khi xong (tự dời sang hôm sau)
export function tasksForDay(state, pid, date, { includePrivate = true } = {}) {
  return state.tasks.filter((t) => {
    if (t.owner_id !== pid || t.hidden) return false;
    if (!includePrivate && t.scope === 'private') return false;
    if (t.source === 'routine' || t.source === 'meeting') return t.date === date;
    if (t.date > date) return false;
    if (t.status === 'done') return doneDate(t) === date || (t.date === date && !t.done_at);
    return true;
  });
}

export function taskFlags(t, date) {
  const carried = t.source !== 'routine' && t.source !== 'meeting' && t.status !== 'done' && t.date < date;
  const overdue = t.status !== 'done' && t.due_date && t.due_date < date;
  const dueToday = t.status !== 'done' && t.due_date === date;
  return { carried, carriedDays: carried ? diffDays(t.date, date) : 0, overdue, dueToday };
}

export function sortTasks(list) {
  const st = { blocked: 0, doing: 1, todo: 2, done: 3 };
  return list.slice().sort(
    (a, b) =>
      (a.status === 'done') - (b.status === 'done') ||
      (a.time || '99') .localeCompare(b.time || '99') ||
      (PRIORITIES[a.priority || 'mid'].rank - PRIORITIES[b.priority || 'mid'].rank) ||
      st[a.status] - st[b.status],
  );
}

export const slotOfTask = (t) => slotOfTime(t.time) || t.slot || 'morning';

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------
export function kpiProgress(state, kpi, ref = todayStr()) {
  const [from, to] = periodRange(kpi.period, ref);
  if (kpi.type === 'bool') {
    const v = (kpi.manual || {})[from];
    return { value: v ? 1 : 0, target: 1, pct: v ? 100 : 0, from, to };
  }
  let value = 0;
  for (const t of state.tasks) {
    if (t.kpi_id !== kpi.id || t.status !== 'done' || !t.done_at) continue;
    if (kpi.owner_id && t.owner_id !== kpi.owner_id) continue;
    const d = doneDate(t);
    if (d >= from && d <= to) value += Number(t.qty) || 1;
  }
  value += Number((kpi.manual || {})[from]) || 0;
  if (kpi.type === 'percent') value = Number((kpi.manual || {})[from]) || 0;
  const target = Number(kpi.target) || 1;
  return { value, target, pct: Math.round((value / target) * 100), from, to };
}

// Đèn tín hiệu: so với phần thời gian đã trôi qua của chu kỳ
export function kpiPace(prog, ref = todayStr()) {
  if (prog.pct >= 100) return { cls: 'ok', label: 'Đạt', icon: '🟢' };
  const total = diffDays(prog.from, prog.to) + 1;
  const elapsed = Math.min(total, Math.max(1, diffDays(prog.from, ref) + 1));
  if (ref > prog.to) return { cls: 'bad', label: 'Không đạt', icon: '🔴' };
  const expected = (elapsed / total) * 100;
  if (prog.pct >= expected - 10) return { cls: 'ok', label: 'Đúng tiến độ', icon: '🟢' };
  if (prog.pct >= expected - 30) return { cls: 'warn', label: 'Hơi chậm', icon: '🟡' };
  return { cls: 'bad', label: 'Chậm', icon: '🔴' };
}

// ---------------------------------------------------------------------------
// Thống kê theo người trong khoảng ngày (chỉ việc công ty, không tính việc riêng)
// ---------------------------------------------------------------------------
export function personStats(state, p, from, to) {
  const today = todayStr();
  const end = to > today ? today : to;
  const s = { workdays: 0, started: 0, onTime: 0, late: 0, veryLate: 0, startSum: 0, notStarted: 0,
    tasks: 0, done: 0, overdue: 0, missedRoutine: 0, routines: 0, reportsDue: 0, reportsOnTime: 0, reportsLate: 0, reportsMissing: 0, leaveDays: 0 };
  for (const d of eachDay(from, end)) {
    if (weekday(d) === 0) continue;
    if (!isWorkday(state, p.id, d)) {
      s.leaveDays++;
      continue;
    }
    s.workdays++;
    const st = state.daystarts.find((x) => x.person_id === p.id && x.date === d);
    if (st) {
      s.started++;
      s.startSum += minutesOf(st.started_at);
      const ss = startStatus(st.started_at, state.settings, p);
      if (ss.cls === 'ok') s.onTime++;
      else if (ss.cls === 'warn') s.late++;
      else s.veryLate++;
    } else if (d < today) s.notStarted++;
    if (weekday(d) !== 6 && p.role !== 'admin' && p.role !== 'bod' && p.needs_report !== false && d < today) {
      s.reportsDue++;
      const r = state.reports.find((x) => x.person_id === p.id && x.date === d);
      if (!r) s.reportsMissing++;
      else if (minutesOf(r.submitted_at) <= toMin(state.settings.report_deadline)) s.reportsOnTime++;
      else s.reportsLate++;
    }
  }
  for (const t of state.tasks) {
    if (t.owner_id !== p.id || t.scope === 'private' || t.hidden) continue;
    if (t.source === 'routine' || t.source === 'meeting') {
      if (t.date < from || t.date > end) continue;
      s.routines++;
      s.tasks++;
      if (t.status === 'done') s.done++;
      else if (t.date < today) s.missedRoutine++;
    } else {
      const dd = doneDate(t);
      const inRange = (t.date >= from && t.date <= end) || (dd && dd >= from && dd <= end);
      if (!inRange) continue;
      s.tasks++;
      if (t.status === 'done') {
        s.done++;
        if (t.due_date && dd > t.due_date) s.overdue++;
      } else if (t.due_date && t.due_date < today) s.overdue++;
    }
  }
  s.avgStart = s.started ? Math.round(s.startSum / s.started) : null;
  s.onTimePct = s.started ? Math.round((s.onTime / s.started) * 100) : null;
  s.donePct = s.tasks ? Math.round((s.done / s.tasks) * 100) : null;
  s.reportPct = s.reportsDue ? Math.round((s.reportsOnTime / s.reportsDue) * 100) : null;
  return s;
}

export const pctCls = (v, good = 90, warn = 70) => (v == null ? '' : v >= good ? 'ok' : v >= warn ? 'warn' : 'bad');
export const initials = (n) => {
  const w = String(n || '?').split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w.slice(-2).map((x) => x[0]).join('') : (w[0] || '?').slice(0, 2)).toUpperCase();
};
