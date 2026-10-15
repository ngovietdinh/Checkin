import { ArrowLeft, Paperclip, Send } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Button, Card, Field, Input, SearchSelect, Select, Textarea, useUi } from "@/components/ui";
import * as requestsApi from "@/lib/api/requests";
import * as storageApi from "@/lib/api/storage";
import { getDeviceId, getDeviceLabel } from "@/lib/device";
import { num, todayStr } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { REQUEST_HINT, REQUEST_LABEL } from "@/lib/labels";
import type { RequestType } from "@/lib/types";

const TYPES: RequestType[] = ["leave_annual", "leave_sick", "leave_unpaid", "leave_paid", "business_trip", "ot", "late", "early", "forgot_checkin", "shift_swap", "device_change"];
const RANGE_TYPES: RequestType[] = ["leave_annual", "leave_sick", "leave_unpaid", "leave_paid", "business_trip", "late", "early"];
const HALF_TYPES: RequestType[] = ["leave_annual", "leave_sick", "leave_unpaid", "leave_paid"];

export default function NewRequest() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const ui = useUi();
  const { me } = useAuth();
  const { people } = useRefData();
  const [type, setType] = useState<RequestType>((sp.get("type") as RequestType) || "leave_annual");
  const [start, setStart] = useState(sp.get("date") || todayStr());
  const [end, setEnd] = useState(sp.get("date") || todayStr());
  const [half, setHalf] = useState<"" | "am" | "pm">("");
  const [startTime, setStartTime] = useState("17:30");
  const [endTime, setEndTime] = useState("19:30");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [partner, setPartner] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const balance = useAsync(() => requestsApi.leaveBalance(undefined, Number(start.slice(0, 4))), [start.slice(0, 4)]);

  const colleagues = useMemo(() => people.filter((p) => p.active && p.id !== me?.id), [people, me]);
  const isRange = RANGE_TYPES.includes(type);
  const otHours = useMemo(() => {
    const [h1, m1] = startTime.split(":").map(Number);
    const [h2, m2] = endTime.split(":").map(Number);
    let d = h2 * 60 + m2 - (h1 * 60 + m1);
    if (d <= 0) d += 1440;
    return Math.round((d / 60) * 100) / 100;
  }, [startTime, endTime]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let attachment: string | null = null;
      if (file) {
        attachment = `${me!.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        await storageApi.upload("attachments", attachment, file);
      }
      const payload: Record<string, unknown> = {};
      if (type === "forgot_checkin") {
        if (inTime) payload.check_in_at = `${start}T${inTime}:00+07:00`;
        if (outTime) {
          // giờ ra nhỏ hơn giờ vào => sang ngày hôm sau (ca đêm)
          const nextDay = inTime && outTime <= inTime;
          const d = nextDay ? new Date(Date.parse(start + "T00:00:00Z") + 86400000).toISOString().slice(0, 10) : start;
          payload.check_out_at = `${d}T${outTime}:00+07:00`;
        }
      }
      if (type === "shift_swap") payload.partner_id = partner;
      if (type === "device_change") { payload.device_id = getDeviceId(); payload.device_label = getDeviceLabel(); }
      await requestsApi.submitRequest({
        type,
        start_date: start,
        end_date: isRange && !half ? end : start,
        half_day: HALF_TYPES.includes(type) && half ? half : null,
        start_time: type === "ot" ? startTime : null,
        end_time: type === "ot" ? endTime : null,
        hours: type === "ot" ? otHours : null,
        reason,
        attachment,
        payload,
      });
      ui.toast("Đã gửi đơn");
      nav("/requests");
    } catch (err) {
      ui.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => nav(-1)} className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Quay lại"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-xl font-semibold">Tạo đơn</h1>
      </div>
      <Card>
        <div className="space-y-4">
          <Field label="Loại đơn" hint={REQUEST_HINT[type]}>
            <Select value={type} onChange={(e) => setType(e.target.value as RequestType)}>
              {TYPES.map((t) => <option key={t} value={t}>{REQUEST_LABEL[t]}</option>)}
            </Select>
          </Field>

          {type === "leave_annual" && balance.data && (
            <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">
              Phép năm {balance.data.year}: còn <b>{num(balance.data.remaining)}</b> ngày (đã dùng {num(balance.data.used)}, đang chờ {num(balance.data.pending)})
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={isRange ? "Từ ngày" : "Ngày"}>
              <Input type="date" value={start} required onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} />
            </Field>
            {isRange && !half && (
              <Field label="Đến ngày"><Input type="date" value={end} min={start} required onChange={(e) => setEnd(e.target.value)} /></Field>
            )}
            {HALF_TYPES.includes(type) && (
              <Field label="Thời lượng" className={half ? "" : "col-span-2"}>
                <Select value={half} onChange={(e) => { setHalf(e.target.value as "" | "am" | "pm"); if (e.target.value) setEnd(start); }}>
                  <option value="">Cả ngày</option>
                  <option value="am">Nửa ngày – buổi sáng</option>
                  <option value="pm">Nửa ngày – buổi chiều</option>
                </Select>
              </Field>
            )}
          </div>

          {type === "ot" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Từ giờ"><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required /></Field>
              <Field label="Đến giờ"><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required /></Field>
              <Field label="Số giờ"><Input value={num(otHours, 2)} readOnly /></Field>
            </div>
          )}

          {type === "forgot_checkin" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giờ vào thực tế" hint="Để trống nếu đã chấm vào"><Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} /></Field>
              <Field label="Giờ ra thực tế" hint="Để trống nếu đã chấm ra"><Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} /></Field>
            </div>
          )}

          {type === "shift_swap" && (
            <Field label="Đổi ca với" hint="Toàn bộ ca của 2 người trong ngày sẽ được hoán đổi sau khi duyệt.">
              <SearchSelect items={colleagues} value={partner} onChange={setPartner} getLabel={(p) => `${p.full_name} (${p.code})`} placeholder="Chọn đồng nghiệp" />
            </Field>
          )}

          {type === "device_change" && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
              Thiết bị đang dùng: <b>{getDeviceLabel()}</b>
              <div className="text-xs text-slate-500">Sau khi được duyệt, chỉ thiết bị này chấm công được.</div>
            </div>
          )}

          <Field label="Lý do">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do…" required={type !== "device_change"} />
          </Field>

          <Field label="Đính kèm (tuỳ chọn)" hint="Giấy khám bệnh, ảnh chụp… tối đa 10MB">
            <label className="input flex cursor-pointer items-center gap-2 text-slate-500">
              <Paperclip className="h-4 w-4" />
              <span className="truncate">{file ? file.name : "Chọn tệp"}</span>
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
        </div>
      </Card>
      <Button type="submit" size="lg" className="w-full" loading={busy} icon={<Send className="h-5 w-5" />}
        disabled={(type === "shift_swap" && !partner) || (type === "forgot_checkin" && !inTime && !outTime)}>
        Gửi đơn
      </Button>
    </form>
  );
}
