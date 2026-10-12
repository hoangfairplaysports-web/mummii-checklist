// Kho dữ liệu.
// - Chưa điền js/config.js → chế độ DEMO: dữ liệu mẫu, lưu trên trình duyệt (localStorage).
// - Đã điền → chế độ THẬT: Supabase (đăng nhập, phân quyền RLS). Mọi thao tác cập nhật giao diện ngay
//   rồi ghi lên máy chủ; nếu máy chủ từ chối thì báo lỗi và tải lại dữ liệu thật.
import { makeSeed, instantiateRoutines, demoEvents } from './seed.js';
import { CONFIG } from './config.js';
import { uid, todayStr, addDays, yearStart, setDepts, getPosition, isRemote } from './util.js';

export const LIVE = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const KEY = 'fp-checklist-demo-v1';
let state;
let sb = null;
let onError = () => {};
const subs = new Set();

function commit() {
  if (!LIVE) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }
  state = { ...state };
  subs.forEach((f) => f(state));
}
export const getState = () => state;
export const getSb = () => sb;
export function subscribe(f) {
  subs.add(f);
  return () => subs.delete(f);
}
export function setErrorHandler(f) {
  onError = f;
}

// ---------------------------------------------------------------------------
// DEMO
// ---------------------------------------------------------------------------
function loadDemo() {
  let st;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) st = JSON.parse(raw);
  } catch {}
  st = st || makeSeed();
  if (!st.events) Object.assign(st, demoEvents(st));
  setDepts(st.depts);
  return st;
}
function ensureTodayDemo() {
  for (const d of [todayStr(), addDays(1)]) {
    for (const p of state.people) {
      if (p.role === 'bod' || p.active === false) continue;
      state.tasks.push(...instantiateRoutines(state, p, d));
    }
  }
}
export function resetDemo() {
  state = makeSeed();
  setDepts(state.depts);
  Object.assign(state, demoEvents(state));
  ensureTodayDemo();
  commit();
}

// ---------------------------------------------------------------------------
// THẬT (Supabase)
// ---------------------------------------------------------------------------
const translate = (msg = '') => {
  if (/Invalid login credentials/i.test(msg)) return 'Sai email hoặc mật khẩu';
  if (/row-level security|permission denied/i.test(msg)) return 'Bạn không có quyền thực hiện thao tác này';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Mất kết nối mạng, thử lại sau';
  return msg;
};
const chk = ({ data, error }) => {
  if (error) throw new Error(translate(error.message));
  return data;
};
async function all(q) {
  // PostgREST trả tối đa 1000 dòng/lần → lấy theo trang
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = chk(await q().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const fromDb = {
  member: (m) => ({ id: m.id, email: m.email, full_name: m.full_name, role: m.role, dept: m.dept, title: m.title, active: m.active,
    emp_type: m.emp_type, track_late: m.track_late, start_time: m.start_time, needs_report: m.needs_report,
    notify: { push: m.notify_push, telegram: m.notify_telegram }, telegram_linked: !!m.telegram_chat_id }),
  withGroup: (r) => {
    const { grp, ...rest } = r;
    return { ...rest, group: grp ?? null };
  },
};
const toDb = (row) => {
  const out = { ...row };
  if ('group' in out) {
    out.grp = out.group;
    delete out.group;
  }
  return out;
};
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k] === '' ? null : o[k]]));
const TASK_COLS = ['id', 'owner_id', 'title', 'date', 'time', 'end_time', 'due_date', 'source', 'routine_id', 'scope', 'group', 'priority', 'status',
  'progress', 'output', 'qty', 'note', 'block_reason', 'need_help', 'kpi_id', 'assigned_by'];
const ROUTINE_COLS = ['id', 'title', 'owner_id', 'dept', 'repeat', 'days', 'month_day', 'time', 'end_time', 'kind', 'priority', 'scope', 'group', 'kpi_key', 'active'];
const EV_TASK_COLS = ['id', 'event_id', 'phase', 'category', 'title', 'detail', 'pic_id', 'pic_name', 'sup_client', 'sup_fp', 'offset_days', 'due_date', 'status', 'note', 'item_id', 'sort'];
const KPI_COLS = ['id', 'key', 'title', 'owner_id', 'type', 'target', 'period', 'unit', 'manual', 'active'];

export const auth = {
  async session() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  async signIn(email, password) {
    chk(await sb.auth.signInWithPassword({ email: email.trim(), password }));
  },
  async signOut() {
    await sb.auth.signOut();
  },
  async changePassword(password) {
    chk(await sb.auth.updateUser({ password }));
  },
  async resetPassword(email) {
    chk(await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname }));
  },
  onChange(cb) {
    const { data } = sb.auth.onAuthStateChange((event) => setTimeout(() => cb(event), 0));
    return () => data.subscription.unsubscribe();
  },
};

export async function initStore() {
  if (!LIVE) {
    state = loadDemo();
    ensureTodayDemo();
    commit();
    return;
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
}

// Tải toàn bộ dữ liệu người đang đăng nhập được phép xem. Trả về null nếu chưa là thành viên Checklist.
export async function loadLive() {
  const s = await auth.session();
  if (!s) return null;
  const meId = s.user.id;
  const members = chk(await sb.from('cl_members').select('*').order('created_at'));
  const depts = chk(await sb.from('cl_depts').select('*').order('sort'));
  setDepts(depts);
  const me = members.find((m) => m.id === meId);
  if (!me || !me.active) return { notMember: true, email: s.user.email };
  // Sinh việc routine cho hôm nay + ngày mai (an toàn khi gọi nhiều lần)
  if (me.role !== 'bod') {
    await sb.rpc('cl_generate_routines', { p_date: todayStr() });
    await sb.rpc('cl_generate_routines', { p_date: addDays(1) });
  }
  const since = addDays(-100) < yearStart() ? addDays(-100) : yearStart();
  const [settings, routines, kpis, leaves, tasksRecent, tasksOpen, daystarts, reports, weekly, habits, habitLogs, chat] = await Promise.all([
    sb.from('cl_settings').select('data').eq('id', 1).maybeSingle().then(chk),
    all(() => sb.from('cl_routines').select('*').order('created_at')),
    all(() => sb.from('cl_kpis').select('*').order('created_at')),
    all(() => sb.from('cl_leaves').select('*')),
    all(() => sb.from('cl_tasks').select('*').gte('date', since).order('id')),
    all(() => sb.from('cl_tasks').select('*').lt('date', since).neq('status', 'done').order('id')),
    all(() => sb.from('cl_daystarts').select('*').gte('date', since).order('id')),
    all(() => sb.from('cl_reports').select('*').gte('date', since).order('id')),
    all(() => sb.from('cl_weekly').select('*').gte('week', since).order('id')),
    all(() => sb.from('cl_habits').select('*').order('created_at')),
    all(() => sb.from('cl_habit_logs').select('*').gte('date', addDays(-120)).order('id')),
    sb.from('cl_chat').select('*').order('at', { ascending: false }).limit(100).then(chk),
  ]);
  const [events, evTasks] = await Promise.all([
    all(() => sb.from(me.role === 'admin' ? 'ev_events' : 'ev_events_public').select('*').order('event_date')),
    all(() => sb.from('ev_tasks').select('*').order('event_id').order('sort')),
  ]).catch(() => [[], []]);
  state = {
    live: true,
    meId,
    settings: { ...(settings?.data || {}) },
    people: members.map(fromDb.member),
    depts,
    routines: routines.map(fromDb.withGroup),
    kpis,
    tasks: [...tasksRecent, ...tasksOpen].map(fromDb.withGroup),
    daystarts,
    reports,
    weekly,
    leaves,
    habits,
    habit_logs: habitLogs,
    chat: chat.reverse(),
    events,
    ev_tasks: evTasks,
    loadedAt: Date.now(),
  };
  commit();
  return state;
}

// Ghi lên máy chủ; lỗi → báo và tải lại dữ liệu thật
function persist(fn) {
  if (!LIVE) return Promise.resolve();
  return (async () => {
    try {
      return await fn();
    } catch (e) {
      onError(translate(e.message));
      await loadLive().catch(() => {});
    }
  })();
}
const run = async (q) => chk(await q);

export async function callFunction(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try {
      msg = (await error.context.json()).error || msg;
    } catch {}
    throw new Error(translate(msg));
  }
  return data;
}
export async function rpc(name, args) {
  return chk(await sb.rpc(name, args));
}

// ---------------------------------------------------------------------------
// Hành động (dùng chung cho cả 2 chế độ)
// ---------------------------------------------------------------------------
const nowIso = () => new Date().toISOString();
// Bản demo: tính nhãn GPS ngay trên trình duyệt (bản thật do máy chủ tính)
function demoLoc(pos, s, row) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(s.office_lat - pos.lat) / 2) ** 2 + Math.cos(rad(pos.lat)) * Math.cos(rad(s.office_lat)) * Math.sin(rad(s.office_lng - pos.lng) / 2) ** 2;
  row.distance_m = Math.round(2 * R * Math.asin(Math.sqrt(a)));
  return row.distance_m - Math.min(pos.accuracy_m || 0, 100) <= (s.office_radius || 150) ? 'office_gps' : 'outside';
}
const find = (coll, id) => state[coll].find((x) => x.id === id);

export const actions = {
  // Bắt đầu ngày. Nếu bật kiểm tra vị trí: đang ở mạng văn phòng thì ghi luôn, không thì xin GPS
  // (từ chối vẫn ghi được, máy chủ gắn nhãn "Chưa rõ vị trí"). Giờ + nhãn do máy chủ quyết định.
  // Nhân sự Remote / Cộng tác viên không bị kiểm tra.
  async startDay(pid) {
    if (state.daystarts.some((x) => x.person_id === pid && x.date === todayStr())) return;
    const s = state.settings;
    const remote = isRemote(find('people', pid));
    const check = !!s.checkin_on && !remote;
    let pos = null;
    if (check && s.office_lat != null) {
      const atOffice = LIVE && (s.office_ips || []).length ? await sb.rpc('cl_at_office').then((r) => r.data === true, () => false) : false;
      if (!atOffice) pos = await getPosition(6000);
    }
    if (state.daystarts.some((x) => x.person_id === pid && x.date === todayStr())) return;
    const row = { id: uid(), person_id: pid, date: todayStr(), started_at: nowIso() };
    if (!LIVE && s.checkin_on) row.loc = remote ? 'wfh' : pos && s.office_lat != null ? demoLoc(pos, s, row) : 'office_wifi';
    state.daystarts = [...state.daystarts, row];
    commit();
    await persist(async () => {
      // Giờ thật + nhãn vị trí do máy chủ ghi → cập nhật lại theo kết quả trả về
      const saved = await run(sb.from('cl_daystarts').insert({ id: row.id, ...(pos || {}) }).select().single());
      state.daystarts = state.daystarts.map((x) => (x.id === row.id ? saved : x));
      commit();
    });
    return state.daystarts.find((x) => x.id === row.id);
  },
  addTask(t) {
    const task = { id: uid(), status: 'todo', progress: 0, priority: 'mid', scope: 'work', source: 'adhoc', date: todayStr(), created_at: nowIso(), ...t };
    state.tasks = [...state.tasks, task];
    commit();
    persist(() => run(sb.from('cl_tasks').insert(toDb(pick(task, TASK_COLS)))));
    return task;
  },
  updateTask(id, patch) {
    const t = find('tasks', id);
    if (!t) return;
    const next = { ...t, ...patch };
    if (patch.status === 'done' && t.status !== 'done') next.done_at = nowIso();
    if (patch.status && patch.status !== 'done') next.done_at = null;
    state.tasks = state.tasks.map((x) => (x.id === id ? next : x));
    commit();
    persist(() => run(sb.from('cl_tasks').update(toDb(pick(patch, TASK_COLS))).eq('id', id)));
  },
  // soft = true: chỉ ẩn (dùng cho việc routine/họp để không bị sinh lại)
  deleteTask(id, soft = false) {
    if (soft) {
      state.tasks = state.tasks.map((x) => (x.id === id ? { ...x, hidden: true } : x));
      commit();
      persist(() => run(sb.from('cl_tasks').update({ hidden: true }).eq('id', id)));
      return;
    }
    state.tasks = state.tasks.filter((x) => x.id !== id);
    commit();
    persist(() => run(sb.from('cl_tasks').delete().eq('id', id)));
  },
  submitReport(pid, { blockers, plan }) {
    const date = todayStr();
    const old = state.reports.find((r) => r.person_id === pid && r.date === date);
    const row = { id: old?.id || uid(), person_id: pid, date, submitted_at: nowIso(), blockers, plan, status: 'submitted', manager_note: old?.manager_note || '' };
    state.reports = [...state.reports.filter((r) => r !== old), row];
    commit();
    persist(() => run(sb.from('cl_reports').upsert({ id: row.id, person_id: pid, date, blockers, plan }, { onConflict: 'person_id,date' })));
  },
  reviewReport(id, status, note) {
    state.reports = state.reports.map((r) => (r.id === id ? { ...r, status, manager_note: note || '', reviewed_at: nowIso() } : r));
    commit();
    persist(() => run(sb.from('cl_reports').update({ status, manager_note: note || '' }).eq('id', id)));
  },
  submitWeekly(pid, week, data) {
    const old = state.weekly.find((w) => w.person_id === pid && w.week === week);
    const row = { id: old?.id || uid(), person_id: pid, week, ...data, submitted_at: nowIso(), status: 'submitted' };
    state.weekly = [...state.weekly.filter((w) => w !== old), row];
    commit();
    persist(() => run(sb.from('cl_weekly').upsert({ id: row.id, person_id: pid, week, highlights: data.highlights, issues: data.issues, next_plan: data.next_plan }, { onConflict: 'person_id,week' })));
  },
  reviewWeekly(id, status, note) {
    state.weekly = state.weekly.map((w) => (w.id === id ? { ...w, status, manager_note: note || '', reviewed_at: nowIso() } : w));
    commit();
    persist(() => run(sb.from('cl_weekly').update({ status, manager_note: note || '' }).eq('id', id)));
  },
  saveKpi(k, routineIds = []) {
    let id = k.id;
    if (id) state.kpis = state.kpis.map((x) => (x.id === id ? { ...x, ...k } : x));
    else {
      id = uid();
      state.kpis = [...state.kpis, { manual: {}, active: true, ...k, id, key: k.key || uid() }];
    }
    // gắn routine → KPI: routine sinh việc từ nay về sau sẽ tự cộng vào KPI này
    const kpi = state.kpis.find((x) => x.id === id);
    state.routines = state.routines.map((r) => (routineIds.includes(r.id) ? { ...r, kpi_key: kpi.key } : r));
    const today = todayStr();
    const linked = state.tasks.filter((t) => routineIds.includes(t.routine_id) && t.owner_id === kpi.owner_id && t.date >= today);
    state.tasks = state.tasks.map((t) => (linked.includes(t) ? { ...t, kpi_id: id } : t));
    commit();
    persist(async () => {
      await run(sb.from('cl_kpis').upsert(pick(kpi, KPI_COLS)));
      if (routineIds.length) await run(sb.from('cl_routines').update({ kpi_key: kpi.key }).in('id', routineIds));
      if (linked.length) await run(sb.from('cl_tasks').update({ kpi_id: id }).in('id', linked.map((t) => t.id)));
    });
    return id;
  },
  setKpiManual(id, periodStart, value) {
    state.kpis = state.kpis.map((k) => (k.id === id ? { ...k, manual: { ...k.manual, [periodStart]: value } } : k));
    commit();
    persist(() => run(sb.from('cl_kpis').update({ manual: find('kpis', id).manual }).eq('id', id)));
  },
  deleteKpi(id) {
    state.kpis = state.kpis.filter((k) => k.id !== id);
    state.tasks = state.tasks.map((t) => (t.kpi_id === id ? { ...t, kpi_id: null } : t));
    commit();
    persist(() => run(sb.from('cl_kpis').delete().eq('id', id)));
  },
  saveRoutine(r) {
    const isNew = !(r.id && find('routines', r.id));
    const row = isNew ? { active: true, scope: 'work', priority: 'mid', ...r, id: uid() } : { ...find('routines', r.id), ...r };
    state.routines = isNew ? [...state.routines, row] : state.routines.map((x) => (x.id === row.id ? row : x));
    if (!LIVE) ensureTodayDemo();
    commit();
    persist(async () => {
      await run(sb.from('cl_routines').upsert(toDb(pick(row, ROUTINE_COLS))));
      await loadLive(); // sinh việc mới cho hôm nay/ngày mai
    });
  },
  deleteRoutine(id) {
    const today = todayStr();
    state.routines = state.routines.filter((r) => r.id !== id);
    state.tasks = state.tasks.filter((t) => !(t.routine_id === id && t.date >= today && t.status !== 'done'));
    commit();
    persist(async () => {
      await run(sb.from('cl_tasks').delete().eq('routine_id', id).gte('date', today).neq('status', 'done'));
      await run(sb.from('cl_routines').delete().eq('id', id));
    });
  },
  saveLeave(l) {
    const row = { ...l, id: l.id || uid() };
    state.leaves = [...state.leaves.filter((x) => x.id !== l.id), row];
    commit();
    persist(() => run(sb.from('cl_leaves').upsert(pick(row, ['id', 'person_id', 'from', 'to', 'type', 'note']))));
  },
  deleteLeave(id) {
    state.leaves = state.leaves.filter((x) => x.id !== id);
    commit();
    persist(() => run(sb.from('cl_leaves').delete().eq('id', id)));
  },
  saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    commit();
    persist(() => run(sb.from('cl_settings').update({ data: state.settings }).eq('id', 1)));
  },
  // Sửa thành viên đã có (thêm mới ở chế độ thật đi qua createMember)
  savePerson(p) {
    if (p.id && find('people', p.id)) {
      const next = { ...find('people', p.id), ...p };
      state.people = state.people.map((x) => (x.id === p.id ? next : x));
      commit();
      persist(() => run(sb.from('cl_members').update({
        full_name: next.full_name, role: next.role, dept: ['staff', 'manager'].includes(next.role) ? next.dept || null : null, title: next.title || null, active: next.active !== false,
        emp_type: next.emp_type || 'fulltime', track_late: next.track_late !== false, start_time: next.start_time || null, needs_report: next.needs_report !== false,
        notify_push: !!next.notify?.push, notify_telegram: !!next.notify?.telegram,
      }).eq('id', p.id)));
    } else {
      state.people = [...state.people, { active: true, notify: { push: true, telegram: false }, ...p, id: uid() }];
      ensureTodayDemo();
      commit();
    }
  },
  async createMember(p) {
    const res = await callFunction('cl-admin-users', { action: 'create', ...p });
    await loadLive();
    return res;
  },
  async resetMemberPassword(userId, password) {
    return callFunction('cl-admin-users', { action: 'reset_password', user_id: userId, password });
  },
  saveHabit(h) {
    const isNew = !(h.id && find('habits', h.id));
    const row = isNew ? { ...h, id: uid() } : { ...find('habits', h.id), ...h };
    state.habits = isNew ? [...state.habits, row] : state.habits.map((x) => (x.id === row.id ? row : x));
    commit();
    persist(() => run(sb.from('cl_habits').upsert(pick(row, ['id', 'owner_id', 'title', 'icon', 'days', 'unit', 'target']))));
  },
  deleteHabit(id) {
    state.habits = state.habits.filter((h) => h.id !== id);
    state.habit_logs = state.habit_logs.filter((l) => l.habit_id !== id);
    commit();
    persist(() => run(sb.from('cl_habits').delete().eq('id', id)));
  },
  logHabit(habitId, date, value) {
    const ex = state.habit_logs.find((l) => l.habit_id === habitId && l.date === date);
    if (ex && value == null) {
      state.habit_logs = state.habit_logs.filter((l) => l !== ex);
      commit();
      persist(() => run(sb.from('cl_habit_logs').delete().eq('habit_id', habitId).eq('date', date)));
      return;
    }
    const row = ex ? { ...ex, value } : { id: uid(), habit_id: habitId, date, value: value ?? 1 };
    state.habit_logs = ex ? state.habit_logs.map((l) => (l === ex ? row : l)) : [...state.habit_logs, row];
    commit();
    persist(() => run(sb.from('cl_habit_logs').upsert({ habit_id: habitId, date, value: row.value }, { onConflict: 'habit_id,date' })));
  },
  pushChat(msg) {
    state.chat = [...state.chat, { at: nowIso(), ...msg }].slice(-200);
    commit();
  },
  async askAssistant(text) {
    const res = await callFunction('cl-ai', { message: text });
    await loadLive();
    return res;
  },
  async savePushSub(sub) {
    const json = sub.toJSON();
    await run(sb.from('cl_push_subs').upsert({ owner_id: state.meId, endpoint: json.endpoint, sub: json }, { onConflict: 'endpoint' }));
  },
  async telegramCode() {
    return rpc('cl_telegram_code');
  },
  // IP mạng máy đang dùng, theo góc nhìn của máy chủ (để lưu làm IP văn phòng)
  async myIp() {
    return LIVE ? rpc('cl_my_ip') : '203.0.113.10';
  },
  async testNotify() {
    return callFunction('cl-notify', { action: 'test' });
  },
  async reload() {
    return loadLive();
  },

  // ----- Phòng ban (CEO thêm / sửa / xoá) -----
  saveDept(d) {
    const row = { sort: (state.depts?.length || 0) + 1, ...d, id: d.id || uid() };
    state.depts = d.id ? state.depts.map((x) => (x.id === d.id ? { ...x, ...row } : x)) : [...(state.depts || []), row];
    setDepts(state.depts);
    commit();
    persist(() => run(sb.from('cl_depts').upsert({ id: row.id, name: row.name, sort: row.sort })));
  },
  deleteDept(id) {
    state.depts = state.depts.filter((x) => x.id !== id);
    state.people = state.people.map((p) => (p.dept === id ? { ...p, dept: null } : p));
    state.routines = state.routines.filter((r) => r.dept !== id);
    setDepts(state.depts);
    commit();
    persist(async () => {
      await run(sb.from('cl_routines').delete().eq('dept', id));
      await run(sb.from('cl_depts').delete().eq('id', id));
    });
  },

  // ----- Dự án -----
  updateEvTask(id, patch) {
    const t = find('ev_tasks', id);
    if (!t) return;
    const next = { ...t, ...patch };
    if (patch.status === 'done' && t.status !== 'done') next.done_at = nowIso();
    if (patch.status && patch.status !== 'done') next.done_at = null;
    state.ev_tasks = state.ev_tasks.map((x) => (x.id === id ? next : x));
    commit();
    persist(() => run(sb.from('ev_tasks').update(patch).eq('id', id)));
  },
  addEvTask(t) {
    const row = { id: uid(), status: 'todo', sort: 9999, ...t };
    state.ev_tasks = [...state.ev_tasks, row];
    commit();
    persist(() => run(sb.from('ev_tasks').insert(pick(row, EV_TASK_COLS))));
    return row;
  },
  deleteEvTask(id) {
    state.ev_tasks = state.ev_tasks.filter((x) => x.id !== id);
    commit();
    persist(() => run(sb.from('ev_tasks').delete().eq('id', id)));
  },
  // Nhập checklist từ file (Claude/skill): thay toàn bộ hoặc thêm vào
  async importEvTasks(eventId, tasks, replace) {
    const rows = tasks.map((t, i) => ({ id: uid(), event_id: eventId, status: 'todo', ...t, sort: (t.sort ?? i) + (replace ? 0 : 1000) }));
    state.ev_tasks = [...state.ev_tasks.filter((x) => !(replace && x.event_id === eventId)), ...rows];
    commit();
    if (!LIVE) return;
    if (replace) await run(sb.from('ev_tasks').delete().eq('event_id', eventId));
    for (let i = 0; i < rows.length; i += 200) await run(sb.from('ev_tasks').insert(rows.slice(i, i + 200).map((x) => pick(x, EV_TASK_COLS))));
  },
  saveEvent(id, patch) {
    state.events = state.events.map((e) => (e.id === id ? { ...e, ...patch } : e));
    commit();
    persist(() => run(sb.from('ev_events').update(patch).eq('id', id)));
  },
};
