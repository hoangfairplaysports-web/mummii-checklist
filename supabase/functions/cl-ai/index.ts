// Chat với trợ lý AI trong app (chỉ Quản lý). Câu hỏi & trả lời được lưu vào cl_chat.
import { caller, cors, json } from '../_shared/common.ts';
import { ask } from '../_shared/assistant.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const me = await caller(req);
  if (!me) return json({ error: 'Phiên đăng nhập hết hạn, hãy đăng nhập lại' }, 401);
  if (me.role !== 'admin') return json({ error: 'Trợ lý AI chỉ dành cho Quản lý' }, 403);
  const { message } = await req.json().catch(() => ({}));
  const text = String(message ?? '').trim().slice(0, 2000);
  if (!text) return json({ error: 'Tin nhắn trống' }, 400);
  return json({ reply: await ask(me, text) });
});
