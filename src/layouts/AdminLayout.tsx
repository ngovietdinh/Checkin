import clsx from "clsx";
import {
  BarChart3, Bell, Building2, CalendarClock, CalendarRange, ClipboardCheck, ClipboardList, FileClock, Fingerprint,
  History, LayoutDashboard, Megaphone, Menu, NotebookPen, Settings, Smartphone, Users, Wallet, X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Avatar } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/labels";
import { useUnread } from "./useUnread";

type NavItem = { to: string; label: string; icon: typeof Users; end?: boolean };
const GROUPS: { title: string; hr?: boolean; items: NavItem[] }[] = [
  { title: "Theo dõi", items: [
    { to: "/admin", label: "Tổng quan", icon: LayoutDashboard, end: true },
    { to: "/admin/attendance", label: "Chấm công", icon: Fingerprint },
    { to: "/admin/timesheet", label: "Bảng công", icon: CalendarRange },
    { to: "/admin/schedules", label: "Xếp lịch ca", icon: CalendarClock },
    { to: "/admin/stats", label: "Thống kê", icon: BarChart3 },
  ] },
  { title: "Công việc", items: [
    { to: "/admin/approvals", label: "Duyệt đơn", icon: ClipboardCheck },
    { to: "/admin/tasks", label: "Giao việc", icon: ClipboardList },
    { to: "/admin/reports", label: "Báo cáo ngày", icon: NotebookPen },
    { to: "/admin/announcements", label: "Thông báo chung", icon: Megaphone },
  ] },
  { title: "Nhân sự & lương", hr: true, items: [
    { to: "/admin/employees", label: "Nhân viên", icon: Users },
    { to: "/admin/payroll", label: "Tính lương", icon: Wallet },
    { to: "/admin/org", label: "Chi nhánh, ca, phòng ban", icon: Building2 },
    { to: "/admin/settings", label: "Cài đặt", icon: Settings },
    { to: "/admin/audit", label: "Nhật ký thao tác", icon: History },
  ] },
];

export default function AdminLayout() {
  const { me, isHr } = useAuth();
  const { settings } = useRefData();
  const [open, setOpen] = useState(false);
  const unread = useUnread();
  const loc = useLocation();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-4">
        <img src="./icons/icon.svg" alt="" className="h-8 w-8" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{settings?.company_name ?? "Chấm công"}</div>
          <div className="text-xs text-slate-500">Trang quản lý</div>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {GROUPS.filter((g) => !g.hr || isHr).map((g) => (
          <div key={g.title}>
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</div>
            {g.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
                className={({ isActive }) => clsx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                  isActive ? "bg-brand-50 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}>
                <Icon className="h-4 w-4" />{label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          <Smartphone className="h-4 w-4" /> Về app chấm công
        </Link>
        <Link to="/profile" className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
          <Avatar name={me?.full_name ?? "?"} url={me?.avatar_url} size={32} />
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium">{me?.full_name}</div>
            <div className="text-xs text-slate-500">{me ? ROLE_LABEL[me.role] : ""}</div>
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl dark:bg-slate-900">
            <button className="absolute right-3 top-4 p-1" onClick={() => setOpen(false)} aria-label="Đóng menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 lg:px-8">
        <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Mở menu"><Menu className="h-6 w-6" /></button>
        <div className="flex-1 truncate text-sm text-slate-500"><FileClock className="mr-1 inline h-4 w-4" />{new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}</div>
        <Link to="/notifications" state={{ from: loc.pathname }} className="relative rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Thông báo">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
        </Link>
      </header>
      <main className="mx-auto max-w-[1600px] p-4 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
