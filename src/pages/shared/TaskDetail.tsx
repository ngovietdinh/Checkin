import { ArrowLeft, Paperclip, Pencil, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import TaskForm from "@/components/TaskForm";
import { Avatar, Badge, Button, Card, ErrorBox, Loading, Textarea, useUi } from "@/components/ui";
import * as storageApi from "@/lib/api/storage";
import * as workApi from "@/lib/api/work";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { PRIORITY_LABEL, PRIORITY_TONE, TASK_STATUS_LABEL } from "@/lib/labels";
import type { TaskStatus } from "@/lib/types";

export default function TaskDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const ui = useUi();
  const { me, isHr } = useAuth();
  const { person, personName } = useRefData();
  const task = useAsync(() => workApi.getTask(id!), [id]);
  const comments = useAsync(() => workApi.listComments(id!), [id]);
  const [text, setText] = useState("");
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  if (task.error) return <ErrorBox error={task.error} />;
  if (!task.data) return <Loading />;
  const t = task.data;
  const canEdit = t.created_by === me!.id || isHr;
  const canWork = t.assignee_id === me!.id || canEdit;
  const assignee = person(t.assignee_id);

  const update = async (patch: Parameters<typeof workApi.saveTask>[0]) => {
    try {
      task.setData(await workApi.saveTask({ id: t.id, ...patch }));
    } catch (e) { ui.error(e); }
  };

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await workApi.addComment(t.id, me!.id, text.trim()); setText(""); comments.reload(true); } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  const attach = async (f: File | undefined) => {
    if (!f) return;
    try {
      const path = `${me!.id}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
      await storageApi.upload("attachments", path, f);
      await update({ attachments: [...t.attachments, path] });
    } catch (e) { ui.error(e); }
  };

  const remove = async () => {
    if (!(await ui.confirm({ title: "Xoá công việc?", danger: true, confirmText: "Xoá" }))) return;
    try { await workApi.deleteTask(t.id); nav(-1); } catch (e) { ui.error(e); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => nav(-1)} className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Quay lại"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="flex-1 text-xl font-semibold">{t.title}</h1>
        {canEdit && <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(true)}>Sửa</Button>}
        {canEdit && <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={remove} />}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><div className="label">Người thực hiện</div><div className="flex items-center gap-2">{assignee && <Avatar name={assignee.full_name} url={assignee.avatar_url} size={24} />}{personName(t.assignee_id)}</div></div>
          <div><div className="label">Người giao</div>{personName(t.created_by)}</div>
          <div><div className="label">Hạn</div>{t.due_at ? fmtDateTime(t.due_at) : "Không có"}</div>
          <div><div className="label">Ưu tiên</div><Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge></div>
        </div>
        {t.description && <p className="mt-4 whitespace-pre-line text-sm">{t.description}</p>}

        {canWork && (
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <div className="flex flex-wrap gap-2">
              {(["todo", "doing", "done", "cancelled"] as TaskStatus[]).map((s) => (
                <Button key={s} size="sm" variant={t.status === s ? "primary" : "secondary"} onClick={() => update({ status: s })}>{TASK_STATUS_LABEL[s]}</Button>
              ))}
            </div>
            <label className="block text-sm">
              <span className="label">Tiến độ: {t.progress}%</span>
              <input type="range" min={0} max={100} step={10} value={t.progress} className="w-full accent-brand-700"
                onChange={(e) => task.setData({ ...t, progress: Number(e.target.value) })}
                onMouseUp={(e) => update({ progress: Number((e.target as HTMLInputElement).value), status: t.status === "todo" ? "doing" : t.status })}
                onTouchEnd={(e) => update({ progress: Number((e.target as HTMLInputElement).value), status: t.status === "todo" ? "doing" : t.status })} />
            </label>
          </div>
        )}

        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="label">Tệp đính kèm</div>
          {t.attachments.map((a) => (
            <button key={a} className="link flex items-center gap-1 text-sm" onClick={async () => window.open(await storageApi.signedUrl("attachments", a), "_blank")}>
              <Paperclip className="h-4 w-4" />{storageApi.fileName(a)}
            </button>
          ))}
          {canWork && (
            <label className="inline-flex cursor-pointer items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
              <Paperclip className="h-4 w-4" /> Thêm tệp
              <input type="file" className="hidden" onChange={(e) => attach(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </Card>

      <Card title="Trao đổi">
        <div className="space-y-3">
          {(comments.data ?? []).map((c) => {
            const p = person(c.author_id);
            return (
              <div key={c.id} className="flex gap-2">
                <Avatar name={p?.full_name ?? "?"} url={p?.avatar_url} size={30} />
                <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
                  <div className="text-xs font-medium">{p?.full_name} <span className="font-normal text-slate-500">· {fmtRelative(c.created_at)}</span></div>
                  <div className="whitespace-pre-line">{c.body}</div>
                </div>
              </div>
            );
          })}
          {comments.data?.length === 0 && <p className="text-sm text-slate-500">Chưa có trao đổi.</p>}
          <div className="flex gap-2">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Viết bình luận…" />
            <Button onClick={send} loading={busy} icon={<Send className="h-4 w-4" />} aria-label="Gửi" />
          </div>
        </div>
      </Card>
      <TaskForm open={edit} onClose={() => setEdit(false)} task={t} onSaved={() => task.reload(true)} />
      <p className="text-center text-xs text-slate-400">Tạo lúc {fmtDateTime(t.created_at)}{t.completed_at && ` · Hoàn thành ${fmtDateTime(t.completed_at)}`}</p>
    </div>
  );
}
