"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "@/components/LocaleProvider";

const STORAGE_KEY = "helscoop_onboarding_completed";

export interface TourStep {
  /** CSS selector for the target element */
  target: string;
  /** i18n key for the tooltip content */
  contentKey: string;
  /** Preferred tooltip placement relative to target */
  placement: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "[data-tour='address-input']",
    contentKey: "onboarding.stepAddress",
    placement: "bottom",
  },
  {
    target: "[data-tour='viewport']",
    contentKey: "onboarding.stepViewport",
    placement: "left",
  },
  {
    target: "[data-tour='chat-toggle']",
    contentKey: "onboarding.stepChat",
    placement: "bottom",
  },
  {
    target: "[data-tour='bom-panel']",
    contentKey: "onboarding.stepMaterials",
    placement: "left",
  },
  {
    target: "[data-tour='export-btn']",
    contentKey: "onboarding.stepExport",
    placement: "bottom",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getElementRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function computeTooltipPosition(
  rect: Rect,
  placement: TourStep["placement"],
  tooltipWidth: number,
  tooltipHeight: number
): { top: number; left: number } {
  const gap = 12;
  let top = 0;
  let left = 0;

  switch (placement) {
    case "bottom":
      top = rect.top + rect.height + gap;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case "top":
      top = rect.top - tooltipHeight - gap;
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left - tooltipWidth - gap;
      break;
    case "right":
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
      left = rect.left + rect.width + gap;
      break;
  }

  // Clamp to viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left < 12) left = 12;
  if (left + tooltipWidth > vw - 12) left = vw - tooltipWidth - 12;
  if (top < 12) top = 12;
  if (top + tooltipHeight > vh - 12) top = vh - tooltipHeight - 12;

  return { top, left };
}

export function isOnboardingCompleted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function resetOnboarding(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function completeOnboarding(): void {
  localStorage.setItem(STORAGE_KEY, "true");
}

/** Welcome modal shown on first visit */
export function WelcomeModal({
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSkip();
      }}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          padding: "40px 36px 32px",
          maxWidth: 440,
          width: "90vw",
          textAlign: "center",
          animation: "dialogSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            margin: "0 auto 20px",
            borderRadius: 12,
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border-strong)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </div>

        <h2
          className="heading-display"
          style={{
            fontSize: 24,
            marginBottom: 12,
            color: "var(--text-primary)",
          }}
        >
          {t("onboarding.welcomeTitle")}
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 28,
          }}
        >
          {t("onboarding.welcomeBody")}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            className="btn btn-ghost"
            onClick={onSkip}
            style={{ padding: "10px 20px" }}
          >
            {t("onboarding.welcomeSkip")}
          </button>
          <button
            className="btn btn-primary"
            onClick={onStart}
            style={{ padding: "10px 24px" }}
          >
            {t("onboarding.welcomeStart")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Step-by-step tooltip tour overlay */
export function TourOverlay({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipSize, setTooltipSize] = useState({ width: 320, height: 150 });

  // Find visible steps (elements that exist in the DOM)
  const visibleSteps = TOUR_STEPS.filter(
    (step) => document.querySelector(step.target) !== null
  );

  const step = visibleSteps[currentStep];

  const updateRect = useCallback(() => {
    if (!step) return;
    const rect = getElementRect(step.target);
    setTargetRect(rect);
  }, [step]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [updateRect]);

  useEffect(() => {
    if (tooltipRef.current) {
      const r = tooltipRef.current.getBoundingClientRect();
      setTooltipSize({ width: r.width, height: r.height });
    }
  }, [currentStep, targetRect]);

  if (visibleSteps.length === 0 || !step) {
    onComplete();
    return null;
  }

  const padding = 8;

  // Build the spotlight clip-path (inverted rectangle)
  const spotlightStyle: React.CSSProperties = targetRect
    ? {
        boxShadow: `0 0 0 9999px rgba(0,0,0,0.55), 0 0 16px 4px rgba(229,160,75,0.1)`,
        position: "fixed" as const,
        top: targetRect.top - padding,
        left: targetRect.left - padding,
        width: targetRect.width + padding * 2,
        height: targetRect.height + padding * 2,
        borderRadius: "var(--radius-md)",
        zIndex: 10002,
        pointerEvents: "none" as const,
        border: "1.5px solid var(--amber-border)",
        transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }
    : {};

  const tooltipPos = targetRect
    ? computeTooltipPosition(
        targetRect,
        step.placement,
        tooltipSize.width,
        tooltipSize.height
      )
    : { top: window.innerHeight / 2 - 75, left: window.innerWidth / 2 - 160 };

  function handleNext() {
    if (currentStep < visibleSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  }

  function handleSkip() {
    onComplete();
  }

  const isLast = currentStep === visibleSteps.length - 1;

  return (
    <>
      {/* Backdrop overlay for click-blocking */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10001,
          pointerEvents: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Spotlight cutout */}
      {targetRect && <div style={spotlightStyle} />}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          zIndex: 10003,
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: 320,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-md)",
          padding: "20px",
          boxShadow: "var(--shadow-lg)",
          transition: "top 0.3s cubic-bezier(0.16, 1, 0.3, 1), left 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          animation: "fadeUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        {/* Step counter */}
        <div
          className="label-mono"
          style={{ marginBottom: 10, color: "var(--amber)" }}
        >
          {t("onboarding.stepOf", {
            current: currentStep + 1,
            total: visibleSteps.length,
          })}
        </div>

        {/* Content */}
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 18,
          }}
        >
          {t(step.contentKey)}
        </p>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            className="btn btn-ghost"
            onClick={handleSkip}
            style={{ padding: "6px 14px", fontSize: 12 }}
          >
            {t("onboarding.skip")}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleNext}
            style={{ padding: "8px 20px", fontSize: 13 }}
          >
            {isLast ? t("onboarding.done") : t("onboarding.next")}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Main OnboardingTour component.
 * Renders welcome modal first, then tour steps.
 * Only shown when onboarding has not been completed.
 */
export default function OnboardingTour() {
  const [phase, setPhase] = useState<"check" | "welcome" | "tour" | "done">(
    "check"
  );

  useEffect(() => {
    if (isOnboardingCompleted()) {
      setPhase("done");
    } else {
      setPhase("welcome");
    }
  }, []);

  const handleStartTour = useCallback(() => {
    setPhase("tour");
  }, []);

  const handleSkip = useCallback(() => {
    completeOnboarding();
    setPhase("done");
  }, []);

  const handleTourComplete = useCallback(() => {
    completeOnboarding();
    setPhase("done");
  }, []);

  if (phase === "check" || phase === "done") return null;

  if (phase === "welcome") {
    return <WelcomeModal onStart={handleStartTour} onSkip={handleSkip} />;
  }

  return <TourOverlay onComplete={handleTourComplete} />;
}
