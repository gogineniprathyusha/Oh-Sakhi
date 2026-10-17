export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const accepted = ["image/jpeg", "image/png", "image/webp"];

/** Check size, declared type and file signature before decoding an upload. */
export async function validatePhoto(file: File) {
  if (!accepted.includes(file.type))
    throw Error("Choose a JPEG, PNG or WebP photo.");
  if (file.size === 0 || file.size > MAX_AVATAR_BYTES)
    throw Error("Choose a photo smaller than 2 MiB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (
    !(file.type === "image/png"
      ? png
      : file.type === "image/jpeg"
        ? jpeg
        : webp)
  )
    throw Error(
      "This file does not contain the selected image type. Choose another photo.",
    );
}

/** Re-encode a raster image, limiting dimensions and removing source metadata. */
export async function preparePhoto(file: File): Promise<Blob> {
  await validatePhoto(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error(
      "This photo could not be opened. Choose another JPEG, PNG or WebP image.",
    );
  }
  try {
    if (bitmap.width * bitmap.height > 25000000)
      throw Error(
        "This photo is too large to process. Choose a smaller image.",
      );
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw Error("Photo processing is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.88),
    );
    if (!blob || !accepted.includes(blob.type) || blob.size > MAX_AVATAR_BYTES)
      throw Error("The photo could not be prepared. Choose a smaller image.");
    return blob;
  } finally {
    bitmap.close();
  }
}

export function isOwnedPhoto(userId: string, path: string) {
  return (
    path.startsWith(`${userId}/`) &&
    /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(path.slice(userId.length + 1))
  );
}
