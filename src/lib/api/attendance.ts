import { supabase, unwrap, rpc, fetchAll } from "./client";
import type { Attendance, DayStatusRow, MyToday } from "../types";

export const myToday = () => rpc<MyToday>("my_today");

export interface CheckPayload {
  lat: number; lng: number; accuracy: number;
  selfie?: string | null; deviceId: string; deviceLabel?: string; meta?: Record<string, unknown>;
}

export const checkIn = (p: CheckPayload) => rpc<Attendance>("check_in", {
  p_lat: p.lat, p_lng: p.lng, p_accuracy: p.accuracy, p_selfie: p.selfie ?? null,
  p_device_id: p.deviceId, p_device_label: p.deviceLabel ?? null, p_meta: p.meta ?? {},
});

export const checkOut = (p: Partial<CheckPayload> & { deviceId: string }) => rpc<Attendance>("check_out", {
  p_lat: p.lat ?? null, p_lng: p.lng ?? null, p_accuracy: p.accuracy ?? null, p_selfie: p.selfie ?? null,
  p_device_id: p.deviceId, p_meta: p.meta ?? {},
});

export const dayStatus = (date?: string) => rpc<DayStatusRow[]>("day_status", { p_date: date ?? null });

export interface AttendanceFilter { from: string; to: string; employeeIds?: string[]; flaggedOnly?: boolean }

export function listAttendance(f: AttendanceFilter): Promise<Attendance[]> {
  return fetchAll<Attendance>((a, b) => {
    let q = supabase.from("attendance").select("*").gte("work_date", f.from).lte("work_date", f.to);
    if (f.employeeIds?.length) q = q.in("employee_id", f.employeeIds);
    if (f.flaggedOnly) q = q.or("flags.neq.{},missing_checkout.eq.true");
    return q.order("work_date", { ascending: false }).order("check_in_at", { ascending: false }).range(a, b);
  });
}

export async function upsertAttendance(row: Partial<Attendance> & { employee_id: string; work_date: string }) {
  const payload = { ...row, source: row.id ? row.source : "manual" };
  if (row.id) return unwrap(await supabase.from("attendance").update(payload).eq("id", row.id).select().single()) as Attendance;
  return unwrap(await supabase.from("attendance").insert(payload).select().single()) as Attendance;
}

export async function deleteAttendance(id: string) {
  unwrap(await supabase.from("attendance").delete().eq("id", id));
}

export const reviewAttendance = (id: string, note: string | null, clearFlags: boolean) =>
  rpc<Attendance>("review_attendance", { p_id: id, p_note: note, p_clear_flags: clearFlags });

/** Số lượt chấm công theo ngày (thống kê) */
export async function attendanceStats(from: string, to: string) {
  const rows = await fetchAll<{ work_date: string; late_minutes: number; employee_id: string }>((a, b) =>
    supabase.from("attendance").select("work_date, late_minutes, employee_id").gte("work_date", from).lte("work_date", to).range(a, b));
  return rows;
}
