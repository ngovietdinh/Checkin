#!/usr/bin/env bash
# Nhập dữ liệu đã xuất bằng db-export.sh vào database MỚI (đã chạy đủ migrations).
#
#   TARGET_DB_URL="postgresql://postgres:[MẬT KHẨU]@[IP VPS]:5432/postgres" scripts/db-import.sh backup/data.sql
#
# - Chạy trong 1 transaction: lỗi thì không ghi gì.
# - Xoá dòng cài đặt mặc định do migration tạo để thay bằng cài đặt đã xuất.
# - Tắt trigger trong lúc nhập (session_replication_role = replica) để không gửi lại thông báo,
#   không ghi nhật ký trùng. Cần quyền superuser (VPS tự host: user postgres/supabase_admin).
set -euo pipefail
PSQL="${PSQL:-psql}"
IN="${1:?Cần đường dẫn file dữ liệu}"
: "${TARGET_DB_URL:?Cần đặt TARGET_DB_URL}"

$PSQL "$TARGET_DB_URL" --single-transaction --set ON_ERROR_STOP=1 --quiet \
  --command "SET session_replication_role = replica" \
  --command "DELETE FROM public.settings" \
  --file - < "$IN"

$PSQL "$TARGET_DB_URL" --quiet --tuples-only --command \
  "select 'Đã nhập: ' || (select count(*) from public.employees) || ' nhân viên, ' ||
          (select count(*) from public.attendance) || ' lượt chấm công, ' ||
          (select count(*) from auth.users) || ' tài khoản đăng nhập'"
