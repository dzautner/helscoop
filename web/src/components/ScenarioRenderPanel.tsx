"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useToast } from "@/components/ToastProvider";
import { useTranslation } from "@/components/LocaleProvider";
import {
  PRESENTATION_PRESETS,
  sanitizePresentationFilename,
  type PresentationPresetId,
} from "@/lib/presentation-export";
import type { LightingPresetId, ViewportPresentationApi } from "@/components/Viewport3D";

type LocaleKey = "en" | "fi" | "sv";

interface ScenarioRenderImage {
  id: PresentationPresetId;
  label: string;
  dataUrl: string;
}

const LIGHTING_OPTIONS: LightingPresetId[] = ["default", "summer", "winter", "evening"];

const COPY = {
  en: {
    eyebrow: "Scenario render",
    title: "Fast 4-view render set",
    subtitle: "Capture the current 3D renovation scenario as presentation-ready model renders. Use a photo overlay as the before image.",
    close: "Close render panel",
    generate: "Generate render set",
    regenerating: "Rendering...",
    noViewport: "3D viewport is not ready yet.",
    failed: "Could not generate scenario renders.",
    ready: "{{count}} views ready",
    lighting: "Lighting",
    beforeAfter: "Before / after",
    beforeMissing: "Add a photo overlay to compare the original building against the rendered renovation.",
    beforeAlt: "Before reference",
    afterAlt: "Rendered renovation scenario",
    slider: "Before-after split",
    downloadSelected: "Download selected",
    downloadSheet: "Download 4-view sheet",
    selectedDownloaded: "Render downloaded",
    sheetDownloaded: "Render sheet downloaded",
    default: "Default",
    summer: "Summer noon",
    winter: "Winter dusk",
    evening: "Evening",
    front: "Front",
    side: "Side",
    aerial: "Aerial",
    iso: "Iso",
    qualityNote: "Client-side WebGL preview. Treat this as a fast planning render, not a photorealistic contractor deliverable.",
  },
  fi: {
    eyebrow: "Skenaariorenderi",
    title: "Nopea 4 kuvakulman renderisarja",
    subtitle: "Tallenna nykyinen 3D-remonttisuunnitelma esityskelpoisiksi mallirendereiksi. Valokuvakerros toimii ennen-kuvana.",
    close: "Sulje renderipaneeli",
    generate: "Luo renderisarja",
    regenerating: "Renderoidaan...",
    noViewport: "3D-nakyma ei ole viela valmis.",
    failed: "Skenaariorenderien luonti epaonnistui.",
    ready: "{{count}} nakymaa valmis",
    lighting: "Valaistus",
    beforeAfter: "Ennen / jalkeen",
    beforeMissing: "Lisaa valokuvakerros, jotta voit verrata alkuperaista rakennusta renderoituun remonttiin.",
    beforeAlt: "Ennen-kuva",
    afterAlt: "Renderoitu remonttiskenaario",
    slider: "Ennen-jalkeen jakaja",
    downloadSelected: "Lataa valittu",
    downloadSheet: "Lataa 4 kuvan arkki",
    selectedDownloaded: "Renderi ladattu",
    sheetDownloaded: "Renderiarkki ladattu",
    default: "Oletus",
    summer: "Kesapaiva",
    winter: "Talvihamara",
    evening: "Ilta",
    front: "Edesta",
    side: "Sivulta",
    aerial: "Ilmakuva",
    iso: "Iso",
    qualityNote: "Selainpohjainen WebGL-esikatselu. Kayta tata nopeana suunnittelurenderina, ei fotorealistisena urakoitsija-aineistona.",
  },
  sv: {
    eyebrow: "Scenariorendering",
    title: "Snabb renderuppsattning med 4 vyer",
    subtitle: "Fanga den aktuella 3D-renoveringen som presentationsklara modellrenderingar. Fotooverlagring fungerar som fore-bild.",
    close: "Stang renderpanelen",
    generate: "Skapa renderingar",
    regenerating: "Renderar...",
    noViewport: "3D-vyn ar inte redo annu.",
    failed: "Kunde inte skapa scenariorenderingar.",
    ready: "{{count}} vyer klara",
    lighting: "Belysning",
    beforeAfter: "Fore / efter",
    beforeMissing: "Lagg till en fotooverlagring for att jamfora ursprunglig byggnad med renderad renovering.",
    beforeAlt: "Fore-referens",
    afterAlt: "Renderat renoveringsscenario",
    slider: "Fore-efter-delare",
    downloadSelected: "Ladda ner vald",
    downloadSheet: "Ladda ner 4-vyark",
    selectedDownloaded: "Rendering nedladdad",
    sheetDownloaded: "Renderark nedladdat",
    default: "Standard",
    summer: "Sommarmiddag",
    winter: "Vinter skymning",
    evening: "Kväll",
    front: "Fram",
    side: "Sida",
    aerial: "Flygvy",
    iso: "Iso",
    qualityNote: "WebGL-forhandsvisning i webblasaren. Anvand som snabb planeringsrender, inte som fotorealistiskt entreprenorunderlag.",
  },
} as const;

function labelsFor(locale: string) {
  return COPY[(locale as LocaleKey) in COPY ? (locale as LocaleKey) : "en"];
}

function template(value: string, params: Record<string, string | number>) {
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ""));
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

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = dataUrl;
  });
}

async function buildContactSheet(images: ScenarioRenderImage[], title: string): Promise<string> {
  const canvas = document.createElement("canvas");
  const width = 1800;
  const height = 1120;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  ctx.fillStyle = "#101418";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f3efe7";
  ctx.font = "700 44px Georgia, serif";
  ctx.fillText(title || "Helscoop scenario render", 56, 76);
  ctx.font = "18px monospace";
  ctx.fillStyle = "rgba(243,239,231,0.62)";
  ctx.fillText("Fast model render set - verify materials, light, and scale before ordering.", 58, 110);

  const cells = [
    { x: 56, y: 150 },
    { x: 928, y: 150 },
    { x: 56, y: 620 },
    { x: 928, y: 620 },
  ];

  const loaded = await Promise.all(images.slice(0, 4).map((item) => loadImage(item.dataUrl)));
  loaded.forEach((image, index) => {
    const cell = cells[index];
    if (!cell) return;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(cell.x - 10, cell.y - 10, 836, 446);
    ctx.drawImage(image, cell.x, cell.y, 816, 459);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(cell.x, cell.y + 411, 816, 48);
    ctx.fillStyle = "#f3efe7";
    ctx.font = "700 22px system-ui, sans-serif";
    ctx.fillText(images[index].label, cell.x + 18, cell.y + 442);
  });

  return canvas.toDataURL("image/png");
}

export default function ScenarioRenderPanel({
  projectId,
  projectName,
  beforeImage,
  captureApiRef,
  lightingPreset,
  onLightingPresetChange,
  onClose,
  autoGenerateToken = 0,
}: {
  projectId: string;
  projectName: string;
  beforeImage?: string | null;
  captureApiRef: MutableRefObject<ViewportPresentationApi | null>;
  lightingPreset: LightingPresetId;
  onLightingPresetChange: (preset: LightingPresetId) => void;
  onClose: () => void;
  autoGenerateToken?: number;
}) {
  const { locale } = useTranslation();
  const labels = labelsFor(locale);
  const { toast } = useToast();
  const { track } = useAnalytics();
  const lastAutoToken = useRef(0);
  const [selectedLighting, setSelectedLighting] = useState<LightingPresetId>(lightingPreset);
  const [rendering, setRendering] = useState(false);
  const [images, setImages] = useState<ScenarioRenderImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<PresentationPresetId>("iso");
  const [compareSplit, setCompareSplit] = useState(50);

  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) ?? images[0] ?? null,
    [images, selectedImageId],
  );

  async function generateRenderSet(source: "manual" | "toolbar" = "manual") {
    const api = captureApiRef.current;
    if (!api) {
      toast(labels.noViewport, "error");
      return;
    }

    setRendering(true);
    try {
      onLightingPresetChange(selectedLighting);
      await nextFrame();
      await nextFrame();

      const nextImages: ScenarioRenderImage[] = [];
      for (const preset of PRESENTATION_PRESETS) {
        const dataUrl = api.captureFrame({
          presetId: preset.id,
          width: 1600,
          height: 900,
          watermark: true,
        });
        if (dataUrl) {
          nextImages.push({
            id: preset.id,
            label: labels[preset.id],
            dataUrl,
          });
        }
        await nextFrame();
      }

      if (nextImages.length === 0) {
        throw new Error(labels.failed);
      }

      setImages(nextImages);
      setSelectedImageId(nextImages.find((image) => image.id === "iso")?.id ?? nextImages[0].id);
      toast(template(labels.ready, { count: nextImages.length }), "success");
      track("scenario_render_generated", {
        project_id: projectId,
        view_count: nextImages.length,
        lighting_preset: selectedLighting,
        has_before_image: Boolean(beforeImage),
        source,
      });
    } catch {
      toast(labels.failed, "error");
    } finally {
      setRendering(false);
    }
  }

  useEffect(() => {
    if (!autoGenerateToken || autoGenerateToken === lastAutoToken.current) return;
    lastAutoToken.current = autoGenerateToken;
    void generateRenderSet("toolbar");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerateToken]);

  function updateLighting(preset: LightingPresetId) {
    setSelectedLighting(preset);
    onLightingPresetChange(preset);
  }

  function downloadSelected() {
    if (!selectedImage) return;
    downloadDataUrl(
      selectedImage.dataUrl,
      sanitizePresentationFilename(`${projectName}-scenario`, selectedImage.id),
    );
    toast(labels.selectedDownloaded, "success");
    track("scenario_render_downloaded", {
      project_id: projectId,
      artifact: "single",
      view_count: 1,
      lighting_preset: selectedLighting,
    });
  }

  async function downloadContactSheet() {
    if (images.length === 0) return;
    try {
      const dataUrl = await buildContactSheet(images, projectName);
      downloadDataUrl(dataUrl, sanitizePresentationFilename(`${projectName}-scenario-sheet`, "iso"));
      toast(labels.sheetDownloaded, "success");
      track("scenario_render_downloaded", {
        project_id: projectId,
        artifact: "contact_sheet",
        view_count: images.length,
        lighting_preset: selectedLighting,
      });
    } catch {
      toast(labels.failed, "error");
    }
  }

  return (
    <aside
      aria-label={labels.title}
      style={{
        position: "absolute",
        right: 16,
        bottom: 76,
        width: "min(430px, calc(100% - 32px))",
        maxHeight: "calc(100% - 110px)",
        overflow: "auto",
        zIndex: 35,
        padding: 14,
        border: "1px solid rgba(228, 182, 92, 0.32)",
        borderRadius: "var(--radius-lg)",
        background: "linear-gradient(145deg, rgba(20,24,28,0.96), rgba(34,30,24,0.94))",
        boxShadow: "0 24px 80px rgba(0,0,0,0.42)",
        color: "var(--text-primary)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 5 }}>
            {labels.eyebrow}
          </div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{labels.title}</h3>
          <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
            {labels.subtitle}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label={labels.close}
          onClick={onClose}
          style={{ padding: 4, border: "none" }}
        >
          &times;
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 6 }}>
          {labels.lighting}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {LIGHTING_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className="btn btn-ghost"
              data-active={selectedLighting === option}
              onClick={() => updateLighting(option)}
              style={{
                minHeight: 42,
                padding: "7px 5px",
                border: selectedLighting === option ? "1px solid var(--amber)" : "1px solid var(--border)",
                color: selectedLighting === option ? "var(--amber)" : "var(--text-secondary)",
                fontSize: 10,
              }}
            >
              {labels[option]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={rendering}
        onClick={() => { void generateRenderSet("manual"); }}
        style={{ width: "100%", marginTop: 12 }}
      >
        {rendering ? labels.regenerating : labels.generate}
      </button>

      {selectedImage && (
        <div style={{ marginTop: 13, display: "grid", gap: 10 }}>
          <div
            style={{
              position: "relative",
              aspectRatio: "16 / 9",
              overflow: "hidden",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-strong)",
              background: "var(--bg-secondary)",
            }}
          >
            {beforeImage ? (
              <>
                <img
                  src={beforeImage}
                  alt={labels.beforeAlt}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                />
                <img
                  src={selectedImage.dataUrl}
                  alt={labels.afterAlt}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    clipPath: `inset(0 ${100 - compareSplit}% 0 0)`,
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${compareSplit}%`,
                    width: 2,
                    background: "var(--amber)",
                    boxShadow: "0 0 22px rgba(228,182,92,0.75)",
                  }}
                />
              </>
            ) : (
              <img
                src={selectedImage.dataUrl}
                alt={labels.afterAlt}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            )}
          </div>

          {beforeImage ? (
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
              {labels.beforeAfter}
              <input
                type="range"
                min={5}
                max={95}
                value={compareSplit}
                onChange={(event) => setCompareSplit(Number(event.target.value))}
                aria-label={labels.slider}
                className="daylight-slider"
              />
            </label>
          ) : (
            <p style={{ margin: 0, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.45 }}>
              {labels.beforeMissing}
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {images.map((image) => (
              <button
                key={image.id}
                type="button"
                aria-pressed={selectedImageId === image.id}
                onClick={() => {
                  setSelectedImageId(image.id);
                  captureApiRef.current?.focusPreset(image.id);
                }}
                style={{
                  padding: 0,
                  overflow: "hidden",
                  borderRadius: "var(--radius-sm)",
                  border: selectedImageId === image.id ? "2px solid var(--amber)" : "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  cursor: "pointer",
                }}
              >
                <img src={image.dataUrl} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }} />
                <span style={{ display: "block", padding: "4px 2px", color: "var(--text-secondary)", fontSize: 10 }}>
                  {image.label}
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={downloadSelected}>
              {labels.downloadSelected}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { void downloadContactSheet(); }}>
              {labels.downloadSheet}
            </button>
          </div>
        </div>
      )}

      <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45 }}>
        {labels.qualityNote}
      </p>
    </aside>
  );
}
