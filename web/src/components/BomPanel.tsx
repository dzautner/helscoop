"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useCursorGlow } from "@/hooks/useCursorGlow";
import { useTranslation } from "@/components/LocaleProvider";
import { SkeletonPriceComparison } from "@/components/Skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import SubsidyCalculator from "@/components/SubsidyCalculator";
import WasteEstimatePanel from "@/components/WasteEstimatePanel";
import RyhtiSubmissionPanel from "@/components/RyhtiSubmissionPanel";
import MaterialPicker from "@/components/MaterialPicker";
import BomSavingsPanel, { type BomPriceOverride } from "@/components/BomSavingsPanel";
import QuoteRequestModal from "@/components/QuoteRequestModal";
import HouseholdDeductionPanel from "@/components/HouseholdDeductionPanel";
import RenovationRoiPanel from "@/components/RenovationRoiPanel";
import RenovationCostIndexPanel from "@/components/RenovationCostIndexPanel";
import MaterialTrendDashboard from "@/components/MaterialTrendDashboard";
import PhotoEstimatePanel from "@/components/PhotoEstimatePanel";
import PermitCheckerPanel from "@/components/PermitCheckerPanel";
import ShoppingListModal from "@/components/ShoppingListModal";
import { api } from "@/lib/api";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { interpretScene, extractSceneMaterials } from "@/lib/scene-interpreter";
import { detectHeatingGrantOpportunity } from "@/lib/heating-grant-context";
import { calculateQuote, defaultQuoteConfig } from "@/lib/quote-engine";
import { buildSavingsRecommendations } from "@/lib/bom-savings";
import {
  buildImportedBomItem,
  matchImportedBomRows,
  parseBomImportFile,
  parseBomImportText,
  type BomImportMode,
  type BomImportPreviewRow,
} from "@/lib/bom-import";
import type { QuoteConfig } from "@/lib/quote-engine";
import type {
  BomItem,
  Material,
  MaterialPriceData,
  Category,
  PriceHistoryRow,
  VatClass,
  StockLevel,
  BuildingInfo,
  KeskoProduct,
  KeskoSearchResponse,
  KeskoImportResponse,
  PriceWatch,
} from "@/types";

/* ── Localization helpers ──────────────────────────────────── */

/** Return the material name appropriate for the current locale */
function getLocalizedMaterialName(
  material: Material,
  locale: string,
): string {
  if (locale === 'fi') return material.name_fi || material.name;
  if (locale === 'en') return material.name_en || material.name;
  return material.name;
}

/** Return the material name for a BOM item using the materials list */
function getLocalizedBomItemName(
  item: BomItem,
  materials: Material[],
  locale: string,
): string {
  const mat = materials.find((m) => m.id === item.material_id);
  if (mat) return getLocalizedMaterialName(mat, locale);
  return item.material_name || item.material_id;
}

/** Map a raw unit string (from DB) to locale-appropriate label */
function localizeUnit(unit: string, t: (key: string) => string): string {
  // Normalize: strip accents and lowercase for lookup
  const normalized = unit.replace(/ä/g, 'a').replace(/ö/g, 'o').toLowerCase();
  const translated = t(`units.${normalized}`);
  // If the translation key resolves to itself, return original
  if (translated === `units.${normalized}`) return unit;
  return translated;
}

function normalizeStockLevel(level?: string | null): StockLevel {
  if (level === "in_stock" || level === "low_stock" || level === "out_of_stock") return level;
  return "unknown";
}

function stockMeta(level: StockLevel, t: (key: string) => string): { label: string; color: string } {
  switch (level) {
    case "in_stock":
      return { label: t("bom.inStock"), color: "var(--forest)" };
    case "low_stock":
      return { label: t("bom.lowStock"), color: "var(--amber)" };
    case "out_of_stock":
      return { label: t("bom.outOfStock"), color: "var(--danger)" };
    default:
      return { label: t("bom.stockUnknown"), color: "var(--text-muted)" };
  }
}

function stockTooltip(
  item: {
    stock_level?: string | null;
    store_location?: string | null;
    stock_last_checked_at?: string | null;
    last_checked_at?: string | null;
    link?: string | null;
  },
  t: (key: string) => string,
  locale: string = "fi",
): string {
  const meta = stockMeta(normalizeStockLevel(item.stock_level), t);
  const checkedAt = item.stock_last_checked_at ?? item.last_checked_at;
  const parts = [meta.label];
  if (item.store_location) parts.push(item.store_location);
  if (checkedAt) {
    parts.push(`${t("bom.lastChecked")}: ${new Date(checkedAt).toLocaleDateString(locale === "fi" ? "fi-FI" : "en-GB")}`);
  }
  if (item.link) parts.push(item.link);
  return parts.join(" · ");
}

type PackageTierId = "basic" | "standard" | "premium";

interface PackageTier {
  id: PackageTierId;
  labelKey: string;
  tone: string;
}

interface PackageReplacement {
  fromMaterialId: string;
  toMaterial: Material;
  currentCost: number;
  packageCost: number;
  locked: boolean;
}

interface PackageSummary {
  tier: PackageTier;
  total: number;
  delta: number;
  changedCount: number;
  replacements: PackageReplacement[];
}

const PACKAGE_TIERS: PackageTier[] = [
  { id: "basic", labelKey: "bom.packageBasic", tone: "var(--text-secondary)" },
  { id: "standard", labelKey: "bom.packageStandard", tone: "var(--amber)" },
  { id: "premium", labelKey: "bom.packagePremium", tone: "var(--success)" },
];

function getPrimaryMaterialPrice(material: Material | null | undefined): number {
  const primary = material?.pricing?.find((p) => p.is_primary) ?? material?.pricing?.[0];
  return Number(primary?.unit_price ?? 0);
}

function getMaterialUnit(material: Material | null | undefined, fallback: string): string {
  const primary = material?.pricing?.find((p) => p.is_primary) ?? material?.pricing?.[0];
  return material?.design_unit ?? primary?.unit ?? fallback;
}

function getLineCost(item: BomItem, material: Material | null | undefined): number {
  const unitPrice = getPrimaryMaterialPrice(material) || Number(item.unit_price ?? 0);
  return unitPrice * Number(item.quantity || 0);
}

function getReplacementCandidates(
  item: BomItem,
  currentMaterial: Material | null,
  materials: Material[],
  bomMaterialIds: Set<string>,
): Material[] {
  const group = currentMaterial?.substitution_group;
  const category = currentMaterial?.category_name ?? item.category_name;
  const currentUnit = getMaterialUnit(currentMaterial, item.unit);

  let candidates = materials.filter((material) => {
    if (material.id !== item.material_id && bomMaterialIds.has(material.id)) return false;
    if (group) return material.substitution_group === group;
    return category != null && material.category_name === category;
  });

  const sameUnit = candidates.filter((material) => getMaterialUnit(material, item.unit) === currentUnit);
  if (sameUnit.length >= 2) candidates = sameUnit;

  const priced = candidates.filter((material) => getPrimaryMaterialPrice(material) > 0);
  return (priced.length > 0 ? priced : candidates).sort(
    (a, b) => getPrimaryMaterialPrice(a) - getPrimaryMaterialPrice(b),
  );
}

function pickPackageMaterial(candidates: Material[], tier: PackageTierId): Material | null {
  if (candidates.length === 0) return null;
  if (tier === "basic") return candidates[0];
  if (tier === "premium") return candidates[candidates.length - 1];
  return candidates[Math.round((candidates.length - 1) / 2)];
}

function formatPackageCurrency(amount: number, locale: string): string {
  return `${Math.round(amount).toLocaleString(locale, { maximumFractionDigits: 0 })} €`;
}

/* ── Unit conversion helpers ───────────────────────────────── */

/** VAT multiplier for Finnish VAT classes (as of 2024-09) */
const VAT_RATES: Record<VatClass, number> = {
  standard: 0.255,
  reduced: 0.14,
  zero: 0,
};

/** Return the VAT rate (0-1) for a material, defaulting to standard (25.5%) */
function getVatRate(material: Material): number {
  return VAT_RATES[material.vat_class ?? 'standard'] ?? VAT_RATES.standard;
}

/**
 * Convert a design quantity to the number of purchasable packs required.
 * Always rounds UP because you can't buy half a pack.
 *
 * @param designQty — how many design_units needed (e.g. 12 m2)
 * @param conversionFactor — how many design_units per 1 purchasable_unit (e.g. 1.8 m2/pack)
 * @param packSize — items per pack (e.g. 3 panels per pack)
 * @returns number of purchasable packs to buy
 */
function designToPurchasable(
  designQty: number,
  conversionFactor?: number,
  packSize?: number,
): number {
  if (!conversionFactor || conversionFactor <= 0) return designQty;
  const unitsNeeded = designQty / conversionFactor;
  const packs = packSize && packSize > 1 ? unitsNeeded / packSize : unitsNeeded;
  return Math.ceil(packs);
}

/**
 * Compute the purchasable buy quantity from a design quantity.
 *
 * Returns null when the material has no conversion metadata (e.g. preview
 * materials that are not purchasable). When designUnit === purchasableUnit the
 * function still returns a value so the caller can decide whether to display it.
 *
 * Examples:
 *   osb_9mm, designQty=10 m² → { buyQty: 4, purchasableUnit: "sheet", packSize: 2.88 }
 *   pine_48x98_c24, designQty=15 m → { buyQty: 15, purchasableUnit: "m", packSize: null }
 */
function computeBuyQty(
  materialId: string,
  designQty: number,
  materials: Material[],
): { buyQty: number; purchasableUnit: string; packSize: number | null } | null {
  const mat = materials.find((m) => m.id === materialId);
  if (!mat || mat.conversion_factor == null || mat.conversion_factor <= 0) return null;
  const rawBuyQty = designQty * mat.conversion_factor;
  // Round up to the nearest whole unit for pack-based items; otherwise keep 2dp
  const buyQty =
    mat.pack_size != null && mat.pack_size > 0
      ? Math.ceil(rawBuyQty)
      : Math.round(rawBuyQty * 100) / 100;
  return {
    buyQty,
    purchasableUnit: mat.purchasable_unit ?? mat.design_unit ?? "kpl",
    packSize: mat.pack_size ?? null,
  };
}

/* ── Category color palette ─────────────────────────────────── */
const CATEGORY_COLORS: Record<string, string> = {
  "Sahatavara":  "#8B6F47",
  "Lumber":      "#8B6F47",
  "Katto":       "#4A5568",
  "Roofing":     "#4A5568",
  "Eristys":     "#C49058",
  "Insulation":  "#C49058",
  "Perustus":    "#718096",
  "Foundation":  "#718096",
  "Kalvo":       "#4A8B7F",
  "Membrane":    "#4A8B7F",
  "Kiinnitys":   "#A0AEC0",
  "Fasteners":   "#A0AEC0",
  "Sisä":        "#CBD5E0",
  "Interior":    "#CBD5E0",
};
const FALLBACK_COLORS = [
  "#6B7280", "#9CA3AF", "#78716C", "#7C8A6E", "#8E7B6D", "#7A8B99",
];

function getCategoryColor(name: string, idx: number): string {
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

/* ── Scene material name normalization ─────────────────────── */
const MATERIAL_ALIASES: Record<string, string[]> = {
  sahatavara: ["lumber", "wood", "puu", "sahatavara", "timber"],
  perustus: ["foundation", "concrete", "betoni", "perustus"],
  eristys: ["insulation", "eriste", "eristys", "insulate"],
  katto: ["roofing", "katto", "roof", "shingle"],
  kalvo: ["membrane", "kalvo", "vapor", "barrier"],
  kiinnitys: ["fasteners", "kiinnitys", "screw", "nail", "bolt"],
  sisä: ["interior", "sisä", "finish", "drywall", "gypsum"],
};

/**
 * Match a scene material name against the materials catalog using
 * fuzzy name + category matching. Returns the best matching Material or null.
 */
function matchSceneMaterial(
  sceneName: string,
  materials: Material[],
): Material | null {
  const lower = sceneName.toLowerCase().trim();

  // 1. Exact match on material name/id
  const exact = materials.find(
    (m) =>
      m.id.toLowerCase() === lower ||
      m.name.toLowerCase() === lower ||
      m.name_fi?.toLowerCase() === lower ||
      m.name_en?.toLowerCase() === lower
  );
  if (exact) return exact;

  // 2. Match via known aliases -> category
  for (const [category, aliases] of Object.entries(MATERIAL_ALIASES)) {
    if (aliases.some((a) => lower.includes(a) || a.includes(lower))) {
      // Find first material in that category
      const catMatch = materials.find((m) =>
        m.category_name?.toLowerCase().includes(category) ||
        (m.category_name_fi?.toLowerCase() || "").includes(category)
      );
      if (catMatch) return catMatch;
    }
  }

  // 3. Substring match on material name
  const partial = materials.find(
    (m) =>
      m.name.toLowerCase().includes(lower) ||
      (m.name_fi?.toLowerCase() || "").includes(lower) ||
      (m.name_en?.toLowerCase() || "").includes(lower) ||
      lower.includes(m.name.toLowerCase())
  );
  if (partial) return partial;

  return null;
}

/* ── Donut chart sub-component ──────────────────────────────── */
interface CategorySlice {
  name: string;
  total: number;
  pct: number;
  color: string;
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const clampedEnd = Math.min(endAngle, startAngle + 359.999);
  const startRad = ((clampedEnd - 90) * Math.PI) / 180;
  const endRad = ((startAngle - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(endRad);
  const y1 = cy + r * Math.sin(endRad);
  const x2 = cx + r * Math.cos(startRad);
  const y2 = cy + r * Math.sin(startRad);
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function CostBreakdownChart({
  bom,
  materials,
  total,
}: {
  bom: BomItem[];
  materials: Material[];
  total: number;
}) {
  const { t, locale } = useTranslation();
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  const slices = useMemo<CategorySlice[]>(() => {
    if (total <= 0) return [];

    const matCategoryMap = new Map<string, string>();
    for (const m of materials) {
      matCategoryMap.set(m.id, m.category_name);
    }

    const groups = new Map<string, number>();
    for (const item of bom) {
      const cat = item.category_name || matCategoryMap.get(item.material_id) || "Other";
      groups.set(cat, (groups.get(cat) || 0) + Number(item.total || 0));
    }

    const sorted = Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
    return sorted.map(([name, catTotal], idx) => ({
      name,
      total: catTotal,
      pct: (catTotal / total) * 100,
      color: getCategoryColor(name, idx),
    }));
  }, [bom, materials, total]);

  if (slices.length === 0) return null;

  const svgSize = 140;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const outerR = 62;
  const strokeW = 22;
  const r = outerR - strokeW / 2;
  const hovered = slices.find((s) => s.name === hoveredSlice);

  let cumAngle = 0;
  const arcs = slices.map((s) => {
    const startAngle = cumAngle;
    const sweep = (s.pct / 100) * 360;
    cumAngle += sweep;
    return { ...s, startAngle, sweep };
  });

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
      <div
        className="label-mono"
        style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 12 }}
      >
        {t("editor.costBreakdown")}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", width: svgSize, height: svgSize }}>
          <svg
            width={svgSize}
            height={svgSize}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            role="img"
            aria-label={t('bom.donutChartAriaLabel', {
              categories: slices.map((s) => `${s.name} ${s.pct.toFixed(0)}%`).join(', '),
            })}
          >
            {arcs.map((arc) => (
              <path
                key={arc.name}
                d={describeArc(cx, cy, r, arc.startAngle, arc.startAngle + arc.sweep)}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeW}
                strokeLinecap="butt"
                onMouseEnter={() => setHoveredSlice(arc.name)}
                onMouseLeave={() => setHoveredSlice(null)}
                style={{
                  opacity: hoveredSlice && hoveredSlice !== arc.name ? 0.35 : 1,
                  transform: hoveredSlice === arc.name ? "scale(1.04)" : "scale(1)",
                  transformOrigin: "center",
                  transition: "opacity 0.15s ease, transform 0.15s ease",
                  cursor: "pointer",
                }}
              />
            ))}
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            {hovered ? (
              <>
                <span style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.2, textAlign: "center", maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {hovered.name}
                </span>
                <span className="heading-display" style={{ fontSize: 14, lineHeight: 1.1, color: "var(--text-primary)" }}>
                  {hovered.total.toLocaleString(locale, { maximumFractionDigits: 0 })}&euro;
                </span>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{hovered.pct.toFixed(0)}%</span>
              </>
            ) : (
              <>
                <span className="heading-display" style={{ fontSize: 16, lineHeight: 1.1, color: "var(--text-primary)" }}>
                  {total.toLocaleString(locale, { maximumFractionDigits: 0 })}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>&euro;</span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%" }}>
          {slices.map((s) => (
            <div
              key={s.name}
              onMouseEnter={() => setHoveredSlice(s.name)}
              onMouseLeave={() => setHoveredSlice(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
                cursor: "pointer",
                opacity: hoveredSlice && hoveredSlice !== s.name ? 0.5 : 1,
                transition: "opacity 0.15s ease",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "2px",
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {s.name}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                  fontSize: 10,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.pct.toFixed(0)}% &middot; {s.total.toLocaleString(locale, { maximumFractionDigits: 0 })}&euro;
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── SVG Sparkline component ───────────────────────────────── */
function Sparkline({
  data,
  width = 80,
  height = 24,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padY = 2;
  const usableH = height - padY * 2;

  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: padY + usableH - ((v - min) / range) * usableH,
  }));

  const linePoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fillPath = `M ${pts[0].x},${pts[0].y} ` +
    pts.slice(1).map((p) => `L ${p.x},${p.y}`).join(" ") +
    ` L ${width},${height} L 0,${height} Z`;

  const trending = data[data.length - 1] > data[0] ? "up" : data[data.length - 1] < data[0] ? "down" : "stable";
  const strokeColor = trending === "down" ? "var(--success, #8bc48b)" : trending === "up" ? "var(--danger, #e05555)" : "var(--amber, #e5a04b)";
  const gradId = `sparkGrad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Trend badge helper ────────────────────────────────────── */
function computeTrend(
  history: PriceHistoryRow[],
  supplierId: string,
  days: number
): { pctChange: number; direction: "up" | "down" | "stable" } {
  const cutoff = Date.now() - days * 86400000;
  const rows = history
    .filter((h) => h.supplier_id === supplierId && new Date(h.scraped_at).getTime() >= cutoff)
    .sort((a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime());

  if (rows.length < 2) return { pctChange: 0, direction: "stable" };

  const oldest = parseFloat(rows[0].unit_price);
  const newest = parseFloat(rows[rows.length - 1].unit_price);
  if (oldest === 0) return { pctChange: 0, direction: "stable" };

  const pct = ((newest - oldest) / oldest) * 100;
  const direction = Math.abs(pct) < 1 ? "stable" : pct > 0 ? "up" : "down";
  return { pctChange: Math.round(pct), direction };
}

/* ── Expanded price history chart ─────────────────────────── */
type TimeRange = "30d" | "90d" | "180d" | "1y";
const TIME_RANGE_DAYS: Record<TimeRange, number> = { "30d": 30, "90d": 90, "180d": 180, "1y": 365 };

function PriceHistoryChart({
  history,
  supplierColors,
}: {
  history: PriceHistoryRow[];
  supplierColors: Map<string, string>;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<TimeRange>("90d");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const days = TIME_RANGE_DAYS[range];
  const cutoff = Date.now() - days * 86400000;

  // Measure container width and update on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const filtered = useMemo(
    () =>
      history
        .filter((h) => new Date(h.scraped_at).getTime() >= cutoff)
        .sort((a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime()),
    [history, cutoff]
  );

  // Group by supplier
  const bySupplier = useMemo(() => {
    const map = new Map<string, { name: string; points: { t: number; p: number }[] }>();
    for (const row of filtered) {
      if (!map.has(row.supplier_id)) {
        map.set(row.supplier_id, { name: row.supplier_name, points: [] });
      }
      map.get(row.supplier_id)!.points.push({
        t: new Date(row.scraped_at).getTime(),
        p: parseFloat(row.unit_price),
      });
    }
    return map;
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div ref={containerRef} style={{ textAlign: "center", padding: 16, color: "var(--text-muted)", fontSize: 12 }}>
        {t("pricing.limitedHistory")}
      </div>
    );
  }

  // Compute chart bounds
  const allPrices = filtered.map((r) => parseFloat(r.unit_price));
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const priceRange = maxP - minP || 1;

  const allTimes = filtered.map((r) => new Date(r.scraped_at).getTime());
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);
  const timeRange = maxT - minT || 1;

  const chartW = Math.max(containerWidth, 200);
  const chartH = 120;
  const padX = 4;
  const padY = 6;
  const usableW = chartW - padX * 2;
  const usableH = chartH - padY * 2;

  function toSVG(t: number, p: number) {
    const x = padX + ((t - minT) / timeRange) * usableW;
    const y = padY + usableH - ((p - minP) / priceRange) * usableH;
    return { x, y };
  }

  return (
    <div ref={containerRef} style={{ marginTop: 12 }}>
      {/* Time range selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {(["30d", "90d", "180d", "1y"] as TimeRange[]).map((r) => (
          <button
            key={r}
            className="category-chip"
            data-active={range === r}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {/* SVG chart */}
      <svg
        width="100%"
        height={chartH}
        style={{
          display: "block",
          background: "var(--bg-tertiary)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
        }}
        viewBox={`0 0 ${chartW} ${chartH}`}
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padY + usableH - frac * usableH;
          return (
            <line
              key={frac}
              x1={padX}
              y1={y}
              x2={padX + usableW}
              y2={y}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="3,3"
            />
          );
        })}

        {/* Lines per supplier */}
        {Array.from(bySupplier.entries()).map(([suppId, { points }]) => {
          if (points.length < 2) return null;
          const color = supplierColors.get(suppId) || "var(--text-muted)";
          const d = points
            .map((pt, i) => {
              const { x, y } = toSVG(pt.t, pt.p);
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <path
              key={suppId}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
        {Array.from(bySupplier.entries()).map(([suppId, { name }]) => (
          <div key={suppId} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
            <span style={{ width: 8, height: 3, borderRadius: 1, background: supplierColors.get(suppId) || "var(--text-muted)", flexShrink: 0 }} />
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Supplier chart colors ─────────────────────────────────── */
const SUPPLIER_COLORS = ["#c4915c", "#6a9fb5", "#8b6f47", "#7c8a6e", "#a0665c", "#8e7b9a"];

function PriceComparisonPopup({
  materialId,
  materialName,
  onClose,
}: {
  materialId: string;
  materialName: string;
  onClose: () => void;
}) {
  const [priceData, setPriceData] = useState<MaterialPriceData | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(false);
  const { t, locale } = useTranslation();
  const popupRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Capture the element that triggered the popup so we can return focus on close
  useEffect(() => {
    triggerRef.current = document.activeElement;
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getMaterialPrices(materialId),
      api.getPriceHistory(materialId).catch(() => [] as PriceHistoryRow[]),
    ])
      .then(([data, history]: [MaterialPriceData, PriceHistoryRow[]]) => {
        setPriceData(data);
        setPriceHistory(history);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [materialId]);

  // Return focus to the trigger element when the popup closes
  const handleClose = useCallback(() => {
    if (triggerRef.current && triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }

      // Focus trap: cycle through focusable elements within the popup
      if (e.key === "Tab" && popupRef.current) {
        const focusable = popupRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [handleClose]);

  // Focus the close button when the popup opens
  useEffect(() => {
    requestAnimationFrame(() => closeBtnRef.current?.focus());
  }, []);

  // Build supplier color map
  const supplierColors = useMemo(() => {
    const map = new Map<string, string>();
    if (priceData) {
      priceData.prices.forEach((p, i) => {
        map.set(p.supplier_id, SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]);
      });
    }
    return map;
  }, [priceData]);

  // Build sparkline data per supplier (90-day window, chronological)
  const sparklineData = useMemo(() => {
    const map = new Map<string, number[]>();
    const cutoff = Date.now() - 90 * 86400000;
    const sorted = [...priceHistory]
      .filter((h) => new Date(h.scraped_at).getTime() >= cutoff)
      .sort((a, b) => new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime());
    for (const row of sorted) {
      if (!map.has(row.supplier_id)) map.set(row.supplier_id, []);
      map.get(row.supplier_id)!.push(parseFloat(row.unit_price));
    }
    return map;
  }, [priceHistory]);

  const hasHistory = priceHistory.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={materialName}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        ref={popupRef}
        className="animate-in"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          width: "100%",
          maxWidth: 480,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
          margin: "0 16px",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('pricing.compareTitle')}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{materialName}</div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={handleClose}
            className="popup-close-btn"
            aria-label={t('dialog.close') || 'Close'}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px 8px", lineHeight: 1, borderRadius: "var(--radius-sm)", transition: "color 0.15s ease, background 0.15s ease", display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-tertiary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? (
            <SkeletonPriceComparison />
          ) : !priceData || priceData.prices.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
              {t('pricing.noSuppliers')}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {priceData.prices.map((price, idx) => {
                const isCheapest = idx === 0;
                const unitPrice = parseFloat(price.unit_price);
                const spark = sparklineData.get(price.supplier_id);
                const trend = computeTrend(priceHistory, price.supplier_id, 30);
                const priceStockLevel = normalizeStockLevel(price.stock_level);
                const priceStock = stockMeta(priceStockLevel, t);
                const priceStockTooltip = stockTooltip(price, t, locale);
                return (
                  <div
                    key={price.id}
                    style={{
                      padding: "14px 16px",
                      background: isCheapest ? "rgba(74, 124, 89, 0.08)" : "var(--bg-tertiary)",
                      border: isCheapest ? "1px solid rgba(74, 124, 89, 0.25)" : "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          title={priceStockTooltip}
                          aria-label={priceStockTooltip}
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: priceStock.color,
                            boxShadow: "0 0 0 2px rgba(0,0,0,0.04)",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{price.supplier_name}</span>
                        {isCheapest && (
                          <span
                            className="badge badge-forest"
                            style={{ fontSize: 10, padding: "2px 8px" }}
                          >
                            {t('pricing.cheapest')}
                          </span>
                        )}
                        {price.is_primary && (
                          <span
                            className="badge badge-amber"
                            style={{ fontSize: 10, padding: "2px 8px" }}
                          >
                            {t('pricing.primary')}
                          </span>
                        )}
                        {/* Trend badge */}
                        {trend.direction !== "stable" && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: "var(--radius-sm)",
                              background: trend.direction === "down" ? "rgba(74, 124, 89, 0.12)" : "rgba(239, 68, 68, 0.08)",
                              color: trend.direction === "down" ? "var(--success)" : "var(--danger)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 2,
                            }}
                          >
                            {trend.direction === "down" ? "\u2193" : "\u2191"}
                            {Math.abs(trend.pctChange)}%
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* Sparkline */}
                        {spark && spark.length >= 2 && (
                          <div
                            style={{ cursor: "pointer", opacity: 0.8 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowChart(true);
                            }}
                            title={t("pricing.showTrend")}
                          >
                            <Sparkline data={spark} width={60} height={20} />
                          </div>
                        )}
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 14,
                          fontWeight: 600,
                          color: isCheapest ? "var(--success)" : "var(--text-primary)",
                        }}>
                          {unitPrice.toFixed(2)} &euro;
                        </span>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                        <span>{localizeUnit(price.unit, t)} {t('pricing.perUnit')}</span>
                        {price.sku && <span>SKU: {price.sku}</span>}
                        {price.last_scraped_at && (
                          <span>{t('pricing.lastChecked')}: {new Date(price.last_scraped_at).toLocaleDateString(locale === "fi" ? "fi-FI" : "en-GB")}</span>
                        )}
                      </div>
                      {price.link && (
                        <a
                          href={price.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--amber)",
                            textDecoration: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          {t('pricing.viewProduct')}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Expanded chart area */}
              {hasHistory && showChart && (
                <PriceHistoryChart history={priceHistory} supplierColors={supplierColors} />
              )}

              {/* Toggle chart button */}
              {hasHistory && (
                <button
                  onClick={() => setShowChart(!showChart)}
                  style={{
                    padding: "6px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    transition: "all 0.12s ease",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  {showChart ? t("pricing.hideHistory") : t("pricing.showHistory")}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer with savings summary */}
        {priceData && priceData.savings_per_unit > 0 && (
          <div style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
          }}>
            <span style={{ color: "var(--text-muted)" }}>
              {t('pricing.savingsLabel')}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--success)" }}>
              -{priceData.savings_per_unit.toFixed(2)} &euro; {t('pricing.perUnit')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Quote summary sub-component ──────────────────────────── */
function QuoteSummary({
  bom,
  materials,
}: {
  bom: BomItem[];
  materials: Material[];
}) {
  const { t, locale } = useTranslation();
  const [quoteMode, setQuoteMode] = useState<"homeowner" | "contractor">("homeowner");

  const quote = useMemo(() => {
    if (bom.length === 0) return null;
    const config: QuoteConfig = defaultQuoteConfig(quoteMode);
    return calculateQuote(bom, materials, config);
  }, [bom, materials, quoteMode]);

  if (!quote) return null;

  const vatPct = Math.round(quote.config.vatRate * 100 * 10) / 10;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    fontSize: 12,
    padding: "3px 0",
  };

  const labelStyle: React.CSSProperties = {
    color: "var(--text-muted)",
    fontFamily: "var(--font-body)",
  };

  const valueStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-primary)",
    fontVariantNumeric: "tabular-nums",
  };

  const dividerStyle: React.CSSProperties = {
    borderTop: "1px solid var(--border)",
    margin: "6px 0",
  };

  const formatEur = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";

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
      {/* Header with mode toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {t("quote.sectionLabel")}
        </div>
        <div style={{ display: "flex", gap: 2, background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", padding: 2 }}>
          {(["homeowner", "contractor"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setQuoteMode(mode)}
              style={{
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: quoteMode === mode ? 600 : 400,
                background: quoteMode === mode ? "var(--bg-elevated)" : "transparent",
                border: quoteMode === mode ? "1px solid var(--border)" : "1px solid transparent",
                borderRadius: "var(--radius-sm)",
                color: quoteMode === mode ? "var(--text-primary)" : "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                transition: "all 0.12s ease",
              }}
            >
              {t(`quote.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Line items */}
      <div>
        <div style={rowStyle}>
          <span style={labelStyle}>{t("quote.materials")}</span>
          <span style={valueStyle}>{formatEur(quote.materialSubtotal)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>
            {t("quote.labour")}&nbsp;
            <span style={{ fontSize: 10, opacity: 0.7 }}>
              ({t("quote.labourRate", { rate: quote.config.labourRatePerHour })})
            </span>
          </span>
          <span style={valueStyle}>{formatEur(quote.labourSubtotal)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>
            {t("quote.wastage")}&nbsp;
            <span style={{ fontSize: 10, opacity: 0.7 }}>
              ({t("quote.wastageRate", { pct: Math.round(quote.config.wastagePercent * 100) })})
            </span>
          </span>
          <span style={{ ...valueStyle, color: "var(--text-muted)" }}>{formatEur(quote.wastageTotal)}</span>
        </div>

        <div style={dividerStyle} />

        <div style={rowStyle}>
          <span style={labelStyle}>{t("quote.subtotalExVat")}</span>
          <span style={valueStyle}>{formatEur(quote.subtotalExVat)}</span>
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>{t("quote.vat", { rate: vatPct })}</span>
          <span style={valueStyle}>{formatEur(quote.vatTotal)}</span>
        </div>

        {quote.contractorMargin != null && (
          <div style={rowStyle}>
            <span style={labelStyle}>
              {t("quote.contractorMargin")}&nbsp;
              <span style={{ fontSize: 10, opacity: 0.7 }}>
                ({Math.round((quote.config.contractorMarginPercent ?? 0) * 100)}%)
              </span>
            </span>
            <span style={valueStyle}>{formatEur(quote.contractorMargin)}</span>
          </div>
        )}

        <div style={dividerStyle} />

        <div style={{ ...rowStyle, marginTop: 4 }}>
          <span style={{ ...labelStyle, fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
            {t("quote.grandTotal")}
          </span>
          <span style={{ ...valueStyle, fontWeight: 700, fontSize: 15, color: "var(--amber)" }}>
            {formatEur(quote.grandTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── BOM item card with debounced quantity input ──────────── */
function BomItemCard({
  item,
  materials,
  locale,
  index,
  isFocused,
  onRequestRemove,
  onUpdateQty,
  onCompare,
  onNavigate,
  onFocusIndex,
  isPackageLocked = false,
  isPriceWatched = false,
  isPriceWatchBusy = false,
  hasSubstitutionSuggestion = false,
  onTogglePackageLock,
  onTogglePriceWatch,
  onOpenMaterialPicker,
  onUpdateNote,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragTarget = false,
}: {
  item: BomItem;
  materials: Material[];
  locale: string;
  index: number;
  isFocused: boolean;
  onRequestRemove: (materialId: string) => void;
  onUpdateQty: (materialId: string, qty: number) => void;
  onCompare: (id: string, name: string) => void;
  onNavigate: (direction: "up" | "down" | "next") => void;
  onFocusIndex: (index: number) => void;
  isPackageLocked?: boolean;
  isPriceWatched?: boolean;
  isPriceWatchBusy?: boolean;
  hasSubstitutionSuggestion?: boolean;
  onTogglePackageLock?: (materialId: string) => void;
  onTogglePriceWatch?: (item: BomItem) => void;
  onOpenMaterialPicker: (materialId: string) => void;
  onUpdateNote?: (materialId: string, note: string) => void;
  onDragStart?: (index: number) => void;
  onDragOver?: (index: number) => void;
  onDragEnd?: () => void;
  isDragTarget?: boolean;
}) {
  const { t } = useTranslation();
  const [localQty, setLocalQty] = useState(String(item.quantity));
  const [prevQty, setPrevQty] = useState(String(item.quantity));
  const [isEditing, setIsEditing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from props when quantity changes externally
  useEffect(() => {
    setLocalQty(String(item.quantity));
    setPrevQty(String(item.quantity));
  }, [item.quantity]);

  // Focus the card when it becomes the focused index
  useEffect(() => {
    if (isFocused && cardRef.current) {
      // Only focus the card if the input is not already focused
      if (document.activeElement !== inputRef.current) {
        cardRef.current.focus();
      }
    }
  }, [isFocused]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleQtyChange = (val: string) => {
    setLocalQty(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdateQty(item.material_id, parseFloat(val) || 0);
    }, 300);
  };

  const handleQtyBlur = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onUpdateQty(item.material_id, parseFloat(localQty) || 0);
    setIsEditing(false);
    setPrevQty(localQty);
  };

  const commitEdit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onUpdateQty(item.material_id, parseFloat(localQty) || 0);
    setIsEditing(false);
    setPrevQty(localQty);
  };

  const cancelEdit = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocalQty(prevQty);
    onUpdateQty(item.material_id, parseFloat(prevQty) || 0);
    setIsEditing(false);
    // Return focus to the card row
    cardRef.current?.focus();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
      onNavigate("next");
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === "ArrowUp" && !isEditing) {
      e.preventDefault();
      onNavigate("up");
    } else if (e.key === "ArrowDown" && !isEditing) {
      e.preventDefault();
      onNavigate("down");
    }
    // Stop propagation so card handler doesn't also fire
    e.stopPropagation();
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const materialName = getLocalizedBomItemName(item, materials, locale);
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        onNavigate("up");
        break;
      case "ArrowDown":
        e.preventDefault();
        onNavigate("down");
        break;
      case "Tab":
        // Let Tab naturally move to the input, but track focus
        break;
      case "Enter":
        e.preventDefault();
        if (e.shiftKey && inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
          setIsEditing(true);
          setPrevQty(localQty);
        } else {
          onOpenMaterialPicker(item.material_id);
        }
        break;
      case "m":
      case "M":
        e.preventDefault();
        onOpenMaterialPicker(item.material_id);
        break;
      case "Delete":
      case "Backspace":
        // Only trigger remove if focus is on the card, not the input
        if (document.activeElement === cardRef.current) {
          e.preventDefault();
          onRequestRemove(item.material_id);
        }
        break;
      case " ":
        e.preventDefault();
        onCompare(item.material_id, materialName);
        break;
      default:
        break;
    }
  };

  const materialName = getLocalizedBomItemName(item, materials, locale);

  // Compute purchasable buy quantity for display alongside the design quantity
  const designQty = parseFloat(localQty) || 0;
  const buyInfo = computeBuyQty(item.material_id, designQty, materials);
  const mat = materials.find((m) => m.id === item.material_id);
  // Only show the buy-qty line when designUnit differs from purchasableUnit
  // (e.g. "10 m² → 4 sheets × 2.88 m²") but not for 1:1 continuous units
  const showBuyQty =
    buyInfo != null &&
    mat != null &&
    mat.design_unit != null &&
    mat.purchasable_unit != null &&
    mat.design_unit !== mat.purchasable_unit;
  const stockLevel = normalizeStockLevel(item.stock_level);
  const stock = stockMeta(stockLevel, t);
  const stockTooltipText = stockTooltip(item, t, locale);

  return (
    <div
      ref={cardRef}
      className={`bom-item-card${isFocused ? ' bom-item-focused' : ''}${isDragTarget ? ' bom-drag-target' : ''}`}
      tabIndex={0}
      role="row"
      aria-label={t('editor.bomItemRow', { name: materialName, qty: localQty, total: Number(item.total || 0).toFixed(2) })}
      data-bom-index={index}
      draggable={!!onDragStart}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(index);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver?.(index);
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={() => onCompare(item.material_id, materialName)}
      onContextMenu={(e) => {
        e.preventDefault();
        onOpenMaterialPicker(item.material_id);
      }}
      onFocus={() => onFocusIndex(index)}
      onKeyDown={handleCardKeyDown}
    >
      <div className="bom-item-header">
        <div className="bom-item-info">
          {onDragStart && (
            <span className="bom-drag-handle" aria-hidden="true" onMouseDown={(e) => e.stopPropagation()}>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" opacity="0.3">
                <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
                <circle cx="2" cy="7" r="1.2" /><circle cx="6" cy="7" r="1.2" />
                <circle cx="2" cy="12" r="1.2" /><circle cx="6" cy="12" r="1.2" />
              </svg>
            </span>
          )}
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={materialName}
              className="bom-item-thumb"
            />
          ) : (
            <div className="bom-item-thumb-placeholder" />
          )}
          <strong className="bom-item-name">{materialName}</strong>
        </div>
        <div className="bom-item-actions">
          {onTogglePackageLock && (
            <button
              className="bom-package-lock-btn"
              data-locked={isPackageLocked}
              tabIndex={-1}
              aria-pressed={isPackageLocked}
              aria-label={t(isPackageLocked ? 'bom.packageUnlock' : 'bom.packageLock', { name: materialName })}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePackageLock(item.material_id);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isPackageLocked ? (
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </>
                )}
              </svg>
            </button>
          )}
          {onTogglePriceWatch && (
            <button
              className="bom-package-lock-btn"
              data-locked={isPriceWatched}
              tabIndex={-1}
              disabled={isPriceWatchBusy}
              aria-pressed={isPriceWatched}
              aria-label={t(isPriceWatched ? "priceAlerts.stopWatching" : "priceAlerts.watchMaterial", { name: materialName })}
              title={t(isPriceWatched ? "priceAlerts.stopWatching" : "priceAlerts.watchMaterial", { name: materialName })}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePriceWatch(item);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={isPriceWatched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          )}
          <button
            className="bom-remove-btn"
            tabIndex={-1}
            aria-label={t('editor.removeMaterial', { name: materialName })}
            onClick={(e) => { e.stopPropagation(); onRequestRemove(item.material_id); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="bom-item-qty-row">
        <input
          ref={inputRef}
          type="number"
          min={0.01}
          step={0.1}
          value={localQty}
          onClick={(e) => e.stopPropagation()}
          onFocus={() => { setIsEditing(true); setPrevQty(localQty); }}
          onChange={(e) => handleQtyChange(e.target.value)}
          onBlur={handleQtyBlur}
          onKeyDown={handleInputKeyDown}
          className="bom-item-qty-input"
          tabIndex={isFocused ? 0 : -1}
          aria-label={t('editor.quantityFor', { name: materialName })}
        />
        <span className="bom-item-unit">
          {localizeUnit(item.unit, t)} x {Number(item.unit_price || 0).toFixed(2)}
        </span>
        <span
          title={stockTooltipText}
          aria-label={stockTooltipText}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: stock.color,
            boxShadow: "0 0 0 2px rgba(0,0,0,0.04)",
            flexShrink: 0,
          }}
        />
        <button
          type="button"
          className="bom-item-total bom-item-cost-badge"
          title={t("materialPicker.openFor", { name: materialName })}
          aria-label={t("materialPicker.openFor", { name: materialName })}
          onClick={(e) => {
            e.stopPropagation();
            onOpenMaterialPicker(item.material_id);
          }}
        >
          {Number(item.total || 0).toFixed(2)}
        </button>
      </div>
      {/* Purchasable quantity hint — shown when conversion differs from design */}
      {(() => {
        const mat = materials.find((m) => m.id === item.material_id);
        if (!mat || !mat.conversion_factor || !mat.purchasable_unit) return null;
        if (mat.design_unit === mat.purchasable_unit && (mat.pack_size ?? 1) <= 1) return null;
        const purchaseQty = designToPurchasable(
          parseFloat(localQty) || 0,
          mat.conversion_factor,
          mat.pack_size,
        );
        return (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              padding: '2px 0 0 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ opacity: 0.6 }}>{t('editor.toBuy')}</span>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
              {purchaseQty} {localizeUnit(mat.purchasable_unit, t)}
            </span>
          </div>
        );
      })()}
      {/* Buy quantity line: e.g. "45 m² → 16 sheets × 2.88 m²" */}
      {showBuyQty && buyInfo && (
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>
            {buyInfo.buyQty} {buyInfo.purchasableUnit}
            {buyInfo.packSize != null && (
              <> &times; {buyInfo.packSize} {mat?.design_unit ?? item.unit}</>
            )}
          </span>
        </div>
      )}
      {item.supplier && (
        <div className="bom-item-supplier">
          {item.supplier}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      )}
      {onUpdateNote && (
        <input
          type="text"
          className="bom-item-note"
          placeholder={t("bom.addNote")}
          defaultValue={item.note || ""}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => onUpdateNote(item.material_id, e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      )}
      {(stockLevel === "out_of_stock" || hasSubstitutionSuggestion) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasSubstitutionSuggestion) {
              onOpenMaterialPicker(item.material_id);
            } else {
              onCompare(item.material_id, materialName);
            }
          }}
          style={{
            marginTop: 6,
            padding: "4px 7px",
            border: "1px solid rgba(239, 68, 68, 0.22)",
            borderRadius: "var(--radius-sm)",
            background: "rgba(239, 68, 68, 0.06)",
            color: "var(--danger)",
            fontSize: 10,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "var(--font-body)",
          }}
        >
          {hasSubstitutionSuggestion ? t("bom.substituteAvailable") : t("bom.alternativeAvailable")}
        </button>
      )}
    </div>
  );
}

/* ── CSV BOM export ────────────────────────────────────────── */

/** Escape a CSV field: wrap in quotes if it contains the separator, quotes, or newlines */
function escapeCsvField(value: string, separator: string): string {
  if (value.includes(separator) || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Generate a CSV string from BOM data with locale-aware formatting.
 * Finnish locale: semicolon separator, comma decimal separator.
 * English locale: comma separator, dot decimal separator.
 */
function generateBomCsv(
  bom: BomItem[],
  materials: Material[],
  locale: string,
  t: (key: string) => string,
): string {
  const isFi = locale === 'fi';
  const sep = isFi ? ';' : ',';

  const formatNumber = (n: number): string => {
    const s = n.toFixed(2);
    return isFi ? s.replace('.', ',') : s;
  };

  const headers = [
    t('bom.csvMaterial'),
    t('bom.csvQuantity'),
    t('bom.csvUnit'),
    t('bom.csvUnitPrice'),
    t('bom.csvTotal'),
    t('bom.csvSupplier'),
    t('bom.csvCategory'),
    t('bom.csvNote'),
  ];

  const rows = bom.map((item) => {
    const mat = materials.find((m) => m.id === item.material_id);
    const name = mat
      ? getLocalizedMaterialName(mat, locale)
      : item.material_name || item.material_id;
    const supplier = item.supplier
      || (mat?.pricing?.[0]?.supplier_name)
      || '';
    const category = item.category_name
      || mat?.category_name
      || '';

    return [
      escapeCsvField(name, sep),
      formatNumber(item.quantity),
      escapeCsvField(item.unit || '', sep),
      formatNumber(item.unit_price ?? 0),
      formatNumber(item.total ?? 0),
      escapeCsvField(supplier, sep),
      escapeCsvField(category, sep),
      escapeCsvField(item.note || '', sep),
    ].join(sep);
  });

  // UTF-8 BOM for Excel compatibility with Finnish characters
  return '\uFEFF' + headers.map((h) => escapeCsvField(h, sep)).join(sep) + '\n' + rows.join('\n') + '\n';
}

/** Trigger a browser download of a CSV string */
function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BomPanel({
  bom,
  materials,
  onAdd,
  onAddImported,
  onImportBom,
  onReplaceMaterial,
  onApplySupplierPrice,
  onRemove,
  onUpdateQty,
  onUpdateNote,
  onReorder,
  style,
  sceneJs,
  projectName,
  projectDescription,
  buildingInfo,
  projectId,
  householdDeductionJoint = false,
  onHouseholdDeductionJointChange,
}: {
  bom: BomItem[];
  materials: Material[];
  onAdd: (materialId: string, qty: number) => void;
  onAddImported?: (item: BomItem, material: Material) => void;
  onImportBom?: (items: BomItem[], mode: BomImportMode) => void;
  onReplaceMaterial?: (fromMaterialId: string, toMaterialId: string, options?: { undo?: boolean; source?: string }) => void;
  onApplySupplierPrice?: (override: BomPriceOverride) => void;
  onRemove: (materialId: string) => void;
  onUpdateQty: (materialId: string, qty: number) => void;
  onUpdateNote?: (materialId: string, note: string) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  style?: React.CSSProperties;
  /** Scene script for extracting material declarations */
  sceneJs?: string;
  /** Project name for export filenames */
  projectName?: string;
  /** Project description used to prefill contractor quote scope */
  projectDescription?: string;
  /** Address-derived building context for subsidy eligibility defaults */
  buildingInfo?: BuildingInfo | null;
  /** Project ID used by API-backed cost add-ons such as waste estimates */
  projectId?: string;
  /** Whether the household deduction calculator should use two claimants */
  householdDeductionJoint?: boolean;
  /** Persist household deduction claimant mode on the project */
  onHouseholdDeductionJointChange?: (joint: boolean) => void;
}) {
  const glow = useCursorGlow();
  const [compareMaterial, setCompareMaterial] = useState<{ id: string; name: string } | null>(null);
  const [materialPickerId, setMaterialPickerId] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [keskoMode, setKeskoMode] = useState(false);
  const [keskoProducts, setKeskoProducts] = useState<KeskoProduct[]>([]);
  const [keskoLoading, setKeskoLoading] = useState(false);
  const [keskoError, setKeskoError] = useState<string | null>(null);
  const [keskoConfigured, setKeskoConfigured] = useState<boolean | null>(null);
  const [keskoAddingId, setKeskoAddingId] = useState<string | null>(null);
  const [totalSavings, setTotalSavings] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [quickAddId, setQuickAddId] = useState<string | null>(null);
  const [quickAddQty, setQuickAddQty] = useState(1);
  const [focusedBomIndex, setFocusedBomIndex] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [activePackage, setActivePackage] = useState<PackageTierId>("standard");
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [packageDelta, setPackageDelta] = useState<number | null>(null);
  const [packageFlashKey, setPackageFlashKey] = useState(0);
  const [lockedPackageMaterials, setLockedPackageMaterials] = useState<Set<string>>(() => new Set());
  const [quoteRequestOpen, setQuoteRequestOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<BomImportPreviewRow[]>([]);
  const [importMode, setImportMode] = useState<BomImportMode>("merge");
  const [importError, setImportError] = useState<string | null>(null);
  const [importDragging, setImportDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const { t, locale } = useTranslation();

  // Navigate between BOM item rows
  const handleBomNavigate = useCallback((fromIndex: number, direction: "up" | "down" | "next") => {
    let targetIndex: number;
    if (direction === "up") {
      targetIndex = Math.max(0, fromIndex - 1);
    } else {
      // "down" or "next" both go forward
      targetIndex = Math.min(bom.length - 1, fromIndex + 1);
    }
    setFocusedBomIndex(targetIndex);
    // Focus the target card's quantity input for "next" (Enter key flow)
    if (direction === "next") {
      requestAnimationFrame(() => {
        const card = document.querySelector<HTMLDivElement>(`[data-bom-index="${targetIndex}"]`);
        const input = card?.querySelector<HTMLInputElement>('.bom-item-qty-input');
        if (input) {
          input.focus();
          input.select();
        }
      });
    }
  }, [bom.length]);

  const total = bom.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const animatedTotal = useAnimatedNumber(total);
  const bomTotalAnnouncement = t("editor.bomTotalAnnouncement", {
    count: bom.length,
    items: bom.length === 1 ? t("editor.bomItemSingular") : t("editor.bomItemPlural"),
    total: total.toLocaleString(locale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }),
  });
  const heatingGrantOpportunity = useMemo(() => detectHeatingGrantOpportunity({
    sceneJs,
    bom,
    materials,
    buildingInfo,
  }), [sceneJs, bom, materials, buildingInfo]);
  const packageSummaries = useMemo<PackageSummary[]>(() => {
    const materialMap = new Map(materials.map((material) => [material.id, material]));
    const bomMaterialIds = new Set(bom.map((item) => item.material_id));

    return PACKAGE_TIERS.map((tier) => {
      let tierTotal = 0;
      let changedCount = 0;
      const replacements: PackageReplacement[] = [];

      for (const item of bom) {
        const currentMaterial = materialMap.get(item.material_id) ?? null;
        const currentCost = getLineCost(item, currentMaterial);
        const locked = lockedPackageMaterials.has(item.material_id);
        const candidates = getReplacementCandidates(item, currentMaterial, materials, bomMaterialIds);
        const picked = locked ? currentMaterial : pickPackageMaterial(candidates, tier.id);
        const toMaterial = picked ?? currentMaterial;
        const packageCost = getLineCost(item, toMaterial);

        tierTotal += packageCost;
        if (toMaterial && toMaterial.id !== item.material_id && !locked) changedCount += 1;
        if (toMaterial) {
          replacements.push({
            fromMaterialId: item.material_id,
            toMaterial,
            currentCost,
            packageCost,
            locked,
          });
        }
      }

      return {
        tier,
        total: tierTotal,
        delta: tierTotal - total,
        changedCount,
        replacements,
      };
    });
  }, [bom, lockedPackageMaterials, materials, total]);
  const hasPackageChoices = packageSummaries.some((summary) => summary.changedCount > 0);
  const activePackageSummary = packageSummaries.find((summary) => summary.tier.id === activePackage);
  const stockSummary = useMemo(() => {
    const levels = bom.map((item) => normalizeStockLevel(item.stock_level));
    return {
      total: levels.length,
      available: levels.filter((level) => level === "in_stock" || level === "low_stock").length,
      outOfStock: levels.filter((level) => level === "out_of_stock").length,
      known: levels.filter((level) => level !== "unknown").length,
    };
  }, [bom]);
  const materialTrendSignature = useMemo(() => {
    return bom
      .map((item) => `${item.material_id}:${item.quantity}:${item.unit_price ?? ""}:${item.total ?? ""}`)
      .join("|");
  }, [bom]);
  const substitutionSuggestionIds = useMemo(() => {
    return new Set(
      buildSavingsRecommendations(bom, materials)
        .filter((recommendation) =>
          recommendation.type === "material_substitution" ||
          recommendation.type === "seasonal_stock"
        )
        .map((recommendation) => recommendation.materialId),
    );
  }, [bom, materials]);
  const [priceWatches, setPriceWatches] = useState<PriceWatch[]>([]);
  const [priceWatchBusyId, setPriceWatchBusyId] = useState<string | null>(null);
  const priceWatchByMaterial = useMemo(() => {
    return new Map(priceWatches.map((watch) => [watch.material_id, watch]));
  }, [priceWatches]);

  const togglePackageLock = useCallback((materialId: string) => {
    setLockedPackageMaterials((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  }, []);

  const applyPackage = useCallback((tierId: PackageTierId) => {
    const summary = packageSummaries.find((candidate) => candidate.tier.id === tierId);
    if (!summary || !onReplaceMaterial) return;

    for (const replacement of summary.replacements) {
      if (replacement.locked || replacement.fromMaterialId === replacement.toMaterial.id) continue;
      onReplaceMaterial(replacement.fromMaterialId, replacement.toMaterial.id);
    }

    setActivePackage(tierId);
    setPackageDelta(summary.delta);
    setPackageFlashKey((key) => key + 1);
  }, [onReplaceMaterial, packageSummaries]);

  useEffect(() => {
    if (!projectId) {
      setPriceWatches([]);
      return;
    }
    let cancelled = false;
    api.getPriceWatches(projectId)
      .then((watches) => {
        if (!cancelled) setPriceWatches(watches);
      })
      .catch(() => {
        if (!cancelled) setPriceWatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const togglePriceWatch = useCallback(async (item: BomItem) => {
    if (!projectId) return;
    const existing = priceWatchByMaterial.get(item.material_id);
    setPriceWatchBusyId(item.material_id);
    try {
      if (existing) {
        await api.deletePriceWatch(existing.id);
        setPriceWatches((prev) => prev.filter((watch) => watch.id !== existing.id));
      } else {
        const watch = await api.upsertPriceWatch({
          project_id: projectId,
          material_id: item.material_id,
          watch_any_decrease: true,
          notify_email: true,
          notify_push: false,
        });
        setPriceWatches((prev) => [watch, ...prev.filter((candidate) => candidate.material_id !== item.material_id)]);
      }
    } finally {
      setPriceWatchBusyId(null);
    }
  }, [priceWatchByMaterial, projectId]);

  // Extract scene material names that are not yet in the BOM
  const unmatchedSceneMaterials = useMemo(() => {
    if (!sceneJs) return [];
    try {
      const result = interpretScene(sceneJs);
      if (result.error) return [];
      const sceneMatNames = extractSceneMaterials(result.objects);
      const bomMaterialIds = new Set(bom.map((b) => b.material_id));
      const unmatched: { sceneName: string; matched: Material | null }[] = [];
      for (const name of sceneMatNames) {
        const matched = matchSceneMaterial(name, materials);
        if (matched && bomMaterialIds.has(matched.id)) continue; // already in BOM
        unmatched.push({ sceneName: name, matched });
      }
      return unmatched;
    } catch {
      return [];
    }
  }, [sceneJs, bom, materials]);

  const handleSyncFromScene = useCallback(() => {
    for (const { matched } of unmatchedSceneMaterials) {
      if (matched) {
        onAdd(matched.id, 1);
      }
    }
  }, [unmatchedSceneMaterials, onAdd]);

  // Fetch categories on mount
  useEffect(() => {
    api.getCategories()
      .then((data: Category[]) => setCategories(data))
      .catch(() => { /* ignore */ });
  }, []);

  // Price cache: only fetch prices for materials we haven't seen before.
  // Keyed by material_id -> savings_per_unit.
  const priceCacheRef = useRef<Map<string, number>>(new Map());
  const savingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate potential savings across all BOM items.
  // Debounced: waits 1.5s after the last bom change before firing.
  // Cached: only fetches prices for newly-added materials; quantity changes
  // recalculate from cached savings_per_unit without any API calls.
  useEffect(() => {
    if (bom.length === 0) {
      setTotalSavings(0);
      return;
    }

    // Clear any pending debounce timer
    if (savingsTimerRef.current) {
      clearTimeout(savingsTimerRef.current);
    }

    let cancelled = false;

    savingsTimerRef.current = setTimeout(async () => {
      const cache = priceCacheRef.current;
      const newMaterialIds = bom
        .map((item) => item.material_id)
        .filter((id) => !cache.has(id));

      // Fetch prices only for materials not yet in cache
      if (newMaterialIds.length > 0) {
        const fetches = newMaterialIds.map(async (id) => {
          try {
            const data: MaterialPriceData = await api.getMaterialPrices(id);
            cache.set(id, data.savings_per_unit);
          } catch {
            cache.set(id, 0);
          }
        });
        await Promise.all(fetches);
      }

      if (cancelled) return;

      // Recalculate total savings from cache + current quantities
      let savings = 0;
      for (const item of bom) {
        const perUnit = cache.get(item.material_id) ?? 0;
        if (perUnit > 0) {
          savings += perUnit * item.quantity;
        }
      }
      setTotalSavings(savings);
    }, 1500);

    return () => {
      cancelled = true;
      if (savingsTimerRef.current) {
        clearTimeout(savingsTimerRef.current);
      }
    };
  }, [bom]);

  // Filter materials: exclude already-in-BOM, match search query, match category
  const availableMaterials = useMemo(() => {
    return materials
      .filter((m) => !bom.some((b) => b.material_id === m.id))
      .filter((m) => {
        if (!materialSearch.trim()) return true;
        const q = materialSearch.toLowerCase();
        const displayName = getLocalizedMaterialName(m, locale);
        return displayName.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.category_name.toLowerCase().includes(q);
      })
      .filter((m) => {
        if (!activeCategory) return true;
        return m.category_name === activeCategory;
      });
  }, [materials, bom, materialSearch, activeCategory]);

  // Get the display name for a category (locale-aware)
  const getCategoryDisplayName = useCallback((cat: Category) => {
    if (locale === 'fi' && cat.display_name_fi) return cat.display_name_fi;
    return cat.display_name;
  }, [locale]);

  // Get primary pricing info for a material
  const getPrimaryPrice = useCallback((m: Material) => {
    if (!m.pricing || m.pricing.length === 0) return null;
    const primary = m.pricing.find((p) => p.is_primary) || m.pricing[0];
    return primary;
  }, []);

  // Quick-add handler
  const handleQuickAdd = useCallback((materialId: string) => {
    if (quickAddId === materialId) {
      onAdd(materialId, quickAddQty);
      setQuickAddId(null);
      setQuickAddQty(1);
    } else {
      setQuickAddId(materialId);
      setQuickAddQty(1);
    }
  }, [quickAddId, quickAddQty, onAdd]);

  const handleKeskoSearch = useCallback(async () => {
    const q = materialSearch.trim();
    if (q.length < 2) {
      setKeskoProducts([]);
      setKeskoError(t("pricing.keskoShortQuery"));
      return;
    }

    setKeskoLoading(true);
    setKeskoError(null);
    try {
      const data: KeskoSearchResponse = await api.searchKeskoProducts(q);
      setKeskoConfigured(data.configured);
      setKeskoProducts(data.products);
      if (!data.configured) {
        setKeskoError(t("pricing.keskoNotConfigured"));
      } else if (data.error) {
        setKeskoError(data.error);
      } else if (data.products.length === 0) {
        setKeskoError(t("pricing.noResults"));
      }
    } catch (err) {
      setKeskoProducts([]);
      setKeskoError(err instanceof Error ? err.message : t("pricing.keskoSearchFailed"));
    } finally {
      setKeskoLoading(false);
    }
  }, [materialSearch, t]);

  const handleKeskoImport = useCallback(async (product: KeskoProduct) => {
    if (!onAddImported) return;
    setKeskoAddingId(product.id);
    setKeskoError(null);
    try {
      const imported: KeskoImportResponse = await api.importKeskoProduct(product);
      const price = imported.material.pricing?.[0];
      const unitPrice = Number(price?.unit_price ?? imported.bom_item.unit_price ?? product.unitPrice ?? 0);
      onAddImported({
        ...imported.bom_item,
        quantity: 1,
        unit: imported.bom_item.unit || product.unit || "kpl",
        unit_price: unitPrice,
        total: unitPrice,
        stock_level: imported.bom_item.stock_level ?? product.stockLevel,
      }, imported.material);
    } catch (err) {
      setKeskoError(err instanceof Error ? err.message : t("pricing.keskoImportFailed"));
    } finally {
      setKeskoAddingId(null);
    }
  }, [onAddImported, t]);

  const openBomImportPreview = useCallback((rows: ReturnType<typeof parseBomImportText>) => {
    if (rows.length === 0) {
      setImportError(t("bom.importNoRows"));
      return;
    }
    setImportPreview(matchImportedBomRows(rows, materials));
    setImportError(null);
  }, [materials, t]);

  const handleBomImportFile = useCallback(async (file: File) => {
    try {
      openBomImportPreview(await parseBomImportFile(file));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("bom.importFailed"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [openBomImportPreview, t]);

  const handleBomPaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text || (!text.includes("\n") && !text.trim().startsWith("[") && !text.trim().startsWith("{"))) return;

    try {
      const rows = parseBomImportText(text);
      if (rows.length === 0) return;
      event.preventDefault();
      openBomImportPreview(rows);
    } catch {
      // Let ordinary paste continue if the clipboard is not tabular BOM data.
    }
  }, [openBomImportPreview]);

  const unresolvedImportCount = importPreview.filter((row) => !row.matchedMaterialId).length;
  const resolvedImportCount = importPreview.length - unresolvedImportCount;

  const handleBomImportConfirm = useCallback(() => {
    if (!onImportBom || unresolvedImportCount > 0) return;
    const items = importPreview.flatMap((row) => {
      const material = materials.find((candidate) => candidate.id === row.matchedMaterialId);
      return material ? [buildImportedBomItem(row.imported, material)] : [];
    });
    if (items.length === 0) return;
    onImportBom(items, importMode);
    setImportPreview([]);
    setImportError(null);
  }, [importMode, importPreview, materials, onImportBom, unresolvedImportCount]);

  return (
    <div
      className="editor-bom-panel panel-glow"
      data-panel="bom"
      data-tour="bom-panel"
      style={{ position: "relative", ...style }}
      ref={glow.ref}
      onMouseMove={glow.onMouseMove}
      onMouseLeave={glow.onMouseLeave}
      onPaste={handleBomPaste}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setImportDragging(true);
        }
      }}
      onDragLeave={() => setImportDragging(false)}
      onDrop={(event) => {
        const file = event.dataTransfer.files[0];
        if (!file) return;
        event.preventDefault();
        setImportDragging(false);
        void handleBomImportFile(file);
      }}
    >
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="bom-total-a11y-announcer"
      >
        {bomTotalAnnouncement}
      </div>
      {importDragging && (
        <div
          style={{
            position: "absolute",
            inset: 8,
            zIndex: 20,
            pointerEvents: "none",
            border: "2px dashed var(--amber)",
            borderRadius: "var(--radius-lg)",
            background: "rgba(229, 160, 75, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--amber)",
            fontWeight: 700,
          }}
        >
          {t("bom.importDrop")}
        </div>
      )}
      <div style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(180deg, rgba(229,160,75,0.02) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('editor.materialList')}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.json,.xlsx"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleBomImportFile(file);
              }}
            />
            <button
              className="bom-print-btn no-print"
              onClick={() => fileInputRef.current?.click()}
              title={t('bom.importBom')}
              aria-label={t('bom.importBom')}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)", display: "inline-flex" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </button>
            <button
              className="bom-print-btn no-print"
              onClick={() => window.print()}
              title={t('editor.printBom')}
              aria-label={t('editor.printBom')}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--text-muted)", display: "inline-flex" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
            </button>
            <span className="label-mono no-print" style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {t('editor.bomRowCount', { count: bom.length, suffix: bom.length === 1 ? '' : (locale === 'fi' ? 'a' : 's') })}
            </span>
          </div>
        </div>
        <div style={{
          padding: "14px 16px",
          background: "var(--bg-tertiary)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
        }}>
          <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
            {t('editor.estimatedTotal')}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
              {animatedTotal > 0 ? Math.round(animatedTotal).toLocaleString(locale, { maximumFractionDigits: 0 }) : '0'}
            </span>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}>&euro;</span>
            {total > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {t('editor.inclVat')}
              </span>
            )}
          </div>
        </div>
        {importError && (
          <div
            role="alert"
            style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              background: "rgba(239, 68, 68, 0.08)",
              color: "var(--danger)",
              fontSize: 12,
            }}
          >
            {importError}
          </div>
        )}
        {projectId && onImportBom && (
          <PhotoEstimatePanel
            projectId={projectId}
            projectName={projectName}
            buildingInfo={buildingInfo}
            onImportBom={onImportBom}
          />
        )}
        <PermitCheckerPanel buildingInfo={buildingInfo} />
        {bom.length > 0 && (
          <div className="package-switcher" data-has-choices={hasPackageChoices}>
            <div className="package-switcher-head">
              <div>
                <div className="label-mono package-switcher-label">{t("bom.packageSwitcher")}</div>
                <div className="package-switcher-desc">
                  {hasPackageChoices ? t("bom.packageSwitcherDesc") : t("bom.packageNoAlternatives")}
                </div>
              </div>
              {packageDelta !== null && (
                <div
                  key={packageFlashKey}
                  className="package-delta-flash"
                  data-positive={packageDelta > 0}
                >
                  {packageDelta > 0 ? "+" : ""}
                  {formatPackageCurrency(packageDelta, locale)}
                </div>
              )}
            </div>

            <div className="package-tier-grid" role="radiogroup" aria-label={t("bom.packageSwitcher")}>
              {packageSummaries.map((summary) => {
                const isActive = activePackage === summary.tier.id;
                const isDisabled = !onReplaceMaterial || summary.changedCount === 0;
                return (
                  <button
                    key={summary.tier.id}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className="package-tier-card"
                    data-active={isActive}
                    disabled={isDisabled}
                    onClick={() => applyPackage(summary.tier.id)}
                  >
                    <span className="package-tier-name" style={{ color: summary.tier.tone }}>
                      {t(summary.tier.labelKey)}
                    </span>
                    <span className="package-tier-total">
                      {formatPackageCurrency(summary.total, locale)}
                    </span>
                    <span className="package-tier-delta" data-positive={summary.delta > 0}>
                      {summary.delta > 0 ? "+" : ""}
                      {formatPackageCurrency(summary.delta, locale)}
                    </span>
                    <span className="package-tier-changes">
                      {t("bom.packageChanges", { count: summary.changedCount })}
                    </span>
                  </button>
                );
              })}
            </div>

            {activePackageSummary && (
              <div className="package-switcher-foot">
                <span>
                  {t("bom.packageLocked", { count: lockedPackageMaterials.size })}
                </span>
                <span>
                  {t("bom.packageCurrent")}: {t(activePackageSummary.tier.labelKey)}
                </span>
              </div>
            )}
          </div>
        )}
        {bom.length > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 11,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--text-muted)" }}>
                {t("bom.stockSummary", { available: stockSummary.available, total: stockSummary.total })}
              </span>
              <span
                style={{
                  color: stockSummary.outOfStock > 0 ? "var(--danger)" : stockSummary.known > 0 ? "var(--success)" : "var(--text-muted)",
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {stockSummary.outOfStock > 0
                  ? t("bom.outOfStockCount", { count: stockSummary.outOfStock })
                  : stockSummary.known > 0
                    ? t("bom.inStock")
                    : t("bom.stockUnknown")}
              </span>
            </div>
            <div
              style={{
                marginTop: 6,
                height: 4,
                borderRadius: 999,
                overflow: "hidden",
                background: "rgba(0,0,0,0.08)",
              }}
            >
              <div
                style={{
                  width: `${stockSummary.total > 0 ? Math.round((stockSummary.available / stockSummary.total) * 100) : 0}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: stockSummary.outOfStock > 0 ? "var(--amber)" : "var(--success)",
                }}
              />
            </div>
          </div>
        )}
        {stockSummary.outOfStock > 0 && (
          <div
            style={{
              marginTop: 8,
              padding: "7px 10px",
              background: "rgba(239, 68, 68, 0.06)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "var(--radius-sm)",
              color: "var(--danger)",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {t("bom.stockWarning", { count: stockSummary.outOfStock })}
          </div>
        )}
        {totalSavings > 0 && (
          <div
            title={t('pricing.savingsTooltip')}
            style={{
              marginTop: 8,
              padding: "6px 10px",
              background: "rgba(74, 124, 89, 0.08)",
              border: "1px solid rgba(74, 124, 89, 0.2)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 11,
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>
              {t('pricing.savingsLabel')}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              color: "var(--success)",
            }}>
              -{totalSavings.toFixed(2)} &euro;
            </span>
          </div>
        )}
        {bom.length > 0 && projectId && (
          <MaterialTrendDashboard projectId={projectId} bomSignature={materialTrendSignature} />
        )}
        {bom.length > 0 && (
          <BomSavingsPanel
            bom={bom}
            materials={materials}
            onApplySupplierPrice={onApplySupplierPrice}
            onReplaceMaterial={onReplaceMaterial}
            onCompareMaterial={(id, name) => setCompareMaterial({ id, name })}
            onOpenMaterialPicker={(id) => {
              if (onReplaceMaterial) setMaterialPickerId(id);
            }}
          />
        )}
        {bom.length > 0 && total > 0 && (
          <CostBreakdownChart bom={bom} materials={materials} total={total} />
        )}
        {bom.length > 0 && (
          <QuoteSummary bom={bom} materials={materials} />
        )}
        {bom.length > 0 && (
          <RenovationCostIndexPanel />
        )}
        {bom.length > 0 && (
          <HouseholdDeductionPanel
            bom={bom}
            materials={materials}
            coupleMode={householdDeductionJoint}
            onCoupleModeChange={onHouseholdDeductionJointChange || (() => undefined)}
          />
        )}
        {bom.length > 0 && (
          <RenovationRoiPanel
            bom={bom}
            materials={materials}
            buildingInfo={buildingInfo}
            coupleMode={householdDeductionJoint}
          />
        )}
        <button
          type="button"
          onClick={() => setQuoteRequestOpen(true)}
          disabled={bom.length === 0 || !projectId}
          aria-label={t("quoteRequest.open")}
          title={bom.length === 0 ? t("quoteRequest.emptyDisabled") : t("quoteRequest.open")}
          style={{
            marginTop: 10,
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "9px 12px",
            fontSize: 12,
            fontWeight: 600,
            color: bom.length === 0 || !projectId ? "var(--text-muted)" : "var(--bg-primary)",
            background: bom.length === 0 || !projectId ? "var(--bg-tertiary)" : "var(--amber)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            cursor: bom.length === 0 || !projectId ? "not-allowed" : "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
          {t("quoteRequest.open")}
        </button>
        {bom.length > 0 && total > 0 && heatingGrantOpportunity.shouldShow && (
          <SubsidyCalculator
            totalCost={total}
            buildingInfo={buildingInfo}
            triggeredByScene={heatingGrantOpportunity.triggeredByScene}
            detectedTargetHeating={heatingGrantOpportunity.detectedTargetHeating}
          />
        )}
        {bom.length > 0 && projectId && (
          <WasteEstimatePanel projectId={projectId} bomCount={bom.length} buildingInfo={buildingInfo} />
        )}
        {projectId && (
          <RyhtiSubmissionPanel projectId={projectId} bomCount={bom.length} buildingInfo={buildingInfo} />
        )}
        {bom.length > 0 && (
          <button
            onClick={() => {
              const date = new Date().toISOString().slice(0, 10);
              const safeName = (projectName || 'project').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_äöåÄÖÅ]/g, '');
              const filename = `helscoop-bom-${safeName}-${date}.csv`;
              const csv = generateBomCsv(bom, materials, locale, t);
              downloadCsv(csv, filename);
            }}
            aria-label={t('bom.exportCsv')}
            style={{
              marginTop: 10,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--font-body)",
              color: "var(--text-secondary)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-secondary)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            {t('bom.exportCsv')}
          </button>
        )}
        {bom.length > 0 && (
          <button
            onClick={() => setShowShoppingList(true)}
            aria-label={t('shoppingList.title')}
            style={{
              marginTop: 6,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 500,
              fontFamily: "var(--font-body)",
              color: "var(--text-secondary)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-secondary)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-tertiary)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {t('shoppingList.title')}
          </button>
        )}
      </div>

      {showShoppingList && (
        <ShoppingListModal
          bom={bom}
          materials={materials}
          projectName={projectName}
          onClose={() => setShowShoppingList(false)}
        />
      )}

      {/* Scene material sync banner */}
      {unmatchedSceneMaterials.length > 0 && unmatchedSceneMaterials.some((u) => u.matched) && (
        <div
          style={{
            margin: "0 12px 4px",
            padding: "8px 10px",
            background: "var(--amber-glow)",
            border: "1px solid var(--amber-border)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            animation: "fadeIn 0.2s ease both",
          }}
        >
          <span style={{ color: "var(--text-secondary)", lineHeight: 1.4 }}>
            {t('editor.sceneMaterialsDetected', {
              count: unmatchedSceneMaterials.filter((u) => u.matched).length,
            }) || `${unmatchedSceneMaterials.filter((u) => u.matched).length} scene materials not in BOM`}
          </span>
          <button
            onClick={handleSyncFromScene}
            style={{
              background: "none",
              border: "1px solid var(--amber-border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--amber)",
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-body)",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--amber-glow)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            {t('editor.syncFromScene')}
          </button>
        </div>
      )}

      <div className="bom-list" role="grid" aria-label={t('editor.materialList')}>
        {bom.length === 0 ? (
          <div className="bom-empty anim-up">
            <div className="bom-empty-icon">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="8" width="20" height="20" rx="2" />
                <path d="M6 14h20" />
                <rect x="10" y="18" width="5" height="4" rx="0.5" />
                <rect x="17" y="18" width="5" height="4" rx="0.5" />
                <rect x="10" y="24" width="5" height="2" rx="0.5" />
                <path d="M13 8V5M19 8V5" />
              </svg>
            </div>
            <div className="bom-empty-title">
              {t('editor.noMaterials')}
            </div>
            <div className="bom-empty-hint">
              {t('editor.noMaterialsHint')}
            </div>
            <button
              className="bom-empty-cta"
              onClick={() => {
                const searchInput = document.querySelector<HTMLInputElement>('[data-bom-search]');
                if (searchInput) searchInput.focus();
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {t('editor.noMaterialsCta')}
            </button>
          </div>
        ) : (
          bom.map((item, idx) => (
            <BomItemCard
              key={item.material_id}
              item={item}
              materials={materials}
              locale={locale}
              index={idx}
              isFocused={focusedBomIndex === idx}
              onRequestRemove={setPendingDelete}
              onUpdateQty={onUpdateQty}
              onCompare={(id, name) => setCompareMaterial({ id, name })}
              onNavigate={(dir) => handleBomNavigate(idx, dir)}
              onFocusIndex={setFocusedBomIndex}
              isPackageLocked={lockedPackageMaterials.has(item.material_id)}
              isPriceWatched={priceWatchByMaterial.has(item.material_id)}
              isPriceWatchBusy={priceWatchBusyId === item.material_id}
              hasSubstitutionSuggestion={substitutionSuggestionIds.has(item.material_id)}
              onTogglePackageLock={togglePackageLock}
              onTogglePriceWatch={projectId ? togglePriceWatch : undefined}
              onOpenMaterialPicker={(id) => {
                if (onReplaceMaterial) setMaterialPickerId(id);
              }}
              onUpdateNote={onUpdateNote}
              onDragStart={onReorder ? setDragFrom : undefined}
              onDragOver={onReorder ? setDragOver : undefined}
              onDragEnd={onReorder ? () => {
                if (dragFrom !== null && dragOver !== null && dragFrom !== dragOver) {
                  onReorder(dragFrom, dragOver);
                }
                setDragFrom(null);
                setDragOver(null);
              } : undefined}
              isDragTarget={dragOver === idx}
            />
          ))
        )}
      </div>

      {/* Material browser section */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "10px 12px 0" }}>
          <div
            className="label-mono"
            style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}
          >
            {keskoMode ? t('pricing.keskoLive') : t('pricing.browseMaterials')}
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              className="category-chip"
              data-active={!keskoMode}
              aria-pressed={!keskoMode}
              onClick={() => {
                setKeskoMode(false);
                setKeskoError(null);
              }}
            >
              {t("pricing.localCatalog")}
            </button>
            <button
              type="button"
              className="category-chip"
              data-active={keskoMode}
              aria-pressed={keskoMode}
              onClick={() => setKeskoMode(true)}
            >
              {t("pricing.keskoLive")}
            </button>
          </div>

          {/* Search input */}
          <div style={{ position: "relative", marginBottom: 8 }}>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (keskoMode && e.key === "Enter") {
                  e.preventDefault();
                  void handleKeskoSearch();
                }
              }}
              placeholder={t('pricing.searchMaterials')}
              aria-label={t('pricing.searchMaterials')}
              data-bom-search
              style={{
                width: "100%",
                padding: keskoMode ? "7px 86px 7px 28px" : "7px 8px 7px 28px",
                background: "var(--bg-tertiary)",
                border: searchFocused ? "1px solid var(--amber)" : "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                color: "var(--text-primary)",
                outline: searchFocused ? "1px solid var(--amber)" : "none",
                outlineOffset: "-1px",
              }}
            />
            {keskoMode && (
              <button
                type="button"
                onClick={handleKeskoSearch}
                disabled={keskoLoading}
                style={{
                  position: "absolute",
                  right: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "4px 8px",
                  background: "var(--amber)",
                  color: "var(--bg-primary)",
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: keskoLoading ? "wait" : "pointer",
                  opacity: keskoLoading ? 0.7 : 1,
                }}
              >
                {keskoLoading ? t("pricing.searchingKesko") : t("pricing.searchKesko")}
              </button>
            )}
          </div>

          {keskoMode && (
            <div
              style={{
                marginBottom: 8,
                padding: "7px 9px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                background: keskoConfigured === false ? "rgba(229,160,75,0.08)" : "var(--bg-tertiary)",
                color: keskoError ? "var(--text-secondary)" : "var(--text-muted)",
                fontSize: 11,
                lineHeight: 1.35,
              }}
            >
              {keskoError || t("pricing.keskoHint")}
            </div>
          )}

          {/* Category filter tabs */}
          {!keskoMode && categories.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <button
                className="category-chip"
                data-active={!activeCategory}
                aria-pressed={!activeCategory}
                onClick={() => setActiveCategory("")}
              >
                {t('pricing.allCategories')}
              </button>
              {categories.map((cat) => {
                const catName = getCategoryDisplayName(cat);
                const isActive = activeCategory === cat.display_name;
                return (
                  <button
                    key={cat.id}
                    className="category-chip"
                    data-active={isActive}
                    aria-pressed={isActive}
                    onClick={() => setActiveCategory(isActive ? "" : cat.display_name)}
                  >
                    {catName}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Material cards list */}
        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            padding: "0 12px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {keskoMode ? (
            keskoLoading ? (
              <div style={{ textAlign: "center", padding: "16px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                {t("pricing.searchingKesko")}
              </div>
            ) : keskoProducts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                {keskoError || t("pricing.keskoNoSearchYet")}
              </div>
            ) : (
              keskoProducts.map((product) => {
                const stock = stockMeta(normalizeStockLevel(product.stockLevel), t);
                const alreadyInBom = bom.some((item) => item.material_id === product.materialId);
                const isAdding = keskoAddingId === product.id;
                const stockTitle = [
                  stock.label,
                  product.stockQuantity != null ? `${product.stockQuantity} ${localizeUnit(product.unit, t)}` : null,
                  product.storeLocation || product.storeName,
                  product.lastCheckedAt ? `${t("bom.lastChecked")}: ${new Date(product.lastCheckedAt).toLocaleDateString(locale)}` : null,
                ].filter(Boolean).join(" · ");
                return (
                  <div
                    key={product.id}
                    className="material-browse-card"
                    data-selected={alreadyInBom}
                    role="group"
                    aria-label={product.name}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          style={{ width: 30, height: 30, borderRadius: "var(--radius-sm)", objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: "var(--radius-sm)",
                            background: "linear-gradient(135deg, var(--amber), var(--forest))",
                            opacity: 0.35,
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {product.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            K-Rauta
                          </span>
                          {product.categoryName && (
                            <>
                              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>&middot;</span>
                              <span style={{
                                fontSize: 10,
                                color: "var(--text-muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {product.categoryName}
                              </span>
                            </>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <span
                            title={stockTitle}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              fontSize: 10,
                              color: "var(--text-muted)",
                            }}
                          >
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: stock.color,
                                flexShrink: 0,
                              }}
                            />
                            {stock.label}
                          </span>
                          {product.productUrl && (
                            <a
                              href={product.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ fontSize: 10, color: "var(--amber)", textDecoration: "none" }}
                            >
                              {t("pricing.viewProduct")}
                            </a>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--success)",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {product.unitPrice != null ? `${product.unitPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "--"}
                        </span>
                        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                          {localizeUnit(product.unit, t)} · {t("pricing.vatNote")}
                        </span>
                        <button
                          className="btn btn-primary"
                          disabled={alreadyInBom || isAdding || !onAddImported}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleKeskoImport(product);
                          }}
                          style={{
                            padding: "3px 9px",
                            fontSize: 11,
                            opacity: alreadyInBom || isAdding ? 0.65 : 1,
                            cursor: alreadyInBom || isAdding ? "default" : "pointer",
                          }}
                        >
                          {alreadyInBom ? t("pricing.added") : isAdding ? t("pricing.adding") : t("editor.add")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : availableMaterials.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 8px", color: "var(--text-muted)", fontSize: 12 }}>
              {t('pricing.noResults')}
            </div>
          ) : (
            availableMaterials.map((m) => {
              const price = getPrimaryPrice(m);
              const isSelected = quickAddId === m.id;
              const displayName = getLocalizedMaterialName(m, locale);
              const priceStockLevel = normalizeStockLevel(price?.stock_level);
              const priceStock = stockMeta(priceStockLevel, t);
              const priceStockTooltip = price ? stockTooltip(price, t, locale) : "";
              return (
                <div
                  key={m.id}
                  className="material-browse-card"
                  data-selected={isSelected}
                  role="button"
                  tabIndex={0}
                  aria-label={t('pricing.addMaterial', { name: displayName }) || `Add ${displayName} to BOM`}
                  aria-pressed={isSelected}
                  onClick={() => handleQuickAdd(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleQuickAdd(m.id);
                    }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {m.image_url ? (
                      <img
                        src={m.image_url}
                        alt={getLocalizedMaterialName(m, locale)}
                        style={{ width: 24, height: 24, borderRadius: "var(--radius-sm)", objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "var(--radius-sm)",
                          background: getCategoryColor(m.category_name, 0),
                          opacity: 0.3,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {getLocalizedMaterialName(m, locale)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
                        <span style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {locale === 'fi' && m.category_name_fi ? m.category_name_fi : m.category_name}
                        </span>
                        {price && (
                          <>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>&middot;</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                              {price.supplier_name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {price ? (
                      <span
                        title={priceStockTooltip}
                        aria-label={priceStockTooltip}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: priceStock.color,
                            boxShadow: "0 0 0 2px rgba(0,0,0,0.04)",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--success)",
                          fontVariantNumeric: "tabular-nums",
                        }}>
                          {Number(price.unit_price).toFixed(2)} &euro;
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                        --
                      </span>
                    )}
                  </div>

                  {/* Quick-add row: shown when this card is selected */}
                  {isSelected && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: "1px solid var(--border)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                        {t('pricing.setQuantity')}
                      </span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={quickAddQty}
                        onChange={(e) => setQuickAddQty(parseInt(e.target.value) || 1)}
                        autoFocus
                        aria-label={t('pricing.quickAddQuantity', { name: displayName }) || `Quantity for ${displayName}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onAdd(m.id, quickAddQty);
                            setQuickAddId(null);
                            setQuickAddQty(1);
                          }
                        }}
                        style={{
                          width: 52,
                          padding: "3px 6px",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius-sm)",
                          fontSize: 12,
                          color: "var(--text-primary)",
                          outline: "none",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      {price && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {localizeUnit(price.unit, t)}
                        </span>
                      )}
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          onAdd(m.id, quickAddQty);
                          setQuickAddId(null);
                          setQuickAddQty(1);
                        }}
                        style={{
                          marginLeft: "auto",
                          padding: "3px 10px",
                          fontSize: 11,
                        }}
                      >
                        {t('editor.add')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {importPreview.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bom-import-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              width: "min(760px, 100%)",
              maxHeight: "82vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h3 id="bom-import-title" style={{ margin: 0, fontSize: 16 }}>{t("bom.importPreview")}</h3>
                <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
                  {t("bom.importMatched", { resolved: resolvedImportCount, total: importPreview.length })}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setImportPreview([])}
                aria-label={t("dialog.close")}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", gap: 10, flexWrap: "wrap" }}>
              {(["merge", "replace"] as BomImportMode[]).map((mode) => (
                <label
                  key={mode}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  <input
                    type="radio"
                    name="bom-import-mode"
                    checked={importMode === mode}
                    onChange={() => setImportMode(mode)}
                  />
                  {t(mode === "merge" ? "bom.importMerge" : "bom.importReplace")}
                </label>
              ))}
              {unresolvedImportCount > 0 && (
                <span className="badge badge-warning">
                  {t("bom.importUnmatched", { count: unresolvedImportCount })}
                </span>
              )}
            </div>

            <div style={{ overflow: "auto", padding: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{t("bom.importedRow")}</th>
                    <th style={{ textAlign: "left", padding: "8px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{t("bom.quantity")}</th>
                    <th style={{ textAlign: "left", padding: "8px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{t("bom.matchedMaterial")}</th>
                    <th style={{ textAlign: "left", padding: "8px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{t("bom.confidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ fontWeight: 600 }}>{row.imported.materialKey}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                          {t("bom.row")} {row.imported.rowNumber}
                        </div>
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}>
                        {row.imported.quantity} {row.imported.unit}
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
                        <select
                          className="input"
                          value={row.matchedMaterialId ?? ""}
                          onChange={(event) => {
                            const value = event.target.value || null;
                            setImportPreview((prev) =>
                              prev.map((candidate) =>
                                candidate.id === row.id
                                  ? { ...candidate, matchedMaterialId: value, confidence: value ? 100 : 0 }
                                  : candidate
                              )
                            );
                          }}
                          aria-label={t("bom.matchedMaterial")}
                          style={{ width: "100%", padding: "6px 8px", fontSize: 12 }}
                        >
                          <option value="">{t("bom.chooseMaterial")}</option>
                          {materials.map((material) => (
                            <option key={material.id} value={material.id}>
                              {getLocalizedMaterialName(material, locale)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "8px", borderBottom: "1px solid var(--border)" }}>
                        <span className={`badge ${row.matchedMaterialId ? "badge-forest" : "badge-warning"}`}>
                          {row.matchedMaterialId ? `${row.confidence}%` : t("bom.unmatched")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setImportPreview([])}>
                {t("dialog.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={unresolvedImportCount > 0 || !onImportBom}
                onClick={handleBomImportConfirm}
              >
                {t("bom.importApply")}
              </button>
            </div>
          </div>
        </div>
      )}

      {(() => {
        const pickerItem = materialPickerId ? bom.find((item) => item.material_id === materialPickerId) : null;
        if (!pickerItem || !onReplaceMaterial) return null;
        return (
          <MaterialPicker
            currentMaterialId={pickerItem.material_id}
            bomItem={pickerItem}
            materials={materials}
            disabledMaterialIds={new Set(bom.map((item) => item.material_id).filter((id) => id !== pickerItem.material_id))}
            onClose={() => setMaterialPickerId(null)}
            onSelect={(toMaterialId) => onReplaceMaterial(pickerItem.material_id, toMaterialId)}
          />
        );
      })()}

      {projectId && (
        <QuoteRequestModal
          open={quoteRequestOpen}
          projectId={projectId}
          projectName={projectName || t("project.emptyTitle")}
          projectDescription={projectDescription}
          buildingInfo={buildingInfo}
          bom={bom}
          totalCost={total}
          onClose={() => setQuoteRequestOpen(false)}
        />
      )}

      {/* Price comparison popup */}
      {compareMaterial && (
        <PriceComparisonPopup
          materialId={compareMaterial.id}
          materialName={compareMaterial.name}
          onClose={() => setCompareMaterial(null)}
        />
      )}

      {/* BOM item delete confirmation dialog */}
      {(() => {
        const pendingItem = pendingDelete ? bom.find((b) => b.material_id === pendingDelete) : null;
        const pendingName = pendingItem
          ? getLocalizedBomItemName(pendingItem, materials, locale)
          : "";
        return (
          <ConfirmDialog
            open={pendingDelete !== null}
            title={t("dialog.deleteBomItemTitle")}
            message={t("dialog.deleteBomItemMessage", { name: pendingName })}
            confirmText={t("project.delete")}
            cancelText={t("dialog.cancel")}
            variant="danger"
            onConfirm={() => {
              if (pendingDelete) onRemove(pendingDelete);
              setPendingDelete(null);
            }}
            onCancel={() => setPendingDelete(null)}
          />
        );
      })()}
    </div>
  );
}

/* ── Exported pure functions for unit testing ──────────────── */
export {
  getLocalizedMaterialName,
  getLocalizedBomItemName,
  localizeUnit,
  getCategoryColor,
  matchSceneMaterial,
  computeTrend,
  designToPurchasable,
  getVatRate,
  VAT_RATES,
  CATEGORY_COLORS,
  FALLBACK_COLORS,
  MATERIAL_ALIASES,
};
