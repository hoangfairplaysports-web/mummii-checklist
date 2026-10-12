// Bộ nhắc việc — cron gọi mỗi 5 phút (header x-cron-secret = CRON_SECRET).
// Người dùng đã đăng nhập gọi với { action: 'test' } để nhận 1 thông báo thử.
import { admin, addDays, caller, cors, dowOf, fmtTime, json, Member, notifyMember, once, toMin, vnNow } from '../_shared/common.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const body = await req.json().catch(() => ({}));
  if (body.action === 'test') {
    const me = await caller(req);
    if (!me) return json({ error: 'Phiên đăng nhập hết hạn' }, 401);
    const r = await notifyMember({ ...me, notify_push: true }, '🔔 Mummii Checklist', 'Thông báo đã hoạt động trên thiết bị này.', { tag: 'test' });
    return json(r);
  }
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'Forbidden' }, 403);

  const sent: string[] = [];
  try {
    await runReminders(sent);
  } catch (e) {
    return json({ error: String(e), sent }, 500);
  }
  return json({ ok: true, sent });
});

async function runReminders(sent: string[]) {
  const now = vnNow();
  const today = now.date;
  const sunday = now.dow === 0;
  const saturday = now.dow === 6;
  const [{ data: membersRaw }, { data: settingsRow }, { data: leaves }] = await Promise.all([
    admin.from('cl_members').select('*').eq('active', true),
    admin.from('cl_settings').select('data').eq('id', 1).maybeSingle(),
    admin.from('cl_leaves').select('*').lte('from', today).gte('to', today),
  ]);
  const members = (membersRaw ?? []) as Member[];
  const s = { late_after: '08:30', report_deadline: '17:30', ...(settingsRow?.data ?? {}) };
  const admins = members.filter((m) => m.role === 'admin');
  const staff = members.filter((m) => m.role === 'staff' || m.role === 'manager');
  const onLeave = (m: Member) => (leaves ?? []).some((l) => (l.person_id === m.id || l.type === 'holiday') && ['full', 'holiday'].includes(l.type));
  const working = (m: Member) => !sunday && !onLeave(m);
  const inWindow = (from: string, to: string) => now.minutes >= toMin(from) && now.minutes < toMin(to);
  const send = async (key: string, m: Member, title: string, text: string, tag?: string) => {
    if (await once(key)) {
      await notifyMember(m, title, text, { tag });
      sent.push(key);
    }
  };

  // Sinh việc routine hôm nay (phòng khi chưa ai mở app)
  if (now.minutes < 60) await admin.rpc('cl_generate_routines');

  // 1) Nhắc việc có giờ: trước 10–15 phút
  const { data: timed } = await admin.from('cl_tasks').select('id, owner_id, title, time, status, scope')
    .eq('date', today).eq('hidden', false).neq('status', 'done').not('time', 'is', null);
  for (const t of timed ?? []) {
    const diff = toMin(t.time) - now.minutes;
    const m = members.find((x) => x.id === t.owner_id);
    if (!m || diff < 0 || diff > 15 || !working(m)) continue;
    await send(`rem:${t.id}:${today}`, m, `🕐 ${t.time} — ${t.title}`, `Còn ${diff} phút nữa.`, `rem-${t.id}`);
  }

  if (!sunday) {
    const { data: starts } = await admin.from('cl_daystarts').select('person_id, started_at, loc').eq('date', today);
    const started = new Set((starts ?? []).map((x) => x.person_id));

    // 2) 8:50 — nhắc nhân viên bấm "Bắt đầu ngày làm việc"
    if (inWindow('08:20', '09:00'))
      for (const m of staff) if (working(m) && !started.has(m.id))
        await send(`start:${m.id}:${today}`, m, '☀️ Bắt đầu ngày làm việc', `Mở Mummii Checklist và bấm "Bắt đầu ngày làm việc" trước ${s.late_after}.`, 'start');

    // 3) 9:15 — báo quản lý ai chưa bắt đầu
    if (inWindow('08:45', '09:30')) {
      const missing = staff.filter((m) => working(m) && !started.has(m.id));
      const late = (starts ?? []).filter((x) => staff.some((m) => m.id === x.person_id) && toMin(fmtTime(x.started_at)) > toMin(s.late_after));
      const away = (starts ?? []).filter((x) => staff.some((m) => m.id === x.person_id) && (x.loc === 'outside' || x.loc === 'unknown'));
      const lines = [
        missing.length ? `Chưa bắt đầu: ${missing.map((m) => m.full_name).join(', ')}` : 'Cả team đã bắt đầu ngày làm việc ✅',
        ...(late.length ? [`Bắt đầu trễ: ${late.map((x) => `${members.find((m) => m.id === x.person_id)?.full_name} (${fmtTime(x.started_at)})`).join(', ')}`] : []),
        ...(away.length ? [`Ngoài văn phòng / chưa rõ vị trí: ${away.map((x) => `${members.find((m) => m.id === x.person_id)?.full_name} (${x.loc === 'outside' ? 'ngoài VP' : 'chưa rõ'})`).join(', ')}`] : []),
      ];
      for (const a of admins) await send(`sum915:${a.id}:${today}`, a, '👥 Team sáng nay', lines.join('\n'), 'sum915');
    }

    // 4) 9:00 — nhắc việc quá hạn
    if (inWindow('09:00', '10:30')) {
      const { data: overdue } = await admin.from('cl_tasks').select('owner_id, title').lt('due_date', today).eq('hidden', false).neq('status', 'done');
      for (const m of members.filter((x) => x.role !== 'bod' && working(x))) {
        const mine = (overdue ?? []).filter((t) => t.owner_id === m.id);
        if (mine.length)
          await send(`od:${m.id}:${today}`, m, `⚠️ ${mine.length} việc quá hạn`, mine.slice(0, 5).map((t) => '• ' + t.title).join('\n'), 'overdue');
      }
    }

    // 5) 16:30 — nhắc chốt báo cáo (T2–T6)
    if (!saturday) {
      const { data: reps } = await admin.from('cl_reports').select('id, person_id, status, submitted_at, reviewed_at').eq('date', today);
      const submitted = new Set((reps ?? []).map((r) => r.person_id));
      if (inWindow('17:00', toHm(toMin(s.report_deadline))))
        for (const m of staff) if (working(m) && !submitted.has(m.id))
          await send(`rep:${m.id}:${today}`, m, '📝 Chốt báo cáo cuối ngày', `Hạn nộp ${s.report_deadline}. Phần việc đã làm được tự điền từ checklist.`, 'report');
      // 6) 17:30 — tổng kết cho quản lý
      if (inWindow('17:45', '19:00')) {
        const missing = staff.filter((m) => working(m) && !submitted.has(m.id));
        const pending = (reps ?? []).filter((r) => r.status === 'submitted').length;
        const text = [missing.length ? `Chưa nộp báo cáo: ${missing.map((m) => m.full_name).join(', ')}` : 'Đã nộp đủ báo cáo ✅', pending ? `${pending} báo cáo đang chờ duyệt.` : ''].filter(Boolean).join('\n');
        for (const a of admins) await send(`sum1730:${a.id}:${today}`, a, '📨 Báo cáo cuối ngày', text, 'sum1730');
      }
    }
  }

  // 7) Sự kiện trong 20 phút gần nhất
  const since = new Date(Date.now() - 20 * 60_000).toISOString();
  const [{ data: assigned }, { data: blocked }, { data: newReps }, { data: reviewed }] = await Promise.all([
    admin.from('cl_tasks').select('id, owner_id, title, due_date').eq('source', 'assigned').gte('created_at', since),
    admin.from('cl_tasks').select('id, owner_id, title, block_reason, need_help').eq('status', 'blocked').eq('scope', 'work').gte('updated_at', since),
    admin.from('cl_reports').select('id, person_id, submitted_at').eq('status', 'submitted').gte('submitted_at', since),
    admin.from('cl_reports').select('id, person_id, status, manager_note, reviewed_at').in('status', ['approved', 'returned']).gte('reviewed_at', since),
  ]);
  for (const t of assigned ?? []) {
    const m = members.find((x) => x.id === t.owner_id);
    if (m) await send(`asg:${t.id}`, m, '📌 Bạn được giao việc mới', t.title + (t.due_date ? ` (hạn ${t.due_date.slice(8, 10)}/${t.due_date.slice(5, 7)})` : ''), 'assign');
  }
  for (const t of blocked ?? []) {
    const who = members.find((x) => x.id === t.owner_id);
    if (!who || who.role === 'admin') continue;
    for (const a of admins)
      await send(`blk:${t.id}:${a.id}:${t.block_reason ?? ''}`, a, `🚧 ${who.full_name} đang vướng`, `${t.title}\n${t.block_reason ?? ''}${t.need_help ? '\nCần: ' + t.need_help : ''}`, 'blocked');
  }
  for (const r of newReps ?? []) {
    const who = members.find((x) => x.id === r.person_id);
    for (const a of admins) await send(`newrep:${r.id}:${r.submitted_at}:${a.id}`, a, '📨 Báo cáo mới', `${who?.full_name ?? 'Nhân viên'} vừa nộp báo cáo ngày.`, 'newrep');
  }
  for (const r of reviewed ?? []) {
    const m = members.find((x) => x.id === r.person_id);
    if (m) await send(`rev:${r.id}:${r.reviewed_at}`, m, r.status === 'approved' ? '✅ Báo cáo đã được duyệt' : '↩ Báo cáo bị trả lại', r.manager_note || (r.status === 'returned' ? 'Mở app để xem và nộp lại.' : ''), 'review');
  }

  // 7b) Dự án — 8:45: việc dự án của từng người (hạn hôm nay/mai hoặc quá hạn)
  if (inWindow('08:15', '10:00') && !sunday) {
    const tomorrow = addDays(today, 1);
    const { data: evTasks } = await admin.from('ev_tasks').select('title, due_date, pic_id, event_id').neq('status', 'done').lte('due_date', tomorrow).not('pic_id', 'is', null);
    const { data: evs } = await admin.from('ev_events').select('id, name, status').in('status', ['preparing', 'running']);
    const evName = Object.fromEntries((evs ?? []).map((e) => [e.id, e.name]));
    for (const m of members) {
      const mine = (evTasks ?? []).filter((t) => t.pic_id === m.id && evName[t.event_id]);
      if (!mine.length) continue;
      const lines = mine.slice(0, 10).map((t) => `• ${t.due_date < today ? '⚠️ quá hạn ' : t.due_date === today ? 'hôm nay ' : 'mai '}${t.title} — ${evName[t.event_id]}`);
      await send(`evtask:${m.id}:${today}`, m, `🎬 ${mine.length} việc dự án cần làm`, lines.join('\n'), 'evtask');
    }
  }

  // 7c) Dự án — 9:00: hợp đồng, khách thanh toán, trả nhà cung cấp (chỉ quản lý)
  if (inWindow('09:00', '11:00') && !sunday) {
    const soon = addDays(today, 2);
    const [{ data: evs }, { data: pays }, { data: items }] = await Promise.all([
      admin.from('ev_events').select('id, name, contract_signed_at, contract_deadline, status').in('status', ['preparing', 'running', 'done']),
      admin.from('ev_payments').select('event_id, label, amount, due_date, status').neq('status', 'paid').lte('due_date', soon),
      admin.from('ev_items').select('event_id, name, supplier_due, supplier_status, supplier_issue').eq('chosen', true).in('supplier_status', ['unpaid', 'partial']).lte('supplier_due', soon),
    ]);
    const name = Object.fromEntries((evs ?? []).map((e) => [e.id, e.name]));
    const lines: string[] = [];
    for (const e of evs ?? []) if (!e.contract_signed_at && e.contract_deadline && e.contract_deadline <= today && e.status !== 'done') lines.push(`📝 ${e.name}: ${e.contract_deadline < today ? 'QUÁ HẠN' : 'hôm nay hết hạn'} ký hợp đồng`);
    for (const p of pays ?? []) if (name[p.event_id]) lines.push(`💰 ${name[p.event_id]}: ${p.label} ${p.due_date < today ? 'QUÁ HẠN' : 'đến hạn ' + p.due_date.slice(8, 10) + '/' + p.due_date.slice(5, 7)} — nhắc khách`);
    for (const it of items ?? []) if (name[it.event_id]) lines.push(`🏭 ${name[it.event_id]}: trả NCC "${it.name}" ${it.supplier_due < today ? 'QUÁ HẠN' : 'đến hạn'}${it.supplier_issue ? ' — vướng: ' + it.supplier_issue : ''}`);
    if (lines.length) for (const a of admins) await send(`evfin:${a.id}:${today}`, a, '🎬 Dự án cần xử lý', lines.slice(0, 15).join('\n'), 'evfin');
  }

  // 8) 8:30 — bản tin sáng cho quản lý (Telegram + app)
  if (inWindow('08:00', '08:30') && !sunday) {
    for (const a of admins) {
      const { data: mine } = await admin.from('cl_tasks').select('title, time, status, due_date, scope').eq('owner_id', a.id).eq('hidden', false).neq('status', 'done').lte('date', today);
      const list = (mine ?? []).sort((x, y) => (x.time ?? '99').localeCompare(y.time ?? '99'));
      const yesterday = addDays(today, dowOf(today) === 1 ? -2 : -1);
      const { data: yRep } = await admin.from('cl_reports').select('person_id').eq('date', yesterday);
      const text = [
        `Hôm nay bạn có ${list.length} việc:`,
        ...list.slice(0, 12).map((t) => `• ${t.time ? t.time + ' ' : ''}${t.scope === 'private' ? '🔒 ' : ''}${t.title}${t.due_date && t.due_date < today ? ' ⚠️ quá hạn' : ''}`),
        '',
        `Báo cáo ngày ${yesterday.slice(8, 10)}/${yesterday.slice(5, 7)}: ${(yRep ?? []).length}/${staff.length} người đã nộp.`,
      ].join('\n');
      await send(`brief:${a.id}:${today}`, a, '☀️ Bản tin sáng', text, 'brief');
    }
  }
}

const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
