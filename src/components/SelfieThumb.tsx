import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Modal } from "./ui";

/** Ảnh selfie thu nhỏ, bấm để phóng to (url đã ký sẵn) */
export default function SelfieThumb({ url, size = 36, title }: { url?: string | null; size?: number; title?: string }) {
  const [open, setOpen] = useState(false);
  if (!url) return <div style={{ width: size, height: size }} className="flex items-center justify-center rounded-lg bg-slate-100 text-slate-300 dark:bg-slate-800"><ImageOff className="h-4 w-4" /></div>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="shrink-0">
        <img src={url} alt="selfie" style={{ width: size, height: size }} className="rounded-lg object-cover" loading="lazy" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title ?? "Ảnh chấm công"} size="sm">
        <img src={url} alt="selfie" className="w-full rounded-xl" />
      </Modal>
    </>
  );
}
