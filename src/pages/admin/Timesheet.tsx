import clsx from "clsx";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useRefData } from "@/app/refdata";
import { Card, Empty, ErrorBox, Input, Loading, MonthPicker, PageHeader, Button, Select, toneClass } from "@/components/ui";
import * as employeesApi from "@/lib/api/employees";
import { exportXlsx } from "@/lib/excel";
import { fmtMonth, isoDowLabel, monthStr, num } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { DAY_STATUS } from "@/lib/labels";
import { computeTimesheet, daysInMonth } from "@/lib/payroll/engine";
import { loadMonth } from "@/lib/payroll/loader";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export default function Timesheet() {
  const { departments, deptName } = useRefData();
  const [month, setMonth] = useState(monthStr());
  const [dept, setDept] = useState("");
  const [q, setQ] = useState("");
  const data = useAsync(async () => {
    const emps = (await employeesApi.listEmployees());
    return loadMonth(month, { employees: emps, withPay: false });
  }, [month]);

  const days = daysInMonth(month);
  const rows = useMemo(() => {
    if (!data.data) return [];
    return data.data.employees
      .filter((e) => (!dept || e.department_id === dept) && (!q || norm(e.full_name + " " + e.code).includes(norm(q))))
      .map((e) => ({ e, ts: computeTimesheet(data.data!.inputs.get(e.id)!) }));
  }, [data.data, dept, q]);

  const doExport = () => exportXlsx(`bang-cong_${month}`, [{
    name: "Bảng công",
    title: `BẢNG CHẤM CÔNG THÁNG ${fmtMonth(month)}`,
    columns: [
      { header: "Mã NV", key: "code", width: 9 }, { header: "Họ tên", key: "name", width: 24 }, { header: "Phòng ban", key: "dept", width: 16 },
      ...days.map((d) => ({ header: `${Number(d.slice(8))}\n${isoDowLabel(d)}`, key: d, width: 4.5 })),
      { header: "Công chuẩn", key: "std", width: 8 }, { header: "Công đi làm", key: "work", width: 8 }, { header: "Nghỉ phép", key: "leave", width: 8 },
      { header: "Lễ", key: "hol", width: 6 }, { header: "Vắng", key: "absent", width: 6 }, { header: "KL/Ốm", key: "unpaid", width: 7 },
      { header: "Muộn (lần)", key: "late", width: 7 }, { header: "Muộn (phút)", key: "latem", width: 8 }, { header: "Sớm (lần)", key: "early", width: 7 },
      { header: "OT (giờ)", key: "ot", width: 7 }, { header: "Công tính lương", key: "paid", width: 9 },
    ],
    rows: rows.map(({ e, ts }) => ({
      code: e.code, name: e.full_name, dept: deptName(e.department_id),
      ...Object.fromEntries(ts.days.map((d) => [d.date, DAY_STATUS[d.status].short || (d.status === "off" ? "" : "")])),
      std: ts.summary.standard_days, work: ts.summary.work_days, leave: ts.summary.paid_leave_days, hol: ts.summary.holiday_days,
      absent: ts.summary.absent_days, unpaid: ts.summary.unpaid_leave_days + ts.summary.sick_days, late: ts.summary.late_count,
      latem: ts.summary.late_minutes, early: ts.summary.early_count,
      ot: ts.summary.ot_hours.weekday + ts.summary.ot_hours.weekend + ts.summary.ot_hours.holiday, paid: ts.summary.paid_days,
    })),
  }]);

  return (
    <div className="space-y-4">
      <PageHeader title="Bảng công tháng" subtitle="Tổng hợp tự động từ lịch ca, chấm công, đơn từ, ngày lễ"
        actions={<>
          <MonthPicker value={month} onChange={setMonth} />
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={doExport} disabled={!rows.length}>Xuất Excel</Button>
        </>} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Tìm nhân viên" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {(["work", "partial", "missing_checkout", "leave_paid", "leave_unpaid", "leave_sick", "business_trip", "absent", "holiday"] as const).map((k) => (
            <span key={k} className={clsx("rounded px-1.5 py-0.5", toneClass(DAY_STATUS[k].tone))}><b>{DAY_STATUS[k].short}</b> {DAY_STATUS[k].label}</span>
          ))}
        </div>
      </div>
      {data.error ? <ErrorBox error={data.error} onRetry={() => data.reload()} /> : data.loading ? <Loading text="Đang tổng hợp bảng công…" /> : rows.length === 0 ? <Empty /> : (
        <Card bodyClass="overflow-auto max-h-[75vh]">
          <table className="w-max border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 min-w-52 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left dark:border-slate-800 dark:bg-slate-900">Nhân viên</th>
                {days.map((d) => (
                  <th key={d} className={clsx("w-8 border-b border-slate-200 bg-slate-50 px-0.5 py-1 text-center font-medium dark:border-slate-800 dark:bg-slate-900", ["T7", "CN"].includes(isoDowLabel(d)) && "text-rose-500")}>
                    {Number(d.slice(8))}<div className="text-[10px] font-normal">{isoDowLabel(d)}</div>
                  </th>
                ))}
                {["Công", "Phép", "Lễ", "Vắng", "Muộn", "OT", "Tính lương"].map((h) => (
                  <th key={h} className="border-b border-slate-200 bg-slate-50 px-2 py-2 text-right dark:border-slate-800 dark:bg-slate-900">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, ts }) => (
                <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="font-medium">{e.full_name}</div><div className="text-[10px] text-slate-500">{e.code} · {deptName(e.department_id)}</div>
                  </td>
                  {ts.days.map((d) => {
                    const st = DAY_STATUS[d.status];
                    return (
                      <td key={d.date} className="border-b border-slate-100 p-0.5 text-center dark:border-slate-800" title={`${d.date}: ${st.label}${d.late_minutes ? ` – muộn ${d.late_minutes}′` : ""}${d.ot_hours ? ` – OT ${d.ot_hours}h` : ""}`}>
                        {st.short && <span className={clsx("block rounded py-1 text-[10px] font-semibold", toneClass(st.tone))}>{st.short}</span>}
                      </td>
                    );
                  })}
                  <td className="border-b border-slate-100 px-2 text-right tabular-nums dark:border-slate-800">{num(ts.summary.work_days)}</td>
                  <td className="border-b border-slate-100 px-2 text-right tabular-nums dark:border-slate-800">{num(ts.summary.paid_leave_days)}</td>
                  <td className="border-b border-slate-100 px-2 text-right tabular-nums dark:border-slate-800">{num(ts.summary.holiday_days)}</td>
                  <td className={clsx("border-b border-slate-100 px-2 text-right tabular-nums dark:border-slate-800", ts.summary.absent_days > 0 && "font-semibold text-red-600")}>{num(ts.summary.absent_days)}</td>
                  <td className="border-b border-slate-100 px-2 text-right tabular-nums dark:border-slate-800">{ts.summary.late_count ? `${ts.summary.late_count} (${ts.summary.late_minutes}′)` : "–"}</td>
                  <td className="border-b border-slate-100 px-2 text-right tabular-nums dark:border-slate-800">{num(ts.summary.ot_hours.weekday + ts.summary.ot_hours.weekend + ts.summary.ot_hours.holiday)}</td>
                  <td className="border-b border-slate-100 px-2 text-right font-semibold tabular-nums dark:border-slate-800">{num(ts.summary.paid_days)}/{ts.summary.standard_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
