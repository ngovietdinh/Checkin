import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useRefData } from "@/app/refdata";
import { Button, Card, Field, Input, Loading, NumberInput, PageHeader, Select, Toggle, useUi } from "@/components/ui";
import * as orgApi from "@/lib/api/org";
import { useAsync } from "@/lib/hooks";
import { REQUEST_LABEL } from "@/lib/labels";
import type { AppSettings, RequestType } from "@/lib/types";

const FLOWS: { value: string; label: string; steps: string[] }[] = [
  { value: "m", label: "Quản lý trực tiếp", steps: ["direct_manager"] },
  { value: "m-hr", label: "Quản lý trực tiếp → Nhân sự", steps: ["direct_manager", "hr"] },
  { value: "d", label: "Trưởng phòng", steps: ["department_manager"] },
  { value: "d-hr", label: "Trưởng phòng → Nhân sự", steps: ["department_manager", "hr"] },
  { value: "m-d", label: "Quản lý trực tiếp → Trưởng phòng", steps: ["direct_manager", "department_manager"] },
  { value: "m-d-hr", label: "Quản lý trực tiếp → Trưởng phòng → Nhân sự", steps: ["direct_manager", "department_manager", "hr"] },
  { value: "hr", label: "Chỉ Nhân sự", steps: ["hr"] },
];
const flowKey = (steps: string[] = []) => FLOWS.find((f) => f.steps.join() === steps.filter((s) => s !== "swap_partner").join())?.value ?? "m-hr";

export default function Settings() {
  const ui = useUi();
  const { reload } = useRefData();
  const data = useAsync(() => orgApi.getSettings(), []);
  const [s, setS] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data.data) setS(structuredClone(data.data)); }, [data.data]);
  if (!s) return <Loading />;

  const up = <K extends keyof AppSettings>(k: K, patch: Partial<AppSettings[K]>) => setS({ ...s, [k]: { ...(s[k] as object), ...patch } });
  const pay = s.payroll;
  const setPay = (patch: Partial<AppSettings["payroll"]>) => up("payroll", patch);

  const save = async () => {
    setBusy(true);
    try { await orgApi.saveSettings(s); await reload(); ui.toast("Đã lưu cài đặt"); } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 pb-20">
      <PageHeader title="Cài đặt" actions={<Button loading={busy} onClick={save} icon={<Save className="h-4 w-4" />}>Lưu cài đặt</Button>} />

      <Section title="Công ty">
        <Field label="Tên công ty"><Input value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} /></Field>
      </Section>

      <Section title="Chấm công & chống gian lận">
        <Field label="Sai số GPS tối đa (m)" hint="Từ chối khi GPS kém chính xác hơn mức này"><Input type="number" value={s.attendance.max_gps_accuracy_m} onChange={(e) => up("attendance", { max_gps_accuracy_m: Number(e.target.value) })} /></Field>
        <Field label="Được check-in sớm trước ca (phút)"><Input type="number" value={s.attendance.checkin_open_before_min} onChange={(e) => up("attendance", { checkin_open_before_min: Number(e.target.value) })} /></Field>
        <Field label="Coi là quên check-out sau khi hết ca (giờ)"><Input type="number" value={s.attendance.missing_checkout_after_hours} onChange={(e) => up("attendance", { missing_checkout_after_hours: Number(e.target.value) })} /></Field>
        <Field label="Tốc độ di chuyển bất thường (km/h)" hint="Vị trí giữa 2 lần chấm nhảy nhanh hơn mức này sẽ bị đánh dấu"><Input type="number" value={s.attendance.max_travel_speed_kmh} onChange={(e) => up("attendance", { max_travel_speed_kmh: Number(e.target.value) })} /></Field>
        <Field label="Lưu ảnh selfie (ngày)" hint="Ảnh cũ hơn sẽ tự xoá lúc 2h sáng để tiết kiệm dung lượng. 0 = giữ mãi"><Input type="number" min={0} value={s.attendance.selfie_retention_days ?? 0} onChange={(e) => up("attendance", { selfie_retention_days: Number(e.target.value) })} /></Field>
        <div className="space-y-3 sm:col-span-2">
          <Toggle checked={s.attendance.require_selfie_checkin} onChange={(v) => up("attendance", { require_selfie_checkin: v })} label="Bắt buộc chụp selfie khi check-in" />
          <Toggle checked={s.attendance.require_selfie_checkout} onChange={(v) => up("attendance", { require_selfie_checkout: v })} label="Bắt buộc chụp selfie khi check-out" />
          <Toggle checked={s.attendance.require_location_checkout} onChange={(v) => up("attendance", { require_location_checkout: v })} label="Check-out cũng phải ở trong vùng chi nhánh" />
          <Toggle checked={s.attendance.device_binding} onChange={(v) => up("attendance", { device_binding: v })} label="Khoá thiết bị: mỗi người chỉ chấm trên 1 điện thoại đã đăng ký" />
          <Toggle checked={s.attendance.allow_unscheduled_checkin} onChange={(v) => up("attendance", { allow_unscheduled_checkin: v })} label="Cho phép check-in khi không có ca theo lịch" />
          <Toggle checked={s.attendance.require_report_before_checkout} onChange={(v) => up("attendance", { require_report_before_checkout: v })} label="Bắt buộc nộp báo cáo ngày trước khi check-out" />
          <Toggle checked={s.attendance.notify_manager_on_late} onChange={(v) => up("attendance", { notify_manager_on_late: v })} label="Báo cho quản lý khi nhân viên đi muộn" />
        </div>
      </Section>

      <Section title="Nhắc nhở tự động">
        <Field label="Nhắc check-in trước giờ vào ca (phút)"><Input type="number" value={s.reminders.checkin_before_min} onChange={(e) => up("reminders", { checkin_before_min: Number(e.target.value) })} /></Field>
        <Field label="Nhắc check-out sau giờ hết ca (phút)"><Input type="number" value={s.reminders.checkout_after_min} onChange={(e) => up("reminders", { checkout_after_min: Number(e.target.value) })} /></Field>
        <Field label="Báo vắng mặt sau giờ vào ca (phút)"><Input type="number" value={s.reminders.absent_after_min} onChange={(e) => up("reminders", { absent_after_min: Number(e.target.value) })} /></Field>
        <Field label="Nhắc việc sắp đến hạn trước (giờ)"><Input type="number" value={s.reminders.task_due_hours} onChange={(e) => up("reminders", { task_due_hours: Number(e.target.value) })} /></Field>
      </Section>

      <Section title="Nghỉ phép">
        <Field label="Số ngày phép năm mặc định"><Input type="number" step="0.5" value={s.leave.annual_quota_default} onChange={(e) => up("leave", { annual_quota_default: Number(e.target.value) })} /></Field>
        <Field label="Cộng thêm 1 ngày sau mỗi (năm thâm niên)" hint="0 = không áp dụng"><Input type="number" value={s.leave.seniority_bonus_every_years} onChange={(e) => up("leave", { seniority_bonus_every_years: Number(e.target.value) })} /></Field>
        <Toggle checked={s.leave.accrue_monthly} onChange={(v) => up("leave", { accrue_monthly: v })} label="Phép cộng dồn theo tháng (chỉ dùng số phép đã tích luỹ)" />
      </Section>

      <Section title="Quy trình duyệt đơn">
        {(Object.keys(REQUEST_LABEL) as RequestType[]).map((t) => (
          <Field key={t} label={REQUEST_LABEL[t]}>
            <Select value={flowKey(s.approval_flows[t] ?? s.approval_flows.default)}
              onChange={(e) => {
                const steps = FLOWS.find((f) => f.value === e.target.value)!.steps;
                setS({ ...s, approval_flows: { ...s.approval_flows, [t]: t === "shift_swap" ? ["swap_partner", ...steps] : steps } });
              }}>
              {FLOWS.map((f) => <option key={f.value} value={f.value}>{t === "shift_swap" ? "Đồng nghiệp → " : ""}{f.label}</option>)}
            </Select>
          </Field>
        ))}
        <p className="text-xs text-slate-500 sm:col-span-2">Bước không có người duyệt (VD: nhân viên chưa có quản lý) sẽ tự bỏ qua; nếu không còn bước nào thì Nhân sự duyệt.</p>
      </Section>

      <Section title="Tính lương">
        <Field label="Cách tính công chuẩn">
          <Select value={pay.standard_days_mode} onChange={(e) => setPay({ standard_days_mode: e.target.value as "schedule" | "fixed" })}>
            <option value="schedule">Theo số ngày làm việc trong tháng của từng người</option>
            <option value="fixed">Cố định</option>
          </Select>
        </Field>
        {pay.standard_days_mode === "fixed" && <Field label="Công chuẩn cố định"><Input type="number" value={pay.standard_days_fixed} onChange={(e) => setPay({ standard_days_fixed: Number(e.target.value) })} /></Field>}
        <Field label="Số giờ làm 1 ngày (quy đổi lương giờ)"><Input type="number" value={pay.hours_per_day} onChange={(e) => setPay({ hours_per_day: Number(e.target.value) })} /></Field>
        <Field label="Công tính khi quên check-out (0–1)" hint="Ngày quên check-out được tính bao nhiêu phần công nếu không có đơn"><Input type="number" step="0.1" min={0} max={1} value={pay.missing_checkout_credit} onChange={(e) => setPay({ missing_checkout_credit: Number(e.target.value) })} /></Field>
        <Field label="Hệ số OT ngày thường"><Input type="number" step="0.1" value={pay.ot_rates.weekday} onChange={(e) => setPay({ ot_rates: { ...pay.ot_rates, weekday: Number(e.target.value) } })} /></Field>
        <Field label="Hệ số OT ngày nghỉ hằng tuần"><Input type="number" step="0.1" value={pay.ot_rates.weekend} onChange={(e) => setPay({ ot_rates: { ...pay.ot_rates, weekend: Number(e.target.value) } })} /></Field>
        <Field label="Hệ số OT ngày lễ"><Input type="number" step="0.1" value={pay.ot_rates.holiday} onChange={(e) => setPay({ ot_rates: { ...pay.ot_rates, holiday: Number(e.target.value) } })} /></Field>
        <div />
        <Field label="Phạt mỗi lần đi muộn (đ)"><NumberInput value={pay.late_penalty_per_time} onChange={(v) => setPay({ late_penalty_per_time: v })} /></Field>
        <Field label="Phạt mỗi phút đi muộn (đ)"><NumberInput value={pay.late_penalty_per_minute} onChange={(v) => setPay({ late_penalty_per_minute: v })} /></Field>
        <Field label="Phạt mỗi lần về sớm (đ)"><NumberInput value={pay.early_penalty_per_time} onChange={(v) => setPay({ early_penalty_per_time: v })} /></Field>
        <Field label="Phạt mỗi ngày vắng không phép (đ)"><NumberInput value={pay.absence_penalty_per_day} onChange={(v) => setPay({ absence_penalty_per_day: v })} /></Field>
      </Section>

      <Section title="Bảo hiểm bắt buộc (phần người lao động)">
        <Toggle checked={pay.insurance.enabled} onChange={(v) => setPay({ insurance: { ...pay.insurance, enabled: v } })} label="Khấu trừ BHXH, BHYT, BHTN" />
        <div />
        <Field label="BHXH (%)"><Input type="number" step="0.1" value={+(pay.insurance.bhxh * 100).toFixed(2)} onChange={(e) => setPay({ insurance: { ...pay.insurance, bhxh: Number(e.target.value) / 100 } })} /></Field>
        <Field label="BHYT (%)"><Input type="number" step="0.1" value={+(pay.insurance.bhyt * 100).toFixed(2)} onChange={(e) => setPay({ insurance: { ...pay.insurance, bhyt: Number(e.target.value) / 100 } })} /></Field>
        <Field label="BHTN (%)"><Input type="number" step="0.1" value={+(pay.insurance.bhtn * 100).toFixed(2)} onChange={(e) => setPay({ insurance: { ...pay.insurance, bhtn: Number(e.target.value) / 100 } })} /></Field>
        <Field label="Đoàn phí công đoàn (%)"><Input type="number" step="0.1" value={+((pay.union_fee_rate ?? 0) * 100).toFixed(2)} onChange={(e) => setPay({ union_fee_rate: Number(e.target.value) / 100 })} /></Field>
        <Field label="Trần lương đóng BHXH/BHYT (đ)" hint="20 × lương cơ sở"><NumberInput value={pay.insurance.base_cap} onChange={(v) => setPay({ insurance: { ...pay.insurance, base_cap: v } })} /></Field>
        <Field label="Trần lương đóng BHTN (đ)" hint="20 × lương tối thiểu vùng"><NumberInput value={pay.insurance.bhtn_cap} onChange={(v) => setPay({ insurance: { ...pay.insurance, bhtn_cap: v } })} /></Field>
      </Section>

      <Section title="Thuế thu nhập cá nhân">
        <Toggle checked={pay.tax.enabled} onChange={(v) => setPay({ tax: { ...pay.tax, enabled: v } })} label="Khấu trừ thuế TNCN (biểu lũy tiến)" />
        <div />
        <Field label="Giảm trừ bản thân (đ/tháng)"><NumberInput value={pay.tax.personal_deduction} onChange={(v) => setPay({ tax: { ...pay.tax, personal_deduction: v } })} /></Field>
        <Field label="Giảm trừ mỗi người phụ thuộc (đ/tháng)"><NumberInput value={pay.tax.dependent_deduction} onChange={(v) => setPay({ tax: { ...pay.tax, dependent_deduction: v } })} /></Field>
        <div className="sm:col-span-2">
          <div className="label">Biểu thuế (thu nhập tính thuế/tháng)</div>
          <div className="space-y-2">
            {pay.tax.brackets.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-16">Bậc {i + 1}</span>
                <span>đến</span>
                <NumberInput className="w-40" value={b.upto ?? 0} onChange={(v) => setPay({ tax: { ...pay.tax, brackets: pay.tax.brackets.map((x, j) => j === i ? { ...x, upto: v || null } : x) } })} placeholder="không giới hạn" />
                <span>thuế suất</span>
                <Input className="w-20" type="number" value={+(b.rate * 100).toFixed(2)} onChange={(e) => setPay({ tax: { ...pay.tax, brackets: pay.tax.brackets.map((x, j) => j === i ? { ...x, rate: Number(e.target.value) / 100 } : x) } })} />
                <span>%</span>
                <button className="text-slate-400 hover:text-red-600" onClick={() => setPay({ tax: { ...pay.tax, brackets: pay.tax.brackets.filter((_, j) => j !== i) } })} aria-label="Xoá bậc"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setPay({ tax: { ...pay.tax, brackets: [...pay.tax.brackets, { upto: null, rate: 0.35 }] } })}>Thêm bậc</Button>
            <p className="text-xs text-slate-500">Bậc cuối để 0 = không giới hạn. Kiểm tra lại mức giảm trừ và biểu thuế theo quy định hiện hành trước khi tính lương.</p>
          </div>
        </div>
      </Section>

      <Section title="Kênh thông báo bổ sung">
        <Toggle checked={s.notifications.telegram_enabled} onChange={(v) => up("notifications", { telegram_enabled: v })} label="Gửi qua Telegram" hint="Cần cấu hình TELEGRAM_BOT_TOKEN cho Edge Function" />
        <Toggle checked={s.notifications.email_enabled} onChange={(v) => up("notifications", { email_enabled: v })} label="Gửi email (phiếu lương, kết quả đơn, thông báo chung)" hint="Cần cấu hình RESEND_API_KEY cho Edge Function" />
      </Section>

      <div className="no-print fixed bottom-4 right-4 z-30 lg:right-8">
        <Button size="lg" loading={busy} onClick={save} icon={<Save className="h-5 w-5" />} className="shadow-lg">Lưu cài đặt</Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card title={title}><div className="grid gap-4 sm:grid-cols-2">{children}</div></Card>;
}
