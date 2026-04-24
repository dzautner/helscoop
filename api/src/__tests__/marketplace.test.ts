process.env.NODE_ENV = "test";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  pool: { query: vi.fn() },
}));

vi.mock("../auth", () => ({
  requireAuth: (
    req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    const id = req.headers["x-test-user-id"] as string | undefined;
    if (!id) return res.status(401).json({ error: "Authentication required" });
    (req as any).user = {
      id,
      email: req.headers["x-test-user-email"] || "test@helscoop.fi",
      role: req.headers["x-test-user-role"] || "user",
    };
    next();
  },
}));

import express from "express";
import { query } from "../db";
import marketplaceRouter from "../routes/marketplace";

const mockQuery = vi.mocked(query);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/marketplace", marketplaceRouter);
  return app;
}

function userHeaders(extra: Record<string, string> = {}) {
  return {
    "x-test-user-id": "user-1",
    "x-test-user-role": "user",
    ...extra,
  };
}

async function request(
  app: express.Express,
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address() as import("net").AddressInfo;
      const url = `http://127.0.0.1:${addr.port}${path}`;
      fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers || {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      })
        .then(async (res) => {
          const body = await res.json().catch(() => null);
          resolve({ status: res.status, body });
        })
        .catch(reject)
        .finally(() => server.close());
    });
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] } as any);
});

describe("GET /marketplace/project/:projectId/orders", () => {
  it("returns saved marketplace orders for the project owner", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "proj-1", name: "Sauna" }] } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "order-1",
            project_id: "proj-1",
            user_id: "user-1",
            supplier_id: "k-rauta",
            supplier_name: "K-Rauta",
            partner_id: null,
            partner_name: null,
            status: "draft",
            currency: "EUR",
            subtotal: "120.50",
            estimated_commission_rate: "0.1500",
            estimated_commission_amount: "18.08",
            checkout_url: "https://www.k-rauta.fi/tuote/osb",
            created_at: "2026-04-24T10:00:00.000Z",
            updated_at: "2026-04-24T10:00:00.000Z",
            opened_at: null,
            ordered_at: null,
            confirmed_at: null,
            cancelled_at: null,
            lines: [
              {
                id: "line-1",
                material_id: "osb_18mm",
                material_name: "OSB 18mm",
                quantity: 4,
                unit: "sheet",
                unit_price: 30.125,
                total: 120.5,
                link: "https://www.k-rauta.fi/tuote/osb",
                stock_level: "in_stock",
              },
            ],
          },
        ],
      } as any);

    const app = buildApp();
    const res = await request(app, "GET", "/marketplace/project/proj-1/orders", {
      headers: userHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: "order-1",
      supplier_id: "k-rauta",
      supplier_name: "K-Rauta",
      subtotal: 120.5,
      estimated_commission_amount: 18.08,
    });
    expect(res.body[0].lines[0].material_id).toBe("osb_18mm");
  });
});

describe("POST /marketplace/project/:projectId/checkout", () => {
  it("creates persisted marketplace orders from supplier carts", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "proj-1", name: "Sauna" }] } as any)
      .mockResolvedValueOnce({
        rows: [{ id: "partner-1", name: "K-Rauta", commission_rate: "0.1200" }],
      } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "order-1",
            project_id: "proj-1",
            user_id: "user-1",
            supplier_id: "k-rauta",
            supplier_name: "K-Rauta",
            partner_id: "partner-1",
            status: "draft",
            currency: "EUR",
            subtotal: "240.00",
            estimated_commission_rate: "0.1200",
            estimated_commission_amount: "28.80",
            checkout_url: "https://www.k-rauta.fi/tuote/osb",
            created_at: "2026-04-24T10:00:00.000Z",
            updated_at: "2026-04-24T10:00:00.000Z",
          },
        ],
      } as any)
      .mockResolvedValue({ rows: [] } as any);

    const app = buildApp();
    const res = await request(app, "POST", "/marketplace/project/proj-1/checkout", {
      headers: userHeaders(),
      body: {
        supplier_carts: [
          {
            supplier_id: "k-rauta",
            supplier_name: "K-Rauta",
            subtotal: 240,
            checkout_url: "https://www.k-rauta.fi/tuote/osb",
            items: [
              {
                material_id: "osb_18mm",
                material_name: "OSB 18mm",
                quantity: 6,
                unit: "sheet",
                unit_price: 40,
                total: 240,
                link: "https://www.k-rauta.fi/tuote/osb",
                stock_level: "in_stock",
              },
            ],
          },
        ],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0]).toMatchObject({
      supplier_name: "K-Rauta",
      subtotal: 240,
      estimated_commission_rate: 0.12,
      estimated_commission_amount: 28.8,
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO marketplace_orders"),
      expect.arrayContaining(["proj-1", "user-1", "k-rauta", "K-Rauta"]),
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO marketplace_order_lines"),
      expect.arrayContaining(["osb_18mm", "OSB 18mm"]),
    );
  });

  it("rejects an empty supplier cart payload", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "proj-1", name: "Sauna" }] } as any);

    const app = buildApp();
    const res = await request(app, "POST", "/marketplace/project/proj-1/checkout", {
      headers: userHeaders(),
      body: { supplier_carts: [] },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("supplier_carts");
  });
});

describe("POST /marketplace/orders/:orderId/open", () => {
  it("records affiliate clicks and returns the checkout URL", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "order-1",
            project_id: "proj-1",
            user_id: "user-1",
            supplier_id: "k-rauta",
            supplier_name: "K-Rauta",
            partner_id: "partner-1",
            partner_name: "K-Rauta",
            status: "draft",
            currency: "EUR",
            subtotal: "240.00",
            estimated_commission_rate: "0.1500",
            estimated_commission_amount: "36.00",
            checkout_url: "https://www.k-rauta.fi/tuote/osb",
            created_at: "2026-04-24T10:00:00.000Z",
            updated_at: "2026-04-24T10:00:00.000Z",
            lines: [
              {
                id: "line-1",
                material_id: "osb_18mm",
                material_name: "OSB 18mm",
                quantity: 6,
                unit: "sheet",
                unit_price: 40,
                total: 240,
                link: "https://www.k-rauta.fi/tuote/osb",
                stock_level: "in_stock",
              },
            ],
          },
        ],
      } as any)
      .mockResolvedValueOnce({ rows: [{ id: "click-1" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "order-1",
            project_id: "proj-1",
            user_id: "user-1",
            supplier_id: "k-rauta",
            supplier_name: "K-Rauta",
            partner_id: "partner-1",
            partner_name: "K-Rauta",
            status: "opened",
            currency: "EUR",
            subtotal: "240.00",
            estimated_commission_rate: "0.1500",
            estimated_commission_amount: "36.00",
            checkout_url: "https://www.k-rauta.fi/tuote/osb",
            created_at: "2026-04-24T10:00:00.000Z",
            updated_at: "2026-04-24T10:01:00.000Z",
            opened_at: "2026-04-24T10:01:00.000Z",
            lines: [],
          },
        ],
      } as any);

    const app = buildApp();
    const res = await request(app, "POST", "/marketplace/orders/order-1/open", {
      headers: userHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toBe("https://www.k-rauta.fi/tuote/osb");
    expect(res.body.click_count).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO affiliate_clicks"),
      expect.arrayContaining(["user-1", "osb_18mm", "k-rauta", "partner-1"]),
    );
  });
});

describe("PATCH /marketplace/orders/:orderId", () => {
  it("updates the order status for the owner", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "order-1" }] } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "order-1",
            project_id: "proj-1",
            user_id: "user-1",
            supplier_id: "k-rauta",
            supplier_name: "K-Rauta",
            partner_id: null,
            partner_name: null,
            status: "ordered",
            currency: "EUR",
            subtotal: "240.00",
            estimated_commission_rate: "0.1500",
            estimated_commission_amount: "36.00",
            checkout_url: "https://www.k-rauta.fi/tuote/osb",
            external_order_ref: null,
            created_at: "2026-04-24T10:00:00.000Z",
            updated_at: "2026-04-24T10:03:00.000Z",
            ordered_at: "2026-04-24T10:03:00.000Z",
            lines: [],
          },
        ],
      } as any);

    const app = buildApp();
    const res = await request(app, "PATCH", "/marketplace/orders/order-1", {
      headers: userHeaders(),
      body: { status: "ordered" },
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ordered");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE marketplace_orders"),
      expect.arrayContaining(["ordered", null, "order-1", "user-1"]),
    );
  });
});
