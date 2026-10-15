# Chuyển sang VPS tự quản

Ứng dụng được xây trên **Supabase**, một nền tảng mã nguồn mở. Bản tự host của Supabase chạy bằng Docker và có đủ các thành phần đang dùng: PostgreSQL, Auth (đăng nhập), Storage (ảnh), Realtime, Edge Functions và pg_cron. Vì vậy khi chuyển lên VPS:

- **Không phải sửa code.** Migrations, Edge Functions và frontend giữ nguyên.
- **Không phải build lại frontend.** Chỉ sửa `config.js` trong thư mục build.
- Nhân viên giữ nguyên tài khoản và mật khẩu, chỉ cần đăng nhập lại một lần.

Thời gian chuyển ước tính 1–2 giờ, phần lớn là cài đặt VPS. Riêng thời gian ngừng dịch vụ để chuyển dữ liệu với 300 nhân viên chỉ khoảng 10–20 phút.

---

## 1. Chuẩn bị VPS

| Hạng mục | Khuyến nghị cho 300 nhân viên |
|---|---|
| Cấu hình | 2–4 vCPU, **4–8 GB RAM**, 80 GB SSD |
| Hệ điều hành | Ubuntu 24.04 LTS |
| Tên miền | `api.congty.vn` (máy chủ), `chamcong.congty.vn` (ứng dụng) trỏ bản ghi A về IP VPS |
| Cổng mở | 80, 443 (và 22 cho SSH). **Không** mở 5432/8000 ra Internet |

```bash
# Docker
curl -fsSL https://get.docker.com | sh
# Caddy (HTTPS tự động)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy postgresql-client nodejs npm git
# Mã nguồn ứng dụng
sudo git clone <repo này> /opt/chamcong && cd /opt/chamcong && sudo npm ci
```

## 2. Cài Supabase tự host

Làm theo tài liệu chính thức: <https://supabase.com/docs/guides/self-hosting/docker>.

```bash
git clone --depth 1 https://github.com/supabase/supabase /tmp/supabase
cp -r /tmp/supabase/docker ~/supabase-docker && cd ~/supabase-docker
cp .env.example .env
```

Sửa các biến sau trong `~/supabase-docker/.env`:

| Biến | Giá trị |
|---|---|
| `POSTGRES_PASSWORD` | mật khẩu mạnh |
| `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY` | sinh mới theo hướng dẫn "Generate API keys" trong tài liệu trên |
| `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` | tài khoản vào Studio |
| `SITE_URL` | `https://chamcong.congty.vn` |
| `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` | `https://api.congty.vn` |
| `DISABLE_SIGNUP` | `true` (tài khoản do HR tạo) |
| `ENABLE_EMAIL_SIGNUP` | `true` (bật đăng nhập email/mật khẩu) |
| `ENABLE_EMAIL_AUTOCONFIRM` | `true` |
| `FUNCTIONS_VERIFY_JWT` | `false`. Cả 3 function đều tự xác thực: admin-users kiểm tra người gọi, push-dispatch và cleanup kiểm tra `CRON_SECRET` |

### Edge Functions

```bash
cp -r /opt/chamcong/supabase/functions/{_shared,admin-users,push-dispatch,cleanup} ~/supabase-docker/volumes/functions/
```

Trong `docker-compose.yml`, ở mục `functions:` → `environment:`, thêm:

```yaml
      CRON_SECRET: "chuoi-bi-mat-dai"
      LOGIN_EMAIL_DOMAIN: "nv.local"
      APP_URL: "https://chamcong.congty.vn"
      VAPID_PUBLIC_KEY: "..."        # giữ nguyên cặp khoá đang dùng trên Supabase Cloud
      VAPID_PRIVATE_KEY: "..."       # để thông báo đẩy trên điện thoại không phải đăng ký lại
      VAPID_SUBJECT: "mailto:admin@congty.vn"
      # TELEGRAM_BOT_TOKEN, RESEND_API_KEY, EMAIL_FROM nếu dùng
```

```bash
cd ~/supabase-docker && docker compose pull && docker compose up -d
```

## 3. Tạo cấu trúc database

```bash
cd /opt/chamcong
PSQL="docker compose -f $HOME/supabase-docker/docker-compose.yml exec -T db psql -U postgres -d postgres" \
  scripts/apply-migrations.sh
```

## 4. Chuyển dữ liệu từ Supabase Cloud

Nên làm ngoài giờ làm việc. Trong lúc chuyển, tạm thời không chấm công trên hệ thống cũ.

```bash
# 4.1 Xuất dữ liệu từ Cloud (chuỗi kết nối: Dashboard → Connect → Session pooler)
SOURCE_DB_URL="postgresql://postgres.[REF]:[MẬT KHẨU]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
PG_DUMP="docker run --rm postgres:17 pg_dump" \
  scripts/db-export.sh backup/cloud.sql

# 4.2 Nhập vào VPS (dùng supabase_admin để có quyền tắt trigger trong lúc nhập)
TARGET_DB_URL="postgresql://supabase_admin:[POSTGRES_PASSWORD]@localhost:5432/postgres" \
PSQL="docker compose -f $HOME/supabase-docker/docker-compose.yml exec -T db psql" \
  scripts/db-import.sh backup/cloud.sql

# 4.3 Chép ảnh selfie, đính kèm, ảnh đại diện
SOURCE_URL="https://[REF].supabase.co" SOURCE_SERVICE_KEY="[service_role Cloud]" \
TARGET_URL="https://api.congty.vn"      TARGET_SERVICE_KEY="[SERVICE_ROLE_KEY VPS]" \
  node scripts/migrate-storage.mjs
```

> Quy trình xuất, xoá sạch, nhập lại đã được kiểm thử. Sau khi nhập, số nhân viên, lượt chấm công, thông báo và nhật ký khớp tuyệt đối với bản gốc. Nhân viên đăng nhập bằng mật khẩu cũ được, và các trigger hoạt động lại bình thường.

### Bật tác vụ định kỳ (nhắc nhở, gửi thông báo, dọn ảnh)

Mở SQL Editor trong Studio, hoặc dùng `docker compose exec db psql -U postgres`, rồi chạy:

```sql
select app.set_config('functions_url', 'http://kong:8000/functions/v1');  -- gọi nội bộ trong Docker
select app.set_config('cron_secret', 'chuoi-bi-mat-dai');                 -- trùng CRON_SECRET ở trên
```

## 5. Đưa ứng dụng lên

```bash
cd /opt/chamcong && npm run build
sudo mkdir -p /var/www/chamcong && sudo cp -r dist/* /var/www/chamcong/
```

Sửa `/var/www/chamcong/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://api.congty.vn",
  supabaseAnonKey: "[ANON_KEY của VPS]",
  vapidPublicKey: "[VAPID_PUBLIC_KEY]",
  loginEmailDomain: "nv.local",
};
```

```bash
sudo cp deploy/vps/Caddyfile /etc/caddy/Caddyfile   # sửa tên miền trước
sudo systemctl reload caddy
```

> **Muốn giữ nguyên địa chỉ ứng dụng cũ** (ví dụ vẫn host frontend ở Netlify/Vercel): chỉ cần sửa `config.js` ở nơi đang host, trỏ sang `https://api.congty.vn`. Nhân viên không phải cài lại app.

## 6. Sao lưu tự động

```bash
sudo crontab -e
# 01:30 hằng ngày
30 1 * * * POSTGRES_PASSWORD=... /opt/chamcong/deploy/vps/backup.sh >> /var/log/chamcong-backup.log 2>&1
```

Script giữ các bản sao lưu trong 14 ngày tại `/var/backups/chamcong`. Nên đồng bộ thêm ra ngoài VPS (rclone → Google Drive/S3).

Khôi phục bản sao lưu: chạy `scripts/apply-migrations.sh` trên database trống, sau đó chạy `scripts/db-import.sh data-xxx.sql`, rồi giải nén `storage-xxx.tar.gz` vào `~/supabase-docker/volumes/`.

## 7. Kiểm tra sau khi chuyển

- [ ] Đăng nhập được bằng tài khoản ADMIN và một nhân viên
- [ ] Check-in tại chi nhánh: GPS, selfie, ảnh hiển thị ở trang quản lý
- [ ] Gửi đơn, duyệt đơn, nhận thông báo
- [ ] Tạo nhân viên mới (Edge Function `admin-users`)
- [ ] Sau 5 phút, bảng `cron.job_run_details` có lượt chạy thành công
- [ ] Lương tháng cũ hiển thị đúng ở trang Tính lương

---

## Phụ lục: bỏ hẳn Supabase, dùng backend riêng

Nếu sau này muốn chuyển sang backend hoàn toàn riêng (ví dụ Node.js với PostgreSQL thuần):

- **Database và logic nghiệp vụ** nằm trong `supabase/migrations/*.sql`, là PostgreSQL chuẩn. Phần phụ thuộc Supabase chỉ có `auth.uid()`, `auth.users` và `storage.*`. Thay `auth.uid()` bằng hàm đọc user id từ phiên đăng nhập của backend mới, ví dụ `current_setting('app.user_id')`.
- **Tính công và tính lương** chạy ở `src/lib/payroll/` dưới dạng TypeScript thuần, dùng lại được nguyên vẹn.
- **Giao diện** chỉ gọi dữ liệu qua `src/lib/api/*`. Chỉ cần viết lại thư mục này để gọi REST API mới, các trang không phải sửa.
