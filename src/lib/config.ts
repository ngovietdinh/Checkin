// Cấu hình lúc chạy (public/config.js) ưu tiên hơn biến lúc build (.env)
interface RuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  vapidPublicKey?: string;
  loginEmailDomain?: string;
}

const runtime: RuntimeConfig = (window as unknown as { APP_CONFIG?: RuntimeConfig }).APP_CONFIG ?? {};

export const config = {
  supabaseUrl: runtime.supabaseUrl || import.meta.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: runtime.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY || "",
  vapidPublicKey: runtime.vapidPublicKey || import.meta.env.VITE_VAPID_PUBLIC_KEY || "",
  loginEmailDomain: runtime.loginEmailDomain || import.meta.env.VITE_LOGIN_EMAIL_DOMAIN || "nv.local",
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
