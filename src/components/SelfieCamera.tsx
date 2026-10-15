import { Camera, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "./ui";
import { compressImage } from "@/lib/image";
import { dayjs, TZ } from "@/lib/format";

/** Chụp ảnh khuôn mặt bằng camera trước; có đóng dấu thời gian lên ảnh */
export default function SelfieCamera({ open, onClose, onCapture, title = "Chụp ảnh xác nhận" }: {
  open: boolean; onClose: () => void; onCapture: (blob: Blob) => void; title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);

  useEffect(() => {
    if (!open) return;
    let s: MediaStream | null = null;
    setErr(null);
    setPreview(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("Trình duyệt không mở được camera trực tiếp. Bấm \"Chụp bằng ứng dụng camera\".");
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false })
      .then((st) => {
        s = st;
        setStream(st);
        if (videoRef.current) { videoRef.current.srcObject = st; videoRef.current.play().catch(() => undefined); }
      })
      .catch(() => setErr("Không mở được camera. Hãy cho phép quyền Camera cho trang này rồi thử lại."));
    return () => { s?.getTracks().forEach((t) => t.stop()); setStream(null); };
  }, [open]);

  const stamp = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    const text = dayjs().tz(TZ).format("HH:mm:ss DD/MM/YYYY");
    const h = Math.max(18, Math.round(canvas.width / 22));
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, canvas.height - h * 1.6, canvas.width, h * 1.6);
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${h}px system-ui, sans-serif`;
    ctx.fillText(text, h * 0.6, canvas.height - h * 0.5);
  };

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1); // ảnh như gương
    ctx.drawImage(v, 0, 0, c.width, c.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    stamp(c);
    const blob = await compressImage(c);
    setPreview({ url: URL.createObjectURL(blob), blob });
  };

  const fromFile = async (f: File | undefined) => {
    if (!f) return;
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    stamp(c);
    const blob = await compressImage(c);
    setPreview({ url: URL.createObjectURL(blob), blob });
  };

  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={preview ? (
        <>
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setPreview(null)}>Chụp lại</Button>
          <Button onClick={() => onCapture(preview.blob)}>Dùng ảnh này</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>Chụp bằng ứng dụng camera</Button>
          <Button icon={<Camera className="h-4 w-4" />} onClick={capture} disabled={!stream}>Chụp</Button>
        </>
      )}>
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => fromFile(e.target.files?.[0])} />
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-slate-900">
        {preview ? (
          <img src={preview.url} alt="Ảnh chụp" className="h-full w-full object-cover" />
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-[50%] border-2 border-dashed border-white/60" />
          </>
        )}
      </div>
      {err && <p className="mt-3 text-center text-sm text-amber-700 dark:text-amber-400">{err}</p>}
      {!err && !preview && <p className="mt-3 text-center text-xs text-slate-500">Đưa khuôn mặt vào khung, đủ sáng, không đeo khẩu trang.</p>}
    </Modal>
  );
}
