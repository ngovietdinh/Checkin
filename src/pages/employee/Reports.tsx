import { Save, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Badge, Button, Card, Empty, Field, Input, Loading, Textarea, useUi } from "@/components/ui";
import * as workApi from "@/lib/api/work";
import { dayjs, fmtDate, todayStr } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { DailyReport } from "@/lib/types";

export default function Reports() {
  const { me } = useAuth();
  const { personName } = useRefData();
  const ui = useUi();
  const [date, setDate] = useState(todayStr());
  const history = useAsync(() => workApi.listReports({ employeeId: me!.id, from: dayjs().subtract(60, "day").format("YYYY-MM-DD") }), [me?.id]);
  const current = history.data?.find((r) => r.report_date === date) ?? null;
  const [form, setForm] = useState({ done: "", doing: "", issues: "", plan: "" });
  const [busy, setBusy] = useState(false);
  const todayTasks = useAsync(() => workApi.listTasks({ assigneeId: me!.id }), [me?.id]);

  useEffect(() => {
    setForm({ done: current?.done ?? "", doing: current?.doing ?? "", issues: current?.issues ?? "", plan: current?.plan ?? "" });
  }, [current?.id, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const locked = !!current?.reviewed_at;
  const minDate = dayjs().subtract(3, "day").format("YYYY-MM-DD");

  const fillFromTasks = () => {
    const done = (todayTasks.data ?? []).filter((t) => t.completed_at && dayjs(t.completed_at).format("YYYY-MM-DD") === date).map((t) => "- " + t.title);
    const doing = (todayTasks.data ?? []).filter((t) => t.status === "doing").map((t) => `- ${t.title} (${t.progress}%)`);
    setForm((f) => ({ ...f, done: f.done || done.join("\n"), doing: f.doing || doing.join("\n") }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await workApi.saveReport({ employee_id: me!.id, report_date: date, ...form });
      ui.toast("Đã nộp báo cáo");
      history.reload(true);
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Báo cáo công việc</h1>
      <Card title={
        <div className="flex items-center gap-2">
          <span>Báo cáo ngày</span>
          <Input type="date" value={date} min={minDate} max={todayStr()} onChange={(e) => setDate(e.target.value)} className="w-auto py-1" />
        </div>
      } actions={current && <Badge tone={locked ? "green" : "blue"}>{locked ? "Đã nhận xét" : "Đã nộp"}</Badge>}>
        <div className="space-y-3">
          {!locked && <button type="button" className="link text-xs" onClick={fillFromTasks}>Điền nhanh từ danh sách công việc</button>}
          <Field label="Việc đã làm"><Textarea rows={4} value={form.done} disabled={locked} onChange={(e) => setForm({ ...form, done: e.target.value })} /></Field>
          <Field label="Việc đang làm"><Textarea value={form.doing} disabled={locked} onChange={(e) => setForm({ ...form, doing: e.target.value })} /></Field>
          <Field label="Khó khăn / cần hỗ trợ"><Textarea rows={2} value={form.issues} disabled={locked} onChange={(e) => setForm({ ...form, issues: e.target.value })} /></Field>
          <Field label="Kế hoạch ngày mai"><Textarea rows={2} value={form.plan} disabled={locked} onChange={(e) => setForm({ ...form, plan: e.target.value })} /></Field>
          {current?.reviewed_at && <Review r={current} reviewer={personName(current.reviewed_by)} />}
          {!locked && <Button className="w-full" loading={busy} onClick={save} disabled={!form.done.trim()} icon={<Save className="h-4 w-4" />}>{current ? "Cập nhật" : "Nộp báo cáo"}</Button>}
        </div>
      </Card>

      <Card title="Báo cáo gần đây" bodyClass="divide-y divide-slate-100 dark:divide-slate-800">
        {history.loading ? <Loading /> : !history.data?.length ? <Empty /> : history.data.map((r) => (
          <button key={r.id} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm" onClick={() => setDate(r.report_date)}>
            <div className="min-w-0">
              <div className="font-medium">{fmtDate(r.report_date)}</div>
              <div className="truncate text-slate-500">{r.done.split("\n")[0]}</div>
            </div>
            {r.score ? <span className="flex items-center gap-0.5 text-amber-500">{r.score}<Star className="h-4 w-4 fill-current" /></span> : <Badge>Chờ nhận xét</Badge>}
          </button>
        ))}
      </Card>
    </div>
  );
}

function Review({ r, reviewer }: { r: DailyReport; reviewer: string }) {
  return (
    <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
      <div className="flex items-center gap-1 text-amber-500">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={i < (r.score ?? 0) ? "h-4 w-4 fill-current" : "h-4 w-4"} />)}</div>
      {r.manager_comment && <p className="mt-1">{r.manager_comment}</p>}
      <p className="mt-1 text-xs text-slate-500">— {reviewer}</p>
    </div>
  );
}
