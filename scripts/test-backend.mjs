// Kiểm thử tích hợp backend trên Supabase (nên chạy với Supabase local: `npx supabase start`).
//   npm run test:db
// Script tạo dữ liệu với hậu tố ngẫu nhiên nên chạy lặp lại được; KHÔNG chạy trên database thật.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, ANON_KEY, adminClient, loginEmail, requireEnv } from "./_env.mjs";

requireEnv("SUPABASE_URL", "ANON_KEY", "SERVICE_KEY");
if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL) && !process.argv.includes("--force")) {
  console.error("Từ chối chạy test trên " + SUPABASE_URL + " (không phải local). Thêm --force nếu chắc chắn.");
  process.exit(1);
}

const admin = adminClient();
const sfx = Math.random().toString(36).slice(2, 7).toUpperCase();
const PASS = "Test@12345";
let failed = 0, passed = 0;

function ok(cond, name, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? "  → " + JSON.stringify(extra) : "")); }
}
async function expectErr(promise, code, name) {
  const { error } = await promise;
  ok(error?.message === code, name, error ?? "không có lỗi");
}
async function signIn(code) {
  const c = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: loginEmail(code), password: PASS });
  if (error) throw new Error("login " + code + ": " + error.message);
  return c;
}
const vnNow = () => new Date(Date.now() + 7 * 3600_000); // giờ VN dạng UTC
const hhmm = (d) => d.toISOString().slice(11, 16);
const today = () => vnNow().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
console.log("\n[1] Dữ liệu nền + admin");
const { data: br } = await admin.from("branches").insert({ name: "CN Test " + sfx, lat: 10.7769, lng: 106.7009, radius_m: 100 }).select().single();
const { data: dep } = await admin.from("departments").insert({ name: "Phòng Test " + sfx }).select().single();
// ca bắt đầu 20 phút trước -> check-in sẽ bị tính muộn
const st = new Date(vnNow().getTime() - 20 * 60_000);
const en = new Date(vnNow().getTime() + 6 * 3600_000);
const { data: shift } = await admin.from("shifts").insert({
  code: "T" + sfx, name: "Ca test " + sfx, start_time: hhmm(st), end_time: hhmm(en), break_minutes: 60, late_grace_min: 5,
}).select().single();
ok(br && dep && shift, "tạo chi nhánh, phòng ban, ca");

const { data: au } = await admin.auth.admin.createUser({ email: loginEmail("ADM" + sfx), password: PASS, email_confirm: true });
await admin.from("employees").insert({ id: au.user.id, code: "ADM" + sfx, full_name: "Admin " + sfx, role: "admin" });
await admin.from("employee_compensation").insert({ employee_id: au.user.id });
const adm = await signIn("ADM" + sfx);
ok(true, "đăng nhập admin");

// ---------------------------------------------------------------------------
console.log("\n[2] Edge function admin-users: tạo tài khoản");
async function createEmp(code, role, extra = {}) {
  const { data, error } = await adm.functions.invoke("admin-users", {
    body: { action: "create", data: { code, full_name: code, password: PASS, role, department_id: dep.id,
      default_shift_id: shift.id, work_days: [1, 2, 3, 4, 5, 6, 7], branch_ids: [br.id], join_date: "2024-01-01",
      compensation: { base_salary: 10000000 }, ...extra } },
  });
  if (error) throw new Error(code + ": " + (await error.context?.text?.() ?? error.message));
  return data.id;
}
const hrId = await createEmp("HR" + sfx, "hr");
const mgrId = await createEmp("MGR" + sfx, "manager");
const empId = await createEmp("EMP" + sfx, "employee", { manager_id: mgrId });
const emp2Id = await createEmp("EMQ" + sfx, "employee");
ok(hrId && mgrId && empId && emp2Id, "tạo HR, quản lý, 2 nhân viên");
const { data: dup } = await adm.functions.invoke("admin-users", {
  body: { action: "create", data: { code: "EMP" + sfx, full_name: "x", password: PASS } } });
ok(!dup?.id, "không cho trùng mã nhân viên");

const emp = await signIn("EMP" + sfx);
const emp2 = await signIn("EMQ" + sfx);
const mgr = await signIn("MGR" + sfx);
const hr = await signIn("HR" + sfx);
const { data: empForbidden } = await emp.functions.invoke("admin-users", {
  body: { action: "create", data: { code: "X" + sfx, full_name: "x", password: PASS } } });
ok(!empForbidden?.id, "nhân viên thường không tạo được tài khoản");

// ---------------------------------------------------------------------------
console.log("\n[3] Check-in: khoá vị trí, selfie, thiết bị");
const DEV = "device-" + sfx + "-aaaaaaaa";
const near = { p_lat: 10.7772, p_lng: 106.7010, p_accuracy: 15 }; // ~35m
const far = { p_lat: 10.7800, p_lng: 106.7100, p_accuracy: 15 };  // ~1km
await expectErr(emp.rpc("check_in", { ...far, p_selfie: empId + "/a.jpg", p_device_id: DEV }), "OUT_OF_RANGE", "ngoài bán kính → từ chối");
await expectErr(emp.rpc("check_in", { ...near, p_accuracy: 500, p_selfie: empId + "/a.jpg", p_device_id: DEV }), "GPS_INACCURATE", "GPS sai số lớn → từ chối");
await expectErr(emp.rpc("check_in", { ...near, p_device_id: DEV }), "SELFIE_REQUIRED", "thiếu selfie → từ chối");
await expectErr(emp.rpc("check_in", { ...near, p_selfie: empId + "/a.jpg" }), "DEVICE_REQUIRED", "thiếu mã thiết bị → từ chối");

const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);
const selfiePath = `${empId}/${today()}/in-${Date.now()}.jpg`;
const up = await emp.storage.from("selfies").upload(selfiePath, jpg, { contentType: "image/jpeg" });
ok(!up.error, "tải selfie lên kho riêng", up.error);
const upOther = await emp.storage.from("selfies").upload(`${emp2Id}/x.jpg`, jpg, { contentType: "image/jpeg" });
ok(!!upOther.error, "không tải được vào thư mục người khác");
await expectErr(emp.rpc("check_in", { ...near, p_selfie: emp2Id + "/x.jpg", p_device_id: DEV }), "SELFIE_REQUIRED", "selfie phải nằm trong thư mục của mình");

const ci = await emp.rpc("check_in", { ...near, p_selfie: selfiePath, p_device_id: DEV, p_device_label: "Test phone" });
ok(!ci.error && ci.data?.check_in_at, "check-in thành công", ci.error);
ok(ci.data?.shift_id === shift.id, "nhận đúng ca", ci.data?.shift_id);
ok(ci.data?.late_minutes >= 19 && ci.data?.late_minutes <= 21, "tính đi muộn ~20 phút", ci.data?.late_minutes);
ok(ci.data?.in_distance_m > 0 && ci.data?.in_distance_m < 100, "lưu khoảng cách tới chi nhánh", ci.data?.in_distance_m);
await expectErr(emp.rpc("check_in", { ...near, p_selfie: selfiePath, p_device_id: DEV }), "ALREADY_CHECKED_IN", "không check-in 2 lần");
await expectErr(emp.rpc("check_out", { ...near, p_device_id: "device-khac-bbbbbbbb" }), "DEVICE_MISMATCH", "máy khác → từ chối");

const { data: notifs } = await mgr.from("notifications").select("type,title").eq("type", "late");
ok(notifs?.some((n) => n.title.includes("EMP" + sfx)), "quản lý nhận thông báo đi muộn");

const { data: today1 } = await emp.rpc("my_today");
ok(today1?.open?.id === ci.data.id && today1.shifts.length >= 1, "my_today trả về ca & lượt đang mở");

const co = await emp.rpc("check_out", { ...near, p_device_id: DEV });
ok(!co.error && co.data?.check_out_at, "check-out thành công", co.error);
ok(co.data?.early_minutes > 300, "tính về sớm", co.data?.early_minutes);
await expectErr(emp.rpc("check_out", { ...near, p_device_id: DEV }), "NOT_CHECKED_IN", "không check-out khi chưa check-in");

// ---------------------------------------------------------------------------
console.log("\n[3b] Chấm ngoài lịch & cờ nghi vấn");
const { data: br2 } = await admin.from("branches").insert({ name: "CN xa " + sfx, lat: 21.0245, lng: 105.8531, radius_m: 100 }).select().single();
const flxId = await createEmp("FLX" + sfx, "employee", { default_shift_id: null, branch_ids: [br.id, br2.id], manager_id: mgrId });
const flx = await signIn("FLX" + sfx);
const fsel = `${flxId}/f-${Date.now()}.jpg`;
await flx.storage.from("selfies").upload(fsel, jpg, { contentType: "image/jpeg" });
const fci = await flx.rpc("check_in", { ...near, p_selfie: fsel, p_device_id: "dev-flx-" + sfx + "-xxxxxxxx", p_meta: { mocked: true } });
ok(!fci.error && fci.data.shift_id === null, "check-in ngoài lịch ca được phép", fci.error);
ok(fci.data?.flags?.includes("unscheduled") && fci.data.flags.includes("mock_location"), "gắn cờ ngoài lịch + giả lập vị trí", fci.data?.flags);
const fco = await flx.rpc("check_out", { p_lat: 21.0246, p_lng: 105.8532, p_accuracy: 10, p_device_id: "dev-flx-" + sfx + "-xxxxxxxx" });
ok(!fco.error && fco.data.flags.includes("impossible_travel"), "phát hiện di chuyển bất thường (HCM → HN trong vài giây)", fco.error ?? fco.data?.flags);
ok(fco.data?.worked_minutes >= 0, "tính giờ làm khi ngoài lịch");
const { data: susp } = await mgr.from("notifications").select("title").eq("type", "suspicious");
ok(susp?.some((n) => n.title.includes("FLX" + sfx)), "quản lý nhận cảnh báo chấm công nghi vấn");

// ---------------------------------------------------------------------------
console.log("\n[4] Phân quyền dữ liệu (RLS)");
const { data: a1 } = await emp2.from("attendance").select("id").eq("employee_id", empId);
ok(a1?.length === 0, "nhân viên khác không xem được chấm công của nhau");
const { data: a2 } = await mgr.from("attendance").select("id").eq("employee_id", empId);
ok(a2?.length === 1, "quản lý xem được chấm công cấp dưới");
const { data: c1 } = await mgr.from("employee_compensation").select("*").eq("employee_id", empId);
ok(c1?.length === 0, "quản lý KHÔNG xem được lương cấp dưới");
const { data: c2 } = await emp.from("employee_compensation").select("base_salary").eq("employee_id", empId);
ok(c2?.[0]?.base_salary == 10000000, "nhân viên xem được lương của mình");
const { data: c3 } = await hr.from("employee_compensation").select("employee_id").eq("employee_id", empId);
ok(c3?.length === 1, "HR xem được lương");
const upd = await emp.from("attendance").update({ late_minutes: 0, check_in_at: new Date().toISOString() }).eq("id", ci.data.id).select();
ok(!upd.data?.length, "nhân viên không tự sửa chấm công");
const { data: sel } = await emp2.storage.from("selfies").download(selfiePath);
ok(!sel, "nhân viên khác không tải được selfie");
const { data: sel2 } = await mgr.storage.from("selfies").download(selfiePath);
ok(!!sel2, "quản lý tải được selfie cấp dưới");
const { data: dir } = await emp2.from("employee_directory").select("id");
ok(dir?.length >= 5, "danh bạ nội bộ xem được");
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const { data: an } = await anon.from("employees").select("id");
ok(!an?.length, "khách chưa đăng nhập không đọc được dữ liệu");

// ---------------------------------------------------------------------------
console.log("\n[5] Đơn từ & duyệt nhiều cấp");
const { data: bal0 } = await emp.rpc("leave_balance");
ok(bal0?.remaining > 0, "có quỹ phép năm", bal0);
const d1 = new Date(vnNow().getTime() + 3 * 86400_000).toISOString().slice(0, 10);
const d2 = new Date(vnNow().getTime() + 4 * 86400_000).toISOString().slice(0, 10);
const lr = await emp.rpc("submit_request", { p_type: "leave_annual", p_start: d1, p_end: d2, p_reason: "Việc gia đình" });
ok(!lr.error && lr.data?.days == 2, "gửi đơn nghỉ phép 2 ngày", lr.error ?? lr.data);
ok(lr.data?.steps?.length === 2 && lr.data.steps[0].approver_id === mgrId, "chuỗi duyệt: quản lý → HR", lr.data?.steps);
await expectErr(emp.rpc("submit_request", { p_type: "leave_annual", p_start: d2, p_end: d2 }), "OVERLAP", "chặn đơn trùng ngày");
await expectErr(emp.rpc("submit_request", { p_type: "leave_annual", p_start: new Date(vnNow().getTime() + 10 * 86400_000).toISOString().slice(0, 10), p_end: new Date(vnNow().getTime() + 90 * 86400_000).toISOString().slice(0, 10) }), "INSUFFICIENT_LEAVE", "chặn khi không đủ phép");
await expectErr(hr.rpc("decide_request", { p_id: lr.data.id, p_approve: true }), "FORBIDDEN", "HR không duyệt vượt bước của quản lý");
const s1 = await mgr.rpc("decide_request", { p_id: lr.data.id, p_approve: true, p_comment: "OK" });
ok(s1.data?.status === "pending" && s1.data?.current_step === 1, "quản lý duyệt → chuyển HR", s1.error);
const s2 = await hr.rpc("decide_request", { p_id: lr.data.id, p_approve: true });
ok(s2.data?.status === "approved", "HR duyệt → hoàn tất", s2.error);
const { data: bal1 } = await emp.rpc("leave_balance");
ok(bal1.used - bal0.used === 2, "trừ quỹ phép 2 ngày", { bal0, bal1 });
const { data: n2 } = await emp.from("notifications").select("type").eq("type", "request_result");
ok(n2?.length === 1, "nhân viên nhận thông báo kết quả");

// quên chấm công -> tự tạo lượt chấm khi duyệt
const yday = new Date(vnNow().getTime() - 86400_000).toISOString().slice(0, 10);
const fr = await emp.rpc("submit_request", { p_type: "forgot_checkin", p_start: yday,
  p_payload: { check_in_at: `${yday}T${hhmm(st)}:00+07:00`, check_out_at: `${yday}T${hhmm(en)}:00+07:00` } });
await mgr.rpc("decide_request", { p_id: fr.data.id, p_approve: true });
const { data: fa } = await hr.from("attendance").select("*").eq("employee_id", empId).eq("work_date", yday);
ok(fa?.length === 1 && fa[0].source === "request" && fa[0].late_minutes === 0, "duyệt quên chấm công → tạo lượt chấm đủ công", fa);
const { data: audit } = await hr.from("audit_logs").select("*").eq("entity", "attendance").eq("entity_id", fa?.[0]?.id);
ok(audit?.length >= 1, "ghi nhật ký thao tác");

// tăng ca
const ot = await emp.rpc("submit_request", { p_type: "ot", p_start: today(), p_start_time: "18:00", p_end_time: "21:30" });
ok(ot.data?.hours == 3.5, "đơn tăng ca tính 3.5 giờ", ot.error ?? ot.data?.hours);
const rj = await mgr.rpc("decide_request", { p_id: ot.data.id, p_approve: false, p_comment: "Không cần" });
ok(rj.data?.status === "rejected", "từ chối đơn");

// đổi thiết bị
const dc = await emp.rpc("submit_request", { p_type: "device_change", p_start: today(), p_payload: { device_id: "device-moi-cccccccc", device_label: "Máy mới" } });
ok(dc.data?.steps?.[0]?.type === "hr", "đổi thiết bị do HR duyệt");
await hr.rpc("decide_request", { p_id: dc.data.id, p_approve: true });
const { data: e1 } = await hr.from("employees").select("device_id").eq("id", empId).single();
ok(e1.device_id === "device-moi-cccccccc", "duyệt → cập nhật thiết bị mới");

// đổi ca: cần người nhận đồng ý trước
const sw = await emp.rpc("submit_request", { p_type: "shift_swap", p_start: d1 < d2 ? today() : today(), p_payload: { partner_id: emp2Id } });
ok(sw.data?.steps?.[0]?.approver_id === emp2Id, "đổi ca: bước 1 là đồng nghiệp", sw.error ?? sw.data?.steps);
const { data: swSeen } = await emp2.from("requests").select("id").eq("id", sw.data.id);
ok(swSeen?.length === 1, "đồng nghiệp thấy đơn đổi ca để duyệt");

// ---------------------------------------------------------------------------
console.log("\n[6] Công việc & báo cáo");
const t = await mgr.from("tasks").insert({ title: "Báo cáo doanh số " + sfx, assignee_id: empId, created_by: mgrId,
  due_at: new Date(Date.now() + 3600_000).toISOString(), priority: "high" }).select().single();
ok(!t.error, "quản lý giao việc", t.error);
const tBad = await emp2.from("tasks").insert({ title: "x", assignee_id: empId, created_by: emp2Id }).select();
ok(!!tBad.error, "nhân viên không giao việc cho người khác");
const tu = await emp.from("tasks").update({ status: "done" }).eq("id", t.data.id).select().single();
ok(tu.data?.status === "done" && tu.data.progress === 100, "nhân viên hoàn thành việc", tu.error);
const tu2 = await emp.from("tasks").update({ title: "đổi tên" }).eq("id", t.data.id).select();
ok(!!tu2.error, "người được giao không sửa tiêu đề");
const { data: n3 } = await mgr.from("notifications").select("title").like("title", "Đã hoàn thành%");
ok(n3?.length >= 1, "người giao nhận thông báo hoàn thành");

const rp = await emp.from("daily_reports").insert({ employee_id: empId, report_date: today(), done: "Làm X", score: 5 }).select().single();
ok(!rp.error && rp.data.score === null, "nộp báo cáo ngày (không tự chấm điểm)", rp.error);
const rv = await mgr.rpc("review_report", { p_id: rp.data.id, p_score: 4, p_comment: "Tốt" });
ok(rv.data?.score === 4, "quản lý chấm điểm báo cáo", rv.error);
const rpe = await emp.from("daily_reports").update({ done: "sửa" }).eq("id", rp.data.id).select();
ok(!!rpe.error, "không sửa báo cáo đã được nhận xét");

// ---------------------------------------------------------------------------
console.log("\n[7] Thông báo chung");
const an1 = await hr.from("announcements").insert({ title: "Thông báo " + sfx, body: "Nội dung", target: "department", target_ids: [dep.id], created_by: hrId }).select().single();
ok(!an1.error, "HR đăng thông báo cho phòng ban", an1.error);
const { data: n4 } = await emp.from("notifications").select("id").eq("type", "announcement").like("title", "%" + sfx);
ok(n4?.length === 1, "nhân viên trong phòng ban nhận thông báo");
const an2 = await emp.from("announcements").insert({ title: "x", body: "x", created_by: empId }).select();
ok(!!an2.error, "nhân viên không đăng thông báo chung");

// ---------------------------------------------------------------------------
console.log("\n[8] Kỳ lương: chốt & công bố");
const month = today().slice(0, 7);
await hr.from("payroll_periods").upsert({ month });
const ps = await hr.from("payslips").upsert({ month, employee_id: empId, gross: 10000000, net: 8950000, detail: {} }, { onConflict: "month,employee_id" }).select();
ok(!ps.error, "HR lưu phiếu lương", ps.error);
const { data: ps0 } = await emp.from("payslips").select("id").eq("month", month);
ok(ps0?.length === 0, "nhân viên chưa thấy phiếu lương khi chưa công bố");
await hr.rpc("set_payroll_status", { p_month: month, p_status: "published" });
const { data: ps1 } = await emp.from("payslips").select("id").eq("month", month);
ok(ps1?.length === 1, "công bố → nhân viên xem được phiếu lương của mình");
const { data: ps2 } = await emp2.from("payslips").select("id").eq("employee_id", empId);
ok(ps2?.length === 0, "không xem được phiếu lương người khác");
const lockErr = await hr.from("attendance").update({ note: "x" }).eq("id", ci.data.id);
ok(lockErr.error?.message === "PERIOD_LOCKED", "tháng đã chốt → không sửa được chấm công", lockErr.error);
await expectErr(hr.rpc("set_payroll_status", { p_month: month, p_status: "draft" }), "ADMIN_ONLY", "chỉ Admin mở lại kỳ lương");
const reopen = await adm.rpc("set_payroll_status", { p_month: month, p_status: "draft" });
ok(!reopen.error, "Admin mở lại kỳ lương");

// ---------------------------------------------------------------------------
console.log("\n[9] Bảng điều khiển, lịch, nhắc nhở, gửi thông báo");
const ds = await mgr.rpc("day_status");
ok(!ds.error && ds.data.some((r) => r.employee_id === empId && r.status === "done"), "day_status cho quản lý", ds.error);
ok(!ds.data.some((r) => r.employee_id === emp2Id), "quản lý chỉ thấy nhân viên của mình");
const gs = await emp.rpc("get_schedule", { p_from: today(), p_to: today() });
ok(gs.data?.length === 1 && gs.data[0].employee_id === empId, "get_schedule chỉ trả lịch được phép xem", gs.error ?? gs.data);
const disp = await fetch(SUPABASE_URL + "/functions/v1/push-dispatch", { method: "POST", headers: { "x-cron-secret": "test-cron-secret" } });
const dj = await disp.json().catch(() => ({}));
ok(disp.status === 200 && dj.notifications >= 0, "push-dispatch chạy được", dj);
const denied = await fetch(SUPABASE_URL + "/functions/v1/push-dispatch", { method: "POST" });
ok(denied.status === 401, "push-dispatch từ chối khi không có secret");

// ---------------------------------------------------------------------------
console.log("\n[9b] Dọn ảnh selfie quá hạn");
await admin.storage.from("selfies").upload(`${empId}/2020-01-01/old.jpg`, jpg, { contentType: "image/jpeg" });
const { data: st0 } = await admin.from("settings").select("data").eq("id", 1).single();
await admin.from("settings").update({ data: { ...st0.data, attendance: { ...st0.data.attendance, selfie_retention_days: 30 } } }).eq("id", 1);
const cl = await fetch(SUPABASE_URL + "/functions/v1/cleanup", { method: "POST", headers: { "x-cron-secret": "test-cron-secret" } });
const cj = await cl.json().catch(() => ({}));
ok(cl.status === 200 && cj.removed >= 1, "xoá ảnh cũ hơn 30 ngày", cj);
const { data: keep } = await admin.storage.from("selfies").list(`${empId}/${today()}`);
ok(keep?.length >= 1, "giữ ảnh mới");
await admin.from("settings").update({ data: st0.data }).eq("id", 1);

// ---------------------------------------------------------------------------
console.log("\n[10] Khoá tài khoản nghỉ việc");
const lock = await adm.functions.invoke("admin-users", { body: { action: "set_active", id: emp2Id, active: false } });
ok(lock.data?.ok, "khoá tài khoản", lock.error);
const relog = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const { error: banErr } = await relog.auth.signInWithPassword({ email: loginEmail("EMQ" + sfx), password: PASS });
ok(!!banErr, "tài khoản bị khoá không đăng nhập được");

console.log(`\nKết quả: ${passed} đạt, ${failed} lỗi`);
process.exit(failed ? 1 : 0);
