// Đăng ký nhận thông báo đẩy (Web Push) trên điện thoại / máy tính
import { config } from "./config";
import * as notifyApi from "./api/notify";

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!config.vapidPublicKey;

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function pushStatus(): Promise<"unsupported" | "denied" | "on" | "off"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export async function enablePush(userId: string) {
  if (!pushSupported()) throw new Error("Thiết bị/trình duyệt chưa hỗ trợ thông báo đẩy. Trên iPhone hãy \"Thêm vào màn hình chính\" rồi mở từ biểu tượng.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Bạn chưa cho phép thông báo.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) });
  }
  await notifyApi.savePushSubscription(sub.toJSON(), userId);
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await notifyApi.deletePushSubscription(sub.endpoint).catch(() => undefined);
    await sub.unsubscribe();
  }
}
