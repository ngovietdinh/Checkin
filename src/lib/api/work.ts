import { supabase, unwrap, rpc, fetchAll } from "./client";
import type { DailyReport, Task, TaskComment, TaskStatus } from "../types";

export interface TaskFilter { assigneeId?: string; createdBy?: string; status?: TaskStatus[]; employeeIds?: string[] }

export function listTasks(f: TaskFilter = {}) {
  return fetchAll<Task>((a, b) => {
    let q = supabase.from("tasks").select("*");
    if (f.assigneeId) q = q.eq("assignee_id", f.assigneeId);
    if (f.createdBy) q = q.eq("created_by", f.createdBy);
    if (f.status?.length) q = q.in("status", f.status);
    if (f.employeeIds?.length) q = q.in("assignee_id", f.employeeIds);
    return q.order("created_at", { ascending: false }).range(a, b);
  });
}

export const getTask = async (id: string) => unwrap(await supabase.from("tasks").select("*").eq("id", id).single()) as Task;

export async function saveTask(t: Partial<Task>) {
  const { id, ...rest } = t;
  if (id) return unwrap(await supabase.from("tasks").update(rest).eq("id", id).select().single()) as Task;
  return unwrap(await supabase.from("tasks").insert(rest).select().single()) as Task;
}

export async function createTasks(rows: Partial<Task>[]) {
  return unwrap(await supabase.from("tasks").insert(rows, { defaultToNull: false }).select()) as Task[];
}

export const deleteTask = async (id: string) => unwrap(await supabase.from("tasks").delete().eq("id", id));

export const listComments = async (taskId: string) =>
  unwrap(await supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at")) as TaskComment[];

export const addComment = async (task_id: string, author_id: string, body: string) =>
  unwrap(await supabase.from("task_comments").insert({ task_id, author_id, body }).select().single()) as TaskComment;

export interface ReportFilter { employeeId?: string; from?: string; to?: string; employeeIds?: string[] }

export function listReports(f: ReportFilter = {}) {
  return fetchAll<DailyReport>((a, b) => {
    let q = supabase.from("daily_reports").select("*");
    if (f.employeeId) q = q.eq("employee_id", f.employeeId);
    if (f.employeeIds?.length) q = q.in("employee_id", f.employeeIds);
    if (f.from) q = q.gte("report_date", f.from);
    if (f.to) q = q.lte("report_date", f.to);
    return q.order("report_date", { ascending: false }).range(a, b);
  });
}

export async function saveReport(r: Partial<DailyReport> & { employee_id: string; report_date: string }) {
  return unwrap(await supabase.from("daily_reports").upsert(r, { onConflict: "employee_id,report_date" }).select().single()) as DailyReport;
}

export const reviewReport = (id: string, score: number, comment: string) =>
  rpc<DailyReport>("review_report", { p_id: id, p_score: score, p_comment: comment || null });
