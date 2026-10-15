import { useRefData } from "@/app/refdata";
import { fmtMonth, money, num } from "@/lib/format";
import { ADJ_LABEL } from "@/lib/labels";
import type { PayslipDetail } from "@/lib/payroll/types";
import type { ReactNode } from "react";

/** Phiếu lương chi tiết – in được (Ctrl+P → Lưu PDF) */
export default function PayslipView({ month, employee, detail }: {
  month: string; employee: { full_name: string; code: string; department_id?: string | null }; detail: PayslipDetail;
}) {
  const { settings, deptName } = useRefData();
  const d = detail;
  const ts = d.timesheet;
  const otH = ts.ot_hours.weekday + ts.ot_hours.weekend + ts.ot_hours.holiday;
  return (
    <div className="print-area space-y-4 text-sm">
      <div className="text-center">
        <div className="text-xs uppercase tracking-wider text-slate-500">{settings?.company_name}</div>
        <h2 className="text-lg font-bold">PHIẾU LƯƠNG THÁNG {fmtMonth(month)}</h2>
        <div>{employee.full_name} · {employee.code}{employee.department_id ? ` · ${deptName(employee.department_id)}` : ""}</div>
      </div>

      <Section title="Ngày công">
        <Row label="Công chuẩn" value={num(ts.standard_days)} />
        <Row label="Công đi làm" value={num(ts.work_days)} />
        <Row label="Nghỉ phép có lương" value={num(ts.paid_leave_days)} />
        <Row label="Nghỉ lễ" value={num(ts.holiday_days)} />
        <Row label="Nghỉ không lương / vắng" value={num(ts.unpaid_leave_days + ts.absent_days + ts.sick_days)} />
        <Row label="Công tính lương" value={num(ts.paid_days)} bold />
        {d.salary_type === "hourly" && <Row label="Giờ làm thực tế" value={num(ts.worked_hours) + " giờ"} />}
        <Row label="Đi muộn / về sớm" value={`${ts.late_count} lần (${ts.late_minutes}′) / ${ts.early_count} lần (${ts.early_minutes}′)`} />
        {otH > 0 && <Row label="Tăng ca (thường / nghỉ / lễ)" value={`${num(ts.ot_hours.weekday)} / ${num(ts.ot_hours.weekend)} / ${num(ts.ot_hours.holiday)} giờ`} />}
      </Section>

      <Section title="Thu nhập">
        <Row label={d.salary_type === "monthly" ? `Lương theo ngày công (${money(d.rates.daily)}/ngày)` : d.salary_type === "hourly" ? `Lương theo giờ (${money(d.rates.hourly)}/giờ)` : `Lương theo ca (${money(d.rates.shift)}/ca)`} value={money(d.base_pay)} />
        {d.ot_pay > 0 && <Row label="Lương tăng ca" value={money(d.ot_pay)} />}
        {d.allowances.map((a, i) => <Row key={i} label={`${a.name}${a.taxable ? "" : " (không chịu thuế)"}`} value={money(a.amount)} />)}
        {d.adjustments.filter((a) => a.type === "bonus").map((a, i) => <Row key={"b" + i} label={`Thưởng${a.note ? ": " + a.note : ""}`} value={money(a.amount)} />)}
        <Row label="TỔNG THU NHẬP" value={money(d.gross)} bold />
      </Section>

      <Section title="Khấu trừ">
        <Row label={`BHXH (8%) – lương đóng BH ${money(d.insurance_salary)}`} value={money(d.insurance.bhxh)} />
        <Row label="BHYT (1,5%)" value={money(d.insurance.bhyt)} />
        <Row label="BHTN (1%)" value={money(d.insurance.bhtn)} />
        {d.union_fee > 0 && <Row label="Đoàn phí công đoàn" value={money(d.union_fee)} />}
        <Row label={`Thuế TNCN (thu nhập tính thuế ${money(d.assessable_income)})`} value={money(d.pit)} />
        {d.attendance_penalty > 0 && <Row label="Phạt đi muộn/về sớm/vắng" value={money(d.attendance_penalty)} />}
        {d.adjustments.filter((a) => ["penalty", "advance", "deduction"].includes(a.type)).map((a, i) => (
          <Row key={"d" + i} label={`${ADJ_LABEL[a.type]}${a.note ? ": " + a.note : ""}`} value={money(a.amount)} />
        ))}
      </Section>

      <div className="flex items-center justify-between rounded-xl bg-brand-700 px-4 py-3 text-white">
        <span className="font-medium">THỰC LĨNH</span>
        <span className="text-xl font-bold tabular-nums">{money(d.net)} đ</span>
      </div>
      <p className="text-xs text-slate-500">
        Giảm trừ gia cảnh {money(d.family_deduction)} đ. Phần lương tăng ca vượt mức thường ({money(d.ot_tax_exempt)} đ) được miễn thuế TNCN.
        Công ty đóng thêm BHXH/BHYT/BHTN: {money(d.employer_insurance.total)} đ.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{children}</div>
    </div>
  );
}

function Row({ label, value, bold }: { label: ReactNode; value: ReactNode; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 px-3 py-1.5 ${bold ? "font-semibold" : ""}`}>
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );
}
