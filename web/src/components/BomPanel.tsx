"use client";

import { useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { BomItem, Material } from "@/types";

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
  const { t } = useTranslation();

  const total = bom.reduce((sum, item) => sum + (item.total || 0), 0);

  return (
    <div
      style={{
        width: 360,
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{t('editor.materialList')}</h3>
          <span className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {bom.length} {bom.length === 1 ? 'rivi' : 'rivia'}
          </span>
        </div>
        <div style={{
          padding: "14px 16px",
          background: "linear-gradient(135deg, rgba(196,145,92,0.12) 0%, rgba(196,145,92,0.04) 100%)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--amber-border)",
        }}>
          <div className="label-mono" style={{ fontSize: 10, color: "var(--amber)", marginBottom: 6 }}>
            ARVIOITU KOKONAISHINTA
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span className="heading-display" style={{ fontSize: 24, color: "var(--text-primary)" }}>
              {total > 0 ? total.toLocaleString('fi-FI', { maximumFractionDigits: 0 }) : '0'}
            </span>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}>&euro;</span>
            {total > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                sis. ALV 25.5%
              </span>
            )}
          </div>
        </div>
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
              }}
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
                  onClick={() => onRemove(item.material_id)}
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
                <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 6 }}>
                  {item.supplier}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          padding: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
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
          {materials
            .filter((m) => !bom.some((b) => b.material_id === m.id))
            .map((m) => (
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
  );
}
