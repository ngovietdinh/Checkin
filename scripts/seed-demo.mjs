// Tạo dữ liệu mẫu để dùng thử (KHÔNG chạy trên hệ thống thật đang có dữ liệu).
//   npm run seed-demo
// Tài khoản: ADMIN / HR01 / mã nhân viên bất kỳ – mật khẩu Demo@123
import { adminClient, loginEmail, SUPABASE_URL } from "./_env.mjs";

const db = adminClient();
const PASS = "Demo@123";

const { data: exists } = await db.from("employees").select("id").eq("code", "ADMIN").maybeSingle();
if (exists) {
  console.log("Dữ liệu mẫu đã có (tồn tại tài khoản ADMIN). Bỏ qua.");
  process.exit(0);
}
console.log("Tạo dữ liệu mẫu trên", SUPABASE_URL);

const must = (res, what) => {
  if (res.error) { console.error(what + ":", res.error.message); process.exit(1); }
  return res.data;
};

// ---------------------------------------------------------------------------
const { data: s } = await db.from("settings").select("data").eq("id", 1).single();
must(await db.from("settings").update({ data: { ...s.data, company_name: "Công ty TNHH Demo Việt" } }).eq("id", 1), "settings");

const branches = must(await db.from("branches").insert([
  { name: "Trụ sở Hà Nội", address: "36 Hàng Bài, Hoàn Kiếm, Hà Nội", lat: 21.0245, lng: 105.8531, radius_m: 150 },
  { name: "Chi nhánh TP.HCM", address: "72 Lê Thánh Tôn, Quận 1, TP.HCM", lat: 10.7769, lng: 106.7009, radius_m: 150 },
], { defaultToNull: false }).select(), "branches");
const [HN, HCM] = branches;

const depts = must(await db.from("departments").insert([
  { name: "Ban Giám đốc" }, { name: "Kinh doanh" }, { name: "Kế toán - Nhân sự" }, { name: "Kỹ thuật" }, { name: "Kho vận" },
], { defaultToNull: false }).select(), "departments");
const D = Object.fromEntries(depts.map((d) => [d.name, d.id]));

const positions = must(await db.from("positions").insert([
  { name: "Giám đốc" }, { name: "Trưởng phòng" }, { name: "Trưởng nhóm" }, { name: "Nhân viên" }, { name: "Thực tập sinh" },
], { defaultToNull: false }).select(), "positions");
const P = Object.fromEntries(positions.map((p) => [p.name, p.id]));

const shifts = must(await db.from("shifts").insert([
  { code: "HC", name: "Hành chính", start_time: "08:00", end_time: "17:00", break_minutes: 60, color: "#0d9488" },
  { code: "S", name: "Ca sáng", start_time: "06:00", end_time: "14:00", break_minutes: 30, color: "#2563eb" },
  { code: "C", name: "Ca chiều", start_time: "14:00", end_time: "22:00", break_minutes: 30, color: "#f59e0b" },
  { code: "Đ", name: "Ca đêm", start_time: "22:00", end_time: "06:00", break_minutes: 30, color: "#7c3aed" },
], { defaultToNull: false }).select(), "shifts");
const SH = Object.fromEntries(shifts.map((x) => [x.code, x]));

const year = new Date().getFullYear();
must(await db.from("holidays").upsert([
  { holiday_date: `${year}-01-01`, name: "Tết Dương lịch" },
  { holiday_date: `${year}-04-30`, name: "Ngày Giải phóng miền Nam" },
  { holiday_date: `${year}-05-01`, name: "Quốc tế Lao động" },
  { holiday_date: `${year}-09-02`, name: "Quốc khánh" },
]), "holidays");

// ---------------------------------------------------------------------------
// Nhân viên
const people = [
  ["ADMIN", "Quản trị hệ thống", "admin", "Ban Giám đốc", "Giám đốc", null, HN, 0],
  ["GD01", "Trần Minh Quang", "manager", "Ban Giám đốc", "Giám đốc", null, HN, 60000000],
  ["HR01", "Lê Thu Hà", "hr", "Kế toán - Nhân sự", "Trưởng phòng", "GD01", HN, 22000000],
  ["KT01", "Phạm Thị Lan", "employee", "Kế toán - Nhân sự", "Nhân viên", "HR01", HN, 12000000],
  ["KD01", "Nguyễn Văn Hùng", "manager", "Kinh doanh", "Trưởng phòng", "GD01", HN, 25000000],
  ["KD02", "Đỗ Thị Mai", "leader", "Kinh doanh", "Trưởng nhóm", "KD01", HN, 16000000],
  ["KD03", "Vũ Đức Anh", "employee", "Kinh doanh", "Nhân viên", "KD02", HN, 10000000],
  ["KD04", "Hoàng Ngọc Bích", "employee", "Kinh doanh", "Nhân viên", "KD02", HN, 10500000],
  ["KD05", "Bùi Quốc Bảo", "employee", "Kinh doanh", "Nhân viên", "KD02", HN, 9500000],
  ["KD06", "Ngô Thanh Tâm", "leader", "Kinh doanh", "Trưởng nhóm", "KD01", HCM, 16000000],
  ["KD07", "Đặng Minh Khoa", "employee", "Kinh doanh", "Nhân viên", "KD06", HCM, 11000000],
  ["KD08", "Phan Thị Hồng", "employee", "Kinh doanh", "Nhân viên", "KD06", HCM, 10000000],
  ["KD09", "Lý Gia Huy", "employee", "Kinh doanh", "Thực tập sinh", "KD06", HCM, 5000000],
  ["KY01", "Trịnh Công Sơn", "manager", "Kỹ thuật", "Trưởng phòng", "GD01", HCM, 30000000],
  ["KY02", "Mai Xuân Trường", "employee", "Kỹ thuật", "Nhân viên", "KY01", HCM, 18000000],
  ["KY03", "Cao Thị Yến", "employee", "Kỹ thuật", "Nhân viên", "KY01", HCM, 17000000],
  ["KY04", "Đinh Văn Lộc", "employee", "Kỹ thuật", "Nhân viên", "KY01", HCM, 15000000],
  ["KV01", "Tạ Văn Nam", "leader", "Kho vận", "Trưởng nhóm", "GD01", HCM, 14000000],
  ["KV02", "Lâm Văn Tài", "employee", "Kho vận", "Nhân viên", "KV01", HCM, 0],
  ["KV03", "Hồ Thị Thảo", "employee", "Kho vận", "Nhân viên", "KV01", HCM, 0],
  ["KV04", "Châu Minh Phúc", "employee", "Kho vận", "Nhân viên", "KV01", HCM, 0],
  ["KV05", "Kiều Văn Sang", "employee", "Kho vận", "Nhân viên", "KV01", HCM, 0],
];
const ids = {};
for (const [code, name, role, dept, pos, , branch, salary] of people) {
  const { data, error } = await db.auth.admin.createUser({ email: loginEmail(code), password: PASS, email_confirm: true });
  if (error) { console.error(code, error.message); process.exit(1); }
  const id = data.user.id;
  ids[code] = id;
  const kv = code.startsWith("KV") && code !== "KV01";
  must(await db.from("employees").insert({
    id, code, full_name: name, role, department_id: D[dept], position_id: P[pos],
    phone: "09" + String(10000000 + Math.floor(Math.random() * 89999999)).slice(0, 8),
    join_date: code === "KD09" ? `${year}-${String(new Date().getMonth() + 1).padStart(2, "0")}-05` : "2023-03-01",
    // tài khoản quản trị hệ thống: không chấm công, không tính lương
    default_shift_id: kv || code === "ADMIN" ? null : SH.HC.id, work_days: code === "ADMIN" ? [] : kv ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
  }), "employee " + code);
  must(await db.from("employee_compensation").insert(kv
    ? { employee_id: id, salary_type: "shift", shift_rate: 380000, insurance_salary: 5310000, bank_name: "Vietcombank", bank_account: "0071000" + Math.floor(100000 + Math.random() * 899999) }
    : { employee_id: id, salary_type: "monthly", base_salary: salary, dependents: salary > 20000000 ? 1 : 0, bank_name: "Techcombank", bank_account: "1903" + Math.floor(10000000 + Math.random() * 89999999),
        insurance_enabled: code !== "ADMIN", tax_enabled: code !== "ADMIN" }), "comp " + code);
  must(await db.from("employee_branches").insert({ employee_id: id, branch_id: branch.id }), "branch " + code);
  if (!kv && code !== "ADMIN") {
    must(await db.from("employee_allowances").insert([
      { employee_id: id, name: "Ăn trưa", amount: 35000, taxable: false, per_workday: true },
      { employee_id: id, name: "Xăng xe, điện thoại", amount: 500000, taxable: false, per_workday: false },
    ]), "allow " + code);
  }
}
for (const [code, , , , , mgr] of people) if (mgr) await db.from("employees").update({ manager_id: ids[mgr] }).eq("id", ids[code]);
await db.from("departments").update({ manager_id: ids.KD01 }).eq("id", D["Kinh doanh"]);
await db.from("departments").update({ manager_id: ids.KY01 }).eq("id", D["Kỹ thuật"]);
await db.from("departments").update({ manager_id: ids.HR01 }).eq("id", D["Kế toán - Nhân sự"]);
await db.from("departments").update({ manager_id: ids.KV01 }).eq("id", D["Kho vận"]);
await db.from("departments").update({ manager_id: ids.GD01 }).eq("id", D["Ban Giám đốc"]);

// ---------------------------------------------------------------------------
// Lịch xoay ca cho Kho vận trong tháng + 1 tuần tới
const vn = (d) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const now = new Date();
const today = vn(now);
const monthStart = today.slice(0, 8) + "01";
const addDays = (s, n) => { const t = new Date(s + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const dow = (s) => new Date(s + "T00:00:00Z").getUTCDay() || 7;
const kvCodes = ["KV02", "KV03", "KV04", "KV05"];
const sched = [];
for (let d = monthStart; d <= addDays(today, 7); d = addDays(d, 1)) {
  if (dow(d) === 7) continue;
  kvCodes.forEach((c, i) => {
    const week = Math.floor((Number(d.slice(8)) - 1) / 7);
    const code = ["S", "C", "S", "C"][(i + week) % 4];
    sched.push({ employee_id: ids[c], work_date: d, shift_id: SH[code].id });
  });
}
must(await db.from("schedules").insert(sched), "schedules");

// ---------------------------------------------------------------------------
// Lịch sử chấm công đến hôm qua
const branchOf = Object.fromEntries(people.map((p) => [p[0], p[6]]));
const att = [];
const ts = (date, hhmm, plusMin) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.parse(`${date}T00:00:00+07:00`) + ((h * 60 + m + plusMin) * 60000)).toISOString();
};
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
for (let d = monthStart; d <= today; d = addDays(d, 1)) {
  for (const [code] of people) {
    if (code === "ADMIN") continue;
    if (code === "KD09" && d < `${today.slice(0, 8)}05`) continue;
    const kv = kvCodes.includes(code);
    let shift;
    if (kv) {
      const row = sched.find((x) => x.employee_id === ids[code] && x.work_date === d);
      if (!row) continue;
      shift = shifts.find((x) => x.id === row.shift_id);
    } else {
      if (dow(d) > 5) continue;
      shift = SH.HC;
    }
    const r = Math.random();
    if (r < 0.03) continue; // vắng
    const b = branchOf[code];
    const late = r < 0.15 ? rand(6, 40) : -rand(0, 20);
    let outPlus = r > 0.97 ? null : rand(0, 45);
    const st = shift.start_time.slice(0, 5);
    const durMin = ((Number(shift.end_time.slice(0, 2)) * 60 + Number(shift.end_time.slice(3, 5))) - (Number(st.slice(0, 2)) * 60 + Number(st.slice(3, 5))) + 1440) % 1440;
    if (d === today) {
      if (Date.parse(ts(d, st, late)) > Date.now()) continue; // ca chưa bắt đầu
      if (Date.parse(ts(d, st, durMin + (outPlus ?? 0))) > Date.now()) outPlus = undefined; // đang làm
      if (outPlus === null) outPlus = undefined;
    }
    att.push({
      employee_id: ids[code], work_date: d, shift_id: shift.id, branch_id: b.id,
      check_in_at: ts(d, st, late), check_out_at: outPlus == null ? null : ts(d, st, durMin + outPlus),
      missing_checkout: outPlus === null,
      in_lat: b.lat + (Math.random() - 0.5) * 0.0008, in_lng: b.lng + (Math.random() - 0.5) * 0.0008, in_accuracy: rand(8, 35),
      in_distance_m: rand(5, 60), device_id: "seed-device-" + code, source: "app",
      flags: outPlus === null ? ["missing_checkout"] : [],
    });
  }
}
for (let i = 0; i < att.length; i += 500) must(await db.from("attendance").insert(att.slice(i, i + 500), { defaultToNull: false }), "attendance");

// ---------------------------------------------------------------------------
// Đơn từ, công việc, báo cáo, thông báo
const step = (type, approver, action) => ({ type, approver_id: approver, ...(action ? { action, by: approver ?? ids.HR01, at: new Date().toISOString() } : {}) });
must(await db.from("requests").insert([
  { employee_id: ids.KD03, type: "leave_annual", start_date: addDays(today, 3), end_date: addDays(today, 4), days: 2, reason: "Về quê đám cưới em gái",
    steps: [step("direct_manager", ids.KD02), step("hr", null)], status: "pending" },
  { employee_id: ids.KY02, type: "ot", start_date: addDays(today, -2), end_date: addDays(today, -2), start_time: "18:00", end_time: "21:00", hours: 3,
    reason: "Triển khai hệ thống cho khách hàng", steps: [step("direct_manager", ids.KY01, "approved")], status: "approved" },
  { employee_id: ids.KD07, type: "late", start_date: addDays(today, -1), end_date: addDays(today, -1), reason: "Xe hỏng giữa đường",
    steps: [step("direct_manager", ids.KD06)], status: "pending" },
  { employee_id: ids.KT01, type: "leave_annual", start_date: addDays(today, -6), end_date: addDays(today, -6), days: 1, reason: "Đi khám bệnh",
    steps: [step("direct_manager", ids.HR01, "approved")], status: "approved" },
  { employee_id: ids.KV03, type: "forgot_checkin", start_date: addDays(today, -3), end_date: addDays(today, -3), reason: "Điện thoại hết pin",
    payload: { check_out_at: ts(addDays(today, -3), "22:00", 5) }, steps: [step("direct_manager", ids.KV01)], status: "pending" },
], { defaultToNull: false }), "requests");

must(await db.from("tasks").insert([
  { title: "Báo giá cho khách hàng ABC", description: "Gửi báo giá gói dịch vụ năm, kèm chính sách chiết khấu.", assignee_id: ids.KD03, created_by: ids.KD02, due_at: new Date(Date.now() + 86400_000).toISOString(), priority: "high", status: "doing", progress: 40 },
  { title: "Cập nhật danh sách khách hàng tiềm năng", assignee_id: ids.KD04, created_by: ids.KD02, due_at: new Date(Date.now() + 3 * 86400_000).toISOString(), priority: "normal" },
  { title: "Kiểm kê kho cuối tháng", assignee_id: ids.KV02, created_by: ids.KV01, due_at: new Date(Date.now() - 86400_000).toISOString(), priority: "urgent", status: "todo" },
  { title: "Sửa lỗi đăng nhập ứng dụng khách hàng", assignee_id: ids.KY02, created_by: ids.KY01, priority: "high", status: "done", progress: 100, completed_at: new Date().toISOString() },
  { title: "Chuẩn bị hồ sơ BHXH tháng này", assignee_id: ids.KT01, created_by: ids.HR01, due_at: new Date(Date.now() + 5 * 86400_000).toISOString(), priority: "normal", status: "doing", progress: 60 },
], { defaultToNull: false }), "tasks");

const reports = [];
for (const c of ["KD03", "KD04", "KY02", "KY03", "KT01"]) {
  for (let i = 1; i <= 3; i++) {
    const d = addDays(today, -i);
    if (dow(d) > 5) continue;
    reports.push({ employee_id: ids[c], report_date: d, done: "- Liên hệ 8 khách hàng\n- Hoàn thành báo cáo tuần", doing: "- Soạn hợp đồng", issues: i === 1 ? "Cần hỗ trợ tài liệu sản phẩm mới" : "", plan: "- Gặp khách hàng tại văn phòng",
      ...(i > 1 ? { score: rand(3, 5), manager_comment: "Tốt, tiếp tục phát huy", reviewed_by: ids.KD01, reviewed_at: new Date().toISOString() } : {}) });
  }
}
must(await db.from("daily_reports").insert(reports, { defaultToNull: false }), "reports");

must(await db.from("announcements").insert([
  { title: "Lịch nghỉ lễ Quốc khánh", body: "Công ty nghỉ lễ theo quy định. Các bộ phận trực sắp xếp lịch và báo HR trước 3 ngày.", target: "all", pinned: true, created_by: ids.HR01 },
  { title: "Họp phòng Kinh doanh sáng thứ Hai", body: "8h30 thứ Hai tuần tới họp tổng kết tháng tại phòng họp tầng 3.", target: "department", target_ids: [D["Kinh doanh"]], created_by: ids.KD01 },
], { defaultToNull: false }), "announcements");

console.log(`Xong: ${people.length} nhân viên, ${att.length} lượt chấm công, ${sched.length} lịch ca.`);
console.log(`Đăng nhập: ADMIN / ${PASS} (quản trị), HR01 / ${PASS} (nhân sự), KD01 / ${PASS} (quản lý), KD03 / ${PASS} (nhân viên)`);
