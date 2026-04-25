"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  buildPresentationUrl,
  formatPresentationCurrency,
  getPresentationPreset,
  PRESENTATION_PRESETS,
  sanitizePresentationFilename,
  type PresentationPresetId,
} from "@/lib/presentation-export";
import type { BomItem } from "@/types";
import type { ViewportPresentationApi } from "@/components/Viewport3D";

interface SharePresentationPanelProps {
  shareToken: string;
  projectName: string;
  bom: BomItem[];
  captureApiRef: React.MutableRefObject<ViewportPresentationApi | null>;
  onCopySuccess: () => void;
  onCopyError: () => void;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

export default function SharePresentationPanel({
  shareToken,
  projectName,
  bom,
  captureApiRef,
  onCopySuccess,
  onCopyError,
}: SharePresentationPanelProps) {
  const { t, locale } = useTranslation();
  const { track } = useAnalytics();
  const [selectedPreset, setSelectedPreset] = useState<PresentationPresetId>("iso");
  const [copied, setCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const total = useMemo(() => bom.reduce((sum, item) => sum + Number(item.total || 0), 0), [bom]);
  const selected = getPresentationPreset(selectedPreset);

  const presentationUrl =
    typeof window === "undefined"
      ? ""
      : buildPresentationUrl(window.location.origin, shareToken, selectedPreset);

  const copyPresentationUrl = async () => {
    if (!presentationUrl) return;
    try {
      await navigator.clipboard.writeText(presentationUrl);
      setCopied(true);
      onCopySuccess();
      track("presentation_link_copied", { preset: selectedPreset });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      onCopyError();
    }
  };

  const downloadRender = () => {
    const api = captureApiRef.current;
    if (!api) return;
    setRendering(true);
    api.focusPreset(selectedPreset);
    requestAnimationFrame(() => {
      const dataUrl = api.captureFrame({
        presetId: selectedPreset,
        width: 1600,
        height: 900,
        watermark: true,
      });
      setRendering(false);
      if (!dataUrl) {
        onCopyError();
        return;
      }
      downloadDataUrl(dataUrl, sanitizePresentationFilename(projectName, selectedPreset));
      track("presentation_render_downloaded", { preset: selectedPreset, watermarked: true });
    });
  };

  return (
    <section className="share-presentation-panel" aria-label={t("presentation.title")}>
      <div className="share-presentation-head">
        <div>
          <div className="label-mono share-presentation-eyebrow">{t("presentation.eyebrow")}</div>
          <h3>{t("presentation.title")}</h3>
          <p>{t("presentation.description")}</p>
        </div>
        <div className="share-presentation-total">
          <span>{t("presentation.estimate")}</span>
          <strong>{formatPresentationCurrency(total, locale)}</strong>
        </div>
      </div>

      <div className="share-presentation-presets" role="radiogroup" aria-label={t("presentation.cameraPresets")}>
        {PRESENTATION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={preset.id === selectedPreset}
            data-active={preset.id === selectedPreset}
            onClick={() => {
              setSelectedPreset(preset.id);
              captureApiRef.current?.focusPreset(preset.id);
            }}
          >
            <strong>{t(preset.labelKey)}</strong>
            <span>{t(preset.descriptionKey)}</span>
          </button>
        ))}
      </div>

      <div className="share-presentation-actions">
        <button type="button" className="btn btn-primary" onClick={copyPresentationUrl}>
          {copied ? t("presentation.copied") : t("presentation.copyPresentation")}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!captureApiRef.current || rendering}
          onClick={downloadRender}
        >
          {rendering ? t("presentation.rendering") : t("presentation.downloadWatermarked")}
        </button>
      </div>

      <div className="share-presentation-assets">
        <span>{t("presentation.assetViewer")}</span>
        <span>{t("presentation.assetBom", { count: bom.length })}</span>
        <span>{t(selected.labelKey)}</span>
      </div>
    </section>
  );
}
