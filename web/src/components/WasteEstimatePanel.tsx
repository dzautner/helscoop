"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import type { BuildingInfo, WasteCategoryEstimate, WasteEstimateResponse, WasteSortingGuideEntry } from "@/types";

function formatNumber(value: number, locale: string, digits = 1): string {
  return value.toLocaleString(locale, { maximumFractionDigits: digits });
}

function categoryColor(type: string): string {
  switch (type) {
    case "puujate":
      return "#8B6F47";
    case "metallijate":
      return "#718096";
    case "kivijate":
      return "#A0AEC0";
    case "vaarallinen_jate":
      return "var(--danger)";
    case "sekajate":
      return "var(--amber)";
    default:
      return "var(--forest)";
  }
}

function localizedInstruction(entry: WasteSortingGuideEntry, locale: string): string {
  return locale === "fi" ? entry.sortingInstruction_fi : entry.sortingInstruction_en;
}

export default function WasteEstimatePanel({
  projectId,
  bomCount,
  buildingInfo,
}: {
  projectId?: string;
  bomCount: number;
  buildingInfo?: BuildingInfo | null;
}) {
  const { t, locale } = useTranslation();
  const [estimate, setEstimate] = useState<WasteEstimateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!projectId || bomCount === 0) {
      setEstimate(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    api.getWasteEstimate(projectId)
      .then((data: WasteEstimateResponse) => {
        if (!cancelled) setEstimate(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, bomCount]);

  const asbestosRisk = typeof buildingInfo?.year_built === "number" && buildingInfo.year_built < 1994;
  const recyclableWeight = estimate?.categories
    .filter((category) => category.recyclable)
    .reduce((sum, category) => sum + category.weightKg, 0) ?? 0;
  const recyclingPct = estimate && estimate.totalWeightKg > 0
    ? Math.round((recyclableWeight / estimate.totalWeightKg) * 100)
    : 0;
  const topCategories = estimate?.categories.slice(0, 4) ?? [];
  const topGuide = estimate?.sortingGuide.slice(0, 3) ?? [];

  const summaryBox = (label: string, value: string) => (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 3 }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );

  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        background: "var(--bg-tertiary)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {t("waste.title")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
            {t("waste.subtitle")}
          </div>
        </div>
        {estimate && estimate.totalWeightKg > 0 && (
          <span
            style={{
              padding: "3px 7px",
              borderRadius: 999,
              background: recyclingPct >= 70 ? "var(--forest-dim)" : "var(--amber-glow)",
              border: recyclingPct >= 70 ? "1px solid rgba(74,124,89,0.2)" : "1px solid var(--amber-border)",
              color: recyclingPct >= 70 ? "var(--forest)" : "var(--amber)",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              whiteSpace: "nowrap",
            }}
          >
            {t("waste.recyclingRate", { pct: recyclingPct })}
          </span>
        )}
      </div>

      {loading && !estimate && (
        <div style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 12 }}>
          {t("waste.estimateLoading")}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 12 }}>
          {t("waste.estimateFailed")}
        </div>
      )}

      {!loading && !error && (!estimate || estimate.categories.length === 0) && (
        <div style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
          {t("waste.noWasteDesc")}
        </div>
      )}

      {estimate && estimate.categories.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            {summaryBox(t("waste.totalWeight"), `${formatNumber(estimate.totalWeightKg, locale)} kg`)}
            {summaryBox(t("waste.totalVolume"), `${formatNumber(estimate.totalVolumeM3, locale, 2)} m\u00b3`)}
            {summaryBox(t("waste.totalDisposalCost"), `${formatNumber(estimate.totalDisposalCost, locale, 0)} \u20ac`)}
            {summaryBox(
              t("waste.containerRecommendation"),
              `${estimate.containerRecommendation.count} x ${estimate.containerRecommendation.size}`,
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
              {t("waste.categories")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topCategories.map((category: WasteCategoryEstimate) => (
                <div
                  key={category.type}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: categoryColor(category.type),
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t(`waste.${category.type}`)}
                    </span>
                    <span style={{ color: category.recyclable ? "var(--forest)" : "var(--text-muted)", fontSize: 10 }}>
                      {category.recyclable ? t("waste.recyclable") : t("waste.notRecyclable")}
                    </span>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                    {formatNumber(category.weightKg, locale)} kg
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
              {t("waste.sortingGuide")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {topGuide.map((entry) => (
                <div
                  key={entry.wasteType}
                  style={{
                    padding: "7px 8px",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 11,
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 2 }}>
                    {t(`waste.${entry.wasteType}`)}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>{localizedInstruction(entry, locale)}</div>
                  <div style={{ color: "var(--amber)", marginTop: 3 }}>{entry.acceptedAt}</div>
                </div>
              ))}
            </div>
          </div>

          {asbestosRisk && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "rgba(239,68,68,0.06)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: "var(--radius-sm)",
                color: "var(--danger)",
                fontSize: 11,
                lineHeight: 1.45,
              }}
            >
              {t("waste.asbestosWarning", { year: buildingInfo?.year_built ?? "" })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
