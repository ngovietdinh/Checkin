import { Eye, EyeOff, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/app/auth";
import { Button, Field, Input } from "@/components/ui";
import * as authApi from "@/lib/api/auth";
import { errorMessage } from "@/lib/errors";

export default function Login({ noProfile, locked }: { noProfile?: boolean; locked?: boolean }) {
  const { userId, me, refresh } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [login, setLogin] = useState(() => localStorage.getItem("chamcong.last_login") ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (userId && me?.active && !noProfile && !locked) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await authApi.signIn(login, password);
      localStorage.setItem("chamcong.last_login", login);
      await refresh();
      nav((loc.state as { from?: string })?.from ?? "/", { replace: true });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-brand-50 via-white to-sky-50 p-4 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="./icons/icon.svg" alt="" className="mb-3 h-16 w-16 drop-shadow" />
          <h1 className="text-2xl font-semibold">Chấm công</h1>
          <p className="text-sm text-slate-500">Đăng nhập bằng mã nhân viên hoặc email</p>
        </div>
        {(noProfile || locked) ? (
          <div className="card space-y-3 p-5 text-sm">
            <p>{locked ? "Tài khoản của bạn đã bị khoá." : "Tài khoản này chưa được gắn hồ sơ nhân viên. Liên hệ bộ phận nhân sự."}</p>
            <Button variant="secondary" className="w-full" onClick={() => authApi.signOut()}>Đăng xuất</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-5">
            <Field label="Mã nhân viên / Email">
              <Input autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="VD: NV001" required />
            </Field>
            <Field label="Mật khẩu">
              <div className="relative">
                <Input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
                <button type="button" className="absolute right-2 top-2 p-0.5 text-slate-400" onClick={() => setShow((s) => !s)} aria-label="Hiện mật khẩu">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </Field>
            {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{err}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy} icon={<LogIn className="h-5 w-5" />}>Đăng nhập</Button>
            <p className="text-center text-xs text-slate-500">Quên mật khẩu? Liên hệ HR để được đặt lại.</p>
          </form>
        )}
      </div>
    </div>
  );
}
