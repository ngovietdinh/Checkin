import clsx from "clsx";
import { Download, FileSpreadsheet, Plus, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useRefData } from "@/app/refdata";
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Input, Loading, Modal, PageHeader, Select, useUi } from "@/components/ui";
import * as employeesApi from "@/lib/api/employees";
import * as orgApi from "@/lib/api/org";
import { exportXlsx, readXlsx } from "@/lib/excel";
import { fmtDate, money, WEEKDAYS } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { ROLE_LABEL } from "@/lib/labels";
import type { Role } from "@/lib/types";
import EmployeeEditor from "./EmployeeEditor";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

const TEMPLATE_COLS = [
  "Mã NV*", "Họ tên*", "Mật khẩu*", "Email", "Số điện thoại", "Giới tính", "Ngày sinh", "Vai trò", "Phòng ban", "Chức vụ",
  "Mã quản lý", "Ngày vào làm", "Mã ca mặc định", "Ngày làm", "Chi nhánh", "Loại lương", "Lương tháng", "Lương giờ", "Lương ca",
  "Lương đóng BH", "Người phụ thuộc", "Ngân hàng", "Số tài khoản", "Mã số thuế",
];
const ROLE_FROM_TEXT: Record<string, Role> = { "nhan vien": "employee", "truong nhom": "leader", "quan ly": "manager", "nhan su": "hr", "ke toan": "hr" };

/** "T2-T6", "T2,T4,T6", "T2-CN" -> [1..7] */
function parseWorkDays(s: string): number[] {
  if (!s?.trim()) return [1, 2, 3, 4, 5];
  const idx = (t: string) => { const x = norm(t.trim()); return x === "cn" ? 7 : Number(x.replace(/^t/, "")) - 1; };
  const out = new Set<number>();
  for (const part of s.split(/[,;]/)) {
    const [a, b] = part.split("-");
    if (b) for (let i = idx(a); i <= idx(b); i++) out.add(i); else out.add(idx(a));
  }
  return [...out].filter((n) => n >= 1 && n <= 7).sort();
}
const toNum = (s?: string) => Number(String(s ?? "").replace(/[^\d.-]/g, "")) || 0;
const toDate = (s?: string) => {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

export default function Employees() {
  const { departments, positions, branches, shifts, deptName, personName, reload: reloadRef } = useRefData();
  const ui = useUi();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [editId, setEditId] = useState<string | null | undefined>(undefined);
  const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null);
  const [importResult, setImportResult] = useState<{ code: string; ok: boolean; error?: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const data = useAsync(async () => {
    const [emps, comps, eb] = await Promise.all([employeesApi.listEmployees(), employeesApi.listCompensation(), employeesApi.listEmployeeBranches()]);
    return { emps, comps: new Map(comps.map((c) => [c.employee_id, c])), eb };
  }, []);

  const rows = useMemo(() => (data.data?.emps ?? []).filter((e) =>
    (status === "all" || (status === "active" ? e.active : !e.active)) && (!dept || e.department_id === dept) &&
    (!q || norm(`${e.full_name} ${e.code} ${e.phone ?? ""} ${e.email ?? ""}`).includes(norm(q)))), [data.data, q, dept, status]);
  const branchesOf = (id: string) => (data.data?.eb ?? []).filter((x) => x.employee_id === id).map((x) => branches.find((b) => b.id === x.branch_id)?.name).filter(Boolean).join(", ");

  const downloadTemplate = () => exportXlsx("mau-nhap-nhan-vien", [{
    name: "Nhân viên",
    columns: TEMPLATE_COLS.map((h) => ({ header: h, key: h, width: Math.max(12, h.length + 2) })),
    rows: [{
      "Mã NV*": "NV001", "Họ tên*": "Nguyễn Văn An", "Mật khẩu*": "Abc@1234", "Email": "", "Số điện thoại": "0901234567", "Giới tính": "Nam",
      "Ngày sinh": "15/05/1995", "Vai trò": "Nhân viên", "Phòng ban": departments[0]?.name ?? "Kinh doanh", "Chức vụ": positions[0]?.name ?? "Nhân viên",
      "Mã quản lý": "", "Ngày vào làm": "01/01/2026", "Mã ca mặc định": shifts[0]?.code ?? "HC", "Ngày làm": "T2-T6", "Chi nhánh": branches[0]?.name ?? "",
      "Loại lương": "Tháng", "Lương tháng": 10000000, "Lương giờ": "", "Lương ca": "", "Lương đóng BH": "", "Người phụ thuộc": 0,
      "Ngân hàng": "Vietcombank", "Số tài khoản": "", "Mã số thuế": "",
    }],
  }, {
    name: "Hướng dẫn",
    columns: [{ header: "Cột", key: "c", width: 18 }, { header: "Cách điền", key: "d", width: 90 }],
    rows: [
      { c: "Vai trò", d: "Nhân viên / Trưởng nhóm / Quản lý / Nhân sự" },
      { c: "Phòng ban, Chức vụ", d: "Ghi tên; chưa có sẽ được tạo tự động" },
      { c: "Mã quản lý", d: "Mã NV của người duyệt đơn trực tiếp (có thể là người trong cùng file)" },
      { c: "Ngày làm", d: "VD: T2-T6, T2-T7, T2,T4,T6, T2-CN" },
      { c: "Chi nhánh", d: "Tên chi nhánh, nhiều chi nhánh cách nhau bởi dấu ;" },
      { c: "Loại lương", d: "Tháng / Giờ / Ca" },
      { c: "Ngày", d: "dd/mm/yyyy hoặc yyyy-mm-dd" },
    ],
  }]);

  const runImport = async () => {
    if (!importRows) return;
    setBusy(true);
    try {
      // tạo phòng ban / chức vụ còn thiếu
      const deptMap = new Map(departments.map((d) => [norm(d.name), d.id]));
      const posMap = new Map(positions.map((p) => [norm(p.name), p.id]));
      for (const r of importRows) {
        const dn = r["Phòng ban"]?.trim();
        if (dn && !deptMap.has(norm(dn))) deptMap.set(norm(dn), (await orgApi.saveDepartment({ name: dn })).id);
        const pn = r["Chức vụ"]?.trim();
        if (pn && !posMap.has(norm(pn))) posMap.set(norm(pn), (await orgApi.savePosition({ name: pn })).id);
      }
      const shiftMap = new Map(shifts.map((s) => [norm(s.code), s.id]));
      const branchMap = new Map(branches.map((b) => [norm(b.name), b.id]));
      const payload = importRows.map((r) => {
        const lt = norm(r["Loại lương"] ?? "");
        return {
          code: r["Mã NV*"]?.trim().toUpperCase(), full_name: r["Họ tên*"]?.trim(), password: r["Mật khẩu*"]?.trim(),
          email: r["Email"]?.trim() || null, phone: r["Số điện thoại"]?.trim() || null,
          gender: norm(r["Giới tính"] ?? "") === "nam" ? "male" : norm(r["Giới tính"] ?? "") === "nu" ? "female" : null,
          dob: toDate(r["Ngày sinh"]), role: ROLE_FROM_TEXT[norm(r["Vai trò"] ?? "")] ?? "employee",
          department_id: deptMap.get(norm(r["Phòng ban"] ?? "")) ?? null, position_id: posMap.get(norm(r["Chức vụ"] ?? "")) ?? null,
          join_date: toDate(r["Ngày vào làm"]), default_shift_id: shiftMap.get(norm(r["Mã ca mặc định"] ?? "")) ?? null,
          work_days: parseWorkDays(r["Ngày làm"]),
          branch_ids: (r["Chi nhánh"] ?? "").split(";").map((x) => branchMap.get(norm(x.trim()))).filter(Boolean) as string[],
          compensation: {
            salary_type: lt.startsWith("gio") ? "hourly" as const : lt.startsWith("ca") ? "shift" as const : "monthly" as const,
            base_salary: toNum(r["Lương tháng"]), hourly_rate: toNum(r["Lương giờ"]), shift_rate: toNum(r["Lương ca"]),
            insurance_salary: toNum(r["Lương đóng BH"]) || null, dependents: toNum(r["Người phụ thuộc"]),
            bank_name: r["Ngân hàng"] || null, bank_account: r["Số tài khoản"] || null, tax_code: r["Mã số thuế"] || null,
          },
        };
      });
      const results: { code: string; ok: boolean; error?: string }[] = [];
      for (let i = 0; i < payload.length; i += 50) {
        const res = await employeesApi.bulkCreateEmployees(payload.slice(i, i + 50));
        results.push(...res.results);
      }
      // gán quản lý theo mã sau khi đã tạo đủ
      const all = await employeesApi.listEmployees();
      const byCode = new Map(all.map((e) => [e.code, e.id]));
      for (const r of importRows) {
        const mc = r["Mã quản lý"]?.trim().toUpperCase();
        const id = byCode.get(r["Mã NV*"]?.trim().toUpperCase());
        if (mc && id && byCode.get(mc)) await employeesApi.updateEmployee(id, { manager_id: byCode.get(mc)! });
      }
      setImportResult(results);
      setImportRows(null);
      await reloadRef();
      data.reload(true);
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  const doExport = () => exportXlsx("danh-sach-nhan-vien", [{
    name: "Nhân viên",
    columns: [
      { header: "Mã NV", key: "code", width: 10 }, { header: "Họ tên", key: "name", width: 24 }, { header: "Phòng ban", key: "dept", width: 18 },
      { header: "Vai trò", key: "role", width: 14 }, { header: "Quản lý", key: "mgr", width: 22 }, { header: "SĐT", key: "phone", width: 13 },
      { header: "Email", key: "email", width: 24 }, { header: "Ngày vào", key: "join", width: 12 }, { header: "Chi nhánh", key: "branch", width: 24 },
      { header: "Ngày làm", key: "wd", width: 18 }, { header: "Loại lương", key: "st", width: 10 }, { header: "Lương", key: "salary", width: 14, numFmt: "#,##0" },
      { header: "Thiết bị", key: "device", width: 22 }, { header: "Trạng thái", key: "active", width: 12 },
    ],
    rows: rows.map((e) => {
      const c = data.data?.comps.get(e.id);
      return {
        code: e.code, name: e.full_name, dept: deptName(e.department_id), role: ROLE_LABEL[e.role], mgr: e.manager_id ? personName(e.manager_id) : "",
        phone: e.phone, email: e.email, join: fmtDate(e.join_date), branch: branchesOf(e.id),
        wd: e.work_days.map((d) => WEEKDAYS[d - 1].short).join(","), st: c?.salary_type === "hourly" ? "Giờ" : c?.salary_type === "shift" ? "Ca" : "Tháng",
        salary: c ? Number(c.salary_type === "hourly" ? c.hourly_rate : c.salary_type === "shift" ? c.shift_rate : c.base_salary) : null,
        device: e.device_label ?? "", active: e.active ? "Đang làm" : "Đã nghỉ",
      };
    }),
  }]);

  return (
    <div className="space-y-4">
      <PageHeader title="Nhân viên" subtitle={`${(data.data?.emps ?? []).filter((e) => e.active).length} người đang làm việc`}
        actions={<>
          <Button variant="secondary" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={downloadTemplate}>File mẫu</Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
            <Upload className="h-4 w-4" />Nhập Excel
            <input type="file" accept=".xlsx" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) { try { setImportRows(await readXlsx(f)); } catch (err) { ui.error(err); } }
            }} />
          </label>
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={doExport}>Xuất Excel</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditId(null)}>Thêm nhân viên</Button>
        </>} />
      <div className="flex flex-wrap gap-2">
        <div className="relative w-72"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Tìm tên, mã, SĐT, email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
          <option value="">Tất cả phòng ban</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto">
          <option value="active">Đang làm việc</option><option value="inactive">Đã nghỉ / khoá</option><option value="all">Tất cả</option>
        </Select>
      </div>
      {data.error ? <ErrorBox error={data.error} onRetry={() => data.reload()} /> : (
        <Card bodyClass="overflow-x-auto" title={`${rows.length} nhân viên`}>
          {data.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="table">
              <thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Vai trò</th><th>Quản lý</th><th>Chi nhánh</th><th className="text-right">Lương</th><th>Thiết bị</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {rows.map((e) => {
                  const c = data.data?.comps.get(e.id);
                  return (
                    <tr key={e.id} className="cursor-pointer" onClick={() => setEditId(e.id)}>
                      <td><div className="flex items-center gap-2"><Avatar name={e.full_name} url={e.avatar_url} size={32} /><div><div className="font-medium">{e.full_name}</div><div className="text-xs text-slate-500">{e.code}{e.phone && ` · ${e.phone}`}</div></div></div></td>
                      <td>{deptName(e.department_id)}<div className="text-xs text-slate-500">{positions.find((p) => p.id === e.position_id)?.name}</div></td>
                      <td><Badge tone={e.role === "employee" ? "gray" : e.role === "admin" || e.role === "hr" ? "violet" : "blue"}>{ROLE_LABEL[e.role]}</Badge></td>
                      <td className="text-sm">{e.manager_id ? personName(e.manager_id) : "–"}</td>
                      <td className={clsx("max-w-48 truncate text-xs", !branchesOf(e.id) && "text-amber-600")}>{branchesOf(e.id) || "Chưa gán"}</td>
                      <td className="text-right tabular-nums">{c ? (c.salary_type === "monthly" ? money(c.base_salary) : c.salary_type === "hourly" ? `${money(c.hourly_rate)}/giờ` : `${money(c.shift_rate)}/ca`) : "–"}</td>
                      <td className="text-xs">{e.device_label ?? <span className="text-slate-400">Chưa</span>}</td>
                      <td>{e.active ? <Badge tone="green">Đang làm</Badge> : <Badge tone="red">Nghỉ từ {fmtDate(e.left_date)}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
      <EmployeeEditor id={editId ?? null} open={editId !== undefined} onClose={() => setEditId(undefined)} onSaved={() => data.reload(true)} />

      <Modal open={!!importRows} onClose={() => setImportRows(null)} title={`Nhập ${importRows?.length ?? 0} nhân viên`} size="xl"
        footer={<><Button variant="secondary" onClick={() => setImportRows(null)}>Huỷ</Button><Button loading={busy} onClick={runImport}>Tạo tài khoản</Button></>}>
        <p className="mb-3 text-sm text-slate-500">Kiểm tra dữ liệu trước khi tạo. Dòng thiếu Mã/Họ tên/Mật khẩu sẽ báo lỗi.</p>
        <div className="max-h-[60vh] overflow-auto">
          <table className="table text-xs">
            <thead><tr>{TEMPLATE_COLS.slice(0, 16).map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{importRows?.map((r, i) => <tr key={i}>{TEMPLATE_COLS.slice(0, 16).map((h) => <td key={h}>{h === "Mật khẩu*" ? "••••" : r[h]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Modal>
      <Modal open={!!importResult} onClose={() => setImportResult(null)} title="Kết quả nhập">
        <p className="mb-2 text-sm">Thành công <b>{importResult?.filter((r) => r.ok).length}</b> / {importResult?.length}</p>
        <div className="max-h-80 space-y-1 overflow-auto text-sm">
          {importResult?.filter((r) => !r.ok).map((r) => <div key={r.code} className="text-red-600">{r.code}: {r.error}</div>)}
        </div>
      </Modal>
    </div>
  );
}
