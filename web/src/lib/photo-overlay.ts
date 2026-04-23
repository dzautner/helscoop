import type { PhotoOverlayState } from "@/types";

export const PHOTO_OVERLAY_DEFAULTS = {
  opacity: 0.4,
  compare_mode: false,
  compare_position: 50,
  offset_x: 0,
  offset_y: 0,
  scale: 1,
  rotation: 0,
} satisfies Omit<PhotoOverlayState, "data_url" | "file_name" | "updated_at">;

export const PHOTO_OVERLAY_MAX_FILE_BYTES = 12 * 1024 * 1024;
export const PHOTO_OVERLAY_MAX_IMAGE_EDGE = 1800;

const SUPPORTED_UPLOAD_TYPES = new Set(["image/jpeg", "image/png"]);
const PHOTO_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,/i;

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}

export function normalizePhotoOverlayState(value: unknown): PhotoOverlayState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PhotoOverlayState> & { url?: unknown };
  const dataUrl = typeof raw.data_url === "string" ? raw.data_url : typeof raw.url === "string" ? raw.url : "";
  if (!PHOTO_DATA_URL_RE.test(dataUrl)) return null;

  return {
    data_url: dataUrl,
    file_name: typeof raw.file_name === "string" ? raw.file_name.slice(0, 160) : null,
    opacity: clampNumber(raw.opacity, 0, 1, PHOTO_OVERLAY_DEFAULTS.opacity),
    compare_mode: Boolean(raw.compare_mode),
    compare_position: clampNumber(raw.compare_position, 0, 100, PHOTO_OVERLAY_DEFAULTS.compare_position),
    offset_x: clampNumber(raw.offset_x, -50, 50, PHOTO_OVERLAY_DEFAULTS.offset_x),
    offset_y: clampNumber(raw.offset_y, -50, 50, PHOTO_OVERLAY_DEFAULTS.offset_y),
    scale: clampNumber(raw.scale, 0.5, 2.5, PHOTO_OVERLAY_DEFAULTS.scale),
    rotation: clampNumber(raw.rotation, -30, 30, PHOTO_OVERLAY_DEFAULTS.rotation),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
  };
}

export function createPhotoOverlayState(dataUrl: string, fileName?: string): PhotoOverlayState {
  return {
    data_url: dataUrl,
    file_name: fileName ? fileName.slice(0, 160) : null,
    ...PHOTO_OVERLAY_DEFAULTS,
    updated_at: new Date().toISOString(),
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("photoOverlay.readFailed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("photoOverlay.readFailed"));
    img.src = dataUrl;
  });
}

export async function readPhotoOverlayFile(file: File): Promise<PhotoOverlayState> {
  if (!SUPPORTED_UPLOAD_TYPES.has(file.type)) {
    throw new Error("photoOverlay.unsupportedType");
  }
  if (file.size > PHOTO_OVERLAY_MAX_FILE_BYTES) {
    throw new Error("photoOverlay.tooLarge");
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const source = await loadImage(sourceDataUrl);
  const scale = Math.min(1, PHOTO_OVERLAY_MAX_IMAGE_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("photoOverlay.readFailed");
  ctx.drawImage(source, 0, 0, width, height);
  return createPhotoOverlayState(canvas.toDataURL("image/jpeg", 0.86), file.name);
}

export function coverRect(imageWidth: number, imageHeight: number, targetWidth: number, targetHeight: number, scale = 1) {
  const ratio = Math.max(targetWidth / imageWidth, targetHeight / imageHeight) * scale;
  const width = imageWidth * ratio;
  const height = imageHeight * ratio;
  return { width, height, x: -width / 2, y: -height / 2 };
}

export async function composePhotoOverlayExport(modelDataUrl: string, overlay: PhotoOverlayState): Promise<string> {
  const [model, photo] = await Promise.all([loadImage(modelDataUrl), loadImage(overlay.data_url)]);
  const width = model.naturalWidth;
  const height = model.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("photoOverlay.exportFailed");

  ctx.drawImage(model, 0, 0, width, height);
  const clipWidth = overlay.compare_mode ? (width * overlay.compare_position) / 100 : width;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, clipWidth, height);
  ctx.clip();
  ctx.globalAlpha = overlay.compare_mode ? 1 : overlay.opacity;
  ctx.translate(width / 2 + (overlay.offset_x / 100) * width, height / 2 + (overlay.offset_y / 100) * height);
  ctx.rotate((overlay.rotation * Math.PI) / 180);
  const rect = coverRect(photo.naturalWidth, photo.naturalHeight, width, height, overlay.scale);
  ctx.drawImage(photo, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();

  if (overlay.compare_mode) {
    ctx.save();
    const dividerX = Math.round(clipWidth);
    ctx.strokeStyle = "rgba(229,160,75,0.95)";
    ctx.lineWidth = Math.max(2, Math.round(width * 0.003));
    ctx.beginPath();
    ctx.moveTo(dividerX, 0);
    ctx.lineTo(dividerX, height);
    ctx.stroke();
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}
