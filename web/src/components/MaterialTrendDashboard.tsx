"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import type { MaterialTrendDirection, MaterialTrendItem, ProjectMaterialTrendResponse } from "@/types";

function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number | null, locale: string): string {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", { maximumFractionDigits: 1 })}%`;
}

function formatPercentMagnitude(value: number, locale: string): string {
  return `${Math.abs(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", { maximumFractionDigits: 1 })}%`;
}

function formatMonth(month: string | null, locale: string): string {
  if (!month) return "-";
  const date = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function directionColor(direction: MaterialTrendDirection): string {
  if (direction === "rising") return "var(--danger)";
  if (direction === "falling") return "var(--success)";
  return "var(--text-muted)";
}

function TrendSparkline({ item }: { item: MaterialTrendItem }) {
  const values = item.points.map((point) => point.unitPrice).filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;

  const width = 72;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 3 - ((value - min) / range) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline
        points={points}
        fill="none"
        stroke={directionColor(item.direction)}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function itemPriority(item: MaterialTrendItem): number {
  return item.estimatedWaitSavings + Math.abs(item.vs12mPct ?? 0);
}

export default function MaterialTrendDashboard({
  projectId,
  bomSignature,
}: {
  projectId?: string;
  bomSignature: string;
}) {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<ProjectMaterialTrendResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !bomSignature) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    api.getProjectMaterialTrends(projectId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [bomSignature, projectId]);

  const topItems = useMemo(() => {
    return [...(data?.items ?? [])].sort((a, b) => itemPriority(b) - itemPriority(a)).slice(0, 3);
  }, [data]);

  if (!projectId || !bomSignature) return null;
  if (!loading && (!data || data.items.length === 0)) return null;

  const weightedPct = data?.weightedVs12mPct ?? null;
  const hasHistory = data?.dataSources.includes("retailer_history") ?? false;
  const usesSeasonalModel = data?.dataSources.includes("seasonal_model") ?? false;
  const trendTone = weightedPct == null
    ? "var(--text-muted)"
    : weightedPct > 2
      ? "var(--danger)"
      : weightedPct < -2
        ? "var(--success)"
        : "var(--text-muted)";
  const trendText = weightedPct == null
    ? t("bomTrends.noAverage")
    : weightedPct > 2
      ? t("bomTrends.aboveAverage", { percent: formatPercent(weightedPct, locale) })
      : weightedPct < -2
        ? t("bomTrends.belowAverage", { percent: formatPercentMagnitude(weightedPct, locale) })
        : t("bomTrends.nearAverage");

  return (
    <section
      aria-label={t("bomTrends.title")}
      style={{
        marginTop: 10,
        padding: "12px",
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(229,160,75,0.28)",
        background: "linear-gradient(135deg, rgba(229,160,75,0.13), rgba(74,124,89,0.07))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ fontSize: 10, color: "var(--amber)", marginBottom: 4 }}>
            {t("bomTrends.eyebrow")}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            {t("bomTrends.title")}
          </div>
        </div>
        <span
          style={{
            padding: "3px 7px",
            borderRadius: 999,
            background: hasHistory ? "rgba(74,124,89,0.12)" : "rgba(229,160,75,0.12)",
            color: hasHistory ? "var(--success)" : "var(--amber)",
            fontSize: 10,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {hasHistory ? t("bomTrends.source.retailer_history") : t("bomTrends.source.seasonal_model")}
        </span>
      </div>

      {loading && !data ? (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
          {t("bomTrends.loading")}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 8, color: trendTone, fontSize: 12, fontWeight: 700 }}>
            {trendText}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <div style={{ flex: "1 1 88px", padding: 8, borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.48)" }}>
              <div className="label-mono" style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>
                {t("bomTrends.waitSavings")}
              </div>
              <strong style={{ fontSize: 14, color: "var(--success)" }}>
                {formatCurrency(data?.estimatedWaitSavings ?? 0, locale)}
              </strong>
            </div>
            <div style={{ flex: "1 1 88px", padding: 8, borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.48)" }}>
              <div className="label-mono" style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>
                {t("bomTrends.bestMonth")}
              </div>
              <strong style={{ fontSize: 14, color: "var(--text-primary)" }}>
                {formatMonth(data?.bestBuyMonth ?? null, locale)}
              </strong>
            </div>
            <div style={{ flex: "1 1 88px", padding: 8, borderRadius: "var(--radius-sm)", background: "rgba(255,255,255,0.48)" }}>
              <div className="label-mono" style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>
                {t("bomTrends.nowVs12m")}
              </div>
              <strong style={{ fontSize: 14, color: trendTone }}>
                {formatPercent(weightedPct, locale)}
              </strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {t("bomTrends.buyNowCount", { count: data?.buyNowCount ?? 0 })}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {t("bomTrends.waitCount", { count: data?.waitCount ?? 0 })}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {t("bomTrends.watchCount", { count: data?.watchCount ?? 0 })}
            </span>
          </div>

          {topItems.length > 0 && (
            <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
              {topItems.map((item) => (
                <div
                  key={item.materialId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(255,255,255,0.56)",
                    border: "1px solid rgba(0,0,0,0.04)",
                  }}
                >
                  <TrendSparkline item={item} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.materialName}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                      {t(`bomTrends.recommendation.${item.recommendation}`)} / {formatPercent(item.vs12mPct, locale)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: item.estimatedWaitSavings > 0 ? "var(--success)" : "var(--text-muted)" }}>
                      {formatCurrency(item.estimatedWaitSavings, locale)}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)" }}>
                      {formatMonth(item.bestBuyMonth, locale)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {usesSeasonalModel && (
            <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.4, color: "var(--text-muted)" }}>
              {t("bomTrends.modelNote")}
            </div>
          )}
        </>
      )}
    </section>
  );
}
