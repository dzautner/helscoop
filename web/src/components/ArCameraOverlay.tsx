"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { ViewportPresentationApi } from "@/components/Viewport3D";

export interface ArModification {
  id: string;
  label: string;
  kind: "wall" | "roof" | "ground" | "opening";
  color: string;
}

interface ArCameraOverlayProps {
  open: boolean;
  projectName: string;
  modifications: ArModification[];
  captureApiRef: MutableRefObject<ViewportPresentationApi | null>;
  onClose: () => void;
  onScreenshot?: () => void;
}

type CameraState = "intro" | "starting" | "ready" | "unsupported" | "denied";

function canUseCamera(): boolean {
  return typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof window !== "undefined";
}

function safeFileName(name: string): string {
  return (name || "helscoop-ar")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toLowerCase() || "helscoop-ar";
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

export default function ArCameraOverlay({
  open,
  projectName,
  modifications,
  captureApiRef,
  onClose,
  onScreenshot,
}: ArCameraOverlayProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openRef = useRef(open);
  const [cameraState, setCameraState] = useState<CameraState>("intro");
  const [modelRender, setModelRender] = useState<string | null>(null);
  const [plannedView, setPlannedView] = useState(true);
  const [opacity, setOpacity] = useState(62);
  const [scale, setScale] = useState(100);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const defaultModifications = useMemo<ArModification[]>(() => [
    { id: "wall", label: t("ar.defaultWall"), kind: "wall", color: "rgba(228,182,92,0.34)" },
    { id: "roof", label: t("ar.defaultRoof"), kind: "roof", color: "rgba(108,157,120,0.32)" },
    { id: "ground", label: t("ar.defaultGround"), kind: "ground", color: "rgba(92,145,228,0.26)" },
  ], [t]);
  const visibleModifications = modifications.length > 0 ? modifications : defaultModifications;
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set(visibleModifications.map((item) => item.id)));

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    openRef.current = open;
    if (!open) stopCamera();
  }, [open, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const render = captureApiRef.current?.captureFrame({
      width: 1280,
      height: 720,
      presetId: "front",
      watermark: false,
    });
    setModelRender(render ?? null);
  }, [captureApiRef, open]);

  useEffect(() => {
    if (!open) return;
    setActiveIds(new Set(visibleModifications.map((item) => item.id)));
    setCameraState("intro");
    setPlannedView(true);
    setOpacity(62);
    setScale(100);
    setOffsetX(0);
    setOffsetY(0);
  }, [open, visibleModifications]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [cameraState]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startCamera() {
    if (!canUseCamera()) {
      setCameraState("unsupported");
      return;
    }
    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (!openRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setCameraState("ready");
    } catch {
      setCameraState("denied");
    }
  }

  function closeOverlay() {
    stopCamera();
    onClose();
  }

  function toggleModification(id: string) {
    setActiveIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function captureScreenshot() {
    const video = videoRef.current;
    if (!video || cameraState !== "ready") return;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#101418";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCover(
      ctx,
      video,
      video.videoWidth || 1280,
      video.videoHeight || 720,
      canvas.width,
      canvas.height,
    );
    if (plannedView && modelRender) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("AR render failed to load"));
        image.src = modelRender;
      });
      ctx.save();
      ctx.globalAlpha = opacity / 100;
      const overlayWidth = canvas.width * (scale / 100);
      const overlayHeight = overlayWidth * (9 / 16);
      ctx.drawImage(
        image,
        (canvas.width - overlayWidth) / 2 + offsetX * 4,
        canvas.height * 0.28 + offsetY * 4,
        overlayWidth,
        overlayHeight,
      );
      ctx.restore();
    }
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.fillRect(0, canvas.height - 110, canvas.width, 110);
    ctx.fillStyle = "#f3efe7";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.fillText(projectName, 38, canvas.height - 54);
    ctx.font = "22px monospace";
    ctx.fillText("Helscoop AR preview", 38, canvas.height - 22);
    downloadDataUrl(canvas.toDataURL("image/png"), `${safeFileName(projectName)}-ar-preview.png`);
    onScreenshot?.();
  }

  const activeKinds = useMemo(() => {
    const kinds = new Set<ArModification["kind"]>();
    for (const item of visibleModifications) {
      if (activeIds.has(item.id)) kinds.add(item.kind);
    }
    return kinds;
  }, [activeIds, visibleModifications]);

  if (!open) return null;

  return (
    <div className="ar-overlay" role="dialog" aria-modal="true" aria-label={t("ar.title")}>
      <div className="ar-camera-stage">
        {cameraState === "ready" ? (
          <video ref={videoRef} className="ar-camera-video" playsInline muted />
        ) : (
          <div className="ar-camera-placeholder">
            <div className="label-mono">{t("ar.mobileOnly")}</div>
            <h2>{t("ar.title")}</h2>
            <p>{t("ar.permissionCopy")}</p>
            {(cameraState === "unsupported" || cameraState === "denied") && (
              <div className="ar-fallback" role="alert">
                <strong>{cameraState === "denied" ? t("ar.permissionDenied") : t("ar.unsupported")}</strong>
                <span>{t("ar.fallbackCopy")}</span>
              </div>
            )}
            <button type="button" className="btn btn-primary" disabled={cameraState === "starting"} onClick={() => { void startCamera(); }}>
              {cameraState === "starting" ? t("ar.starting") : t("ar.startCamera")}
            </button>
            {(cameraState === "unsupported" || cameraState === "denied") && (
              <button type="button" className="btn btn-secondary" onClick={closeOverlay}>
                {t("ar.backTo3d")}
              </button>
            )}
          </div>
        )}

        {cameraState === "ready" && (
          <>
            <div className="ar-surface-guide" aria-hidden="true">
              {activeKinds.has("roof") && <span className="ar-plane ar-plane-roof">{t("ar.roofSurface")}</span>}
              {activeKinds.has("wall") && <span className="ar-plane ar-plane-wall">{t("ar.wallSurface")}</span>}
              {activeKinds.has("ground") && <span className="ar-plane ar-plane-ground">{t("ar.groundSurface")}</span>}
              {activeKinds.has("opening") && <span className="ar-plane ar-plane-opening">{t("ar.openingSurface")}</span>}
            </div>
            {plannedView && modelRender && (
              <img
                src={modelRender}
                alt=""
                className="ar-model-overlay"
                style={{
                  opacity: opacity / 100,
                  transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale / 100})`,
                }}
              />
            )}
          </>
        )}
      </div>

      <div className="ar-topbar">
        <button type="button" className="ar-close" onClick={closeOverlay} aria-label={t("ar.close")}>
          &times;
        </button>
        <div>
          <strong>{projectName}</strong>
          <span>{plannedView ? t("ar.planned") : t("ar.before")}</span>
        </div>
      </div>

      {cameraState === "ready" && (
        <div className="ar-controls">
          <div className="ar-toggle-row">
            <button type="button" className="btn btn-primary" onClick={() => setPlannedView((value) => !value)}>
              {plannedView ? t("ar.showBefore") : t("ar.showPlanned")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { void captureScreenshot(); }}>
              {t("ar.screenshot")}
            </button>
          </div>

          <div className="ar-modifications" aria-label={t("ar.modifications")}>
            {visibleModifications.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={activeIds.has(item.id)}
                data-active={activeIds.has(item.id)}
                onClick={() => toggleModification(item.id)}
              >
                <span style={{ background: item.color }} />
                {item.label}
              </button>
            ))}
          </div>

          <div className="ar-sliders">
            <label>
              <span>{t("ar.opacity")}</span>
              <input type="range" min={20} max={90} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
            </label>
            <label>
              <span>{t("ar.scale")}</span>
              <input type="range" min={70} max={140} value={scale} onChange={(event) => setScale(Number(event.target.value))} />
            </label>
            <label>
              <span>{t("ar.horizontal")}</span>
              <input type="range" min={-90} max={90} value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} />
            </label>
            <label>
              <span>{t("ar.vertical")}</span>
              <input type="range" min={-140} max={140} value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
