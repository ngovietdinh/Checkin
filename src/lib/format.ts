import dayjs from "dayjs";
import "dayjs/locale/vi";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import isoWeek from "dayjs/plugin/isoWeek";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(isoWeek);
dayjs.locale("vi");
export const TZ = "Asia/Ho_Chi_Minh";
dayjs.tz.setDefault(TZ);
export { dayjs };

const moneyFmt = new Intl.NumberFormat("vi-VN");
export const money = (n: number | null | undefined) => (n == null ? "–" : moneyFmt.format(Math.round(n)));
export const vnd = (n: number | null | undefined) => (n == null ? "–" : moneyFmt.format(Math.round(n)) + " đ");
export const num = (n: number | null | undefined, digits = 1) =>
  n == null ? "–" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(n);

/** Ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD) */
export const todayStr = () => dayjs().tz(TZ).format("YYYY-MM-DD");
export const monthStr = (d?: string) => (d ? dayjs(d) : dayjs().tz(TZ)).format("YYYY-MM");

export const fmtDate = (d: string | null | undefined) => (d ? dayjs(d).format("DD/MM/YYYY") : "–");
export const fmtDateShort = (d: string | null | undefined) => (d ? dayjs(d).format("DD/MM") : "–");
export const fmtTime = (ts: string | null | undefined) => (ts ? dayjs(ts).tz(TZ).format("HH:mm") : "--:--");
export const fmtDateTime = (ts: string | null | undefined) => (ts ? dayjs(ts).tz(TZ).format("HH:mm DD/MM/YYYY") : "–");
export const fmtRelative = (ts: string) => dayjs(ts).fromNow();
export const weekdayName = (d: string) => dayjs(d).format("dd");
export const fmtMonth = (m: string) => dayjs(m + "-01").format("MM/YYYY");
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

export function minutesText(min: number) {
  if (!min) return "0 phút";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} giờ${m ? ` ${m} phút` : ""}` : `${m} phút`;
}

export const WEEKDAYS = [
  { v: 1, short: "T2", long: "Thứ 2" }, { v: 2, short: "T3", long: "Thứ 3" }, { v: 3, short: "T4", long: "Thứ 4" },
  { v: 4, short: "T5", long: "Thứ 5" }, { v: 5, short: "T6", long: "Thứ 6" }, { v: 6, short: "T7", long: "Thứ 7" },
  { v: 7, short: "CN", long: "Chủ nhật" },
];

export const isoDowLabel = (d: string) => WEEKDAYS[(dayjs(d).isoWeekday() - 1)].short;
