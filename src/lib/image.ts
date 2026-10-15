/** Thu nhỏ & nén ảnh trước khi tải lên (selfie ~30-60KB) */
export async function compressImage(src: Blob | HTMLCanvasElement, maxSize = 640, quality = 0.72): Promise<Blob> {
  let canvas: HTMLCanvasElement;
  if (src instanceof HTMLCanvasElement) {
    canvas = src;
  } else {
    const bmp = await createImageBitmap(src);
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không xử lý được ảnh"))), "image/jpeg", quality));
}
