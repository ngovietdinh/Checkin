// Kiểu dữ liệu đầu vào/đầu ra cho bộ máy tính công & tính lương.
// Bộ máy là hàm thuần (không gọi mạng) nên dùng được ở mọi backend.

export type SalaryType = "monthly" | "hourly" | "shift";
export type RequestType =
  | "leave_annual" | "leave_sick" | "leave_unpaid" | "leave_paid" | "ot" | "late" | "early"
  | "business_trip" | "forgot_checkin" | "shift_swap" | "device_change";

export interface TaxBracket { upto: number | null; rate: number }

export interface PayrollSettings {
  standard_days_mode: "schedule" | "fixed";
  standard_days_fixed: number;
  hours_per_day: number;
  ot_rates: { weekday: number; weekend: number; holiday: number };
  missing_checkout_credit: number;
  late_penalty_per_time: number;
  late_penalty_per_minute: number;
  early_penalty_per_time: number;
  absence_penalty_per_day: number;
  insurance: {
    enabled: boolean;
    bhxh: number; bhyt: number; bhtn: number;
    base_cap: number; bhtn_cap: number;
    employer?: { bhxh: number; bhyt: number; bhtn: number };
  };
  union_fee_rate: number;
  tax: {
    enabled: boolean;
    personal_deduction: number;
    dependent_deduction: number;
    brackets: TaxBracket[];
  };
}

export interface Compensation {
  salary_type: SalaryType;
  base_salary: number;
  hourly_rate: number;
  shift_rate: number;
  insurance_salary: number | null;
  dependents: number;
  insurance_enabled: boolean;
  tax_enabled: boolean;
}

export interface Allowance { name: string; amount: number; taxable: boolean; per_workday: boolean }

export interface ShiftInfo { id: string; name: string; work_value: number }

export interface ScheduleEntry { work_date: string; shift_id: string }

export interface AttendanceEntry {
  work_date: string;
  shift_id: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_minutes: number;
  worked_minutes: number;
  missing_checkout: boolean;
  excused_late: boolean;
  excused_early: boolean;
  /** app: tự chấm; manual/request: HR nhập hoặc theo đơn */
  source?: "app" | "manual" | "request";
}

export interface ApprovedRequest {
  type: RequestType;
  start_date: string;
  end_date: string;
  half_day: "am" | "pm" | null;
  hours: number | null;
}

export interface Holiday { holiday_date: string; paid: boolean }

export interface Adjustment {
  type: "bonus" | "allowance" | "penalty" | "advance" | "deduction";
  amount: number;
  taxable: boolean;
  note?: string | null;
}

export interface EmployeeMonthInput {
  month: string; // YYYY-MM
  today?: string; // YYYY-MM-DD, các ngày sau hôm nay chưa tính vắng
  employee: { id: string; join_date: string; left_date: string | null; work_days: number[] };
  compensation: Compensation;
  allowances: Allowance[];
  schedule: ScheduleEntry[];
  shifts: Record<string, ShiftInfo>;
  attendance: AttendanceEntry[];
  requests: ApprovedRequest[];
  holidays: Holiday[];
  adjustments: Adjustment[];
  settings: PayrollSettings;
}

export type DayStatus =
  | "work" | "partial" | "missing_checkout" | "leave_paid" | "leave_unpaid" | "leave_sick"
  | "business_trip" | "absent" | "holiday" | "off" | "future" | "not_employed";

export interface DayResult {
  date: string;
  status: DayStatus;
  scheduled: number;     // số công theo lịch
  work_credit: number;   // công đi làm thực tế
  paid_leave: number;    // công nghỉ có lương
  unpaid: number;        // công nghỉ không lương / vắng
  holiday_credit: number;
  worked_minutes: number;
  late_minutes: number;
  early_minutes: number;
  late_count: number;
  early_count: number;
  ot_hours: number;
  ot_kind: "weekday" | "weekend" | "holiday" | null;
  leave_type: RequestType | null;
}

export interface TimesheetSummary {
  standard_days: number;
  scheduled_days: number;
  work_days: number;
  paid_leave_days: number;
  holiday_days: number;
  unpaid_leave_days: number;
  sick_days: number;
  absent_days: number;
  paid_days: number;
  worked_hours: number;
  late_count: number;
  late_minutes: number;
  early_count: number;
  early_minutes: number;
  missing_checkout_count: number;
  ot_hours: { weekday: number; weekend: number; holiday: number };
}

export interface PayslipDetail {
  salary_type: SalaryType;
  timesheet: TimesheetSummary;
  rates: { daily: number; hourly: number; shift: number };
  base_pay: number;
  ot_pay: number;
  ot_tax_exempt: number;
  allowances: { name: string; amount: number; taxable: boolean }[];
  allowance_total: number;
  bonus_total: number;
  gross: number;
  insurance_salary: number;
  insurance: { bhxh: number; bhyt: number; bhtn: number; total: number };
  employer_insurance: { bhxh: number; bhyt: number; bhtn: number; total: number };
  union_fee: number;
  taxable_income: number;
  family_deduction: number;
  assessable_income: number;
  pit: number;
  attendance_penalty: number;
  penalty_total: number;
  advance_total: number;
  deduction_total: number;
  net: number;
  adjustments: Adjustment[];
}
