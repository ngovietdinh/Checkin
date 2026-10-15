import { KeyRound, Lock, Plus, Smartphone, Trash2, Unlock } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Badge, Button, Checkbox, Field, Input, Loading, Modal, NumberInput, SearchSelect, Select, Tabs, Toggle, useUi } from "@/components/ui";
import * as employeesApi from "@/lib/api/employees";
import * as requestsApi from "@/lib/api/requests";
import { fmtDateTime, hhmm, num, todayStr, WEEKDAYS } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/labels";
import type { Compensation, Employee, EmployeeAllowance, Role } from "@/lib/types";

type Allow = Omit<EmployeeAllowance, "id" | "employee_id">;

const EMPTY_COMP: Omit<Compensation, "employee_id"> = {
  salary_type: "monthly", base_salary: 0, hourly_rate: 0, shift_rate: 0, insurance_salary: null, dependents: 0,
  tax_code: null, bank_name: null, bank_account: null, insurance_enabled: true, tax_enabled: true,
};

/** Thêm mới (id = null) hoặc sửa nhân viên */
export default function EmployeeEditor({ id, open, onClose, onSaved }: { id: string | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { isAdmin } = useAuth();
  const { people, departments, positions, branches, shifts, reload: reloadRef } = useRefData();
  const ui = useUi();
  const isNew = !id;
  const [tab, setTab] = useState<"profile" | "work" | "pay" | "account" | "leave">("profile");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emp, setEmp] = useState<Partial<Employee>>({});
  const [comp, setComp] = useState<Omit<Compensation, "employee_id">>(EMPTY_COMP);
  const [allows, setAllows] = useState<Allow[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [carry, setCarry] = useState(0);
  const [balance, setBalance] = useState<Awaited<ReturnType<typeof requestsApi.leaveBalance>> | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab("profile");
    setPassword("");
    if (isNew) {
      setEmp({ role: "employee", join_date: todayStr(), work_days: [1, 2, 3, 4, 5], active: true, default_shift_id: shifts[0]?.id ?? null });
      setComp(EMPTY_COMP);
      setAllows([]);
      setBranchIds(branches.length === 1 ? [branches[0].id] : []);
      return;
    }
    setLoading(true);
    Promise.all([
      employeesApi.getEmployee(id!), employeesApi.getCompensation(id!), employeesApi.listAllowances(id!),
      employeesApi.listEmployeeBranches(), requestsApi.leaveBalance(id!), employeesApi.listCarryovers(new Date().getFullYear()),
    ]).then(([e, c, a, eb, bal, co]) => {
      setEmp(e);
      setLoginEmail(e.email ?? "");
      setComp(c ? { ...EMPTY_COMP, ...c } : EMPTY_COMP);
      setAllows(a.map(({ name, amount, taxable, per_workday }) => ({ name, amount: Number(amount), taxable, per_workday })));
      setBranchIds(eb.filter((x) => x.employee_id === id).map((x) => x.branch_id));
      setBalance(bal);
      setCarry(Number(co.find((x) => x.employee_id === id)?.days ?? 0));
    }).catch(ui.error).finally(() => setLoading(false));
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Employee>) => setEmp((e) => ({ ...e, ...patch }));
  const setC = (patch: Partial<Compensation>) => setComp((c) => ({ ...c, ...patch }));

  const save = async () => {
    if (!emp.code?.trim() || !emp.full_name?.trim()) { setTab("profile"); return ui.toast("Cần nhập mã và họ tên", "error"); }
    setBusy(true);
    try {
      const allowRows = allows.filter((a) => a.name.trim());
      if (isNew) {
        if (password.length < 6) { setTab("account"); throw new Error("Mật khẩu tối thiểu 6 ký tự"); }
        const { id: newId } = await employeesApi.createEmployee({
          code: emp.code!, full_name: emp.full_name!, password, email: emp.email || null, phone: emp.phone || null,
          gender: emp.gender || null, dob: emp.dob || null, role: emp.role, department_id: emp.department_id || null,
          position_id: emp.position_id || null, manager_id: emp.manager_id || null, join_date: emp.join_date || null,
          default_shift_id: emp.default_shift_id || null, work_days: emp.work_days, annual_leave_days: emp.annual_leave_days ?? null,
          branch_ids: branchIds, compensation: comp,
        });
        if (allowRows.length) await employeesApi.replaceAllowances(newId, allowRows);
        ui.toast("Đã tạo nhân viên");
      } else {
        const { id: _id, created_at: _c, device_id: _d, device_label: _l, device_bound_at: _b, email: _e, active: _a, ...patch } = emp as Employee;
        void _id; void _c; void _d; void _l; void _b; void _e; void _a;
        await employeesApi.updateEmployee(id!, patch);
        await employeesApi.saveCompensation({ ...comp, employee_id: id! });
        await employeesApi.replaceAllowances(id!, allowRows);
        await employeesApi.setEmployeeBranches(id!, branchIds);
        await employeesApi.setCarryover(id!, new Date().getFullYear(), carry);
        ui.toast("Đã lưu");
      }
      await reloadRef();
      onSaved();
      onClose();
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  const account = async (action: "password" | "email" | "lock" | "unlock" | "device") => {
    try {
      if (action === "password") { await employeesApi.setPassword(id!, password); setPassword(""); ui.toast("Đã đặt mật khẩu mới"); }
      if (action === "email") { const r = await employeesApi.setLoginEmail(id!, loginEmail); ui.toast("Tên đăng nhập: " + r.email); }
      if (action === "lock") {
        if (!(await ui.confirm({ title: "Khoá tài khoản?", message: "Nhân viên sẽ không đăng nhập được và được đánh dấu nghỉ việc từ hôm nay.", danger: true, confirmText: "Khoá" }))) return;
        await employeesApi.setActive(id!, false); set({ active: false }); ui.toast("Đã khoá");
      }
      if (action === "unlock") { await employeesApi.setActive(id!, true); set({ active: true, left_date: null }); ui.toast("Đã mở khoá"); }
      if (action === "device") { await employeesApi.resetDevice(id!); set({ device_id: null, device_label: null, device_bound_at: null }); ui.toast("Đã gỡ thiết bị – lần chấm tới sẽ đăng ký máy mới"); }
      onSaved();
    } catch (e) { ui.error(e); }
  };

  const roles: Role[] = isAdmin ? ["employee", "leader", "manager", "hr", "admin"] : ["employee", "leader", "manager", "hr"];

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isNew ? "Thêm nhân viên" : `${emp.full_name ?? ""} (${emp.code ?? ""})`}
      footer={<><Button variant="secondary" onClick={onClose}>Đóng</Button><Button loading={busy} onClick={save}>{isNew ? "Tạo nhân viên" : "Lưu thay đổi"}</Button></>}>
      {loading ? <Loading /> : (
        <div className="space-y-4">
          <Tabs value={tab} onChange={setTab} items={[
            { value: "profile", label: "Hồ sơ" }, { value: "work", label: "Lịch & chi nhánh" }, { value: "pay", label: "Lương & phụ cấp" },
            { value: "account", label: "Tài khoản" }, ...(isNew ? [] : [{ value: "leave" as const, label: "Phép năm" }]),
          ]} />

          {tab === "profile" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mã nhân viên *" hint={isNew ? "Dùng để đăng nhập nếu không có email" : undefined}><Input value={emp.code ?? ""} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Họ và tên *"><Input value={emp.full_name ?? ""} onChange={(e) => set({ full_name: e.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={emp.email ?? ""} onChange={(e) => set({ email: e.target.value })} disabled={!isNew} /></Field>
              <Field label="Số điện thoại"><Input value={emp.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></Field>
              <Field label="Giới tính">
                <Select value={emp.gender ?? ""} onChange={(e) => set({ gender: (e.target.value || null) as Employee["gender"] })}>
                  <option value="">—</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
                </Select>
              </Field>
              <Field label="Ngày sinh"><Input type="date" value={emp.dob ?? ""} onChange={(e) => set({ dob: e.target.value || null })} /></Field>
              <Field label="Phòng ban">
                <Select value={emp.department_id ?? ""} onChange={(e) => set({ department_id: e.target.value || null })}>
                  <option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Chức vụ">
                <Select value={emp.position_id ?? ""} onChange={(e) => set({ position_id: e.target.value || null })}>
                  <option value="">—</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Vai trò trong hệ thống" hint="Quản lý/Trưởng nhóm: xem & duyệt cho cấp dưới. Nhân sự: toàn quyền nhân sự & lương.">
                <Select value={emp.role ?? "employee"} onChange={(e) => set({ role: e.target.value as Role })} disabled={emp.role === "admin" && !isAdmin}>
                  {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </Select>
              </Field>
              <Field label="Quản lý trực tiếp (người duyệt đơn)">
                <SearchSelect items={people.filter((p) => p.active && p.id !== id)} value={emp.manager_id} onChange={(v) => set({ manager_id: v })}
                  getLabel={(p) => p.full_name} getSub={(p) => `${p.code} · ${ROLE_LABEL[p.role]}`} placeholder="Không có" />
              </Field>
              <Field label="Ngày vào làm"><Input type="date" value={emp.join_date ?? ""} onChange={(e) => set({ join_date: e.target.value })} /></Field>
              {!isNew && <Field label="Ngày nghỉ việc"><Input type="date" value={emp.left_date ?? ""} onChange={(e) => set({ left_date: e.target.value || null })} /></Field>}
            </div>
          )}

          {tab === "work" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ca mặc định" hint="Áp dụng cho các ngày làm trong tuần nếu không xếp lịch cụ thể">
                  <Select value={emp.default_shift_id ?? ""} onChange={(e) => set({ default_shift_id: e.target.value || null })}>
                    <option value="">Không (chỉ theo lịch xếp ca / giờ linh hoạt)</option>
                    {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({hhmm(s.start_time)}–{hhmm(s.end_time)})</option>)}
                  </Select>
                </Field>
                <Field label="Ngày làm trong tuần">
                  <div className="flex flex-wrap gap-3 pt-2">
                    {WEEKDAYS.map((w) => (
                      <Checkbox key={w.v} checked={(emp.work_days ?? []).includes(w.v)} label={w.short}
                        onChange={(v) => set({ work_days: v ? [...(emp.work_days ?? []), w.v].sort() : (emp.work_days ?? []).filter((x) => x !== w.v) })} />
                    ))}
                  </div>
                </Field>
              </div>
              <Field label="Chi nhánh được phép chấm công" hint="Nhân viên chỉ check-in được khi ở trong bán kính của một trong các chi nhánh này">
                <div className="flex flex-wrap gap-2">
                  {branches.map((b) => (
                    <label key={b.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-sm dark:border-slate-700">
                      <input type="checkbox" className="accent-brand-700" checked={branchIds.includes(b.id)}
                        onChange={(e) => setBranchIds(e.target.checked ? [...branchIds, b.id] : branchIds.filter((x) => x !== b.id))} />
                      {b.name} <span className="text-xs text-slate-400">{b.radius_m}m</span>
                    </label>
                  ))}
                  {branches.length === 0 && <span className="text-sm text-amber-600">Chưa có chi nhánh – vào "Chi nhánh, ca, phòng ban" để tạo.</span>}
                </div>
              </Field>
            </div>
          )}

          {tab === "pay" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Hình thức lương">
                  <Select value={comp.salary_type} onChange={(e) => setC({ salary_type: e.target.value as Compensation["salary_type"] })}>
                    <option value="monthly">Theo tháng (ngày công)</option><option value="hourly">Theo giờ</option><option value="shift">Theo ca</option>
                  </Select>
                </Field>
                {comp.salary_type === "monthly" && <Field label="Lương tháng (đ)"><NumberInput value={comp.base_salary} onChange={(v) => setC({ base_salary: v })} /></Field>}
                {comp.salary_type === "hourly" && <Field label="Lương 1 giờ (đ)"><NumberInput value={comp.hourly_rate} onChange={(v) => setC({ hourly_rate: v })} /></Field>}
                {comp.salary_type === "shift" && <Field label="Lương 1 ca (đ)"><NumberInput value={comp.shift_rate} onChange={(v) => setC({ shift_rate: v })} /></Field>}
                <Field label="Lương đóng bảo hiểm (đ)" hint="Để trống = lương tháng"><NumberInput value={comp.insurance_salary} onChange={(v) => setC({ insurance_salary: v || null })} /></Field>
                <Field label="Số người phụ thuộc"><Input type="number" min={0} value={comp.dependents} onChange={(e) => setC({ dependents: Number(e.target.value) })} /></Field>
                <Field label="Mã số thuế"><Input value={comp.tax_code ?? ""} onChange={(e) => setC({ tax_code: e.target.value })} /></Field>
                <Field label="Ngân hàng"><Input value={comp.bank_name ?? ""} onChange={(e) => setC({ bank_name: e.target.value })} /></Field>
                <Field label="Số tài khoản"><Input value={comp.bank_account ?? ""} onChange={(e) => setC({ bank_account: e.target.value })} /></Field>
              </div>
              <div className="flex flex-wrap gap-6">
                <Toggle checked={comp.insurance_enabled} onChange={(v) => setC({ insurance_enabled: v })} label="Đóng BHXH/BHYT/BHTN" />
                <Toggle checked={comp.tax_enabled} onChange={(v) => setC({ tax_enabled: v })} label="Khấu trừ thuế TNCN" />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="label mb-0">Phụ cấp cố định hàng tháng</span>
                  <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setAllows([...allows, { name: "", amount: 0, taxable: false, per_workday: false }])}>Thêm</Button>
                </div>
                {allows.length === 0 && <p className="text-sm text-slate-500">Chưa có phụ cấp.</p>}
                <div className="space-y-2">
                  {allows.map((a, i) => (
                    <div key={i} className="grid grid-cols-12 items-center gap-2">
                      <Input className="col-span-4" placeholder="Tên (VD: Ăn trưa)" value={a.name} onChange={(e) => setAllows(allows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <NumberInput className="col-span-3" value={a.amount} onChange={(v) => setAllows(allows.map((x, j) => j === i ? { ...x, amount: v } : x))} />
                      <div className="col-span-2"><Checkbox checked={a.per_workday} onChange={(v) => setAllows(allows.map((x, j) => j === i ? { ...x, per_workday: v } : x))} label="/ngày công" /></div>
                      <div className="col-span-2"><Checkbox checked={a.taxable} onChange={(v) => setAllows(allows.map((x, j) => j === i ? { ...x, taxable: v } : x))} label="Chịu thuế" /></div>
                      <button className="col-span-1 text-slate-400 hover:text-red-600" onClick={() => setAllows(allows.filter((_, j) => j !== i))} aria-label="Xoá"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "account" && (
            isNew ? (
              <div className="space-y-3">
                <Field label="Mật khẩu ban đầu *" hint="Nhân viên đăng nhập bằng mã nhân viên (hoặc email) + mật khẩu này, sau đó tự đổi">
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" />
                </Field>
                <Button size="sm" variant="secondary" onClick={() => setPassword(Math.random().toString(36).slice(2, 6) + "@" + Math.floor(1000 + Math.random() * 9000))}>Tạo ngẫu nhiên</Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-2 text-sm">Trạng thái: {emp.active ? <Badge tone="green">Đang làm việc</Badge> : <Badge tone="red">Đã khoá</Badge>}</div>
                <div className="flex items-end gap-2">
                  <Field label="Đặt mật khẩu mới" className="flex-1"><Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" /></Field>
                  <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} disabled={password.length < 6} onClick={() => account("password")}>Đặt</Button>
                </div>
                <div className="flex items-end gap-2">
                  <Field label="Email đăng nhập" className="flex-1" hint="Để trống = đăng nhập bằng mã nhân viên"><Input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} /></Field>
                  <Button variant="secondary" onClick={() => account("email")}>Đổi</Button>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><Smartphone className="h-4 w-4" />
                      {emp.device_id ? <span>{emp.device_label} · đăng ký {fmtDateTime(emp.device_bound_at)}</span> : <span className="text-slate-500">Chưa đăng ký thiết bị</span>}
                    </div>
                    {emp.device_id && <Button size="sm" variant="secondary" onClick={() => account("device")}>Gỡ thiết bị</Button>}
                  </div>
                </div>
                {emp.active ? <Button variant="danger" icon={<Lock className="h-4 w-4" />} onClick={() => account("lock")}>Khoá tài khoản (nghỉ việc)</Button>
                  : <Button variant="success" icon={<Unlock className="h-4 w-4" />} onClick={() => account("unlock")}>Mở khoá tài khoản</Button>}
              </div>
            )
          )}

          {tab === "leave" && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Số ngày phép năm" hint="Để trống = theo mặc định công ty">
                  <Input type="number" step="0.5" value={emp.annual_leave_days ?? ""} onChange={(e) => set({ annual_leave_days: e.target.value === "" ? null : Number(e.target.value) })} />
                </Field>
                <Field label={`Phép tồn chuyển sang năm ${new Date().getFullYear()}`}><Input type="number" step="0.5" value={carry} onChange={(e) => setCarry(Number(e.target.value))} /></Field>
              </div>
              {balance && (
                <div className="grid grid-cols-5 gap-2 rounded-xl bg-slate-50 p-3 text-center text-sm dark:bg-slate-800/50">
                  <div><b>{num(balance.quota)}</b><div className="text-xs text-slate-500">Tiêu chuẩn</div></div>
                  <div><b>{num(balance.accrued)}</b><div className="text-xs text-slate-500">Đến nay</div></div>
                  <div><b>{num(balance.carried)}</b><div className="text-xs text-slate-500">Tồn</div></div>
                  <div><b>{num(balance.used)}</b><div className="text-xs text-slate-500">Đã dùng</div></div>
                  <div><b className="text-brand-700">{num(balance.remaining)}</b><div className="text-xs text-slate-500">Còn lại</div></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
