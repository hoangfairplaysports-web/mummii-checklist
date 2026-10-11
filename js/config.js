// Kết nối Supabase của Mummii Checklist (project riêng).
// Để trống = chế độ DEMO (dữ liệu mẫu, lưu trên trình duyệt).
// Khoá publishable là khoá công khai, an toàn khi để trong code — dữ liệu được bảo vệ bằng phân quyền (RLS).
export const CONFIG = {
  SUPABASE_URL: 'https://uqrwcypthrzfltstezfz.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_YiphrfoH-kTL2i6q11x7bQ_FTilNdny',
  VAPID_PUBLIC_KEY: 'BPmDfY4k0keizNR3oDyWDLu9sNz3U98n39lvY_62rXerJysJJ4C7fSl3tQVdlDknwVhHTw3EdGl82zURnjSlbeM',
  // Tên bot Telegram của Mummii (không có @) — điền khi bên Mummii tạo bot
  TELEGRAM_BOT: '',
};
