// Trợ lý AI (Google Gemini, function calling) — dùng cho chat trong app và Telegram.
// Chỉ tài khoản Quản lý dùng. Trợ lý chỉ thao tác trên dữ liệu Checklist:
// việc của chính quản lý (kể cả việc riêng) + việc công ty của team (không bao giờ thấy việc riêng của người khác).
import { addDays, admin, dowOf, fmtTime, Member, toMin, vnNow } from './common.ts';

const KEY = Deno.env.get('GEMINI_API_KEY');
const MODELS: Record<string, string> = {
  'gemini-flash': Deno.env.get('GEMINI_MODEL_FLASH') ?? 'gemini-flash-latest',
  'gemini-pro': Deno.env.get('GEMINI_MODEL_PRO') ?? 'gemini-pro-latest',
};
// Model dự phòng khi Google quá tải (503) hoặc vượt hạn mức (429)
const FALLBACKS = (Deno.env.get('GEMINI_FALLBACKS') ?? 'gemini-flash-lite-latest,gemini-2.5-flash').split(',').map((x) => x.trim()).filter(Boolean);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gọi Gemini: thử lại khi quá tải, rồi chuyển model dự phòng. Trả về {data, model} hoặc {error}
async function callGemini(models: string[], body: unknown): Promise<{ data?: any; model?: string; error?: string }> {
  let last = '';
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY! },
        body: JSON.stringify(body),
      });
      if (res.ok) return { data: await res.json(), model };
      last = `${res.status}`;
      const text = await res.text();
      console.error('Gemini', model, res.status, text.slice(0, 300));
      if (res.status === 404 || res.status === 400) break;        // model không dùng được → thử model khác
      if (res.status === 401 || res.status === 403) return { error: 'auth' };
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
      await sleep(1500 * (attempt + 1));                          // quá tải → đợi rồi thử lại
    }
  }
  return { error: last };
}
const WD = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const STATUS: Record<string, string> = { todo: 'chưa làm', doing: 'đang làm', blocked: 'vướng', done: 'xong' };

// ---------------------------------------------------------------------------
// Công cụ cho Gemini
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'list_tasks',
    description: 'Liệt kê việc trong 1 ngày. Mặc định: việc của chính người dùng hôm nay (gồm việc tồn chưa xong). Có thể xem việc của 1 nhân viên theo tên.',
    parameters: { type: 'object', properties: {
      date: { type: 'string', description: 'YYYY-MM-DD, mặc định hôm nay' },
      person: { type: 'string', description: 'Tên nhân viên (bỏ trống = của tôi)' },
    } },
  },
  {
    name: 'add_task',
    description: 'Thêm việc mới cho người dùng, hoặc giao việc cho nhân viên nếu có assignee.',
    parameters: { type: 'object', properties: {
      title: { type: 'string' },
      date: { type: 'string', description: 'Ngày bắt đầu YYYY-MM-DD, mặc định hôm nay' },
      time: { type: 'string', description: 'Giờ HH:MM nếu có' },
      due_date: { type: 'string', description: 'Hạn chót YYYY-MM-DD nếu có' },
      priority: { type: 'string', enum: ['high', 'mid', 'low'] },
      private: { type: 'boolean', description: 'true nếu là việc riêng/cá nhân không liên quan công ty' },
      group: { type: 'string', enum: ['health', 'family', 'finance', 'other'], description: 'Nhóm việc riêng' },
      assignee: { type: 'string', description: 'Tên nhân viên được giao (bỏ trống = việc của tôi)' },
    }, required: ['title'] },
  },
  {
    name: 'update_task',
    description: 'Cập nhật 1 việc của người dùng: trạng thái, ghi chú, dời ngày, hạn chót. Dùng task_id lấy từ list_tasks.',
    parameters: { type: 'object', properties: {
      task_id: { type: 'string' },
      status: { type: 'string', enum: ['todo', 'doing', 'blocked', 'done'] },
      note: { type: 'string' },
      progress: { type: 'number' },
      date: { type: 'string', description: 'Dời sang ngày YYYY-MM-DD' },
      due_date: { type: 'string' },
      block_reason: { type: 'string' },
    }, required: ['task_id'] },
  },
  {
    name: 'team_overview',
    description: 'Tình hình team trong 1 ngày: ai đã bắt đầu làm việc lúc mấy giờ, % việc xong, việc vướng, quá hạn, báo cáo đã nộp.',
    parameters: { type: 'object', properties: { date: { type: 'string' } } },
  },
  {
    name: 'kpi_status',
    description: 'Tiến độ KPI của team trong chu kỳ hiện tại (tuần/tháng/quý).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'log_habit',
    description: 'Ghi nhận đã làm 1 thói quen hôm nay (VD chạy bộ 5km, uống đủ nước).',
    parameters: { type: 'object', properties: {
      habit: { type: 'string', description: 'Tên thói quen gần đúng' },
      value: { type: 'number', description: 'Số liệu nếu có (km, phút…)' },
      date: { type: 'string' },
    }, required: ['habit'] },
  },
  {
    name: 'habits_status',
    description: 'Danh sách thói quen, hôm nay đã làm chưa, chuỗi ngày liên tục.',
    parameters: { type: 'object', properties: {} },
  },
];

type Args = Record<string, unknown>;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

async function members() {
  const { data } = await admin.from('cl_members').select('*').eq('active', true);
  return (data ?? []) as Member[];
}
function findPerson(list: Member[], name: string) {
  const n = norm(name);
  return list.find((m) => norm(m.full_name) === n) ?? list.find((m) => norm(m.full_name).includes(n)) ??
    list.find((m) => norm(m.full_name).split(' ').some((w) => w === n));
}

async function exec(me: Member, name: string, a: Args) {
  const today = vnNow().date;
  const date = (a.date as string) || today;
  const people = await members();

  if (name === 'list_tasks') {
    let owner = me;
    if (a.person) {
      const p = findPerson(people, String(a.person));
      if (!p) return { error: `Không tìm thấy nhân viên "${a.person}"` };
      owner = p;
    }
    let q = admin.from('cl_tasks').select('id, title, date, time, due_date, status, progress, note, block_reason, scope, source, priority').eq('owner_id', owner.id).eq('hidden', false);
    if (owner.id !== me.id) q = q.eq('scope', 'work');
    const { data } = await q.lte('date', date).or(`status.neq.done,date.eq.${date}`);
    const rows = (data ?? []).filter((t) => t.date === date || ['routine', 'meeting'].includes(t.source) === false || t.date === date)
      .filter((t) => !(['routine', 'meeting'].includes(t.source) && t.date !== date));
    return { person: owner.full_name, date, tasks: rows.map((t) => ({
      task_id: t.id, title: t.title, time: t.time, status: STATUS[t.status], progress: t.progress, note: t.note, blocked_reason: t.block_reason,
      private: t.scope === 'private', priority: t.priority, due_date: t.due_date, carried_from: t.date !== date ? t.date : undefined,
    })) };
  }

  if (name === 'add_task') {
    let owner = me;
    if (a.assignee) {
      const p = findPerson(people.filter((x) => x.role === 'staff' || x.role === 'manager'), String(a.assignee));
      if (!p) return { error: `Không tìm thấy nhân viên "${a.assignee}"` };
      owner = p;
    }
    const isPrivate = owner.id === me.id && a.private === true;
    const row = {
      owner_id: owner.id, title: String(a.title), date, time: (a.time as string) || null, due_date: (a.due_date as string) || null,
      priority: (a.priority as string) || 'mid', scope: isPrivate ? 'private' : 'work', grp: isPrivate ? (a.group as string) || 'other' : null,
      source: owner.id !== me.id ? 'assigned' : date > today ? 'plan' : 'adhoc', assigned_by: owner.id !== me.id ? me.id : null,
    };
    const { data, error } = await admin.from('cl_tasks').insert(row).select('id').single();
    if (error) return { error: error.message };
    return { ok: true, task_id: data.id, owner: owner.full_name, ...row };
  }

  if (name === 'update_task') {
    const { data: t } = await admin.from('cl_tasks').select('*').eq('id', String(a.task_id)).maybeSingle();
    if (!t || (t.owner_id !== me.id && t.scope !== 'work')) return { error: 'Không tìm thấy việc' };
    const patch: Record<string, unknown> = {};
    for (const k of ['status', 'note', 'progress', 'date', 'due_date', 'block_reason']) if (a[k] != null) patch[k] = a[k];
    const { error } = await admin.from('cl_tasks').update(patch).eq('id', t.id);
    return error ? { error: error.message } : { ok: true, title: t.title, ...patch };
  }

  if (name === 'team_overview') {
    const staff = people.filter((m) => m.role === 'staff' || m.role === 'manager');
    const [{ data: starts }, { data: tasks }, { data: reps }, { data: settings }] = await Promise.all([
      admin.from('cl_daystarts').select('person_id, started_at').eq('date', date),
      admin.from('cl_tasks').select('owner_id, title, status, due_date, block_reason, need_help, source, date').eq('scope', 'work').eq('hidden', false).lte('date', date).or(`status.neq.done,date.eq.${date}`),
      admin.from('cl_reports').select('person_id, status, submitted_at').eq('date', date),
      admin.from('cl_settings').select('data').eq('id', 1).maybeSingle(),
    ]);
    const late = settings?.data?.late_after ?? '09:00';
    return { date, late_after: late, people: staff.map((m) => {
      const st = (starts ?? []).find((x) => x.person_id === m.id);
      const mine = (tasks ?? []).filter((t) => t.owner_id === m.id && !(['routine', 'meeting'].includes(t.source) && t.date !== date));
      return {
        name: m.full_name, dept: m.dept,
        started_at: st ? fmtTime(st.started_at) : null, late: st ? toMin(fmtTime(st.started_at)) > toMin(late) : null,
        done: mine.filter((t) => t.status === 'done').length, total: mine.length,
        blocked: mine.filter((t) => t.status === 'blocked').map((t) => ({ title: t.title, reason: t.block_reason, need: t.need_help })),
        overdue: mine.filter((t) => t.status !== 'done' && t.due_date && t.due_date < date).map((t) => t.title),
        report: (reps ?? []).find((r) => r.person_id === m.id)?.status ?? 'chưa nộp',
      };
    }) };
  }

  if (name === 'kpi_status') {
    const { data: kpis } = await admin.from('cl_kpis').select('*').eq('active', true);
    const out = [];
    for (const k of kpis ?? []) {
      const [from, to] = periodRange(k.period, today);
      let value = Number(k.manual?.[from] ?? 0);
      if (k.type === 'count') {
        const { data: done } = await admin.from('cl_tasks').select('qty').eq('kpi_id', k.id).eq('status', 'done')
          .gte('done_at', from + 'T00:00:00+07:00').lte('done_at', to + 'T23:59:59+07:00');
        value += (done ?? []).reduce((s, t) => s + (Number(t.qty) || 1), 0);
      }
      const target = k.type === 'bool' ? 1 : Number(k.target);
      out.push({ person: people.find((p) => p.id === k.owner_id)?.full_name, kpi: k.title, period: `${from}..${to}`,
        value: k.type === 'bool' ? (value ? 'xong' : 'chưa') : value, target, unit: k.unit, pct: Math.round(((k.type === 'bool' ? (value ? 1 : 0) : value) / target) * 100) });
    }
    return { kpis: out };
  }

  if (name === 'log_habit' || name === 'habits_status') {
    const { data: habits } = await admin.from('cl_habits').select('*').eq('owner_id', me.id);
    if (name === 'log_habit') {
      const n = norm(String(a.habit));
      const h = (habits ?? []).find((x) => norm(x.title).includes(n) || n.includes(norm(x.title).split(' ')[0]));
      if (!h) return { error: 'Không tìm thấy thói quen này', habits: (habits ?? []).map((x) => x.title) };
      const { error } = await admin.from('cl_habit_logs').upsert({ habit_id: h.id, owner_id: me.id, date, value: Number(a.value) || 1 }, { onConflict: 'habit_id,date' });
      if (error) return { error: error.message };
      return { ok: true, habit: h.title, date, value: a.value ?? 1, unit: h.unit, streak: await streak(h) };
    }
    return { habits: await Promise.all((habits ?? []).map(async (h) => {
      const { data: log } = await admin.from('cl_habit_logs').select('value').eq('habit_id', h.id).eq('date', today).maybeSingle();
      return { title: h.title, scheduled_today: h.days.includes(dowOf(today)), done_today: !!log, value: log?.value, unit: h.unit, streak: await streak(h) };
    })) };
  }
  return { error: 'Công cụ không tồn tại' };
}

async function streak(h: { id: string; days: number[] }) {
  const { data } = await admin.from('cl_habit_logs').select('date').eq('habit_id', h.id).order('date', { ascending: false }).limit(400);
  const set = new Set((data ?? []).map((x) => x.date));
  let d = vnNow().date;
  if (!set.has(d)) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    if (!h.days.includes(dowOf(d))) continue;
    if (set.has(d)) n++;
    else break;
  }
  return n;
}

function periodRange(period: string, ref: string): [string, string] {
  const d = new Date(ref + 'T00:00:00Z');
  if (period === 'week') {
    const s = addDays(ref, -((d.getUTCDay() + 6) % 7));
    return [s, addDays(s, 6)];
  }
  const y = d.getUTCFullYear();
  const m0 = period === 'quarter' ? Math.floor(d.getUTCMonth() / 3) * 3 : d.getUTCMonth();
  const len = period === 'quarter' ? 3 : 1;
  const s = new Date(Date.UTC(y, m0, 1)).toISOString().slice(0, 10);
  const e = new Date(Date.UTC(y, m0 + len, 0)).toISOString().slice(0, 10);
  return [s, e];
}

// ---------------------------------------------------------------------------
// Hội thoại
// ---------------------------------------------------------------------------
export async function ask(me: Member, text: string): Promise<string> {
  if (!KEY) return 'Trợ lý chưa được cấu hình (thiếu GEMINI_API_KEY).';
  if (me.role !== 'admin') return 'Trợ lý AI hiện chỉ dành cho tài khoản Quản lý.';
  const { data: setting } = await admin.from('cl_settings').select('data').eq('id', 1).maybeSingle();
  const model = MODELS[setting?.data?.ai_model ?? 'gemini-flash'] ?? MODELS['gemini-flash'];
  const now = vnNow();

  // Lịch sử gần đây để hiểu ngữ cảnh
  const { data: hist } = await admin.from('cl_chat').select('role, text').eq('owner_id', me.id).order('at', { ascending: false }).limit(12);
  await admin.from('cl_chat').insert({ owner_id: me.id, role: 'me', text });
  const contents: Record<string, unknown>[] = (hist ?? []).reverse().map((m) => ({ role: m.role === 'me' ? 'user' : 'model', parts: [{ text: m.text }] }));
  contents.push({ role: 'user', parts: [{ text }] });

  const system = `Bạn là trợ lý công việc của ${me.full_name} (Mummii Entertainment — công ty sản xuất nội dung: video, MV, phim ngắn, chiến dịch truyền thông, booking KOL/KOC, đào tạo content creator).
Bây giờ: ${WD[now.dow]}, ${now.date}, ${now.hm} (giờ Việt Nam). Giờ làm T2–T6 8:30–17:30, thứ 7 8:30–12:30, chủ nhật nghỉ.
Cách nói: tiếng Việt, xưng "mình", gọi người dùng là "bạn"; ngắn gọn, rõ ràng, dùng gạch đầu dòng khi liệt kê; không dùng markdown đậm/nghiêng.
Luôn dùng công cụ để đọc/ghi dữ liệu thật, không bịa. Tự suy ra ngày từ cách nói ("mai", "thứ 6 tuần này", "3h chiều" = 15:00).
Việc cá nhân/gia đình/tài chính/sức khoẻ không liên quan công ty → private=true. Sau khi thêm/sửa, xác nhận lại ngắn gọn ngày giờ.
Nếu người dùng kể đã tập thể dục/uống nước/ngủ sớm… → log_habit.`;

  let chain = [model, ...FALLBACKS.filter((m) => m !== model)];
  for (let round = 0; round < 6; round++) {
    const out = await callGemini(chain, {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      generationConfig: { temperature: 0.3 },
    });
    if (out.error) {
      const msg = out.error === 'auth'
        ? 'Khoá Gemini không hợp lệ hoặc đã bị thu hồi — cần nạp lại khoá.'
        : 'Máy chủ Gemini của Google đang quá tải, mình chưa trả lời được. Bạn thử lại sau ít phút nhé.';
      await admin.from('cl_chat').insert({ owner_id: me.id, role: 'bot', text: msg });
      return msg;
    }
    chain = [out.model!]; // cùng 1 hội thoại giữ nguyên model đã trả lời được
    const data = out.data;
    const content = data.candidates?.[0]?.content;
    const parts = (content?.parts ?? []) as Record<string, unknown>[];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const answer = parts.map((p) => p.text ?? '').join('').trim() || 'Mình chưa hiểu ý bạn, bạn nói rõ hơn giúp mình nhé.';
      await admin.from('cl_chat').insert({ owner_id: me.id, role: 'bot', text: answer });
      return answer;
    }
    contents.push(content); // giữ nguyên (kể cả chữ ký suy luận) để Gemini nối tiếp
    const responses = [];
    for (const c of calls) {
      const fc = c.functionCall as { name: string; args?: Args; id?: string };
      let result: unknown;
      try {
        result = await exec(me, fc.name, fc.args ?? {});
      } catch (e) {
        result = { error: String(e) };
      }
      responses.push({ functionResponse: { name: fc.name, ...(fc.id ? { id: fc.id } : {}), response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  const msg = 'Yêu cầu hơi phức tạp, bạn chia nhỏ giúp mình nhé.';
  await admin.from('cl_chat').insert({ owner_id: me.id, role: 'bot', text: msg });
  return msg;
}
