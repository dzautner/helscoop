"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import type { BomItem, Material, MaterialPriceData } from "@/types";

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
  const [selectedMat, setSelectedMat] = useState("");
  const [qty, setQty] = useState(1);
  const [compareMaterial, setCompareMaterial] = useState<{ id: string; name: string } | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [totalSavings, setTotalSavings] = useState(0);
  const { t, locale } = useTranslation();

  const total = bom.reduce((sum, item) => sum + (item.total || 0), 0);

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

  // Filter materials for the add dropdown
  const availableMaterials = materials
    .filter((m) => !bom.some((b) => b.material_id === m.id))
    .filter((m) => {
      if (!materialSearch.trim()) return true;
      const q = materialSearch.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.category_name.toLowerCase().includes(q);
    });

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
        {/* Cost savings indicator */}
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
                  {item.unit} x {(item.unit_price || 0).toFixed(2)}
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 600, color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {(item.total || 0).toFixed(2)}
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

      {/* Add material section with search */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <input
          type="text"
          value={materialSearch}
          onChange={(e) => setMaterialSearch(e.target.value)}
          placeholder={t('pricing.searchMaterials')}
          style={{
            width: "100%",
            padding: "7px 8px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={selectedMat}
            onChange={(e) => setSelectedMat(e.target.value)}
            style={{
              flex: 1,
              padding: "7px 8px",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              color: "var(--text-primary)",
              outline: "none",
            }}
          >
            <option value="">{t('editor.addMaterial')}</option>
            {availableMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(parseInt(e.target.value) || 1)}
            style={{
              width: 48,
              padding: "7px 6px",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              color: "var(--text-primary)",
              outline: "none",
              fontFamily: "var(--font-mono)",
            }}
          />
          <button
            className={`btn ${selectedMat ? "btn-primary" : ""}`}
            onClick={() => {
              if (selectedMat) {
                onAdd(selectedMat, qty);
                setSelectedMat("");
                setQty(1);
                setMaterialSearch("");
              }
            }}
            disabled={!selectedMat}
            style={{
              padding: "7px 14px",
              fontSize: 12,
              opacity: selectedMat ? 1 : 0.4,
            }}
          >
            {t('editor.add')}
          </button>
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
