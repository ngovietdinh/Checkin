#!/usr/bin/env bash
# Đóng gói app Microsoft Teams (teams/*.json + icon) thành file .zip để tải lên Teams Admin Center.
# Đổi địa chỉ app (vd. sau khi chuyển VPS):  APP_URL=https://chamcong.congty.vn scripts/build-teams-app.sh
set -euo pipefail
cd "$(dirname "$0")/.."
APP_URL="${APP_URL:-https://checkin-opal-beta.vercel.app}"
APP_URL="${APP_URL%/}"
HOST="${APP_URL#https://}"; HOST="${HOST%%/*}"
OUT="${OUT:-dist-teams/chamcong-teams.zip}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
sed -e "s#https://checkin-opal-beta.vercel.app#$APP_URL#g" -e "s#\"checkin-opal-beta.vercel.app\"#\"$HOST\"#g" teams/manifest.json > "$TMP/manifest.json"
cp teams/color.png teams/outline.png "$TMP/"
mkdir -p "$(dirname "$OUT")"; rm -f "$OUT"
(cd "$TMP" && zip -q -X "$OLDPWD/$OUT" manifest.json color.png outline.png)
echo "Đã tạo $OUT (địa chỉ app: $APP_URL)"
