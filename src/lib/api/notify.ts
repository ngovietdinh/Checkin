import { supabase, unwrap } from "./client";
import type { Announcement, Notification } from "../types";

export const listNotifications = async (limit = 100) =>
  unwrap(await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit)) as Notification[];

export async function unreadCount() {
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export const markRead = async (ids: string[]) =>
  unwrap(await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids));

export const markAllRead = async () =>
  unwrap(await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null));

/** Nhận thông báo mới theo thời gian thực */
export function subscribeNotifications(userId: string, cb: (n: Notification) => void) {
  const ch = supabase.channel("notif-" + userId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (p) => cb(p.new as Notification))
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

/** Theo dõi thay đổi chấm công (cho bảng điều khiển) */
export function subscribeAttendance(cb: () => void) {
  const ch = supabase.channel("att-" + Math.random().toString(36).slice(2))
    .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => cb())
    .subscribe();
  return () => { supabase.removeChannel(ch); };
}

export const listAnnouncements = async () =>
  unwrap(await supabase.from("announcements").select("*").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(200)) as Announcement[];

export const createAnnouncement = async (a: Partial<Announcement>) =>
  unwrap(await supabase.from("announcements").insert(a).select().single()) as Announcement;
export const updateAnnouncement = async (id: string, patch: Partial<Announcement>) =>
  unwrap(await supabase.from("announcements").update(patch).eq("id", id));
export const deleteAnnouncement = async (id: string) => unwrap(await supabase.from("announcements").delete().eq("id", id));

export async function savePushSubscription(sub: PushSubscriptionJSON, userId: string) {
  unwrap(await supabase.from("push_subscriptions").upsert({
    user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys?.p256dh, auth: sub.keys?.auth, user_agent: navigator.userAgent,
  }, { onConflict: "endpoint" }));
}

export async function deletePushSubscription(endpoint: string) {
  unwrap(await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint));
}
