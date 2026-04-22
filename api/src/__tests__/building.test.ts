/**
 * Unit tests for the building lookup route.
 *
 * Tests address normalization, fuzzy matching, generic building generation,
 * LRU cache behavior, and HTTP endpoint validation.
 */

process.env.NODE_ENV = "test";
process.env.BUILDING_REGISTRY_ENABLED = "false";
delete process.env.DVV_API_KEY;
delete process.env.MML_API_KEY;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";

// ---------------------------------------------------------------------------
// Mock the DB and email modules BEFORE importing app
// ---------------------------------------------------------------------------
vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  pool: { query: vi.fn() },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

import app from "../index";

// ---------------------------------------------------------------------------
// HTTP request helper (same pattern as bom-validation.test.ts)
// ---------------------------------------------------------------------------
function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string> } = {}
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
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

      req.end();
    });
  });
}

// ---------------------------------------------------------------------------
// 1. Input validation
// ---------------------------------------------------------------------------
describe("GET /building — input validation", () => {
  it("rejects missing address parameter", async () => {
    const res = await makeRequest("GET", "/building");
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("required");
  });

  it("rejects empty address", async () => {
    const res = await makeRequest("GET", "/building?address=");
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("required");
  });

  it("rejects address shorter than 3 characters", async () => {
    const res = await makeRequest("GET", "/building?address=ab");
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("3");
  });

  it("accepts address with exactly 3 characters", async () => {
    const res = await makeRequest("GET", "/building?address=abc");
    expect(res.status).toBe(200);
  });

  it("rejects address longer than 200 characters", async () => {
    const longAddr = "a".repeat(201);
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent(longAddr)}`
    );
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("200");
  });

  it("accepts address with exactly 200 characters", async () => {
    const addr = "a".repeat(200);
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent(addr)}`
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 2. Demo address matching
// ---------------------------------------------------------------------------
describe("GET /building — demo address matching", () => {
  it("matches full Ribbingintie demo address", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ribbingintie 109-11, 00890 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as {
      address: string;
      confidence: string;
      building_info: { type: string };
    };
    expect(body.confidence).toBe("verified");
    expect(body.building_info.type).toBe("omakotitalo");
    expect(body.address).toContain("Ribbingintie");
  });

  it("matches partial Ribbingintie address (fuzzy)", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ribbingintie 109")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { confidence: string };
    expect(body.confidence).toBe("verified");
  });

  it("matches case-insensitive address", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("ribbingintie 109-11")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { confidence: string };
    expect(body.confidence).toBe("verified");
  });

  it("returns data_sources for demo match", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ribbingintie 109")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { data_sources: string[] };
    expect(body.data_sources).toBeDefined();
    expect(body.data_sources.length).toBeGreaterThan(0);
  });

  it("returns complete building_info for demo match", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ribbingintie 109")}`
    );
    expect(res.status).toBe(200);
    const info = (res.body as { building_info: Record<string, unknown> })
      .building_info;
    expect(info).toHaveProperty("type");
    expect(info).toHaveProperty("year_built");
    expect(info).toHaveProperty("material");
    expect(info).toHaveProperty("floors");
    expect(info).toHaveProperty("area_m2");
    expect(info).toHaveProperty("heating");
  });

  it("returns scene_js for demo match", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ribbingintie 109")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { scene_js: string };
    expect(body.scene_js).toBeDefined();
    expect(body.scene_js).toContain("scene.add");
  });

  it("returns bom_suggestion for demo match", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ribbingintie 109")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as {
      bom_suggestion: { material_id: string; quantity: number; unit: string }[];
    };
    expect(body.bom_suggestion).toBeDefined();
    expect(body.bom_suggestion.length).toBeGreaterThan(0);
    expect(body.bom_suggestion[0]).toHaveProperty("material_id");
    expect(body.bom_suggestion[0]).toHaveProperty("quantity");
    expect(body.bom_suggestion[0]).toHaveProperty("unit");
  });

  it("returns at least 12 verified curated demo addresses across metro building types", async () => {
    const addresses = [
      "Ribbingintie 109-11, 00890 Helsinki",
      "Uunimaentie 1, 01200 Vantaa",
      "Mannerheimintie 42, 00100 Helsinki",
      "Hameentie 11, 00530 Helsinki",
      "Lauttasaarentie 25, 00200 Helsinki",
      "Kaskenkaatajantie 9, 02140 Espoo",
      "Kuurinniityntie 7, 02750 Espoo",
      "Tapiolanranta 4, 02100 Espoo",
      "Pahkinarinteentie 18, 01710 Vantaa",
      "Leinelantie 8, 01340 Vantaa",
      "Puistolanraitio 6, 00760 Helsinki",
      "Rajamaentie 12, 05200 Rajamaki",
    ];

    const types = new Set<string>();
    const municipalities = new Set<string>();

    for (const address of addresses) {
      const res = await makeRequest(
        "GET",
        `/building?address=${encodeURIComponent(address)}`
      );
      expect(res.status).toBe(200);
      const body = res.body as {
        confidence: string;
        address: string;
        coordinates: { lat: number; lon: number };
        building_info: { type: string };
        scene_js: string;
      };
      expect(body.confidence).toBe("verified");
      expect(body.coordinates.lat).toBeGreaterThan(59);
      expect(body.coordinates.lon).toBeGreaterThan(23);
      expect(body.scene_js).toContain("scene.add");
      types.add(body.building_info.type);
      municipalities.add(body.address.split(",").at(-1)?.trim().split(" ").at(-1) ?? "");
    }

    expect(types.size).toBeGreaterThanOrEqual(4);
    expect(municipalities.size).toBeGreaterThanOrEqual(3);
  });

  it("does not match a demo when the same street has a different house number", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Mannerheimintie 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { confidence: string };
    expect(body.confidence).toBe("estimated");
  });

  it("matches accented Finnish street input against normalized demo keys", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Hämeentie 11, 00530 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { confidence: string; address: string };
    expect(body.confidence).toBe("verified");
    expect(body.address).toContain("Hameentie 11");
  });
});

// ---------------------------------------------------------------------------
// 3. Generic building fallback
// ---------------------------------------------------------------------------
describe("GET /building — generic building fallback", () => {
  it("returns estimated confidence for unknown address", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Tuntematon katu 42, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { confidence: string };
    expect(body.confidence).toBe("estimated");
  });

  it("generates kerrostalo for Helsinki downtown (postal 001xx)", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Mannerheimintie 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { building_info: { type: string } };
    expect(body.building_info.type).toBe("kerrostalo");
  });

  it("generates kerrostalo for dense Helsinki inner suburbs (postal 005xx)", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Kotikatu 5, 00500 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { building_info: { type: string } };
    expect(body.building_info.type).toBe("kerrostalo");
  });

  it("generates paritalo for smaller Espoo street patterns (postal 02xxx)", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Otakaari 1, 02150 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { building_info: { type: string } };
    expect(body.building_info.type).toBe("paritalo");
  });

  it("produces distinct generic models for different postal-code and street patterns", async () => {
    const addresses = [
      "Aleksanterinkatu 12, 00100 Helsinki",
      "Kotikatu 5, 00500 Helsinki",
      "Metsapolku 8, 00760 Helsinki",
      "Asematie 4, 01300 Vantaa",
      "Otakaari 1, 02150 Espoo",
      "Hirsitie 2, 05200 Rajamaki",
    ];

    const profiles = [];
    for (const address of addresses) {
      const res = await makeRequest(
        "GET",
        `/building?address=${encodeURIComponent(address)}`
      );
      expect(res.status).toBe(200);
      const body = res.body as {
        confidence: string;
        building_info: { type: string; year_built: number; area_m2: number; floors: number; material: string };
        data_sources: string[];
      };
      expect(body.confidence).toBe("estimated");
      expect(body.data_sources[0]).toContain(body.building_info.type);
      profiles.push(body.building_info);
    }

    const signatures = new Set(
      profiles.map((profile) => `${profile.type}-${profile.year_built}-${profile.area_m2}-${profile.floors}-${profile.material}`)
    );
    expect(signatures.size).toBe(addresses.length);
    expect(new Set(profiles.map((profile) => profile.type)).size).toBeGreaterThanOrEqual(4);
  });

  it("generates scene_js for generic building", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Testipolku 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { scene_js: string };
    expect(body.scene_js).toContain("scene.add");
    expect(body.scene_js).toContain("foundation");
  });

  it("generates bom_suggestion for generic building", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Testipolku 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as {
      bom_suggestion: { material_id: string; quantity: number }[];
    };
    expect(body.bom_suggestion.length).toBeGreaterThan(0);
    // Quantities should be proportional to area
    for (const item of body.bom_suggestion) {
      expect(item.quantity).toBeGreaterThan(0);
    }
  });

  it("generic building has default kaukolampo heating", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Testipolku 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { building_info: { heating: string } };
    expect(body.building_info.heating).toBe("kaukolampo");
  });

  it("generic downtown apartment uses flat roof type", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Testipolku 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { building_info: { roof_type: string } };
    expect(body.building_info.roof_type).toBe("tasakatto");
  });

  it("defaults to omakotitalo when postal code is not recognized", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Random street, 33100 Tampere")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { building_info: { type: string } };
    expect(body.building_info.type).toBe("omakotitalo");
  });

  it("generates multi-floor scene for kerrostalo", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Mannerheimintie 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as { scene_js: string; building_info: { floors: number } };
    expect(body.building_info.floors).toBeGreaterThanOrEqual(5);
    // Scene should have ground floor and upper floor references
    expect(body.scene_js).toContain("gf_front");
    // Should have at least one upper floor
    expect(body.scene_js).toContain("f1_front");
  });
});

// ---------------------------------------------------------------------------
// 4. External Finnish registry integration
// ---------------------------------------------------------------------------
describe("GET /building — Finnish registry integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.BUILDING_REGISTRY_ENABLED = "true";
    delete process.env.DVV_API_KEY;
    process.env.FMI_LOOKUP_ENABLED = "true";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.BUILDING_REGISTRY_ENABLED = "false";
    delete process.env.FMI_LOOKUP_ENABLED;
  });

  it("uses Ryhti/DVV building data when registry lookup succeeds", async () => {
    const mockFetch = vi.fn(async (input: unknown) => {
      const url = String(input);

      if (url.includes("/open_address/items")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            features: [
              {
                properties: {
                  address_fin: "Ulvilantie 2",
                  postal_code: "00350",
                  postal_office_fin: "Helsinki",
                },
                geometry: { coordinates: [24.87845, 60.20388] },
              },
            ],
          }),
        } as unknown as Response;
      }

      if (url.includes("opendata.fmi.fi")) {
        return {
          ok: true,
          statusText: "OK",
          text: async () =>
            "<BsWfs:ParameterValue>0</BsWfs:ParameterValue><BsWfs:ParameterValue>-5</BsWfs:ParameterValue>",
        } as unknown as Response;
      }

      if (url.includes("/avoimet_lupa_rakennukset/items")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            features: [
              {
                properties: {
                  paaasiallinen_kayttotarkoitus: "Erillinen pientalo",
                  valmistumispaivamaara: "1984-06-01",
                  kantavien_rakenteiden_rakennusaine: "betoni",
                  lammitysenergian_lahde: "Maalämpö",
                  kerrosluku: 2,
                  kokonaisala: 172,
                },
                geometry: { coordinates: [24.87846, 60.20389] },
              },
            ],
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    global.fetch = mockFetch as unknown as typeof fetch;

    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ulvilantie 2, 00350 Helsinki")}`
    );

    expect(res.status).toBe(200);
    const body = res.body as {
      confidence: string;
      address: string;
      data_sources: string[];
      climate_zone?: string;
      heating_degree_days?: number;
      building_info: {
        type: string;
        year_built: number;
        material: string;
        floors: number;
        area_m2: number;
        heating: string;
      };
    };

    expect(body.confidence).toBe("verified");
    expect(body.address).toContain("Ulvilantie 2");
    expect(body.building_info.type).toBe("omakotitalo");
    expect(body.building_info.year_built).toBe(1984);
    expect(body.building_info.material).toBe("betoni");
    expect(body.building_info.floors).toBe(2);
    expect(body.building_info.area_m2).toBe(172);
    expect(body.building_info.heating).toBe("maalampopumppu");
    expect(body.climate_zone).toBe("southern");
    expect(body.heating_degree_days).toBeGreaterThan(0);
    expect(body.data_sources.some((source) => source.includes("Ryhti / DVV rakennustiedot"))).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("falls back to estimated data and exposes data_source_error when registry lookup fails", async () => {
    process.env.FMI_LOOKUP_ENABLED = "false";
    global.fetch = vi.fn(async () => {
      throw new Error("registry unavailable");
    }) as unknown as typeof fetch;

    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Registry Failure Street 7, 33900 Tampere")}`
    );

    expect(res.status).toBe(200);
    const body = res.body as {
      confidence: string;
      data_sources: string[];
      data_source_error?: string;
    };

    expect(body.confidence).toBe("estimated");
    expect(body.data_sources).toContain("Yleinen omakotitalomalli");
    expect(body.data_source_error).toContain("Finnish registry lookup failed");
  });
});

// ---------------------------------------------------------------------------
// 5. Cache behavior
// ---------------------------------------------------------------------------
describe("GET /building — caching", () => {
  it("returns consistent results for the same address", async () => {
    const addr = encodeURIComponent("Cache test street 1, 00100 Helsinki");

    const res1 = await makeRequest("GET", `/building?address=${addr}`);
    const res2 = await makeRequest("GET", `/building?address=${addr}`);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Same address should yield same building data
    const body1 = res1.body as { building_info: { type: string } };
    const body2 = res2.body as { building_info: { type: string } };
    expect(body1.building_info.type).toBe(body2.building_info.type);
  });

  it("normalizes addresses for cache matching (case insensitive)", async () => {
    const addr1 = encodeURIComponent("CacheTest 1, 00100 Helsinki");
    const addr2 = encodeURIComponent("cachetest 1, 00100 helsinki");

    const res1 = await makeRequest("GET", `/building?address=${addr1}`);
    const res2 = await makeRequest("GET", `/building?address=${addr2}`);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const body1 = res1.body as { building_info: { type: string } };
    const body2 = res2.body as { building_info: { type: string } };
    expect(body1.building_info.type).toBe(body2.building_info.type);
  });
});

// ---------------------------------------------------------------------------
// 6. Response shape
// ---------------------------------------------------------------------------
describe("GET /building — response shape", () => {
  it("includes all required fields in response", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ribbingintie 109")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("address");
    expect(body).toHaveProperty("coordinates");
    expect(body).toHaveProperty("building_info");
    expect(body).toHaveProperty("scene_js");
    expect(body).toHaveProperty("bom_suggestion");
    expect(body).toHaveProperty("confidence");
    expect(body).toHaveProperty("data_sources");
  });

  it("coordinates have lat and lon", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Ribbingintie 109")}`
    );
    expect(res.status).toBe(200);
    const coords = (res.body as { coordinates: { lat: number; lon: number } })
      .coordinates;
    expect(coords.lat).toBeTypeOf("number");
    expect(coords.lon).toBeTypeOf("number");
  });
});
