"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import type { RenovationCostIndexResponse, RenovationCostUnit } from "@/types";

function formatEur(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} €`;
}

function formatPeriod(period: string): string {
  const match = /^(\d{4})M(\d{2})$/.exec(period);
  if (!match) return period;
  return `${match[2]}/${match[1]}`;
}

function localizeUnit(unit: RenovationCostUnit, locale: string): string {
  if (unit === "m2") return "m²";
  if (unit === "m") return locale === "fi" ? "jm" : "m";
  if (unit === "unit") return locale === "fi" ? "kpl" : "unit";
  return locale === "fi" ? "projekti" : "project";
}

export default function RenovationCostIndexPanel() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<RenovationCostIndexResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    api.getRenovationCostIndex()
      .then((response) => {
        if (!active) return;
        setData(response);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : t("renovationCostIndex.loadFailed"));
      });

    return () => {
      active = false;
    };
  }, [t]);

  if (error) {
    return (
      <section
        aria-label={t("renovationCostIndex.title")}
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          color: "var(--text-muted)",
          fontSize: 11,
        }}
      >
        {t("renovationCostIndex.loadFailed")}
      </section>
    );
  }

  if (!data) {
    return (
      <section
        aria-label={t("renovationCostIndex.title")}
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          color: "var(--text-muted)",
          fontSize: 11,
        }}
      >
        {t("renovationCostIndex.loading")}
      </section>
    );
  }

  const categories = data.categories.slice(0, 4);
  const vatPct = Math.round(data.vatRate * 1000) / 10;

  return (
    <section
      aria-label={t("renovationCostIndex.title")}
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(74,124,89,0.22)",
        background: "linear-gradient(135deg, rgba(74,124,89,0.12), rgba(229,160,75,0.07))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--forest)", fontSize: 10, marginBottom: 4 }}>
            {t("renovationCostIndex.eyebrow")}
          </div>
          <h4 style={{ margin: 0, fontSize: 15, color: "var(--text-primary)" }}>
            {t("renovationCostIndex.title")}
          </h4>
        </div>
        <span
          style={{
            borderRadius: 999,
            padding: "4px 7px",
            border: "1px solid rgba(74,124,89,0.28)",
            background: "rgba(74,124,89,0.12)",
            color: "var(--forest)",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {formatPeriod(data.source.latestPeriod)}
        </span>
      </div>

      <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
        {t("renovationCostIndex.summary", {
          multiplier: data.index.multipliers.total.toFixed(3),
          vat: vatPct.toFixed(1),
        })}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        {categories.map((category) => (
          <div
            key={category.id}
            style={{
              padding: "8px 9px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
              {locale === "fi" ? category.labelFi : category.labelEn}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {formatEur(category.currentCostInclVat, locale)} / {localizeUnit(category.unit, locale)}
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: "9px 0 0", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45 }}>
        {data.source.attribution}. {t("renovationCostIndex.updated", { period: formatPeriod(data.source.latestPeriod) })}
        {data.source.status === "fallback" ? ` ${t("renovationCostIndex.fallback")}` : ""}
      </p>
    </section>
  );
}
