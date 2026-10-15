// Danh mục dùng chung (nhân viên, phòng ban, chi nhánh, ca…) – tải 1 lần, dùng ở mọi trang
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as orgApi from "@/lib/api/org";
import * as employeesApi from "@/lib/api/employees";
import type { AppSettings, Branch, Department, DirectoryEntry, Position, Shift } from "@/lib/types";
import { useAuth } from "./auth";

interface RefData {
  ready: boolean;
  people: DirectoryEntry[];
  team: DirectoryEntry[]; // nhân viên mình quản lý (gồm bản thân)
  departments: Department[];
  positions: Position[];
  branches: Branch[];
  shifts: Shift[];
  settings: AppSettings | null;
  person: (id: string | null | undefined) => DirectoryEntry | undefined;
  personName: (id: string | null | undefined) => string;
  deptName: (id: string | null | undefined) => string;
  branchName: (id: string | null | undefined) => string;
  shift: (id: string | null | undefined) => Shift | undefined;
  reload: () => Promise<void>;
}

const Ctx = createContext<RefData | null>(null);

export function RefDataProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [state, setState] = useState({
    ready: false, people: [] as DirectoryEntry[], teamIds: [] as string[], departments: [] as Department[], positions: [] as Position[],
    branches: [] as Branch[], shifts: [] as Shift[], settings: null as AppSettings | null,
  });

  const reload = useCallback(async () => {
    if (!userId) return;
    const [people, teamIds, departments, positions, branches, shifts, settings] = await Promise.all([
      employeesApi.directory(), employeesApi.visibleIds(), orgApi.listDepartments(), orgApi.listPositions(), orgApi.listBranches(),
      orgApi.listShifts(), orgApi.getSettings(),
    ]);
    setState({ ready: true, people, teamIds, departments, positions, branches, shifts, settings });
  }, [userId]);

  useEffect(() => { reload().catch(() => setState((s) => ({ ...s, ready: true }))); }, [reload]);

  const value = useMemo<RefData>(() => {
    const pMap = new Map(state.people.map((p) => [p.id, p]));
    const dMap = new Map(state.departments.map((d) => [d.id, d]));
    const bMap = new Map(state.branches.map((b) => [b.id, b]));
    const sMap = new Map(state.shifts.map((s) => [s.id, s]));
    const teamSet = new Set(state.teamIds);
    const { teamIds: _t, ...rest } = state;
    void _t;
    return {
      ...rest,
      team: state.people.filter((p) => teamSet.has(p.id)),
      person: (id) => (id ? pMap.get(id) : undefined),
      personName: (id) => (id ? pMap.get(id)?.full_name ?? "?" : "–"),
      deptName: (id) => (id ? dMap.get(id)?.name ?? "?" : "–"),
      branchName: (id) => (id ? bMap.get(id)?.name ?? "?" : "–"),
      shift: (id) => (id ? sMap.get(id) : undefined),
      reload,
    };
  }, [state, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRefData() {
  const c = useContext(Ctx);
  if (!c) throw new Error("RefDataProvider missing");
  return c;
}
