// Đổi mã lỗi từ máy chủ thành câu tiếng Việt dễ hiểu
const MESSAGES: Record<string, string> = {
  NOT_EMPLOYEE: "Tài khoản chưa được gắn hồ sơ nhân viên hoặc đã bị khoá.",
  DEVICE_REQUIRED: "Không xác định được thiết bị. Hãy tải lại trang.",
  DEVICE_MISMATCH: "Tài khoản đã đăng ký chấm công trên thiết bị khác{bound_label}. Gửi đơn \"Đổi thiết bị\" để được duyệt.",
  ALREADY_CHECKED_IN: "Bạn đã check-in rồi. Hãy check-out trước khi check-in ca mới.",
  NOT_CHECKED_IN: "Bạn chưa check-in nên không thể check-out.",
  GPS_REQUIRED: "Cần bật định vị (GPS) để chấm công.",
  GPS_INACCURATE: "Tín hiệu GPS chưa đủ chính xác (sai số {accuracy}m, cho phép {max}m). Hãy ra chỗ thoáng và thử lại.",
  NO_BRANCH: "Bạn chưa được gán chi nhánh chấm công. Liên hệ HR.",
  OUT_OF_RANGE: "Bạn đang ở ngoài khu vực chấm công: cách {branch} {distance}m (cho phép {radius}m).",
  SELFIE_REQUIRED: "Cần chụp ảnh khuôn mặt để chấm công.",
  REPORT_REQUIRED: "Cần nộp báo cáo công việc hôm nay trước khi check-out.",
  NO_SHIFT: "Hiện không có ca làm việc nào để check-in.",
  PERIOD_LOCKED: "Kỳ lương tháng {month} đã chốt, không thể chỉnh sửa.",
  ADMIN_ONLY: "Chỉ Admin được thực hiện thao tác này.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  ALREADY_DECIDED: "Đơn đã được xử lý trước đó.",
  INVALID_RANGE: "Ngày kết thúc phải sau ngày bắt đầu.",
  HALF_DAY_SINGLE_DATE: "Nghỉ nửa ngày chỉ áp dụng cho 1 ngày.",
  NO_WORK_DAYS: "Khoảng thời gian đã chọn không có ngày làm việc nào.",
  OVERLAP: "Đã có đơn nghỉ trùng thời gian này.",
  INSUFFICIENT_LEAVE: "Không đủ ngày phép: còn {remaining} ngày, xin {requested} ngày.",
  HOURS_REQUIRED: "Cần nhập số giờ hoặc giờ bắt đầu/kết thúc.",
  TIME_REQUIRED: "Cần nhập giờ vào hoặc giờ ra.",
  PARTNER_REQUIRED: "Cần chọn đồng nghiệp đổi ca.",
  REPORT_REVIEWED: "Báo cáo đã được quản lý nhận xét, không thể sửa.",
  "Invalid login credentials": "Sai tên đăng nhập hoặc mật khẩu.",
  "User is banned": "Tài khoản đã bị khoá.",
};

export function errorMessage(err: unknown): string {
  if (!err) return "Đã xảy ra lỗi";
  const e = err as { message?: string; details?: string; context?: unknown };
  const code = e.message ?? String(err);
  const template = MESSAGES[code];
  if (!template) {
    if (/Failed to fetch|NetworkError|Load failed/i.test(code)) return "Mất kết nối mạng. Hãy kiểm tra Internet và thử lại.";
    if (/row-level security|permission denied/i.test(code)) return MESSAGES.FORBIDDEN;
    if (/duplicate key/i.test(code)) return "Dữ liệu bị trùng.";
    return code;
  }
  let detail: Record<string, unknown> = {};
  try { detail = e.details ? JSON.parse(e.details) : {}; } catch { /* bỏ qua */ }
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    if (k === "bound_label") return detail.bound_label ? ` (${detail.bound_label})` : "";
    return detail[k] !== undefined ? String(detail[k]) : "?";
  });
}
