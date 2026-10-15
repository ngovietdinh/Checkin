import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./app/auth";
import { RefDataProvider } from "./app/refdata";
import { Loading, UiProvider } from "./components/ui";
import { isConfigured } from "./lib/config";
import EmployeeLayout from "./layouts/EmployeeLayout";
import AdminLayout from "./layouts/AdminLayout";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Home from "./pages/employee/Home";
import History from "./pages/employee/History";
import Requests from "./pages/employee/Requests";
import NewRequest from "./pages/employee/NewRequest";
import Tasks from "./pages/employee/Tasks";
import TaskDetail from "./pages/shared/TaskDetail";
import Reports from "./pages/employee/Reports";
import Payslips from "./pages/employee/Payslips";
import Notifications from "./pages/employee/Notifications";
import Announcements from "./pages/shared/Announcements";
import Profile from "./pages/employee/Profile";
import More from "./pages/employee/More";
import Approvals from "./pages/shared/Approvals";

const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const AttendanceAdmin = lazy(() => import("./pages/admin/Attendance"));
const Timesheet = lazy(() => import("./pages/admin/Timesheet"));
const Schedules = lazy(() => import("./pages/admin/Schedules"));
const TasksAdmin = lazy(() => import("./pages/admin/TasksAdmin"));
const ReportsAdmin = lazy(() => import("./pages/admin/ReportsAdmin"));
const Employees = lazy(() => import("./pages/admin/Employees"));
const Payroll = lazy(() => import("./pages/admin/Payroll"));
const Organization = lazy(() => import("./pages/admin/Organization"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const AuditLog = lazy(() => import("./pages/admin/AuditLog"));
const Stats = lazy(() => import("./pages/admin/Stats"));

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, userId, me } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!userId) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (!me) return <Login noProfile />;
  if (!me.active) return <Login locked />;
  return <RefDataProvider>{children}</RefDataProvider>;
}

function RequireRole({ hr, children }: { hr?: boolean; children: ReactNode }) {
  const { isHr, isManager } = useAuth();
  if (hr ? !isHr : !isManager) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  if (!isConfigured) return <Setup />;
  return (
    <UiProvider>
      <AuthProvider>
        <HashRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth><EmployeeLayout /></RequireAuth>}>
                <Route index element={<Home />} />
                <Route path="history" element={<History />} />
                <Route path="requests" element={<Requests />} />
                <Route path="requests/new" element={<NewRequest />} />
                <Route path="approvals" element={<Approvals />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="reports" element={<Reports />} />
                <Route path="payslips" element={<Payslips />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="profile" element={<Profile />} />
                <Route path="more" element={<More />} />
              </Route>
              <Route path="/admin" element={<RequireAuth><RequireRole><AdminLayout /></RequireRole></RequireAuth>}>
                <Route index element={<Dashboard />} />
                <Route path="attendance" element={<AttendanceAdmin />} />
                <Route path="timesheet" element={<Timesheet />} />
                <Route path="schedules" element={<Schedules />} />
                <Route path="approvals" element={<Approvals admin />} />
                <Route path="tasks" element={<TasksAdmin />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="reports" element={<ReportsAdmin />} />
                <Route path="stats" element={<Stats />} />
                <Route path="announcements" element={<Announcements admin />} />
                <Route path="employees" element={<RequireRole hr><Employees /></RequireRole>} />
                <Route path="payroll" element={<RequireRole hr><Payroll /></RequireRole>} />
                <Route path="org" element={<RequireRole hr><Organization /></RequireRole>} />
                <Route path="settings" element={<RequireRole hr><Settings /></RequireRole>} />
                <Route path="audit" element={<RequireRole hr><AuditLog /></RequireRole>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </UiProvider>
  );
}
