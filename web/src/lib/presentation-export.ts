export const PRESENTATION_PRESETS = [
  {
    id: "front",
    cameraIndex: 0,
    labelKey: "presentation.front",
    descriptionKey: "presentation.frontDesc",
  },
  {
    id: "side",
    cameraIndex: 1,
    labelKey: "presentation.side",
    descriptionKey: "presentation.sideDesc",
  },
  {
    id: "aerial",
    cameraIndex: 2,
    labelKey: "presentation.aerial",
    descriptionKey: "presentation.aerialDesc",
  },
  {
    id: "iso",
    cameraIndex: 3,
    labelKey: "presentation.iso",
    descriptionKey: "presentation.isoDesc",
  },
] as const;

export type PresentationPresetId = (typeof PRESENTATION_PRESETS)[number]["id"];

export interface PresentationPreset {
  id: PresentationPresetId;
  cameraIndex: number;
  labelKey: string;
  descriptionKey: string;
}

export function getPresentationPreset(id: string | null | undefined): PresentationPreset {
  return PRESENTATION_PRESETS.find((preset) => preset.id === id) ?? PRESENTATION_PRESETS[3];
}

export function buildPresentationUrl(origin: string, shareToken: string, presetId: string | null | undefined): string {
  const cleanOrigin = origin.replace(/\/$/, "");
  const preset = getPresentationPreset(presetId);
  const params = new URLSearchParams({
    presentation: "1",
    camera: preset.id,
  });
  return `${cleanOrigin}/shared/${encodeURIComponent(shareToken)}?${params.toString()}`;
}

export function buildBeforeAfterShareUrl(origin: string, shareToken: string): string {
  const cleanOrigin = origin.replace(/\/$/, "");
  return `${cleanOrigin}/share/${encodeURIComponent(shareToken)}?compare=1`;
}

export function sanitizePresentationFilename(projectName: string, presetId: string | null | undefined, extension = "png"): string {
  const safeName = (projectName || "helscoop-project")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const preset = getPresentationPreset(presetId);
  return `${safeName || "helscoop-project"}-${preset.id}.${extension}`;
}

export function formatPresentationCurrency(amount: number, locale: string): string {
  return `${amount.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", {
    maximumFractionDigits: 0,
  })} €`;
}
