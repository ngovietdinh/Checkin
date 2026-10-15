import { Printer, Wallet } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/app/auth";
import PayslipView from "@/components/PayslipView";
import { Button, Empty, ErrorBox, Loading, Modal } from "@/components/ui";
import * as payrollApi from "@/lib/api/payroll";
import { fmtMonth, money } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import type { Payslip } from "@/lib/types";

export default function Payslips() {
  const { me } = useAuth();
  const list = useAsync(() => payrollApi.myPayslips(me!.id), [me?.id]);
  const [open, setOpen] = useState<Payslip | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Phiếu lương</h1>
      {list.error ? <ErrorBox error={list.error} /> : list.loading ? <Loading /> : !list.data?.length ? <Empty text="Chưa có phiếu lương nào được công bố" icon={<Wallet className="h-8 w-8 text-slate-300" />} /> : (
        <div className="space-y-2">
          {list.data.map((p) => (
            <button key={p.id} onClick={() => setOpen(p)} className="card flex w-full items-center justify-between p-4 text-left hover:border-brand-300">
              <div>
                <div className="font-medium">Tháng {fmtMonth(p.month)}</div>
                <div className="text-xs text-slate-500">Tổng thu nhập {money(p.gross)} đ</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Thực lĩnh</div>
                <div className="text-lg font-semibold text-brand-700 dark:text-brand-400">{money(p.net)} đ</div>
              </div>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title="Phiếu lương" size="lg"
        footer={<Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>In / Lưu PDF</Button>}>
        {open && me && <PayslipView month={open.month} employee={me} detail={open.detail} />}
      </Modal>
    </div>
  );
}
