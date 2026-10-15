import { Download, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useRefData } from "@/app/refdata";
import TaskForm from "@/components/TaskForm";
import TaskItem from "@/components/TaskItem";
import { Button, Checkbox, ErrorBox, Loading, PageHeader, SearchSelect, Select, Stat } from "@/components/ui";
import * as workApi from "@/lib/api/work";
import { exportXlsx } from "@/lib/excel";
import { fmtDateTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import type { TaskStatus } from "@/lib/types";

export default function TasksAdmin() {
  const { team, departments, person, personName } = useRefData();
  const [emp, setEmp] = useState<string | null>(null);
  const [dept, setDept] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [form, setForm] = useState(false);
  const list = useAsync(() => workApi.listTasks({ assigneeId: emp ?? undefined }), [emp]);

  const now = Date.now();
  const isOverdue = (t: { due_at: string | null; status: TaskStatus }) => !!t.due_at && Date.parse(t.due_at) < now && (t.status === "todo" || t.status === "doing");
  const rows = useMemo(() => (list.data ?? [])
    .filter((t) => !dept || person(t.assignee_id)?.department_id === dept)
    .filter((t) => !overdue || isOverdue(t)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [list.data, dept, overdue, person]);
  const col = (s: TaskStatus) => rows.filter((t) => t.status === s);

  const doExport = () => exportXlsx("cong-viec", [{
    name: "Công việc",
    columns: [
      { header: "Tiêu đề", key: "title", width: 40 }, { header: "Người thực hiện", key: "assignee", width: 22 }, { header: "Người giao", key: "creator", width: 22 },
      { header: "Ưu tiên", key: "priority", width: 12 }, { header: "Trạng thái", key: "status", width: 12 }, { header: "Tiến độ %", key: "progress", width: 9 },
      { header: "Hạn", key: "due", width: 18 }, { header: "Hoàn thành", key: "done", width: 18 },
    ],
    rows: rows.map((t) => ({ title: t.title, assignee: personName(t.assignee_id), creator: personName(t.created_by), priority: PRIORITY_LABEL[t.priority],
      status: TASK_STATUS_LABEL[t.status], progress: t.progress, due: t.due_at ? fmtDateTime(t.due_at) : "", done: t.completed_at ? fmtDateTime(t.completed_at) : "" })),
  }]);

  return (
    <div className="space-y-4">
      <PageHeader title="Giao việc" subtitle="Theo dõi tiến độ công việc của nhóm"
        actions={<>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={doExport}>Xuất Excel</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm(true)}>Giao việc</Button>
        </>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cần làm" value={col("todo").length} tone="gray" />
        <Stat label="Đang làm" value={col("doing").length} tone="blue" />
        <Stat label="Hoàn thành" value={col("done").length} tone="green" />
        <Stat label="Quá hạn" value={rows.filter(isOverdue).length} tone="red" onClick={() => setOverdue(!overdue)} active={overdue} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-60"><SearchSelect items={team} value={emp} onChange={setEmp} getLabel={(p) => p.full_name} getSub={(p) => p.code} placeholder="Mọi nhân viên" /></div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Checkbox checked={overdue} onChange={setOverdue} label="Chỉ việc quá hạn" />
      </div>
      {list.error ? <ErrorBox error={list.error} /> : list.loading ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-3">
          {(["todo", "doing", "done"] as TaskStatus[]).map((s) => (
            <div key={s} className="rounded-2xl bg-slate-100/70 p-3 dark:bg-slate-900/60">
              <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">{TASK_STATUS_LABEL[s]}<span className="text-slate-500">{col(s).length}</span></div>
              <div className="space-y-2">{col(s).slice(0, 100).map((t) => <TaskItem key={t.id} t={t} base="/admin/tasks" showAssignee />)}</div>
            </div>
          ))}
        </div>
      )}
      <TaskForm open={form} onClose={() => setForm(false)} onSaved={() => list.reload(true)} />
    </div>
  );
}
