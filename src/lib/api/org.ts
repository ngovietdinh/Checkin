import { supabase, unwrap } from "./client";
import type { AppSettings, Branch, Department, Holiday, Position, Shift } from "../types";

export const listBranches = async () => unwrap(await supabase.from("branches").select("*").order("name")) as Branch[];
export const saveBranch = async (b: Partial<Branch>) =>
  unwrap(await (b.id ? supabase.from("branches").update(b).eq("id", b.id) : supabase.from("branches").insert(b)).select().single()) as Branch;
export const deleteBranch = async (id: string) => unwrap(await supabase.from("branches").delete().eq("id", id));

export const listDepartments = async () => unwrap(await supabase.from("departments").select("*").order("name")) as Department[];
export const saveDepartment = async (d: Partial<Department>) =>
  unwrap(await (d.id ? supabase.from("departments").update(d).eq("id", d.id) : supabase.from("departments").insert(d)).select().single()) as Department;
export const deleteDepartment = async (id: string) => unwrap(await supabase.from("departments").delete().eq("id", id));

export const listPositions = async () => unwrap(await supabase.from("positions").select("*").order("name")) as Position[];
export const savePosition = async (p: Partial<Position>) =>
  unwrap(await (p.id ? supabase.from("positions").update(p).eq("id", p.id) : supabase.from("positions").insert(p)).select().single()) as Position;
export const deletePosition = async (id: string) => unwrap(await supabase.from("positions").delete().eq("id", id));

export const listShifts = async () => unwrap(await supabase.from("shifts").select("*").order("start_time")) as Shift[];
export const saveShift = async (s: Partial<Shift>) => {
  const { is_overnight: _ignored, ...rest } = s;
  void _ignored;
  return unwrap(await (s.id ? supabase.from("shifts").update(rest).eq("id", s.id) : supabase.from("shifts").insert(rest)).select().single()) as Shift;
};
export const deleteShift = async (id: string) => unwrap(await supabase.from("shifts").delete().eq("id", id));

export const listHolidays = async (year?: number) => {
  let q = supabase.from("holidays").select("*").order("holiday_date");
  if (year) q = q.gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`);
  return unwrap(await q) as Holiday[];
};
export const saveHolidays = async (h: Holiday[]) => unwrap(await supabase.from("holidays").upsert(h).select()) as Holiday[];
export const deleteHoliday = async (date: string) => unwrap(await supabase.from("holidays").delete().eq("holiday_date", date));

export const getSettings = async () =>
  (unwrap(await supabase.from("settings").select("data").eq("id", 1).single()) as { data: AppSettings }).data;
export const saveSettings = async (data: AppSettings) =>
  unwrap(await supabase.from("settings").update({ data }).eq("id", 1));
