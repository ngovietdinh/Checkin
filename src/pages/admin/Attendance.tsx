import clsx from "clsx";
import { CheckCheck, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import SelfieThumb from "@/components/SelfieThumb";
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, SearchSelect, Select, Textarea, useUi } from "@/components/ui";
import * as attendanceApi from "@/lib/api/attendance";
import * as storageApi from "@/lib/api/storage";
import { exportXlsx } from "@/lib/excel";
import { dayjs, fmtDate, fmtTime, minutesText, num, todayStr, TZ } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { FLAG_LABEL } from "@/lib/labels";
import type { Attendance } from "@/lib/types";

export default function AttendanceAdmin() {
  const { isHr } = useAuth();
  const { team, departments, person, personName, deptName, branchName, shift, shifts } = useRefData();
  const ui = useUi();
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [dept, setDept] = useState("");
  const [emp, setEmp] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [edit, setEdit] = useState<Partial<Attendance> | null>(null);
  const [selfies, setSelfies] = useState<Record<string, string>>({});
  const list = useAsync(() => attendanceApi.listAttendance({ from, to, employeeIds: emp ? [emp] : undefined, flaggedOnly: flagged }), [from, to, emp, flagged]);

  const rows = useMemo(() => (list.data ?? []).filter((a) => !dept || person(a.employee_id)?.department_id === dept), [list.data, dept, person]);
  useEffect(() => {
    const paths = rows.slice(0, 300).flatMap((r) => [r.in_selfie, r.out_selfie]).filter(Boolean) as string[];
    if (paths.length) storageApi.signedUrls("selfies", paths).then(setSelfies).catch(() => undefined);
  }, [rows]);

  const quick = (k: "today" | "7d" | "month") => {
    const t = dayjs().tz(TZ);
    if (k === "today") { setFrom(todayStr()); setTo(todayStr()); }
    if (k === "7d") { setFrom(t.subtract(6, "day").format("YYYY-MM-DD")); setTo(todayStr()); }
    if (k === "month") { setFrom(t.startOf("month").format("YYYY-MM-DD")); setTo(todayStr()); }
  };

  const review = async (a: Attendance) => {
    try { await attendanceApi.reviewAttendance(a.id, null, true); ui.toast("Đã xác nhận"); list.reload(true); } catch (e) { ui.error(e); }
  };
  const remove = async (a: Attendance) => {
    if (!(await ui.confirm({ title: "Xoá lượt chấm công?", message: `${personName(a.employee_id)} – ${fmtDate(a.work_date)}`, danger: true, confirmText: "Xoá" }))) return;
    try { await attendanceApi.deleteAttendance(a.id); list.reload(true); } catch (e) { ui.error(e); }
  };

  const doExport = () => exportXlsx(`cham-cong_${from}_${to}`, [{
    name: "Chấm công",
    title: `CHI TIẾT CHẤM CÔNG ${fmtDate(from)} – ${fmtDate(to)}`,
    columns: [
      { header: "Ngày", key: "date", width: 12 }, { header: "Mã NV", key: "code", width: 10 }, { header: "Họ tên", key: "name", width: 24 },
      { header: "Phòng ban", key: "dept", width: 18 }, { header: "Ca", key: "shift", width: 14 }, { header: "Chi nhánh", key: "branch", width: 18 },
      { header: "Giờ vào", key: "in", width: 9 }, { header: "Giờ ra", key: "out", width: 9 }, { header: "Muộn (phút)", key: "late", width: 10 },
      { header: "Sớm (phút)", key: "early", width: 10 }, { header: "Giờ làm", key: "hours", width: 9 }, { header: "Khoảng cách (m)", key: "dist", width: 12 },
      { header: "Ghi chú/cờ", key: "flags", width: 30 }, { header: "Nguồn", key: "source", width: 10 },
    ],
    rows: rows.map((a) => {
      const p = person(a.employee_id);
      return {
        date: fmtDate(a.work_date), code: p?.code, name: p?.full_name, dept: deptName(p?.department_id), shift: shift(a.shift_id)?.name ?? "Ngoài lịch",
        branch: branchName(a.branch_id), in: fmtTime(a.check_in_at), out: a.check_out_at ? fmtTime(a.check_out_at) : a.missing_checkout ? "Quên" : "",
        late: a.excused_late ? 0 : a.late_minutes, early: a.excused_early ? 0 : a.early_minutes, hours: Math.round(a.worked_minutes / 6) / 10,
        dist: a.in_distance_m, flags: [...a.flags.map((f) => FLAG_LABEL[f] ?? f), a.note].filter(Boolean).join("; "), source: a.source,
      };
    }),
  }]);

  return (
    <div className="space-y-4">
      <PageHeader title="Chấm công chi tiết" subtitle="Lượt check-in/out, vị trí, ảnh, chỉnh sửa thủ công"
        actions={<>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={doExport} disabled={!rows.length}>Xuất Excel</Button>
          {isHr && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ work_date: todayStr() })}>Thêm thủ công</Button>}
        </>} />
      <Card bodyClass="flex flex-wrap items-end gap-3 p-4">
        <Field label="Từ ngày"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Đến ngày"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => quick("today")}>Hôm nay</Button>
          <Button size="sm" variant="ghost" onClick={() => quick("7d")}>7 ngày</Button>
          <Button size="sm" variant="ghost" onClick={() => quick("month")}>Tháng này</Button>
        </div>
        <Field label="Phòng ban">
          <Select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Tất cả</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Nhân viên" className="w-56"><SearchSelect items={team} value={emp} onChange={setEmp} getLabel={(p) => p.full_name} getSub={(p) => p.code} placeholder="Tất cả" /></Field>
        <Checkbox checked={flagged} onChange={setFlagged} label="Chỉ lượt nghi vấn / quên check-out" className="pb-2" />
      </Card>

      {list.error ? <ErrorBox error={list.error} onRetry={() => list.reload()} /> : (
        <Card bodyClass="overflow-x-auto" title={`${rows.length} lượt`}>
          {list.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="table">
              <thead><tr><th>Ngày</th><th>Nhân viên</th><th>Ca / Chi nhánh</th><th>Vào</th><th>Ra</th><th>Giờ làm</th><th>Vị trí</th><th>Ảnh</th><th>Ghi chú</th><th /></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const p = person(a.employee_id);
                  return (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{fmtDate(a.work_date)}</td>
                      <td><div className="font-medium">{p?.full_name}</div><div className="text-xs text-slate-500">{p?.code} · {deptName(p?.department_id)}</div></td>
                      <td className="text-xs">{shift(a.shift_id)?.name ?? <i>Ngoài lịch</i>}<div className="text-slate-500">{branchName(a.branch_id)}</div></td>
                      <td className="whitespace-nowrap tabular-nums">
                        {fmtTime(a.check_in_at)}
                        {a.late_minutes > 0 && <div className={clsx("text-xs", a.excused_late ? "text-slate-400 line-through" : "text-amber-600")}>muộn {a.late_minutes}′</div>}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {a.check_out_at ? fmtTime(a.check_out_at) : a.missing_checkout ? <Badge tone="orange">Quên</Badge> : "—"}
                        {a.early_minutes > 0 && <div className={clsx("text-xs", a.excused_early ? "text-slate-400 line-through" : "text-orange-600")}>sớm {a.early_minutes}′</div>}
                      </td>
                      <td className="whitespace-nowrap">{a.worked_minutes ? minutesText(a.worked_minutes) : "—"}</td>
                      <td className="whitespace-nowrap text-xs">
                        {a.in_distance_m != null ? <>{num(a.in_distance_m, 0)}m <span className="text-slate-400">±{num(a.in_accuracy, 0)}</span></> : "—"}
                        {a.in_lat && <a className="link block" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${a.in_lat},${a.in_lng}`}>Bản đồ</a>}
                      </td>
                      <td><div className="flex gap-1"><SelfieThumb url={a.in_selfie ? selfies[a.in_selfie] : null} title="Ảnh vào" />{a.out_selfie && <SelfieThumb url={selfies[a.out_selfie]} title="Ảnh ra" />}</div></td>
                      <td className="max-w-56 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {a.flags.map((f) => <Badge key={f} tone={f === "unscheduled" ? "gray" : "red"}>{FLAG_LABEL[f] ?? f}</Badge>)}
                          {a.source !== "app" && <Badge tone="blue">{a.source === "manual" ? "Nhập tay" : "Theo đơn"}</Badge>}
                          {a.reviewed_at && <Badge tone="green">Đã kiểm tra</Badge>}
                        </div>
                        {a.note && <div className="mt-1 whitespace-pre-line text-slate-500">{a.note}</div>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {a.flags.some((f) => f !== "unscheduled") && !a.reviewed_at && <Button size="sm" variant="ghost" title="Xác nhận hợp lệ" onClick={() => review(a)} icon={<CheckCheck className="h-4 w-4" />} />}
                        {isHr && <Button size="sm" variant="ghost" onClick={() => setEdit(a)} icon={<Pencil className="h-4 w-4" />} />}
                        {isHr && <Button size="sm" variant="ghost" onClick={() => remove(a)} icon={<Trash2 className="h-4 w-4" />} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
      <EditModal value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(true); }} shifts={shifts} people={team} />
    </div>
  );
}

function EditModal({ value, onClose, onSaved, shifts, people }: {
  value: Partial<Attendance> | null; onClose: () => void; onSaved: () => void;
  shifts: ReturnType<typeof useRefData>["shifts"]; people: ReturnType<typeof useRefData>["team"];
}) {
  const ui = useUi();
  const [f, setF] = useState({ employee_id: "", work_date: "", shift_id: "", in: "", out: "", note: "", excused_late: false, excused_early: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    const local = (ts?: string | null) => (ts ? dayjs(ts).tz(TZ).format("YYYY-MM-DDTHH:mm") : "");
    setF({
      employee_id: value.employee_id ?? "", work_date: value.work_date ?? todayStr(), shift_id: value.shift_id ?? "",
      in: local(value.check_in_at), out: local(value.check_out_at), note: value.note ?? "",
      excused_late: !!value.excused_late, excused_early: !!value.excused_early,
    });
  }, [value]);

  const save = async () => {
    setBusy(true);
    try {
      await attendanceApi.upsertAttendance({
        id: value?.id, employee_id: f.employee_id, work_date: f.work_date, shift_id: f.shift_id || null,
        check_in_at: f.in ? dayjs.tz(f.in, TZ).toISOString() : null, check_out_at: f.out ? dayjs.tz(f.out, TZ).toISOString() : null,
        note: f.note || null, excused_late: f.excused_late, excused_early: f.excused_early,
        ...(value?.id ? {} : { source: "manual" as const }),
        ...(f.out ? { missing_checkout: false } : {}),
      });
      ui.toast("Đã lưu");
      onSaved();
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? "Sửa lượt chấm công" : "Thêm chấm công thủ công"}
      footer={<><Button variant="secondary" onClick={onClose}>Huỷ</Button><Button loading={busy} onClick={save} disabled={!f.employee_id || !f.work_date}>Lưu</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nhân viên" className="sm:col-span-2">
          <SearchSelect items={people} value={f.employee_id} onChange={(id) => setF({ ...f, employee_id: id ?? "" })} getLabel={(p) => p.full_name} getSub={(p) => p.code} disabled={!!value?.id} />
        </Field>
        <Field label="Ngày công"><Input type="date" value={f.work_date} onChange={(e) => setF({ ...f, work_date: e.target.value })} /></Field>
        <Field label="Ca">
          <Select value={f.shift_id} onChange={(e) => setF({ ...f, shift_id: e.target.value })}>
            <option value="">Ngoài lịch</option>
            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>)}
          </Select>
        </Field>
        <Field label="Giờ vào"><Input type="datetime-local" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} /></Field>
        <Field label="Giờ ra"><Input type="datetime-local" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} /></Field>
        <Checkbox checked={f.excused_late} onChange={(v) => setF({ ...f, excused_late: v })} label="Miễn lỗi đi muộn" />
        <Checkbox checked={f.excused_early} onChange={(v) => setF({ ...f, excused_early: v })} label="Miễn lỗi về sớm" />
        <Field label="Ghi chú (lý do chỉnh sửa)" className="sm:col-span-2"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">Muộn/sớm/giờ làm được hệ thống tự tính lại theo ca. Mọi chỉnh sửa đều được ghi nhật ký.</p>
    </Modal>
  );
}
