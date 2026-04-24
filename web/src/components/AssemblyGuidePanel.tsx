"use client";

import { useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  formatAssemblyDuration,
  type AssemblyGuide,
  type AssemblyGuideSpeed,
} from "@/lib/assembly-guide";

interface AssemblyGuidePanelProps {
  guide: AssemblyGuide;
  activeStepIndex: number;
  completedStepIds: Set<string>;
  playing: boolean;
  speed: AssemblyGuideSpeed;
  onStepChange: (index: number) => void;
  onToggleComplete: (stepId: string) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: AssemblyGuideSpeed) => void;
  onFocusStep: (index: number) => void;
  onOpenStepMaterial?: (index: number) => void;
  onClose: () => void;
}

const SPEEDS: AssemblyGuideSpeed[] = [1, 2, 4];

function colorToCss(color: [number, number, number]): string {
  const [r, g, b] = color.map((value) => Math.max(0, Math.min(255, Math.round(value * 255))));
  return `rgb(${r}, ${g}, ${b})`;
}

function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number): string {
  if (value >= 10) return String(Math.round(value));
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

export default function AssemblyGuidePanel({
  guide,
  activeStepIndex,
  completedStepIds,
  playing,
  speed,
  onStepChange,
  onToggleComplete,
  onPlayingChange,
  onSpeedChange,
  onFocusStep,
  onOpenStepMaterial,
  onClose,
}: AssemblyGuidePanelProps) {
  const { t, locale } = useTranslation();
  const step = guide.steps[activeStepIndex] ?? guide.steps[0] ?? null;
  const completedCount = guide.steps.filter((entry) => completedStepIds.has(entry.id)).length;
  const remainingMinutes = useMemo(
    () => guide.steps
      .filter((entry) => !completedStepIds.has(entry.id))
      .reduce((sum, entry) => sum + entry.estimatedMinutes, 0),
    [completedStepIds, guide.steps],
  );

  const progress = guide.steps.length > 0 ? completedCount / guide.steps.length : 0;

  return (
    <aside className="assembly-guide-panel editor-bom-panel" data-panel="assembly-guide" aria-label={t("assemblyGuide.title")}>
      <div className="assembly-guide-header">
        <div>
          <div className="label-mono assembly-guide-eyebrow">{t("assemblyGuide.eyebrow")}</div>
          <div className="heading-display assembly-guide-title">{t("assemblyGuide.title")}</div>
        </div>
        <button type="button" className="btn btn-ghost assembly-guide-close" onClick={onClose} aria-label={t("dialog.close")}>
          x
        </button>
      </div>

      {guide.steps.length === 0 || !step ? (
        <div className="assembly-guide-empty">{t("assemblyGuide.empty")}</div>
      ) : (
        <>
          <div className="assembly-guide-summary">
            <div>
              <span className="label-mono">{t("assemblyGuide.completed")}</span>
              <strong>{completedCount}/{guide.steps.length}</strong>
            </div>
            <div>
              <span className="label-mono">{t("assemblyGuide.remaining")}</span>
              <strong>{formatAssemblyDuration(remainingMinutes)}</strong>
            </div>
            <div>
              <span className="label-mono">{t("assemblyGuide.cost")}</span>
              <strong>{formatMoney(guide.totalCost, locale)}</strong>
            </div>
          </div>

          <div className="assembly-guide-progress" aria-label={t("assemblyGuide.progress")}>
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <div className="assembly-guide-transport">
            <button
              type="button"
              className="assembly-guide-nav"
              disabled={activeStepIndex === 0}
              onClick={() => onStepChange(activeStepIndex - 1)}
              aria-label={t("assemblyGuide.previous")}
            >
              Prev
            </button>
            <button
              type="button"
              className="assembly-guide-play"
              onClick={() => onPlayingChange(!playing)}
              aria-pressed={playing}
            >
              {playing ? t("assemblyGuide.pause") : t("assemblyGuide.play")}
            </button>
            <button
              type="button"
              className="assembly-guide-nav"
              disabled={activeStepIndex >= guide.steps.length - 1}
              onClick={() => onStepChange(activeStepIndex + 1)}
              aria-label={t("assemblyGuide.next")}
            >
              Next
            </button>
          </div>

          <div className="assembly-guide-speed-row">
            <span className="label-mono">{t("assemblyGuide.speed")}</span>
            {SPEEDS.map((option) => (
              <button
                key={option}
                type="button"
                className={`assembly-guide-speed${speed === option ? " active" : ""}`}
                onClick={() => onSpeedChange(option)}
              >
                {option}x
              </button>
            ))}
          </div>

          <div className="assembly-guide-timeline" aria-label={t("assemblyGuide.timeline")}>
            {guide.steps.map((entry, index) => {
              const active = index === activeStepIndex;
              const done = completedStepIds.has(entry.id);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="assembly-guide-thumb"
                  data-active={active}
                  data-complete={done}
                  onClick={() => onStepChange(index)}
                  aria-label={t("assemblyGuide.jumpToStep", { step: String(index + 1), title: entry.title })}
                  title={entry.title}
                >
                  <span className="assembly-guide-thumb-preview">
                    {entry.layerIds.slice(0, 3).map((layerId, layerIndex) => (
                      <span
                        key={layerId}
                        style={{
                          background: colorToCss(entry.color),
                          opacity: 0.55 + layerIndex * 0.15,
                          transform: `translate(${layerIndex * 4}px, ${layerIndex * -3}px)`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="assembly-guide-thumb-index">{done ? "OK" : index + 1}</span>
                </button>
              );
            })}
          </div>

          <section className="assembly-guide-step-card" aria-live="polite">
            <div className="assembly-guide-step-meta">
              <span className="badge badge-amber">{t("assemblyGuide.stepOf", { current: String(activeStepIndex + 1), total: String(guide.steps.length) })}</span>
              <span className="label-mono">{formatAssemblyDuration(step.estimatedMinutes)}</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>

            <div className="assembly-guide-actions">
              <button type="button" className="btn btn-primary" onClick={() => onToggleComplete(step.id)}>
                {completedStepIds.has(step.id) ? t("assemblyGuide.markOpen") : t("assemblyGuide.markDone")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onFocusStep(activeStepIndex)}>
                {t("assemblyGuide.recenter")}
              </button>
              {onOpenStepMaterial ? (
                <button type="button" className="btn btn-ghost" onClick={() => onOpenStepMaterial(activeStepIndex)}>
                  {t("assemblyGuide.buyStep")}
                </button>
              ) : null}
            </div>
          </section>

          <section className="assembly-guide-section">
            <div className="assembly-guide-section-title">{t("assemblyGuide.parts")}</div>
            <div className="assembly-guide-parts">
              {step.parts.map((part) => (
                <div key={part.materialId} className="assembly-guide-part">
                  <span className="assembly-guide-swatch" style={{ background: colorToCss(part.color) }} />
                  <div>
                    <strong>{part.name}</strong>
                    <span>{formatQuantity(part.quantity)} {part.unit} / {formatMoney(part.approxCost, locale)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="assembly-guide-section">
            <div className="assembly-guide-section-title">{t("assemblyGuide.tools")}</div>
            <div className="assembly-guide-tools">
              {step.tools.map((tool) => <span key={tool}>{tool}</span>)}
            </div>
          </section>

          <section className="assembly-guide-section">
            <div className="assembly-guide-section-title">{t("assemblyGuide.subSteps")}</div>
            <ol className="assembly-guide-substeps">
              {step.instructions.map((instruction, index) => (
                <li key={instruction.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{instruction.text}</strong>
                    <small>{instruction.tip} / {formatAssemblyDuration(instruction.minutes)}</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="assembly-guide-shortcuts">
            {t("assemblyGuide.shortcuts")}
          </div>
        </>
      )}
    </aside>
  );
}
