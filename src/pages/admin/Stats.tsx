import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Card, Empty, ErrorBox, Loading, MonthPicker, PageHeader, Stat } from "@/components/ui";
import * as employeesApi from "@/lib/api/employees";
import * as payrollApi from "@/lib/api/payroll";
import * as requestsApi from "@/lib/api/requests";
import * as workApi from "@/lib/api/work";
import { dayjs, fmtMonth, money, monthStr, num, todayStr } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { REQUEST_LABEL } from "@/lib/labels";
import { computeTimesheet, daysInMonth } from "@/lib/payroll/engine";
import { loadMonth } from "@/lib/payroll/loader";

const COLORS = ["#0d9488", "#2563eb", "#f59e0b", "#dc2626", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#ea580c", "#475569"];

export default function Stats() {
  const { isHr } = useAuth();
  const { deptName } = useRefData();
  const [month, setMonth] = useState(monthStr());
  const days = daysInMonth(month);

  const data = useAsync(async () => {
    const emps = await employeesApi.listEmployees();
    const [md, tasks, reports, requests] = await Promise.all([
      loadMonth(month, { employees: emps, withPay: false }),
      workApi.listTasks(),
      workApi.listReports({ from: days[0], to: days[days.length - 1] }),
      requestsApi.listRequests({ from: days[0], to: days[days.length - 1] }),
    ]);
    const sheets = md.employees.map((e) => ({ e, ts: computeTimesheet(md.inputs.get(e.id)!) }));
    return { sheets, tasks, reports, requests };
  }, [month]);

  const payroll = useAsync(async () => {
    if (!isHr) return [];
    const months = Array.from({ length: 6 }, (_, i) => dayjs(month + "-01").subtract(5 - i, "month").format("YYYY-MM"));
    return Promise.all(months.map(async (m) => {
      const slips = await payrollApi.listPayslips(m);
      return {
        name: fmtMonth(m),
        "Thực trả": slips.reduce((t, p) => t + Number(p.net), 0),
        "Tổng chi phí": slips.reduce((t, p) => t + Number(p.gross) + (p.detail?.employer_insurance?.total ?? 0), 0),
      };
    }));
  }, [month, isHr]);

  const s = useMemo(() => {
    if (!data.data) return null;
    const { sheets, tasks, reports, requests } = data.data;
    const sum = (f: (x: (typeof sheets)[number]) => number) => sheets.reduce((t, x) => t + f(x), 0);
    // chỉ tính những ngày đã qua (tháng hiện tại)
    const today = todayStr();
    const past = (x: (typeof sheets)[number]) => x.ts.days.filter((d) => d.date <= today);
    const pastSum = (x: (typeof sheets)[number], f: (d: (typeof x.ts.days)[number]) => number) => past(x).reduce((t, d) => t + f(d), 0);
    const scheduled = sum((x) => pastSum(x, (d) => d.scheduled));
    const worked = sum((x) => pastSum(x, (d) => d.work_credit + d.paid_leave));
    const byDept = new Map<string, { name: string; scheduled: number; worked: number; late: number; people: number }>();
    for (const { e, ts } of sheets) {
      const k = e.department_id ?? "none";
      const d = byDept.get(k) ?? { name: e.department_id ? deptName(e.department_id) : "Chưa phân phòng", scheduled: 0, worked: 0, late: 0, people: 0 };
      d.scheduled += ts.days.filter((x) => x.date <= today).reduce((t, x) => t + x.scheduled, 0);
      d.worked += ts.days.filter((x) => x.date <= today).reduce((t, x) => t + x.work_credit + x.paid_leave, 0);
      d.late += ts.summary.late_count; d.people++;
      byDept.set(k, d);
    }
    const daily = days.filter((d) => d <= today).map((d) => {
      let present = 0; let late = 0;
      for (const { ts } of sheets) {
        const day = ts.days.find((x) => x.date === d);
        if (day && day.work_credit > 0) present++;
        if (day && day.late_count > 0) late++;
      }
      return { name: d.slice(8), "Có mặt": present, "Đi muộn": late };
    });
    const monthTasks = tasks.filter((t) => t.created_at.slice(0, 7) === month || (t.completed_at ?? "").slice(0, 7) === month);
    const reqByType = new Map<string, number>();
    for (const r of requests) reqByType.set(REQUEST_LABEL[r.type], (reqByType.get(REQUEST_LABEL[r.type]) ?? 0) + 1);
    const scores = reports.filter((r) => r.score);
    return {
      attendanceRate: scheduled ? (worked / scheduled) * 100 : 0,
      lateTotal: sum((x) => x.ts.summary.late_count),
      absentTotal: sum((x) => x.ts.summary.absent_days),
      otTotal: sum((x) => x.ts.summary.ot_hours.weekday + x.ts.summary.ot_hours.weekend + x.ts.summary.ot_hours.holiday),
      leaveTotal: sum((x) => x.ts.summary.paid_leave_days),
      depts: [...byDept.values()].map((d) => ({ ...d, rate: d.scheduled ? Math.round((d.worked / d.scheduled) * 1000) / 10 : 0 })).sort((a, b) => b.rate - a.rate),
      lateTop: [...sheets].filter((x) => x.ts.summary.late_count > 0).sort((a, b) => b.ts.summary.late_minutes - a.ts.summary.late_minutes).slice(0, 10),
      absentTop: [...sheets].filter((x) => x.ts.summary.absent_days > 0).sort((a, b) => b.ts.summary.absent_days - a.ts.summary.absent_days).slice(0, 10),
      otTop: [...sheets].map((x) => ({ ...x, ot: x.ts.summary.ot_hours.weekday + x.ts.summary.ot_hours.weekend + x.ts.summary.ot_hours.holiday })).filter((x) => x.ot > 0).sort((a, b) => b.ot - a.ot).slice(0, 10),
      daily,
      tasksDone: monthTasks.filter((t) => t.status === "done").length,
      tasksTotal: monthTasks.length,
      tasksOverdue: tasks.filter((t) => (t.status === "todo" || t.status === "doing") && t.due_at && Date.parse(t.due_at) < Date.now()).length,
      reportCount: reports.length,
      avgScore: scores.length ? scores.reduce((t, r) => t + (r.score ?? 0), 0) / scores.length : 0,
      reqByType: [...reqByType.entries()].map(([name, value]) => ({ name, value })),
    };
  }, [data.data, days, month, deptName]);

  return (
    <div className="space-y-5">
      <PageHeader title="Thống kê" subtitle="Chuyên cần, tăng ca, công việc, quỹ lương" actions={<MonthPicker value={month} onChange={setMonth} />} />
      {data.error ? <ErrorBox error={data.error} /> : !s ? <Loading text="Đang tổng hợp…" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Tỷ lệ chuyên cần" value={`${num(s.attendanceRate)}%`} tone="green" />
            <Stat label="Lượt đi muộn" value={s.lateTotal} tone="amber" />
            <Stat label="Ngày vắng không phép" value={num(s.absentTotal)} tone="red" />
            <Stat label="Ngày nghỉ phép" value={num(s.leaveTotal)} tone="violet" />
            <Stat label="Giờ tăng ca" value={num(s.otTotal)} tone="blue" />
            <Stat label="Việc hoàn thành" value={`${s.tasksDone}/${s.tasksTotal}`} sub={`${s.tasksOverdue} việc quá hạn`} />
          </div>

          <Card title="Có mặt & đi muộn theo ngày">
            <div className="h-64"><ResponsiveContainer>
              <LineChart data={s.daily} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Có mặt" stroke="#0d9488" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Đi muộn" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer></div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Chuyên cần theo phòng ban (%)">
              {s.depts.length === 0 ? <Empty /> : <div style={{ height: Math.max(200, s.depts.length * 36) }}><ResponsiveContainer>
                <BarChart data={s.depts} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} fontSize={11} /><YAxis type="category" dataKey="name" fontSize={11} width={110} /><Tooltip />
                  <Bar dataKey="rate" name="Chuyên cần %" fill="#0d9488" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer></div>}
            </Card>
            <Card title="Đơn từ trong tháng">
              {s.reqByType.length === 0 ? <Empty /> : <div className="h-64"><ResponsiveContainer>
                <PieChart><Pie data={s.reqByType} dataKey="value" nameKey="name" outerRadius={90} label={{ fontSize: 11 }}>
                  {s.reqByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer></div>}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Ranking title="Đi muộn nhiều nhất" rows={s.lateTop.map((x) => ({ id: x.e.id, name: x.e.full_name, value: `${x.ts.summary.late_count} lần · ${x.ts.summary.late_minutes}′` }))} />
            <Ranking title="Vắng nhiều nhất" rows={s.absentTop.map((x) => ({ id: x.e.id, name: x.e.full_name, value: `${num(x.ts.summary.absent_days)} ngày` }))} />
            <Ranking title="Tăng ca nhiều nhất" rows={s.otTop.map((x) => ({ id: x.e.id, name: x.e.full_name, value: `${num(x.ot)} giờ` }))} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Báo cáo công việc">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div><div className="text-2xl font-semibold">{s.reportCount}</div><div className="text-xs text-slate-500">báo cáo đã nộp</div></div>
                <div><div className="text-2xl font-semibold">{s.avgScore ? num(s.avgScore) + "★" : "–"}</div><div className="text-xs text-slate-500">điểm trung bình</div></div>
              </div>
            </Card>
            {isHr && (
              <Card title="Quỹ lương 6 tháng">
                {payroll.loading ? <Loading /> : <div className="h-56"><ResponsiveContainer>
                  <BarChart data={payroll.data ?? []} margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={10} tickFormatter={(v) => `${Math.round(v / 1e6)}tr`} />
                    <Tooltip formatter={(v) => money(Number(v)) + " đ"} /><Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Thực trả" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Tổng chi phí" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer></div>}
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Ranking({ title, rows }: { title: string; rows: { id: string; name: string; value: string }[] }) {
  return (
    <Card title={title} bodyClass="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.length === 0 ? <Empty text="Không có" /> : rows.map((r, i) => (
        <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
          <span><span className="mr-2 text-slate-400">{i + 1}.</span>{r.name}</span><span className="font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </Card>
  );
}
