// Bộ máy tính công & tính lương (hàm thuần, không phụ thuộc backend).
import type {
  AttendanceEntry, DayResult, EmployeeMonthInput, PayrollSettings, PayslipDetail,
  RequestType, TaxBracket, TimesheetSummary,
} from "./types";

const LEAVE_TYPES: RequestType[] = ["leave_annual", "leave_paid", "leave_unpaid", "leave_sick", "business_trip"];
const PAID_LEAVE: RequestType[] = ["leave_annual", "leave_paid"];

export const DEFAULT_EMPLOYER_INSURANCE = { bhxh: 0.175, bhyt: 0.03, bhtn: 0.01 };

// ---------------------------------------------------------------------------
// Ngày tháng (dùng chuỗi YYYY-MM-DD để tránh lệch múi giờ)
// ---------------------------------------------------------------------------
export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function isoDow(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

const round = (n: number) => Math.round(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Thuế TNCN lũy tiến từng phần
// ---------------------------------------------------------------------------
export function progressiveTax(income: number, brackets: TaxBracket[]): number {
  if (income <= 0) return 0;
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upto ?? Infinity;
    if (income <= lower) break;
    tax += (Math.min(income, upper) - lower) * b.rate;
    lower = upper;
  }
  return round(tax);
}

export function standardDays(month: string, workDays: number[], s: PayrollSettings): number {
  if (s.standard_days_mode === "fixed") return s.standard_days_fixed;
  const n = daysInMonth(month).filter((d) => workDays.includes(isoDow(d))).length;
  return n || s.standard_days_fixed;
}

// ---------------------------------------------------------------------------
// Bảng công tháng
// ---------------------------------------------------------------------------
export function computeTimesheet(input: EmployeeMonthInput): { days: DayResult[]; summary: TimesheetSummary } {
  const { month, employee, schedule, shifts, attendance, requests, holidays, settings } = input;
  const today = input.today ?? "9999-12-31";
  const flexible = schedule.length === 0; // không có lịch: mỗi ngày có chấm vào-ra tính 1 công
  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h]));
  const days: DayResult[] = [];

  for (const date of daysInMonth(month)) {
    const day: DayResult = {
      date, status: "off", scheduled: 0, work_credit: 0, paid_leave: 0, unpaid: 0, holiday_credit: 0,
      worked_minutes: 0, late_minutes: 0, early_minutes: 0, late_count: 0, early_count: 0,
      ot_hours: 0, ot_kind: null, leave_type: null,
    };
    days.push(day);

    if (date < employee.join_date || (employee.left_date && date > employee.left_date)) {
      day.status = "not_employed";
      continue;
    }

    const dow = isoDow(date);
    const patternDay = employee.work_days.includes(dow);
    const holiday = holidayMap.get(date);
    const daySchedule = schedule.filter((s) => s.work_date === date);
    const atts = attendance.filter((a) => a.work_date === date && a.check_in_at);
    const leave = requests.find((r) => LEAVE_TYPES.includes(r.type) && r.start_date <= date && date <= r.end_date);

    // tăng ca đã duyệt
    const ot = requests.filter((r) => r.type === "ot" && r.start_date === date)
      .reduce((sum, r) => sum + (r.hours ?? 0), 0);
    if (ot > 0) {
      day.ot_hours = ot;
      day.ot_kind = holiday ? "holiday" : daySchedule.length === 0 && !patternDay ? "weekend" : "weekday";
    }

    // nghỉ lễ có lương rơi vào ngày làm việc trong tuần
    if (holiday?.paid && patternDay) {
      day.holiday_credit = 1;
      day.status = "holiday";
    }

    day.worked_minutes = atts.reduce((s, a) => s + (a.worked_minutes || 0), 0);
    const halfDay = !!leave?.half_day;

    for (const a of atts) {
      if (a.late_minutes > 0 && !a.excused_late && !halfDay) { day.late_count++; day.late_minutes += a.late_minutes; }
      if (a.early_minutes > 0 && !a.excused_early && !halfDay) { day.early_count++; day.early_minutes += a.early_minutes; }
    }

    if (daySchedule.length === 0) {
      if (flexible && atts.some((a) => a.check_out_at || a.missing_checkout || date < today)) {
        const a = atts[0];
        day.work_credit = a.check_out_at ? 1 : settings.missing_checkout_credit;
        day.status = a.check_out_at ? "work" : "missing_checkout";
      } else if (leave && flexible && patternDay) {
        applyLeave(day, leave.type, halfDay ? 0.5 : 1);
      }
      continue;
    }

    // ngày có lịch làm việc
    const used = new Set<AttendanceEntry>();
    let missing = 0;
    let missingCheckout = false;
    for (const sch of daySchedule) {
      const wv = shifts[sch.shift_id]?.work_value ?? 1;
      day.scheduled += wv;
      // lượt tự chấm ngoài khung giờ ca (shift_id rỗng) không được tính cho ca theo lịch;
      // lượt do HR nhập tay / duyệt đơn mà chưa gắn ca thì được ghép vào ca
      const att = atts.find((a) => a.shift_id === sch.shift_id && !used.has(a))
        ?? atts.find((a) => !a.shift_id && a.source && a.source !== "app" && !used.has(a));
      if (!att) { missing += wv; continue; }
      used.add(att);
      if (att.check_out_at) {
        day.work_credit += wv;
      } else if (att.missing_checkout || date < today) {
        day.work_credit += wv * settings.missing_checkout_credit;
        missingCheckout = true;
      } else {
        day.work_credit += wv; // hôm nay, đang làm
      }
    }

    if (leave) {
      let leaveValue: number;
      if (halfDay) {
        leaveValue = round2(day.scheduled * 0.5);
        day.work_credit = Math.min(day.work_credit, day.scheduled - leaveValue);
        missing = Math.max(0, day.scheduled - leaveValue - day.work_credit);
      } else {
        leaveValue = missing;
        missing = 0;
      }
      applyLeave(day, leave.type, leaveValue);
    }

    if (missing > 0) {
      if (date >= today) {
        if (day.work_credit === 0 && day.paid_leave === 0) day.status = "future";
      } else {
        day.unpaid += missing;
        if (day.work_credit === 0 && !leave) day.status = "absent";
      }
    }
    if (day.work_credit > 0 && !leave) {
      day.status = missingCheckout ? "missing_checkout"
        : day.late_count || day.early_count || missing > 0 ? "partial" : "work";
    }
    day.work_credit = round2(day.work_credit);
  }

  const sum = (f: (d: DayResult) => number) => round2(days.reduce((s, d) => s + f(d), 0));
  const std = standardDays(month, employee.work_days, settings);
  const summary: TimesheetSummary = {
    standard_days: std,
    scheduled_days: sum((d) => d.scheduled),
    work_days: sum((d) => d.work_credit),
    paid_leave_days: sum((d) => d.paid_leave),
    holiday_days: sum((d) => d.holiday_credit),
    unpaid_leave_days: sum((d) => (d.leave_type === "leave_unpaid" ? d.unpaid : 0)),
    sick_days: sum((d) => (d.leave_type === "leave_sick" ? d.unpaid : 0)),
    absent_days: sum((d) => (d.leave_type === "leave_unpaid" || d.leave_type === "leave_sick" ? 0 : d.unpaid)),
    paid_days: 0,
    worked_hours: round2(days.reduce((s, d) => s + d.worked_minutes, 0) / 60),
    late_count: sum((d) => d.late_count),
    late_minutes: sum((d) => d.late_minutes),
    early_count: sum((d) => d.early_count),
    early_minutes: sum((d) => d.early_minutes),
    missing_checkout_count: days.filter((d) => d.status === "missing_checkout").length,
    ot_hours: {
      weekday: sum((d) => (d.ot_kind === "weekday" ? d.ot_hours : 0)),
      weekend: sum((d) => (d.ot_kind === "weekend" ? d.ot_hours : 0)),
      holiday: sum((d) => (d.ot_kind === "holiday" ? d.ot_hours : 0)),
    },
  };
  summary.paid_days = round2(summary.work_days + summary.paid_leave_days + summary.holiday_days);
  return { days, summary };
}

function applyLeave(day: DayResult, type: RequestType, value: number) {
  day.leave_type = type;
  if (type === "business_trip") {
    day.work_credit += value;
    day.status = "business_trip";
  } else if (PAID_LEAVE.includes(type)) {
    day.paid_leave += value;
    day.status = "leave_paid";
  } else {
    day.unpaid += value;
    day.status = type === "leave_sick" ? "leave_sick" : "leave_unpaid";
  }
}

// ---------------------------------------------------------------------------
// Tính lương
// ---------------------------------------------------------------------------
export function computePayslip(input: EmployeeMonthInput): PayslipDetail {
  const { compensation: c, settings: s, allowances, adjustments } = input;
  const { summary: ts } = computeTimesheet(input);

  const hoursPerDay = s.hours_per_day || 8;
  const daily = c.salary_type === "monthly" ? c.base_salary / (ts.standard_days || 1)
    : c.salary_type === "hourly" ? c.hourly_rate * hoursPerDay
    : c.shift_rate;
  const hourly = c.salary_type === "hourly" ? c.hourly_rate : daily / hoursPerDay;

  // lương chính
  let basePay: number;
  if (c.salary_type === "monthly") {
    basePay = daily * ts.paid_days;
  } else if (c.salary_type === "hourly") {
    basePay = c.hourly_rate * ts.worked_hours + daily * (ts.paid_leave_days + ts.holiday_days);
  } else {
    basePay = c.shift_rate * ts.paid_days;
  }
  basePay = round(basePay);

  // tăng ca: phần lương bình thường chịu thuế, phần chênh lệch được miễn thuế
  const otHours = ts.ot_hours.weekday + ts.ot_hours.weekend + ts.ot_hours.holiday;
  const otPay = round(hourly * (
    ts.ot_hours.weekday * s.ot_rates.weekday +
    ts.ot_hours.weekend * s.ot_rates.weekend +
    ts.ot_hours.holiday * s.ot_rates.holiday));
  const otExempt = Math.max(0, otPay - round(hourly * otHours));

  // phụ cấp cố định
  const allowanceLines = allowances.map((a) => ({
    name: a.name,
    amount: round(a.per_workday ? a.amount * ts.work_days : a.amount * Math.min(1, ts.paid_days / (ts.standard_days || 1))),
    taxable: a.taxable,
  }));
  const adjAllowance = adjustments.filter((a) => a.type === "allowance");
  for (const a of adjAllowance) allowanceLines.push({ name: a.note || "Phụ cấp khác", amount: a.amount, taxable: a.taxable });
  const allowanceTotal = allowanceLines.reduce((t, a) => t + a.amount, 0);
  const bonuses = adjustments.filter((a) => a.type === "bonus");
  const bonusTotal = bonuses.reduce((t, a) => t + a.amount, 0);

  const gross = basePay + otPay + allowanceTotal + bonusTotal;

  // bảo hiểm bắt buộc (không đóng nếu nghỉ không lương từ 14 ngày làm việc trở lên)
  const insSalary = c.insurance_salary ?? (c.salary_type === "monthly" ? c.base_salary : 0);
  const unpaidDays = ts.unpaid_leave_days + ts.absent_days + ts.sick_days;
  const insOn = s.insurance.enabled && c.insurance_enabled && insSalary > 0 && unpaidDays < 14;
  const insBase = Math.min(insSalary, s.insurance.base_cap || Infinity);
  const insBhtnBase = Math.min(insSalary, s.insurance.bhtn_cap || Infinity);
  const insurance = insOn
    ? { bhxh: round(insBase * s.insurance.bhxh), bhyt: round(insBase * s.insurance.bhyt), bhtn: round(insBhtnBase * s.insurance.bhtn), total: 0 }
    : { bhxh: 0, bhyt: 0, bhtn: 0, total: 0 };
  insurance.total = insurance.bhxh + insurance.bhyt + insurance.bhtn;
  const er = s.insurance.employer ?? DEFAULT_EMPLOYER_INSURANCE;
  const employerInsurance = insOn
    ? { bhxh: round(insBase * er.bhxh), bhyt: round(insBase * er.bhyt), bhtn: round(insBhtnBase * er.bhtn), total: 0 }
    : { bhxh: 0, bhyt: 0, bhtn: 0, total: 0 };
  employerInsurance.total = employerInsurance.bhxh + employerInsurance.bhyt + employerInsurance.bhtn;

  const unionFee = insOn ? round(insSalary * (s.union_fee_rate || 0)) : 0;

  // thuế TNCN
  const nonTaxable = allowanceLines.filter((a) => !a.taxable).reduce((t, a) => t + a.amount, 0)
    + bonuses.filter((b) => !b.taxable).reduce((t, b) => t + b.amount, 0)
    + otExempt;
  const taxableIncome = Math.max(0, gross - nonTaxable);
  const familyDeduction = s.tax.personal_deduction + s.tax.dependent_deduction * (c.dependents || 0);
  const assessable = Math.max(0, taxableIncome - insurance.total - familyDeduction);
  const pit = s.tax.enabled && c.tax_enabled ? progressiveTax(assessable, s.tax.brackets) : 0;

  // khấu trừ sau thuế
  const attendancePenalty = round(
    ts.late_count * (s.late_penalty_per_time || 0) +
    ts.late_minutes * (s.late_penalty_per_minute || 0) +
    ts.early_count * (s.early_penalty_per_time || 0) +
    ts.absent_days * (s.absence_penalty_per_day || 0));
  const penaltyTotal = attendancePenalty + adjustments.filter((a) => a.type === "penalty").reduce((t, a) => t + a.amount, 0);
  const advanceTotal = adjustments.filter((a) => a.type === "advance").reduce((t, a) => t + a.amount, 0);
  const deductionTotal = adjustments.filter((a) => a.type === "deduction").reduce((t, a) => t + a.amount, 0);

  const net = gross - insurance.total - unionFee - pit - penaltyTotal - advanceTotal - deductionTotal;

  return {
    salary_type: c.salary_type,
    timesheet: ts,
    rates: { daily: round(daily), hourly: round(hourly), shift: round(c.shift_rate) },
    base_pay: basePay,
    ot_pay: otPay,
    ot_tax_exempt: otExempt,
    allowances: allowanceLines,
    allowance_total: allowanceTotal,
    bonus_total: bonusTotal,
    gross,
    insurance_salary: insSalary,
    insurance,
    employer_insurance: employerInsurance,
    union_fee: unionFee,
    taxable_income: taxableIncome,
    family_deduction: familyDeduction,
    assessable_income: assessable,
    pit,
    attendance_penalty: attendancePenalty,
    penalty_total: penaltyTotal,
    advance_total: advanceTotal,
    deduction_total: deductionTotal,
    net,
    adjustments,
  };
}
