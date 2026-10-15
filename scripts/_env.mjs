// Đọc cấu hình kết nối cho các script quản trị.
// Ưu tiên biến môi trường, sau đó tới file .env.local ở thư mục gốc.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadDotEnv(".env.local");

export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
export const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const LOGIN_DOMAIN = process.env.LOGIN_EMAIL_DOMAIN || process.env.VITE_LOGIN_EMAIL_DOMAIN || "nv.local";

export function requireEnv(...names) {
  const map = { SUPABASE_URL, ANON_KEY, SERVICE_KEY };
  const missing = names.filter((n) => !map[n]);
  if (missing.length) {
    console.error("Thiếu cấu hình: " + missing.join(", ") +
      "\nĐặt biến môi trường SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY hoặc ghi vào .env.local");
    process.exit(1);
  }
}

export function adminClient() {
  requireEnv("SUPABASE_URL", "SERVICE_KEY");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function loginEmail(code, email) {
  return email ? email.toLowerCase() : `${code.toLowerCase()}@${LOGIN_DOMAIN}`;
}

export function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
