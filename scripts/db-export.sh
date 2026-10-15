#!/usr/bin/env bash
# Xuất toàn bộ dữ liệu (tài khoản đăng nhập + dữ liệu nghiệp vụ) ra file SQL.
# Dùng để sao lưu hằng ngày hoặc chuyển từ Supabase Cloud sang VPS.
#
#   SOURCE_DB_URL="postgresql://postgres:[MẬT KHẨU]@db.[PROJECT].supabase.co:5432/postgres" \
#     scripts/db-export.sh backup/data-$(date +%F).sql
#
# Lấy chuỗi kết nối: Supabase Dashboard → Connect → Session pooler / Direct connection.
# pg_dump phải cùng hoặc mới hơn phiên bản Postgres máy chủ (Supabase hiện dùng 17).
# Nếu máy bạn có bản cũ, dùng pg_dump trong Docker:
#   PG_DUMP="docker run --rm postgres:17 pg_dump" scripts/db-export.sh
set -euo pipefail
PG_DUMP="${PG_DUMP:-pg_dump}"
OUT="${1:-backup/data-$(date +%Y%m%d-%H%M).sql}"
: "${SOURCE_DB_URL:?Cần đặt SOURCE_DB_URL}"
mkdir -p "$(dirname "$OUT")"

$PG_DUMP "$SOURCE_DB_URL" \
  --data-only --no-owner --no-privileges \
  --schema=public --schema=auth --schema=app \
  --exclude-table='auth.schema_migrations' \
  --exclude-table-data='auth.audit_log_entries' \
  --exclude-table-data='auth.flow_state' \
  --exclude-table-data='app.reminder_log' \
  --exclude-table-data='app.config' \
  > "$OUT"

echo "Đã xuất dữ liệu: $OUT ($(du -h "$OUT" | cut -f1))"
echo "Lưu ý: file ảnh (selfie, đính kèm) chuyển bằng: node scripts/migrate-storage.mjs"
