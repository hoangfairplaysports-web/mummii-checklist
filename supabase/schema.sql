-- =====================================================================
-- Mummii Checklist — cấu trúc dữ liệu + phân quyền (project Supabase riêng)
-- Vai trò: admin (CEO / quản trị) · manager (quản lý nhóm) · staff · bod (chỉ xem)
-- Chạy: SQL Editor → dán toàn bộ → Run (chạy lại an toàn)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Phòng ban (CEO thêm / sửa / xoá trong app)
-- ---------------------------------------------------------------------
create table if not exists public.cl_depts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Thành viên
-- ---------------------------------------------------------------------
create table if not exists public.cl_members (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text not null,
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff', 'bod')),
  dept uuid references public.cl_depts (id) on delete set null,
  title text,
  active boolean not null default true,
  emp_type text not null default 'fulltime' check (emp_type in ('fulltime', 'parttime', 'intern', 'remote', 'freelance')),
  track_late boolean not null default true,       -- add-on: có tính đi trễ không
  start_time text,                                -- add-on: giờ bắt đầu riêng (VD ca chiều)
  needs_report boolean not null default true,     -- add-on: có phải nộp báo cáo ngày không
  notify_push boolean not null default true,
  notify_telegram boolean not null default false,
  telegram_chat_id bigint,
  telegram_link_code text,
  created_at timestamptz not null default now()
);

create or replace function public.cl_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.cl_members where id = auth.uid() and active
$$;
create or replace function public.cl_my_dept() returns uuid
language sql stable security definer set search_path = public as $$
  select dept from public.cl_members where id = auth.uid() and active
$$;
create or replace function public.cl_is_admin() returns boolean
language sql stable as $$ select coalesce(public.cl_role() = 'admin', false) $$;
create or replace function public.cl_is_viewer() returns boolean  -- CEO/quản trị hoặc chỉ xem: thấy toàn công ty
language sql stable as $$ select coalesce(public.cl_role() in ('admin', 'bod'), false) $$;
create or replace function public.cl_is_member() returns boolean
language sql stable as $$ select public.cl_role() is not null $$;
-- Tôi có quản lý người này không (admin: mọi người; quản lý nhóm: người cùng nhóm)
create or replace function public.cl_can_manage(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.cl_role() = 'admin', false)
      or (public.cl_role() = 'manager' and p <> auth.uid()
          and exists (select 1 from public.cl_members m where m.id = p and m.dept is not null and m.dept = public.cl_my_dept()))
$$;
create or replace function public.cl_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

-- Tài khoản đầu tiên tạo trong Supabase tự thành Admin
create or replace function public.cl_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.cl_members) then
    insert into public.cl_members (id, email, full_name, role, title)
    values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'admin', 'Quản trị');
  end if;
  return new;
end $$;
drop trigger if exists cl_on_auth_user_created on auth.users;
create trigger cl_on_auth_user_created after insert on auth.users
  for each row execute function public.cl_handle_new_user();

create or replace function public.cl_members_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.cl_is_admin() then
    new.role := old.role; new.dept := old.dept; new.title := old.title; new.active := old.active;
    new.full_name := old.full_name; new.email := old.email; new.telegram_chat_id := old.telegram_chat_id;
    new.emp_type := old.emp_type; new.track_late := old.track_late; new.start_time := old.start_time; new.needs_report := old.needs_report;
  end if;
  return new;
end $$;
drop trigger if exists cl_members_guard on public.cl_members;
create trigger cl_members_guard before update on public.cl_members for each row execute function public.cl_members_guard();

-- ---------------------------------------------------------------------
-- 3. Cài đặt chung
-- ---------------------------------------------------------------------
create table if not exists public.cl_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb
);
insert into public.cl_settings (id, data) values (1, '{
  "work_start": "08:30", "late_after": "08:30", "very_late_after": "09:00", "report_deadline": "17:30",
  "work_end": "17:30", "sat_end": "12:30", "weekly_deadline": "12:00", "projects_visible": "admin", "ai_model": "gemini-flash"
}'::jsonb) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Routine, KPI, nghỉ phép
-- ---------------------------------------------------------------------
create table if not exists public.cl_routines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner_id uuid references public.cl_members (id) on delete cascade,
  dept text,                                   -- 'all' hoặc id phòng ban
  repeat text not null default 'daily' check (repeat in ('daily', 'weekdays', 'monthly')),
  days int[] not null default '{}',
  month_day int,
  "time" text,
  end_time text,
  kind text not null default 'task' check (kind in ('task', 'meeting')),
  priority text not null default 'mid',
  scope text not null default 'work' check (scope in ('work', 'private')),
  grp text,
  kpi_key text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.cl_kpis (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  title text not null,
  owner_id uuid not null references public.cl_members (id) on delete cascade,
  type text not null default 'count' check (type in ('count', 'bool', 'percent')),
  target numeric not null default 1,
  period text not null default 'week' check (period in ('week', 'month', 'quarter')),
  unit text,
  manual jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.cl_leaves (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.cl_members (id) on delete cascade,
  "from" date not null,
  "to" date not null,
  type text not null check (type in ('full', 'am', 'pm', 'holiday')),
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Công việc
-- ---------------------------------------------------------------------
create table if not exists public.cl_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.cl_members (id) on delete cascade,
  title text not null,
  date date not null default public.cl_today(),
  "time" text,
  end_time text,
  due_date date,
  source text not null default 'adhoc' check (source in ('routine', 'meeting', 'adhoc', 'assigned', 'plan')),
  routine_id uuid references public.cl_routines (id) on delete set null,
  scope text not null default 'work' check (scope in ('work', 'private')),
  grp text,
  priority text not null default 'mid' check (priority in ('high', 'mid', 'low')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  progress int not null default 0,
  output text,
  qty numeric,
  note text,
  block_reason text,
  need_help text,
  kpi_id uuid references public.cl_kpis (id) on delete set null,
  assigned_by uuid references public.cl_members (id) on delete set null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists cl_tasks_routine_uq on public.cl_tasks (routine_id, owner_id, date) where routine_id is not null;
create index if not exists cl_tasks_owner_date on public.cl_tasks (owner_id, date);

create or replace function public.cl_tasks_guard() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.created_at := old.created_at;
    if auth.uid() is not null and not public.cl_can_manage(old.owner_id) then
      new.owner_id := old.owner_id; new.source := old.source; new.assigned_by := old.assigned_by;
      new.routine_id := old.routine_id; new.scope := old.scope; new.hidden := old.hidden;
      if old.source in ('routine', 'meeting', 'assigned') then new.title := old.title; new.date := old.date; end if;
    end if;
  elsif auth.uid() is not null and new.owner_id = auth.uid() and not public.cl_is_admin() then
    if new.source = 'assigned' then new.source := 'adhoc'; new.assigned_by := null; end if;
    new.hidden := false;
  end if;
  if new.scope = 'private' and (new.source = 'assigned' or new.owner_id <> coalesce(auth.uid(), new.owner_id)) then
    raise exception 'Việc riêng chỉ chủ tài khoản tự tạo';
  end if;
  return new;
end $$;
drop trigger if exists cl_tasks_guard on public.cl_tasks;
create trigger cl_tasks_guard before insert or update on public.cl_tasks for each row execute function public.cl_tasks_guard();

-- ---------------------------------------------------------------------
-- 6. Bắt đầu ngày làm việc (giờ do máy chủ ghi)
-- ---------------------------------------------------------------------
create table if not exists public.cl_daystarts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.cl_members (id) on delete cascade default auth.uid(),
  date date not null default public.cl_today(),
  started_at timestamptz not null default now(),
  unique (person_id, date)
);
create or replace function public.cl_daystarts_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then new.person_id := auth.uid(); new.date := public.cl_today(); new.started_at := now(); end if;
  return new;
end $$;
drop trigger if exists cl_daystarts_guard on public.cl_daystarts;
create trigger cl_daystarts_guard before insert on public.cl_daystarts for each row execute function public.cl_daystarts_guard();

-- ---------------------------------------------------------------------
-- 7. Báo cáo ngày & tuần
-- ---------------------------------------------------------------------
create table if not exists public.cl_reports (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.cl_members (id) on delete cascade,
  date date not null,
  submitted_at timestamptz not null default now(),
  blockers text, plan text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'returned')),
  manager_note text, reviewed_at timestamptz,
  unique (person_id, date)
);
create table if not exists public.cl_weekly (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.cl_members (id) on delete cascade,
  week date not null,
  highlights text, issues text, next_plan text,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'returned')),
  manager_note text, reviewed_at timestamptz,
  unique (person_id, week)
);
create or replace function public.cl_report_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.person_id <> auth.uid() and public.cl_can_manage(new.person_id) then
    new.reviewed_at := now();
    return new;
  end if;
  new.person_id := auth.uid(); new.submitted_at := now(); new.status := 'submitted';
  new.manager_note := case when tg_op = 'UPDATE' then old.manager_note else null end;
  new.reviewed_at := null;
  return new;
end $$;
drop trigger if exists cl_reports_guard on public.cl_reports;
create trigger cl_reports_guard before insert or update on public.cl_reports for each row execute function public.cl_report_guard();
drop trigger if exists cl_weekly_guard on public.cl_weekly;
create trigger cl_weekly_guard before insert or update on public.cl_weekly for each row execute function public.cl_report_guard();

-- ---------------------------------------------------------------------
-- 8. Đồ riêng: thói quen, chat AI, thiết bị nhận thông báo
-- ---------------------------------------------------------------------
create table if not exists public.cl_habits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.cl_members (id) on delete cascade default auth.uid(),
  title text not null, icon text, days int[] not null default '{0,1,2,3,4,5,6}', unit text, target numeric,
  created_at timestamptz not null default now()
);
create table if not exists public.cl_habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.cl_habits (id) on delete cascade,
  owner_id uuid not null references public.cl_members (id) on delete cascade default auth.uid(),
  date date not null, value numeric not null default 1,
  unique (habit_id, date)
);
create table if not exists public.cl_chat (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.cl_members (id) on delete cascade default auth.uid(),
  role text not null check (role in ('me', 'bot')), text text not null, at timestamptz not null default now()
);
create table if not exists public.cl_push_subs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.cl_members (id) on delete cascade default auth.uid(),
  endpoint text not null unique, sub jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.cl_notify_log (key text primary key, sent_at timestamptz not null default now());

-- ---------------------------------------------------------------------
-- 9. Sinh việc routine / mã liên kết Telegram
-- ---------------------------------------------------------------------
create or replace function public.cl_generate_routines(p_date date default public.cl_today())
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.cl_tasks (owner_id, title, date, "time", end_time, source, routine_id, scope, grp, priority, kpi_id)
  select m.id, r.title, p_date, r."time", r.end_time, case when r.kind = 'meeting' then 'meeting' else 'routine' end,
         r.id, r.scope, r.grp, r.priority,
         (select k.id from public.cl_kpis k where k.key = r.kpi_key and k.owner_id = m.id and k.active limit 1)
  from public.cl_routines r
  join public.cl_members m on m.active and m.role <> 'bod'
    and (r.owner_id = m.id or (r.owner_id is null and (r.dept = 'all' or r.dept = m.dept::text)))
  where r.active and extract(dow from p_date) <> 0
    and (r.repeat = 'daily' or (r.repeat = 'weekdays' and extract(dow from p_date)::int = any (r.days))
         or (r.repeat = 'monthly' and extract(day from p_date)::int = r.month_day))
    and not exists (select 1 from public.cl_leaves l where p_date between l."from" and l."to"
                    and l.type in ('full', 'holiday') and (l.person_id = m.id or l.type = 'holiday'))
  on conflict (routine_id, owner_id, date) where routine_id is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.cl_generate_routines(date) to authenticated;

create or replace function public.cl_telegram_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
begin
  update public.cl_members set telegram_link_code = c where id = auth.uid();
  return c;
end $$;
grant execute on function public.cl_telegram_code() to authenticated;

-- ---------------------------------------------------------------------
-- 10. Dự án (chỉ CEO thấy phần tiền; tab Dự án mở cho ai do CEO quyết)
-- ---------------------------------------------------------------------
create table if not exists public.ev_events (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'video',           -- video | campaign | kol | course | other
  name text not null, client_name text, client_contact text, venue text,
  event_date date,                              -- mốc chính (bàn giao / bắt đầu chiến dịch / ngày đăng / khai giảng)
  shoot_date date,                              -- ngày quay (dự án video)
  status text not null default 'preparing' check (status in ('preparing', 'running', 'done', 'cancelled')),
  pm_id uuid references public.cl_members (id) on delete set null,
  contract_signed_at date, contract_deadline date, contract_note text,
  revisions_included int not null default 2, revisions_used int not null default 0,
  quote_total numeric, quote_subtotal numeric, quote_fee numeric, quote_vat numeric,
  accepted_at date, accept_note text, source_file text, notes text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.ev_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text, contact text, phone text, bank text, note text,
  created_at timestamptz not null default now()
);
create table if not exists public.ev_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ev_events (id) on delete cascade,
  section text, grp text, name text not null, detail text, qty numeric, unit text, unit_price numeric, days text, amount numeric, note text,
  is_option boolean not null default false, chosen boolean not null default true,
  is_extra boolean not null default false, extra_by text, extra_date date,
  supplier_id uuid references public.ev_suppliers (id) on delete set null,
  cost_amount numeric, supplier_paid numeric not null default 0, supplier_due date,
  supplier_status text not null default 'unpaid' check (supplier_status in ('unpaid', 'partial', 'paid', 'none')),
  supplier_issue text,
  accept_status text not null default 'pending' check (accept_status in ('pending', 'ok', 'issue')),
  accept_qty numeric, accept_note text, sort int not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.ev_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ev_events (id) on delete cascade,
  label text not null, percent numeric, amount numeric, due_date date, due_rule text,
  paid_amount numeric not null default 0, paid_at date,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  last_reminded date, note text, sort int not null default 0
);
create table if not exists public.ev_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ev_events (id) on delete cascade,
  phase text not null default 'p1',             -- giai đoạn theo loại dự án (p1..p4)
  category text, title text not null, detail text,
  pic_id uuid references public.cl_members (id) on delete set null, pic_name text, sup_client text, sup_fp text,
  offset_days int, due_date date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  note text, item_id uuid references public.ev_items (id) on delete set null,
  sort int not null default 0, done_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists ev_tasks_event on public.ev_tasks (event_id, sort);
create table if not exists public.ev_files (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ev_events (id) on delete cascade,
  kind text not null default 'other' check (kind in ('quote', 'contract', 'acceptance', 'other')),
  name text not null, path text not null, size int, uploaded_at timestamptz not null default now()
);

create or replace function public.ev_tasks_guard() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.cl_is_admin() then
    new.event_id := old.event_id; new.phase := old.phase; new.category := old.category; new.title := old.title; new.detail := old.detail;
    new.pic_id := old.pic_id; new.pic_name := old.pic_name; new.due_date := old.due_date; new.offset_days := old.offset_days;
    new.item_id := old.item_id; new.sort := old.sort;
  end if;
  return new;
end $$;
drop trigger if exists ev_tasks_guard on public.ev_tasks;
create trigger ev_tasks_guard before insert or update on public.ev_tasks for each row execute function public.ev_tasks_guard();

-- Thông tin dự án KHÔNG kèm tiền cho người không phải CEO
create or replace view public.ev_events_public as
  select id, type, name, client_name, client_contact, venue, event_date, shoot_date, status, pm_id,
         contract_signed_at, contract_deadline, revisions_included, revisions_used, accepted_at, notes, created_at, updated_at
  from public.ev_events where public.cl_is_member();
revoke all on public.ev_events_public from anon;
grant select on public.ev_events_public to authenticated;

-- ---------------------------------------------------------------------
-- 11. Phân quyền (RLS)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['cl_depts','cl_members','cl_settings','cl_routines','cl_kpis','cl_leaves','cl_tasks','cl_daystarts','cl_reports',
                           'cl_weekly','cl_habits','cl_habit_logs','cl_chat','cl_push_subs','cl_notify_log',
                           'ev_events','ev_items','ev_payments','ev_suppliers','ev_tasks','ev_files'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  for t in select format('drop policy if exists %I on public.%I', policyname, tablename) from pg_policies
           where schemaname = 'public' and (tablename like 'cl\_%' or tablename like 'ev\_%') loop
    execute t;
  end loop;
end $$;

create policy cl_members_select on public.cl_members for select to authenticated using (public.cl_is_member());
create policy cl_members_insert on public.cl_members for insert to authenticated with check (public.cl_is_admin());
create policy cl_members_update on public.cl_members for update to authenticated
  using (id = auth.uid() or public.cl_is_admin()) with check (id = auth.uid() or public.cl_is_admin());
create policy cl_settings_select on public.cl_settings for select to authenticated using (public.cl_is_member());
create policy cl_settings_update on public.cl_settings for update to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin());
do $$
declare t text;
begin
  foreach t in array array['cl_depts','cl_routines','cl_kpis','cl_leaves'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.cl_is_member())', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin())', t || '_write', t);
  end loop;
end $$;
drop policy if exists cl_routines_select on public.cl_routines;
create policy cl_routines_select on public.cl_routines for select to authenticated
  using (public.cl_is_member() and (scope = 'work' or owner_id = auth.uid()));

create policy cl_tasks_select on public.cl_tasks for select to authenticated
  using (owner_id = auth.uid() or (scope = 'work' and (public.cl_is_viewer() or public.cl_can_manage(owner_id))));
create policy cl_tasks_insert on public.cl_tasks for insert to authenticated
  with check (owner_id = auth.uid() or (scope = 'work' and public.cl_can_manage(owner_id)));
create policy cl_tasks_update on public.cl_tasks for update to authenticated
  using (owner_id = auth.uid() or (scope = 'work' and public.cl_can_manage(owner_id)))
  with check (owner_id = auth.uid() or (scope = 'work' and public.cl_can_manage(owner_id)));
create policy cl_tasks_delete on public.cl_tasks for delete to authenticated
  using ((owner_id = auth.uid() and source in ('adhoc', 'plan')) or (scope = 'work' and public.cl_can_manage(owner_id)));

create policy cl_daystarts_select on public.cl_daystarts for select to authenticated
  using (person_id = auth.uid() or public.cl_is_viewer() or public.cl_can_manage(person_id));
create policy cl_daystarts_insert on public.cl_daystarts for insert to authenticated with check (public.cl_is_member());
create policy cl_daystarts_delete on public.cl_daystarts for delete to authenticated using (public.cl_is_admin());

do $$
declare t text;
begin
  foreach t in array array['cl_reports','cl_weekly'] loop
    execute format('create policy %I on public.%I for select to authenticated using (person_id = auth.uid() or public.cl_is_viewer() or public.cl_can_manage(person_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.cl_is_member())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (person_id = auth.uid() or public.cl_can_manage(person_id)) with check (public.cl_is_member())', t || '_update', t);
  end loop;
  foreach t in array array['cl_habits','cl_habit_logs','cl_chat','cl_push_subs'] loop
    execute format('create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.cl_is_member())', t || '_own', t);
  end loop;
end $$;

-- Dự án: bảng gốc + tiền chỉ Admin; checklist dự án mọi thành viên xem, người phụ trách cập nhật việc của mình
create policy ev_events_admin on public.ev_events for all to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin());
create policy ev_tasks_select on public.ev_tasks for select to authenticated using (public.cl_is_member());
create policy ev_tasks_admin on public.ev_tasks for all to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin());
create policy ev_tasks_pic on public.ev_tasks for update to authenticated using (pic_id = auth.uid()) with check (pic_id = auth.uid());
do $$
declare t text;
begin
  foreach t in array array['ev_items','ev_payments','ev_suppliers','ev_files'] loop
    execute format('create policy %I on public.%I for all to authenticated using (public.cl_is_admin()) with check (public.cl_is_admin())', t || '_admin', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit) values ('ev-files', 'ev-files', false, 20971520) on conflict (id) do nothing;
drop policy if exists ev_files_admin on storage.objects;
create policy ev_files_admin on storage.objects for all to authenticated
  using (bucket_id = 'ev-files' and public.cl_is_admin()) with check (bucket_id = 'ev-files' and public.cl_is_admin());

-- ---------------------------------------------------------------------
-- 12. Dữ liệu khởi tạo: phòng ban + routine gợi ý theo vị trí (chỉ khi chưa có)
-- ---------------------------------------------------------------------
do $$
declare c uuid; e uuid; p uuid; k uuid; d uuid; s uuid;
begin
  if exists (select 1 from public.cl_depts) then return; end if;
  insert into public.cl_depts (name, sort) values ('Content', 1) returning id into c;
  insert into public.cl_depts (name, sort) values ('Edit / Hậu kỳ', 2) returning id into e;
  insert into public.cl_depts (name, sort) values ('Production (Quay)', 3) returning id into p;
  insert into public.cl_depts (name, sort) values ('KOL/KOC & Marketing', 4) returning id into k;
  insert into public.cl_depts (name, sort) values ('Đào tạo', 5) returning id into d;
  insert into public.cl_depts (name, sort) values ('Kinh doanh', 6) returning id into s;
  insert into public.cl_routines (title, dept, repeat, days, "time", priority, kpi_key) values
    ('Lên kế hoạch content tuần (Fanpage, TikTok, Website)', c::text, 'weekdays', '{1}', '09:00', 'high', null),
    ('Lên ý tưởng & viết content trong ngày', c::text, 'daily', '{}', '08:45', 'mid', 'content_posts'),
    ('Đăng bài theo lịch & kiểm tra hiển thị', c::text, 'daily', '{}', '11:00', 'mid', null),
    ('Seeding, trả lời bình luận & tương tác cộng đồng', c::text, 'daily', '{}', '16:00', 'mid', null),
    ('Nhận brief & sắp xếp việc dựng trong ngày', e::text, 'daily', '{}', '08:45', 'mid', null),
    ('Dựng video ngắn theo kịch bản (TikTok/Reels/Shorts)', e::text, 'daily', '{}', '09:30', 'high', 'videos_edited'),
    ('Cập nhật trend, âm thanh, hiệu ứng mới', e::text, 'weekdays', '{1,3,5}', '11:30', 'low', null),
    ('Xuất file & gửi duyệt bản dựng', e::text, 'daily', '{}', '16:30', 'mid', null),
    ('Kiểm tra thiết bị: pin, thẻ nhớ, ánh sáng, âm thanh', p::text, 'daily', '{}', '08:45', 'mid', null),
    ('Backup dữ liệu sau buổi quay (2 nơi)', p::text, 'daily', '{}', '17:00', 'high', null),
    ('Lên lịch quay tuần & call sheet', p::text, 'weekdays', '{1}', '09:30', 'high', null),
    ('Cập nhật danh sách KOL/KOC & báo giá', k::text, 'weekdays', '{1,3,5}', '09:00', 'mid', null),
    ('Liên hệ, deal & chốt lịch KOL/KOC', k::text, 'daily', '{}', '10:00', 'high', 'kol_booked'),
    ('Theo dõi bài đăng KOL & số liệu chiến dịch', k::text, 'daily', '{}', '16:00', 'mid', null),
    ('Chăm sóc học viên & trả lời group cộng đồng', d::text, 'daily', '{}', '09:00', 'mid', null),
    ('Chuẩn bị bài giảng / tài liệu', d::text, 'weekdays', '{2,4}', '14:00', 'mid', null),
    ('Check inbox fanpage & lead mới', s::text, 'daily', '{}', '08:45', 'high', 'leads'),
    ('Gọi / nhắn follow-up khách hàng', s::text, 'daily', '{}', '10:00', 'high', null),
    ('Gửi báo giá / proposal', s::text, 'weekdays', '{1,2,3,4,5}', '14:00', 'mid', 'quotes_sent');
end $$;
