// Tải dữ liệu 1 tháng từ backend và dựng đầu vào cho bộ máy tính công/lương
import * as attendanceApi from "../api/attendance";
import * as employeesApi from "../api/employees";
import * as orgApi from "../api/org";
import * as payrollApi from "../api/payroll";
import * as requestsApi from "../api/requests";
import * as schedulesApi from "../api/schedules";
import type { Attendance, Compensation as DbComp, Employee, EmployeeAllowance, Shift } from "../types";
import { computePayslip, computeTimesheet, daysInMonth } from "./engine";
import type { EmployeeMonthInput, PayrollSettings } from "./types";
import { todayStr } from "../format";

export interface MonthData {
  month: string;
  employees: Pick<Employee, "id" | "code" | "full_name" | "join_date" | "left_date" | "work_days" | "department_id" | "active">[];
  inputs: Map<string, EmployeeMonthInput>;
  shifts: Shift[];
  attendance: Attendance[];
}

const DEFAULT_COMP = {
  salary_type: "monthly" as const, base_salary: 0, hourly_rate: 0, shift_rate: 0, insurance_salary: null,
  dependents: 0, insurance_enabled: true, tax_enabled: true,
};

/**
 * withPay=false: chỉ cần bảng công (quản lý xem team) – không đọc lương/phụ cấp
 */
export async function loadMonth(month: string, opts: { employees: MonthData["employees"]; withPay: boolean }): Promise<MonthData> {
  const days = daysInMonth(month);
  const from = days[0];
  const to = days[days.length - 1];
  const ids = opts.employees.map((e) => e.id);
  // lọc theo id khi ít người; nhiều người thì lấy hết (RLS đã giới hạn) để URL không quá dài
  const filterIds = ids.length <= 100 ? ids : undefined;
  const inMonth = opts.employees.filter((e) => e.join_date <= to && (!e.left_date || e.left_date >= from));

  const [settings, shifts, holidays, schedule, attendance, requests, comps, allowances, adjustments] = await Promise.all([
    orgApi.getSettings(),
    orgApi.listShifts(),
    orgApi.listHolidays(),
    schedulesApi.resolvedSchedule(from, to, ids.length <= 400 ? ids : undefined),
    attendanceApi.listAttendance({ from, to, employeeIds: filterIds }),
    requestsApi.approvedInRange(from, to, filterIds),
    opts.withPay ? employeesApi.listCompensation() : Promise.resolve([] as DbComp[]),
    opts.withPay ? employeesApi.listAllowances() : Promise.resolve([] as EmployeeAllowance[]),
    opts.withPay ? payrollApi.listAdjustments(month) : Promise.resolve([]),
  ]);

  const shiftMap = Object.fromEntries(shifts.map((s) => [s.id, { id: s.id, name: s.name, work_value: Number(s.work_value) }]));
  const group = <T extends { employee_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(r.employee_id) ?? m.set(r.employee_id, []).get(r.employee_id)!).push(r);
    return m;
  };
  const schBy = group(schedule);
  const attBy = group(attendance);
  const reqBy = group(requests);
  const allowBy = group(allowances);
  const adjBy = group(adjustments);
  const compBy = new Map(comps.map((c) => [c.employee_id, c]));
  const today = todayStr();

  const inputs = new Map<string, EmployeeMonthInput>();
  for (const e of inMonth) {
    const c = compBy.get(e.id);
    inputs.set(e.id, {
      month,
      today,
      employee: { id: e.id, join_date: e.join_date, left_date: e.left_date, work_days: e.work_days },
      compensation: c ? {
        salary_type: c.salary_type, base_salary: Number(c.base_salary), hourly_rate: Number(c.hourly_rate),
        shift_rate: Number(c.shift_rate), insurance_salary: c.insurance_salary == null ? null : Number(c.insurance_salary),
        dependents: c.dependents, insurance_enabled: c.insurance_enabled, tax_enabled: c.tax_enabled,
      } : DEFAULT_COMP,
      allowances: (allowBy.get(e.id) ?? []).map((a) => ({ name: a.name, amount: Number(a.amount), taxable: a.taxable, per_workday: a.per_workday })),
      schedule: (schBy.get(e.id) ?? []).map((s) => ({ work_date: s.work_date, shift_id: s.shift_id })),
      shifts: shiftMap,
      attendance: attBy.get(e.id) ?? [],
      requests: (reqBy.get(e.id) ?? []).map((r) => ({ type: r.type, start_date: r.start_date, end_date: r.end_date, half_day: r.half_day, hours: r.hours == null ? null : Number(r.hours) })),
      holidays,
      adjustments: (adjBy.get(e.id) ?? []).map((a) => ({ type: a.type, amount: Number(a.amount), taxable: a.taxable, note: a.note })),
      settings: settings.payroll as PayrollSettings,
    });
  }
  return { month, employees: inMonth, inputs, shifts, attendance };
}

export function timesheetFor(data: MonthData, employeeId: string) {
  const input = data.inputs.get(employeeId);
  return input ? computeTimesheet(input) : null;
}

export function payslipFor(data: MonthData, employeeId: string) {
  const input = data.inputs.get(employeeId);
  return input ? computePayslip(input) : null;
}
