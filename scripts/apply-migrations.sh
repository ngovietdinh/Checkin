#!/usr/bin/env bash
# Chạy các migration chưa áp dụng (theo thứ tự tên file) bằng psql.
# Ghi nhận vào supabase_migrations.schema_migrations nên tương thích với Supabase CLI.
#
#   Supabase Cloud (khuyên dùng CLI):  npx supabase db push
#   VPS tự host:
#     PSQL="docker compose -f ~/supabase-docker/docker-compose.yml exec -T db psql -U postgres -d postgres" \
#       scripts/apply-migrations.sh
#   Hoặc qua chuỗi kết nối:  PSQL="psql postgresql://postgres:MATKHAU@host:5432/postgres" scripts/apply-migrations.sh
set -euo pipefail
PSQL="${PSQL:-psql}"
DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"

$PSQL -v ON_ERROR_STOP=1 -q <<'SQL'
set client_min_messages = warning;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
SQL

applied="$($PSQL -tA -c "select version from supabase_migrations.schema_migrations")"
for f in "$DIR"/*.sql; do
  name="$(basename "$f" .sql)"
  version="${name%%_*}"
  if grep -qx "$version" <<<"$applied"; then
    echo "  bỏ qua $name (đã chạy)"
    continue
  fi
  echo "→ $name"
  { cat "$f"; echo; echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '${name#*_}');"; } \
    | $PSQL -v ON_ERROR_STOP=1 -q --single-transaction
done
echo "Xong."
