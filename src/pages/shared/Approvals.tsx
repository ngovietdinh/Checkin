import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import RequestCard from "@/components/RequestCard";
import { Button, Empty, ErrorBox, Field, Loading, Modal, PageHeader, SearchSelect, Select, Tabs, Textarea, useUi } from "@/components/ui";
import * as requestsApi from "@/lib/api/requests";
import { dayjs } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { REQUEST_LABEL } from "@/lib/labels";
import type { LeaveRequest, RequestType } from "@/lib/types";

/** Duyệt đơn: dùng chung cho app nhân viên (quản lý duyệt trên điện thoại) và trang quản lý */
export default function Approvals({ admin }: { admin?: boolean }) {
  const { me, isHr, isAdmin } = useAuth();
  const { people } = useRefData();
  const ui = useUi();
  const [tab, setTab] = useState<"mine" | "pending" | "history">("mine");
  const [type, setType] = useState<RequestType | "">("");
  const [emp, setEmp] = useState<string | null>(null);
  const [decide, setDecide] = useState<{ r: LeaveRequest; approve: boolean } | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const from = dayjs().subtract(90, "day").format("YYYY-MM-DD");
  const list = useAsync(() => requestsApi.listRequests(tab === "history" ? { from } : { status: "pending" }), [tab]);

  const canDecide = (r: LeaveRequest) => {
    if (r.status !== "pending") return false;
    if (r.employee_id === me!.id && !isAdmin) return false;
    const step = r.steps[r.current_step];
    return isAdmin || step?.approver_id === me!.id || (!step?.approver_id && isHr);
  };

  const rows = useMemo(() => (list.data ?? [])
    .filter((r) => tab !== "mine" || canDecide(r))
    .filter((r) => tab === "history" || r.employee_id !== me!.id)
    .filter((r) => !type || r.type === type)
    .filter((r) => !emp || r.employee_id === emp),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  [list.data, tab, type, emp]);
  const mineCount = (list.data ?? []).filter(canDecide).length;

  const submit = async () => {
    if (!decide) return;
    setBusy(true);
    try {
      await requestsApi.decideRequest(decide.r.id, decide.approve, comment);
      ui.toast(decide.approve ? "Đã duyệt" : "Đã từ chối");
      setDecide(null);
      setComment("");
      list.reload(true);
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  const approveAll = async () => {
    const targets = rows.filter(canDecide);
    if (!(await ui.confirm({ title: `Duyệt ${targets.length} đơn?`, message: "Tất cả đơn đang hiển thị sẽ được duyệt ở bước hiện tại." }))) return;
    let ok = 0;
    for (const r of targets) { try { await requestsApi.decideRequest(r.id, true); ok++; } catch { /* bỏ qua */ } }
    ui.toast(`Đã duyệt ${ok}/${targets.length} đơn`);
    list.reload(true);
  };

  return (
    <div className="space-y-4">
      {admin ? <PageHeader title="Duyệt đơn" subtitle="Nghỉ phép, tăng ca, giải trình, đổi ca, đổi thiết bị" />
        : <h1 className="text-xl font-semibold">Duyệt đơn</h1>}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} items={[
          { value: "mine", label: "Chờ tôi duyệt", count: tab === "history" ? undefined : mineCount },
          { value: "pending", label: "Tất cả đang chờ" },
          { value: "history", label: "90 ngày qua" },
        ]} />
        <Select value={type} onChange={(e) => setType(e.target.value as RequestType | "")} className="w-auto">
          <option value="">Mọi loại đơn</option>
          {Object.entries(REQUEST_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div className="w-60"><SearchSelect items={people} value={emp} onChange={setEmp} getLabel={(p) => p.full_name} getSub={(p) => p.code} placeholder="Mọi nhân viên" /></div>
        {tab === "mine" && rows.length > 1 && <Button variant="success" size="sm" onClick={approveAll} icon={<Check className="h-4 w-4" />}>Duyệt tất cả ({rows.length})</Button>}
      </div>
      {list.error ? <ErrorBox error={list.error} onRetry={() => list.reload()} /> : list.loading ? <Loading /> : rows.length === 0 ? <Empty text="Không có đơn nào" /> : (
        <div className={admin ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} showEmployee actions={canDecide(r) && (
              <>
                <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} onClick={() => setDecide({ r, approve: true })}>Duyệt</Button>
                <Button size="sm" variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => setDecide({ r, approve: false })}>Từ chối</Button>
              </>
            )} />
          ))}
        </div>
      )}
      <Modal open={!!decide} onClose={() => setDecide(null)} title={decide?.approve ? "Duyệt đơn" : "Từ chối đơn"} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setDecide(null)}>Huỷ</Button>
          <Button variant={decide?.approve ? "success" : "danger"} loading={busy} onClick={submit}>{decide?.approve ? "Duyệt" : "Từ chối"}</Button>
        </>}>
        <Field label="Ý kiến (tuỳ chọn)"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} autoFocus /></Field>
      </Modal>
    </div>
  );
}
