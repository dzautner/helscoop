import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";

const router = Router();

const DEFAULT_COMMISSION_RATE = 0.15;
const VALID_ORDER_STATUSES = new Set(["draft", "opened", "ordered", "confirmed", "cancelled"]);
const VALID_STOCK_LEVELS = new Set(["in_stock", "low_stock", "out_of_stock", "unknown"]);

interface MarketplaceOrderLineInput {
  material_id?: unknown;
  material_name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  total?: unknown;
  link?: unknown;
  stock_level?: unknown;
}

interface MarketplaceSupplierCartInput {
  supplier_id?: unknown;
  supplier_name?: unknown;
  subtotal?: unknown;
  currency?: unknown;
  checkout_url?: unknown;
  items?: unknown;
}

type OrderRowWithLines = Record<string, unknown> & {
  lines?: unknown;
};

function toOptionalString(value: unknown, maxLength = 2048): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function toRequiredString(value: unknown, field: string, maxLength = 240): string {
  const text = toOptionalString(value, maxLength);
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function toPositiveNumber(value: unknown, field: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return numeric;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeStockLevel(value: unknown): string {
  return typeof value === "string" && VALID_STOCK_LEVELS.has(value) ? value : "unknown";
}

function normalizeCurrency(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  return raw || "EUR";
}

async function ensureOwnedProject(projectId: string, userId: string) {
  const result = await query(
    `SELECT id, name
     FROM projects
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
}

async function findAffiliatePartnerForSupplier(supplierName: string) {
  const result = await query(
    `SELECT id, name, commission_rate
     FROM affiliate_partners
     WHERE active = true
       AND lower(name) = lower($1)
     LIMIT 1`,
    [supplierName],
  );
  return result.rows[0] ?? null;
}

function normalizeLines(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((line) => {
    const row = (line ?? {}) as Record<string, unknown>;
    return {
      id: typeof row.id === "string" ? row.id : "",
      material_id: typeof row.material_id === "string" ? row.material_id : "",
      material_name: typeof row.material_name === "string" ? row.material_name : "",
      quantity: Number(row.quantity) || 0,
      unit: typeof row.unit === "string" ? row.unit : "kpl",
      unit_price: Number(row.unit_price) || 0,
      total: Number(row.total) || 0,
      link: typeof row.link === "string" ? row.link : null,
      stock_level: normalizeStockLevel(row.stock_level),
    };
  });
}

function mapOrderRow(row: OrderRowWithLines) {
  return {
    id: row.id,
    project_id: row.project_id,
    user_id: row.user_id,
    supplier_id: row.supplier_id ?? null,
    supplier_name: row.supplier_name,
    partner_id: row.partner_id ?? null,
    partner_name: row.partner_name ?? null,
    status: row.status,
    currency: row.currency,
    subtotal: Number(row.subtotal) || 0,
    estimated_commission_rate: Number(row.estimated_commission_rate) || DEFAULT_COMMISSION_RATE,
    estimated_commission_amount: Number(row.estimated_commission_amount) || 0,
    checkout_url: row.checkout_url ?? null,
    external_order_ref: row.external_order_ref ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    opened_at: row.opened_at ?? null,
    ordered_at: row.ordered_at ?? null,
    confirmed_at: row.confirmed_at ?? null,
    cancelled_at: row.cancelled_at ?? null,
    lines: normalizeLines(row.lines),
  };
}

async function loadOrder(orderId: string, userId: string) {
  const result = await query(
    `SELECT mo.*,
            ap.name AS partner_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', mol.id,
                  'material_id', mol.material_id,
                  'material_name', mol.material_name,
                  'quantity', mol.quantity,
                  'unit', mol.unit,
                  'unit_price', mol.unit_price,
                  'total', mol.total,
                  'link', mol.link,
                  'stock_level', mol.stock_level
                )
                ORDER BY mol.created_at ASC
              ) FILTER (WHERE mol.id IS NOT NULL),
              '[]'::json
            ) AS lines
     FROM marketplace_orders mo
     LEFT JOIN affiliate_partners ap ON ap.id = mo.partner_id
     LEFT JOIN marketplace_order_lines mol ON mol.order_id = mo.id
     WHERE mo.id = $1 AND mo.user_id = $2
     GROUP BY mo.id, ap.name`,
    [orderId, userId],
  );
  return result.rows[0] ? mapOrderRow(result.rows[0] as OrderRowWithLines) : null;
}

router.get("/project/:projectId/orders", requireAuth, async (req, res) => {
  const project = await ensureOwnedProject(req.params.projectId, req.user!.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const result = await query(
    `SELECT mo.*,
            ap.name AS partner_name,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', mol.id,
                  'material_id', mol.material_id,
                  'material_name', mol.material_name,
                  'quantity', mol.quantity,
                  'unit', mol.unit,
                  'unit_price', mol.unit_price,
                  'total', mol.total,
                  'link', mol.link,
                  'stock_level', mol.stock_level
                )
                ORDER BY mol.created_at ASC
              ) FILTER (WHERE mol.id IS NOT NULL),
              '[]'::json
            ) AS lines
     FROM marketplace_orders mo
     LEFT JOIN affiliate_partners ap ON ap.id = mo.partner_id
     LEFT JOIN marketplace_order_lines mol ON mol.order_id = mo.id
     WHERE mo.project_id = $1 AND mo.user_id = $2
     GROUP BY mo.id, ap.name
     ORDER BY mo.created_at DESC`,
    [req.params.projectId, req.user!.id],
  );

  res.json(result.rows.map((row) => mapOrderRow(row as OrderRowWithLines)));
});

router.post("/project/:projectId/checkout", requireAuth, async (req, res) => {
  const project = await ensureOwnedProject(req.params.projectId, req.user!.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const supplierCarts = Array.isArray(req.body?.supplier_carts) ? req.body.supplier_carts as MarketplaceSupplierCartInput[] : [];
  if (supplierCarts.length === 0) {
    return res.status(400).json({ error: "supplier_carts must contain at least one supplier basket" });
  }
  if (supplierCarts.length > 12) {
    return res.status(400).json({ error: "Too many supplier baskets in one checkout" });
  }

  try {
    const orders = [];

    for (const cart of supplierCarts) {
      const supplierName = toRequiredString(cart.supplier_name, "supplier_name", 160);
      const supplierId = toOptionalString(cart.supplier_id, 120);
      const currency = normalizeCurrency(cart.currency);
      const checkoutUrl = toOptionalString(cart.checkout_url, 2048);
      const rawItems = Array.isArray(cart.items) ? cart.items as MarketplaceOrderLineInput[] : [];

      if (rawItems.length === 0) {
        throw new Error(`items are required for supplier ${supplierName}`);
      }

      const items = rawItems.map((item, index) => {
        const materialId = toRequiredString(item.material_id, `items[${index}].material_id`, 120);
        const materialName = toRequiredString(
          item.material_name ?? item.material_id,
          `items[${index}].material_name`,
          240,
        );
        const quantity = toPositiveNumber(item.quantity, `items[${index}].quantity`);
        const unit = toRequiredString(item.unit ?? "kpl", `items[${index}].unit`, 32);
        const unitPrice = Math.max(0, Number(item.unit_price) || 0);
        const total = roundMoney(Math.max(0, Number(item.total) || unitPrice * quantity));
        return {
          materialId,
          materialName,
          quantity,
          unit,
          unitPrice,
          total,
          link: toOptionalString(item.link, 2048),
          stockLevel: normalizeStockLevel(item.stock_level),
        };
      });

      const computedSubtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
      const subtotal = roundMoney(Math.max(0, Number(cart.subtotal) || computedSubtotal));
      const partner = await findAffiliatePartnerForSupplier(supplierName);
      const commissionRate = Number(partner?.commission_rate) || DEFAULT_COMMISSION_RATE;
      const estimatedCommissionAmount = roundMoney(subtotal * commissionRate);

      const orderInsert = await query(
        `INSERT INTO marketplace_orders (
           project_id,
           user_id,
           supplier_id,
           supplier_name,
           partner_id,
           currency,
           subtotal,
           estimated_commission_rate,
           estimated_commission_amount,
           checkout_url,
           metadata_json
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
         RETURNING *`,
        [
          req.params.projectId,
          req.user!.id,
          supplierId,
          supplierName,
          partner?.id ?? null,
          currency,
          subtotal,
          commissionRate,
          estimatedCommissionAmount,
          checkoutUrl,
          JSON.stringify({
            project_name: project.name,
            source: "bom_marketplace_checkout",
            item_count: items.length,
          }),
        ],
      );
      const orderRow = orderInsert.rows[0] as OrderRowWithLines;

      for (const item of items) {
        await query(
          `INSERT INTO marketplace_order_lines (
             order_id,
             material_id,
             material_name,
             quantity,
             unit,
             unit_price,
             total,
             link,
             stock_level
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            orderRow.id,
            item.materialId,
            item.materialName,
            item.quantity,
            item.unit,
            item.unitPrice,
            item.total,
            item.link,
            item.stockLevel,
          ],
        );
      }

      orders.push({
        ...mapOrderRow({
          ...orderRow,
          partner_name: partner?.name ?? null,
          lines: items.map((item, index) => ({
            id: `${orderRow.id}-${index}`,
            material_id: item.materialId,
            material_name: item.materialName,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unitPrice,
            total: item.total,
            link: item.link,
            stock_level: item.stockLevel,
          })),
        }),
      });
    }

    res.status(201).json({ orders });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid marketplace checkout payload" });
  }
});

router.post("/orders/:orderId/open", requireAuth, async (req, res) => {
  const order = await loadOrder(req.params.orderId, req.user!.id);
  if (!order) {
    return res.status(404).json({ error: "Marketplace order not found" });
  }

  let clickCount = 0;
  if (order.supplier_id) {
    for (const line of order.lines) {
      if (!line.link) continue;
      await query(
        `INSERT INTO affiliate_clicks (user_id, material_id, supplier_id, partner_id, click_url)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          req.user!.id,
          line.material_id,
          order.supplier_id,
          order.partner_id,
          line.link,
        ],
      );
      clickCount += 1;
    }
  }

  await query(
    `UPDATE marketplace_orders
     SET status = CASE WHEN status = 'draft' THEN 'opened' ELSE status END,
         opened_at = COALESCE(opened_at, now()),
         updated_at = now()
     WHERE id = $1 AND user_id = $2`,
    [req.params.orderId, req.user!.id],
  );

  const updated = await loadOrder(req.params.orderId, req.user!.id);
  res.json({
    checkout_url: updated?.checkout_url ?? null,
    click_count: clickCount,
    order: updated,
  });
});

router.patch("/orders/:orderId", requireAuth, async (req, res) => {
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!VALID_ORDER_STATUSES.has(status)) {
    return res.status(400).json({ error: "status must be one of: draft, opened, ordered, confirmed, cancelled" });
  }

  const externalOrderRef = toOptionalString(req.body?.external_order_ref, 160);
  const result = await query(
    `UPDATE marketplace_orders
     SET status = $1,
         external_order_ref = COALESCE($2, external_order_ref),
         opened_at = CASE WHEN $1 = 'opened' THEN COALESCE(opened_at, now()) ELSE opened_at END,
         ordered_at = CASE WHEN $1 = 'ordered' THEN COALESCE(ordered_at, now()) ELSE ordered_at END,
         confirmed_at = CASE WHEN $1 = 'confirmed' THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
         cancelled_at = CASE WHEN $1 = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
         updated_at = now()
     WHERE id = $3 AND user_id = $4
     RETURNING id`,
    [status, externalOrderRef, req.params.orderId, req.user!.id],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Marketplace order not found" });
  }

  const order = await loadOrder(req.params.orderId, req.user!.id);
  res.json(order);
});

export default router;
