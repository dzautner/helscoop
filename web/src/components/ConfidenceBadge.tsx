"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { ConfidenceLevel, DataProvenance } from "@/lib/confidence";

/* ── Per-level visual config ─────────────────────────────────────── */
interface LevelConfig {
  color: string;
  bg: string;
  border: string;
  labelKey: string;
  icon: React.ReactNode;
}

const CheckIcon = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TildeIcon = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12c1-3 3-4 5-4s3 2 5 2 4-1 5-4" />
  </svg>
);

const InfoIcon = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="8.01" />
    <line x1="12" y1="12" x2="12" y2="16" />
  </svg>
);

const PencilIcon = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const LEVEL_CONFIG: Record<ConfidenceLevel, LevelConfig> = {
  verified: {
    color: "var(--forest)",
    bg: "rgba(34, 197, 94, 0.10)",
    border: "rgba(34, 197, 94, 0.22)",
    labelKey: "confidence.verified",
    icon: CheckIcon,
  },
  estimated: {
    color: "#eab308",
    bg: "rgba(234, 179, 8, 0.10)",
    border: "rgba(234, 179, 8, 0.22)",
    labelKey: "confidence.estimated",
    icon: TildeIcon,
  },
  demo: {
    color: "#60a5fa",
    bg: "rgba(96, 165, 250, 0.10)",
    border: "rgba(96, 165, 250, 0.22)",
    labelKey: "confidence.demo",
    icon: InfoIcon,
  },
  manual: {
    color: "var(--text-muted)",
    bg: "rgba(161, 161, 170, 0.10)",
    border: "rgba(161, 161, 170, 0.22)",
    labelKey: "confidence.manual",
    icon: PencilIcon,
  },
};

/* ── Tooltip ─────────────────────────────────────────────────────── */
function Tooltip({
  children,
  content,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-sm)",
            padding: "6px 10px",
            fontSize: 11,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-md)",
            zIndex: 200,
            pointerEvents: "none",
            lineHeight: 1.5,
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/* ── ConfidenceBadge ─────────────────────────────────────────────── */
export interface ConfidenceBadgeProps {
  provenance: DataProvenance;
  /** When true, renders as icon-only (no text label) — useful in tight layouts */
  compact?: boolean;
}

export default function ConfidenceBadge({ provenance, compact = false }: ConfidenceBadgeProps) {
  const { t } = useTranslation();
  const cfg = LEVEL_CONFIG[provenance.confidence];

  const label = t(cfg.labelKey);

  const tooltipContent = (
    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontWeight: 600, color: cfg.color }}>{label}</span>
      <span>
        {t("confidence.source")}: <strong>{provenance.source}</strong>
      </span>
      {provenance.fetchedAt && (
        <span>
          {t("confidence.fetchedAt")}:{" "}
          {new Date(provenance.fetchedAt).toLocaleDateString()}
        </span>
      )}
    </span>
  );

  return (
    <Tooltip content={tooltipContent}>
      <span
        tabIndex={0}
        aria-label={`${t("confidence.dataQuality")}: ${label}${provenance.fetchedAt ? `, ${t("confidence.fetchedAt")} ${new Date(provenance.fetchedAt).toLocaleDateString()}` : ""}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: compact ? "2px 4px" : "2px 7px",
          borderRadius: "var(--radius-sm)",
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          color: cfg.color,
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "var(--font-mono)",
          cursor: "default",
          userSelect: "none",
          lineHeight: 1,
          verticalAlign: "middle",
        }}
      >
        {cfg.icon}
        {!compact && <span style={{ letterSpacing: "0.02em" }}>{label}</span>}
      </span>
    </Tooltip>
  );
}

/* ── StalePrice badge ────────────────────────────────────────────── */
export function StalePriceBadge({ lastUpdated }: { lastUpdated: string | null | undefined }) {
  const { t } = useTranslation();

  const tooltipContent = (
    <span>
      {t("confidence.stalePriceDetail")}
      {lastUpdated && (
        <>
          {" "}({t("confidence.fetchedAt")}: {new Date(lastUpdated).toLocaleDateString()})
        </>
      )}
    </span>
  );

  return (
    <Tooltip content={tooltipContent}>
      <span
        tabIndex={0}
        aria-label={t("confidence.stalePrice")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          padding: "2px 6px",
          borderRadius: "var(--radius-sm)",
          background: "rgba(234, 179, 8, 0.10)",
          border: "1px solid rgba(234, 179, 8, 0.22)",
          color: "#eab308",
          fontSize: 10,
          fontWeight: 600,
          fontFamily: "var(--font-mono)",
          cursor: "default",
          userSelect: "none",
          lineHeight: 1,
          verticalAlign: "middle",
        }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>{t("confidence.stalePrice")}</span>
      </span>
    </Tooltip>
  );
}
