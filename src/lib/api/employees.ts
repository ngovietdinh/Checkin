import { supabase, unwrap, fetchAll, ApiError } from "./client";
import type { Compensation, DirectoryEntry, Employee, EmployeeAllowance } from "../types";

export const directory = () =>
  fetchAll<DirectoryEntry>((a, b) => supabase.from("employee_directory").select("*").order("full_name").range(a, b));

export const listEmployees = () =>
  fetchAll<Employee>((a, b) => supabase.from("employees").select("*").order("code").range(a, b));

export const getEmployee = async (id: string) =>
  unwrap(await supabase.from("employees").select("*").eq("id", id).single()) as Employee;

export async function updateEmployee(id: string, patch: Partial<Employee>) {
  return unwrap(await supabase.from("employees").update(patch).eq("id", id).select().single()) as Employee;
}

export const listCompensation = () =>
  fetchAll<Compensation>((a, b) => supabase.from("employee_compensation").select("*").range(a, b));

export const getCompensation = async (id: string) =>
  unwrap(await supabase.from("employee_compensation").select("*").eq("employee_id", id).maybeSingle()) as Compensation | null;

export const saveCompensation = async (c: Partial<Compensation> & { employee_id: string }) =>
  unwrap(await supabase.from("employee_compensation").upsert(c).select().single()) as Compensation;

export const listAllowances = (employeeId?: string) =>
  fetchAll<EmployeeAllowance>((a, b) => {
    let q = supabase.from("employee_allowances").select("*");
    if (employeeId) q = q.eq("employee_id", employeeId);
    return q.range(a, b);
  });

export async function replaceAllowances(employeeId: string, rows: Omit<EmployeeAllowance, "id" | "employee_id">[]) {
  unwrap(await supabase.from("employee_allowances").delete().eq("employee_id", employeeId));
  if (rows.length) unwrap(await supabase.from("employee_allowances").insert(rows.map((r) => ({ ...r, employee_id: employeeId }))));
}

export const listEmployeeBranches = () =>
  fetchAll<{ employee_id: string; branch_id: string }>((a, b) => supabase.from("employee_branches").select("*").range(a, b));

export async function setEmployeeBranches(employeeId: string, branchIds: string[]) {
  unwrap(await supabase.from("employee_branches").delete().eq("employee_id", employeeId));
  if (branchIds.length) unwrap(await supabase.from("employee_branches").insert(branchIds.map((branch_id) => ({ employee_id: employeeId, branch_id }))));
}

export async function resetDevice(id: string) {
  return updateEmployee(id, { device_id: null, device_label: null, device_bound_at: null });
}

export async function setCarryover(employeeId: string, year: number, days: number) {
  unwrap(await supabase.from("leave_carryovers").upsert({ employee_id: employeeId, year, days }));
}

export const listCarryovers = async (year: number) =>
  unwrap(await supabase.from("leave_carryovers").select("*").eq("year", year)) as { employee_id: string; year: number; days: number }[];

// --- tài khoản đăng nhập (qua Edge Function vì cần quyền quản trị) ---
async function adminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* giữ nguyên */ }
    throw new ApiError(msg);
  }
  if (data?.error) throw new ApiError(data.error);
  return data as T;
}

export interface NewEmployee {
  code: string; full_name: string; password: string; email?: string | null; phone?: string | null;
  gender?: string | null; dob?: string | null; role?: string; department_id?: string | null; position_id?: string | null;
  manager_id?: string | null; join_date?: string | null; default_shift_id?: string | null; work_days?: number[];
  annual_leave_days?: number | null; branch_ids?: string[]; compensation?: Partial<Compensation>;
}

export const createEmployee = (data: NewEmployee) => adminUsers<{ id: string; email: string }>({ action: "create", data });
export const bulkCreateEmployees = (data: NewEmployee[]) =>
  adminUsers<{ results: { code: string; ok: boolean; error?: string; email?: string }[] }>({ action: "bulk_create", data });
export const setPassword = (id: string, password: string) => adminUsers({ action: "set_password", id, password });
export const setLoginEmail = (id: string, email: string) => adminUsers<{ email: string }>({ action: "set_email", id, email });
export const setActive = (id: string, active: boolean, left_date?: string) => adminUsers({ action: "set_active", id, active, left_date });

export const myBranchIds = async (employeeId: string) =>
  (unwrap(await supabase.from("employee_branches").select("branch_id").eq("employee_id", employeeId)) as { branch_id: string }[])
    .map((r) => r.branch_id);

/** Id những nhân viên mình được quản lý/xem (theo phân quyền) */
export const visibleIds = () =>
  fetchAll<{ id: string }>((a, b) => supabase.from("employees").select("id").eq("active", true).range(a, b)).then((r) => r.map((x) => x.id));
