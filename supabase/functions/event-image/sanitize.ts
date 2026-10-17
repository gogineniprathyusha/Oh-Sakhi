import {
  ImageMagick,
  MagickFormat,
  ResourceLimits,
} from "@imagemagick/magick-wasm";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Invoked only after initializing the WASM module, in the server runtime. */
export function sanitizeCover(bytes: Uint8Array, mime: string): Uint8Array {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw Error("Choose a cover up to 5 MiB.");
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  const format =
    mime === "image/png" && png
      ? MagickFormat.Png
      : mime === "image/jpeg" && jpeg
        ? MagickFormat.Jpeg
        : mime === "image/webp" && webp
          ? MagickFormat.WebP
          : undefined;
  if (!format) throw Error("Choose a genuine JPEG, PNG or WebP image.");
  ResourceLimits.memory = 64n * 1024n * 1024n;
  ResourceLimits.maxMemoryRequest = 64n * 1024n * 1024n;
  ResourceLimits.disk = 0n;
  ResourceLimits.width = 4096n;
  ResourceLimits.height = 4096n;
  ResourceLimits.listLength = 8n;
  try {
    return ImageMagick.read(bytes, format, (image) => {
      if (image.width * image.height > 4_000_000)
        throw Error("Image dimensions exceed the processing limit.");
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      image.autoOrient();
      if (scale < 1)
        image.resize(
          Math.max(1, Math.round(image.width * scale)),
          Math.max(1, Math.round(image.height * scale)),
        );
      image.strip();
      image.quality = 85;
      return image.write(MagickFormat.WebP, (data) => {
        if (!data.length || data.length > MAX_IMAGE_BYTES)
          throw Error("Prepared image exceeds the limit.");
        return Uint8Array.from(data);
      });
    });
  } catch {
    throw Error(
      "This image could not be safely processed. Choose another photo.",
    );
  }
}
