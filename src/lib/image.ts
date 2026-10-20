const MAX_PHOTO_BYTES = 200 * 1024;

export async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Không nén được ảnh");
  ctx.drawImage(bitmap, 0, 0, width, height);
  let quality = 0.82;
  let data = canvas.toDataURL("image/jpeg", quality);
  while (data.length > MAX_PHOTO_BYTES * 1.37 && quality > 0.4) {
    quality -= 0.12;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  return data;
}