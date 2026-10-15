import { Bell, KeyRound, LogOut, Moon, Send, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/auth";
import { useRefData } from "@/app/refdata";
import { Avatar, Button, Card, Field, Input, Modal, Toggle, useUi } from "@/components/ui";
import * as authApi from "@/lib/api/auth";
import * as storageApi from "@/lib/api/storage";
import { getDeviceId, getDeviceLabel } from "@/lib/device";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { compressImage } from "@/lib/image";
import { ROLE_LABEL } from "@/lib/labels";
import { disablePush, enablePush, pushStatus } from "@/lib/push";

export default function Profile() {
  const { me, refresh } = useAuth();
  const { deptName, personName, positions, settings } = useRefData();
  const ui = useUi();
  const [phone, setPhone] = useState(me?.phone ?? "");
  const [tg, setTg] = useState(me?.telegram_chat_id ?? "");
  const [pw, setPw] = useState({ open: false, a: "", b: "" });
  const [push, setPush] = useState("off");
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  useEffect(() => { pushStatus().then(setPush); }, []);
  if (!me) return null;

  const saveInfo = async () => {
    try { await authApi.updateMyProfile({ phone, telegram_chat_id: tg }); await refresh(); ui.toast("Đã lưu"); } catch (e) { ui.error(e); }
  };
  const changeAvatar = async (f?: File) => {
    if (!f) return;
    try {
      const blob = await compressImage(f, 400, 0.8);
      const path = `${me.id}/avatar.jpg`;
      await storageApi.upload("avatars", path, blob, "image/jpeg");
      await authApi.updateMyProfile({ avatar_url: storageApi.publicUrl("avatars", path) + "?v=" + Date.now() });
      await refresh();
    } catch (e) { ui.error(e); }
  };
  const changePw = async () => {
    if (pw.a.length < 8) return ui.toast("Mật khẩu tối thiểu 8 ký tự", "error");
    if (pw.a !== pw.b) return ui.toast("Mật khẩu nhập lại không khớp", "error");
    try { await authApi.changePassword(pw.a); setPw({ open: false, a: "", b: "" }); ui.toast("Đã đổi mật khẩu"); } catch (e) { ui.error(e); }
  };
  const togglePush = async (on: boolean) => {
    try { if (on) { await enablePush(me.id); setPush("on"); } else { await disablePush(); setPush("off"); } } catch (e) { ui.error(e); }
  };
  const toggleDark = (v: boolean) => {
    setDark(v);
    document.documentElement.classList.toggle("dark", v);
    localStorage.setItem("chamcong.theme", v ? "dark" : "light");
  };
  const thisDevice = me.device_id === getDeviceId();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-4">
        <label className="cursor-pointer" title="Đổi ảnh đại diện">
          <Avatar name={me.full_name} url={me.avatar_url} size={64} />
          <input type="file" accept="image/*" className="hidden" onChange={(e) => changeAvatar(e.target.files?.[0])} />
        </label>
        <div>
          <h1 className="text-xl font-semibold">{me.full_name}</h1>
          <div className="text-sm text-slate-500">{me.code} · {ROLE_LABEL[me.role]}</div>
        </div>
      </div>

      <Card title="Thông tin">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="label">Phòng ban</dt><dd>{deptName(me.department_id)}</dd></div>
          <div><dt className="label">Chức vụ</dt><dd>{positions.find((p) => p.id === me.position_id)?.name ?? "–"}</dd></div>
          <div><dt className="label">Quản lý trực tiếp</dt><dd>{personName(me.manager_id)}</dd></div>
          <div><dt className="label">Ngày vào làm</dt><dd>{fmtDate(me.join_date)}</dd></div>
        </dl>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Số điện thoại"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          {settings?.notifications.telegram_enabled && (
            <Field label="Telegram Chat ID" hint="Nhắn /start cho bot của công ty để lấy mã"><Input value={tg} onChange={(e) => setTg(e.target.value)} /></Field>
          )}
        </div>
        <Button className="mt-3" size="sm" onClick={saveInfo}>Lưu</Button>
      </Card>

      <Card title="Cài đặt">
        <div className="space-y-4">
          <Toggle checked={push === "on"} onChange={togglePush} disabled={push === "unsupported" || push === "denied"}
            label={<span className="flex items-center gap-2"><Bell className="h-4 w-4" />Thông báo đẩy trên thiết bị này</span>}
            hint={push === "unsupported" ? "Trình duyệt chưa hỗ trợ (iPhone: thêm ứng dụng vào màn hình chính trước)" : push === "denied" ? "Bạn đã chặn thông báo – bật lại trong cài đặt trình duyệt" : undefined} />
          <Toggle checked={dark} onChange={toggleDark} label={<span className="flex items-center gap-2"><Moon className="h-4 w-4" />Giao diện tối</span>} />
        </div>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4" />Thiết bị chấm công</span>}>
        {me.device_id ? (
          <p className="text-sm">
            {me.device_label ?? "Thiết bị"} – đăng ký lúc {fmtDateTime(me.device_bound_at)}
            {thisDevice ? <span className="ml-2 text-emerald-600">(máy này)</span> : <span className="ml-2 text-amber-600">(không phải máy này)</span>}
          </p>
        ) : <p className="text-sm text-slate-500">Chưa đăng ký. Lần check-in đầu tiên sẽ đăng ký máy đang dùng ({getDeviceLabel()}).</p>}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<KeyRound className="h-4 w-4" />} onClick={() => setPw({ ...pw, open: true })}>Đổi mật khẩu</Button>
        <Button variant="secondary" icon={<LogOut className="h-4 w-4" />} onClick={() => authApi.signOut()}>Đăng xuất</Button>
      </div>

      <Modal open={pw.open} onClose={() => setPw({ ...pw, open: false })} title="Đổi mật khẩu" size="sm"
        footer={<Button onClick={changePw} icon={<Send className="h-4 w-4" />}>Đổi mật khẩu</Button>}>
        <div className="space-y-3">
          <Field label="Mật khẩu mới"><Input type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Nhập lại"><Input type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" /></Field>
        </div>
      </Modal>
    </div>
  );
}
