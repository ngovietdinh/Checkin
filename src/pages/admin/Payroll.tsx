import { Calculator, Download, Lock, Plus, Printer, Send, Trash2, Unlock, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import PayslipView from "@/components/PayslipView";
import { Badge, Button, Card, Checkbox, Empty, ErrorBox, Field, Input, Loading, Modal, MonthPicker, NumberInput, PageHeader, SearchSelect, Select, Stat, Tabs, useUi } from "@/components/ui";
import * as employeesApi from "@/lib/api/employees";
import * as payrollApi from "@/lib/api/payroll";
import { exportXlsx, readXlsx } from "@/lib/excel";
import { fmtDateTime, fmtMonth, money, monthStr, num } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { ADJ_LABEL, PERIOD_LABEL, PERIOD_TONE } from "@/lib/labels";
import { computePayslip } from "@/lib/payroll/engine";
import { loadMonth } from "@/lib/payroll/loader";
import type { AdjustmentType, Payslip } from "@/lib/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

export default function Payroll() {
  const { isAdmin } = useAuth();
  const { person, people, deptName } = useRefData();
  const ui = useUi();
  const [month, setMonth] = useState(() => monthStr());
  const [tab, setTab] = useState<"slips" | "adjust">("slips");
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<Payslip | null>(null);
  const [adj, setAdj] = useState<{ employee_id: string | null; type: AdjustmentType; amount: number; taxable: boolean; note: string } | null>(null);

  const data = useAsync(async () => {
    const [period, slips, adjustments, comps] = await Promise.all([
      payrollApi.getPeriod(month), payrollApi.listPayslips(month), payrollApi.listAdjustments(month), employeesApi.listCompensation(),
    ]);
    return { period, slips, adjustments, comps: new Map(comps.map((c) => [c.employee_id, c])) };
  }, [month]);

  const period = data.data?.period;
  const locked = period?.status === "locked" || period?.status === "published";
  const slips = useMemo(() => [...(data.data?.slips ?? [])].sort((a, b) => (person(a.employee_id)?.code ?? "").localeCompare(person(b.employee_id)?.code ?? "")), [data.data, person]);
  const sum = (f: (p: Payslip) => number) => slips.reduce((t, p) => t + f(p), 0);
  const totals = {
    gross: sum((p) => Number(p.gross)), net: sum((p) => Number(p.net)),
    ins: sum((p) => p.detail.insurance.total), pit: sum((p) => p.detail.pit),
    er: sum((p) => p.detail.employer_insurance.total),
  };

  const calculate = async () => {
    setBusy("calc");
    try {
      await payrollApi.ensurePeriod(month);
      const emps = await employeesApi.listEmployees();
      const md = await loadMonth(month, { employees: emps, withPay: true });
      const rows = md.employees.map((e) => {
        const d = computePayslip(md.inputs.get(e.id)!);
        return { employee_id: e.id, gross: d.gross, net: d.net, detail: d, manual_override: null };
      });
      await payrollApi.savePayslips(month, rows);
      await payrollApi.deletePayslipsExcept(month, rows.map((r) => r.employee_id));
      ui.toast(`Đã tính lương cho ${rows.length} nhân viên`);
      data.reload(true);
    } catch (e) { ui.error(e); } finally { setBusy(null); }
  };

  const setStatus = async (s: "draft" | "locked" | "published") => {
    const msg = { locked: "Sau khi chốt, dữ liệu chấm công và điều chỉnh của tháng này bị khoá.", published: "Nhân viên sẽ xem được phiếu lương và nhận thông báo.", draft: "Mở lại để chỉnh sửa và tính lại." }[s];
    if (!(await ui.confirm({ title: { locked: "Chốt bảng lương?", published: "Công bố phiếu lương?", draft: "Mở lại kỳ lương?" }[s], message: msg }))) return;
    setBusy(s);
    try { await payrollApi.setPeriodStatus(month, s); ui.toast("Đã cập nhật"); data.reload(true); } catch (e) { ui.error(e); } finally { setBusy(null); }
  };

  const saveAdj = async () => {
    if (!adj?.employee_id || !adj.amount) return;
    try {
      await payrollApi.saveAdjustment({ employee_id: adj.employee_id, month, type: adj.type, amount: adj.amount, taxable: adj.taxable, note: adj.note || null });
      ui.toast("Đã thêm – bấm Tính lương để cập nhật bảng lương");
      setAdj(null);
      data.reload(true);
    } catch (e) { ui.error(e); }
  };

  const importAdj = async (f?: File) => {
    if (!f) return;
    try {
      const rows = await readXlsx(f);
      const byCode = new Map(people.map((p) => [p.code.toUpperCase(), p.id]));
      const typeMap: Record<string, AdjustmentType> = { thuong: "bonus", "phu cap": "allowance", phat: "penalty", "tam ung": "advance", "khau tru": "deduction" };
      const items = rows.map((r) => ({
        employee_id: byCode.get((r["Mã NV"] ?? "").trim().toUpperCase()), month,
        type: typeMap[norm(r["Loại"] ?? "")], amount: Number(String(r["Số tiền"] ?? "").replace(/[^\d]/g, "")),
        taxable: !["khong", "no", "0"].includes(norm(r["Chịu thuế"] ?? "co")), note: r["Ghi chú"] || null,
      }));
      const bad = items.filter((i) => !i.employee_id || !i.type || !i.amount).length;
      const good = items.filter((i) => i.employee_id && i.type && i.amount);
      if (good.length) await payrollApi.insertAdjustments(good);
      ui.toast(`Đã nhập ${good.length} khoản${bad ? `, bỏ qua ${bad} dòng lỗi` : ""}`, bad ? "info" : "success");
      data.reload(true);
    } catch (e) { ui.error(e); }
  };

  const exportPayroll = () => exportXlsx(`bang-luong_${month}`, [{
    name: "Bảng lương",
    title: `BẢNG LƯƠNG THÁNG ${fmtMonth(month)}`,
    columns: [
      { header: "Mã NV", key: "code", width: 9 }, { header: "Họ tên", key: "name", width: 24 }, { header: "Phòng ban", key: "dept", width: 16 },
      { header: "Công chuẩn", key: "std", width: 8 }, { header: "Công tính lương", key: "paid", width: 9 }, { header: "Giờ OT", key: "ot", width: 7 },
      { header: "Lương chính", key: "base", width: 13, numFmt: "#,##0" }, { header: "Lương OT", key: "otpay", width: 12, numFmt: "#,##0" },
      { header: "Phụ cấp", key: "allow", width: 12, numFmt: "#,##0" }, { header: "Thưởng", key: "bonus", width: 12, numFmt: "#,##0" },
      { header: "Tổng thu nhập", key: "gross", width: 14, numFmt: "#,##0" }, { header: "BHXH", key: "bhxh", width: 11, numFmt: "#,##0" },
      { header: "BHYT", key: "bhyt", width: 10, numFmt: "#,##0" }, { header: "BHTN", key: "bhtn", width: 10, numFmt: "#,##0" },
      { header: "Thuế TNCN", key: "pit", width: 11, numFmt: "#,##0" }, { header: "Phạt", key: "pen", width: 10, numFmt: "#,##0" },
      { header: "Tạm ứng", key: "adv", width: 11, numFmt: "#,##0" }, { header: "Khấu trừ khác", key: "ded", width: 11, numFmt: "#,##0" },
      { header: "Thực lĩnh", key: "net", width: 14, numFmt: "#,##0" }, { header: "BH công ty đóng", key: "er", width: 13, numFmt: "#,##0" },
      { header: "Ngân hàng", key: "bank", width: 14 }, { header: "Số tài khoản", key: "acc", width: 18 },
    ],
    rows: slips.map((p) => {
      const e = person(p.employee_id);
      const d = p.detail;
      const c = data.data?.comps.get(p.employee_id);
      return {
        code: e?.code, name: e?.full_name, dept: deptName(e?.department_id), std: d.timesheet.standard_days, paid: d.timesheet.paid_days,
        ot: d.timesheet.ot_hours.weekday + d.timesheet.ot_hours.weekend + d.timesheet.ot_hours.holiday, base: d.base_pay, otpay: d.ot_pay,
        allow: d.allowance_total, bonus: d.bonus_total, gross: d.gross, bhxh: d.insurance.bhxh, bhyt: d.insurance.bhyt, bhtn: d.insurance.bhtn,
        pit: d.pit, pen: d.penalty_total, adv: d.advance_total, ded: d.deduction_total, net: d.net, er: d.employer_insurance.total,
        bank: c?.bank_name, acc: c?.bank_account,
      };
    }),
  }, {
    name: "Chuyển khoản",
    columns: [{ header: "STT", key: "i", width: 6 }, { header: "Họ tên", key: "name", width: 26 }, { header: "Ngân hàng", key: "bank", width: 18 },
      { header: "Số tài khoản", key: "acc", width: 20 }, { header: "Số tiền", key: "net", width: 15, numFmt: "#,##0" }, { header: "Nội dung", key: "memo", width: 30 }],
    rows: slips.filter((p) => Number(p.net) > 0).map((p, i) => {
      const c = data.data?.comps.get(p.employee_id);
      return { i: i + 1, name: person(p.employee_id)?.full_name, bank: c?.bank_name, acc: c?.bank_account, net: Number(p.net), memo: `Luong thang ${fmtMonth(month)}` };
    }),
  }]);

  return (
    <div className="space-y-4">
      <PageHeader title="Tính lương" subtitle="Tự động từ bảng công, đơn tăng ca, phụ cấp, thưởng/phạt; BHXH và thuế TNCN theo cài đặt"
        actions={<MonthPicker value={month} onChange={setMonth} />} />

      {data.error ? <ErrorBox error={data.error} onRetry={() => data.reload()} /> : data.loading ? <Loading /> : (
        <>
          <Card bodyClass="flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm">Kỳ lương {fmtMonth(month)}:</span>
            <Badge tone={period ? PERIOD_TONE[period.status] : "gray"}>{period ? PERIOD_LABEL[period.status] : "Chưa tính"}</Badge>
            {period?.published_at && <span className="text-xs text-slate-500">công bố {fmtDateTime(period.published_at)}</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              {!locked && <Button icon={<Calculator className="h-4 w-4" />} loading={busy === "calc"} onClick={calculate}>{slips.length ? "Tính lại" : "Tính lương"}</Button>}
              {period?.status === "draft" && slips.length > 0 && <Button variant="secondary" icon={<Lock className="h-4 w-4" />} loading={busy === "locked"} onClick={() => setStatus("locked")}>Chốt</Button>}
              {period?.status === "locked" && <Button variant="success" icon={<Send className="h-4 w-4" />} loading={busy === "published"} onClick={() => setStatus("published")}>Công bố cho nhân viên</Button>}
              {locked && isAdmin && <Button variant="ghost" icon={<Unlock className="h-4 w-4" />} loading={busy === "draft"} onClick={() => setStatus("draft")}>Mở lại</Button>}
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportPayroll} disabled={!slips.length}>Xuất Excel</Button>
            </div>
          </Card>

          {month >= monthStr() && !locked && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Tháng {fmtMonth(month)} chưa kết thúc: các ngày sau hôm nay chưa được tính công nên lương hiện là tạm tính. Hãy tính lại vào cuối tháng trước khi chốt.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Số nhân viên" value={slips.length} />
            <Stat label="Tổng thu nhập" value={money(totals.gross)} tone="blue" />
            <Stat label="BH người lao động" value={money(totals.ins)} />
            <Stat label="Thuế TNCN" value={money(totals.pit)} />
            <Stat label="Thực trả" value={money(totals.net)} tone="green" />
            <Stat label="Tổng chi phí công ty" value={money(totals.gross + totals.er)} sub={`gồm BH công ty ${money(totals.er)}`} tone="amber" />
          </div>

          <Tabs value={tab} onChange={setTab} items={[{ value: "slips", label: "Bảng lương" }, { value: "adjust", label: "Thưởng / phạt / tạm ứng", count: data.data?.adjustments.length }]} />

          {tab === "slips" ? (
            <Card bodyClass="overflow-x-auto">
              {slips.length === 0 ? <Empty text={'Chưa tính lương tháng này. Bấm "Tính lương".'} /> : (
                <table className="table">
                  <thead><tr><th>Nhân viên</th><th className="text-right">Công</th><th className="text-right">Lương chính</th><th className="text-right">OT</th><th className="text-right">Phụ cấp + thưởng</th><th className="text-right">Tổng TN</th><th className="text-right">BH</th><th className="text-right">Thuế</th><th className="text-right">Trừ khác</th><th className="text-right">Thực lĩnh</th></tr></thead>
                  <tbody>
                    {slips.map((p) => {
                      const e = person(p.employee_id);
                      const d = p.detail;
                      return (
                        <tr key={p.id} className="cursor-pointer" onClick={() => setView(p)}>
                          <td><div className="font-medium">{e?.full_name}</div><div className="text-xs text-slate-500">{e?.code} · {deptName(e?.department_id)}</div></td>
                          <td className="text-right tabular-nums">{num(d.timesheet.paid_days)}/{d.timesheet.standard_days}</td>
                          <td className="text-right tabular-nums">{money(d.base_pay)}</td>
                          <td className="text-right tabular-nums">{d.ot_pay ? money(d.ot_pay) : "–"}</td>
                          <td className="text-right tabular-nums">{money(d.allowance_total + d.bonus_total)}</td>
                          <td className="text-right font-medium tabular-nums">{money(d.gross)}</td>
                          <td className="text-right tabular-nums">{money(d.insurance.total)}</td>
                          <td className="text-right tabular-nums">{money(d.pit)}</td>
                          <td className="text-right tabular-nums">{money(d.penalty_total + d.advance_total + d.deduction_total + d.union_fee)}</td>
                          <td className={`text-right font-semibold tabular-nums ${d.net < 0 ? "text-red-600" : "text-brand-700 dark:text-brand-400"}`}>{money(d.net)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Card>
          ) : (
            <Card title="Các khoản điều chỉnh trong tháng" actions={!locked && <>
              <Button size="sm" variant="secondary" onClick={() => exportXlsx("mau-dieu-chinh-luong", [{ name: "Điều chỉnh", columns: ["Mã NV", "Loại", "Số tiền", "Chịu thuế", "Ghi chú"].map((h) => ({ header: h, key: h, width: 16 })), rows: [{ "Mã NV": "NV001", "Loại": "Thưởng", "Số tiền": 1000000, "Chịu thuế": "Có", "Ghi chú": "Thưởng KPI" }, { "Mã NV": "NV002", "Loại": "Tạm ứng", "Số tiền": 2000000, "Chịu thuế": "Không", "Ghi chú": "" }] }])}>File mẫu</Button>
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700"><Upload className="h-4 w-4" />Nhập Excel<input type="file" accept=".xlsx" className="hidden" onChange={(e) => { importAdj(e.target.files?.[0]); e.target.value = ""; }} /></label>
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setAdj({ employee_id: null, type: "bonus", amount: 0, taxable: true, note: "" })}>Thêm</Button>
            </>} bodyClass="overflow-x-auto">
              {!data.data?.adjustments.length ? <Empty text="Chưa có khoản điều chỉnh" /> : (
                <table className="table">
                  <thead><tr><th>Nhân viên</th><th>Loại</th><th className="text-right">Số tiền</th><th>Chịu thuế</th><th>Ghi chú</th><th /></tr></thead>
                  <tbody>
                    {data.data.adjustments.map((a) => (
                      <tr key={a.id}>
                        <td>{person(a.employee_id)?.full_name} <span className="text-xs text-slate-500">{person(a.employee_id)?.code}</span></td>
                        <td><Badge tone={a.type === "bonus" || a.type === "allowance" ? "green" : "red"}>{ADJ_LABEL[a.type]}</Badge></td>
                        <td className="text-right tabular-nums">{money(a.amount)}</td>
                        <td>{a.type === "bonus" || a.type === "allowance" ? (a.taxable ? "Có" : "Không") : "–"}</td>
                        <td className="text-sm">{a.note}</td>
                        <td>{!locked && <button className="text-slate-400 hover:text-red-600" aria-label="Xoá" onClick={async () => { await payrollApi.deleteAdjustment(a.id).catch(ui.error); data.reload(true); }}><Trash2 className="h-4 w-4" /></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </>
      )}

      <Modal open={!!view} onClose={() => setView(null)} title="Phiếu lương" size="lg"
        footer={<Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>In / Lưu PDF</Button>}>
        {view && <PayslipView month={month} employee={person(view.employee_id) ?? { full_name: "?", code: "?" }} detail={view.detail} />}
      </Modal>

      <Modal open={!!adj} onClose={() => setAdj(null)} title="Thêm khoản điều chỉnh" size="sm"
        footer={<><Button variant="secondary" onClick={() => setAdj(null)}>Huỷ</Button><Button onClick={saveAdj} disabled={!adj?.employee_id || !adj?.amount}>Thêm</Button></>}>
        {adj && (
          <div className="space-y-3">
            <Field label="Nhân viên"><SearchSelect items={people} value={adj.employee_id} onChange={(v) => setAdj({ ...adj, employee_id: v })} getLabel={(p) => p.full_name} getSub={(p) => p.code} /></Field>
            <Field label="Loại">
              <Select value={adj.type} onChange={(e) => setAdj({ ...adj, type: e.target.value as AdjustmentType })}>
                {Object.entries(ADJ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Số tiền (đ)"><NumberInput value={adj.amount} onChange={(v) => setAdj({ ...adj, amount: v })} /></Field>
            {(adj.type === "bonus" || adj.type === "allowance") && <Checkbox checked={adj.taxable} onChange={(v) => setAdj({ ...adj, taxable: v })} label="Tính vào thu nhập chịu thuế" />}
            <Field label="Ghi chú"><Input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
