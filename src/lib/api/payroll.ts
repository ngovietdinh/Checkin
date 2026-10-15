import { supabase, unwrap, rpc, fetchAll } from "./client";
import type { PayrollAdjustment, PayrollPeriod, PayrollStatus, Payslip } from "../types";

export const listPeriods = async () =>
  unwrap(await supabase.from("payroll_periods").select("*").order("month", { ascending: false })) as PayrollPeriod[];

export const getPeriod = async (month: string) =>
  unwrap(await supabase.from("payroll_periods").select("*").eq("month", month).maybeSingle()) as PayrollPeriod | null;

export const ensurePeriod = async (month: string) =>
  unwrap(await supabase.from("payroll_periods").upsert({ month }, { onConflict: "month", ignoreDuplicates: true }).select());

export const setPeriodStatus = (month: string, status: PayrollStatus) =>
  rpc<PayrollPeriod>("set_payroll_status", { p_month: month, p_status: status });

export const listPayslips = (month: string) =>
  fetchAll<Payslip>((a, b) => supabase.from("payslips").select("*").eq("month", month).range(a, b));

export const myPayslips = async (employeeId: string) =>
  unwrap(await supabase.from("payslips").select("*").eq("employee_id", employeeId).order("month", { ascending: false })) as Payslip[];

export async function savePayslips(month: string, rows: Omit<Payslip, "id" | "computed_at" | "month">[]) {
  for (let i = 0; i < rows.length; i += 200) {
    unwrap(await supabase.from("payslips").upsert(
      rows.slice(i, i + 200).map((r) => ({ ...r, month, computed_at: new Date().toISOString() })),
      { onConflict: "month,employee_id" }));
  }
}

export const deletePayslipsExcept = async (month: string, keepIds: string[]) => {
  const existing = await listPayslips(month);
  const drop = existing.filter((p) => !keepIds.includes(p.employee_id)).map((p) => p.id);
  if (drop.length) unwrap(await supabase.from("payslips").delete().in("id", drop));
};

export const listAdjustments = (month: string, employeeId?: string) =>
  fetchAll<PayrollAdjustment>((a, b) => {
    let q = supabase.from("payroll_adjustments").select("*").eq("month", month);
    if (employeeId) q = q.eq("employee_id", employeeId);
    return q.order("created_at").range(a, b);
  });

export const saveAdjustment = async (a: Partial<PayrollAdjustment>) => {
  const { id, ...rest } = a;
  return unwrap(await (id ? supabase.from("payroll_adjustments").update(rest).eq("id", id) : supabase.from("payroll_adjustments").insert(rest)).select().single()) as PayrollAdjustment;
};
export const insertAdjustments = async (rows: Partial<PayrollAdjustment>[]) =>
  unwrap(await supabase.from("payroll_adjustments").insert(rows, { defaultToNull: false }));
export const deleteAdjustment = async (id: string) => unwrap(await supabase.from("payroll_adjustments").delete().eq("id", id));
