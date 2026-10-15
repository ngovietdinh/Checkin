#!/usr/bin/env bash
# Sao lưu hằng ngày trên VPS: dữ liệu database + file lưu trữ (selfie, đính kèm).
# Thêm vào crontab:  30 1 * * * /opt/chamcong/deploy/vps/backup.sh >> /var/log/chamcong-backup.log 2>&1
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/chamcong}"                 # thư mục chứa mã nguồn repo này
SB_DIR="${SB_DIR:-$HOME/supabase-docker}"           # thư mục docker của Supabase tự host
BACKUP_DIR="${BACKUP_DIR:-/var/backups/chamcong}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%F-%H%M)"
mkdir -p "$BACKUP_DIR"

# 1. Dữ liệu (dùng pg_dump trong container db để đúng phiên bản)
SOURCE_DB_URL="postgresql://supabase_admin:${POSTGRES_PASSWORD:?đặt POSTGRES_PASSWORD}@localhost:5432/postgres" \
PG_DUMP="docker compose -f $SB_DIR/docker-compose.yml exec -T db pg_dump" \
  "$APP_DIR/scripts/db-export.sh" "$BACKUP_DIR/data-$STAMP.sql"
gzip -f "$BACKUP_DIR/data-$STAMP.sql"

# 2. File lưu trữ
tar -czf "$BACKUP_DIR/storage-$STAMP.tar.gz" -C "$SB_DIR/volumes" storage

# 3. Xoá bản cũ
find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date) – sao lưu xong: $BACKUP_DIR"
# Nên đồng bộ thêm $BACKUP_DIR sang nơi khác (Google Drive qua rclone, S3, máy khác…)
