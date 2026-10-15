import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";

/**
 * Yêu cầu từ pg_cron hợp lệ khi header x-cron-secret khớp:
 *  - biến môi trường CRON_SECRET (nếu có khai báo), hoặc
 *  - mã bí mật lưu trong database (app.config.cron_secret, tự sinh khi cài đặt).
 * Gọi bằng khoá service_role cũng được chấp nhận.
 */
export async function isCronRequest(req: Request, db: SupabaseClient, serviceKey: string): Promise<boolean> {
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer && bearer === serviceKey) return true;
  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const envSecret = Deno.env.get("CRON_SECRET");
  if (envSecret && secret === envSecret) return true;
  const { data } = await db.rpc("verify_cron_secret", { p_secret: secret });
  return data === true;
}
