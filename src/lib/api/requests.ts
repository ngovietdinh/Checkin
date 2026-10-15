import { supabase, unwrap, rpc, fetchAll } from "./client";
import type { LeaveBalance, LeaveRequest, RequestType, RequestStatus } from "../types";

export interface NewRequest {
  type: RequestType;
  start_date: string;
  end_date?: string | null;
  half_day?: "am" | "pm" | null;
  start_time?: string | null;
  end_time?: string | null;
  hours?: number | null;
  reason?: string | null;
  attachment?: string | null;
  payload?: Record<string, unknown>;
}

export const submitRequest = (r: NewRequest) => rpc<LeaveRequest>("submit_request", {
  p_type: r.type, p_start: r.start_date, p_end: r.end_date || null, p_half_day: r.half_day || null,
  p_start_time: r.start_time || null, p_end_time: r.end_time || null, p_hours: r.hours ?? null,
  p_reason: r.reason || null, p_attachment: r.attachment || null, p_payload: r.payload ?? {},
});

export const decideRequest = (id: string, approve: boolean, comment?: string) =>
  rpc<LeaveRequest>("decide_request", { p_id: id, p_approve: approve, p_comment: comment || null });

export const cancelRequest = (id: string) => rpc<LeaveRequest>("cancel_request", { p_id: id });

export const leaveBalance = (employeeId?: string, year?: number) =>
  rpc<LeaveBalance>("leave_balance", { p_emp: employeeId ?? null, p_year: year ?? null });

export interface RequestFilter {
  employeeId?: string;
  status?: RequestStatus | "all";
  from?: string;
  to?: string;
  types?: RequestType[];
}

export function listRequests(f: RequestFilter = {}) {
  return fetchAll<LeaveRequest>((a, b) => {
    let q = supabase.from("requests").select("*");
    if (f.employeeId) q = q.eq("employee_id", f.employeeId);
    if (f.status && f.status !== "all") q = q.eq("status", f.status);
    if (f.from) q = q.gte("end_date", f.from);
    if (f.to) q = q.lte("start_date", f.to);
    if (f.types?.length) q = q.in("type", f.types);
    return q.order("created_at", { ascending: false }).range(a, b);
  });
}

/** Đơn đã duyệt giao với khoảng thời gian (dùng tính công) */
export function approvedInRange(from: string, to: string, employeeIds?: string[]) {
  return fetchAll<LeaveRequest>((a, b) => {
    let q = supabase.from("requests").select("*").eq("status", "approved").gte("end_date", from).lte("start_date", to);
    if (employeeIds?.length) q = q.in("employee_id", employeeIds);
    return q.range(a, b);
  });
}

export async function getRequest(id: string) {
  return unwrap(await supabase.from("requests").select("*").eq("id", id).single()) as LeaveRequest;
}
