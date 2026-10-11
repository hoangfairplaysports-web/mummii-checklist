// Webhook của bot Telegram.
// - "/start MÃ" → liên kết tài khoản (mã lấy trong app: Cài đặt/Thông báo → Liên kết Telegram)
// - Quản lý nhắn bất kỳ → trợ lý AI (Gemini) trả lời và thao tác trên checklist
// - Nhân viên: /homnay → danh sách việc hôm nay
// Telegram gửi kèm header X-Telegram-Bot-Api-Secret-Token = TELEGRAM_WEBHOOK_SECRET.
import { admin, json, Member, telegram, vnNow } from '../_shared/common.ts';
import { ask } from '../_shared/assistant.ts';

const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return json({ error: 'Forbidden' }, 403);
  const update = await req.json().catch(() => ({}));
  const msg = update.message;
  if (!msg?.chat?.id || typeof msg.text !== 'string') return json({ ok: true });
  const chatId = msg.chat.id as number;
  const text = msg.text.trim();

  // Liên kết tài khoản
  const start = text.match(/^\/start(?:\s+(\S+))?/);
  if (start) {
    const code = (start[1] ?? '').toUpperCase();
    if (!code) {
      await telegram(chatId, 'Chào bạn 👋 Để liên kết: mở Mummii Checklist → Cài đặt/Thông báo → "Liên kết Telegram", rồi bấm link hoặc gửi /start MÃ cho bot.');
      return json({ ok: true });
    }
    const { data: m } = await admin.from('cl_members').select('*').eq('telegram_link_code', code).eq('active', true).maybeSingle();
    if (!m) {
      await telegram(chatId, 'Mã liên kết không đúng hoặc đã dùng. Tạo mã mới trong app nhé.');
      return json({ ok: true });
    }
    await admin.from('cl_members').update({ telegram_chat_id: null }).eq('telegram_chat_id', chatId);
    await admin.from('cl_members').update({ telegram_chat_id: chatId, telegram_link_code: null, notify_telegram: true }).eq('id', m.id);
    await telegram(chatId, `✅ Đã liên kết với ${m.full_name}. Từ giờ bạn sẽ nhận nhắc việc ở đây.` +
      (m.role === 'admin' ? '\nBạn cũng có thể nhắn trực tiếp để trò chuyện với trợ lý, VD: "Hôm nay còn gì?", "Team hôm nay thế nào?"' : '\nGõ /homnay để xem việc hôm nay.'));
    return json({ ok: true });
  }

  const { data: me } = await admin.from('cl_members').select('*').eq('telegram_chat_id', chatId).eq('active', true).maybeSingle();
  if (!me) {
    await telegram(chatId, 'Telegram này chưa liên kết với tài khoản Mummii Checklist. Vào app → "Liên kết Telegram" để lấy mã.');
    return json({ ok: true });
  }

  if (/^\/homnay/.test(text) || (me.role !== 'admin')) {
    await telegram(chatId, await todayList(me as Member));
    return json({ ok: true });
  }

  // Quản lý → trợ lý AI. Trả lời Telegram trước khi hết thời gian chờ của webhook.
  await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/sendChatAction`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
  }).catch(() => {});
  const reply = await ask(me as Member, text);
  await telegram(chatId, reply);
  return json({ ok: true });
});

async function todayList(m: Member) {
  const today = vnNow().date;
  const { data } = await admin.from('cl_tasks').select('title, time, status, due_date, source, date, scope')
    .eq('owner_id', m.id).eq('hidden', false).lte('date', today).neq('status', 'done');
  const list = (data ?? []).filter((t) => !(['routine', 'meeting'].includes(t.source) && t.date !== today))
    .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  if (!list.length) return 'Hôm nay bạn không còn việc nào 🎉';
  return [`📋 Còn ${list.length} việc hôm nay:`, ...list.map((t) => `• ${t.time ? t.time + ' ' : ''}${t.title}${t.status === 'blocked' ? ' 🚧' : ''}${t.due_date && t.due_date < today ? ' ⚠️ quá hạn' : ''}`),
    '', 'Cập nhật trạng thái & ghi chú trong app Mummii Checklist.'].join('\n');
}
