import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Button, Checkbox, Field, Input, Modal, SearchSelect, Select, Textarea, useUi } from "./ui";
import * as workApi from "@/lib/api/work";
import { dayjs, TZ } from "@/lib/format";
import { PRIORITY_LABEL } from "@/lib/labels";
import type { Task, TaskPriority } from "@/lib/types";

/** Tạo / sửa công việc. Quản lý có thể giao cho nhiều người cùng lúc. */
export default function TaskForm({ open, onClose, task, onSaved }: { open: boolean; onClose: () => void; task?: Task | null; onSaved: () => void }) {
  const { me, isManager } = useAuth();
  const { team } = useRefData();
  const ui = useUi();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [busy, setBusy] = useState(false);
  const candidates = useMemo(() => (isManager ? team.filter((p) => p.active) : team.filter((p) => p.id === me?.id)), [team, isManager, me]);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDesc(task?.description ?? "");
    setAssignees(task ? [task.assignee_id] : [me!.id]);
    setDue(task?.due_at ? dayjs(task.due_at).tz(TZ).format("YYYY-MM-DDTHH:mm") : "");
    setPriority(task?.priority ?? "normal");
  }, [open, task, me]);

  const save = async () => {
    if (!title.trim() || !assignees.length) return;
    setBusy(true);
    try {
      const due_at = due ? dayjs.tz(due, TZ).toISOString() : null;
      if (task) {
        await workApi.saveTask({ id: task.id, title, description: desc, assignee_id: assignees[0], due_at, priority });
      } else {
        await workApi.createTasks(assignees.map((assignee_id) => ({ title, description: desc, assignee_id, created_by: me!.id, due_at, priority })));
      }
      ui.toast(task ? "Đã lưu" : assignees.length > 1 ? `Đã giao việc cho ${assignees.length} người` : "Đã tạo công việc");
      onSaved();
      onClose();
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? "Sửa công việc" : "Giao việc mới"}
      footer={<><Button variant="secondary" onClick={onClose}>Huỷ</Button><Button loading={busy} onClick={save} disabled={!title.trim() || !assignees.length}>Lưu</Button></>}>
      <div className="space-y-3">
        <Field label="Tiêu đề"><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Mô tả"><Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        {isManager && (
          <Field label={task ? "Người thực hiện" : "Người thực hiện (chọn được nhiều)"}>
            <SearchSelect items={candidates.filter((c) => !assignees.includes(c.id) || task)} value={task ? assignees[0] : null}
              onChange={(id) => id && setAssignees(task ? [id] : [...new Set([...assignees, id])])}
              getLabel={(p) => p.full_name} getSub={(p) => p.code} placeholder="Thêm người…" allowClear={false} />
            {!task && (
              <div className="mt-2 flex flex-wrap gap-2">
                {assignees.map((id) => (
                  <Checkbox key={id} checked onChange={() => setAssignees(assignees.filter((x) => x !== id))}
                    label={candidates.find((c) => c.id === id)?.full_name ?? "?"} className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800" />
                ))}
              </div>
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hạn hoàn thành"><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label="Mức ưu tiên">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
