"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { buildSavingsRecommendations, sumSavings, type BomSavingRecommendation, type BomSavingType } from "@/lib/bom-savings";
import type { BomItem, Material, StockLevel } from "@/types";

export interface BomPriceOverride {
  materialId: string;
  unitPrice: number;
  unit: string;
  supplier?: string;
  link?: string | null;
  stockLevel?: StockLevel | null;
}

interface BomSavingsPanelProps {
  bom: BomItem[];
  materials: Material[];
  onApplySupplierPrice?: (override: BomPriceOverride) => void;
  onReplaceMaterial?: (fromMaterialId: string, toMaterialId: string, options?: { undo?: boolean; source?: string }) => void;
  onCompareMaterial: (materialId: string, materialName: string) => void;
  onOpenMaterialPicker: (materialId: string) => void;
}

const SAVING_TYPES: BomSavingType[] = ["supplier_switch", "material_substitution", "bulk_discount", "seasonal_stock"];

function localizeUnit(unit: string, t: (key: string) => string): string {
  const normalized = unit.replace(/ä/g, "a").replace(/ö/g, "o").toLowerCase();
  const translated = t(`units.${normalized}`);
  return translated === `units.${normalized}` ? unit : translated;
}

function formatCurrency(amount: number, locale: string, digits = 0): string {
  return `${amount.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} €`;
}

function getTypeLabel(type: BomSavingType, t: (key: string) => string): string {
  return t(`bomSavings.${type}`);
}

function getRecommendationText(recommendation: BomSavingRecommendation, t: (key: string, params?: Record<string, string | number>) => string, locale: string): string {
  const savings = formatCurrency(recommendation.savingsAmount, locale);
  if (recommendation.type === "supplier_switch") {
    return t("bomSavings.supplierSwitchText", {
      material: recommendation.materialName,
      from: recommendation.fromSupplier || "-",
      to: recommendation.toSupplier || "-",
      savings,
    });
  }
  if (recommendation.type === "material_substitution") {
    return t("bomSavings.substitutionText", {
      from: recommendation.materialName,
      to: recommendation.toMaterialName || "-",
      savings,
      percent: Math.round(recommendation.savingsPercent),
    });
  }
  if (recommendation.type === "bulk_discount") {
    return t("bomSavings.bulkText", {
      material: recommendation.materialName,
      supplier: recommendation.toSupplier || "-",
      savings,
      percent: Math.round(recommendation.savingsPercent),
    });
  }
  return t("bomSavings.stockText", { material: recommendation.materialName });
}

function getActionLabel(type: BomSavingType, t: (key: string) => string): string {
  if (type === "supplier_switch") return t("bomSavings.applySupplier");
  if (type === "material_substitution") return t("bomSavings.applySwap");
  if (type === "bulk_discount") return t("bomSavings.applyBulk");
  return t("bomSavings.seeAlternatives");
}

export default function BomSavingsPanel({
  bom,
  materials,
  onApplySupplierPrice,
  onReplaceMaterial,
  onCompareMaterial,
  onOpenMaterialPicker,
}: BomSavingsPanelProps) {
  const { t, locale } = useTranslation();
  const { track } = useAnalytics();
  const [expanded, setExpanded] = useState<Record<BomSavingType, boolean>>({
    supplier_switch: true,
    material_substitution: true,
    bulk_discount: false,
    seasonal_stock: false,
  });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const allRecommendations = useMemo(() => buildSavingsRecommendations(bom, materials), [bom, materials]);
  const recommendations = useMemo(
    () => allRecommendations.filter((recommendation) => !dismissedIds.has(recommendation.id)),
    [allRecommendations, dismissedIds],
  );
  const totalSavings = useMemo(() => sumSavings(recommendations), [recommendations]);
  const grouped = useMemo(() => {
    const map = new Map<BomSavingType, BomSavingRecommendation[]>();
    for (const type of SAVING_TYPES) map.set(type, []);
    for (const recommendation of recommendations) {
      map.get(recommendation.type)?.push(recommendation);
    }
    return map;
  }, [recommendations]);

  if (bom.length === 0) return null;

  const applyRecommendation = (recommendation: BomSavingRecommendation) => {
    track("bom_optimization_applied", {
      type: recommendation.type,
      material_id: recommendation.materialId,
      savings_amount: Math.round(recommendation.savingsAmount),
    });

    if (recommendation.type === "material_substitution" && recommendation.toMaterialId) {
      onReplaceMaterial?.(recommendation.materialId, recommendation.toMaterialId, { undo: true, source: "bom_savings" });
      return;
    }

    if (recommendation.type === "supplier_switch" || recommendation.type === "bulk_discount") {
      onApplySupplierPrice?.({
        materialId: recommendation.materialId,
        unitPrice: recommendation.targetUnitPrice,
        unit: recommendation.unit,
        supplier: recommendation.toSupplier,
        link: recommendation.link,
        stockLevel: recommendation.stockLevel,
      });
      return;
    }

    onCompareMaterial(recommendation.materialId, recommendation.materialName);
  };

  const dismissRecommendation = (recommendation: BomSavingRecommendation) => {
    track("bom_optimization_dismissed", {
      type: recommendation.type,
      material_id: recommendation.materialId,
      savings_amount: Math.round(recommendation.savingsAmount),
    });
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(recommendation.id);
      return next;
    });
  };

  return (
    <section className="bom-savings-panel" aria-label={t("bomSavings.title")}>
      <div className="bom-savings-head">
        <div>
          <div className="label-mono bom-savings-eyebrow">{t("bomSavings.eyebrow")}</div>
          <strong>{t("bomSavings.title")}</strong>
        </div>
        <div className="bom-savings-total">
          <span>{t("bomSavings.totalAvailable")}</span>
          <strong>{formatCurrency(totalSavings, locale)}</strong>
        </div>
      </div>

      {totalSavings <= 0 && recommendations.length === 0 ? (
        <div className="bom-savings-empty">{t("bomSavings.noSavings")}</div>
      ) : (
        <div className="bom-savings-groups">
          {SAVING_TYPES.map((type) => {
            const items = grouped.get(type) ?? [];
            const isExpanded = expanded[type];
            return (
              <div className="bom-savings-group" key={type}>
                <button
                  type="button"
                  className="bom-savings-group-toggle"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded((prev) => ({ ...prev, [type]: !prev[type] }))}
                >
                  <span>{getTypeLabel(type, t)}</span>
                  <code>{items.length}</code>
                </button>
                {isExpanded && (
                  <div className="bom-savings-items">
                    {items.length === 0 ? (
                      <div className="bom-savings-muted">{t(`bomSavings.${type}Empty`)}</div>
                    ) : (
                      items.slice(0, 3).map((recommendation) => (
                        <article key={recommendation.id} className="bom-savings-item" data-type={recommendation.type}>
                          <div>
                            <p>{getRecommendationText(recommendation, t, locale)}</p>
                            <span>
                              {recommendation.savingsAmount > 0
                                ? `${formatCurrency(recommendation.currentUnitPrice, locale, 2)} → ${formatCurrency(recommendation.targetUnitPrice, locale, 2)} / ${localizeUnit(recommendation.unit, t)}`
                                : t("bomSavings.stockOnly")}
                            </span>
                          </div>
                          <div className="bom-savings-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={
                                (recommendation.type === "supplier_switch" || recommendation.type === "bulk_discount")
                                  ? !onApplySupplierPrice
                                  : recommendation.type === "material_substitution"
                                    ? !onReplaceMaterial
                                    : false
                              }
                              onClick={() => applyRecommendation(recommendation)}
                            >
                              {getActionLabel(recommendation.type, t)}
                            </button>
                            {recommendation.type === "material_substitution" ? (
                              <button type="button" onClick={() => onOpenMaterialPicker(recommendation.materialId)}>
                                {t("bomSavings.compare")}
                              </button>
                            ) : (
                              <button type="button" onClick={() => onCompareMaterial(recommendation.materialId, recommendation.materialName)}>
                                {t("bomSavings.compare")}
                              </button>
                            )}
                            <button type="button" onClick={() => dismissRecommendation(recommendation)}>
                              {t("bom.dismiss")}
                            </button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
