import clsx from "clsx";
import { BellRing, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { Button, Card, Empty, ErrorBox, Loading, useUi } from "@/components/ui";
import * as notifyApi from "@/lib/api/notify";
import { fmtRelative } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { enablePush, pushStatus } from "@/lib/push";

export default function Notifications() {
  const { userId } = useAuth();
  const ui = useUi();
  const nav = useNavigate();
  const list = useAsync(() => notifyApi.listNotifications(), []);
  const [push, setPush] = useState<string>("off");
  useEffect(() => { pushStatus().then(setPush); }, []);

  const readAll = async () => {
    await notifyApi.markAllRead();
    window.dispatchEvent(new Event("notifications-read"));
    list.reload(true);
  };

  const open = async (id: string, link: string | null, read: boolean) => {
    if (!read) { await notifyApi.markRead([id]).catch(() => undefined); window.dispatchEvent(new Event("notifications-read")); }
    if (link) nav(link); else list.reload(true);
  };

  const turnOn = async () => {
    try { await enablePush(userId!); setPush("on"); ui.toast("Đã bật thông báo trên thiết bị này"); } catch (e) { ui.error(e); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Thông báo</h1>
        <Button size="sm" variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={readAll}>Đọc tất cả</Button>
      </div>
      {push === "off" && (
        <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
          <BellRing className="h-5 w-5 shrink-0" />
          <div className="flex-1">Bật thông báo để được nhắc giờ chấm công, kết quả duyệt đơn… ngay trên điện thoại.</div>
          <Button size="sm" onClick={turnOn}>Bật</Button>
        </div>
      )}
      {list.error ? <ErrorBox error={list.error} /> : list.loading ? <Loading /> : !list.data?.length ? <Empty text="Không có thông báo" /> : (
        <Card bodyClass="divide-y divide-slate-100 dark:divide-slate-800">
          {list.data.map((n) => (
            <button key={n.id} onClick={() => open(n.id, n.link, !!n.read_at)} className={clsx("flex w-full gap-3 px-4 py-3 text-left", !n.read_at && "bg-brand-50/50 dark:bg-brand-900/10")}>
              <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand-600")} />
              <div className="min-w-0 flex-1">
                <div className={clsx("text-sm", !n.read_at && "font-semibold")}>{n.title}</div>
                {n.body && <div className="text-sm text-slate-500">{n.body}</div>}
                <div className="mt-0.5 text-xs text-slate-400">{fmtRelative(n.created_at)}</div>
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
