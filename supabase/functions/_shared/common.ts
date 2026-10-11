// Dùng chung cho các Edge Function của Mummii Checklist.
// SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY do Supabase tự cung cấp.
// Các khoá bí mật khác đặt bằng: supabase secrets set TÊN=giá_trị
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Member = {
  id: string; email: string; full_name: string; role: 'admin' | 'manager' | 'staff' | 'bod'; dept: string | null; title: string | null;
  active: boolean; notify_push: boolean; notify_telegram: boolean; telegram_chat_id: number | null;
};

// Người đang gọi (từ token đăng nhập)
export async function caller(req: Request): Promise<Member | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: m } = await admin.from('cl_members').select('*').eq('id', data.user.id).maybeSingle();
  return m && m.active ? (m as Member) : null;
}

// ---------------------------------------------------------------------------
// Giờ Việt Nam
// ---------------------------------------------------------------------------
export function vnNow() {
  const d = new Date(Date.now() + 7 * 3600_000);
  const date = d.toISOString().slice(0, 10);
  const hm = d.toISOString().slice(11, 16);
  return { date, hm, minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export function addDays(date: string, n: number) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const fmtTime = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(11, 16);
export const dowOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();

// ---------------------------------------------------------------------------
// Gửi thông báo
// ---------------------------------------------------------------------------
const TG = Deno.env.get('TELEGRAM_BOT_TOKEN');
export async function telegram(chatId: number | string, text: string) {
  if (!TG || !chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
  });
  return res.ok;
}

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails('mailto:contact@mummiientertainment.com', VAPID_PUBLIC, VAPID_PRIVATE);

export async function push(ownerId: string, payload: { title: string; body: string; url?: string; tag?: string }) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  const { data: subs } = await admin.from('cl_push_subs').select('*').eq('owner_id', ownerId);
  let n = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 3600 });
      n++;
    } catch (e) {
      // Thiết bị đã huỷ đăng ký → xoá
      if ([404, 410].includes((e as { statusCode?: number }).statusCode ?? 0)) await admin.from('cl_push_subs').delete().eq('id', s.id);
    }
  }
  return n;
}

const APP_URL = Deno.env.get('APP_URL') ?? '';
// Gửi theo kênh người đó chọn (quản lý: cả 2 kênh)
export async function notifyMember(m: Member, title: string, body: string, opts: { url?: string; tag?: string } = {}) {
  const both = m.role === 'admin';
  const out = { push: 0, telegram: false };
  if (both || m.notify_push) out.push = await push(m.id, { title, body, url: opts.url ?? APP_URL, tag: opts.tag });
  if ((both || m.notify_telegram) && m.telegram_chat_id) out.telegram = await telegram(m.telegram_chat_id, `${title}\n${body}`);
  return out;
}

// Chống gửi trùng: chỉ trả về true lần đầu với mỗi key
export async function once(key: string) {
  const { data } = await admin.from('cl_notify_log').upsert({ key }, { onConflict: 'key', ignoreDuplicates: true }).select('key');
  return (data?.length ?? 0) > 0;
}
