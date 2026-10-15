// Quản lý tài khoản đăng nhập của nhân viên (cần quyền service_role nên phải chạy phía server).
// Chỉ Admin/HR gọi được. Các hành động:
//   create       : tạo tài khoản + hồ sơ nhân viên (+ lương, chi nhánh)
//   bulk_create  : tạo hàng loạt (nhập từ Excel)
//   set_password : đặt lại mật khẩu
//   set_email    : đổi email/tên đăng nhập
//   set_active   : khoá / mở khoá tài khoản (nghỉ việc)
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOGIN_DOMAIN = Deno.env.get("LOGIN_EMAIL_DOMAIN") ?? "nv.local";

type Role = "admin" | "hr" | "manager" | "leader" | "employee";

interface CreateInput {
  code: string;
  full_name: string;
  password: string;
  email?: string | null;
  phone?: string | null;
  gender?: string | null;
  dob?: string | null;
  role?: Role;
  department_id?: string | null;
  position_id?: string | null;
  manager_id?: string | null;
  join_date?: string | null;
  default_shift_id?: string | null;
  work_days?: number[];
  annual_leave_days?: number | null;
  branch_ids?: string[];
  compensation?: Record<string, unknown>;
}

function loginEmail(input: { code: string; email?: string | null }) {
  const email = input.email?.trim();
  if (email) return email.toLowerCase();
  return `${input.code.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${LOGIN_DOMAIN}`;
}

async function createOne(admin: SupabaseClient, callerRole: Role, input: CreateInput) {
  if (!input.code?.trim() || !input.full_name?.trim()) throw new Error("Thiếu mã hoặc họ tên nhân viên");
  if (!input.password || input.password.length < 6) throw new Error("Mật khẩu tối thiểu 6 ký tự");
  const role: Role = input.role ?? "employee";
  if (role === "admin" && callerRole !== "admin") throw new Error("Chỉ Admin được tạo tài khoản Admin");

  const email = loginEmail(input);
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, code: input.code },
  });
  if (error) throw new Error(error.message.includes("already") ? `Email ${email} đã tồn tại` : error.message);
  const id = created.user.id;

  try {
    const { error: e1 } = await admin.from("employees").insert({
      id,
      code: input.code.trim(),
      full_name: input.full_name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone ?? null,
      gender: input.gender ?? null,
      dob: input.dob || null,
      role,
      department_id: input.department_id || null,
      position_id: input.position_id || null,
      manager_id: input.manager_id || null,
      join_date: input.join_date || undefined,
      default_shift_id: input.default_shift_id || null,
      work_days: input.work_days ?? [1, 2, 3, 4, 5],
      annual_leave_days: input.annual_leave_days ?? null,
    });
    if (e1) throw new Error(e1.message.includes("employees_code_key") ? `Mã nhân viên ${input.code} đã tồn tại` : e1.message);

    const { error: e2 } = await admin.from("employee_compensation").insert({ employee_id: id, ...(input.compensation ?? {}) });
    if (e2) throw new Error(e2.message);

    if (input.branch_ids?.length) {
      const { error: e3 } = await admin.from("employee_branches")
        .insert(input.branch_ids.map((branch_id) => ({ employee_id: id, branch_id })));
      if (e3) throw new Error(e3.message);
    }
  } catch (e) {
    await admin.auth.admin.deleteUser(id); // rollback
    throw e;
  }
  return { id, email };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!user) return json({ error: "Chưa đăng nhập" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: caller } = await admin.from("employees").select("role, active").eq("id", user.id).single();
    if (!caller?.active || !["admin", "hr"].includes(caller.role)) return json({ error: "Không có quyền" }, 403);
    const callerRole = caller.role as Role;

    const body = await req.json();
    switch (body.action) {
      case "create": {
        const result = await createOne(admin, callerRole, body.data);
        return json(result);
      }
      case "bulk_create": {
        const rows: CreateInput[] = body.data ?? [];
        if (rows.length > 500) return json({ error: "Tối đa 500 dòng mỗi lần" }, 400);
        const results = [];
        for (const row of rows) {
          try {
            const r = await createOne(admin, callerRole, row);
            results.push({ code: row.code, ok: true, ...r });
          } catch (e) {
            results.push({ code: row.code, ok: false, error: (e as Error).message });
          }
        }
        return json({ results });
      }
      case "set_password": {
        if (!body.password || body.password.length < 6) return json({ error: "Mật khẩu tối thiểu 6 ký tự" }, 400);
        await assertCanManage(admin, callerRole, body.id);
        const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
        if (error) throw error;
        return json({ ok: true });
      }
      case "set_email": {
        await assertCanManage(admin, callerRole, body.id);
        const { data: emp } = await admin.from("employees").select("code").eq("id", body.id).single();
        const email = loginEmail({ code: emp!.code, email: body.email });
        const { error } = await admin.auth.admin.updateUserById(body.id, { email, email_confirm: true });
        if (error) throw error;
        await admin.from("employees").update({ email: body.email || null }).eq("id", body.id);
        return json({ ok: true, email });
      }
      case "set_active": {
        if (body.id === user.id) return json({ error: "Không thể tự khoá tài khoản của mình" }, 400);
        await assertCanManage(admin, callerRole, body.id);
        const active = !!body.active;
        const { error } = await admin.auth.admin.updateUserById(body.id, { ban_duration: active ? "none" : "876000h" });
        if (error) throw error;
        await admin.from("employees").update({
          active,
          left_date: active ? null : (body.left_date ?? new Date().toISOString().slice(0, 10)),
        }).eq("id", body.id);
        return json({ ok: true });
      }
      default:
        return json({ error: "Hành động không hợp lệ" }, 400);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

async function assertCanManage(admin: SupabaseClient, callerRole: Role, id: string) {
  const { data } = await admin.from("employees").select("role").eq("id", id).single();
  if (!data) throw new Error("Không tìm thấy nhân viên");
  if (data.role === "admin" && callerRole !== "admin") throw new Error("Chỉ Admin được thao tác với tài khoản Admin");
}
