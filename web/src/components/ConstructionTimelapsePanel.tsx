"use client";

import { useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  buildConstructionTimelapse,
  buildTimelapseExportJson,
  buildTimelapseSvg,
  elapsedSecondsForStep,
  formatTimelapseDuration,
  type TimelapseCameraMode,
  type TimelapseSpeed,
} from "@/lib/construction-timelapse";
import { downloadBlob } from "@/lib/download";
import type { AssemblyGuide } from "@/lib/assembly-guide";

interface ConstructionTimelapsePanelProps {
  guide: AssemblyGuide;
  activeStepIndex: number;
  playing: boolean;
  speed: TimelapseSpeed;
  cameraMode: TimelapseCameraMode;
  projectName?: string;
  onStepChange: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: TimelapseSpeed) => void;
  onCameraModeChange: (mode: TimelapseCameraMode) => void;
  onFocusStep: (index: number) => void;
  onClose: () => void;
}

const SPEEDS: TimelapseSpeed[] = [0.5, 1, 2, 4];
const CAMERA_MODES: TimelapseCameraMode[] = ["orbit", "follow", "cinematic"];

function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function fileSafe(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "helscoop";
}

function downloadTextFile(text: string, filename: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  downloadBlob(blob, filename);
}

function cameraModeLabel(mode: TimelapseCameraMode): string {
  if (mode === "follow") return "Follow focus";
  if (mode === "cinematic") return "Cinematic";
  return "Orbit";
}

export default function ConstructionTimelapsePanel({
  guide,
  activeStepIndex,
  playing,
  speed,
  cameraMode,
  projectName = "helscoop-project",
  onStepChange,
  onPlayingChange,
  onSpeedChange,
  onCameraModeChange,
  onFocusStep,
  onClose,
}: ConstructionTimelapsePanelProps) {
  const { t, locale } = useTranslation();
  const { track } = useAnalytics();
  const plan = useMemo(() => buildConstructionTimelapse(guide), [guide]);
  const step = plan.steps[activeStepIndex] ?? plan.steps[0] ?? null;
  const elapsedSeconds = step ? elapsedSecondsForStep(plan, activeStepIndex) : 0;
  const progress = plan.steps.length > 0 ? activeStepIndex / Math.max(1, plan.steps.length - 1) : 0;

  function exportJson() {
    downloadTextFile(
      buildTimelapseExportJson(plan, cameraMode),
      `${fileSafe(projectName)}-timelapse-frame-plan.json`,
      "application/json",
    );
    track("construction_timelapse_exported", {
      project_name: projectName,
      format: "json",
      step_count: plan.steps.length,
      camera_mode: cameraMode,
    });
  }

  function exportSvg() {
    downloadTextFile(
      buildTimelapseSvg(plan, cameraMode),
      `${fileSafe(projectName)}-timelapse-storyboard.svg`,
      "image/svg+xml",
    );
    track("construction_timelapse_exported", {
      project_name: projectName,
      format: "svg",
      step_count: plan.steps.length,
      camera_mode: cameraMode,
    });
  }

  function togglePlayback() {
    const next = !playing;
    onPlayingChange(next);
    if (next) {
      track("construction_timelapse_started", {
        project_name: projectName,
        step_count: plan.steps.length,
        camera_mode: cameraMode,
        speed,
      });
    }
  }

  return (
    <aside className="assembly-guide-panel editor-bom-panel" data-panel="construction-timelapse" aria-label={t("timelapse.title")}>
      <div className="assembly-guide-header">
        <div>
          <div className="label-mono assembly-guide-eyebrow">{t("timelapse.eyebrow")}</div>
          <div className="heading-display assembly-guide-title">{t("timelapse.title")}</div>
        </div>
        <button type="button" className="btn btn-ghost assembly-guide-close" onClick={onClose} aria-label={t("dialog.close")}>
          x
        </button>
      </div>

      {plan.steps.length === 0 || !step ? (
        <div className="assembly-guide-empty">{t("timelapse.empty")}</div>
      ) : (
        <>
          <div className="assembly-guide-summary">
            <div>
              <span className="label-mono">{t("timelapse.steps")}</span>
              <strong>{activeStepIndex + 1}/{plan.steps.length}</strong>
            </div>
            <div>
              <span className="label-mono">{t("timelapse.duration")}</span>
              <strong>{formatTimelapseDuration(plan.totalSeconds / speed)}</strong>
            </div>
            <div>
              <span className="label-mono">{t("timelapse.schedule")}</span>
              <strong>{plan.weekendEstimate} wknd</strong>
            </div>
          </div>

          <div className="timelapse-controls">
            <div className="timelapse-step-label" aria-live="polite">
              {step.scheduledDay}: {step.title}
            </div>
            <input
              type="range"
              min={0}
              max={plan.steps.length - 1}
              value={activeStepIndex}
              onChange={(event) => onStepChange(Number(event.target.value))}
              aria-label={t("timelapse.scrub")}
              className="daylight-slider"
            />
            <div className="timelapse-transport-row">
              <button type="button" className="timelapse-nav-btn" disabled={activeStepIndex === 0} onClick={() => onStepChange(0)} aria-label={t("timelapse.first")}>|&lt;</button>
              <button type="button" className="timelapse-nav-btn" disabled={activeStepIndex === 0} onClick={() => onStepChange(activeStepIndex - 1)} aria-label={t("timelapse.previous")}>&lt;&lt;</button>
              <button type="button" className="assembly-guide-play" onClick={togglePlayback} aria-pressed={playing}>
                {playing ? t("timelapse.pause") : t("timelapse.play")}
              </button>
              <button type="button" className="timelapse-nav-btn" disabled={activeStepIndex >= plan.steps.length - 1} onClick={() => onStepChange(activeStepIndex + 1)} aria-label={t("timelapse.next")}>&gt;&gt;</button>
              <button type="button" className="timelapse-nav-btn" disabled={activeStepIndex >= plan.steps.length - 1} onClick={() => onStepChange(plan.steps.length - 1)} aria-label={t("timelapse.last")}>&gt;|</button>
            </div>
            <div className="timelapse-speed-row">
              <span className="label-mono">{t("timelapse.speed")}</span>
              {SPEEDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`timelapse-speed-btn${speed === option ? " active" : ""}`}
                  onClick={() => onSpeedChange(option)}
                >
                  {option}x
                </button>
              ))}
            </div>
          </div>

          <section className="assembly-guide-step-card">
            <div className="assembly-guide-step-meta">
              <span className="badge badge-amber">{step.scheduledDay}</span>
              <span className="label-mono">{Math.round(progress * 100)}%</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.annotation}</p>
            <div className="assembly-guide-actions">
              <button type="button" className="btn btn-primary" onClick={() => onFocusStep(activeStepIndex)}>
                {t("timelapse.focus")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={exportSvg}>
                {t("timelapse.exportSvg")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={exportJson}>
                {t("timelapse.exportJson")}
              </button>
            </div>
          </section>

          <section className="assembly-guide-section">
            <div className="assembly-guide-section-title">{t("timelapse.camera")}</div>
            <div className="assembly-guide-tools">
              {CAMERA_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`timelapse-speed-btn${cameraMode === mode ? " active" : ""}`}
                  onClick={() => onCameraModeChange(mode)}
                  style={{ width: "auto", minWidth: 72 }}
                >
                  {cameraModeLabel(mode)}
                </button>
              ))}
            </div>
          </section>

          <section className="assembly-guide-section">
            <div className="assembly-guide-section-title">{t("timelapse.annotations")}</div>
            <div style={{ display: "grid", gap: 8, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.45 }}>
              <span>{t("timelapse.elapsed")}: {formatTimelapseDuration(elapsedSeconds)} / {formatTimelapseDuration(plan.totalSeconds)}</span>
              <span>{t("timelapse.stepTime")}: {step.estimatedMinutes} min</span>
              <span>{t("timelapse.runningCost")}: {formatMoney(step.runningCost, locale)}</span>
              <span>{t("timelapse.materialCallout")}: {step.materialCount}</span>
            </div>
          </section>

          <section className="assembly-guide-section">
            <div className="assembly-guide-section-title">{t("timelapse.scheduleTimeline")}</div>
            <div className="assembly-guide-timeline" style={{ padding: 0, border: 0 }}>
              {plan.steps.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  className="assembly-guide-thumb"
                  data-active={index === activeStepIndex}
                  onClick={() => onStepChange(index)}
                  title={`${entry.scheduledDay}: ${entry.title}`}
                  aria-label={`${entry.scheduledDay}: ${entry.title}`}
                >
                  <span className="assembly-guide-thumb-preview">
                    <span style={{ background: "var(--amber)", opacity: 0.7, transform: "translate(0, 0)" }} />
                  </span>
                  <span className="assembly-guide-thumb-index">{index + 1}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="assembly-guide-shortcuts">
            {t("timelapse.shortcuts")}
          </div>
        </>
      )}
    </aside>
  );
}
