const MAX_EDGE = 2560;
/** Data URL characters; keeps the persisted appearance well inside localStorage's ~5MB. */
const MAX_DATA_URL_LENGTH = 2_500_000;

/**
 * Downscales an image file to at most 2560px on its long edge and encodes it
 * as a JPEG data URL, lowering quality until it fits the storage budget.
 * Rejects with a user-presentable message when it can't.
 */
export async function encodeWallpaper(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image couldn't be read. Try a PNG, JPEG or WebP.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser couldn't process this image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.75, 0.65, 0.55]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl;
  }
  throw new Error("This image is too detailed to store, even compressed. Try a smaller one.");
}

/** Whether localStorage has room for a value this size right now. */
export function hasStorageRoomFor(value: string): boolean {
  const probeKey = "glass:wallpaper-probe";
  try {
    localStorage.setItem(probeKey, value);
    return true;
  } catch {
    return false;
  } finally {
    localStorage.removeItem(probeKey);
  }
}
