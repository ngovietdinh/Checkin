// Kiểu dữ liệu các bảng trong database
import type { PayrollSettings, RequestType, SalaryType, PayslipDetail } from "./payroll/types";

export type { RequestType, SalaryType };
export type Role = "admin" | "hr" | "manager" | "leader" | "employee";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type TaskStatus = "todo" | "doing" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type PayrollStatus = "draft" | "locked" | "published";
export type AdjustmentType = "bonus" | "allowance" | "penalty" | "advance" | "deduction";

export interface Employee {
  id: string;
  code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  gender: "male" | "female" | "other" | null;
  dob: string | null;
  avatar_url: string | null;
  face_photo_url: string | null;
  role: Role;
  department_id: string | null;
  position_id: string | null;
  manager_id: string | null;
  join_date: string;
  left_date: string | null;
  active: boolean;
  default_shift_id: string | null;
  work_days: number[];
  annual_leave_days: number | null;
  device_id: string | null;
  device_label: string | null;
  device_bound_at: string | null;
  telegram_chat_id: string | null;
  created_at: string;
}

export interface DirectoryEntry {
  id: string;
  code: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  department_id: string | null;
  position_id: string | null;
  manager_id: string | null;
  active: boolean;
}

export interface Compensation {
  employee_id: string;
  salary_type: SalaryType;
  base_salary: number;
  hourly_rate: number;
  shift_rate: number;
  insurance_salary: number | null;
  dependents: number;
  tax_code: string | null;
  bank_name: string | null;
  bank_account: string | null;
  insurance_enabled: boolean;
  tax_enabled: boolean;
}

export interface EmployeeAllowance {
  id: string;
  employee_id: string;
  name: string;
  amount: number;
  taxable: boolean;
  per_workday: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  active: boolean;
}

export interface Department { id: string; name: string; parent_id: string | null; manager_id: string | null }
export interface Position { id: string; name: string }

export interface Shift {
  id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  work_value: number;
  late_grace_min: number;
  early_grace_min: number;
  color: string;
  active: boolean;
  is_overnight: boolean;
}

export interface Holiday { holiday_date: string; name: string; paid: boolean }

export interface ScheduleRow {
  id: string;
  employee_id: string;
  work_date: string;
  shift_id: string | null;
  branch_id: string | null;
  is_off: boolean;
  note: string | null;
}

export interface ResolvedSchedule {
  employee_id: string;
  work_date: string;
  shift_id: string;
  branch_id: string | null;
  is_default: boolean;
}

export interface Attendance {
  id: string;
  employee_id: string;
  work_date: string;
  shift_id: string | null;
  branch_id: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  in_lat: number | null;
  in_lng: number | null;
  in_accuracy: number | null;
  in_distance_m: number | null;
  out_lat: number | null;
  out_lng: number | null;
  out_accuracy: number | null;
  out_distance_m: number | null;
  in_selfie: string | null;
  out_selfie: string | null;
  device_id: string | null;
  late_minutes: number;
  early_minutes: number;
  worked_minutes: number;
  missing_checkout: boolean;
  excused_late: boolean;
  excused_early: boolean;
  flags: string[];
  source: "app" | "manual" | "request";
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface ApprovalStep {
  type: "direct_manager" | "department_manager" | "hr" | "swap_partner";
  approver_id: string | null;
  action?: "approved" | "rejected";
  by?: string;
  at?: string;
  comment?: string | null;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  type: RequestType;
  start_date: string;
  end_date: string;
  half_day: "am" | "pm" | null;
  start_time: string | null;
  end_time: string | null;
  hours: number | null;
  days: number | null;
  reason: string | null;
  attachment: string | null;
  payload: Record<string, unknown>;
  status: RequestStatus;
  steps: ApprovalStep[];
  current_step: number;
  created_at: string;
}

export interface LeaveBalance {
  year: number;
  quota: number;
  seniority_bonus: number;
  accrued: number;
  carried: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string;
  created_by: string;
  due_at: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  attachments: string[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskComment { id: string; task_id: string; author_id: string; body: string; created_at: string }

export interface DailyReport {
  id: string;
  employee_id: string;
  report_date: string;
  done: string;
  doing: string;
  issues: string;
  plan: string;
  attachments: string[];
  score: number | null;
  manager_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface PayrollPeriod {
  month: string;
  status: PayrollStatus;
  note: string | null;
  locked_at: string | null;
  published_at: string | null;
}

export interface Payslip {
  id: string;
  month: string;
  employee_id: string;
  gross: number;
  net: number;
  detail: PayslipDetail;
  computed_at: string;
}

export interface PayrollAdjustment {
  id: string;
  employee_id: string;
  month: string;
  type: AdjustmentType;
  amount: number;
  taxable: boolean;
  note: string | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  target: "all" | "department" | "branch";
  target_ids: string[];
  pinned: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

export interface DayStatusRow {
  employee_id: string;
  code: string;
  full_name: string;
  department_id: string | null;
  avatar_url: string | null;
  shift_names: string | null;
  shift_start: string | null;
  shift_end: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  late_minutes: number;
  early_minutes: number;
  branch_id: string | null;
  in_lat: number | null;
  in_lng: number | null;
  in_selfie: string | null;
  flags: string[];
  leave_type: RequestType | null;
  status: "working" | "done" | "missing_checkout" | "leave" | "off" | "absent" | "not_yet";
}

export interface MyToday {
  today: string;
  server_time: string;
  shifts: { work_date: string; shift_id: string; name: string; code: string; color: string; start: string; end: string }[];
  attendance: Attendance[];
  open: Attendance | null;
  leave: { type: RequestType; half_day: string | null } | null;
  report_submitted: boolean;
  device_bound: boolean;
}

export interface AppSettings {
  company_name: string;
  timezone: string;
  attendance: {
    max_gps_accuracy_m: number;
    require_selfie_checkin: boolean;
    require_selfie_checkout: boolean;
    require_location_checkout: boolean;
    require_report_before_checkout: boolean;
    device_binding: boolean;
    allow_unscheduled_checkin: boolean;
    checkin_open_before_min: number;
    missing_checkout_after_hours: number;
    notify_manager_on_late: boolean;
    max_travel_speed_kmh: number;
  };
  reminders: { checkin_before_min: number; checkout_after_min: number; absent_after_min: number; task_due_hours: number };
  leave: { annual_quota_default: number; accrue_monthly: boolean; seniority_bonus_every_years: number };
  approval_flows: Record<string, string[]>;
  payroll: PayrollSettings;
  notifications: { telegram_enabled: boolean; email_enabled: boolean };
}
