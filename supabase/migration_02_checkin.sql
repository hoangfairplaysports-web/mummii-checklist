-- =====================================================================
-- Migration 06 — Bắt đầu ngày: nhận biết "Tại văn phòng / Ngoài văn phòng"
-- Không chặn ai bấm Bắt đầu, chỉ GẮN NHÃN để quản lý xem:
--   office_wifi : IP mạng lúc bấm trùng IP văn phòng (settings.office_ips)
--   office_gps  : không trùng IP nhưng GPS điện thoại trong bán kính văn phòng
--   outside     : ngoài bán kính
--   unknown     : không trùng IP và không lấy được GPS (từ chối quyền / máy bàn)
--   wfh         : nhân sự Remote / Cộng tác viên (không kiểm tra)
-- Thứ 7 Mummii làm tại văn phòng buổi sáng → vẫn kiểm tra như ngày thường.
-- Mọi phép so khớp chạy trên MÁY CHỦ (trigger). Toạ độ gửi lên chỉ dùng để tính
-- khoảng cách rồi bị xoá, không lưu vị trí của nhân viên.
-- Chạy lại nhiều lần an toàn.
-- =====================================================================

alter table public.cl_daystarts
  add column if not exists ip text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists accuracy_m int,
  add column if not exists distance_m int,
  add column if not exists loc text;
alter table public.cl_daystarts drop constraint if exists cl_daystarts_loc_check;
alter table public.cl_daystarts add constraint cl_daystarts_loc_check
  check (loc is null or loc in ('office_wifi', 'office_gps', 'outside', 'unknown', 'wfh'));

-- IP thật của người gọi (Supabase chuyển tiếp qua header của request)
create or replace function public.cl_client_ip() returns text
language plpgsql stable as $$
declare h jsonb;
begin
  h := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  return nullif(trim(coalesce(
    h ->> 'cf-connecting-ip',
    split_part(h ->> 'x-forwarded-for', ',', 1),
    h ->> 'x-real-ip'
  )), '');
end $$;

-- Quản lý bấm "Thêm IP mạng hiện tại" khi đang ngồi ở văn phòng
create or replace function public.cl_my_ip() returns text
language sql stable as $$ select public.cl_client_ip() $$;

-- App hỏi trước: đang ở mạng văn phòng không? (có → khỏi xin quyền GPS)
create or replace function public.cl_at_office() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.cl_client_ip() = any (
    select jsonb_array_elements_text(coalesce(data -> 'office_ips', '[]'::jsonb)) from public.cl_settings where id = 1
  ), false)
$$;

-- Khoảng cách 2 điểm (mét)
create or replace function public.cl_distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

create or replace function public.cl_daystarts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  r float8;
begin
  if auth.uid() is not null then
    new.person_id := auth.uid();
    new.date := public.cl_today();
    new.started_at := now();
    new.ip := public.cl_client_ip();
    new.distance_m := null;
    new.loc := null;
    select data into s from public.cl_settings where id = 1;
    if coalesce((s ->> 'checkin_on')::boolean, false) then
      if exists (select 1 from public.cl_members m where m.id = new.person_id and m.emp_type in ('remote', 'freelance')) then
        new.loc := 'wfh';
      elsif new.ip is not null and new.ip = any (select jsonb_array_elements_text(coalesce(s -> 'office_ips', '[]'::jsonb))) then
        new.loc := 'office_wifi';
      elsif new.lat is not null and new.lng is not null and (s ->> 'office_lat') is not null then
        new.distance_m := round(public.cl_distance_m(new.lat, new.lng, (s ->> 'office_lat')::float8, (s ->> 'office_lng')::float8));
        r := coalesce((s ->> 'office_radius')::float8, 150);
        -- trừ hao sai số GPS trong nhà (tối đa 100 m)
        new.loc := case when new.distance_m - least(coalesce(new.accuracy_m, 0), 100) <= r then 'office_gps' else 'outside' end;
      else
        new.loc := 'unknown';
      end if;
    end if;
    -- không lưu toạ độ của nhân viên
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end $$;

grant execute on function public.cl_my_ip() to authenticated;
grant execute on function public.cl_at_office() to authenticated;
revoke execute on function public.cl_my_ip() from public, anon;
revoke execute on function public.cl_at_office() from public, anon;
