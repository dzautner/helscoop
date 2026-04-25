"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "@/components/LocaleProvider";

// ---------------------------------------------------------------------------
// Types (mirrors api/src/entitlements.ts — no shared package yet)
// ---------------------------------------------------------------------------
export type PlanTier = "free" | "pro" | "enterprise";

export type Feature =
  | "aiMessages"
  | "premiumExport"
  | "customMaterials"
  | "apiAccess";

export interface PlanFeatures {
  maxProjects: number;
  aiMessagesPerDay: number;
  premiumExport: boolean;
  customMaterials: boolean;
  apiAccess: boolean;
}

export interface PlanConfig {
  tier: PlanTier;
  nameKey: string;
  monthlyPrice: number;
  features: PlanFeatures;
}

// ---------------------------------------------------------------------------
// Static plan data for the feature comparison table.
// Kept in sync with api/src/entitlements.ts PLANS.
// ---------------------------------------------------------------------------
const PLANS: PlanConfig[] = [
  {
    tier: "free",
    nameKey: "upgrade.free",
    monthlyPrice: 0,
    features: {
      maxProjects: 3,
      aiMessagesPerDay: 10,
      premiumExport: false,
      customMaterials: false,
      apiAccess: false,
    },
  },
  {
    tier: "pro",
    nameKey: "upgrade.pro",
    monthlyPrice: 19,
    features: {
      maxProjects: 20,
      aiMessagesPerDay: 100,
      premiumExport: true,
      customMaterials: true,
      apiAccess: false,
    },
  },
  {
    tier: "enterprise",
    nameKey: "upgrade.enterprise",
    monthlyPrice: 49,
    features: {
      maxProjects: -1,
      aiMessagesPerDay: -1,
      premiumExport: true,
      customMaterials: true,
      apiAccess: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface UpgradeGateProps {
  /** The feature that was blocked — drives the headline copy */
  feature: Feature;
  /** The minimum plan required to unlock the feature */
  requiredPlan: PlanTier;
  /** The user's current plan tier */
  currentPlan: PlanTier;
  /** Daily limit for AI messages (only relevant when feature === 'aiMessages') */
  aiLimit?: number;
  /** Called when the user dismisses the gate */
  onDismiss?: () => void;
  /** Optional: render as an inline notice instead of a modal overlay */
  inline?: boolean;
}

// ---------------------------------------------------------------------------
// UpgradeGate component
// ---------------------------------------------------------------------------
export default function UpgradeGate({
  feature,
  requiredPlan,
  currentPlan,
  aiLimit,
  onDismiss,
  inline = false,
}: UpgradeGateProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    if (inline || dismissed) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleDismiss();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inline, dismissed, handleDismiss]);

  if (dismissed) return null;

  // Determine headline / description
  const isAiQuota = feature === "aiMessages";
  const headline = isAiQuota
    ? t("upgrade.aiQuotaExhausted")
    : t("upgrade.title");
  const subtitle = isAiQuota
    ? t("upgrade.aiQuotaDesc", { limit: String(aiLimit ?? 10) })
    : t("upgrade.subtitle");

  // CTA label
  const ctaLabel =
    requiredPlan === "pro" ? t("upgrade.ctaPro") : t("upgrade.ctaEnterprise");

  const container: React.CSSProperties = inline
    ? {
        background: "var(--amber-glow, rgba(196,145,92,0.08))",
        border: "1px solid var(--amber-border, rgba(196,145,92,0.25))",
        borderRadius: "var(--radius-sm, 6px)",
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }
    : {
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      };

  const card: React.CSSProperties = {
    background: "var(--surface-primary, #1a1816)",
    border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
    borderRadius: "var(--radius-md, 10px)",
    padding: "28px 32px",
    maxWidth: 480,
    width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  };

  const featureRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr repeat(3, 56px)",
    gap: 8,
    fontSize: 12,
    color: "var(--text-muted)",
    alignItems: "center",
    padding: "5px 0",
    borderBottom: "1px solid var(--border-subtle, rgba(255,255,255,0.05))",
  };

  const comparisonFeatures: { key: keyof PlanFeatures; label: string }[] = [
    { key: "aiMessagesPerDay", label: t("upgrade.featureAiMessages") },
    { key: "premiumExport",    label: t("upgrade.featurePremiumExport") },
    { key: "customMaterials",  label: t("upgrade.featureCustomMaterials") },
    { key: "apiAccess",        label: t("upgrade.featureApiAccess") },
  ];

  const content = (
    <div ref={dialogRef} role={inline ? undefined : "dialog"} aria-modal={inline ? undefined : true} aria-label={headline} style={inline ? {} : card}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {/* Upgrade icon */}
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="var(--amber, #c4915c)" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              {headline}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
            {subtitle}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          aria-label={t("upgrade.dismiss")}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 4,
            marginTop: -4,
            marginRight: -4,
            lineHeight: 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Feature comparison table */}
      <div style={{ marginTop: 20, marginBottom: 20 }}>
        <div style={{ ...featureRow, color: "var(--text-primary)", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em" }}>
          <span>{t("upgrade.featureComparison")}</span>
          {PLANS.map((p) => (
            <span key={p.tier} style={{
              textAlign: "center",
              color: p.tier === currentPlan ? "var(--amber, #c4915c)" : "inherit",
            }}>
              {t(p.nameKey)}
            </span>
          ))}
        </div>
        {comparisonFeatures.map(({ key, label }) => (
          <div key={key} style={featureRow}>
            <span style={{ color: "var(--text-secondary, #a09890)" }}>{label}</span>
            {PLANS.map((p) => {
              const val = p.features[key];
              return (
                <span key={p.tier} style={{ textAlign: "center" }}>
                  {typeof val === "boolean" ? (
                    val ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success, #4ade80)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )
                  ) : (
                    <span style={{ fontSize: 11, color: val === -1 ? "var(--success, #4ade80)" : "var(--text-secondary, #a09890)" }}>
                      {val === -1 ? t("upgrade.unlimited") : String(val)}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          className="btn btn-primary"
          style={{
            flex: 1,
            background: "var(--amber, #c4915c)",
            color: "var(--on-amber, #fff)",
            border: "none",
            borderRadius: "var(--radius-sm, 6px)",
            padding: "10px 20px",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
          onClick={() => {
            // TODO: navigate to /pricing once payment integration is added
            window.location.href = "/pricing";
          }}
        >
          {ctaLabel}
        </button>
        <button
          className="btn btn-ghost"
          style={{
            padding: "10px 16px",
            fontSize: 13,
            cursor: "pointer",
            background: "transparent",
            border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
            borderRadius: "var(--radius-sm, 6px)",
            color: "var(--text-muted)",
          }}
          onClick={handleDismiss}
        >
          {t("upgrade.dismiss")}
        </button>
      </div>
    </div>
  );

  if (inline) {
    return <div style={container}>{content}</div>;
  }

  return (
    <div style={container} onClick={(e) => { if (e.target === e.currentTarget) handleDismiss(); }}>
      {content}
    </div>
  );
}
