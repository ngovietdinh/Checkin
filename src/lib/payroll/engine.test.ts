import { describe, expect, it } from "vitest";
import { computePayslip, computeTimesheet, daysInMonth, isoDow, progressiveTax, standardDays } from "./engine";
import type { AttendanceEntry, EmployeeMonthInput, PayrollSettings } from "./types";

const settings: PayrollSettings = {
  standard_days_mode: "schedule",
  standard_days_fixed: 26,
  hours_per_day: 8,
  ot_rates: { weekday: 1.5, weekend: 2, holiday: 3 },
  missing_checkout_credit: 0.5,
  late_penalty_per_time: 0,
  late_penalty_per_minute: 0,
  early_penalty_per_time: 0,
  absence_penalty_per_day: 0,
  insurance: { enabled: true, bhxh: 0.08, bhyt: 0.015, bhtn: 0.01, base_cap: 46_800_000, bhtn_cap: 106_200_000 },
  union_fee_rate: 0,
  tax: {
    enabled: true,
    personal_deduction: 15_500_000,
    dependent_deduction: 6_200_000,
    brackets: [
      { upto: 5_000_000, rate: 0.05 }, { upto: 10_000_000, rate: 0.1 }, { upto: 18_000_000, rate: 0.15 },
      { upto: 32_000_000, rate: 0.2 }, { upto: 52_000_000, rate: 0.25 }, { upto: 80_000_000, rate: 0.3 },
      { upto: null, rate: 0.35 },
    ],
  },
};

const MONTH = "2026-10"; // 01/10/2026 là thứ Năm, 22 ngày làm việc T2–T6
const weekdays = daysInMonth(MONTH).filter((d) => isoDow(d) <= 5);

function att(date: string, extra: Partial<AttendanceEntry> = {}): AttendanceEntry {
  return {
    work_date: date, shift_id: "HC", check_in_at: `${date}T01:00:00Z`, check_out_at: `${date}T10:00:00Z`,
    late_minutes: 0, early_minutes: 0, worked_minutes: 480, missing_checkout: false,
    excused_late: false, excused_early: false, ...extra,
  };
}

function base(over: Partial<EmployeeMonthInput> = {}): EmployeeMonthInput {
  return {
    month: MONTH,
    employee: { id: "e1", join_date: "2024-01-01", left_date: null, work_days: [1, 2, 3, 4, 5] },
    compensation: {
      salary_type: "monthly", base_salary: 20_000_000, hourly_rate: 0, shift_rate: 0,
      insurance_salary: null, dependents: 0, insurance_enabled: true, tax_enabled: true,
    },
    allowances: [],
    schedule: weekdays.map((d) => ({ work_date: d, shift_id: "HC" })),
    shifts: { HC: { id: "HC", name: "Hành chính", work_value: 1 } },
    attendance: weekdays.map((d) => att(d)),
    requests: [],
    holidays: [],
    adjustments: [],
    settings,
    ...over,
  };
}

describe("tiện ích", () => {
  it("đếm ngày và thứ trong tuần", () => {
    expect(daysInMonth(MONTH)).toHaveLength(31);
    expect(isoDow("2026-10-01")).toBe(4);
    expect(isoDow("2026-10-04")).toBe(7);
    expect(weekdays).toHaveLength(22);
    expect(standardDays(MONTH, [1, 2, 3, 4, 5], settings)).toBe(22);
    expect(standardDays(MONTH, [1, 2, 3, 4, 5], { ...settings, standard_days_mode: "fixed" })).toBe(26);
  });

  it("thuế TNCN lũy tiến từng phần", () => {
    expect(progressiveTax(0, settings.tax.brackets)).toBe(0);
    expect(progressiveTax(4_000_000, settings.tax.brackets)).toBe(200_000);
    // 5tr*5% + 5tr*10% + 8tr*15% + 2tr*20%
    expect(progressiveTax(20_000_000, settings.tax.brackets)).toBe(2_350_000);
    expect(progressiveTax(100_000_000, settings.tax.brackets)).toBe(
      250_000 + 500_000 + 1_200_000 + 2_800_000 + 5_000_000 + 8_400_000 + 20_000_000 * 0.35);
  });
});

describe("bảng công", () => {
  it("đi làm đủ tháng", () => {
    const { summary } = computeTimesheet(base());
    expect(summary.standard_days).toBe(22);
    expect(summary.work_days).toBe(22);
    expect(summary.paid_days).toBe(22);
    expect(summary.absent_days).toBe(0);
  });

  it("vắng, nghỉ phép, nghỉ nửa ngày, quên check-out", () => {
    const [d1, d2, d3, d4, d5] = weekdays;
    const input = base({
      attendance: [
        ...weekdays.slice(5).map((d) => att(d)),
        att(d4, { check_out_at: null, missing_checkout: true }),
        att(d5, { early_minutes: 240 }),
      ],
      requests: [
        { type: "leave_annual", start_date: d2, end_date: d2, half_day: null, hours: null },
        { type: "leave_annual", start_date: d5, end_date: d5, half_day: "pm", hours: null },
        { type: "leave_unpaid", start_date: d3, end_date: d3, half_day: null, hours: null },
      ],
    });
    const { days, summary } = computeTimesheet(input);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
    expect(byDate[d1].status).toBe("absent");
    expect(byDate[d2].status).toBe("leave_paid");
    expect(byDate[d3].status).toBe("leave_unpaid");
    expect(byDate[d4].status).toBe("missing_checkout");
    expect(byDate[d4].work_credit).toBe(0.5);
    expect(byDate[d5].work_credit).toBe(0.5);
    expect(byDate[d5].paid_leave).toBe(0.5);
    expect(byDate[d5].early_count).toBe(0); // về sớm do nghỉ nửa ngày, không tính lỗi
    expect(summary.absent_days).toBe(1); // d1 (quên check-out chỉ bị giảm công, không tính vắng)
    expect(summary.unpaid_leave_days).toBe(1);
    expect(summary.paid_leave_days).toBe(1.5);
    expect(summary.work_days).toBe(17 + 0.5 + 0.5);
    expect(summary.missing_checkout_count).toBe(1);
  });

  it("ngày trong tương lai chưa tính vắng", () => {
    const today = "2026-10-15";
    const { summary, days } = computeTimesheet(base({
      today, attendance: weekdays.filter((d) => d < today).map((d) => att(d)),
    }));
    expect(summary.absent_days).toBe(0);
    expect(days.find((d) => d.date === "2026-10-20")?.status).toBe("future");
  });

  it("đi muộn được duyệt giải trình không bị tính", () => {
    const [d1, d2] = weekdays;
    const { summary } = computeTimesheet(base({
      attendance: [att(d1, { late_minutes: 20 }), att(d2, { late_minutes: 15, excused_late: true }), ...weekdays.slice(2).map((d) => att(d))],
    }));
    expect(summary.late_count).toBe(1);
    expect(summary.late_minutes).toBe(20);
  });

  it("nghỉ lễ có lương và nhân viên vào làm giữa tháng", () => {
    const holiday = weekdays[0];
    const { summary } = computeTimesheet(base({
      employee: { id: "e1", join_date: "2026-10-12", left_date: null, work_days: [1, 2, 3, 4, 5] },
      schedule: weekdays.filter((d) => d !== holiday).map((d) => ({ work_date: d, shift_id: "HC" })),
      attendance: weekdays.filter((d) => d >= "2026-10-12").map((d) => att(d)),
      holidays: [{ holiday_date: holiday, paid: true }],
    }));
    expect(summary.holiday_days).toBe(0); // lễ trước ngày vào làm
    expect(summary.work_days).toBe(weekdays.filter((d) => d >= "2026-10-12").length);
    expect(summary.absent_days).toBe(0);
  });

  it("tự chấm ngoài giờ ca không được tính công cho ca theo lịch, nhập tay thì được", () => {
    const [d1, d2] = weekdays;
    const { days } = computeTimesheet(base({
      attendance: [
        att(d1, { shift_id: null, source: "app" }),
        att(d2, { shift_id: null, source: "manual" }),
        ...weekdays.slice(2).map((d) => att(d)),
      ],
    }));
    expect(days.find((d) => d.date === d1)?.status).toBe("absent");
    expect(days.find((d) => d.date === d2)?.work_credit).toBe(1);
  });

  it("nhân viên không có lịch cố định: ngày nào chấm vào-ra tính 1 công", () => {
    const { summary } = computeTimesheet(base({ schedule: [], attendance: weekdays.slice(0, 10).map((d) => att(d, { shift_id: null })) }));
    expect(summary.work_days).toBe(10);
  });
});

describe("tính lương", () => {
  it("lương tháng đủ công: BH 10.5%, thuế sau giảm trừ 15.5 triệu", () => {
    const p = computePayslip(base());
    expect(p.base_pay).toBe(20_000_000);
    expect(p.gross).toBe(20_000_000);
    expect(p.insurance).toEqual({ bhxh: 1_600_000, bhyt: 300_000, bhtn: 200_000, total: 2_100_000 });
    expect(p.assessable_income).toBe(2_400_000);
    expect(p.pit).toBe(120_000);
    expect(p.net).toBe(17_780_000);
    expect(p.employer_insurance.total).toBe(4_300_000);
  });

  it("người phụ thuộc làm giảm thuế", () => {
    const p = computePayslip(base({ compensation: { ...base().compensation, base_salary: 30_000_000, dependents: 1 } }));
    // 30tr - 3.15tr BH - 15.5tr - 6.2tr = 5.15tr -> 250k + 15k
    expect(p.assessable_income).toBe(5_150_000);
    expect(p.pit).toBe(265_000);
  });

  it("trần đóng bảo hiểm", () => {
    const p = computePayslip(base({ compensation: { ...base().compensation, base_salary: 60_000_000 } }));
    expect(p.insurance.bhxh).toBe(Math.round(46_800_000 * 0.08));
    expect(p.insurance.bhtn).toBe(600_000);
  });

  it("vắng 2 ngày bị trừ lương theo ngày công và phạt", () => {
    const p = computePayslip(base({
      attendance: weekdays.slice(2).map((d) => att(d)),
      settings: { ...settings, absence_penalty_per_day: 100_000 },
    }));
    expect(p.timesheet.paid_days).toBe(20);
    expect(p.base_pay).toBe(Math.round(20_000_000 / 22 * 20));
    expect(p.attendance_penalty).toBe(200_000);
  });

  it("tăng ca: phần chênh lệch không chịu thuế", () => {
    const p = computePayslip(base({
      requests: [{ type: "ot", start_date: weekdays[0], end_date: weekdays[0], half_day: null, hours: 2 }],
    }));
    const hourly = 20_000_000 / 22 / 8;
    expect(p.ot_pay).toBe(Math.round(hourly * 2 * 1.5));
    expect(p.ot_tax_exempt).toBe(p.ot_pay - Math.round(hourly * 2));
    expect(p.taxable_income).toBe(p.gross - p.ot_tax_exempt);
  });

  it("tăng ca ngày nghỉ và ngày lễ", () => {
    const sunday = "2026-10-04";
    const { summary } = computeTimesheet(base({
      requests: [{ type: "ot", start_date: sunday, end_date: sunday, half_day: null, hours: 4 }],
      holidays: [{ holiday_date: weekdays[3], paid: true }],
    }));
    expect(summary.ot_hours.weekend).toBe(4);
  });

  it("phụ cấp chịu thuế / không chịu thuế, thưởng, tạm ứng", () => {
    const p = computePayslip(base({
      allowances: [
        { name: "Ăn trưa", amount: 30_000, taxable: false, per_workday: true },
        { name: "Trách nhiệm", amount: 1_000_000, taxable: true, per_workday: false },
      ],
      adjustments: [
        { type: "bonus", amount: 2_000_000, taxable: true, note: "KPI" },
        { type: "advance", amount: 5_000_000, taxable: false, note: "Tạm ứng" },
      ],
    }));
    expect(p.allowance_total).toBe(30_000 * 22 + 1_000_000);
    expect(p.taxable_income).toBe(20_000_000 + 1_000_000 + 2_000_000);
    expect(p.advance_total).toBe(5_000_000);
    expect(p.net).toBe(p.gross - p.insurance.total - p.pit - 5_000_000);
  });

  it("nghỉ không lương từ 14 ngày thì không đóng bảo hiểm", () => {
    const p = computePayslip(base({ attendance: weekdays.slice(0, 8).map((d) => att(d)) }));
    expect(p.timesheet.absent_days).toBe(14);
    expect(p.insurance.total).toBe(0);
  });

  it("lương theo giờ", () => {
    const p = computePayslip(base({
      compensation: { ...base().compensation, salary_type: "hourly", base_salary: 0, hourly_rate: 30_000 },
      attendance: weekdays.slice(0, 10).map((d) => att(d, { worked_minutes: 300 })),
    }));
    expect(p.timesheet.worked_hours).toBe(50);
    expect(p.base_pay).toBe(1_500_000);
    expect(p.insurance.total).toBe(0); // chưa khai lương đóng BH
    expect(p.pit).toBe(0);
  });

  it("lương theo ca", () => {
    const p = computePayslip(base({
      compensation: { ...base().compensation, salary_type: "shift", base_salary: 0, shift_rate: 350_000, insurance_salary: 5_000_000 },
    }));
    expect(p.base_pay).toBe(22 * 350_000);
    expect(p.insurance.total).toBe(525_000);
  });
});
