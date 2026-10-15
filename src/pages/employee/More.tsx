import { ChevronRight, ClipboardCheck, LayoutDashboard, Megaphone, NotebookPen, UserRound, Wallet, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { Avatar, Card } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/labels";

export default function More() {
  const { me, isManager } = useAuth();
  const items = [
    { to: "/reports", label: "Báo cáo công việc", icon: NotebookPen },
    { to: "/payslips", label: "Phiếu lương", icon: Wallet },
    { to: "/announcements", label: "Thông báo chung", icon: Megaphone },
    { to: "/notifications", label: "Thông báo của tôi", icon: Bell },
    ...(isManager ? [
      { to: "/approvals", label: "Duyệt đơn", icon: ClipboardCheck },
      { to: "/admin", label: "Trang quản lý", icon: LayoutDashboard },
    ] : []),
    { to: "/profile", label: "Hồ sơ & cài đặt", icon: UserRound },
  ];
  return (
    <div className="space-y-4">
      <Link to="/profile" className="card flex items-center gap-3 p-4">
        <Avatar name={me?.full_name ?? ""} url={me?.avatar_url} size={48} />
        <div>
          <div className="font-semibold">{me?.full_name}</div>
          <div className="text-sm text-slate-500">{me?.code} · {me ? ROLE_LABEL[me.role] : ""}</div>
        </div>
      </Link>
      <Card bodyClass="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium">
            <Icon className="h-5 w-5 text-brand-700 dark:text-brand-400" />
            <span className="flex-1">{label}</span>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
