import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/auth";
import RequestCard from "@/components/RequestCard";
import { Button, Empty, ErrorBox, Loading, Tabs, useUi } from "@/components/ui";
import * as requestsApi from "@/lib/api/requests";
import { useAsync } from "@/lib/hooks";
import type { RequestStatus } from "@/lib/types";

export default function Requests() {
  const { me } = useAuth();
  const ui = useUi();
  const [tab, setTab] = useState<RequestStatus | "all">("all");
  const list = useAsync(() => requestsApi.listRequests({ employeeId: me!.id }), [me?.id]);
  const rows = (list.data ?? []).filter((r) => tab === "all" || r.status === tab);

  const cancel = async (id: string) => {
    if (!(await ui.confirm({ title: "Huỷ đơn?", message: "Đơn sẽ không còn hiệu lực.", danger: true, confirmText: "Huỷ đơn" }))) return;
    try { await requestsApi.cancelRequest(id); ui.toast("Đã huỷ đơn"); list.reload(true); } catch (e) { ui.error(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Đơn từ của tôi</h1>
        <Link to="/requests/new"><Button icon={<Plus className="h-4 w-4" />}>Tạo đơn</Button></Link>
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: "all", label: "Tất cả" },
        { value: "pending", label: "Chờ duyệt", count: list.data?.filter((r) => r.status === "pending").length },
        { value: "approved", label: "Đã duyệt" },
        { value: "rejected", label: "Từ chối" },
      ]} />
      {list.error ? <ErrorBox error={list.error} onRetry={() => list.reload()} /> : list.loading ? <Loading /> : rows.length === 0 ? <Empty text="Chưa có đơn nào" /> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} actions={r.status === "pending" && (
              <Button size="sm" variant="secondary" onClick={() => cancel(r.id)}>Huỷ đơn</Button>
            )} />
          ))}
        </div>
      )}
    </div>
  );
}
