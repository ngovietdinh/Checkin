import clsx from "clsx";
import { Bell, CalendarDays, ClipboardList, FileText, Fingerprint, LayoutGrid } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useRefData } from "@/app/refdata";
import { useUnread } from "./useUnread";

const NAV = [
  { to: "/", label: "Chấm công", icon: Fingerprint, end: true },
  { to: "/history", label: "Lịch sử", icon: CalendarDays },
  { to: "/requests", label: "Đơn từ", icon: FileText },
  { to: "/tasks", label: "Công việc", icon: ClipboardList },
  { to: "/more", label: "Thêm", icon: LayoutGrid },
];

export default function EmployeeLayout() {
  const { settings } = useRefData();
  const unread = useUnread();
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="pt-safe sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <img src="./icons/icon.svg" alt="" className="h-7 w-7" />
            <span className="truncate">{settings?.company_name ?? "Chấm công"}</span>
          </Link>
          <Link to="/notifications" className="relative rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Thông báo">
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </div>
      </header>
      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => clsx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive ? "text-brand-700 dark:text-brand-400" : "text-slate-500")}>
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
