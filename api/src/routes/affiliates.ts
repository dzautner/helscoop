import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";

const router = Router();

// ---------------------------------------------------------------------------
// POST /affiliates/click — record a click-through (any authenticated user)
// ---------------------------------------------------------------------------
router.post("/click", requireAuth, async (req, res) => {
  const { material_id, supplier_id, click_url, partner_id } = req.body;
  const userId = req.user!.id;

  if (!material_id || !supplier_id || !click_url) {
    return res
      .status(400)
      .json({ error: "material_id, supplier_id, and click_url are required" });
  }

  if (typeof click_url !== "string" || click_url.length > 2048) {
    return res.status(400).json({ error: "Invalid click_url" });
  }

  try {
    const result = await query(
      `INSERT INTO affiliate_clicks (user_id, material_id, supplier_id, partner_id, click_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, material_id, supplier_id, partner_id || null, click_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to record click" });
  }
});

// ---------------------------------------------------------------------------
// GET /affiliates/clicks — list all clicks (admin only, paginated)
// ---------------------------------------------------------------------------
router.get(
  "/clicks",
  requireAuth,
  requirePermission("admin:access"),
  async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const partnerId = req.query.partner_id as string | undefined;

    try {
      let sql = `
        SELECT ac.*,
          u.email AS user_email,
          m.name  AS material_name,
          s.name  AS supplier_name,
          ap.name AS partner_name
        FROM affiliate_clicks ac
        JOIN users     u  ON ac.user_id     = u.id
        JOIN materials m  ON ac.material_id = m.id
        JOIN suppliers s  ON ac.supplier_id = s.id
        LEFT JOIN affiliate_partners ap ON ac.partner_id = ap.id`;
      const params: unknown[] = [];

      if (partnerId) {
        params.push(partnerId);
        sql += ` WHERE ac.partner_id = $${params.length}`;
      }

      sql += ` ORDER BY ac.created_at DESC`;
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;

      const result = await query(sql, params);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch clicks" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /affiliates/commissions — record a commission (admin only)
// ---------------------------------------------------------------------------
router.post(
  "/commissions",
  requireAuth,
  requirePermission("admin:access"),
  async (req, res) => {
    const { click_id, partner_id, order_ref, amount, currency, status } =
      req.body;

    if (!click_id || !partner_id || !order_ref || amount == null) {
      return res.status(400).json({
        error: "click_id, partner_id, order_ref, and amount are required",
      });
    }

    if (typeof amount !== "number" || amount < 0) {
      return res.status(400).json({ error: "amount must be a non-negative number" });
    }

    const validStatuses = ["pending", "confirmed", "paid", "reversed"];
    const commissionStatus = status || "pending";
    if (!validStatuses.includes(commissionStatus)) {
      return res.status(400).json({
        error: `status must be one of: ${validStatuses.join(", ")}`,
      });
    }

    try {
      const result = await query(
        `INSERT INTO affiliate_commissions (click_id, partner_id, order_ref, amount, currency, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          click_id,
          partner_id,
          order_ref,
          amount,
          currency || "EUR",
          commissionStatus,
        ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Failed to record commission" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /affiliates/commissions — list commissions (admin only, paginated)
// ---------------------------------------------------------------------------
router.get(
  "/commissions",
  requireAuth,
  requirePermission("admin:access"),
  async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;
    const partnerId = req.query.partner_id as string | undefined;

    try {
      let sql = `
        SELECT acom.*,
          ap.name AS partner_name,
          ac.user_id,
          ac.material_id,
          ac.supplier_id,
          u.email AS user_email
        FROM affiliate_commissions acom
        JOIN affiliate_clicks   ac ON acom.click_id   = ac.id
        JOIN affiliate_partners ap ON acom.partner_id  = ap.id
        JOIN users              u  ON ac.user_id       = u.id`;
      const params: unknown[] = [];
      const conditions: string[] = [];

      if (status) {
        params.push(status);
        conditions.push(`acom.status = $${params.length}`);
      }
      if (partnerId) {
        params.push(partnerId);
        conditions.push(`acom.partner_id = $${params.length}`);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(" AND ")}`;
      }

      sql += ` ORDER BY acom.created_at DESC`;
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;

      const result = await query(sql, params);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch commissions" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /affiliates/report — summary report by partner/period (admin only)
//
// Query params:
//   - start: ISO date string (inclusive, default: 30 days ago)
//   - end:   ISO date string (exclusive, default: now)
//   - partner_id: optional filter
// ---------------------------------------------------------------------------
router.get(
  "/report",
  requireAuth,
  requirePermission("admin:access"),
  async (req, res) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const start = (req.query.start as string) || thirtyDaysAgo.toISOString();
    const end = (req.query.end as string) || now.toISOString();
    const partnerId = req.query.partner_id as string | undefined;

    try {
      const params: unknown[] = [start, end];
      let partnerFilter = "";

      if (partnerId) {
        params.push(partnerId);
        partnerFilter = `AND acom.partner_id = $${params.length}`;
      }

      const result = await query(
        `SELECT
           ap.id            AS partner_id,
           ap.name          AS partner_name,
           ap.commission_rate,
           COUNT(DISTINCT ac.id)   AS total_clicks,
           COUNT(acom.id)          AS total_commissions,
           COALESCE(SUM(acom.amount) FILTER (WHERE acom.status = 'pending'),   0) AS pending_amount,
           COALESCE(SUM(acom.amount) FILTER (WHERE acom.status = 'confirmed'), 0) AS confirmed_amount,
           COALESCE(SUM(acom.amount) FILTER (WHERE acom.status = 'paid'),      0) AS paid_amount,
           COALESCE(SUM(acom.amount) FILTER (WHERE acom.status = 'reversed'),  0) AS reversed_amount,
           COALESCE(SUM(acom.amount) FILTER (WHERE acom.status IN ('pending','confirmed','paid')), 0) AS net_amount
         FROM affiliate_partners ap
         LEFT JOIN affiliate_clicks ac
           ON ac.partner_id = ap.id
           AND ac.created_at >= $1 AND ac.created_at < $2
         LEFT JOIN affiliate_commissions acom
           ON acom.partner_id = ap.id
           AND acom.created_at >= $1 AND acom.created_at < $2
           ${partnerFilter}
         WHERE ap.active = true
         GROUP BY ap.id, ap.name, ap.commission_rate
         ORDER BY net_amount DESC`,
        params
      );

      res.json({
        period: { start, end },
        partners: result.rows,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to generate report" });
    }
  }
);

export default router;
