import { Crosshair, Pencil, Plus, Trash2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useRefData } from "@/app/refdata";
import { Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, SearchSelect, Select, Tabs, Toggle, useUi } from "@/components/ui";
import * as orgApi from "@/lib/api/org";
import { errorMessage } from "@/lib/errors";
import { fmtDate, hhmm, num, weekdayName } from "@/lib/format";
import { getPosition } from "@/lib/geo";
import { useAsync } from "@/lib/hooks";
import type { Branch, Department, Holiday, Position, Shift } from "@/lib/types";

const MapView = lazy(() => import("@/components/MapView"));

export default function Organization() {
  const [tab, setTab] = useState<"branches" | "shifts" | "departments" | "positions" | "holidays">("branches");
  return (
    <div className="space-y-4">
      <PageHeader title="Chi nhánh, ca làm việc, phòng ban" />
      <Tabs value={tab} onChange={setTab} items={[
        { value: "branches", label: "Chi nhánh & vùng chấm công" }, { value: "shifts", label: "Ca làm việc" },
        { value: "departments", label: "Phòng ban" }, { value: "positions", label: "Chức vụ" }, { value: "holidays", label: "Ngày lễ" },
      ]} />
      {tab === "branches" && <Branches />}
      {tab === "shifts" && <Shifts />}
      {tab === "departments" && <Departments />}
      {tab === "positions" && <Positions />}
      {tab === "holidays" && <Holidays />}
    </div>
  );
}

function useCrud<T extends { id?: string }>(save: (x: Partial<T>) => Promise<unknown>, del: (id: string) => Promise<unknown>) {
  const ui = useUi();
  const { reload } = useRefData();
  return {
    save: async (x: Partial<T>) => { try { await save(x); await reload(); ui.toast("Đã lưu"); return true; } catch (e) { ui.error(e); return false; } },
    remove: async (id: string, name: string) => {
      if (!(await ui.confirm({ title: `Xoá "${name}"?`, danger: true, confirmText: "Xoá" }))) return;
      try { await del(id); await reload(); ui.toast("Đã xoá"); } catch (e) { ui.toast("Không xoá được: " + errorMessage(e), "error"); }
    },
  };
}

// ---------------------------------------------------------------------------
function Branches() {
  const { branches } = useRefData();
  const crud = useCrud<Branch>(orgApi.saveBranch, orgApi.deleteBranch);
  const ui = useUi();
  const [edit, setEdit] = useState<Partial<Branch> | null>(null);
  const useHere = async () => {
    try {
      const p = await getPosition();
      setEdit((e) => ({ ...e, lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) }));
      ui.toast(`Đã lấy vị trí (sai số ±${Math.round(p.accuracy)}m)`, "info");
    } catch (e) { ui.error(e); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2" title="Chi nhánh" actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ radius_m: 100, active: true, lat: 10.7769, lng: 106.7009 })}>Thêm</Button>} bodyClass="divide-y divide-slate-100 dark:divide-slate-800">
        {branches.length === 0 ? <Empty text="Chưa có chi nhánh" /> : branches.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="font-medium">{b.name} {!b.active && <Badge tone="gray">Ngừng</Badge>}</div>
              <div className="truncate text-xs text-slate-500">{b.address || `${b.lat}, ${b.lng}`} · bán kính {b.radius_m}m</div>
            </div>
            <div className="flex shrink-0">
              <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(b)} />
              <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => crud.remove(b.id, b.name)} />
            </div>
          </div>
        ))}
      </Card>
      <Card className="lg:col-span-3" title="Bản đồ vùng chấm công" bodyClass="p-2">
        <Suspense fallback={<Loading />}><MapView branches={branches} height={420} /></Suspense>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Sửa chi nhánh" : "Thêm chi nhánh"} size="lg"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Huỷ</Button><Button onClick={async () => { if (await crud.save(edit!)) setEdit(null); }} disabled={!edit?.name}>Lưu</Button></>}>
        {edit && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tên chi nhánh"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Địa chỉ"><Input value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
              <Field label="Vĩ độ"><Input type="number" step="any" value={edit.lat ?? ""} onChange={(e) => setEdit({ ...edit, lat: Number(e.target.value) })} /></Field>
              <Field label="Kinh độ"><Input type="number" step="any" value={edit.lng ?? ""} onChange={(e) => setEdit({ ...edit, lng: Number(e.target.value) })} /></Field>
            </div>
            <Field label={`Bán kính cho phép chấm công: ${edit.radius_m}m`} hint="Nên đặt 50–150m. Trong toà nhà cao tầng GPS kém, có thể cần 150–300m.">
              <input type="range" min={20} max={1000} step={10} value={edit.radius_m ?? 100} onChange={(e) => setEdit({ ...edit, radius_m: Number(e.target.value) })} className="w-full accent-brand-700" />
            </Field>
            <div className="flex items-center gap-3">
              <Button size="sm" variant="secondary" icon={<Crosshair className="h-4 w-4" />} onClick={useHere}>Dùng vị trí hiện tại của tôi</Button>
              <span className="text-xs text-slate-500">hoặc bấm vào bản đồ để chọn vị trí</span>
            </div>
            <Suspense fallback={<Loading />}>
              <MapView height={320} fit={false}
                branches={edit.lat != null && edit.lng != null ? [{ id: "x", name: edit.name ?? "", lat: edit.lat, lng: edit.lng, radius_m: edit.radius_m ?? 100 }] : []}
                onPick={(lat, lng) => setEdit({ ...edit, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })} />
            </Suspense>
            <Toggle checked={edit.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} label="Đang hoạt động" />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Shifts() {
  const { shifts } = useRefData();
  const crud = useCrud<Shift>(orgApi.saveShift, orgApi.deleteShift);
  const [edit, setEdit] = useState<Partial<Shift> | null>(null);
  return (
    <Card title="Ca làm việc" actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ start_time: "08:00", end_time: "17:00", break_minutes: 60, work_value: 1, late_grace_min: 5, early_grace_min: 5, color: "#0d9488", active: true })}>Thêm ca</Button>} bodyClass="overflow-x-auto">
      {shifts.length === 0 ? <Empty text="Chưa có ca" /> : (
        <table className="table">
          <thead><tr><th>Mã</th><th>Tên ca</th><th>Giờ</th><th>Nghỉ giữa ca</th><th>Số công</th><th>Cho phép muộn/sớm</th><th /></tr></thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td><span className="rounded px-2 py-0.5 text-xs font-semibold text-white" style={{ background: s.color }}>{s.code}</span></td>
                <td>{s.name} {!s.active && <Badge>Ngừng</Badge>}</td>
                <td className="tabular-nums">{hhmm(s.start_time)} – {hhmm(s.end_time)} {s.is_overnight && <Badge tone="violet">Qua đêm</Badge>}</td>
                <td>{s.break_minutes} phút</td>
                <td>{num(s.work_value)}</td>
                <td>{s.late_grace_min}′ / {s.early_grace_min}′</td>
                <td className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(s)} />
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => crud.remove(s.id, s.name)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Sửa ca" : "Thêm ca"}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Huỷ</Button><Button onClick={async () => { if (await crud.save(edit!)) setEdit(null); }} disabled={!edit?.code || !edit?.name}>Lưu</Button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mã ca (ngắn)"><Input value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} placeholder="HC, S, C, D…" /></Field>
            <Field label="Tên ca"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Hành chính" /></Field>
            <Field label="Giờ bắt đầu"><Input type="time" value={hhmm(edit.start_time)} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} /></Field>
            <Field label="Giờ kết thúc" hint="Nhỏ hơn giờ bắt đầu = ca qua đêm"><Input type="time" value={hhmm(edit.end_time)} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} /></Field>
            <Field label="Nghỉ giữa ca (phút)"><Input type="number" min={0} value={edit.break_minutes ?? 0} onChange={(e) => setEdit({ ...edit, break_minutes: Number(e.target.value) })} /></Field>
            <Field label="Số công của ca" hint="VD: ca 4 tiếng = 0.5 công"><Input type="number" step="0.25" min={0} value={edit.work_value ?? 1} onChange={(e) => setEdit({ ...edit, work_value: Number(e.target.value) })} /></Field>
            <Field label="Cho phép đi muộn (phút)"><Input type="number" min={0} value={edit.late_grace_min ?? 0} onChange={(e) => setEdit({ ...edit, late_grace_min: Number(e.target.value) })} /></Field>
            <Field label="Cho phép về sớm (phút)"><Input type="number" min={0} value={edit.early_grace_min ?? 0} onChange={(e) => setEdit({ ...edit, early_grace_min: Number(e.target.value) })} /></Field>
            <Field label="Màu hiển thị"><Input type="color" value={edit.color ?? "#0d9488"} onChange={(e) => setEdit({ ...edit, color: e.target.value })} className="h-10 p-1" /></Field>
            <div className="flex items-end pb-2"><Toggle checked={edit.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} label="Đang sử dụng" /></div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function Departments() {
  const { departments, people, personName } = useRefData();
  const crud = useCrud<Department>(orgApi.saveDepartment, orgApi.deleteDepartment);
  const [edit, setEdit] = useState<Partial<Department> | null>(null);
  const name = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "–";
  return (
    <Card title="Phòng ban" actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({})}>Thêm</Button>} bodyClass="overflow-x-auto">
      {departments.length === 0 ? <Empty /> : (
        <table className="table">
          <thead><tr><th>Tên phòng ban</th><th>Trực thuộc</th><th>Trưởng phòng</th><th>Số người</th><th /></tr></thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <td className="font-medium">{d.name}</td>
                <td>{name(d.parent_id)}</td>
                <td>{personName(d.manager_id)}</td>
                <td>{people.filter((p) => p.active && p.department_id === d.id).length}</td>
                <td className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEdit(d)} />
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => crud.remove(d.id, d.name)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Sửa phòng ban" : "Thêm phòng ban"} size="sm"
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Huỷ</Button><Button onClick={async () => { if (await crud.save(edit!)) setEdit(null); }} disabled={!edit?.name}>Lưu</Button></>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Tên"><Input value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Trực thuộc">
              <Select value={edit.parent_id ?? ""} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value || null })}>
                <option value="">—</option>{departments.filter((d) => d.id !== edit.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Trưởng phòng" hint="Được xem chấm công, duyệt đơn (nếu cấu hình) cho toàn phòng">
              <SearchSelect items={people.filter((p) => p.active)} value={edit.manager_id} onChange={(v) => setEdit({ ...edit, manager_id: v })} getLabel={(p) => p.full_name} getSub={(p) => p.code} placeholder="Chưa có" />
            </Field>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Positions() {
  const { positions } = useRefData();
  const crud = useCrud<Position>(orgApi.savePosition, orgApi.deletePosition);
  const [name, setName] = useState("");
  return (
    <Card title="Chức vụ" bodyClass="space-y-3 p-4">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên chức vụ mới" />
        <Button onClick={async () => { if (name.trim() && await crud.save({ name: name.trim() })) setName(""); }}>Thêm</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {positions.map((p) => (
          <span key={p.id} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm dark:bg-slate-800">
            {p.name}
            <button className="rounded-full p-1 text-slate-400 hover:text-red-600" onClick={() => crud.remove(p.id, p.name)} aria-label="Xoá"><Trash2 className="h-3.5 w-3.5" /></button>
          </span>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function Holidays() {
  const ui = useUi();
  const [year, setYear] = useState(new Date().getFullYear());
  const list = useAsync(() => orgApi.listHolidays(year), [year]);
  const [f, setF] = useState({ holiday_date: "", name: "", paid: true });
  const add = async (rows: Holiday[]) => {
    try { await orgApi.saveHolidays(rows); list.reload(true); ui.toast("Đã lưu"); setF({ holiday_date: "", name: "", paid: true }); } catch (e) { ui.error(e); }
  };
  const fixed = [
    { holiday_date: `${year}-01-01`, name: "Tết Dương lịch", paid: true },
    { holiday_date: `${year}-04-30`, name: "Ngày Giải phóng miền Nam", paid: true },
    { holiday_date: `${year}-05-01`, name: "Quốc tế Lao động", paid: true },
    { holiday_date: `${year}-09-02`, name: "Quốc khánh", paid: true },
  ];
  return (
    <Card title={<span className="flex items-center gap-2">Ngày lễ năm <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 py-1" /></span>}
      actions={<Button size="sm" variant="secondary" onClick={() => add(fixed)}>Thêm các ngày lễ dương lịch</Button>}>
      <p className="mb-3 text-xs text-slate-500">Tết Nguyên đán, Giỗ Tổ Hùng Vương (âm lịch) và ngày nghỉ bù/ngày Quốc khánh thứ 2 thay đổi theo năm – nhập theo thông báo chính thức của Bộ LĐ-TB&XH. Ngày lễ có lương được tính công cho nhân viên có ngày đó là ngày làm việc.</p>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input type="date" value={f.holiday_date} onChange={(e) => setF({ ...f, holiday_date: e.target.value })} />
        <Input placeholder="Tên ngày lễ" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="sm:col-span-2" />
        <Button onClick={() => add([f])} disabled={!f.holiday_date || !f.name}>Thêm</Button>
      </div>
      {list.loading ? <Loading /> : !list.data?.length ? <Empty text="Chưa có ngày lễ" /> : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.data.map((h) => (
            <div key={h.holiday_date} className="flex items-center justify-between py-2 text-sm">
              <span><b className="tabular-nums">{fmtDate(h.holiday_date)}</b> <span className="text-slate-500">({weekdayName(h.holiday_date)})</span> – {h.name} {!h.paid && <Badge>Không lương</Badge>}</span>
              <button className="text-slate-400 hover:text-red-600" aria-label="Xoá" onClick={async () => { await orgApi.deleteHoliday(h.holiday_date).catch(ui.error); list.reload(true); }}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
