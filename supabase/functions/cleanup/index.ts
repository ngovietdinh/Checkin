// Dọn dẹp định kỳ (pg_cron gọi mỗi ngày): xoá ảnh selfie cũ hơn số ngày cấu hình
// (settings.attendance.selfie_retention_days, 0 = giữ mãi) để tiết kiệm dung lượng lưu trữ.
// Ảnh nằm theo đường dẫn selfies/{user_id}/{YYYY-MM-DD}/...
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!(CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET) && auth !== SERVICE_KEY) {
    return json({ error: "unauthorized" }, 401);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: s } = await db.from("settings").select("data").eq("id", 1).single();
  const days = Number(s?.data?.attendance?.selfie_retention_days ?? 0);
  if (!days) return json({ skipped: "selfie_retention_days = 0" });
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const bucket = db.storage.from("selfies");
  let removed = 0;
  const { data: users, error } = await bucket.list("", { limit: 10000 });
  if (error) return json({ error: error.message }, 500);
  for (const u of users ?? []) {
    if (u.id !== null) continue; // chỉ xét thư mục
    const { data: dates } = await bucket.list(u.name, { limit: 10000 });
    for (const d of dates ?? []) {
      if (d.id !== null || !/^\d{4}-\d{2}-\d{2}$/.test(d.name) || d.name >= cutoff) continue;
      const prefix = `${u.name}/${d.name}`;
      const { data: files } = await bucket.list(prefix, { limit: 1000 });
      const paths = (files ?? []).filter((f) => f.id !== null).map((f) => `${prefix}/${f.name}`);
      if (paths.length) {
        const { error: e } = await bucket.remove(paths);
        if (!e) removed += paths.length;
      }
    }
  }
  return json({ cutoff, removed });
});
