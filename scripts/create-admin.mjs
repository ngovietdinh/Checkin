// Tạo tài khoản Admin đầu tiên.
//   npm run create-admin -- --code ADMIN --name "Nguyễn Văn A" --password "MatKhau@123" [--email a@congty.vn]
import { adminClient, loginEmail, arg } from "./_env.mjs";

const code = arg("code", "ADMIN");
const name = arg("name", "Quản trị viên");
const password = arg("password");
const email = arg("email");
if (!password || password.length < 8) {
  console.error("Cần --password (tối thiểu 8 ký tự)");
  process.exit(1);
}

const db = adminClient();
const { data: existing } = await db.from("employees").select("id").eq("code", code).maybeSingle();
if (existing) {
  console.log(`Tài khoản ${code} đã tồn tại – bỏ qua.`);
  process.exit(0);
}
const login = loginEmail(code, email);
const { data, error } = await db.auth.admin.createUser({ email: login, password, email_confirm: true });
if (error) { console.error("Lỗi tạo tài khoản:", error.message); process.exit(1); }

const id = data.user.id;
const { error: e1 } = await db.from("employees").insert({ id, code, full_name: name, email: email ?? null, role: "admin" });
if (e1) { await db.auth.admin.deleteUser(id); console.error("Lỗi tạo hồ sơ:", e1.message); process.exit(1); }
await db.from("employee_compensation").insert({ employee_id: id });

console.log(`Đã tạo Admin. Đăng nhập bằng: ${email ?? code}  (email hệ thống: ${login})`);
