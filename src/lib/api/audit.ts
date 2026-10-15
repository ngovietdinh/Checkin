import { supabase, unwrap } from "./client";
import type { AuditLog } from "../types";

export async function listAudit(f: { entity?: string; from?: string; to?: string; page?: number }) {
  const size = 50;
  const page = f.page ?? 0;
  let q = supabase.from("audit_logs").select("*", { count: "exact" });
  if (f.entity) q = q.eq("entity", f.entity);
  if (f.from) q = q.gte("created_at", f.from);
  if (f.to) q = q.lte("created_at", f.to + "T23:59:59");
  const res = await q.order("created_at", { ascending: false }).range(page * size, page * size + size - 1);
  return { rows: unwrap(res) as AuditLog[], total: res.count ?? 0, size };
}
