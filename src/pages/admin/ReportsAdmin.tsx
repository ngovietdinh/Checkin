import { Star } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Avatar, Badge, Button, Card, DateNav, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Select, Tabs, Textarea, useUi } from "@/components/ui";
import * as workApi from "@/lib/api/work";
import { todayStr } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { DailyReport } from "@/lib/types";

export default function ReportsAdmin() {
  const { me } = useAuth();
  const { team, departments, person, deptName } = useRefData();
  const ui = useUi();
  const [date, setDate] = useState(todayStr());
  const [dept, setDept] = useState("");
  const [tab, setTab] = useState<"submitted" | "missing">("submitted");
  const [review, setReview] = useState<DailyReport | null>(null);
  const [score, setScore] = useState(4);
  const [comment, setComment] = useState("");
  const list = useAsync(() => workApi.listReports({ from: date, to: date }), [date]);

  const members = useMemo(() => team.filter((p) => p.active && p.id !== me?.id && (!dept || p.department_id === dept)), [team, dept, me]);
  const reports = (list.data ?? []).filter((r) => members.some((m) => m.id === r.employee_id));
  const missing = members.filter((m) => !reports.some((r) => r.employee_id === m.id));

  const save = async () => {
    if (!review) return;
    try { await workApi.reviewReport(review.id, score, comment); ui.toast("Đã nhận xét"); setReview(null); list.reload(true); } catch (e) { ui.error(e); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Báo cáo công việc ngày" actions={<>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <DateNav value={date} onChange={setDate} />
      </>} />
      <Tabs value={tab} onChange={setTab} items={[
        { value: "submitted", label: `Đã nộp (${reports.length})` },
        { value: "missing", label: `Chưa nộp (${missing.length})` },
      ]} />
      {list.error ? <ErrorBox error={list.error} /> : list.loading ? <Loading /> : tab === "missing" ? (
        missing.length === 0 ? <Empty text="Tất cả đã nộp báo cáo" /> : (
          <Card bodyClass="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {missing.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm"><Avatar name={m.full_name} url={m.avatar_url} size={28} /><div><div>{m.full_name}</div><div className="text-xs text-slate-500">{deptName(m.department_id)}</div></div></div>
            ))}
          </Card>
        )
      ) : reports.length === 0 ? <Empty text="Chưa có báo cáo" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reports.map((r) => {
            const p = person(r.employee_id);
            return (
              <Card key={r.id} title={<span className="flex items-center gap-2"><Avatar name={p?.full_name ?? "?"} url={p?.avatar_url} size={28} />{p?.full_name}</span>}
                actions={r.score ? <span className="flex items-center gap-0.5 text-amber-500">{r.score}<Star className="h-4 w-4 fill-current" /></span>
                  : <Button size="sm" onClick={() => { setReview(r); setScore(4); setComment(""); }}>Nhận xét</Button>}>
                <Block title="Đã làm" text={r.done} />
                <Block title="Đang làm" text={r.doing} />
                <Block title="Khó khăn" text={r.issues} warn />
                <Block title="Kế hoạch" text={r.plan} />
                {r.manager_comment && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm dark:bg-amber-950/30">💬 {r.manager_comment}</p>}
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!review} onClose={() => setReview(null)} title="Nhận xét báo cáo" size="sm"
        footer={<><Button variant="secondary" onClick={() => setReview(null)}>Huỷ</Button><Button onClick={save}>Lưu</Button></>}>
        <div className="space-y-3">
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setScore(n)} aria-label={`${n} sao`}><Star className={n <= score ? "h-8 w-8 fill-amber-400 text-amber-400" : "h-8 w-8 text-slate-300"} /></button>
            ))}
          </div>
          <Field label="Nhận xét"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Block({ title, text, warn }: { title: string; text: string; warn?: boolean }) {
  if (!text?.trim()) return null;
  return (
    <div className="mb-2">
      <div className="text-xs font-semibold uppercase text-slate-500">{title} {warn && <Badge tone="amber">cần hỗ trợ</Badge>}</div>
      <p className="whitespace-pre-line text-sm">{text}</p>
    </div>
  );
}
