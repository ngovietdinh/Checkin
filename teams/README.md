# Nhúng app vào Microsoft Teams

Teams hiển thị app chấm công dưới dạng một **tab cá nhân** ở thanh bên trái.

1. Tạo gói cài đặt: `scripts/build-teams-app.sh`. Lệnh này tạo file `dist-teams/chamcong-teams.zip`.
   Nếu đổi tên miền: `APP_URL=https://chamcong.congty.vn scripts/build-teams-app.sh`.
2. Vào Teams Admin Center (<https://admin.teams.microsoft.com>), chọn **Teams apps → Manage apps → Upload new app**, rồi chọn file zip.
3. Vào **Teams apps → Setup policies → Global → Pinned apps → Add apps**, thêm "Chấm công" để ghim cho toàn công ty.

Mỗi lần sửa `manifest.json` phải tăng `version` lên (ví dụ 1.0.1). Sau đó tạo lại file zip và chọn **Upload file** trong trang của app.
