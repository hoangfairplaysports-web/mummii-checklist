#!/bin/zsh
# Nạp khoá Telegram + Gemini lên Supabase và nối webhook bot — khoá được nhập ẩn, không lưu vào file.
# Chạy: zsh tools/set-keys.sh   (bỏ trống ô nào thì bỏ qua khoá đó)
cd "$(dirname "$0")/.."
REF=uqrwcypthrzfltstezfz
SECRET=$(grep '^TELEGRAM_WEBHOOK_SECRET=' supabase/.secrets.local | cut -d= -f2)

read -rs "TG?Dán TELEGRAM BOT TOKEN rồi Enter (bỏ trống để bỏ qua): "; echo
TG=${TG//[[:space:]]/}
read -rs "GK?Dán GEMINI API KEY rồi Enter (bỏ trống để bỏ qua): "; echo
GK=${GK//[[:space:]]/}

# Kiểm tra token Telegram trước khi nạp
if [[ -n "$TG" ]]; then
  ME=$(curl -s "https://api.telegram.org/bot$TG/getMe")
  BOT=$(print -r -- "$ME" | python3 -c 'import sys,json; r=json.load(sys.stdin); print(r["result"]["username"] if r.get("ok") else "")')
  if [[ -z "$BOT" ]]; then
    echo "❌ Telegram từ chối token (dài ${#TG} ký tự, token đúng thường dài 46). Copy lại từ @BotFather rồi chạy lại script."
    TG=""
  fi
fi
ARGS=()
[[ -n "$TG" ]] && ARGS+=("TELEGRAM_BOT_TOKEN=$TG")
[[ -n "$GK" ]] && ARGS+=("GEMINI_API_KEY=$GK")
if (( ${#ARGS} )); then
  npx --yes supabase@latest secrets set "${ARGS[@]}" --project-ref $REF >/dev/null && echo "✅ Đã nạp ${#ARGS} khoá lên Supabase"
fi
if [[ -n "$TG" ]]; then
  curl -s "https://api.telegram.org/bot$TG/setWebhook" \
    -d "url=https://$REF.supabase.co/functions/v1/cl-telegram" -d "secret_token=$SECRET" -d 'allowed_updates=["message"]' \
    | python3 -c 'import sys,json; r=json.load(sys.stdin); print("✅ Đã nối webhook Telegram" if r.get("ok") else "❌ Lỗi webhook: "+str(r))'
  echo "BOT_USERNAME=$BOT"
fi
if [[ -n "$GK" ]]; then
  curl -s -o /dev/null -w "%{http_code}" -H "x-goog-api-key: $GK" "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest" \
    | python3 -c 'import sys; c=sys.stdin.read(); print("✅ Khoá Gemini hợp lệ" if c=="200" else "❌ Khoá Gemini lỗi (HTTP "+c+")")'
fi
unset TG GK
echo "Xong."
