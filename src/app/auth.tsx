import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as authApi from "@/lib/api/auth";
import type { Employee } from "@/lib/types";

interface AuthCtx {
  loading: boolean;
  userId: string | null;
  me: Employee | null;
  refresh: () => Promise<void>;
  isAdmin: boolean;
  isHr: boolean;       // admin hoặc hr
  isManager: boolean;  // có quyền quản lý (manager/leader/hr/admin)
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [me, setMe] = useState<Employee | null>(null);

  const load = useCallback(async (id: string | null) => {
    setUserId(id);
    if (!id) { setMe(null); setLoading(false); return; }
    try {
      setMe(await authApi.getMyProfile(id));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    authApi.currentUserId().then(load);
    let last: string | null | undefined;
    return authApi.onAuthChange((id) => { if (id !== last) { last = id; load(id); } });
  }, [load]);

  const value = useMemo<AuthCtx>(() => ({
    loading, userId, me,
    refresh: async () => load(await authApi.currentUserId()),
    isAdmin: me?.role === "admin",
    isHr: me?.role === "admin" || me?.role === "hr",
    isManager: !!me && me.role !== "employee",
  }), [loading, userId, me, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
