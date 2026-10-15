import type { RequestStatus, RequestType, Role, TaskPriority, TaskStatus, AdjustmentType, PayrollStatus } from "./types";
import type { DayStatus } from "./payroll/types";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Quản trị", hr: "Nhân sự/Kế toán", manager: "Quản lý", leader: "Trưởng nhóm", employee: "Nhân viên",
};

export const REQUEST_LABEL: Record<RequestType, string> = {
  leave_annual: "Nghỉ phép năm",
  leave_sick: "Nghỉ ốm",
  leave_unpaid: "Nghỉ không lương",
  leave_paid: "Nghỉ chế độ (có lương)",
  ot: "Tăng ca (OT)",
  late: "Đi muộn",
  early: "Về sớm",
  business_trip: "Công tác",
  forgot_checkin: "Quên chấm công",
  shift_swap: "Đổi ca",
  device_change: "Đổi thiết bị",
};

export const REQUEST_HINT: Partial<Record<RequestType, string>> = {
  leave_annual: "Trừ vào quỹ phép năm, được hưởng lương.",
  leave_sick: "Không tính lương công ty (BHXH chi trả theo chế độ).",
  leave_paid: "Nghỉ cưới, tang… theo quy định, được hưởng lương.",
  late: "Xin phép/giải trình đi muộn – được duyệt sẽ không bị tính lỗi.",
  early: "Xin phép/giải trình về sớm – được duyệt sẽ không bị tính lỗi.",
  forgot_checkin: "Bổ sung giờ vào/ra khi quên chấm công hoặc lỗi thiết bị.",
  shift_swap: "Đổi toàn bộ ca trong ngày với đồng nghiệp; đồng nghiệp đồng ý rồi quản lý duyệt.",
  device_change: "Đăng ký thiết bị đang dùng làm máy chấm công mới.",
  ot: "Chỉ giờ tăng ca được duyệt mới được tính lương.",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối", cancelled: "Đã huỷ",
};
export const STATUS_TONE: Record<RequestStatus, Tone> = {
  pending: "amber", approved: "green", rejected: "red", cancelled: "gray",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { todo: "Cần làm", doing: "Đang làm", done: "Hoàn thành", cancelled: "Huỷ" };
export const TASK_STATUS_TONE: Record<TaskStatus, Tone> = { todo: "gray", doing: "blue", done: "green", cancelled: "red" };
export const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "Thấp", normal: "Bình thường", high: "Cao", urgent: "Khẩn cấp" };
export const PRIORITY_TONE: Record<TaskPriority, Tone> = { low: "gray", normal: "blue", high: "amber", urgent: "red" };

export const ADJ_LABEL: Record<AdjustmentType, string> = {
  bonus: "Thưởng", allowance: "Phụ cấp khác", penalty: "Phạt", advance: "Tạm ứng", deduction: "Khấu trừ khác",
};
export const PERIOD_LABEL: Record<PayrollStatus, string> = { draft: "Nháp", locked: "Đã chốt", published: "Đã công bố" };
export const PERIOD_TONE: Record<PayrollStatus, Tone> = { draft: "gray", locked: "amber", published: "green" };

export const FLAG_LABEL: Record<string, string> = {
  mock_location: "Nghi giả lập vị trí",
  gps_too_precise: "GPS chính xác bất thường",
  stale_position: "Vị trí cũ",
  impossible_travel: "Di chuyển bất thường",
  unscheduled: "Ngoài lịch",
  other_branch: "Khác chi nhánh",
  missing_checkout: "Quên check-out",
};

export const DAY_STATUS: Record<DayStatus | "working" | "done" | "leave" | "not_yet", { label: string; tone: Tone; short: string }> = {
  work: { label: "Đủ công", tone: "green", short: "✓" },
  done: { label: "Đã xong", tone: "green", short: "✓" },
  working: { label: "Đang làm", tone: "blue", short: "•" },
  partial: { label: "Muộn/sớm", tone: "amber", short: "M" },
  missing_checkout: { label: "Quên check-out", tone: "orange", short: "Q" },
  leave_paid: { label: "Nghỉ phép", tone: "violet", short: "P" },
  leave: { label: "Nghỉ phép", tone: "violet", short: "P" },
  leave_unpaid: { label: "Nghỉ không lương", tone: "gray", short: "KL" },
  leave_sick: { label: "Nghỉ ốm", tone: "gray", short: "Ô" },
  business_trip: { label: "Công tác", tone: "cyan", short: "CT" },
  absent: { label: "Vắng", tone: "red", short: "V" },
  holiday: { label: "Nghỉ lễ", tone: "pink", short: "L" },
  off: { label: "Nghỉ", tone: "none", short: "" },
  future: { label: "Chưa tới", tone: "none", short: "" },
  not_yet: { label: "Chưa vào", tone: "gray", short: "" },
  not_employed: { label: "—", tone: "none", short: "" },
};

export type Tone = "gray" | "green" | "red" | "amber" | "orange" | "blue" | "violet" | "cyan" | "pink" | "none";
