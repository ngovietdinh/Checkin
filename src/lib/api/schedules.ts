import { supabase, unwrap, fetchAll, rpc } from "./client";
import type { ResolvedSchedule, ScheduleRow } from "../types";

/** Lịch đã áp dụng lịch mặc định (chỉ những nhân viên được phép xem) */
export function resolvedSchedule(from: string, to: string, employeeIds?: string[]) {
  return fetchAll<ResolvedSchedule>((a, b) =>
    supabase.rpc("get_schedule", { p_from: from, p_to: to, p_emps: employeeIds ?? null }).range(a, b));
}

export const myScheduleRange = (from: string, to: string) =>
  rpc<ResolvedSchedule[]>("get_schedule", { p_from: from, p_to: to, p_emps: null });

export function listScheduleRows(from: string, to: string, employeeIds?: string[]) {
  return fetchAll<ScheduleRow>((a, b) => {
    let q = supabase.from("schedules").select("*").gte("work_date", from).lte("work_date", to);
    if (employeeIds?.length) q = q.in("employee_id", employeeIds);
    return q.range(a, b);
  });
}

/** Đặt lịch cho (nhân viên, ngày): shiftIds rỗng + off=true => nghỉ; null => về lịch mặc định */
export async function setDay(employeeIds: string[], dates: string[], value: { shiftIds: string[]; off: boolean } | null, branchId?: string | null) {
  // xoá theo lô để không vượt giới hạn URL
  for (let i = 0; i < employeeIds.length; i += 100) {
    unwrap(await supabase.from("schedules").delete().in("employee_id", employeeIds.slice(i, i + 100)).in("work_date", dates));
  }
  if (!value) return;
  type Row = { employee_id: string; work_date: string; is_off: boolean; shift_id: string | null; branch_id?: string | null };
  const rows: Row[] = employeeIds.flatMap((employee_id) => dates.flatMap((work_date): Row[] =>
    value.off ? [{ employee_id, work_date, is_off: true, shift_id: null }]
      : value.shiftIds.map((shift_id) => ({ employee_id, work_date, shift_id, is_off: false, branch_id: branchId ?? null }))));
  for (let i = 0; i < rows.length; i += 1000) unwrap(await supabase.from("schedules").insert(rows.slice(i, i + 1000), { defaultToNull: false }));
}

/** Sao chép lịch cụ thể từ khoảng nguồn sang khoảng đích (cùng độ dài) */
export async function copySchedule(fromStart: string, toStart: string, days: number, employeeIds: string[]) {
  const addDays = (d: string, n: number) => {
    const t = new Date(d + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const srcEnd = addDays(fromStart, days - 1);
  const src = await listScheduleRows(fromStart, srcEnd, employeeIds);
  const offset = Math.round((Date.parse(toStart) - Date.parse(fromStart)) / 86400000);
  const targetDates = Array.from({ length: days }, (_, i) => addDays(toStart, i));
  for (let i = 0; i < employeeIds.length; i += 100) {
    unwrap(await supabase.from("schedules").delete().in("employee_id", employeeIds.slice(i, i + 100)).in("work_date", targetDates));
  }
  const rows = src.map((r) => ({ employee_id: r.employee_id, work_date: addDays(r.work_date, offset), shift_id: r.shift_id, branch_id: r.branch_id, is_off: r.is_off, note: r.note }));
  for (let i = 0; i < rows.length; i += 1000) unwrap(await supabase.from("schedules").insert(rows.slice(i, i + 1000), { defaultToNull: false }));
  return rows.length;
}
