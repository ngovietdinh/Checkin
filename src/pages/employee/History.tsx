import clsx from "clsx";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { Badge, Card, ErrorBox, Loading, MonthPicker, toneClass } from "@/components/ui";
import * as requestsApi from "@/lib/api/requests";
import { dayjs, fmtTime, monthStr, num, todayStr } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { DAY_STATUS, FLAG_LABEL } from "@/lib/labels";
import { loadMonth, timesheetFor } from "@/lib/payroll/loader";
import type { DayResult } from "@/lib/payroll/types";
import type { Attendance } from "@/lib/types";

export default function History() {
  const { me } = useAuth();
  const [month, setMonth] = useState(monthStr());
  const [selected, setSelected] = useState<string | null>(todayStr());
  const data = useAsync(() => loadMonth(month, { employees: [me!], withPay: false }), [month, me?.id]);
  const balance = useAsync(() => requestsApi.leaveBalance(undefined, Number(month.slice(0, 4))), [month.slice(0, 4)]);

  const ts = useMemo(() => (data.data ? timesheetFor(data.data, me!.id) : null), [data.data, me]);
  const attendanceByDate = useMemo(() => {
    const m = new Map<string, Attendance[]>();
    for (const a of data.data?.attendance ?? []) {
      if (a.employee_id === me!.id) (m.get(a.work_date) ?? m.set(a.work_date, []).get(a.work_date)!).push(a);
    }
    return m;
  }, [data.data, me]);

  const firstDow = dayjs(month + "-01").isoWeekday();
  const sel = ts?.days.find((d) => d.date === selected);
  const selAtt = selected ? attendanceByDate.get(selected) ?? [] : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lịch sử chấm công</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {data.error ? <ErrorBox error={data.error} onRetry={() => data.reload()} /> : !ts ? <Loading /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Mini label="Ngày công" value={num(ts.summary.work_days)} sub={`/ ${ts.summary.standard_days} chuẩn`} />
            <Mini label="Nghỉ phép" value={num(ts.summary.paid_leave_days)} sub={`Lễ: ${num(ts.summary.holiday_days)}`} />
            <Mini label="Vắng" value={num(ts.summary.absent_days)} tone={ts.summary.absent_days ? "text-red-600" : undefined} />
            <Mini label="Đi muộn" value={`${ts.summary.late_count} lần`} sub={`${ts.summary.late_minutes} phút`} tone={ts.summary.late_count ? "text-amber-600" : undefined} />
            <Mini label="Về sớm" value={`${ts.summary.early_count} lần`} sub={`${ts.summary.early_minutes} phút`} />
            <Mini label="Tăng ca" value={`${num(ts.summary.ot_hours.weekday + ts.summary.ot_hours.weekend + ts.summary.ot_hours.holiday)}h`} sub={`${num(ts.summary.worked_hours)}h làm`} />
          </div>

          <Card bodyClass="p-3">
            <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-medium text-slate-500">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow - 1 }).map((_, i) => <div key={"e" + i} />)}
              {ts.days.map((d) => <DayCell key={d.date} d={d} active={d.date === selected} onClick={() => setSelected(d.date)} />)}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(["work", "partial", "missing_checkout", "leave_paid", "absent", "holiday", "business_trip"] as const).map((k) => (
                <span key={k} className={clsx("rounded-full px-2 py-0.5 text-[10px]", toneClass(DAY_STATUS[k].tone))}>{DAY_STATUS[k].label}</span>
              ))}
            </div>
          </Card>

          {sel && (
            <Card title={dayjs(sel.date).format("dddd, DD/MM/YYYY")} actions={<Badge tone={DAY_STATUS[sel.status].tone}>{DAY_STATUS[sel.status].label}</Badge>}>
              {selAtt.length === 0 ? <p className="text-sm text-slate-500">Không có lượt chấm công.</p> : (
                <div className="space-y-2">
                  {selAtt.map((a) => (
                    <div key={a.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                      <div className="flex justify-between"><span>Vào</span><b>{fmtTime(a.check_in_at)}</b></div>
                      <div className="flex justify-between"><span>Ra</span><b>{a.check_out_at ? fmtTime(a.check_out_at) : a.missing_checkout ? "Quên check-out" : "—"}</b></div>
                      {a.late_minutes > 0 && <div className="flex justify-between text-amber-700"><span>Đi muộn</span><span>{a.late_minutes} phút{a.excused_late && " (đã giải trình)"}</span></div>}
                      {a.early_minutes > 0 && <div className="flex justify-between text-orange-700"><span>Về sớm</span><span>{a.early_minutes} phút{a.excused_early && " (đã giải trình)"}</span></div>}
                      {a.flags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{a.flags.map((f) => <Badge key={f} tone="gray">{FLAG_LABEL[f] ?? f}</Badge>)}</div>}
                    </div>
                  ))}
                </div>
              )}
              {sel.date <= todayStr() && (sel.status === "absent" || sel.status === "missing_checkout" || sel.late_count > 0 || sel.early_count > 0) && (
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  {(sel.status === "absent" || sel.status === "missing_checkout") && <Link className="link" to={`/requests/new?type=forgot_checkin&date=${sel.date}`}>Gửi đơn quên chấm công</Link>}
                  {sel.late_count > 0 && <Link className="link" to={`/requests/new?type=late&date=${sel.date}`}>Giải trình đi muộn</Link>}
                  {sel.early_count > 0 && <Link className="link" to={`/requests/new?type=early&date=${sel.date}`}>Giải trình về sớm</Link>}
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {balance.data && (
        <Card title={`Phép năm ${balance.data.year}`}>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div><div className="text-lg font-semibold">{num(balance.data.accrued)}</div><div className="text-xs text-slate-500">Được hưởng</div></div>
            <div><div className="text-lg font-semibold">{num(balance.data.carried)}</div><div className="text-xs text-slate-500">Năm trước</div></div>
            <div><div className="text-lg font-semibold">{num(balance.data.used + balance.data.pending)}</div><div className="text-xs text-slate-500">Đã dùng/chờ</div></div>
            <div><div className="text-lg font-semibold text-brand-700">{num(balance.data.remaining)}</div><div className="text-xs text-slate-500">Còn lại</div></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Tiêu chuẩn {num(balance.data.quota)} ngày/năm{balance.data.seniority_bonus ? ` (gồm ${balance.data.seniority_bonus} ngày thâm niên)` : ""}.</p>
        </Card>
      )}
    </div>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={clsx("text-lg font-semibold tabular-nums", tone)}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function DayCell({ d, active, onClick }: { d: DayResult; active: boolean; onClick: () => void }) {
  const st = DAY_STATUS[d.status];
  const isToday = d.date === todayStr();
  return (
    <button type="button" onClick={onClick}
      className={clsx("flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition",
        st.tone !== "none" ? toneClass(st.tone) : "text-slate-500",
        active && "ring-2 ring-brand-600", isToday && "font-bold underline")}>
      <span>{Number(d.date.slice(8))}</span>
      {st.short && <span className="text-[9px] leading-none">{st.short}</span>}
    </button>
  );
}
