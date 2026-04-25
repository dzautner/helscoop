process.env.NODE_ENV = "test";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";
import {
  clearRenovationCostIndexCache,
  estimateRenovationCost,
  FINNISH_VAT_RATE,
  getRenovationCostIndexCatalog,
  parseStatFinCostIndex,
  RENOVATION_BASE_COSTS,
  STATFIN_COST_INDEX_ATTRIBUTION,
} from "../statfin-cost-index";

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

const metadata = {
  title: "Building cost index by type of cost, monthly data",
  variables: [
    { code: "Kuukausi", text: "Month", values: ["2026M01", "2026M02", "2026M03"], time: true },
    { code: "Perusvuosi", text: "Base year", values: ["2021_100"] },
    {
      code: "Indeksi",
      text: "Index",
      values: ["Kokonaisindeksi", "Työpanokset", "Tarvikepanokset", "Palvelut"],
    },
    { code: "Tiedot", text: "Information", values: ["pisteluku"] },
  ],
};

const jsonStatDataset = {
  version: "2.0",
  class: "dataset",
  source: "Statistics Finland, building cost index",
  updated: "2026-04-15T05:00:00Z",
  id: ["Kuukausi", "Perusvuosi", "Indeksi", "Tiedot"],
  size: [1, 1, 4, 1],
  dimension: {
    Kuukausi: { category: { index: { "2026M03": 0 }, label: { "2026M03": "2026M03" } } },
    Perusvuosi: { category: { index: { "2021_100": 0 }, label: { "2021_100": "2021=100" } } },
    Indeksi: {
      category: {
        index: { Kokonaisindeksi: 0, "Työpanokset": 1, "Tarvikepanokset": 2, Palvelut: 3 },
        label: {
          Kokonaisindeksi: "0 Total index",
          "Työpanokset": "01 Labour",
          "Tarvikepanokset": "02 Materials",
          Palvelut: "03 Services",
        },
      },
    },
    Tiedot: { category: { index: { pisteluku: 0 }, label: { pisteluku: "Index figure" } } },
  },
  value: [110, 120, 130, 100],
};

function stubStatFinFetch() {
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => (init?.method === "POST" ? jsonStatDataset : metadata),
  } as Response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  clearRenovationCostIndexCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearRenovationCostIndexCache();
});

describe("StatFin renovation cost index", () => {
  it("parses the latest JSON-stat RKI values into multipliers", () => {
    const parsed = parseStatFinCostIndex(jsonStatDataset, "2026M03");

    expect(parsed.period).toBe("2026M03");
    expect(parsed.values).toEqual({
      total: 110,
      labour: 120,
      materials: 130,
      services: 100,
    });
    expect(parsed.multipliers).toEqual({
      total: 1.1,
      labour: 1.2,
      materials: 1.3,
      services: 1,
    });
  });

  it("keeps at least eight homeowner renovation base-cost categories", () => {
    expect(RENOVATION_BASE_COSTS.length).toBeGreaterThanOrEqual(8);
    expect(RENOVATION_BASE_COSTS.map((category) => category.id)).toContain("window_replacement");
    expect(RENOVATION_BASE_COSTS.map((category) => category.id)).toContain("bathroom_renovation");
  });

  it("fetches StatFin metadata and data once, then serves the 24h cache", async () => {
    const fetchMock = stubStatFinFetch();

    const first = await getRenovationCostIndexCatalog({
      now: new Date("2026-04-23T08:00:00.000Z"),
    });
    const second = await getRenovationCostIndexCatalog({
      now: new Date("2026-04-23T09:00:00.000Z"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.cache.hit).toBe(false);
    expect(first.cache.ttlHours).toBe(24);
    expect(second.cache.hit).toBe(true);
    expect(second.source.latestPeriod).toBe("2026M03");
    expect(second.source.status).toBe("live");
  });

  it("calculates estimates with indexed base cost and 25.5% ALV", async () => {
    stubStatFinFetch();
    const catalog = await getRenovationCostIndexCatalog({
      now: new Date("2026-04-23T08:00:00.000Z"),
    });

    const estimate = estimateRenovationCost(catalog, "bathroom_renovation", 2);

    expect(estimate.vatRate).toBe(FINNISH_VAT_RATE);
    expect(estimate.category.statfinMultiplier).toBe(1.232);
    expect(estimate.subtotalExVat).toBe(3498.88);
    expect(estimate.vatAmount).toBe(892.21);
    expect(estimate.totalInclVat).toBe(4391.09);
    expect(estimate.source.attribution).toBe(STATFIN_COST_INDEX_ATTRIBUTION);
  });
});

describe("StatFin pricing routes", () => {
  it("returns the indexed renovation cost catalog with source attribution", async () => {
    stubStatFinFetch();

    const res = await makeRequest("GET", "/pricing/renovation-cost-index", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      source: { attribution: string; latestPeriod: string; status: string };
      categories: unknown[];
      vatRate: number;
    };
    expect(body.source.attribution).toBe(STATFIN_COST_INDEX_ATTRIBUTION);
    expect(body.source.latestPeriod).toBe("2026M03");
    expect(body.source.status).toBe("live");
    expect(body.vatRate).toBe(0.255);
    expect(body.categories.length).toBeGreaterThanOrEqual(8);
  });

  it("returns a single quantity estimate from the StatFin-indexed catalog", async () => {
    stubStatFinFetch();

    const res = await makeRequest("POST", "/pricing/renovation-cost-estimate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { categoryId: "window_replacement", quantity: 3 },
    });

    expect(res.status).toBe(200);
    const body = res.body as { category: { id: string }; quantity: number; totalInclVat: number; formula: string };
    expect(body.category.id).toBe("window_replacement");
    expect(body.quantity).toBe(3);
    expect(body.totalInclVat).toBeGreaterThan(0);
    expect(body.formula).toContain("ALV 25.5%");
  });

  it("rejects invalid estimate input", async () => {
    stubStatFinFetch();

    const res = await makeRequest("POST", "/pricing/renovation-cost-estimate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { categoryId: "unknown", quantity: 0 },
    });

    expect(res.status).toBe(400);
  });
});
