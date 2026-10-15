import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useRefData } from "@/app/refdata";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select } from "@/components/ui";
import * as auditApi from "@/lib/api/audit";
import { fmtDateTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { AuditLog as Log } from "@/lib/types";

const ENTITY: Record<string, string> = {
  attendance: "Chấm công", employees: "Nhân viên", employee_compensation: "Lương nhân viên", employee_allowances: "Phụ cấp",
  payroll_adjustments: "Điều chỉnh lương", payroll_periods: "Kỳ lương", payslips: "Phiếu lương", settings: "Cài đặt",
  branches: "Chi nhánh", shifts: "Ca làm việc",
};
const ACTION: Record<string, { label: string; tone: "green" | "amber" | "red" }> = {
  insert: { label: "Thêm", tone: "green" }, update: { label: "Sửa", tone: "amber" }, delete: { label: "Xoá", tone: "red" },
};
const IGNORE = new Set(["updated_at", "created_at"]);

export default function AuditLog() {
  const { personName } = useRefData();
  const [entity, setEntity] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<Log | null>(null);
  const list = useAsync(() => auditApi.listAudit({ entity: entity || undefined, from: from || undefined, to: to || undefined, page }), [entity, from, to, page]);

  const changes = (l: Log) => {
    const keys = new Set([...Object.keys(l.before ?? {}), ...Object.keys(l.after ?? {})]);
    return [...keys].filter((k) => !IGNORE.has(k) && JSON.stringify(l.before?.[k]) !== JSON.stringify(l.after?.[k]));
  };
  const subject = (l: Log) => {
    const r = (l.after ?? l.before ?? {}) as Record<string, unknown>;
    return (r.full_name as string) ?? (r.employee_id ? personName(r.employee_id as string) : null) ?? (r.name as string) ?? (r.month as string) ?? l.entity_id;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Nhật ký thao tác" subtitle="Ai đã thay đổi gì: chấm công sửa tay, lương, cài đặt…" />
      <Card bodyClass="flex flex-wrap items-end gap-3 p-4">
        <Field label="Đối tượng">
          <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }}>
            <option value="">Tất cả</option>
            {Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Từ ngày"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></Field>
        <Field label="Đến ngày"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></Field>
      </Card>
      {list.error ? <ErrorBox error={list.error} /> : list.loading ? <Loading /> : !list.data?.rows.length ? <Empty /> : (
        <Card bodyClass="overflow-x-auto" actions={
          <div className="flex items-center gap-2 text-sm">
            <span>{page * list.data.size + 1}–{Math.min((page + 1) * list.data.size, list.data.total)} / {list.data.total}</span>
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="h-4 w-4" />} />
            <Button size="sm" variant="ghost" disabled={(page + 1) * list.data.size >= list.data.total} onClick={() => setPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />} />
          </div>}>
          <table className="table">
            <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Thao tác</th><th>Đối tượng</th><th>Trường thay đổi</th></tr></thead>
            <tbody>
              {list.data.rows.map((l) => (
                <tr key={l.id} className="cursor-pointer" onClick={() => setView(l)}>
                  <td className="whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                  <td>{l.actor_id ? personName(l.actor_id) : <i className="text-slate-400">Hệ thống</i>}</td>
                  <td><Badge tone={ACTION[l.action]?.tone}>{ACTION[l.action]?.label ?? l.action}</Badge> {ENTITY[l.entity] ?? l.entity}</td>
                  <td>{subject(l)}</td>
                  <td className="max-w-72 truncate text-xs text-slate-500">{l.action === "update" ? changes(l).join(", ") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal open={!!view} onClose={() => setView(null)} title="Chi tiết thay đổi" size="lg">
        {view && (
          <table className="table text-xs">
            <thead><tr><th>Trường</th><th>Trước</th><th>Sau</th></tr></thead>
            <tbody>
              {(view.action === "update" ? changes(view) : Object.keys(view.after ?? view.before ?? {})).map((k) => (
                <tr key={k}>
                  <td className="font-medium">{k}</td>
                  <td className="max-w-xs break-all text-red-700 dark:text-red-400">{JSON.stringify(view.before?.[k] ?? null)}</td>
                  <td className="max-w-xs break-all text-emerald-700 dark:text-emerald-400">{JSON.stringify(view.after?.[k] ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
