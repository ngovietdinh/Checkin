import clsx from "clsx";
import { AlarmClockOff, CalendarOff, CheckCircle2, Clock, Coffee, LogIn, ShieldAlert, Users } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRefData } from "@/app/refdata";
import SelfieThumb from "@/components/SelfieThumb";
import { Avatar, Badge, Card, DateNav, Empty, ErrorBox, Loading, PageHeader, Select, Stat } from "@/components/ui";
import * as attendanceApi from "@/lib/api/attendance";
import * as notifyApi from "@/lib/api/notify";
import * as requestsApi from "@/lib/api/requests";
import * as storageApi from "@/lib/api/storage";
import { dayjs, fmtTime, todayStr } from "@/lib/format";
import { useAsync, useInterval } from "@/lib/hooks";
import { DAY_STATUS, FLAG_LABEL, REQUEST_LABEL } from "@/lib/labels";
import type { DayStatusRow } from "@/lib/types";

const MapView = lazy(() => import("@/components/MapView"));

type Filter = "all" | "working" | "done" | "late" | "absent" | "leave" | "not_yet" | "flagged";

export default function Dashboard() {
  const { branches, departments, deptName } = useRefData();
  const [date, setDate] = useState(todayStr());
  const [filter, setFilter] = useState<Filter>("all");
  const [dept, setDept] = useState("");
  const status = useAsync(() => attendanceApi.dayStatus(date), [date]);
  const pending = useAsync(() => requestsApi.listRequests({ status: "pending" }), []);
  const from = dayjs(date).subtract(13, "day").format("YYYY-MM-DD");
  const trend = useAsync(() => attendanceApi.attendanceStats(from, date), [date]);
  const [selfies, setSelfies] = useState<Record<string, string>>({});

  useInterval(() => status.reload(true), date === todayStr() ? 60_000 : null);
  useEffect(() => notifyApi.subscribeAttendance(() => status.reload(true)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (status.data ?? []).filter((r) => !dept || r.department_id === dept), [status.data, dept]);
  useEffect(() => {
    const paths = rows.map((r) => r.in_selfie).filter(Boolean) as string[];
    if (paths.length) storageApi.signedUrls("selfies", paths).then(setSelfies).catch(() => undefined);
  }, [rows]);

  const count = (f: (r: DayStatusRow) => boolean) => rows.filter(f).length;
  const scheduled = rows.filter((r) => r.status !== "off" || r.check_in_at);
  const stats = {
    total: scheduled.length,
    working: count((r) => r.status === "working"),
    done: count((r) => r.status === "done" || r.status === "missing_checkout"),
    late: count((r) => r.late_minutes > 0),
    absent: count((r) => r.status === "absent"),
    leave: count((r) => r.status === "leave"),
    notYet: count((r) => r.status === "not_yet"),
    flagged: count((r) => r.flags.some((f) => f !== "unscheduled")),
  };
  const present = stats.working + stats.done;

  const shown = rows.filter((r) => {
    switch (filter) {
      case "all": return r.status !== "off" || !!r.check_in_at;
      case "late": return r.late_minutes > 0;
      case "done": return r.status === "done" || r.status === "missing_checkout";
      case "flagged": return r.flags.some((f) => f !== "unscheduled");
      default: return r.status === filter;
    }
  });

  const chart = useMemo(() => {
    const byDay = new Map<string, { date: string; present: Set<string>; late: number }>();
    for (let i = 0; i < 14; i++) {
      const d = dayjs(from).add(i, "day").format("YYYY-MM-DD");
      byDay.set(d, { date: d, present: new Set(), late: 0 });
    }
    for (const a of trend.data ?? []) {
      const x = byDay.get(a.work_date);
      if (!x) continue;
      x.present.add(a.employee_id);
      if (a.late_minutes > 0) x.late++;
    }
    return [...byDay.values()].map((x) => ({ name: dayjs(x.date).format("DD/MM"), "Có mặt": x.present.size, "Đi muộn": x.late }));
  }, [trend.data, from]);

  const points = shown.filter((r) => r.in_lat && r.in_lng).map((r) => ({
    id: r.employee_id, lat: r.in_lat!, lng: r.in_lng!, label: `${r.full_name} – ${fmtTime(r.check_in_at)}`,
    color: r.late_minutes > 0 ? "#f59e0b" : r.flags.some((f) => f !== "unscheduled") ? "#dc2626" : "#16a34a",
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="Tổng quan chấm công" subtitle={date === todayStr() ? "Cập nhật trực tiếp" : dayjs(date).format("dddd, DD/MM/YYYY")}
        actions={<>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
            <option value="">Tất cả phòng ban</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <DateNav value={date} onChange={setDate} />
        </>} />

      {!!status.error && <ErrorBox error={status.error} onRetry={() => status.reload()} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Có lịch làm" value={stats.total} icon={<Users className="h-5 w-5" />} tone="gray" onClick={() => setFilter("all")} active={filter === "all"} />
        <Stat label="Có mặt" value={present} sub={stats.total ? `${Math.round((present / stats.total) * 100)}%` : undefined} icon={<LogIn className="h-5 w-5" />} tone="green" onClick={() => setFilter("done")} active={filter === "done"} />
        <Stat label="Đang làm" value={stats.working} icon={<Clock className="h-5 w-5" />} tone="blue" onClick={() => setFilter("working")} active={filter === "working"} />
        <Stat label="Đi muộn" value={stats.late} icon={<AlarmClockOff className="h-5 w-5" />} tone="amber" onClick={() => setFilter("late")} active={filter === "late"} />
        <Stat label="Chưa vào" value={stats.notYet} icon={<Coffee className="h-5 w-5" />} tone="gray" onClick={() => setFilter("not_yet")} active={filter === "not_yet"} />
        <Stat label="Vắng" value={stats.absent} icon={<CalendarOff className="h-5 w-5" />} tone="red" onClick={() => setFilter("absent")} active={filter === "absent"} />
        <Stat label="Nghỉ phép" value={stats.leave} icon={<CheckCircle2 className="h-5 w-5" />} tone="violet" onClick={() => setFilter("leave")} active={filter === "leave"} />
        <Stat label="Nghi vấn" value={stats.flagged} icon={<ShieldAlert className="h-5 w-5" />} tone="red" onClick={() => setFilter("flagged")} active={filter === "flagged"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3" title={`Danh sách (${shown.length})`} bodyClass="overflow-x-auto">
          {status.loading && !status.data ? <Loading /> : shown.length === 0 ? <Empty /> : (
            <table className="table">
              <thead><tr><th>Nhân viên</th><th>Ca</th><th>Vào</th><th>Ra</th><th>Trạng thái</th><th>Ảnh</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.employee_id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={r.full_name} url={r.avatar_url} size={30} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{r.full_name}</div>
                          <div className="text-xs text-slate-500">{r.code} · {deptName(r.department_id)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-xs">{r.shift_names ?? "—"}<div className="text-slate-500">{r.shift_start && `${fmtTime(r.shift_start)}–${fmtTime(r.shift_end)}`}</div></td>
                    <td className={clsx("tabular-nums", r.late_minutes > 0 && "font-medium text-amber-600")}>
                      {fmtTime(r.check_in_at)}{r.late_minutes > 0 && <div className="text-xs">+{r.late_minutes}′</div>}
                    </td>
                    <td className="tabular-nums">{r.check_out_at ? fmtTime(r.check_out_at) : "—"}</td>
                    <td>
                      <Badge tone={DAY_STATUS[r.status].tone}>{r.status === "leave" && r.leave_type ? REQUEST_LABEL[r.leave_type] : DAY_STATUS[r.status].label}</Badge>
                      <div className="mt-1 flex flex-wrap gap-1">{r.flags.filter((f) => f !== "unscheduled").map((f) => <Badge key={f} tone="red">{FLAG_LABEL[f] ?? f}</Badge>)}</div>
                    </td>
                    <td><SelfieThumb url={r.in_selfie ? selfies[r.in_selfie] : null} title={r.full_name} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-5 xl:col-span-2">
          <Card title="Bản đồ check-in" bodyClass="p-2">
            <Suspense fallback={<Loading />}><MapView branches={branches.filter((b) => b.active)} points={points} height={320} /></Suspense>
            <div className="flex gap-3 px-2 pt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-green-600" />Đúng giờ</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-amber-500" />Đi muộn</span>
              <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-red-600" />Nghi vấn</span>
            </div>
          </Card>
          <Card title="Đơn chờ duyệt" actions={<Link to="/admin/approvals" className="link text-sm">Xem tất cả</Link>} bodyClass="divide-y divide-slate-100 dark:divide-slate-800">
            {!pending.data?.length ? <Empty text="Không có đơn chờ" /> : pending.data.slice(0, 5).map((r) => (
              <PendingRow key={r.id} name={r.employee_id} type={REQUEST_LABEL[r.type]} date={r.start_date} />
            ))}
          </Card>
          <Card title="14 ngày gần nhất">
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Có mặt" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Đi muộn" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PendingRow({ name, type, date }: { name: string; type: string; date: string }) {
  const { personName } = useRefData();
  return (
    <Link to="/admin/approvals" className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <span className="font-medium">{personName(name)}</span>
      <span className="text-slate-500">{type} · {dayjs(date).format("DD/MM")}</span>
    </Link>
  );
}
