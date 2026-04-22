"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { BomItem } from "@/types";

interface PriceSummaryBarProps {
  bom: BomItem[];
  onViewBom?: () => void;
}

export default function PriceSummaryBar({ bom, onViewBom }: PriceSummaryBarProps) {
  const { t, locale } = useTranslation();
  const total = bom.reduce((sum, item) => sum + (item.total || (item.unit_price || 0) * item.quantity), 0);
  const prevTotalRef = useRef(total);
  const [delta, setDelta] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const prev = prevTotalRef.current;
    if (prev !== total && prev > 0) {
      setDelta(total - prev);
      setFlash(true);
      const timer = setTimeout(() => {
        setDelta(null);
        setFlash(false);
      }, 1500);
      prevTotalRef.current = total;
      return () => clearTimeout(timer);
    }
    prevTotalRef.current = total;
  }, [total]);

  if (bom.length === 0) return null;

  const fmtLocale = locale === "fi" ? "fi-FI" : "en-GB";

  return (
    <div className="price-summary-bar">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 15,
          fontWeight: 600,
          color: flash ? "var(--amber)" : "var(--text-primary)",
          transition: "color 0.3s ease",
        }}>
          {total.toLocaleString(fmtLocale, { maximumFractionDigits: 0 })}
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 4, fontWeight: 400 }}>EUR</span>
        </span>
        {delta !== null && (
          <span
            className="price-delta-badge"
            style={{
              color: delta < 0 ? "var(--success)" : "var(--amber)",
            }}
          >
            {delta > 0 ? "+" : ""}{delta.toLocaleString(fmtLocale, { maximumFractionDigits: 0 })}
          </span>
        )}
        <span style={{
          fontSize: 11,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
        }}>
          {bom.length} {locale === "fi" ? "kpl" : "items"}
        </span>
      </div>
      {onViewBom && (
        <button
          className="price-summary-link"
          onClick={onViewBom}
        >
          {t("editor.viewBom")} →
        </button>
      )}
    </div>
  );
}
