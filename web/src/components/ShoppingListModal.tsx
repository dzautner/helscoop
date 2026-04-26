"use client";

import { useMemo, useCallback, useRef } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { BomItem, Material } from "@/types";

interface ShoppingListModalProps {
  bom: BomItem[];
  materials: Material[];
  projectName?: string;
  onClose: () => void;
}

interface SupplierGroup {
  supplier: string;
  items: {
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
    link: string | null;
  }[];
  subtotal: number;
}

export default function ShoppingListModal({
  bom,
  materials,
  projectName,
  onClose,
}: ShoppingListModalProps) {
  const { t, locale } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);
  const localeTag = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";

  const supplierGroups = useMemo(() => {
    const materialMap = new Map(materials.map((m) => [m.id, m]));
    const groups = new Map<string, SupplierGroup>();

    for (const item of bom) {
      const mat = materialMap.get(item.material_id);
      const pricing = mat?.pricing?.find((p) => p.is_primary) ?? mat?.pricing?.[0];
      const supplier = pricing?.supplier_name ?? item.supplier ?? t("shoppingList.otherSupplier");
      const unitPrice = item.unit_price ?? pricing?.unit_price ?? 0;
      const total = unitPrice * item.quantity;
      const link = pricing?.link ?? null;
      const name = item.material_name ?? mat?.name ?? item.material_id;

      if (!groups.has(supplier)) {
        groups.set(supplier, { supplier, items: [], subtotal: 0 });
      }
      const group = groups.get(supplier)!;
      group.items.push({ name, quantity: item.quantity, unit: item.unit, unitPrice, total, link });
      group.subtotal += total;
    }

    return Array.from(groups.values()).sort((a, b) => b.subtotal - a.subtotal);
  }, [bom, materials, t]);

  const grandTotal = useMemo(
    () => supplierGroups.reduce((sum, g) => sum + g.subtotal, 0),
    [supplierGroups],
  );

  const formatPrice = useCallback(
    (value: number) =>
      value.toLocaleString(localeTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €",
    [localeTag],
  );

  const handleCopy = useCallback(async () => {
    const lines: string[] = [];
    if (projectName) lines.push(projectName);
    lines.push("─".repeat(40));
    for (const group of supplierGroups) {
      lines.push("");
      lines.push(`📦 ${group.supplier}`);
      for (const item of group.items) {
        lines.push(`  ${item.name} × ${item.quantity} ${item.unit} — ${formatPrice(item.total)}`);
      }
      lines.push(`  ${t("shoppingList.subtotal")}: ${formatPrice(group.subtotal)}`);
    }
    lines.push("");
    lines.push(`${t("shoppingList.grandTotal")}: ${formatPrice(grandTotal)}`);
    await copyTextToClipboard(lines.join("\n"));
  }, [supplierGroups, grandTotal, projectName, formatPrice, t]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="shopping-list-overlay" onClick={onClose}>
      <div
        className="shopping-list-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("shoppingList.title")}
      >
        <div className="shopping-list-header">
          <h2 className="shopping-list-title">{t("shoppingList.title")}</h2>
          <div className="shopping-list-actions">
            <button className="shopping-list-action-btn" onClick={handleCopy} title={t("shoppingList.copy")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {t("shoppingList.copy")}
            </button>
            <button className="shopping-list-action-btn" onClick={handlePrint} title={t("shoppingList.print")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              {t("shoppingList.print")}
            </button>
            <button className="shopping-list-close-btn" onClick={onClose} aria-label={t("shoppingList.close")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="shopping-list-content" ref={contentRef}>
          {projectName && <div className="shopping-list-project-name">{projectName}</div>}

          {supplierGroups.map((group) => (
            <div key={group.supplier} className="shopping-list-supplier-group">
              <div className="shopping-list-supplier-header">
                <span className="shopping-list-supplier-name">{group.supplier}</span>
                <span className="shopping-list-supplier-subtotal">{formatPrice(group.subtotal)}</span>
              </div>
              <div className="shopping-list-items">
                {group.items.map((item, i) => (
                  <div key={i} className="shopping-list-item">
                    <div className="shopping-list-item-name">
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noopener noreferrer">
                          {item.name}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4, verticalAlign: "middle" }}>
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      ) : (
                        item.name
                      )}
                    </div>
                    <div className="shopping-list-item-qty">
                      {item.quantity} {item.unit}
                    </div>
                    <div className="shopping-list-item-price">{formatPrice(item.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="shopping-list-grand-total">
            <span>{t("shoppingList.grandTotal")}</span>
            <span>{formatPrice(grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
