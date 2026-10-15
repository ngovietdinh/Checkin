// ĐIỂM DUY NHẤT kết nối tới backend.
// Muốn chuyển sang backend khác (vd. API riêng trên VPS) thì chỉ cần viết lại thư mục src/lib/api,
// các trang giao diện không gọi trực tiếp Supabase.
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { config } from "../config";

export const supabase = createClient(config.supabaseUrl || "http://localhost", config.supabaseAnonKey || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "chamcong.auth" },
});

export class ApiError extends Error {
  details?: string;
  constructor(message: string, details?: string) {
    super(message);
    this.details = details;
  }
}

type Result<T> = { data: T | null; error: PostgrestError | { message: string; details?: string } | null };

export function unwrap<T>(res: Result<T>): T {
  if (res.error) throw new ApiError(res.error.message, (res.error as PostgrestError).details ?? undefined);
  return res.data as T;
}

/** Lấy toàn bộ dòng (vượt giới hạn 1000 dòng mỗi lần của PostgREST) */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<Result<T[]>>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = unwrap(await build(from, from + pageSize - 1)) ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  return unwrap(await supabase.rpc(fn, args)) as T;
}
