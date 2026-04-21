process.env.NODE_ENV = "test";

import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] }),
  pool: { query: vi.fn() },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

import { query } from "../db";
const mockQuery = vi.mocked(query);

import app from "../index";

function authToken(userId = "user-1", role = "user") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
      const reqOpts: http.RequestOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method: method.toUpperCase(),
        headers: {
          "Content-Type": "application/json",
          ...opts.headers,
        },
      };

      const req = http.request(reqOpts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          server.close();
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      });

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

beforeEach(() => {
  delete process.env.KESKO_API_KEY;
  delete process.env.KESKO_SUBSCRIPTION_KEY;
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] } as never);
  vi.unstubAllGlobals();
});

describe("GET /kesko/products/search", () => {
  it("requires authentication", async () => {
    const res = await makeRequest("GET", "/kesko/products/search?q=osb");
    expect(res.status).toBe(401);
  });

  it("returns a graceful not-configured response without Kesko credentials", async () => {
    const res = await makeRequest("GET", "/kesko/products/search?q=osb", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      configured: false,
      source: "not_configured",
      products: [],
    });
  });

  it("normalizes live Kesko product results when credentials are configured", async () => {
    process.env.KESKO_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        products: [{
          productId: "6438313557401",
          productName: "Runko Prof kestopuu vihrea 48x148",
          price: "4,90",
          unit: "jm",
          availableQuantity: 24,
          productUrl: "https://www.k-rauta.fi/tuote/runko-prof/6438313557401",
        }],
      }),
    }));

    const res = await makeRequest("GET", "/kesko/products/search?q=runko", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { configured: boolean; products: { unitPrice: number; stockLevel: string }[] };
    expect(body.configured).toBe(true);
    expect(body.products[0].unitPrice).toBe(4.9);
    expect(body.products[0].stockLevel).toBe("in_stock");
  });
});

describe("POST /kesko/products/import", () => {
  it("imports a selected Kesko product into materials and pricing", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "lumber", display_name: "Lumber", display_name_fi: "Sahatavara" }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: "kesko_6438313557401",
          name: "Runko Prof kestopuu vihrea 48x148",
          category_id: "lumber",
          image_url: "https://images.k-rauta.fi/product.jpg",
          waste_factor: "1.05",
        }],
      } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: "pricing-1",
          material_id: "kesko_6438313557401",
          supplier_id: "k-rauta",
          unit: "jm",
          unit_price: "4.90",
          currency: "EUR",
          sku: "SKU-1",
          ean: "6438313557401",
          link: "https://www.k-rauta.fi/tuote/runko-prof/6438313557401",
          is_primary: true,
          in_stock: true,
          stock_level: "in_stock",
          store_location: "K-Rauta Lielahti",
          last_checked_at: "2026-04-21T09:00:00.000Z",
        }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("POST", "/kesko/products/import", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        product: {
          id: "6438313557401",
          materialId: "kesko_6438313557401",
          name: "Runko Prof kestopuu vihrea 48x148",
          ean: "6438313557401",
          sku: "SKU-1",
          unitPrice: 4.9,
          priceText: "4,90",
          currency: "EUR",
          unit: "jm",
          imageUrl: "https://images.k-rauta.fi/product.jpg",
          productUrl: "https://www.k-rauta.fi/tuote/runko-prof/6438313557401",
          stockLevel: "in_stock",
          stockQuantity: 24,
          storeName: "K-Rauta Lielahti",
          storeLocation: "K-Rauta Lielahti",
          categoryName: "Sahatavara",
          branchCode: "PK035-K-rauta-Lielahti",
          lastCheckedAt: "2026-04-21T09:00:00.000Z",
        },
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      material: { id: "kesko_6438313557401", pricing: [{ supplier_name: "K-Rauta" }] },
      bom_item: { material_id: "kesko_6438313557401", supplier: "K-Rauta" },
    });
    expect(mockQuery).toHaveBeenCalledTimes(5);
  });
});
