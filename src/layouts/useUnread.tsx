import { useEffect, useState } from "react";
import * as notifyApi from "@/lib/api/notify";
import { useAuth } from "@/app/auth";
import { useUi } from "@/components/ui";
import { useInterval } from "@/lib/hooks";

/** Số thông báo chưa đọc + hiện thông báo nổi khi có thông báo mới */
export function useUnread() {
  const { userId } = useAuth();
  const { toast } = useUi();
  const [count, setCount] = useState(0);
  const refresh = () => notifyApi.unreadCount().then(setCount).catch(() => undefined);
  useEffect(() => {
    if (!userId) return;
    refresh();
    return notifyApi.subscribeNotifications(userId, (n) => {
      setCount((c) => c + 1);
      toast(<span><b>{n.title}</b>{n.body ? <><br />{n.body}</> : null}</span>, "info");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  useInterval(refresh, 60_000);
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener("notifications-read", h);
    return () => window.removeEventListener("notifications-read", h);
  }, []);
  return count;
}
