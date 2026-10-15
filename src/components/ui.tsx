import clsx from "clsx";
import { Loader2, X, Inbox, AlertTriangle, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import type { Tone } from "@/lib/labels";
import { errorMessage } from "@/lib/errors";
import { dayjs } from "@/lib/format";

// ---------------------------------------------------------------------------
// Nút
// ---------------------------------------------------------------------------
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}
export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-2.5 py-1.5 text-xs",
        size === "md" && "px-3.5 py-2 text-sm",
        size === "lg" && "px-5 py-3 text-base",
        variant === "primary" && "bg-brand-700 text-white shadow-sm hover:bg-brand-800",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        variant === "success" && "bg-emerald-600 text-white hover:bg-emerald-700",
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
export function Field({ label, hint, error, children, className }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={clsx("input", className)} />;
}

export function NumberInput({ value, onChange, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & { value: number | null | undefined; onChange: (v: number) => void }) {
  // hiển thị có dấu phân cách hàng nghìn cho số tiền
  const [text, setText] = useState(value == null ? "" : new Intl.NumberFormat("vi-VN").format(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? "" : new Intl.NumberFormat("vi-VN").format(value));
  }, [value]);
  return (
    <input
      {...rest}
      inputMode="decimal"
      className={clsx("input text-right tabular-nums", className)}
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setText(value == null ? "" : new Intl.NumberFormat("vi-VN").format(value)); }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(/\./g, "").replace(/,/g, ".").replace(/[^\d.-]/g, ""));
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...rest} className={clsx("input", className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} className={clsx("input pr-8", className)}>{children}</select>;
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx("flex items-start gap-3", disabled ? "opacity-60" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700")}
      >
        <span className={clsx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", checked ? "left-[22px]" : "left-0.5")} />
      </button>
      {(label || hint) && (
        <span className="text-sm">
          {label}
          {hint && <span className="block text-xs text-slate-500">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string }) {
  return (
    <label className={clsx("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input type="checkbox" className="h-4 w-4 rounded accent-brand-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Ô chọn có tìm kiếm (danh sách nhân viên dài) */
export function SearchSelect<T extends { id: string }>({
  items, value, onChange, getLabel, getSub, placeholder = "Chọn…", allowClear = true, disabled,
}: {
  items: T[]; value: string | null | undefined; onChange: (id: string | null) => void;
  getLabel: (t: T) => string; getSub?: (t: T) => string; placeholder?: string; allowClear?: boolean; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.id === value);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();
  const filtered = useMemo(() => {
    const k = norm(q);
    return items.filter((i) => !k || norm(getLabel(i) + " " + (getSub?.(i) ?? "")).includes(k)).slice(0, 100);
  }, [items, q, getLabel, getSub]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="input flex items-center justify-between text-left">
        <span className={clsx("truncate", !selected && "text-slate-400")}>{selected ? getLabel(selected) : placeholder}</span>
        {allowClear && selected && !disabled && (
          <X className="h-4 w-4 shrink-0 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); onChange(null); }} />
        )}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="relative mb-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input autoFocus className="input pl-8" placeholder="Tìm…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-64 overflow-auto">
            {filtered.length === 0 && <div className="p-3 text-center text-sm text-slate-500">Không có kết quả</div>}
            {filtered.map((i) => (
              <button type="button" key={i.id} onClick={() => { onChange(i.id); setOpen(false); setQ(""); }}
                className={clsx("block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800", i.id === value && "bg-brand-50 dark:bg-brand-900/30")}>
                <div className="truncate">{getLabel(i)}</div>
                {getSub && <div className="truncate text-xs text-slate-500">{getSub(i)}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hiển thị
// ---------------------------------------------------------------------------
export function Card({ className, children, title, actions, bodyClass }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode; bodyClass?: string }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="font-semibold">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={clsx(bodyClass ?? "p-4")}>{children}</div>
    </section>
  );
}

const TONES: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  cyan: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  none: "text-slate-400",
};
export const toneClass = (t: Tone) => TONES[t];

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone], className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("h-5 w-5 animate-spin text-brand-600", className)} />;
}

export function Loading({ text = "Đang tải…" }: { text?: string }) {
  return <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Spinner /> {text}</div>;
}

export function Empty({ text = "Chưa có dữ liệu", icon, action }: { text?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-slate-500">
      {icon ?? <Inbox className="h-8 w-8 text-slate-300" />}
      <div>{text}</div>
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">{errorMessage(error)}</div>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Thử lại</Button>}
    </div>
  );
}

export function Stat({ label, value, tone = "gray", sub, icon, onClick, active }: { label: string; value: ReactNode; tone?: Tone; sub?: ReactNode; icon?: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={clsx("card flex items-center gap-3 p-4 text-left transition disabled:cursor-default", onClick && "hover:border-brand-300", active && "ring-2 ring-brand-500")}>
      {icon && <div className={clsx("rounded-xl p-2.5", TONES[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-slate-500">{sub}</div>}
      </div>
    </button>
  );
}

export function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase();
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  if (url) return <img src={url} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />;
  return (
    <div style={{ width: size, height: size, background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 45% 30%)`, fontSize: size * 0.38 }}
      className="flex shrink-0 items-center justify-center rounded-full font-semibold">{initials}</div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={clsx("flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70", className)}>
      {items.map((t) => (
        <button key={t.value} type="button" onClick={() => onChange(t.value)}
          className={clsx("flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition",
            value === t.value ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400")}>
          {t.label}
          {t.count != null && t.count > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const shift = (n: number) => onChange(dayjs(value + "-01").add(n, "month").format("YYYY-MM"));
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button type="button" className="p-2 hover:text-brand-700" onClick={() => shift(-1)} aria-label="Tháng trước"><ChevronLeft className="h-4 w-4" /></button>
      <input type="month" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="w-36 bg-transparent py-1.5 text-center text-sm outline-none" />
      <button type="button" className="p-2 hover:text-brand-700" onClick={() => shift(1)} aria-label="Tháng sau"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

export function DateNav({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const shift = (n: number) => onChange(dayjs(value).add(n, "day").format("YYYY-MM-DD"));
  return (
    <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button type="button" className="p-2 hover:text-brand-700" onClick={() => shift(-1)} aria-label="Hôm trước"><ChevronLeft className="h-4 w-4" /></button>
      <input type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="bg-transparent py-1.5 text-center text-sm outline-none" />
      <button type="button" className="p-2 hover:text-brand-700" onClick={() => shift(1)} aria-label="Hôm sau"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hộp thoại
// ---------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx("flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 sm:rounded-2xl",
        size === "sm" && "sm:max-w-sm", size === "md" && "sm:max-w-lg", size === "lg" && "sm:max-w-3xl", size === "xl" && "sm:max-w-6xl")}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3 pb-safe dark:border-slate-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Thông báo nổi & hộp xác nhận
// ---------------------------------------------------------------------------
interface ToastItem { id: number; text: ReactNode; tone: "success" | "error" | "info" }
interface ConfirmState { title: string; message?: ReactNode; danger?: boolean; confirmText?: string; resolve: (v: boolean) => void }
interface UiCtx {
  toast: (text: ReactNode, tone?: ToastItem["tone"]) => void;
  error: (e: unknown) => void;
  confirm: (opts: Omit<ConfirmState, "resolve">) => Promise<boolean>;
}
const Ctx = createContext<UiCtx | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirm] = useState<ConfirmState | null>(null);
  const toast = useCallback((text: ReactNode, tone: ToastItem["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);
  const error = useCallback((e: unknown) => toast(errorMessage(e), "error"), [toast]);
  const confirm = useCallback((opts: Omit<ConfirmState, "resolve">) => new Promise<boolean>((resolve) => setConfirm({ ...opts, resolve })), []);
  const value = useMemo(() => ({ toast, error, confirm }), [toast, error, confirm]);
  const close = (v: boolean) => { confirmState?.resolve(v); setConfirm(null); };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-3">
        {toasts.map((t) => (
          <div key={t.id} className={clsx("pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm text-white shadow-lg",
            t.tone === "success" && "bg-emerald-600", t.tone === "error" && "bg-red-600", t.tone === "info" && "bg-slate-800")}>{t.text}</div>
        ))}
      </div>
      <Modal open={!!confirmState} onClose={() => close(false)} title={confirmState?.title} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => close(false)}>Huỷ</Button>
          <Button variant={confirmState?.danger ? "danger" : "primary"} onClick={() => close(true)}>{confirmState?.confirmText ?? "Đồng ý"}</Button>
        </>}>
        <div className="text-sm text-slate-600 dark:text-slate-300">{confirmState?.message}</div>
      </Modal>
    </Ctx.Provider>
  );
}

export function useUi() {
  const c = useContext(Ctx);
  if (!c) throw new Error("UiProvider missing");
  return c;
}
