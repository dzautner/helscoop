"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import type { BomItem, Material, MaterialPriceData, Category } from "@/types";

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

/* ── Donut chart sub-component ──────────────────────────────── */
interface CategorySlice {
  name: string;
  total: number;
  pct: number;
  color: string;
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
  const { t } = useTranslation();

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

  let cumDeg = 0;
  const stops: string[] = [];
  for (const s of slices) {
    const deg = (s.pct / 100) * 360;
    stops.push(`${s.color} ${cumDeg}deg ${cumDeg + deg}deg`);
    cumDeg += deg;
  }
  const gradient = `conic-gradient(${stops.join(", ")})`;

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
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Donut */}
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: "50%",
            background: gradient,
            position: "relative",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 22,
              borderRadius: "50%",
              background: "var(--bg-tertiary)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="heading-display"
              style={{ fontSize: 16, lineHeight: 1.1, color: "var(--text-primary)" }}
            >
              {total.toLocaleString("fi-FI", { maximumFractionDigits: 0 })}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>&euro;</span>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: 1 }}>
          {slices.map((s) => (
            <div
              key={s.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: s.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
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
                }}
              >
                {s.pct.toFixed(0)}% &middot; {s.total.toLocaleString("fi-FI", { maximumFractionDigits: 0 })}&euro;
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    api.getMaterialPrices(materialId)
      .then((data: MaterialPriceData) => {
        setPriceData(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [materialId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
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
          width: 440,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{t('pricing.compareTitle')}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{materialName}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, padding: "4px 8px", lineHeight: 1 }}
          >
            x
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
              {t('pricing.loading')}
            </div>
          ) : !priceData || priceData.prices.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
              {t('pricing.noSuppliers')}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {priceData.prices.map((price, idx) => {
                const isCheapest = idx === 0;
                const unitPrice = parseFloat(price.unit_price);
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
                      </div>
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 14,
                        fontWeight: 600,
                        color: isCheapest ? "var(--success)" : "var(--text-primary)",
                      }}>
                        {unitPrice.toFixed(2)} EUR
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                        <span>{price.unit} {t('pricing.perUnit')}</span>
                        {price.sku && <span>SKU: {price.sku}</span>}
                        {price.last_scraped_at && (
                          <span>{t('pricing.lastChecked')}: {new Date(price.last_scraped_at).toLocaleDateString()}</span>
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
              -{priceData.savings_per_unit.toFixed(2)} EUR {t('pricing.perUnit')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BomPanel({
  bom,
  materials,
  onAdd,
  onRemove,
  onUpdateQty,
}: {
  bom: BomItem[];
  materials: Material[];
  onAdd: (materialId: string, qty: number) => void;
  onRemove: (materialId: string) => void;
  onUpdateQty: (materialId: string, qty: number) => void;
}) {
  const [compareMaterial, setCompareMaterial] = useState<{ id: string; name: string } | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [totalSavings, setTotalSavings] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [quickAddId, setQuickAddId] = useState<string | null>(null);
  const [quickAddQty, setQuickAddQty] = useState(1);
  const { t, locale } = useTranslation();

  const total = bom.reduce((sum, item) => sum + Number(item.total || 0), 0);

  // Fetch categories on mount
  useEffect(() => {
    api.getCategories()
      .then((data: Category[]) => setCategories(data))
      .catch(() => { /* ignore */ });
  }, []);

  // Calculate potential savings across all BOM items
  useEffect(() => {
    if (bom.length === 0) {
      setTotalSavings(0);
      return;
    }
    let cancelled = false;
    async function calcSavings() {
      const promises = bom.map(async (item) => {
        try {
          const data: MaterialPriceData = await api.getMaterialPrices(item.material_id);
          if (data.savings_per_unit > 0) {
            return data.savings_per_unit * item.quantity;
          }
        } catch {
          // ignore errors
        }
        return 0;
      });
      const results = await Promise.all(promises);
      if (!cancelled) {
        const savings = results.reduce((a, b) => a + b, 0);
        setTotalSavings(savings);
      }
    }
    calcSavings();
    return () => { cancelled = true; };
  }, [bom]);

  // Filter materials: exclude already-in-BOM, match search query, match category
  const availableMaterials = useMemo(() => {
    return materials
      .filter((m) => !bom.some((b) => b.material_id === m.id))
      .filter((m) => {
        if (!materialSearch.trim()) return true;
        const q = materialSearch.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.category_name.toLowerCase().includes(q);
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

  return (
    <div
      className="editor-bom-panel"
    >
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('editor.materialList')}</h3>
          <span className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {t('editor.bomRowCount', { count: bom.length, suffix: bom.length === 1 ? '' : (locale === 'fi' ? 'a' : 's') })}
          </span>
        </div>
        <div style={{
          padding: "14px 16px",
          background: "linear-gradient(135deg, rgba(196,145,92,0.12) 0%, rgba(196,145,92,0.04) 100%)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--amber-border)",
        }}>
          <div className="label-mono" style={{ fontSize: 10, color: "var(--amber)", marginBottom: 6 }}>
            {t('editor.estimatedTotal')}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="heading-display" style={{ fontSize: 24, color: "var(--text-primary)" }}>
              {total > 0 ? total.toLocaleString('fi-FI', { maximumFractionDigits: 0 }) : '0'}
            </span>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}>&euro;</span>
            {total > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {t('editor.inclVat')}
              </span>
            )}
          </div>
        </div>
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
              -{totalSavings.toFixed(2)} EUR
            </span>
          </div>
        )}
        {bom.length > 0 && total > 0 && (
          <CostBreakdownChart bom={bom} materials={materials} total={total} />
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {bom.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {t('editor.noMaterials')}
            </div>
          </div>
        ) : (
          bom.map((item) => (
            <div
              key={item.material_id}
              style={{
                padding: "12px 14px",
                background: "var(--bg-tertiary)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 6,
                fontSize: 13,
                border: "1px solid var(--border)",
                cursor: "pointer",
                transition: "border-color 0.15s ease",
              }}
              onClick={() => setCompareMaterial({ id: item.material_id, name: item.material_name || item.material_id })}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--amber-border)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.material_name || ""}
                      style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: "var(--bg-elevated)", flexShrink: 0 }} />
                  )}
                  <strong style={{ fontSize: 13, fontWeight: 500 }}>{item.material_name}</strong>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(item.material_id); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--danger)",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "0 4px",
                    opacity: 0.6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
                >
                  x
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={item.quantity}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    onUpdateQty(item.material_id, parseFloat(e.target.value) || 0)
                  }
                  style={{
                    width: 56,
                    padding: "4px 6px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "var(--text-primary)",
                    outline: "none",
                    fontFamily: "var(--font-mono)",
                  }}
                />
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {item.unit} x {Number(item.unit_price || 0).toFixed(2)}
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 600, color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {Number(item.total || 0).toFixed(2)}
                </span>
              </div>
              {item.supplier && (
                <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                  {item.supplier}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              )}
            </div>
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
            {t('pricing.browseMaterials')}
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
              placeholder={t('pricing.searchMaterials')}
              style={{
                width: "100%",
                padding: "7px 8px 7px 28px",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* Category filter tabs */}
          {categories.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
                marginBottom: 8,
              }}
            >
              <button
                onClick={() => setActiveCategory("")}
                style={{
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 500,
                  border: "1px solid",
                  borderColor: !activeCategory ? "var(--amber-border)" : "var(--border)",
                  borderRadius: 12,
                  background: !activeCategory ? "rgba(196,145,92,0.12)" : "transparent",
                  color: !activeCategory ? "var(--amber)" : "var(--text-muted)",
                  cursor: "pointer",
                  transition: "all 0.12s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {t('pricing.allCategories')}
              </button>
              {categories.map((cat) => {
                const catName = getCategoryDisplayName(cat);
                const isActive = activeCategory === cat.display_name;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(isActive ? "" : cat.display_name)}
                    style={{
                      padding: "3px 8px",
                      fontSize: 10,
                      fontWeight: 500,
                      border: "1px solid",
                      borderColor: isActive ? "var(--amber-border)" : "var(--border)",
                      borderRadius: 12,
                      background: isActive ? "rgba(196,145,92,0.12)" : "transparent",
                      color: isActive ? "var(--amber)" : "var(--text-muted)",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                      whiteSpace: "nowrap",
                    }}
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
          {availableMaterials.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 8px", color: "var(--text-muted)", fontSize: 12 }}>
              {t('pricing.noResults')}
            </div>
          ) : (
            availableMaterials.map((m) => {
              const price = getPrimaryPrice(m);
              const isSelected = quickAddId === m.id;
              return (
                <div
                  key={m.id}
                  style={{
                    padding: "8px 10px",
                    background: isSelected ? "rgba(196,145,92,0.08)" : "var(--bg-tertiary)",
                    border: isSelected ? "1px solid var(--amber-border)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                  }}
                  onClick={() => handleQuickAdd(m.id)}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--amber-border)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {m.image_url ? (
                      <img
                        src={m.image_url}
                        alt={m.name}
                        style={{ width: 24, height: 24, borderRadius: 3, objectFit: "cover", flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 3,
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
                        {m.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
                        <span style={{
                          fontSize: 10,
                          color: "var(--text-muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          {m.category_name}
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
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--success)",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}>
                        {Number(price.unit_price).toFixed(2)} &euro;
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
                          borderRadius: 4,
                          fontSize: 12,
                          color: "var(--text-primary)",
                          outline: "none",
                          fontFamily: "var(--font-mono)",
                        }}
                      />
                      {price && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {price.unit}
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

      {/* Price comparison popup */}
      {compareMaterial && (
        <PriceComparisonPopup
          materialId={compareMaterial.id}
          materialName={compareMaterial.name}
          onClose={() => setCompareMaterial(null)}
        />
      )}
    </div>
  );
}
