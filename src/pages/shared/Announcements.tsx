import { Megaphone, Pin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Select, Textarea, Toggle, useUi } from "@/components/ui";
import * as notifyApi from "@/lib/api/notify";
import { fmtDateTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";

export default function Announcements({ admin }: { admin?: boolean }) {
  const { me, isHr } = useAuth();
  const { personName, departments, branches, deptName, branchName } = useRefData();
  const ui = useUi();
  const list = useAsync(() => notifyApi.listAnnouncements(), []);
  const [form, setForm] = useState(false);
  const [f, setF] = useState({ title: "", body: "", target: "all" as "all" | "department" | "branch", target_ids: [] as string[], pinned: false });
  const [busy, setBusy] = useState(false);
  const canPost = me?.role === "admin" || me?.role === "hr" || me?.role === "manager";

  const save = async () => {
    setBusy(true);
    try {
      await notifyApi.createAnnouncement({ ...f, created_by: me!.id });
      ui.toast("Đã đăng và gửi thông báo");
      setForm(false);
      setF({ title: "", body: "", target: "all", target_ids: [], pinned: false });
      list.reload(true);
    } catch (e) { ui.error(e); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!(await ui.confirm({ title: "Xoá thông báo?", danger: true, confirmText: "Xoá" }))) return;
    try { await notifyApi.deleteAnnouncement(id); list.reload(true); } catch (e) { ui.error(e); }
  };

  const targetText = (t: string, ids: string[]) =>
    t === "all" ? "Toàn công ty" : (t === "department" ? ids.map(deptName) : ids.map(branchName)).join(", ");

  return (
    <div className={admin ? "space-y-4" : "mx-auto max-w-2xl space-y-4"}>
      {admin ? <PageHeader title="Thông báo chung" subtitle="Gửi tới toàn công ty, phòng ban hoặc chi nhánh (kèm thông báo đẩy)"
        actions={canPost && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setForm(true)}>Đăng thông báo</Button>} />
        : <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Thông báo chung</h1>
          {canPost && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setForm(true)}>Đăng</Button>}</div>}
      {list.error ? <ErrorBox error={list.error} /> : list.loading ? <Loading /> : !list.data?.length ? <Empty icon={<Megaphone className="h-8 w-8 text-slate-300" />} /> : (
        <div className="space-y-3">
          {list.data.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 font-semibold">{a.pinned && <Pin className="h-4 w-4 text-brand-600" />}{a.title}</h3>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{personName(a.created_by)} · {fmtDateTime(a.created_at)}</span>
                    <Badge>{targetText(a.target, a.target_ids)}</Badge>
                  </div>
                </div>
                {(isHr || a.created_by === me?.id) && <button onClick={() => remove(a.id)} className="p-1 text-slate-400 hover:text-red-600" aria-label="Xoá"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <p className="mt-3 whitespace-pre-line text-sm">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
      <Modal open={form} onClose={() => setForm(false)} title="Đăng thông báo"
        footer={<><Button variant="secondary" onClick={() => setForm(false)}>Huỷ</Button><Button loading={busy} onClick={save} disabled={!f.title || !f.body || (f.target !== "all" && !f.target_ids.length)}>Đăng & gửi</Button></>}>
        <div className="space-y-3">
          <Field label="Tiêu đề"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Nội dung"><Textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <Field label="Gửi tới">
            <Select value={f.target} onChange={(e) => setF({ ...f, target: e.target.value as typeof f.target, target_ids: [] })}>
              <option value="all">Toàn công ty</option>
              <option value="department">Phòng ban</option>
              <option value="branch">Chi nhánh</option>
            </Select>
          </Field>
          {f.target !== "all" && (
            <div className="flex flex-wrap gap-2">
              {(f.target === "department" ? departments : branches).map((x) => (
                <label key={x.id} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-sm dark:border-slate-700">
                  <input type="checkbox" className="accent-brand-700" checked={f.target_ids.includes(x.id)}
                    onChange={(e) => setF({ ...f, target_ids: e.target.checked ? [...f.target_ids, x.id] : f.target_ids.filter((i) => i !== x.id) })} />
                  {x.name}
                </label>
              ))}
            </div>
          )}
          <Toggle checked={f.pinned} onChange={(v) => setF({ ...f, pinned: v })} label="Ghim lên đầu" />
        </div>
      </Modal>
    </div>
  );
}
