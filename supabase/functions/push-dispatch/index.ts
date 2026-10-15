// Gửi thông báo ra ngoài app: Web Push (điện thoại/máy tính), Telegram, Email.
// Được pg_cron gọi mỗi phút (xem migration *_cron.sql), xác thực bằng header x-cron-secret.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, json } from "../_shared/cors.ts";
import { isCronRequest } from "../_shared/cron-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Chấm công <noreply@example.com>";
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

// loại thông báo quan trọng thì gửi thêm email
const EMAIL_TYPES = new Set(["payslip", "request_result", "announcement", "missing_checkout"]);

if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

interface Notif { id: string; user_id: string; type: string; title: string; body: string | null; link: string | null }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  if (!(await isCronRequest(req, db, SERVICE_KEY))) return json({ error: "unauthorized" }, 401);
  const since = new Date(Date.now() - 3600_000).toISOString();

  const { data: pending, error } = await db.from("notifications")
    .select("id, user_id, type, title, body, link")
    .is("push_sent_at", null).gt("created_at", since)
    .order("created_at").limit(500);
  if (error) return json({ error: error.message }, 500);
  if (!pending?.length) return json({ sent: 0 });

  // đánh dấu trước để lần gọi song song không gửi trùng
  const ids = pending.map((n) => n.id);
  const { data: claimed } = await db.from("notifications")
    .update({ push_sent_at: new Date().toISOString() })
    .in("id", ids).is("push_sent_at", null).select("id");
  const claimedIds = new Set((claimed ?? []).map((c) => c.id));
  const items = (pending as Notif[]).filter((n) => claimedIds.has(n.id));
  const userIds = [...new Set(items.map((n) => n.user_id))];

  const [{ data: subs }, { data: emps }, { data: settings }] = await Promise.all([
    db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds),
    db.from("employees").select("id, email, telegram_chat_id").in("id", userIds),
    db.from("settings").select("data").eq("id", 1).single(),
  ]);
  const channels = settings?.data?.notifications ?? {};
  const empMap = new Map((emps ?? []).map((e) => [e.id, e]));

  let pushed = 0, telegram = 0, emailed = 0;
  const dead: string[] = [];

  await Promise.all(items.map(async (n) => {
    const url = n.link ? (APP_URL ? APP_URL + "/#" + n.link : n.link) : APP_URL || "/";

    if (VAPID_PUBLIC && VAPID_PRIVATE) {
      for (const s of (subs ?? []).filter((s) => s.user_id === n.user_id)) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body: n.body ?? "", link: n.link ?? "/", tag: n.type }),
            { TTL: 3600 },
          );
          pushed++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.push(s.id);
          else console.error("web push lỗi", code ?? "", (e as Error).message);
        }
      }
    }

    const emp = empMap.get(n.user_id);
    if (channels.telegram_enabled && TELEGRAM_TOKEN && emp?.telegram_chat_id) {
      const text = `<b>${escapeHtml(n.title)}</b>${n.body ? "\n" + escapeHtml(n.body) : ""}${APP_URL ? `\n<a href="${url}">Mở ứng dụng</a>` : ""}`;
      const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: emp.telegram_chat_id, text, parse_mode: "HTML" }),
      }).catch(() => null);
      if (r?.ok) telegram++;
    }

    if (channels.email_enabled && RESEND_KEY && emp?.email && EMAIL_TYPES.has(n.type)) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: EMAIL_FROM, to: emp.email, subject: n.title,
          html: `<p><b>${escapeHtml(n.title)}</b></p><p>${escapeHtml(n.body ?? "")}</p>${APP_URL ? `<p><a href="${url}">Mở ứng dụng chấm công</a></p>` : ""}`,
        }),
      }).catch(() => null);
      if (r?.ok) emailed++;
    }
  }));

  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return json({ notifications: items.length, pushed, telegram, emailed, removed: dead.length });
});

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
