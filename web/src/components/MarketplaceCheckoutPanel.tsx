"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import { buildAffiliateRetailerUrl } from "@/lib/material-affiliate";
import type {
  BomItem,
  MarketplaceOrder,
  MarketplaceSupplierCheckoutInput,
  Material,
  StockLevel,
} from "@/types";

interface MarketplaceCheckoutPanelProps {
  projectId: string;
  bom: BomItem[];
  materials: Material[];
}

interface CartLine {
  material_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  link: string | null;
  stock_level: StockLevel;
}

interface CartGroup {
  key: string;
  supplier_id: string | null;
  supplier_name: string;
  subtotal: number;
  estimated_commission_amount: number;
  checkout_url: string | null;
  lines: CartLine[];
  shoppable_lines: number;
}

type PanelLocale = "fi" | "en" | "sv";
type PanelCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  coverage: string;
  retailers: string;
  commission: string;
  missing: string;
  selectAll: string;
  clearAll: string;
  ready: string;
  partial: string;
  noLink: string;
  create: string;
  creating: string;
  empty: string;
  savedOrders: string;
  noOrders: string;
  open: string;
  ordered: string;
  confirmed: string;
  cancelled: string;
  draft: string;
  opened: string;
  orderedStatus: string;
  confirmedStatus: string;
  cancelledStatus: string;
  lines: string;
  supplierFallback: string;
  openFailed: string;
  createFailed: string;
  loadFailed: string;
  statusFailed: string;
};

const COPY: Record<PanelLocale, PanelCopy> = {
  fi: {
    eyebrow: "Osta materiaalit",
    title: "Jälleenmyyjäkorit BOMista",
    subtitle: "Ryhmitä materiaalit kaupoittain, avaa seuratut ostokorit ja pidä tilauksen tila Helscoopissa.",
    coverage: "Ostokattavuus",
    retailers: "Jälleenmyyjät",
    commission: "Arvioitu komissio",
    missing: "Manuaalisesti hankittavaa",
    selectAll: "Valitse kaikki",
    clearAll: "Tyhjennä valinta",
    ready: "Valmis kori",
    partial: "Osittainen kori",
    noLink: "Ei suoraa ostolinkkiä",
    create: "Luo ostokorit",
    creating: "Luodaan...",
    empty: "BOMissa ei ole vielä ostokelpoisia jälleenmyyjärivejä.",
    savedOrders: "Tallennetut ostokorit",
    noOrders: "Ei vielä tallennettuja ostokoreja.",
    open: "Avaa jälleenmyyjä",
    ordered: "Merkitse tilatuksi",
    confirmed: "Merkitse vahvistetuksi",
    cancelled: "Peru kori",
    draft: "Luonnos",
    opened: "Avattu",
    orderedStatus: "Tilattu",
    confirmedStatus: "Vahvistettu",
    cancelledStatus: "Peruttu",
    lines: "riviä",
    supplierFallback: "Muu toimittaja",
    openFailed: "Ostokorin avaaminen epäonnistui",
    createFailed: "Ostokorin luonti epäonnistui",
    loadFailed: "Tallennettujen ostokorien lataus epäonnistui",
    statusFailed: "Tilan päivitys epäonnistui",
  },
  en: {
    eyebrow: "Buy materials",
    title: "Retailer baskets from the BOM",
    subtitle: "Group BOM lines by store, open tracked checkout baskets, and keep order state inside Helscoop.",
    coverage: "Checkout coverage",
    retailers: "Retailers",
    commission: "Est. commission",
    missing: "Manual sourcing",
    selectAll: "Select all",
    clearAll: "Clear",
    ready: "Ready basket",
    partial: "Partial basket",
    noLink: "No direct retailer link",
    create: "Create checkout baskets",
    creating: "Creating...",
    empty: "No shoppable retailer lines in the BOM yet.",
    savedOrders: "Saved checkout baskets",
    noOrders: "No marketplace baskets yet.",
    open: "Open retailer",
    ordered: "Mark ordered",
    confirmed: "Mark confirmed",
    cancelled: "Cancel basket",
    draft: "Draft",
    opened: "Opened",
    orderedStatus: "Ordered",
    confirmedStatus: "Confirmed",
    cancelledStatus: "Cancelled",
    lines: "lines",
    supplierFallback: "Other supplier",
    openFailed: "Failed to open retailer basket",
    createFailed: "Failed to create retailer baskets",
    loadFailed: "Failed to load saved baskets",
    statusFailed: "Failed to update order status",
  },
  sv: {
    eyebrow: "Kop material",
    title: "Aterforsaljarkorgar fran BOM",
    subtitle: "Gruppera materialrader per butik, oppna sparade inkopskorgar och folj orderstatus i Helscoop.",
    coverage: "Koptäckning",
    retailers: "Aterforsaljare",
    commission: "Est. provision",
    missing: "Manuell sourcing",
    selectAll: "Valj alla",
    clearAll: "Rensa",
    ready: "Redo korg",
    partial: "Delvis korg",
    noLink: "Ingen direktlank",
    create: "Skapa inkopskorgar",
    creating: "Skapar...",
    empty: "Inga kopbara aterforsaljarrader i BOM annu.",
    savedOrders: "Sparade inkopskorgar",
    noOrders: "Inga marknadsplatskorgar annu.",
    open: "Oppna aterforsaljare",
    ordered: "Markera bestalld",
    confirmed: "Markera bekrftad",
    cancelled: "Avbryt korg",
    draft: "Utkast",
    opened: "Oppnad",
    orderedStatus: "Bestalld",
    confirmedStatus: "Bekraftad",
    cancelledStatus: "Avbruten",
    lines: "rader",
    supplierFallback: "Annan leverantor",
    openFailed: "Kunde inte oppna inkopskorgen",
    createFailed: "Kunde inte skapa inkopskorgar",
    loadFailed: "Kunde inte ladda sparade korgar",
    statusFailed: "Kunde inte uppdatera status",
  },
};

function panelLocale(locale: string): PanelLocale {
  if (locale === "fi" || locale === "sv") return locale;
  return "en";
}

function formatMoney(value: number, locale: string): string {
  const tag = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";
  return `${value.toLocaleString(tag, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EUR`;
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "";
  const tag = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";
  return new Date(value).toLocaleDateString(tag);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeStockLevel(level?: string | null): StockLevel {
  if (level === "in_stock" || level === "low_stock" || level === "out_of_stock") return level;
  return "unknown";
}

function getOrderStatusLabel(order: MarketplaceOrder, copy: PanelCopy): string {
  if (order.status === "opened") return copy.opened;
  if (order.status === "ordered") return copy.orderedStatus;
  if (order.status === "confirmed") return copy.confirmedStatus;
  if (order.status === "cancelled") return copy.cancelledStatus;
  return copy.draft;
}

function findMatchingPricing(item: BomItem, material: Material | undefined) {
  const pricing = material?.pricing ?? [];
  const supplierName = (item.supplier || item.supplier_name || "").toLowerCase();
  const bySupplier = pricing.find((candidate) => (candidate.supplier_name || "").toLowerCase() === supplierName);
  const byLink = pricing.find((candidate) => candidate.link && item.link && candidate.link === item.link);
  return byLink ?? bySupplier ?? pricing.find((candidate) => candidate.is_primary) ?? pricing[0] ?? null;
}

function getMaterialName(item: BomItem, material: Material | undefined): string {
  return material?.name_en || material?.name_fi || material?.name || item.material_name || item.material_id;
}

function buildMarketplaceGroups(bom: BomItem[], materials: Material[], copy: PanelCopy): CartGroup[] {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const groups = new Map<string, CartGroup>();

  for (const item of bom) {
    const material = materialMap.get(item.material_id);
    const matchedPricing = findMatchingPricing(item, material);
    const supplierId = matchedPricing?.supplier_id ?? item.supplier_id ?? null;
    const supplierName = matchedPricing?.supplier_name ?? item.supplier ?? item.supplier_name ?? copy.supplierFallback;
    const lineUrl = buildAffiliateRetailerUrl(item.link ?? matchedPricing?.link, {
      materialId: item.material_id,
      supplier: supplierName,
      source: "marketplace_checkout",
    });
    const key = supplierId || supplierName.toLowerCase();
    const unitPrice = Number(item.unit_price ?? matchedPricing?.unit_price ?? 0);
    const total = roundMoney(Number(item.total ?? unitPrice * item.quantity));
    const line: CartLine = {
      material_id: item.material_id,
      material_name: getMaterialName(item, material),
      quantity: Number(item.quantity) || 0,
      unit: item.unit || matchedPricing?.unit || "kpl",
      unit_price: unitPrice,
      total,
      link: lineUrl,
      stock_level: normalizeStockLevel(item.stock_level ?? matchedPricing?.stock_level),
    };

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        supplier_id: supplierId,
        supplier_name: supplierName,
        subtotal: 0,
        estimated_commission_amount: 0,
        checkout_url: lineUrl,
        lines: [],
        shoppable_lines: 0,
      });
    }

    const group = groups.get(key)!;
    group.lines.push(line);
    group.subtotal = roundMoney(group.subtotal + total);
    if (line.link) {
      group.shoppable_lines += 1;
      if (!group.checkout_url) group.checkout_url = line.link;
    }
    group.estimated_commission_amount = roundMoney(group.subtotal * 0.15);
  }

  return Array.from(groups.values()).sort((a, b) => b.subtotal - a.subtotal);
}

export default function MarketplaceCheckoutPanel({
  projectId,
  bom,
  materials,
}: MarketplaceCheckoutPanelProps) {
  const { locale } = useTranslation();
  const copy = COPY[panelLocale(locale)];
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => buildMarketplaceGroups(bom, materials, copy), [bom, materials, copy]);

  useEffect(() => {
    const defaultSelection = new Set(
      groups
        .filter((group) => group.checkout_url && group.shoppable_lines > 0)
        .map((group) => group.key),
    );
    setSelectedGroups(defaultSelection);
  }, [groups]);

  useEffect(() => {
    let cancelled = false;
    setLoadingOrders(true);
    api.getMarketplaceOrders(projectId)
      .then((nextOrders) => {
        if (!cancelled) {
          setOrders(nextOrders);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError(copy.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoadingOrders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, copy.loadFailed]);

  const totals = useMemo(() => {
    const manualLines = groups.reduce((sum, group) => sum + (group.lines.length - group.shoppable_lines), 0);
    return {
      coverage: `${groups.reduce((sum, group) => sum + group.shoppable_lines, 0)}/${bom.length}`,
      retailers: groups.length,
      commission: roundMoney(groups.reduce((sum, group) => sum + group.estimated_commission_amount, 0)),
      manualLines,
    };
  }, [bom.length, groups]);

  const selectedSupplierCarts = useMemo<MarketplaceSupplierCheckoutInput[]>(
    () => groups
      .filter((group) => selectedGroups.has(group.key) && group.shoppable_lines > 0)
      .map((group) => ({
        supplier_id: group.supplier_id,
        supplier_name: group.supplier_name,
        subtotal: group.subtotal,
        checkout_url: group.checkout_url,
        currency: "EUR",
        items: group.lines.map((line) => ({
          material_id: line.material_id,
          material_name: line.material_name,
          quantity: line.quantity,
          unit: line.unit,
          unit_price: line.unit_price,
          total: line.total,
          link: line.link,
          stock_level: line.stock_level,
        })),
      })),
    [groups, selectedGroups],
  );

  const createCheckout = async () => {
    if (selectedSupplierCarts.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const response = await api.createMarketplaceCheckout(projectId, {
        supplier_carts: selectedSupplierCarts,
      });
      setOrders((prev) => [...response.orders, ...prev]);
    } catch {
      setError(copy.createFailed);
    } finally {
      setCreating(false);
    }
  };

  const openOrder = async (orderId: string) => {
    setBusyOrderId(orderId);
    setError(null);
    try {
      const response = await api.openMarketplaceOrder(orderId);
      if (response.order) {
        setOrders((prev) => prev.map((order) => (order.id === orderId ? response.order! : order)));
      }
      if (response.checkout_url) {
        window.open(response.checkout_url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError(copy.openFailed);
    } finally {
      setBusyOrderId(null);
    }
  };

  const updateOrderStatus = async (orderId: string, status: MarketplaceOrder["status"]) => {
    setBusyOrderId(orderId);
    setError(null);
    try {
      const updated = await api.updateMarketplaceOrder(orderId, { status });
      setOrders((prev) => prev.map((order) => (order.id === orderId ? updated : order)));
    } catch {
      setError(copy.statusFailed);
    } finally {
      setBusyOrderId(null);
    }
  };

  if (bom.length === 0) return null;

  return (
    <section
      data-testid="marketplace-checkout-panel"
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(74,124,89,0.22)",
        background: "linear-gradient(155deg, rgba(74,124,89,0.14), rgba(229,160,75,0.08) 62%, rgba(22,27,31,0.45))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--forest)", fontSize: 10, marginBottom: 4 }}>
            {copy.eyebrow}
          </div>
          <h4 style={{ margin: 0, fontSize: 15, color: "var(--text-primary)" }}>
            {copy.title}
          </h4>
          <p style={{ margin: "5px 0 0", fontSize: 11, lineHeight: 1.45, color: "var(--text-muted)" }}>
            {copy.subtitle}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
        <Metric label={copy.coverage} value={totals.coverage} />
        <Metric label={copy.retailers} value={String(totals.retailers)} />
        <Metric label={copy.commission} value={formatMoney(totals.commission, locale)} strong />
        <Metric label={copy.missing} value={String(totals.manualLines)} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          className="material-btn"
          onClick={() => setSelectedGroups(new Set(groups.filter((group) => group.shoppable_lines > 0).map((group) => group.key)))}
        >
          {copy.selectAll}
        </button>
        <button type="button" className="material-btn" onClick={() => setSelectedGroups(new Set())}>
          {copy.clearAll}
        </button>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {groups.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{copy.empty}</div>
        ) : (
          groups.map((group) => {
            const selected = selectedGroups.has(group.key);
            const ready = group.shoppable_lines === group.lines.length && group.lines.length > 0;
            return (
              <label
                key={group.key}
                style={{
                  display: "block",
                  padding: 10,
                  borderRadius: "var(--radius-sm)",
                  border: selected ? "1px solid rgba(229,160,75,0.35)" : "1px solid var(--border)",
                  background: selected ? "rgba(229,160,75,0.08)" : "var(--bg-tertiary)",
                  cursor: group.shoppable_lines > 0 ? "pointer" : "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={group.shoppable_lines === 0}
                    onChange={() => {
                      setSelectedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.key)) next.delete(group.key);
                        else next.add(group.key);
                        return next;
                      });
                    }}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{group.supplier_name}</strong>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)", fontSize: 12 }}>
                        {formatMoney(group.subtotal, locale)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4, fontSize: 10, color: "var(--text-muted)" }}>
                      <span>{ready ? copy.ready : copy.partial}</span>
                      <span>{formatMoney(group.estimated_commission_amount, locale)}</span>
                    </div>
                    <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                      {group.lines.slice(0, 4).map((line) => (
                        <div key={`${group.key}-${line.material_id}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                          <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {line.material_name}
                          </span>
                          <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            {line.quantity} {line.unit} · {formatMoney(line.total, locale)}
                          </span>
                        </div>
                      ))}
                    </div>
                    {group.lines.length > 4 && (
                      <div style={{ marginTop: 4, fontSize: 10, color: "var(--text-muted)" }}>
                        +{group.lines.length - 4} {copy.lines}
                      </div>
                    )}
                    {group.shoppable_lines === 0 && (
                      <div style={{ marginTop: 6, fontSize: 10, color: "var(--amber)" }}>
                        {copy.noLink}
                      </div>
                    )}
                  </div>
                </div>
              </label>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={() => void createCheckout()}
        disabled={creating || selectedSupplierCarts.length === 0}
        style={{
          marginTop: 12,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "9px 12px",
          fontSize: 12,
          fontWeight: 700,
          color: selectedSupplierCarts.length === 0 ? "var(--text-muted)" : "var(--bg-primary)",
          background: selectedSupplierCarts.length === 0 ? "var(--bg-tertiary)" : "var(--forest)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          cursor: selectedSupplierCarts.length === 0 ? "not-allowed" : "pointer",
        }}
      >
        {creating ? copy.creating : copy.create}
      </button>

      {error && (
        <p style={{ margin: "10px 0 0", color: "var(--danger)", fontSize: 11 }}>{error}</p>
      )}

      <div style={{ marginTop: 14 }}>
        <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 6 }}>
          {copy.savedOrders}
        </div>
        {loadingOrders ? (
          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>…</div>
        ) : orders.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{copy.noOrders}</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {orders.map((order) => (
              <article
                key={order.id}
                style={{
                  padding: 10,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "rgba(0,0,0,0.08)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: 12 }}>{order.supplier_name}</strong>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                      {getOrderStatusLabel(order, copy)} · {formatDate(order.updated_at, locale)}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    {formatMoney(order.subtotal, locale)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <button
                    type="button"
                    className="material-btn"
                    disabled={busyOrderId === order.id || !order.checkout_url}
                    onClick={() => void openOrder(order.id)}
                  >
                    {copy.open}
                  </button>
                  {order.status !== "ordered" && order.status !== "confirmed" && order.status !== "cancelled" && (
                    <button
                      type="button"
                      className="material-btn"
                      disabled={busyOrderId === order.id}
                      onClick={() => void updateOrderStatus(order.id, "ordered")}
                    >
                      {copy.ordered}
                    </button>
                  )}
                  {order.status !== "confirmed" && order.status !== "cancelled" && (
                    <button
                      type="button"
                      className="material-btn"
                      disabled={busyOrderId === order.id}
                      onClick={() => void updateOrderStatus(order.id, "confirmed")}
                    >
                      {copy.confirmed}
                    </button>
                  )}
                  {order.status !== "cancelled" && (
                    <button
                      type="button"
                      className="material-btn"
                      disabled={busyOrderId === order.id}
                      onClick={() => void updateOrderStatus(order.id, "cancelled")}
                    >
                      {copy.cancelled}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        padding: "8px 9px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: strong ? 700 : 600, color: strong ? "var(--forest)" : "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}
