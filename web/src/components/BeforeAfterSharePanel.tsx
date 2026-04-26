"use client";

import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import BeforeAfterComparison from "@/components/BeforeAfterComparison";
import { useAnalytics } from "@/hooks/useAnalytics";
import { api as apiClient } from "@/lib/api";
import {
  buildBeforeAfterShareUrl,
  PRESENTATION_PRESETS,
  sanitizePresentationFilename,
  type PresentationPresetId,
} from "@/lib/presentation-export";
import { copyTextToClipboard } from "@/lib/clipboard";
import { downloadDataUrl } from "@/lib/download";
import type { ViewportPresentationApi } from "@/components/Viewport3D";
import type { SharePreviewState } from "@/types";

interface BeforeAfterSharePanelProps {
  projectId: string;
  shareToken: string;
  projectName: string;
  beforeImage?: string | null;
  initialPreview?: SharePreviewState | null;
  captureApiRef: MutableRefObject<ViewportPresentationApi | null>;
  onShareSaved?: (result: {
    share_preview: SharePreviewState;
    share_token: string;
    share_token_expires_at: string | null;
  }) => void;
  onCopySuccess: () => void;
  onCopyError: () => void;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = dataUrl;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function buildComparisonExport(params: {
  beforeImage?: string | null;
  afterImage: string;
  split: number;
  title: string;
  watermark: boolean;
  beforeLabel: string;
  afterLabel: string;
}): Promise<string> {
  const width = 1600;
  const height = 900;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = "#101418";
  ctx.fillRect(0, 0, width, height);

  const after = await loadImage(params.afterImage);
  if (params.beforeImage) {
    const before = await loadImage(params.beforeImage);
    drawCover(ctx, before, 0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width * (params.split / 100), height);
    ctx.clip();
    drawCover(ctx, after, 0, 0, width, height);
    ctx.restore();

    const dividerX = width * (params.split / 100);
    ctx.fillStyle = "rgba(228,182,92,0.96)";
    ctx.fillRect(dividerX - 2, 0, 4, height);
  } else {
    drawCover(ctx, after, 0, 0, width, height);
  }

  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, width, 96);
  ctx.fillStyle = "#f3efe7";
  ctx.font = "700 36px Georgia, serif";
  ctx.fillText(params.title || "Helscoop renovation", 42, 60);

  if (params.beforeImage) {
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillStyle = "rgba(16,20,24,0.72)";
    ctx.fillRect(42, height - 82, 128, 42);
    ctx.fillRect(width - 170, height - 82, 128, 42);
    ctx.fillStyle = "#f3efe7";
    ctx.fillText(params.afterLabel, 66, height - 54);
    ctx.fillText(params.beforeLabel, width - 146, height - 54);
  }

  if (params.watermark) {
    ctx.font = "700 22px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText("Made with Helscoop", width - 36, height - 28);
  }

  return canvas.toDataURL("image/png");
}

export default function BeforeAfterSharePanel({
  projectId,
  shareToken,
  projectName,
  beforeImage,
  initialPreview,
  captureApiRef,
  onShareSaved,
  onCopySuccess,
  onCopyError,
}: BeforeAfterSharePanelProps) {
  const { t } = useTranslation();
  const { track } = useAnalytics();
  const [selectedPreset, setSelectedPreset] = useState<PresentationPresetId>(initialPreview?.preset_id ?? "iso");
  const [split, setSplit] = useState(initialPreview?.split ?? 50);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedPreview, setSavedPreview] = useState<SharePreviewState | null>(initialPreview ?? null);
  const [watermarkRequired, setWatermarkRequired] = useState(true);
  const selectedPresetConfig = useMemo(
    () => PRESENTATION_PRESETS.find((preset) => preset.id === selectedPreset) ?? PRESENTATION_PRESETS[PRESENTATION_PRESETS.length - 1],
    [selectedPreset],
  );

  useEffect(() => {
    let cancelled = false;
    apiClient.getEntitlements()
      .then((result) => {
        if (cancelled) return;
        const config = (result as { planConfig?: { features?: { premiumExport?: boolean } } }).planConfig;
        setWatermarkRequired(!config?.features?.premiumExport);
      })
      .catch(() => {
        if (!cancelled) setWatermarkRequired(true);
      });
    return () => { cancelled = true; };
  }, []);

  async function generateAndSavePreview(): Promise<{
    preview: SharePreviewState;
    token: string;
  } | null> {
    const viewport = captureApiRef.current;
    if (!viewport) {
      onCopyError();
      return null;
    }

    setSaving(true);
    try {
      viewport.focusPreset(selectedPreset);
      await nextFrame();
      await nextFrame();
      const afterImage = viewport.captureFrame({
        presetId: selectedPreset,
        width: 1600,
        height: 900,
        watermark: watermarkRequired,
      });
      if (!afterImage) throw new Error("Capture failed");

      const preview: SharePreviewState = {
        kind: "before_after",
        before_image: beforeImage ?? null,
        after_image: afterImage,
        split,
        preset_id: selectedPreset,
        watermark: watermarkRequired,
        generated_at: new Date().toISOString(),
      };
      const result = await apiClient.saveSharePreview(projectId, preview);
      setSavedPreview(result.share_preview);
      onShareSaved?.(result);
      track("before_after_share_generated", {
        project_id: projectId,
        preset: selectedPreset,
        has_before_image: Boolean(beforeImage),
        watermarked: result.share_preview.watermark,
      });
      return { preview: result.share_preview, token: result.share_token };
    } catch {
      onCopyError();
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function copyShareLink() {
    const saved = savedPreview ? { preview: savedPreview, token: shareToken } : await generateAndSavePreview();
    if (!saved) return;
    const url = buildBeforeAfterShareUrl(window.location.origin, saved.token);
    const copiedToClipboard = await copyTextToClipboard(url);
    if (copiedToClipboard) {
      setCopied(true);
      onCopySuccess();
      track("before_after_share_link_copied", { project_id: projectId });
      window.setTimeout(() => setCopied(false), 1800);
      return;
    }
    onCopyError();
  }

  async function downloadComparison() {
    const saved = savedPreview ? { preview: savedPreview, token: shareToken } : await generateAndSavePreview();
    if (!saved) return;
    try {
      const dataUrl = await buildComparisonExport({
        beforeImage: saved.preview.before_image,
        afterImage: saved.preview.after_image,
        split: saved.preview.split,
        title: projectName,
        watermark: saved.preview.watermark,
        beforeLabel: t("share.beforeLabel"),
        afterLabel: t("share.afterLabel"),
      });
      downloadDataUrl(dataUrl, sanitizePresentationFilename(`${projectName}-before-after`, selectedPreset));
      track("before_after_share_downloaded", { project_id: projectId, preset: selectedPreset });
    } catch {
      onCopyError();
    }
  }

  return (
    <section className="before-after-share-panel" aria-label={t("share.beforeAfterTitle")}>
      <div className="before-after-share-head">
        <div>
          <div className="label-mono before-after-share-eyebrow">{t("share.beforeAfterEyebrow")}</div>
          <h3>{t("share.beforeAfterTitle")}</h3>
          <p>{t("share.beforeAfterDescription")}</p>
        </div>
        <span>{watermarkRequired ? t("share.watermarkFree") : t("share.watermarkPro")}</span>
      </div>

      <div className="before-after-share-presets" role="radiogroup" aria-label={t("share.beforeAfterCamera")}>
        {PRESENTATION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={preset.id === selectedPreset}
            data-active={preset.id === selectedPreset}
            onClick={() => {
              setSelectedPreset(preset.id);
              setSavedPreview(null);
              captureApiRef.current?.focusPreset(preset.id);
            }}
          >
            {t(preset.labelKey)}
          </button>
        ))}
      </div>

      {beforeImage ? (
        <label className="before-after-share-split">
          <span>{t("share.beforeAfterSplit")}</span>
          <input
            type="range"
            min={5}
            max={95}
            value={split}
            onChange={(event) => {
              setSplit(Number(event.target.value));
              setSavedPreview(null);
            }}
          />
        </label>
      ) : (
        <p className="before-after-share-missing">{t("share.beforeAfterMissingBefore")}</p>
      )}

      {savedPreview && (
        <BeforeAfterComparison
          beforeImage={savedPreview.before_image}
          afterImage={savedPreview.after_image}
          initialSplit={savedPreview.split}
          watermark={savedPreview.watermark}
          title={projectName}
          beforeLabel={t("share.beforeLabel")}
          afterLabel={t("share.afterLabel")}
          sliderLabel={t("share.beforeAfterSlider")}
        />
      )}

      <div className="before-after-share-actions">
        <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => { void generateAndSavePreview(); }}>
          {saving ? t("share.beforeAfterGenerating") : t("share.beforeAfterGenerate")}
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => { void copyShareLink(); }}>
          {copied ? t("share.copied") : t("share.beforeAfterCopy")}
        </button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => { void downloadComparison(); }}>
          {t("share.beforeAfterDownload")}
        </button>
      </div>

      <div className="before-after-share-assets">
        <span>{t("share.beforeAfterPublicRoute")}</span>
        <span>{t(selectedPresetConfig.descriptionKey)}</span>
      </div>
    </section>
  );
}
