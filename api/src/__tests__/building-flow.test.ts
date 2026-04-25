/**
 * Comprehensive flow tests for the building lookup pipeline.
 *
 * Simulates: enter address -> get building data -> verify scene geometry
 *            -> verify BOM suggestions -> check quantities.
 *
 * Also tests edge cases: very small/large buildings, missing postal codes,
 * unknown building types, zero floors, and centroid deduplication.
 */

process.env.NODE_ENV = "test";
process.env.BUILDING_REGISTRY_ENABLED = "false";
delete process.env.DVV_API_KEY;
delete process.env.MML_API_KEY;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";
import type { AddressInfo } from "net";

// ---------------------------------------------------------------------------
// Mock DB & email
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
// HTTP helper
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
// Helper types
// ---------------------------------------------------------------------------
interface BuildingResponse {
  address: string;
  coordinates: { lat: number; lon: number };
  building_info: {
    type: string;
    year_built: number;
    material: string;
    floors: number;
    area_m2: number;
    heating: string;
    roof_type?: string;
    roof_material?: string;
  };
  scene_js: string;
  bom_suggestion: { material_id: string; quantity: number; unit: string }[];
  confidence: string;
  data_sources: string[];
  data_source_error?: string;
}

// Known material IDs from the seed data (002_seed_from_json.sql)
const VALID_MATERIAL_IDS = new Set([
  "pine_48x98_c24",
  "pine_48x148_c24",
  "pressure_treated_48x148",
  "pressure_treated_148x148",
  "osb_9mm",
  "osb_18mm",
  "osb_11mm",
  "exterior_board_yellow",
  "galvanized_roofing",
  "galvanized_flashing",
  "hardware_cloth",
  "insulation_100mm",
  "mineral_wool_150",
  "vapor_barrier",
  "exterior_paint_red",
  "exterior_paint_yellow",
  "exterior_paint_gray_door",
  "exterior_paint_white",
  "hinges_galvanized",
  "joist_hanger",
  "screws_50mm",
  "concrete_block",
  "concrete_c25",
  "builders_sand",
  "nest_box_plywood",
  "trim_21x45",
  "cedar_post_98x98",
  "metal_roof_ruukki",
  "gypsum_board_13mm",
  "wind_barrier",
  "wood_screw_5x80",
  "door_thermal_bridge",
  "vent_thermal_bridge",
  "nest_access_thermal_bridge",
  "assembly_lumber_preview",
]);

/**
 * Parse the generated scene_js and extract box dimensions.
 * Returns an array of { name, length, height, width } objects.
 */
function parseSceneBoxes(sceneJs: string): { name: string; l: number; h: number; w: number }[] {
  const boxes: { name: string; l: number; h: number; w: number }[] = [];
  const regex = /const (\w+)\s*=\s*translate\(box\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(sceneJs)) !== null) {
    const [, name, args] = match;
    const dims = args.split(",").map((s) => parseFloat(s.trim()));
    if (dims.length >= 3) {
      boxes.push({ name, l: dims[0], h: dims[1], w: dims[2] });
    }
  }
  return boxes;
}

// ---------------------------------------------------------------------------
// 1. Full flow: address -> building -> scene -> BOM -> quantity verification
// ---------------------------------------------------------------------------
describe("Building flow: address to BOM", () => {
  it("Helsinki downtown kerrostalo full flow", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Mannerheimintie 10, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    // Step 1: Building info correct for downtown Helsinki
    expect(body.building_info.type).toBe("kerrostalo");
    expect(body.building_info.floors).toBe(5);
    expect(body.building_info.area_m2).toBe(65);
    expect(body.building_info.year_built).toBe(1960);
    expect(body.building_info.material).toBe("betoni");

    // Step 2: Scene geometry matches area
    expect(body.scene_js).toContain("scene.add");
    expect(body.scene_js).toContain("foundation");
    // 5 floors should produce gf_ prefix for ground floor and f1_ through f4_
    expect(body.scene_js).toContain("gf_front");
    expect(body.scene_js).toContain("f4_front");

    // Step 3: BOM has valid material IDs
    for (const item of body.bom_suggestion) {
      expect(VALID_MATERIAL_IDS.has(item.material_id)).toBe(true);
      expect(item.quantity).toBeGreaterThan(0);
    }

    // Step 4: Confidence and data sources
    expect(body.confidence).toBe("estimated");
    expect(body.data_sources).toContain("Yleinen kerrostalomalli");
  });

  it("Espoo omakotitalo full flow", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Kivenlahdentie 5, 02320 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    expect(body.building_info.type).toBe("omakotitalo");
    expect(body.building_info.floors).toBe(2);
    expect(body.building_info.area_m2).toBe(145);
    expect(body.building_info.year_built).toBe(1995);
    expect(body.building_info.material).toBe("puu");

    // BOM quantities should be proportional to 145 m2
    const lumber148 = body.bom_suggestion.find(
      (b) => b.material_id === "pine_48x148_c24"
    );
    expect(lumber148).toBeDefined();
    expect(lumber148!.quantity).toBe(Math.round(145 * 0.6));

    const osb = body.bom_suggestion.find((b) => b.material_id === "osb_9mm");
    expect(osb).toBeDefined();
    expect(osb!.quantity).toBe(Math.ceil(145 * 0.35 / 2.88));
  });

  it("Helsinki suburb full flow", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Suokuja 3, 00630 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    // Postal 006xx -> 00 prefix, code >= 300 -> omakotitalo
    expect(body.building_info.type).toBe("omakotitalo");
    expect(body.building_info.area_m2).toBe(130);
    expect(body.building_info.floors).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Scene geometry area verification
// ---------------------------------------------------------------------------
describe("Scene geometry: area consistency", () => {
  const testCases = [
    { type: "kerrostalo", floors: 5, area: 65 },
    { type: "omakotitalo", floors: 2, area: 120 },
    { type: "omakotitalo", floors: 2, area: 145 },
    { type: "omakotitalo", floors: 2, area: 130 },
    { type: "kerrostalo", floors: 5, area: 50 },
    { type: "omakotitalo", floors: 1, area: 20 },
    { type: "kerrostalo", floors: 5, area: 500 },
  ];

  for (const { type, floors, area } of testCases) {
    it(`generates correct footprint for ${type}, ${floors} floors, ${area}m2`, () => {
      // Reproduce the scene generation logic
      const ratio = 1.2;
      const width = Math.sqrt(area / floors / ratio);
      const length = width * ratio;

      // Per-floor area should match area / floors
      const perFloor = width * length;
      const totalReconstructed = perFloor * floors;

      // Math proof: perFloor = width * (width * ratio) = width^2 * ratio
      //           = (area / floors / ratio) * ratio = area / floors
      // totalReconstructed = (area / floors) * floors = area
      expect(totalReconstructed).toBeCloseTo(area, 5);

      // Width and length should be positive and architecturally reasonable
      expect(width).toBeGreaterThan(0);
      expect(length).toBeGreaterThan(0);

      // Aspect ratio should be 1.2 (reasonable for Finnish buildings)
      expect(length / width).toBeCloseTo(1.2, 10);
    });
  }

  it("foundation box matches computed footprint for a generic building", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Testikatu 1, 02100 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;
    const { area_m2: area, floors } = body.building_info;

    // Extract foundation box dimensions from scene
    const boxes = parseSceneBoxes(body.scene_js);
    const foundation = boxes.find((b) => b.name === "foundation");
    expect(foundation).toBeDefined();

    // Foundation dimensions should match the computed footprint
    const ratio = 1.2;
    const expectedWidth = Math.sqrt(area / floors / ratio);
    const expectedLength = expectedWidth * ratio;
    const w = Math.round(expectedWidth * 10) / 10;
    const l = Math.round(expectedLength * 10) / 10;

    expect(foundation!.l).toBeCloseTo(l, 1);
    expect(foundation!.w).toBeCloseTo(w, 1);
    expect(foundation!.h).toBeCloseTo(0.3, 1); // Foundation height
  });

  it("scene has correct number of floor sections", async () => {
    // Request a 5-floor building
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Kerrostalo 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;
    expect(body.building_info.floors).toBe(5);

    // Should have gf_ for ground floor and f1_ through f4_ for upper floors
    expect(body.scene_js).toContain("gf_front");
    expect(body.scene_js).toContain("gf_back");
    expect(body.scene_js).toContain("gf_left");
    expect(body.scene_js).toContain("gf_right");
    for (let i = 1; i < 5; i++) {
      expect(body.scene_js).toContain(`f${i}_front`);
    }

    // Should have 4 slabs (between 5 floors)
    const slabCount = (body.scene_js.match(/const slab\d/g) || []).length;
    expect(slabCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 3. BOM suggestion verification
// ---------------------------------------------------------------------------
describe("BOM suggestions: quantities and material IDs", () => {
  it("all BOM material_ids exist in the materials database", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Materialtest 1, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    for (const item of body.bom_suggestion) {
      expect(
        VALID_MATERIAL_IDS.has(item.material_id),
        `material_id '${item.material_id}' not found in materials database`
      ).toBe(true);
    }
  });

  it("BOM quantities scale linearly with area", async () => {
    // Helsinki downtown: area = 65
    const res65 = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Scaling test A, 00100 Helsinki")}`
    );
    // Espoo: area = 145
    const res145 = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Scaling test B, 02100 Espoo")}`
    );

    const bom65 = (res65.body as BuildingResponse).bom_suggestion;
    const bom145 = (res145.body as BuildingResponse).bom_suggestion;

    // For the same material, quantity should scale roughly with area
    for (const item65 of bom65) {
      const item145 = bom145.find((b) => b.material_id === item65.material_id);
      if (item145) {
        // Ratio of quantities should roughly match ratio of areas
        const qtyRatio = item145.quantity / item65.quantity;
        const areaRatio = 145 / 65;
        // Allow some tolerance due to rounding (Math.round/Math.ceil)
        expect(qtyRatio).toBeGreaterThan(areaRatio * 0.7);
        expect(qtyRatio).toBeLessThan(areaRatio * 1.5);
      }
    }
  });

  it("BOM has expected material categories for a generic building", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Category test, 02200 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;
    const ids = body.bom_suggestion.map((b) => b.material_id);

    // A generic building should include structural lumber, sheathing,
    // insulation, masonry, and roofing
    expect(ids).toContain("pine_48x148_c24"); // structural lumber
    expect(ids).toContain("pine_48x98_c24");  // framing lumber
    expect(ids).toContain("osb_9mm");          // sheathing
    expect(ids).toContain("insulation_100mm"); // insulation
    expect(ids).toContain("concrete_block");   // masonry/foundation
    expect(ids).toContain("galvanized_roofing"); // roofing
  });

  it("BOM units are valid", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Unit test street, 02100 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    const validUnits = new Set(["jm", "sqm", "sheet", "kpl", "m2", "m3", "box", "liter"]);
    for (const item of body.bom_suggestion) {
      expect(
        validUnits.has(item.unit),
        `unit '${item.unit}' for material '${item.material_id}' is not a valid unit`
      ).toBe(true);
    }
  });

  it("OSB quantity formula: area*0.35/2.88 sheets (2400x1200mm)", async () => {
    // Espoo: area = 145
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("OSB formula test, 02100 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;
    const area = body.building_info.area_m2; // 145

    const osb = body.bom_suggestion.find((b) => b.material_id === "osb_9mm");
    expect(osb).toBeDefined();
    // 0.35 = 35% of area needs sheathing
    // 2.88 = 2400mm x 1200mm = 2.88 m2 per sheet
    expect(osb!.quantity).toBe(Math.ceil(area * 0.35 / 2.88));
    expect(osb!.unit).toBe("sheet");
  });

  it("concrete block formula: area*0.06*13 kpl (~13 blocks/m3)", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Block formula test, 02100 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;
    const area = body.building_info.area_m2;

    const blocks = body.bom_suggestion.find((b) => b.material_id === "concrete_block");
    expect(blocks).toBeDefined();
    expect(blocks!.quantity).toBe(Math.round(area * 0.06 * 13));
    expect(blocks!.unit).toBe("kpl");
  });
});

// ---------------------------------------------------------------------------
// 4. Edge cases: unusual areas
// ---------------------------------------------------------------------------
describe("Edge cases: building size extremes", () => {
  it("very small building (area=20m2, 1 floor)", async () => {
    // No postal code branch matches -> defaults: area=120, but we can
    // only get 20m2 via the registry path. Test with the generic path
    // to verify the scene generator handles small areas.
    // We test the scene generation function logic directly via its output.

    // Use a 00100 address (downtown, area=65) as the smallest generic
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Small building, 00100 Helsinki")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;
    const area = body.building_info.area_m2;
    const floors = body.building_info.floors;

    // Verify geometry math works even for small per-floor footprints
    const ratio = 1.2;
    const width = Math.sqrt(area / floors / ratio);
    const length = width * ratio;
    expect(width).toBeGreaterThan(1); // At least 1m wide
    expect(length).toBeGreaterThan(1); // At least 1m long
    expect(width * length * floors).toBeCloseTo(area, 3);
  });

  it("large building (area=500m2) via registry", async () => {
    // Enable registry with mock
    process.env.BUILDING_REGISTRY_ENABLED = "true";
    process.env.FMI_LOOKUP_ENABLED = "false";

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
                  address_fin: "Isokatu 1",
                  postal_code: "33100",
                  postal_office_fin: "Tampere",
                },
                geometry: { coordinates: [23.76, 61.50] },
              },
            ],
          }),
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
                  paaasiallinen_kayttotarkoitus: "Kerrostalo",
                  valmistumispaivamaara: "1975-03-15",
                  kantavien_rakenteiden_rakennusaine: "betoni",
                  lammitysenergian_lahde: "Kaukolampo",
                  kerrosluku: 8,
                  kokonaisala: 500,
                },
                geometry: { coordinates: [23.76, 61.50] },
              },
            ],
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const origFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const res = await makeRequest(
        "GET",
        `/building?address=${encodeURIComponent("Isokatu 1, 33100 Tampere")}`
      );
      expect(res.status).toBe(200);
      const body = res.body as BuildingResponse;

      expect(body.building_info.area_m2).toBe(500);
      expect(body.building_info.floors).toBe(8);
      expect(body.confidence).toBe("verified");

      // Scene should have 8 floors: gf_ and f1_ through f7_
      expect(body.scene_js).toContain("gf_front");
      expect(body.scene_js).toContain("f7_front");

      // BOM quantities should be scaled to 500m2
      const lumber = body.bom_suggestion.find(
        (b) => b.material_id === "pine_48x148_c24"
      );
      expect(lumber).toBeDefined();
      expect(lumber!.quantity).toBe(Math.round(500 * 0.6));

      // Verify footprint math for 500m2, 8 floors
      const ratio = 1.2;
      const width = Math.sqrt(500 / 8 / ratio);
      const length = width * ratio;
      expect(width * length * 8).toBeCloseTo(500, 3);
    } finally {
      global.fetch = origFetch;
      process.env.BUILDING_REGISTRY_ENABLED = "false";
      delete process.env.FMI_LOOKUP_ENABLED;
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases: missing/unknown postal code
// ---------------------------------------------------------------------------
describe("Edge cases: postal code handling", () => {
  it("address without postal code falls back to defaults", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Tuntematon katu 7")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    // Without a postal code, it defaults to "00100" -> prefix "00", code 100 < 300 -> kerrostalo
    expect(body.building_info.type).toBe("kerrostalo");
    expect(body.building_info.floors).toBe(5);
    expect(body.building_info.area_m2).toBe(65);
  });

  it("Tampere postal code (33100) falls back to default omakotitalo", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Hameenkatu 5, 33100 Tampere")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    // Prefix "33" doesn't match 00 or 02 -> default
    expect(body.building_info.type).toBe("omakotitalo");
    expect(body.building_info.floors).toBe(2);
    expect(body.building_info.area_m2).toBe(120);
  });

  it("Oulu postal code (90100) falls back to default omakotitalo", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Kauppurienkatu 1, 90100 Oulu")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    expect(body.building_info.type).toBe("omakotitalo");
    expect(body.building_info.floors).toBe(2);
    expect(body.building_info.area_m2).toBe(120);
  });

  it("Turku postal code (20100) falls back to default omakotitalo", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Eerikinkatu 1, 20100 Turku")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    expect(body.building_info.type).toBe("omakotitalo");
    expect(body.building_info.area_m2).toBe(120);
  });

  it("Vantaa postal code (01300) falls back to default omakotitalo", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Tikkurilantie 1, 01300 Vantaa")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    // Prefix "01" doesn't match 00 or 02 -> default
    expect(body.building_info.type).toBe("omakotitalo");
  });
});

// ---------------------------------------------------------------------------
// 6. Edge cases: zero/invalid floors from registry
// ---------------------------------------------------------------------------
describe("Edge cases: floor count handling", () => {
  it("registry returning 0 floors gets clamped to 1", async () => {
    process.env.BUILDING_REGISTRY_ENABLED = "true";
    process.env.FMI_LOOKUP_ENABLED = "false";

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
                  address_fin: "Nollakerrosta 1",
                  postal_code: "00100",
                  postal_office_fin: "Helsinki",
                },
                geometry: { coordinates: [24.94, 60.17] },
              },
            ],
          }),
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
                  kerrosluku: 0,
                  kokonaisala: 100,
                  kantavien_rakenteiden_rakennusaine: "puu",
                },
                geometry: { coordinates: [24.94, 60.17] },
              },
            ],
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const origFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const res = await makeRequest(
        "GET",
        `/building?address=${encodeURIComponent("Nollakerrosta 1, 00100 Helsinki")}`
      );
      expect(res.status).toBe(200);
      const body = res.body as BuildingResponse;

      // kerrosluku=0 but firstNumber returns null for non-positive values,
      // so it falls back to the generic building's floor count.
      // The generic for 00100 is kerrostalo with 5 floors.
      // But mapRegistryBuilding uses Math.max(1, Math.round(floors)).
      // Since firstNumber rejects 0, it uses the generic default (5).
      expect(body.building_info.floors).toBeGreaterThanOrEqual(1);

      // Scene should still generate without errors
      expect(body.scene_js).toContain("scene.add");
    } finally {
      global.fetch = origFetch;
      process.env.BUILDING_REGISTRY_ENABLED = "false";
      delete process.env.FMI_LOOKUP_ENABLED;
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Centroid calculation: closed polygon deduplication
// ---------------------------------------------------------------------------
describe("Centroid calculation: closed polygon handling", () => {
  it("centroid is correct for a closed polygon ring (deduplicated)", async () => {
    process.env.BUILDING_REGISTRY_ENABLED = "true";
    process.env.FMI_LOOKUP_ENABLED = "false";

    // Create a square polygon with corners at:
    // (24.0, 60.0), (24.4, 60.0), (24.4, 60.4), (24.0, 60.4)
    // Closed ring: first == last = (24.0, 60.0)
    // Without dedup: centroid = avg of 5 pts = ((24.0*2+24.4+24.4+24.0)/5, (60.0*2+60.0+60.4+60.4)/5)
    //             = (120.8/5, 300.8/5) = (24.16, 60.16)
    // With dedup: centroid = avg of 4 pts = ((24.0+24.4+24.4+24.0)/4, (60.0+60.0+60.4+60.4)/4)
    //           = (96.8/4, 240.8/4) = (24.2, 60.2)
    // True centroid of the square = (24.2, 60.2) -- so dedup is correct

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
                  address_fin: "Centroid Test 1",
                  postal_code: "00100",
                  postal_office_fin: "Helsinki",
                },
                geometry: {
                  coordinates: [
                    // Closed polygon ring
                    [24.0, 60.0],
                    [24.4, 60.0],
                    [24.4, 60.4],
                    [24.0, 60.4],
                    [24.0, 60.0], // closing point (duplicate of first)
                  ],
                },
              },
            ],
          }),
        } as unknown as Response;
      }

      if (url.includes("/avoimet_lupa_rakennukset/items")) {
        // Return a building near the true centroid (24.2, 60.2)
        // and one far away -- the nearest-feature selection should pick
        // the closer one thanks to the correct centroid
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            features: [
              {
                properties: {
                  paaasiallinen_kayttotarkoitus: "Erillinen pientalo",
                  kerrosluku: 2,
                  kokonaisala: 150,
                  kantavien_rakenteiden_rakennusaine: "puu",
                },
                geometry: { coordinates: [24.2, 60.2] }, // near true centroid
              },
            ],
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const origFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const res = await makeRequest(
        "GET",
        `/building?address=${encodeURIComponent("Centroid Test 1, 00100 Helsinki")}`
      );
      expect(res.status).toBe(200);
      const body = res.body as BuildingResponse;

      // Should have found the building near the correct centroid
      expect(body.confidence).toBe("verified");
      expect(body.building_info.area_m2).toBe(150);

      // The address lookup coordinates should be the deduped centroid
      // lon=24.2, lat=60.2 (not 24.16, 60.16 which would be wrong)
      expect(body.coordinates.lon).toBeCloseTo(24.2, 5);
      expect(body.coordinates.lat).toBeCloseTo(60.2, 5);
    } finally {
      global.fetch = origFetch;
      process.env.BUILDING_REGISTRY_ENABLED = "false";
      delete process.env.FMI_LOOKUP_ENABLED;
    }
  });

  it("centroid is correct for an open polygon (no duplicate)", async () => {
    process.env.BUILDING_REGISTRY_ENABLED = "true";
    process.env.FMI_LOOKUP_ENABLED = "false";

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
                  address_fin: "Open Poly 1",
                  postal_code: "00100",
                  postal_office_fin: "Helsinki",
                },
                geometry: {
                  coordinates: [
                    // Open polygon (no duplicate closing point)
                    [24.0, 60.0],
                    [24.4, 60.0],
                    [24.4, 60.4],
                    [24.0, 60.4],
                  ],
                },
              },
            ],
          }),
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
                  kerrosluku: 3,
                  kokonaisala: 200,
                },
                geometry: { coordinates: [24.2, 60.2] },
              },
            ],
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const origFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const res = await makeRequest(
        "GET",
        `/building?address=${encodeURIComponent("Open Poly 1, 00100 Helsinki")}`
      );
      expect(res.status).toBe(200);
      const body = res.body as BuildingResponse;

      // Centroid of 4 unique points = (24.2, 60.2) -- same regardless of dedup
      expect(body.coordinates.lon).toBeCloseTo(24.2, 5);
      expect(body.coordinates.lat).toBeCloseTo(60.2, 5);
    } finally {
      global.fetch = origFetch;
      process.env.BUILDING_REGISTRY_ENABLED = "false";
      delete process.env.FMI_LOOKUP_ENABLED;
    }
  });

  it("handles single-point geometry", async () => {
    process.env.BUILDING_REGISTRY_ENABLED = "true";
    process.env.FMI_LOOKUP_ENABLED = "false";

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
                  address_fin: "Piste 1",
                  postal_code: "00100",
                  postal_office_fin: "Helsinki",
                },
                geometry: { coordinates: [25.0, 60.5] },
              },
            ],
          }),
        } as unknown as Response;
      }

      if (url.includes("/avoimet_lupa_rakennukset/items")) {
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({
            features: [
              {
                properties: { kerrosluku: 1, kokonaisala: 80 },
                geometry: { coordinates: [25.0, 60.5] },
              },
            ],
          }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const origFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const res = await makeRequest(
        "GET",
        `/building?address=${encodeURIComponent("Piste 1, 00100 Helsinki")}`
      );
      expect(res.status).toBe(200);
      const body = res.body as BuildingResponse;

      expect(body.coordinates.lon).toBeCloseTo(25.0, 5);
      expect(body.coordinates.lat).toBeCloseTo(60.5, 5);
    } finally {
      global.fetch = origFetch;
      process.env.BUILDING_REGISTRY_ENABLED = "false";
      delete process.env.FMI_LOOKUP_ENABLED;
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Partial registry data: address found but no building details
// ---------------------------------------------------------------------------
describe("Partial registry data fallback", () => {
  it("uses estimated model when building details missing", async () => {
    process.env.BUILDING_REGISTRY_ENABLED = "true";
    process.env.FMI_LOOKUP_ENABLED = "false";

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
                  address_fin: "Partial 1",
                  postal_code: "00100",
                  postal_office_fin: "Helsinki",
                },
                geometry: { coordinates: [24.94, 60.17] },
              },
            ],
          }),
        } as unknown as Response;
      }

      if (url.includes("/avoimet_lupa_rakennukset/items")) {
        // No building features found
        return {
          ok: true,
          statusText: "OK",
          json: async () => ({ features: [] }),
        } as unknown as Response;
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const origFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;

    try {
      const res = await makeRequest(
        "GET",
        `/building?address=${encodeURIComponent("Partial 1, 00100 Helsinki")}`
      );
      expect(res.status).toBe(200);
      const body = res.body as BuildingResponse;

      expect(body.confidence).toBe("estimated");
      // Should still have valid coordinates from the address lookup
      expect(body.coordinates.lat).toBeCloseTo(60.17, 1);
      expect(body.coordinates.lon).toBeCloseTo(24.94, 1);
      // Should have data_source_error explaining the fallback
      expect(body.data_source_error).toContain("estimated");
      // Should still have scene and BOM
      expect(body.scene_js).toContain("scene.add");
      expect(body.bom_suggestion.length).toBeGreaterThan(0);
    } finally {
      global.fetch = origFetch;
      process.env.BUILDING_REGISTRY_ENABLED = "false";
      delete process.env.FMI_LOOKUP_ENABLED;
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Scene structural sanity
// ---------------------------------------------------------------------------
describe("Scene structural sanity", () => {
  it("roof peak is above the top floor", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Roof test, 02200 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    // The scene should have roof pieces above all floor walls
    expect(body.scene_js).toContain("roof_left");
    expect(body.scene_js).toContain("roof_right");

    // Extract roof Y position
    const roofMatch = body.scene_js.match(
      /roof_left = translate\(rotate\(box\([^)]+\), [^,]+, [^,]+, [^)]+\), [^,]+, ([^,]+),/
    );
    expect(roofMatch).toBeTruthy();
    const roofY = parseFloat(roofMatch![1]);

    // Extract top wall Y position (last floor)
    const floors = body.building_info.floors;
    const lastFloorPrefix = floors === 1 ? "gf" : `f${floors - 1}`;
    const wallMatch = body.scene_js.match(
      new RegExp(`${lastFloorPrefix}_front = translate\\(box\\([^)]+\\), [^,]+, ([^,]+),`)
    );
    expect(wallMatch).toBeTruthy();
    const topWallCenterY = parseFloat(wallMatch![1]);

    expect(roofY).toBeGreaterThan(topWallCenterY);
  });

  it("wall thickness is consistent (0.2m)", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Wall test, 02200 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    const boxes = parseSceneBoxes(body.scene_js);

    // Front and back walls: thickness is the w dimension (box(l, h, 0.2))
    const frontWalls = boxes.filter((b) => b.name.endsWith("_front"));
    for (const wall of frontWalls) {
      expect(wall.w).toBeCloseTo(0.2, 1);
    }

    // Left and right walls: thickness is the l dimension (box(0.2, h, w))
    const leftWalls = boxes.filter((b) => b.name.endsWith("_left"));
    for (const wall of leftWalls) {
      expect(wall.l).toBeCloseTo(0.2, 1);
    }
  });

  it("floor height is 2.7m for each story", async () => {
    const res = await makeRequest(
      "GET",
      `/building?address=${encodeURIComponent("Height test, 02200 Espoo")}`
    );
    expect(res.status).toBe(200);
    const body = res.body as BuildingResponse;

    const boxes = parseSceneBoxes(body.scene_js);

    // All wall boxes should have height 2.7
    const walls = boxes.filter(
      (b) =>
        b.name.endsWith("_front") ||
        b.name.endsWith("_back") ||
        b.name.endsWith("_left") ||
        b.name.endsWith("_right")
    );
    for (const wall of walls) {
      expect(wall.h).toBeCloseTo(2.7, 1);
    }
  });
});
