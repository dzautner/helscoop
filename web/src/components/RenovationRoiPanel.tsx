"use client";

import { useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { estimateRenovationRoi, ROI_MARKET_CONFIG_2026 } from "@/lib/renovation-roi";
import type { BomItem, BuildingInfo, Material } from "@/types";

interface RenovationRoiPanelProps {
  bom: BomItem[];
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
  coupleMode?: boolean;
}

function formatEur(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} €`;
}

function formatYears(value: number | null, locale: string): string {
  if (value == null) return locale === "fi" ? "Ei energiasäästöarviota" : "No energy payback";
  return locale === "fi" ? `${value.toLocaleString("fi-FI")} vuotta` : `${value.toLocaleString("en-GB")} years`;
}

export default function RenovationRoiPanel({
  bom,
  materials,
  buildingInfo,
  coupleMode = false,
}: RenovationRoiPanelProps) {
  const { t, locale } = useTranslation();
  const estimate = useMemo(
    () => estimateRenovationRoi(bom, materials, buildingInfo, { coupleMode }),
    [bom, buildingInfo, coupleMode, materials],
  );

  if (!estimate) return null;

  const roiPositive = estimate.roiPercent >= 0;

  return (
    <section
      aria-label={t("renovationRoi.title")}
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(229,160,75,0.22)",
        background: "linear-gradient(135deg, rgba(229,160,75,0.12), rgba(74,124,89,0.08))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--amber)", fontSize: 10, marginBottom: 4 }}>
            {t("renovationRoi.eyebrow")}
          </div>
          <h4 style={{ margin: 0, fontSize: 15, color: "var(--text-primary)" }}>
            {t("renovationRoi.title")}
          </h4>
        </div>
        <span
          style={{
            borderRadius: 999,
            padding: "4px 7px",
            border: "1px solid var(--amber-border)",
            background: "var(--amber-glow)",
            color: "var(--amber)",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          {t(`renovationRoi.category.${estimate.category}`)}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <Metric label={t("renovationRoi.grossCost")} value={formatEur(estimate.grossCost, locale)} />
        <Metric label={t("renovationRoi.netCost")} value={formatEur(estimate.netCost, locale)} />
        <Metric label={t("renovationRoi.materialCost")} value={formatEur(estimate.materialCost, locale)} />
        <Metric label={t("renovationRoi.labourCost")} value={formatEur(estimate.labourCost, locale)} />
        <Metric
          label={t("renovationRoi.bestSubsidy")}
          value={estimate.bestSubsidy.amount > 0 ? `-${formatEur(estimate.bestSubsidy.amount, locale)}` : formatEur(0, locale)}
          muted={estimate.bestSubsidy.amount === 0}
        />
        <Metric label={t("renovationRoi.valueImpact")} value={formatEur(estimate.estimatedValueIncrease, locale)} />
        <Metric label={t("renovationRoi.energyPayback")} value={formatYears(estimate.paybackYears, locale)} />
        <Metric
          label={t("renovationRoi.tenYearRoi")}
          value={`${roiPositive ? "+" : ""}${estimate.roiPercent}%`}
          tone={roiPositive ? "var(--forest)" : "var(--danger)"}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          padding: "9px 10px",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
          {estimate.timing.headline}
        </div>
        <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
          {estimate.timing.reasons.slice(0, 2).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <p style={{ margin: "9px 0 0", color: "var(--amber)", fontSize: 11, lineHeight: 1.45 }}>
        {estimate.bestSubsidy.warning}
      </p>
      <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45 }}>
        {t("renovationRoi.assumptionNote", {
          checked: ROI_MARKET_CONFIG_2026.sourceCheckedAt,
          euribor: ROI_MARKET_CONFIG_2026.euribor12mPercent.toFixed(2),
        })}
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  muted = false,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  tone?: string;
}) {
  return (
    <div
      style={{
        padding: "8px 9px",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border)",
        minWidth: 0,
      }}
    >
      <div className="label-mono" style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: muted ? "var(--text-muted)" : tone || "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
