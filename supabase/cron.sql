-- Lịch tự động cho Mummii Checklist
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobname) from cron.job where jobname in ('cl-routines-daily', 'cl-notify-log-cleanup');
-- 00:05 giờ Việt Nam: sinh việc routine cho ngày mới
select cron.schedule('cl-routines-daily', '5 17 * * *', $$ select public.cl_generate_routines(public.cl_today()); $$);
select cron.schedule('cl-notify-log-cleanup', '0 18 * * *', $$ delete from public.cl_notify_log where sent_at < now() - interval '30 days'; $$);

-- KHI MUỐN BẬT NHẮC VIỆC (thông báo app + Telegram): thay <CRON_SECRET> bằng giá trị trong supabase/.secrets.local rồi chạy:
-- select cron.schedule('cl-notify-5m', '*/5 * * * *', $$ select net.http_post(
--   url := 'https://uqrwcypthrzfltstezfz.supabase.co/functions/v1/cl-notify',
--   headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--   body := '{}'::jsonb, timeout_milliseconds := 30000); $$);
