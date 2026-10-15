import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth";
import TaskForm from "@/components/TaskForm";
import TaskItem from "@/components/TaskItem";
import { Button, Empty, ErrorBox, Loading, Tabs } from "@/components/ui";
import * as workApi from "@/lib/api/work";
import { useAsync } from "@/lib/hooks";

export default function Tasks() {
  const { me } = useAuth();
  const [tab, setTab] = useState<"open" | "assigned" | "done">("open");
  const [form, setForm] = useState(false);
  const mine = useAsync(() => workApi.listTasks({ assigneeId: me!.id }), [me?.id]);
  const created = useAsync(() => workApi.listTasks({ createdBy: me!.id }), [me?.id]);

  const rows = useMemo(() => {
    if (tab === "assigned") return (created.data ?? []).filter((t) => t.assignee_id !== me!.id);
    const list = mine.data ?? [];
    return tab === "open" ? list.filter((t) => t.status === "todo" || t.status === "doing")
      .sort((a, b) => (a.due_at ?? "9") .localeCompare(b.due_at ?? "9")) : list.filter((t) => t.status === "done" || t.status === "cancelled");
  }, [tab, mine.data, created.data, me]);

  const loading = mine.loading || created.loading;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Công việc</h1>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm(true)}>Thêm việc</Button>
      </div>
      <Tabs value={tab} onChange={setTab} items={[
        { value: "open", label: "Cần làm", count: (mine.data ?? []).filter((t) => t.status === "todo" || t.status === "doing").length },
        { value: "done", label: "Đã xong" },
        { value: "assigned", label: "Tôi đã giao" },
      ]} />
      {mine.error ? <ErrorBox error={mine.error} /> : loading ? <Loading /> : rows.length === 0 ? <Empty text="Không có công việc" /> : (
        <div className="space-y-2">{rows.map((t) => <TaskItem key={t.id} t={t} showAssignee={tab === "assigned"} />)}</div>
      )}
      <TaskForm open={form} onClose={() => setForm(false)} onSaved={() => { mine.reload(true); created.reload(true); }} />
    </div>
  );
}
