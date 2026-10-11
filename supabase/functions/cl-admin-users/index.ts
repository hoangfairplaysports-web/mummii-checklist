// Quản lý thêm thành viên Checklist / đặt lại mật khẩu ngay trong app.
// Chỉ Quản lý (cl_members.role = 'admin') gọi được.
import { admin, caller, cors, json } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const me = await caller(req);
  if (!me) return json({ error: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại' }, 401);
  if (me.role !== 'admin') return json({ error: 'Chỉ Quản lý được quản lý tài khoản' }, 403);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'Dữ liệu không hợp lệ' }, 400);
  }

  if (b.action === 'create') {
    const email = String(b.email ?? '').trim().toLowerCase();
    const password = String(b.password ?? '');
    const full_name = String(b.full_name ?? '').trim();
    const role = ['admin', 'manager', 'staff', 'bod'].includes(String(b.role)) ? String(b.role) : 'staff';
    const dept = ['staff', 'manager'].includes(role) && b.dept ? String(b.dept) : null;
    const title = String(b.title ?? '').trim() || null;
    const emp_type = ['fulltime', 'parttime', 'intern', 'remote', 'freelance'].includes(String(b.emp_type)) ? String(b.emp_type) : 'fulltime';
    const extra = { emp_type, track_late: b.track_late !== false, start_time: String(b.start_time || '') || null, needs_report: b.needs_report !== false };
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Email không hợp lệ' }, 400);
    if (!full_name) return json({ error: 'Nhập họ tên' }, 400);
    const { data: exists } = await admin.from('cl_members').select('id').ilike('email', email).maybeSingle();
    if (exists) return json({ error: 'Email này đã có trong danh sách nhân sự' }, 400);
    if (password.length < 8) return json({ error: 'Mật khẩu tạm tối thiểu 8 ký tự' }, 400);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } });
    if (error) return json({ error: /already/i.test(error.message) ? 'Email này đã có tài khoản' : error.message }, 400);
    const id = data.user.id;
    const existing = false;
    const { error: mErr } = await admin.from('cl_members').upsert({ id, email, full_name, role, dept, title, active: true, ...extra });
    if (mErr) return json({ error: mErr.message }, 400);
    await admin.rpc('cl_generate_routines');
    return json({ ok: true, id, existing });
  }

  if (b.action === 'reset_password') {
    const password = String(b.password ?? '');
    if (password.length < 8) return json({ error: 'Mật khẩu tạm tối thiểu 8 ký tự' }, 400);
    const { data: target } = await admin.from('cl_members').select('id').eq('id', String(b.user_id)).maybeSingle();
    if (!target) return json({ error: 'Không tìm thấy thành viên' }, 404);
    const { error } = await admin.auth.admin.updateUserById(String(b.user_id), { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Hành động không hợp lệ' }, 400);
});
