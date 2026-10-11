# Mummii Checklist

Checklist công việc hằng ngày, báo cáo ngày/tuần, KPI và quản lý dự án cho **Mummii Entertainment**
(Công ty CP Truyền thông và Giải trí MUMMII). Tách riêng hoàn toàn với Fairplay: code, cơ sở dữ liệu, tài khoản.

- **App**: web tĩnh (Preact + htm), GitHub Pages — `https://hoangfairplaysports-web.github.io/mummii-checklist/`
- **Dữ liệu + đăng nhập**: Supabase project `uqrwcypthrzfltstezfz` (Singapore)
- `js/config.js` để trống URL → chạy chế độ DEMO với dữ liệu mẫu

## Vai trò
| | Nhân viên | Quản lý nhóm | CEO / Quản trị | Chỉ xem |
|---|:-:|:-:|:-:|:-:|
| Checklist, báo cáo của mình | ✓ | ✓ | ✓ | |
| Xem / duyệt / giao việc | | người trong nhóm | toàn công ty | xem toàn công ty |
| Phòng ban, routine, KPI, nghỉ phép, nhân sự, giờ làm | | | ✓ | |
| Việc riêng 🔒, thói quen, trợ lý AI | | | ✓ (của chính mình) | |
| Tab Dự án | khi CEO bật | khi CEO bật | ✓ | khi CEO bật |
| Phần tiền dự án | | | ✓ | |

Add-on từng người (Cài đặt → Nhân sự): loại nhân sự (full-time, part-time, thực tập, remote, cộng tác viên), giờ bắt đầu riêng, có tính đi trễ, có phải nộp báo cáo.

## Giờ làm mặc định
T2–T6 8:30–17:30 · T7 8:30–12:30 · trễ sau 8:30 · báo cáo ngày trước 17:30 (T7 không nộp) · báo cáo tuần sáng T7 trước 12:00.

## Dự án
5 loại, mỗi loại có checklist mẫu theo giai đoạn: MV / Phim ngắn / TVC (Tiền kỳ → Quay → Hậu kỳ → Bàn giao, có đếm vòng sửa),
Chiến dịch truyền thông, Booking KOL/KOC, Khoá đào tạo, Dự án khác. CEO: thu tiền khách theo đợt, hạng mục & nhà cung cấp,
phát sinh, nghiệm thu, hồ sơ (báo giá, hợp đồng). Nhập được checklist từ file Excel.

## Cài đặt ban đầu
1. Supabase → Authentication → **tắt "Allow new users to sign up"**; URL Configuration: Site URL + Redirect URL = địa chỉ app.
2. Authentication → Users → **Add user** (Auto Confirm). **Tài khoản đầu tiên tự thành Quản trị.**
3. Đăng nhập app → Cài đặt → Nhân sự → thêm CEO (vai trò CEO / Quản trị), quản lý nhóm, nhân viên.
4. Đưa app lên GitHub Pages:
   ```
   gh repo create hoangfairplaysports-web/mummii-checklist --public --source . --push
   gh api -X POST repos/hoangfairplaysports-web/mummii-checklist/pages -f "source[branch]=main" -f "source[path]=/"
   ```

## Khi Mummii muốn bật thông báo & trợ lý AI
- Tạo bot qua @BotFather, lấy Gemini API key riêng của Mummii → `zsh tools/set-keys.sh` (nhập ẩn, tự nạp lên Supabase + nối webhook).
- Điền tên bot vào `TELEGRAM_BOT` trong `js/config.js`.
- Bật lịch nhắc việc: chạy đoạn `cl-notify-5m` (đang để chú thích) trong `supabase/cron.sql`.

## Cấu trúc
`js/` giao diện (`projects.js` = Dự án, `ev-core.js` = mẫu checklist dự án), `supabase/schema.sql` = bảng + phân quyền + dữ liệu khởi tạo,
`supabase/functions/` = tạo tài khoản, nhắc việc, bot Telegram, trợ lý Gemini.
