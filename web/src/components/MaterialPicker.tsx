"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useTranslation } from "@/components/LocaleProvider";
import type { BomItem, Material, StockLevel } from "@/types";

type MaterialSort = "price-asc" | "price-desc" | "thermal" | "availability";

interface MaterialPickerProps {
  currentMaterialId: string;
  bomItem: BomItem;
  materials: Material[];
  disabledMaterialIds?: Set<string>;
  onClose: () => void;
  onSelect: (materialId: string) => void;
}

interface MaterialMetrics {
  material: Material;
  name: string;
  category: string;
  dimensions: string;
  supplier: string;
  unit: string;
  unitPrice: number;
  totalCost: number;
  unitDelta: number;
  totalDelta: number;
  conductivity: number | null;
  fireRating: string;
  stockLevel: StockLevel;
  swatch: string;
}

function getLocalizedMaterialName(material: Material, locale: string): string {
  if (locale === "fi") return material.name_fi || material.name;
  if (locale === "en") return material.name_en || material.name;
  return material.name;
}

function localizeUnit(unit: string, t: (key: string) => string): string {
  const normalized = unit.replace(/ä/g, "a").replace(/ö/g, "o").toLowerCase();
  const translated = t(`units.${normalized}`);
  return translated === `units.${normalized}` ? unit : translated;
}

function getPrimaryPrice(material: Material) {
  return material.pricing?.find((price) => price.is_primary) ?? material.pricing?.[0] ?? null;
}

function getUnitPrice(material: Material): number {
  return Number(getPrimaryPrice(material)?.unit_price ?? 0);
}

function normalizeStockLevel(level?: string | null): StockLevel {
  if (level === "in_stock" || level === "low_stock" || level === "out_of_stock") return level;
  return "unknown";
}

function stockRank(level: StockLevel): number {
  if (level === "in_stock") return 0;
  if (level === "low_stock") return 1;
  if (level === "unknown") return 2;
  return 3;
}

function parseNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDimensions(material: Material): string {
  const nameMatch = material.name.match(/(\d{1,4})\s*[x×]\s*(\d{1,4})(?:\s*[x×]\s*(\d{1,4}))?/i);
  if (nameMatch) {
    return `${nameMatch.slice(1).filter(Boolean).join("×")} mm`;
  }
  const thickness = parseNumber(material.thermal_thickness);
  if (thickness && thickness > 0) return `${thickness} mm`;
  return material.design_unit ?? getPrimaryPrice(material)?.unit ?? "kpl";
}

function getFireRating(material: Material): string {
  const explicit = material.fire_rating?.trim();
  if (explicit) return explicit;
  const text = `${material.category_name} ${material.name} ${(material.tags ?? []).join(" ")}`.toLowerCase();
  if (/concrete|betoni|mineral|rockwool|villa|metal|ter[aä]s|gypsum|kipsi/.test(text)) return "A1";
  if (/roof|katto|membrane|kalvo/.test(text)) return "B-s1";
  if (/wood|lumber|timber|sahatavara|pine|spruce|osb|plywood|puu/.test(text)) return "D-s2";
  return "N/A";
}

function fireRatingTone(rating: string): "good" | "warn" | "bad" | "muted" {
  if (rating.startsWith("A")) return "good";
  if (rating.startsWith("B")) return "warn";
  if (rating === "N/A") return "muted";
  return "bad";
}

function getAlbedoSwatch(material: Material): string {
  const albedo = material.visual_albedo;
  if (Array.isArray(albedo) && albedo.length >= 3) {
    const [r, g, b] = albedo.map((value) => Math.max(0, Math.min(255, Math.round(Number(value) * 255))));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const palette = ["#8b6f47", "#c49058", "#4a5568", "#4a8b7f", "#718096", "#cbd5e0"];
  const seed = Array.from(material.category_name || material.name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[seed % palette.length];
}

function formatCurrency(amount: number, locale: string, digits = 2): string {
  return `${amount.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} €`;
}

function formatSignedCurrency(amount: number, locale: string): string {
  const sign = amount > 0 ? "+" : "";
  return `${sign}${formatCurrency(amount, locale)}`;
}

function fuzzyMatch(token: string, text: string): boolean {
  if (text.includes(token)) return true;
  if (token.length < 3) return false;
  let index = 0;
  for (const char of text) {
    if (char === token[index]) index += 1;
    if (index === token.length) return true;
  }
  return false;
}

export default function MaterialPicker({
  currentMaterialId,
  bomItem,
  materials,
  disabledMaterialIds = new Set(),
  onClose,
  onSelect,
}: MaterialPickerProps) {
  const { t, locale } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentMaterial = materials.find((material) => material.id === currentMaterialId) ?? null;
  const currentUnitPrice = currentMaterial ? getUnitPrice(currentMaterial) : Number(bomItem.unit_price ?? 0);
  const currentCategory = currentMaterial?.category_name ?? bomItem.category_name ?? "";
  const [activeCategory, setActiveCategory] = useState(currentCategory);
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState(0);
  const [maxConductivity, setMaxConductivity] = useState(0);
  const [sort, setSort] = useState<MaterialSort>("price-asc");
  const [fireRatings, setFireRatings] = useState<Set<string>>(() => new Set());
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const close = useCallback(() => onClose(), [onClose]);
  useFocusTrap(dialogRef, true, close);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const material of materials) {
      map.set(material.category_name, locale === "fi" && material.category_name_fi ? material.category_name_fi : material.category_name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], locale));
  }, [materials, locale]);

  const allMetrics = useMemo<MaterialMetrics[]>(() => {
    return materials.map((material) => {
      const price = getPrimaryPrice(material);
      const unitPrice = Number(price?.unit_price ?? 0);
      const unit = material.design_unit ?? price?.unit ?? bomItem.unit;
      const conductivity = parseNumber(material.thermal_conductivity);
      const stockLevel = normalizeStockLevel(price?.stock_level);
      return {
        material,
        name: getLocalizedMaterialName(material, locale),
        category: locale === "fi" && material.category_name_fi ? material.category_name_fi : material.category_name,
        dimensions: getDimensions(material),
        supplier: price?.supplier_name ?? t("materialPicker.unknownSupplier"),
        unit,
        unitPrice,
        totalCost: unitPrice * Number(bomItem.quantity || 0),
        unitDelta: unitPrice - currentUnitPrice,
        totalDelta: (unitPrice - currentUnitPrice) * Number(bomItem.quantity || 0),
        conductivity,
        fireRating: getFireRating(material),
        stockLevel,
        swatch: getAlbedoSwatch(material),
      };
    });
  }, [bomItem.quantity, bomItem.unit, currentUnitPrice, locale, materials, t]);

  const priceLimit = useMemo(() => Math.ceil(Math.max(...allMetrics.map((metric) => metric.unitPrice), 1)), [allMetrics]);
  const conductivityLimit = useMemo(() => {
    const values = allMetrics.map((metric) => metric.conductivity ?? 0).filter((value) => value > 0 && value < 5);
    return values.length > 0 ? Math.ceil(Math.max(...values) * 100) / 100 : 0.5;
  }, [allMetrics]);
  const availableFireRatings = useMemo(
    () => Array.from(new Set(allMetrics.map((metric) => metric.fireRating))).sort(),
    [allMetrics],
  );

  const filteredMetrics = useMemo(() => {
    const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const selectedFireRatings = fireRatings;
    return allMetrics
      .filter((metric) => !activeCategory || metric.material.category_name === activeCategory)
      .filter((metric) => maxPrice <= 0 || metric.unitPrice <= maxPrice)
      .filter((metric) => maxConductivity <= 0 || (metric.conductivity != null && metric.conductivity <= maxConductivity))
      .filter((metric) => selectedFireRatings.size === 0 || selectedFireRatings.has(metric.fireRating))
      .filter((metric) => {
        if (tokens.length === 0) return true;
        const haystack = [
          metric.name,
          metric.material.name,
          metric.category,
          metric.dimensions,
          metric.supplier,
          metric.fireRating,
          ...(metric.material.tags ?? []),
        ].join(" ").toLowerCase();
        return tokens.every((token) => fuzzyMatch(token, haystack));
      })
      .sort((a, b) => {
        if (sort === "price-desc") return b.unitPrice - a.unitPrice;
        if (sort === "thermal") return (a.conductivity ?? Number.POSITIVE_INFINITY) - (b.conductivity ?? Number.POSITIVE_INFINITY);
        if (sort === "availability") return stockRank(a.stockLevel) - stockRank(b.stockLevel) || a.unitPrice - b.unitPrice;
        return a.unitPrice - b.unitPrice;
      });
  }, [activeCategory, allMetrics, fireRatings, maxConductivity, maxPrice, search, sort]);

  const comparisonMetrics = useMemo(
    () => compareIds.map((id) => allMetrics.find((metric) => metric.material.id === id)).filter((metric): metric is MaterialMetrics => Boolean(metric)),
    [allMetrics, compareIds],
  );
  const bestComparisonCost = comparisonMetrics.length > 0 ? Math.min(...comparisonMetrics.map((metric) => metric.totalCost)) : 0;

  const toggleFireRating = (rating: string) => {
    setFireRatings((prev) => {
      const next = new Set(prev);
      if (next.has(rating)) next.delete(rating);
      else next.add(rating);
      return next;
    });
  };

  const toggleCompare = (materialId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(materialId)) return prev.filter((id) => id !== materialId);
      return [...prev, materialId].slice(-3);
    });
  };

  return (
    <div className="material-picker-overlay" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget) close();
    }}>
      <div
        ref={dialogRef}
        className="material-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-picker-title"
      >
        <div className="material-picker-head">
          <div>
            <div className="label-mono material-picker-eyebrow">{t("materialPicker.eyebrow")}</div>
            <h2 id="material-picker-title">{t("materialPicker.title")}</h2>
            <p>{t("materialPicker.subtitle")}</p>
          </div>
          <button type="button" className="material-picker-close" onClick={close} aria-label={t("dialog.close")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {currentMaterial && (
          <div className="material-picker-current">
            <span>{t("materialPicker.current")}</span>
            <strong>{getLocalizedMaterialName(currentMaterial, locale)}</strong>
            <code>{formatCurrency(currentUnitPrice, locale)} / {localizeUnit(bomItem.unit, t)}</code>
          </div>
        )}

        <div className="material-picker-controls">
          <label className="material-picker-search">
            <span>{t("materialPicker.search")}</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("materialPicker.searchPlaceholder")}
            />
          </label>
          <label>
            <span>{t("materialPicker.sort")}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as MaterialSort)}>
              <option value="price-asc">{t("materialPicker.sortPriceAsc")}</option>
              <option value="price-desc">{t("materialPicker.sortPriceDesc")}</option>
              <option value="thermal">{t("materialPicker.sortThermal")}</option>
              <option value="availability">{t("materialPicker.sortAvailability")}</option>
            </select>
          </label>
          <label>
            <span>{t("materialPicker.maxPrice")}: {maxPrice > 0 ? formatCurrency(maxPrice, locale, 0) : t("materialPicker.any")}</span>
            <input type="range" min={0} max={priceLimit} value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} />
          </label>
          <label>
            <span>{t("materialPicker.maxConductivity")}: {maxConductivity > 0 ? maxConductivity.toFixed(2) : t("materialPicker.any")}</span>
            <input
              type="range"
              min={0}
              max={conductivityLimit}
              step={0.01}
              value={maxConductivity}
              onChange={(e) => setMaxConductivity(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="material-picker-tabs" role="tablist" aria-label={t("materialPicker.category")}>
          <button type="button" data-active={!activeCategory} onClick={() => setActiveCategory("")}>{t("materialPicker.allMaterials")}</button>
          {categories.map(([category, label]) => (
            <button
              key={category}
              type="button"
              data-active={activeCategory === category}
              onClick={() => setActiveCategory(activeCategory === category ? "" : category)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="material-picker-fire-row" aria-label={t("materialPicker.fireRating")}>
          {availableFireRatings.map((rating) => (
            <button
              key={rating}
              type="button"
              className="material-picker-fire-chip"
              data-active={fireRatings.has(rating)}
              data-tone={fireRatingTone(rating)}
              onClick={() => toggleFireRating(rating)}
            >
              {rating}
            </button>
          ))}
          {(fireRatings.size > 0 || maxPrice > 0 || maxConductivity > 0 || search) && (
            <button
              type="button"
              className="material-picker-reset"
              onClick={() => {
                setSearch("");
                setMaxPrice(0);
                setMaxConductivity(0);
                setFireRatings(new Set());
              }}
            >
              {t("materialPicker.reset")}
            </button>
          )}
        </div>

        <div className="material-picker-body">
          {filteredMetrics.length === 0 ? (
            <div className="material-picker-empty">{t("materialPicker.noResults")}</div>
          ) : (
            <div className="material-picker-grid">
              {filteredMetrics.map((metric) => {
                const isCurrent = metric.material.id === currentMaterialId;
                const isAlreadyInBom = disabledMaterialIds.has(metric.material.id);
                const isComparing = compareIds.includes(metric.material.id);
                return (
                  <article key={metric.material.id} className="material-picker-card" data-current={isCurrent}>
                    <div className="material-picker-card-top">
                      <div className="material-picker-swatch" style={{ background: metric.swatch }} />
                      <div>
                        <h3>{metric.name}</h3>
                        <p>{metric.dimensions}</p>
                      </div>
                    </div>
                    <div className="material-picker-price-row">
                      <strong>{formatCurrency(metric.unitPrice, locale)}</strong>
                      <span>/ {localizeUnit(metric.unit, t)}</span>
                    </div>
                    <div className="material-picker-meta-grid">
                      <span>{t("materialPicker.quantityNeeded")}</span>
                      <strong>{Number(bomItem.quantity || 0).toLocaleString(locale)} {localizeUnit(bomItem.unit, t)}</strong>
                      <span>{t("materialPicker.thermal")}</span>
                      <strong>{metric.conductivity != null ? `λ ${metric.conductivity.toFixed(3)}` : "N/A"}</strong>
                      <span>{t("materialPicker.fireRating")}</span>
                      <strong data-tone={fireRatingTone(metric.fireRating)}>{metric.fireRating}</strong>
                      <span>{t("materialPicker.supplier")}</span>
                      <strong>{metric.supplier}</strong>
                    </div>
                    <div className="material-picker-delta" data-positive={metric.totalDelta > 0}>
                      <span>{t("materialPicker.deltaEach")}</span>
                      <strong>{formatSignedCurrency(metric.unitDelta, locale)}</strong>
                      <span>{t("materialPicker.deltaTotal")}</span>
                      <strong>{formatSignedCurrency(metric.totalDelta, locale)}</strong>
                    </div>
                    <div className="material-picker-card-actions">
                      <button type="button" onClick={() => toggleCompare(metric.material.id)} aria-pressed={isComparing}>
                        {isComparing ? t("materialPicker.comparing") : t("materialPicker.compare")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isCurrent || isAlreadyInBom}
                        onClick={() => {
                          onSelect(metric.material.id);
                          close();
                        }}
                      >
                        {isCurrent
                          ? t("materialPicker.currentSelected")
                          : isAlreadyInBom
                            ? t("materialPicker.alreadyInBom")
                            : t("materialPicker.select")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {comparisonMetrics.length > 0 && (
          <div className="material-picker-compare">
            <div className="material-picker-compare-head">
              <strong>{t("materialPicker.comparisonTitle")}</strong>
              <span>{t("materialPicker.compareLimit")}</span>
            </div>
            {comparisonMetrics.length < 2 ? (
              <p>{t("materialPicker.compareHint")}</p>
            ) : (
              <div className="material-picker-compare-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("materialPicker.feature")}</th>
                      {comparisonMetrics.map((metric) => (
                        <th key={metric.material.id} data-best={metric.totalCost === bestComparisonCost}>
                          {metric.name}
                          {metric.totalCost === bestComparisonCost && <span>{t("materialPicker.bestValue")}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{t("pricing.unitPrice")}</td>
                      {comparisonMetrics.map((metric) => <td key={metric.material.id}>{formatCurrency(metric.unitPrice, locale)} / {localizeUnit(metric.unit, t)}</td>)}
                    </tr>
                    <tr>
                      <td>{t("materialPicker.totalCost")}</td>
                      {comparisonMetrics.map((metric) => <td key={metric.material.id}>{formatCurrency(metric.totalCost, locale)}</td>)}
                    </tr>
                    <tr>
                      <td>{t("materialPicker.thermal")}</td>
                      {comparisonMetrics.map((metric) => <td key={metric.material.id}>{metric.conductivity != null ? `λ ${metric.conductivity.toFixed(3)}` : "N/A"}</td>)}
                    </tr>
                    <tr>
                      <td>{t("materialPicker.fireRating")}</td>
                      {comparisonMetrics.map((metric) => <td key={metric.material.id}>{metric.fireRating}</td>)}
                    </tr>
                    <tr>
                      <td>{t("materialPicker.supplier")}</td>
                      {comparisonMetrics.map((metric) => <td key={metric.material.id}>{metric.supplier}</td>)}
                    </tr>
                    <tr>
                      <td>{t("materialPicker.select")}</td>
                      {comparisonMetrics.map((metric) => (
                        <td key={metric.material.id}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={metric.material.id === currentMaterialId || disabledMaterialIds.has(metric.material.id)}
                            onClick={() => {
                              onSelect(metric.material.id);
                              close();
                            }}
                          >
                            {metric.material.id === currentMaterialId
                              ? t("materialPicker.currentSelected")
                              : disabledMaterialIds.has(metric.material.id)
                                ? t("materialPicker.alreadyInBom")
                                : t("materialPicker.select")}
                          </button>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
