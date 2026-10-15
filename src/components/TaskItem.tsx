import clsx from "clsx";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { useRefData } from "@/app/refdata";
import { Avatar, Badge } from "./ui";
import { fmtDateTime } from "@/lib/format";
import { PRIORITY_LABEL, PRIORITY_TONE, TASK_STATUS_LABEL, TASK_STATUS_TONE } from "@/lib/labels";
import type { Task } from "@/lib/types";

export default function TaskItem({ t, base = "/tasks", showAssignee }: { t: Task; base?: string; showAssignee?: boolean }) {
  const { person } = useRefData();
  const overdue = t.due_at && t.status !== "done" && t.status !== "cancelled" && Date.parse(t.due_at) < Date.now();
  const p = person(t.assignee_id);
  return (
    <Link to={`${base}/${t.id}`} className="card block p-3 transition hover:border-brand-300">
      <div className="flex items-start justify-between gap-2">
        <div className={clsx("font-medium", t.status === "done" && "text-slate-400 line-through")}>{t.title}</div>
        <Badge tone={TASK_STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {showAssignee && p && <span className="flex items-center gap-1"><Avatar name={p.full_name} url={p.avatar_url} size={18} />{p.full_name}</span>}
        <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
        {t.due_at && <span className={clsx("flex items-center gap-1", overdue && "font-medium text-red-600")}><CalendarClock className="h-3.5 w-3.5" />{fmtDateTime(t.due_at)}{overdue && " (quá hạn)"}</span>}
      </div>
      {t.status === "doing" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-brand-600" style={{ width: `${t.progress}%` }} /></div>
      )}
    </Link>
  );
}
