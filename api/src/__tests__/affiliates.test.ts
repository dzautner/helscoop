/**
 * Unit tests for the affiliate settlement ledger routes.
 * All tests run without a real database -- the db module is mocked.
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the DB module BEFORE importing anything that uses it
// ---------------------------------------------------------------------------
vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  pool: { query: vi.fn() },
}));

import { query } from "../db";
const mockQuery = vi.mocked(query);

// ---------------------------------------------------------------------------
// Mock auth — requireAuth attaches req.user from x-test-user-* headers
// ---------------------------------------------------------------------------
vi.mock("../auth", () => ({
  requireAuth: (
    req: import("express").Request,
    _res: import("express").Response,
    next: import("express").NextFunction
  ) => {
    const id = req.headers["x-test-user-id"] as string;
    if (!id) {
      return (_res as any).status(401).json({ error: "Authentication required" });
    }
    (req as any).user = {
      id,
      email: req.headers["x-test-user-email"] || "test@helscoop.fi",
      role: req.headers["x-test-user-role"] || "homeowner",
    };
    next();
  },
}));

import express from "express";
import affiliatesRouter from "../routes/affiliates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/affiliates", affiliatesRouter);
  return app;
}

function adminHeaders(extra: Record<string, string> = {}) {
  return {
    "x-test-user-id": "admin-1",
    "x-test-user-role": "admin",
    ...extra,
  };
}

function userHeaders(extra: Record<string, string> = {}) {
  return {
    "x-test-user-id": "user-1",
    "x-test-user-role": "homeowner",
    ...extra,
  };
}

/** Minimal supertest-like helper using Node fetch against an ephemeral server. */
async function request(
  app: express.Express,
  method: "GET" | "POST",
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {}
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

// ---------------------------------------------------------------------------
beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] } as any);
});

// ---------------------------------------------------------------------------
// 1. POST /affiliates/click
// ---------------------------------------------------------------------------
describe("POST /affiliates/click", () => {
  it("records a click and returns 201", async () => {
    const clickRow = {
      id: "click-1",
      user_id: "user-1",
      material_id: "mat-1",
      supplier_id: "sup-1",
      partner_id: null,
      click_url: "https://shop.example.com/product/123",
      created_at: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [clickRow] } as any);

    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/click", {
      headers: userHeaders(),
      body: {
        material_id: "mat-1",
        supplier_id: "sup-1",
        click_url: "https://shop.example.com/product/123",
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("click-1");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO affiliate_clicks"),
      expect.arrayContaining(["user-1", "mat-1", "sup-1"])
    );
  });

  it("returns 400 when required fields are missing", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/click", {
      headers: userHeaders(),
      body: { material_id: "mat-1" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("required");
  });

  it("returns 400 when click_url is too long", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/click", {
      headers: userHeaders(),
      body: {
        material_id: "mat-1",
        supplier_id: "sup-1",
        click_url: "x".repeat(2049),
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("click_url");
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/click", {
      body: {
        material_id: "mat-1",
        supplier_id: "sup-1",
        click_url: "https://shop.example.com",
      },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2. GET /affiliates/clicks (admin only)
// ---------------------------------------------------------------------------
describe("GET /affiliates/clicks", () => {
  it("returns clicks for admin user", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "click-1",
          user_email: "u@helscoop.fi",
          material_name: "Pine",
          supplier_name: "K-Rauta",
        },
      ],
    } as any);

    const app = buildApp();
    const res = await request(app, "GET", "/affiliates/clicks", {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("click-1");
  });

  it("returns 403 for non-admin user", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/affiliates/clicks", {
      headers: userHeaders(),
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 3. POST /affiliates/commissions (admin only)
// ---------------------------------------------------------------------------
describe("POST /affiliates/commissions", () => {
  it("creates a commission record and returns 201", async () => {
    const row = {
      id: "com-1",
      click_id: "click-1",
      partner_id: "partner-1",
      order_ref: "ORD-123",
      amount: 12.5,
      currency: "EUR",
      status: "pending",
    };
    mockQuery.mockResolvedValueOnce({ rows: [row] } as any);

    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/commissions", {
      headers: adminHeaders(),
      body: {
        click_id: "click-1",
        partner_id: "partner-1",
        order_ref: "ORD-123",
        amount: 12.5,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("com-1");
    expect(res.body.status).toBe("pending");
  });

  it("returns 400 when required fields are missing", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/commissions", {
      headers: adminHeaders(),
      body: { click_id: "click-1" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("required");
  });

  it("returns 400 for invalid status", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/commissions", {
      headers: adminHeaders(),
      body: {
        click_id: "click-1",
        partner_id: "partner-1",
        order_ref: "ORD-1",
        amount: 10,
        status: "invalid_status",
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("status");
  });

  it("returns 400 for negative amount", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/commissions", {
      headers: adminHeaders(),
      body: {
        click_id: "click-1",
        partner_id: "partner-1",
        order_ref: "ORD-1",
        amount: -5,
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("amount");
  });

  it("returns 403 for non-admin user", async () => {
    const app = buildApp();
    const res = await request(app, "POST", "/affiliates/commissions", {
      headers: userHeaders(),
      body: {
        click_id: "click-1",
        partner_id: "partner-1",
        order_ref: "ORD-1",
        amount: 10,
      },
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 4. GET /affiliates/commissions (admin only)
// ---------------------------------------------------------------------------
describe("GET /affiliates/commissions", () => {
  it("returns commission list for admin", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "com-1", amount: 12.5, status: "pending" }],
    } as any);

    const app = buildApp();
    const res = await request(app, "GET", "/affiliates/commissions", {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("supports status filter", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const app = buildApp();
    const res = await request(
      app,
      "GET",
      "/affiliates/commissions?status=paid",
      { headers: adminHeaders() }
    );
    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("acom.status"),
      expect.arrayContaining(["paid"])
    );
  });

  it("returns 403 for non-admin user", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/affiliates/commissions", {
      headers: userHeaders(),
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// 5. GET /affiliates/report (admin only)
// ---------------------------------------------------------------------------
describe("GET /affiliates/report", () => {
  it("returns summary report for admin", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          partner_id: "p-1",
          partner_name: "K-Rauta Affiliate",
          commission_rate: 0.05,
          total_clicks: 42,
          total_commissions: 5,
          pending_amount: 100,
          confirmed_amount: 200,
          paid_amount: 50,
          reversed_amount: 10,
          net_amount: 350,
        },
      ],
    } as any);

    const app = buildApp();
    const res = await request(app, "GET", "/affiliates/report", {
      headers: adminHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.body.period).toHaveProperty("start");
    expect(res.body.period).toHaveProperty("end");
    expect(res.body.partners).toHaveLength(1);
    expect(res.body.partners[0].partner_name).toBe("K-Rauta Affiliate");
    expect(res.body.partners[0].net_amount).toBe(350);
  });

  it("accepts custom date range parameters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const app = buildApp();
    const res = await request(
      app,
      "GET",
      "/affiliates/report?start=2025-01-01&end=2025-02-01",
      { headers: adminHeaders() }
    );

    expect(res.status).toBe(200);
    expect(res.body.period.start).toBe("2025-01-01");
    expect(res.body.period.end).toBe("2025-02-01");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("affiliate_partners"),
      expect.arrayContaining(["2025-01-01", "2025-02-01"])
    );
  });

  it("returns 403 for non-admin user", async () => {
    const app = buildApp();
    const res = await request(app, "GET", "/affiliates/report", {
      headers: userHeaders(),
    });
    expect(res.status).toBe(403);
  });
});
