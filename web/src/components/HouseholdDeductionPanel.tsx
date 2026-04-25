"use client";

import { useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { calculateQuote, defaultQuoteConfig } from "@/lib/quote-engine";
import {
  HOUSEHOLD_DEDUCTION_2026,
  buildHouseholdDeductionRows,
  calculateHouseholdDeduction,
} from "@/lib/household-deduction";
import type { BomItem, Material } from "@/types";

interface HouseholdDeductionPanelProps {
  bom: BomItem[];
  materials: Material[];
  coupleMode: boolean;
  onCoupleModeChange: (enabled: boolean) => void;
}

function formatEur(amount: number, locale: string): string {
  return `${Math.round(amount).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} €`;
}

export default function HouseholdDeductionPanel({
  bom,
  materials,
  coupleMode,
  onCoupleModeChange,
}: HouseholdDeductionPanelProps) {
  const { t, locale } = useTranslation();
  const deduction = useMemo(() => {
    const quote = calculateQuote(bom, materials, defaultQuoteConfig("homeowner"));
    return calculateHouseholdDeduction(buildHouseholdDeductionRows(quote), { coupleMode });
  }, [bom, coupleMode, materials]);

  if (bom.length === 0) return null;

  const hasCredit = deduction.credit > 0;

  return (
    <section
      aria-label={t("householdDeduction.title")}
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(74, 124, 89, 0.24)",
        background: "linear-gradient(135deg, rgba(74,124,89,0.12), rgba(229,160,75,0.08))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--forest)", fontSize: 10, marginBottom: 4 }}>
            {t("householdDeduction.eyebrow")}
          </div>
          <h4 style={{ margin: 0, fontSize: 15, color: "var(--text-primary)" }}>
            {t("householdDeduction.title")}
          </h4>
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={coupleMode}
            onChange={(event) => onCoupleModeChange(event.target.checked)}
          />
          {t("householdDeduction.coupleMode")}
        </label>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("householdDeduction.labourBasis")}</span>
          <strong style={{ fontSize: 12 }}>{formatEur(deduction.labourCost, locale)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            {t("householdDeduction.credit", { rate: Math.round(HOUSEHOLD_DEDUCTION_2026.companyWorkRate * 100) })}
          </span>
          <strong style={{ fontSize: 12, color: hasCredit ? "var(--forest)" : "var(--text-muted)" }}>
            -{formatEur(deduction.credit, locale)}
          </strong>
        </div>
        <div
          style={{
            paddingTop: 8,
            borderTop: "1px solid rgba(74,124,89,0.24)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>{t("householdDeduction.netCost")}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--forest)" }}>
            {formatEur(deduction.grossCost, locale)}{" -> "}{formatEur(deduction.netCost, locale)}
          </span>
        </div>
      </div>

      <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.5 }}>
        {hasCredit
          ? t("householdDeduction.capNote", { cap: formatEur(deduction.maxCredit, locale), threshold: formatEur(deduction.threshold, locale) })
          : t("householdDeduction.thresholdNote", { threshold: formatEur(deduction.threshold, locale) })}
      </p>
      <p style={{ margin: "8px 0 0", color: "var(--amber)", fontSize: 11, lineHeight: 1.5 }}>
        {t("householdDeduction.registerWarning")}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <a
          href={HOUSEHOLD_DEDUCTION_2026.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: "6px 9px", textDecoration: "none" }}
        >
          {t("householdDeduction.veroLink")}
        </a>
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: 11, padding: "6px 9px" }}
          onClick={() => undefined}
        >
          {t("householdDeduction.proCta")}
        </button>
      </div>
    </section>
  );
}
