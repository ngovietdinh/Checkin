import clsx from "clsx";
import {
  AlarmClock, CalendarPlus, CheckCircle2, FileWarning, LogIn, LogOut, MapPin, Megaphone, NotebookPen, ShieldAlert, Smartphone,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import SelfieCamera from "@/components/SelfieCamera";
import { Badge, Card, ErrorBox, Loading, useUi } from "@/components/ui";
import * as attendanceApi from "@/lib/api/attendance";
import * as employeesApi from "@/lib/api/employees";
import * as notifyApi from "@/lib/api/notify";
import * as requestsApi from "@/lib/api/requests";
import * as storageApi from "@/lib/api/storage";
import { getDeviceId, getDeviceLabel } from "@/lib/device";
import { errorMessage } from "@/lib/errors";
import { dayjs, fmtTime, minutesText, num, TZ } from "@/lib/format";
import { distanceM, getPosition, type Position } from "@/lib/geo";
import { useAsync, useInterval, useNow } from "@/lib/hooks";
import { REQUEST_LABEL } from "@/lib/labels";
import type { Attendance } from "@/lib/types";

type Step = "idle" | "locating" | "selfie" | "saving";

export default function Home() {
  const { me } = useAuth();
  const { settings, branches } = useRefData();
  const ui = useUi();
  const now = useNow(1000);
  const today = useAsync(() => attendanceApi.myToday(), []);
  const myBranches = useAsync(() => employeesApi.myBranchIds(me!.id), [me?.id]);
  const balance = useAsync(() => requestsApi.leaveBalance(), []);
  const news = useAsync(() => notifyApi.listAnnouncements().then((a) => a.slice(0, 2)), []);
  useInterval(() => today.reload(true), 60_000);

  const [step, setStep] = useState<Step>("idle");
  const [pos, setPos] = useState<Position | null>(null);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [result, setResult] = useState<Attendance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = today.data;
  const open = data?.open ?? null;
  const att = settings?.attendance;

  const nearest = useMemo(() => {
    if (!pos || !myBranches.data) return null;
    const list = branches.filter((b) => b.active && myBranches.data!.includes(b.id))
      .map((b) => ({ b, d: distanceM(pos.lat, pos.lng, b.lat, b.lng) }))
      .sort((a, b) => a.d - b.d);
    return list[0] ?? null;
  }, [pos, branches, myBranches.data]);

  const start = async (m: "in" | "out") => {
    setMode(m);
    setError(null);
    setResult(null);
    const needLocation = m === "in" || att?.require_location_checkout !== false;
    try {
      let p: Position | null = null;
      if (needLocation) {
        setStep("locating");
        p = await getPosition();
      }
      setPos(p);
      const needSelfie = m === "in" ? att?.require_selfie_checkin !== false : !!att?.require_selfie_checkout;
      if (needSelfie) setStep("selfie");
      else await submit(m, null, p);
    } catch (e) {
      setError(errorMessage(e));
      setStep("idle");
    }
  };

  const submit = async (m: "in" | "out", selfie: Blob | null, p: Position | null = pos) => {
    setStep("saving");
    try {
      let selfiePath: string | null = null;
      if (selfie) {
        selfiePath = `${me!.id}/${dayjs().tz(TZ).format("YYYY-MM-DD")}/${m}-${Date.now()}.jpg`;
        await storageApi.upload("selfies", selfiePath, selfie, "image/jpeg");
      }
      const meta = { position_age_ms: p ? Date.now() - p.timestamp : null, ua: navigator.userAgent.slice(0, 200) };
      const payload = { lat: p?.lat ?? 0, lng: p?.lng ?? 0, accuracy: p?.accuracy ?? 0, selfie: selfiePath, deviceId: getDeviceId(), deviceLabel: getDeviceLabel(), meta };
      const rec = m === "in"
        ? await attendanceApi.checkIn(payload)
        : await attendanceApi.checkOut(p ? payload : { deviceId: getDeviceId(), selfie: selfiePath, meta });
      setResult(rec);
      ui.toast(m === "in" ? "Check-in thành công" : "Check-out thành công");
      if (navigator.vibrate) navigator.vibrate(80);
      today.reload(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStep("idle");
    }
  };

  if (today.loading && !data) return <Loading />;
  if (today.error) return <ErrorBox error={today.error} onRetry={() => today.reload()} />;
  if (!data) return null;

  const workingMin = open?.check_in_at ? Math.max(0, Math.floor((now.getTime() - Date.parse(open.check_in_at)) / 60000)) : 0;
  const busy = step !== "idle";
  const doneToday = data.attendance.filter((a) => a.check_out_at && a.work_date === data.today);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500">Xin chào,</p>
        <h1 className="text-xl font-semibold">{me?.full_name}</h1>
      </div>

      {/* Đồng hồ + nút chấm công */}
      <section className="card overflow-hidden">
        <div className="bg-gradient-to-br from-brand-700 to-brand-900 px-5 pb-6 pt-5 text-white">
          <div className="text-sm capitalize opacity-80">{dayjs(now).tz(TZ).format("dddd, DD/MM/YYYY")}</div>
          <div className="mt-1 text-5xl font-semibold tabular-nums tracking-tight">{dayjs(now).tz(TZ).format("HH:mm")}<span className="text-2xl opacity-70">:{dayjs(now).tz(TZ).format("ss")}</span></div>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.shifts.length === 0 && <span className="rounded-full bg-white/15 px-3 py-1 text-xs">Hôm nay không có ca theo lịch</span>}
            {data.shifts.map((s) => (
              <span key={s.shift_id + s.work_date} className="rounded-full bg-white/15 px-3 py-1 text-xs">
                {s.name}: {fmtTime(s.start)} – {fmtTime(s.end)}
              </span>
            ))}
            {data.leave && <span className="rounded-full bg-amber-400/90 px-3 py-1 text-xs font-medium text-amber-950">{REQUEST_LABEL[data.leave.type]}{data.leave.half_day ? " (nửa ngày)" : ""}</span>}
          </div>
        </div>

        <div className="flex flex-col items-center px-5 py-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => start(open ? "out" : "in")}
            className={clsx(
              "relative flex h-44 w-44 flex-col items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 disabled:opacity-80",
              open ? "bg-gradient-to-br from-orange-500 to-rose-600 shadow-rose-500/30" : "bg-gradient-to-br from-emerald-500 to-brand-700 shadow-brand-700/30",
            )}
          >
            {!busy && <span className={clsx("absolute inset-0 animate-ping rounded-full opacity-20", open ? "bg-rose-500" : "bg-emerald-500")} style={{ animationDuration: "2.4s" }} />}
            {open ? <LogOut className="mb-1 h-10 w-10" /> : <LogIn className="mb-1 h-10 w-10" />}
            <span className="text-xl font-bold tracking-wide">{busy ? (step === "locating" ? "Đang định vị…" : step === "selfie" ? "Chụp ảnh…" : "Đang lưu…") : open ? "CHECK-OUT" : "CHECK-IN"}</span>
          </button>

          {open && (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Vào lúc <b>{fmtTime(open.check_in_at)}</b> · đã làm <b>{minutesText(workingMin)}</b>
              {open.late_minutes > 0 && <Badge tone="amber" className="ml-2">Muộn {open.late_minutes}′</Badge>}
            </p>
          )}

          {pos && (
            <p className="mt-3 text-center text-xs leading-relaxed text-slate-500">
              <MapPin className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
              GPS ±{num(pos.accuracy, 0)}m
              {nearest && <> · {nearest.b.name}: <b className={nearest.d <= nearest.b.radius_m ? "text-emerald-600" : "text-red-600"}>cách {num(nearest.d, 0)}m</b> (cho phép {nearest.b.radius_m}m)</>}
            </p>
          )}

          {error && (
            <div className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <div className="flex gap-2"><ShieldAlert className="h-5 w-5 shrink-0" />{error}</div>
              {/thiết bị khác/.test(error) && (
                <Link to="/requests/new?type=device_change" className="mt-2 inline-block font-medium underline">Gửi đơn đổi thiết bị</Link>
              )}
            </div>
          )}
          {result && !error && (
            <div className="mt-4 flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <div>
                {mode === "in" ? <>Check-in lúc <b>{fmtTime(result.check_in_at)}</b>{result.late_minutes > 0 && <> – muộn <b>{result.late_minutes} phút</b></>}</>
                  : <>Check-out lúc <b>{fmtTime(result.check_out_at)}</b>{result.early_minutes > 0 && <> – về sớm <b>{result.early_minutes} phút</b></>}</>}
                {result.in_distance_m != null && mode === "in" && <div className="text-xs opacity-80">Cách chi nhánh {num(result.in_distance_m, 0)}m</div>}
              </div>
            </div>
          )}
          {!data.device_bound && att?.device_binding !== false && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
              <Smartphone className="h-4 w-4 shrink-0" />
              Lần chấm công đầu tiên sẽ đăng ký điện thoại này làm thiết bị chấm công của bạn. Sau đó chỉ chấm được trên máy này.
            </p>
          )}
        </div>
      </section>

      {/* Lượt chấm hôm nay */}
      {data.attendance.length > 0 && (
        <Card title="Hôm nay" bodyClass="divide-y divide-slate-100 dark:divide-slate-800">
          {data.attendance.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{a.shift_id ? "Ca làm việc" : "Ngoài lịch"} <span className="text-slate-400">· {dayjs(a.work_date).format("DD/MM")}</span></div>
                <div className="text-slate-500">
                  {fmtTime(a.check_in_at)} → {a.check_out_at ? fmtTime(a.check_out_at) : a.missing_checkout ? "quên check-out" : "đang làm"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {a.late_minutes > 0 && <Badge tone="amber">Muộn {a.late_minutes}′</Badge>}
                {a.early_minutes > 0 && <Badge tone="orange">Sớm {a.early_minutes}′</Badge>}
                {a.check_out_at && !a.late_minutes && !a.early_minutes && <Badge tone="green">Đúng giờ</Badge>}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Lối tắt */}
      <div className="grid grid-cols-2 gap-3">
        <QuickLink to="/reports" icon={<NotebookPen className="h-5 w-5" />} title="Báo cáo hôm nay"
          sub={data.report_submitted ? "Đã nộp" : "Chưa nộp"} tone={data.report_submitted ? "ok" : "warn"} />
        <QuickLink to="/requests/new?type=leave_annual" icon={<CalendarPlus className="h-5 w-5" />} title="Xin nghỉ phép"
          sub={balance.data ? `Còn ${num(balance.data.remaining)} ngày` : "…"} />
        <QuickLink to="/requests/new?type=forgot_checkin" icon={<FileWarning className="h-5 w-5" />} title="Quên chấm công" sub="Gửi giải trình" />
        <QuickLink to="/requests/new?type=ot" icon={<AlarmClock className="h-5 w-5" />} title="Đăng ký tăng ca" sub="OT" />
      </div>

      {doneToday.length > 0 && !data.report_submitted && (
        <Link to="/reports" className="block rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Bạn chưa nộp báo cáo công việc hôm nay → <b>Viết báo cáo</b>
        </Link>
      )}

      {!!news.data?.length && (
        <Card title={<span className="flex items-center gap-2"><Megaphone className="h-4 w-4" />Thông báo</span>} actions={<Link to="/announcements" className="link text-sm">Xem tất cả</Link>} bodyClass="divide-y divide-slate-100 dark:divide-slate-800">
          {news.data.map((n) => (
            <Link key={n.id} to="/announcements" className="block px-4 py-3">
              <div className="text-sm font-medium">{n.title}</div>
              <div className="line-clamp-2 text-xs text-slate-500">{n.body}</div>
            </Link>
          ))}
        </Card>
      )}

      <SelfieCamera
        open={step === "selfie"}
        title={mode === "in" ? "Ảnh check-in" : "Ảnh check-out"}
        onClose={() => setStep("idle")}
        onCapture={(blob) => submit(mode, blob)}
      />
    </div>
  );
}

function QuickLink({ to, icon, title, sub, tone }: { to: string; icon: React.ReactNode; title: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-3 transition hover:border-brand-300">
      <div className="rounded-xl bg-brand-50 p-2 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className={clsx("text-xs", tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-slate-500")}>{sub}</div>
      </div>
    </Link>
  );
}
