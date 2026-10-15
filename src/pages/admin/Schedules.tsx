import clsx from "clsx";
import { ChevronLeft, ChevronRight, Copy, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Button, Card, Checkbox, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, useUi } from "@/components/ui";
import * as employeesApi from "@/lib/api/employees";
import * as orgApi from "@/lib/api/org";
import * as schedulesApi from "@/lib/api/schedules";
import { dayjs, fmtDateShort, hhmm, TZ, WEEKDAYS } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { ResolvedSchedule } from "@/lib/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export default function Schedules() {
  const { isHr } = useAuth();
  const { team, departments, shifts, shift, branches, deptName } = useRefData();
  const ui = useUi();
  const [weekStart, setWeekStart] = useState(() => dayjs().tz(TZ).startOf("isoWeek").format("YYYY-MM-DD"));
  const [dept, setDept] = useState("");
  const [q, setQ] = useState("");
  const [selEmps, setSelEmps] = useState<Set<string>>(new Set());
  const [selDays, setSelDays] = useState<Set<string>>(new Set());
  const [apply, setApply] = useState<{ emps: string[]; days: string[] } | null>(null);
  const [defaults, setDefaults] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayjs(weekStart).add(i, "day").format("YYYY-MM-DD")), [weekStart]);
  const emps = useMemo(() => team.filter((p) => p.active && (!dept || p.department_id === dept) && (!q || norm(p.full_name + p.code).includes(norm(q)))), [team, dept, q]);

  const data = useAsync(async () => {
    const [resolved, rows, holidays] = await Promise.all([
      schedulesApi.resolvedSchedule(days[0], days[6]),
      schedulesApi.listScheduleRows(days[0], days[6]),
      orgApi.listHolidays(),
    ]);
    return { resolved, offs: new Set(rows.filter((r) => r.is_off).map((r) => r.employee_id + r.work_date)), holidays: new Map(holidays.map((h) => [h.holiday_date, h.name])) };
  }, [weekStart]);

  const cell = useMemo(() => {
    const m = new Map<string, ResolvedSchedule[]>();
    for (const r of data.data?.resolved ?? []) {
      const k = r.employee_id + r.work_date;
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return m;
  }, [data.data]);

  const toggle = (set: Set<string>, v: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    fn(n);
  };

  const copyPrev = async () => {
    const prev = dayjs(weekStart).subtract(7, "day").format("YYYY-MM-DD");
    if (!(await ui.confirm({ title: "Sao chép lịch tuần trước?", message: `Lịch cụ thể của ${emps.length} nhân viên đang hiển thị tuần ${fmtDateShort(prev)} sẽ được chép sang tuần này (ghi đè lịch cụ thể tuần này).` }))) return;
    try {
      const n = await schedulesApi.copySchedule(prev, weekStart, 7, emps.map((e) => e.id));
      ui.toast(`Đã sao chép ${n} dòng lịch`);
      data.reload(true);
    } catch (e) { ui.error(e); }
  };

  const openApply = () => {
    const e = [...selEmps];
    const d = [...selDays];
    if (!e.length || !d.length) return ui.toast("Chọn nhân viên (cột trái) và ngày (tiêu đề cột)", "info");
    setApply({ emps: e, days: d });
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Xếp lịch ca" subtitle="Lịch mặc định theo nhân viên + lịch cụ thể theo ngày (ưu tiên lịch cụ thể)"
        actions={<>
          <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
            <button className="p-2" onClick={() => setWeekStart(dayjs(weekStart).subtract(7, "day").format("YYYY-MM-DD"))} aria-label="Tuần trước"><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-2 text-sm">{fmtDateShort(days[0])} – {fmtDateShort(days[6])}</span>
            <button className="p-2" onClick={() => setWeekStart(dayjs(weekStart).add(7, "day").format("YYYY-MM-DD"))} aria-label="Tuần sau"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={copyPrev}>Chép tuần trước</Button>
        </>} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Tìm nhân viên" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <span className="text-sm text-slate-500">Đã chọn {selEmps.size} người × {selDays.size} ngày</span>
        <Button size="sm" onClick={openApply}>Xếp ca cho ô đã chọn</Button>
        {isHr && <Button size="sm" variant="secondary" onClick={() => selEmps.size ? setDefaults(true) : ui.toast("Chọn nhân viên trước", "info")}>Đặt lịch mặc định</Button>}
        {(selEmps.size > 0 || selDays.size > 0) && <Button size="sm" variant="ghost" onClick={() => { setSelEmps(new Set()); setSelDays(new Set()); }}>Bỏ chọn</Button>}
      </div>
      {data.error ? <ErrorBox error={data.error} /> : data.loading && !data.data ? <Loading /> : (
        <Card bodyClass="overflow-auto max-h-[72vh]">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 w-60 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left dark:border-slate-800 dark:bg-slate-900">
                  <Checkbox checked={emps.length > 0 && emps.every((e) => selEmps.has(e.id))} onChange={(v) => setSelEmps(v ? new Set(emps.map((e) => e.id)) : new Set())} label={`Nhân viên (${emps.length})`} />
                </th>
                {days.map((d, i) => (
                  <th key={d} className={clsx("border-b border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-800 dark:bg-slate-900", selDays.has(d) && "bg-brand-100 dark:bg-brand-900/40")}>
                    <button className="w-full text-center" onClick={() => toggle(selDays, d, setSelDays)}>
                      <div className={clsx("text-xs", i >= 5 && "text-rose-500")}>{WEEKDAYS[i].long}</div>
                      <div className="font-semibold">{fmtDateShort(d)}</div>
                      {data.data?.holidays.get(d) && <div className="text-[10px] text-pink-600">{data.data.holidays.get(d)}</div>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {emps.map((e) => (
                <tr key={e.id}>
                  <td className={clsx("sticky left-0 z-[5] border-b border-slate-100 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-slate-900", selEmps.has(e.id) && "bg-brand-50 dark:bg-brand-900/30")}>
                    <Checkbox checked={selEmps.has(e.id)} onChange={() => toggle(selEmps, e.id, setSelEmps)}
                      label={<span><span className="font-medium">{e.full_name}</span><span className="block text-[11px] text-slate-500">{e.code} · {deptName(e.department_id)}</span></span>} />
                  </td>
                  {days.map((d) => {
                    const list = cell.get(e.id + d) ?? [];
                    const off = data.data?.offs.has(e.id + d);
                    const sel = selEmps.has(e.id) && selDays.has(d);
                    return (
                      <td key={d} className={clsx("border-b border-l border-slate-100 p-1 align-top dark:border-slate-800", sel && "bg-brand-50 dark:bg-brand-900/30")}>
                        <button className="flex min-h-10 w-full flex-col gap-1 rounded-lg p-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setApply({ emps: [e.id], days: [d] })}>
                          {off && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300">Nghỉ</span>}
                          {list.map((r) => {
                            const s = shift(r.shift_id);
                            return (
                              <span key={r.shift_id} className={clsx("truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white", r.is_default && "opacity-60")}
                                style={{ background: s?.color ?? "#64748b" }} title={r.is_default ? "Lịch mặc định" : "Lịch cụ thể"}>
                                {s?.code ?? "?"} {s && `${hhmm(s.start_time)}-${hhmm(s.end_time)}`}
                              </span>
                            );
                          })}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3 text-xs text-slate-500 dark:border-slate-800">
            {shifts.map((s) => <span key={s.id} className="flex items-center gap-1"><i className="h-3 w-3 rounded" style={{ background: s.color }} />{s.code}: {s.name}</span>)}
            <span>· Ô mờ = lịch mặc định</span>
          </div>
        </Card>
      )}
      <ApplyModal value={apply} onClose={() => setApply(null)} shifts={shifts} branches={branches}
        onDone={() => { setApply(null); data.reload(true); }} />
      <DefaultsModal open={defaults} onClose={() => setDefaults(false)} ids={[...selEmps]} shifts={shifts} onDone={() => { setDefaults(false); data.reload(true); }} />
    </div>
  );
}

function ApplyModal({ value, onClose, onDone, shifts, branches }: {
  value: { emps: string[]; days: string[] } | null; onClose: () => void; onDone: () => void;
  shifts: ReturnType<typeof useRefData>["shifts"]; branches: ReturnType<typeof useRefData>["branches"];
}) {
  const ui = useUi();
  const [mode, setMode] = useState<"shift" | "off" | "default">("shift");
  const [picked, setPicked] = useState<string[]>([]);
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value) return;
    setBusy(true);
    try {
      await schedulesApi.setDay(value.emps, value.days, mode === "default" ? null : { shiftIds: mode === "off" ? [] : picked, off: mode === "off" }, branch || null);
      ui.toast("Đã cập nhật lịch");
      onDone();
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!value} onClose={onClose} title={`Xếp ca: ${value?.emps.length} người × ${value?.days.length} ngày`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Huỷ</Button><Button loading={busy} onClick={save} disabled={mode === "shift" && !picked.length}>Áp dụng</Button></>}>
      <div className="space-y-3">
        <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="shift">Làm ca…</option>
          <option value="off">Nghỉ (không có ca)</option>
          <option value="default">Theo lịch mặc định</option>
        </Select>
        {mode === "shift" && (
          <>
            <div className="space-y-1.5">
              {shifts.filter((s) => s.active).map((s) => (
                <Checkbox key={s.id} checked={picked.includes(s.id)} onChange={(v) => setPicked(v ? [...picked, s.id] : picked.filter((x) => x !== s.id))}
                  label={<span><i className="mr-1 inline-block h-3 w-3 rounded" style={{ background: s.color }} />{s.name} ({hhmm(s.start_time)}–{hhmm(s.end_time)})</span>} />
              ))}
            </div>
            <Field label="Chi nhánh (tuỳ chọn)" hint="Để trống: chấm ở bất kỳ chi nhánh được gán">
              <Select value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

function DefaultsModal({ open, onClose, ids, shifts, onDone }: { open: boolean; onClose: () => void; ids: string[]; shifts: ReturnType<typeof useRefData>["shifts"]; onDone: () => void }) {
  const ui = useUi();
  const [shiftId, setShiftId] = useState("");
  const [wd, setWd] = useState<number[]>([1, 2, 3, 4, 5]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      for (const id of ids) await employeesApi.updateEmployee(id, { default_shift_id: shiftId || null, work_days: wd });
      ui.toast(`Đã đặt lịch mặc định cho ${ids.length} người`);
      onDone();
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Lịch mặc định cho ${ids.length} nhân viên`} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Huỷ</Button><Button loading={busy} onClick={save}>Lưu</Button></>}>
      <div className="space-y-3">
        <Field label="Ca mặc định">
          <Select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Không có (chỉ theo lịch cụ thể)</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({hhmm(s.start_time)}–{hhmm(s.end_time)})</option>)}
          </Select>
        </Field>
        <Field label="Ngày làm trong tuần">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((w) => <Checkbox key={w.v} checked={wd.includes(w.v)} onChange={(v) => setWd(v ? [...wd, w.v].sort() : wd.filter((x) => x !== w.v))} label={w.short} />)}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
