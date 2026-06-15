export interface AvatarFitOptions {
  /** Output square edge length in px. Default 256. */
  size?: number;
  /** Output MIME type. Default "image/webp" (falls back to JPEG if unsupported). */
  type?: string;
  /** Encode quality 0–1 for lossy formats. Default 0.85. */
  quality?: number;
}

const DEFAULT_SIZE = 256;
const DEFAULT_TYPE = "image/webp";
const DEFAULT_QUALITY = 0.85;

/**
 * Loads an image file, center-crops it to a square, downscales to a fixed
 * size, and re-encodes it — the auto crop + dimension restriction in one pass.
 * Returns a data-URL string usable as an <img> src or held in form state.
 *
 * Browser-only: uses `Image` and `<canvas>`, so call it from event handlers.
 */
export async function fitAvatar(file: File, opts: AvatarFitOptions = {}): Promise<string> {
  const size = opts.size ?? DEFAULT_SIZE;
  const type = opts.type ?? DEFAULT_TYPE;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);

    // Largest centered square of the source.
    const edge = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - edge) / 2;
    const sy = (img.naturalHeight - edge) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, edge, edge, 0, 0, size, size);

    let dataUrl = canvas.toDataURL(type, quality);
    // Browsers without webp support silently return PNG/"data:," — fall back.
    if (!dataUrl.startsWith(`data:${type}`)) {
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}
