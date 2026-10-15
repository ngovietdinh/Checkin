import { Check, Clock, Paperclip, X } from "lucide-react";
import { useRefData } from "@/app/refdata";
import { Badge } from "./ui";
import * as storageApi from "@/lib/api/storage";
import { fmtDate, fmtDateTime, hhmm, num } from "@/lib/format";
import { REQUEST_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/labels";
import type { LeaveRequest } from "@/lib/types";
import type { ReactNode } from "react";

const STEP_LABEL = { direct_manager: "Quản lý trực tiếp", department_manager: "Trưởng phòng", hr: "Nhân sự", swap_partner: "Đồng nghiệp đổi ca" };

export function requestSummary(r: LeaveRequest) {
  const range = r.start_date === r.end_date ? fmtDate(r.start_date) : `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`;
  const parts = [range];
  if (r.half_day) parts.push(r.half_day === "am" ? "buổi sáng" : "buổi chiều");
  if (r.days) parts.push(`${num(r.days)} ngày`);
  if (r.type === "ot") parts.push(`${r.start_time ? hhmm(r.start_time) + "–" + hhmm(r.end_time) + " · " : ""}${num(r.hours)} giờ`);
  return parts.join(" · ");
}

export default function RequestCard({ r, showEmployee, actions }: { r: LeaveRequest; showEmployee?: boolean; actions?: ReactNode }) {
  const { personName } = useRefData();
  const p = r.payload as Record<string, string | undefined>;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showEmployee && <div className="text-sm font-semibold">{personName(r.employee_id)}</div>}
          <div className="font-medium">{REQUEST_LABEL[r.type]}</div>
          <div className="text-sm text-slate-500">{requestSummary(r)}</div>
        </div>
        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
      </div>
      {r.reason && <p className="mt-2 whitespace-pre-line text-sm">{r.reason}</p>}
      {r.type === "forgot_checkin" && (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Giờ vào: <b>{p.check_in_at ? fmtDateTime(p.check_in_at) : "—"}</b> · Giờ ra: <b>{p.check_out_at ? fmtDateTime(p.check_out_at) : "—"}</b></p>
      )}
      {r.type === "shift_swap" && <p className="mt-1 text-sm">Đổi ca với: <b>{personName(p.partner_id)}</b></p>}
      {r.type === "device_change" && <p className="mt-1 text-sm">Thiết bị mới: <b>{p.device_label ?? "?"}</b></p>}
      {r.attachment && (
        <button type="button" className="link mt-2 inline-flex items-center gap-1 text-sm"
          onClick={async () => window.open(await storageApi.signedUrl("attachments", r.attachment!), "_blank")}>
          <Paperclip className="h-4 w-4" />{storageApi.fileName(r.attachment)}
        </button>
      )}
      <ol className="mt-3 space-y-1.5 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
        {r.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            {s.action === "approved" ? <Check className="h-4 w-4 text-emerald-600" /> : s.action === "rejected" ? <X className="h-4 w-4 text-red-600" />
              : <Clock className={i === r.current_step && r.status === "pending" ? "h-4 w-4 text-amber-500" : "h-4 w-4 text-slate-300"} />}
            <div>
              <span className="font-medium">{STEP_LABEL[s.type]}</span>
              {s.approver_id && <span className="text-slate-500"> · {personName(s.approver_id)}</span>}
              {s.by && <span className="text-slate-500"> — {personName(s.by)} lúc {fmtDateTime(s.at)}</span>}
              {s.comment && <div className="italic text-slate-500">“{s.comment}”</div>}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2 text-[11px] text-slate-400">Gửi lúc {fmtDateTime(r.created_at)}</div>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
