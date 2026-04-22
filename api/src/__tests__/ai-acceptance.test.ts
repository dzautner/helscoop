/**
 * AI acceptance suite — Finnish renovation golden tasks (#655)
 *
 * Validates that the chat endpoint correctly handles Finnish renovation
 * prompts by mocking the Anthropic API. Tests cover scene editing,
 * material questions, cost queries, building code, and context injection.
 *
 * No real API key is required — all Anthropic calls are intercepted.
 */

process.env.NODE_ENV = "test";
// Set a fake API key so the endpoint takes the Anthropic API path (not the local fallback)
process.env.ANTHROPIC_API_KEY = "sk-ant-test-fake-key-for-acceptance";

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// ---------------------------------------------------------------------------
// Mock DB and email (same pattern as chat.test.ts)
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

// ---------------------------------------------------------------------------
// Mock global.fetch to intercept Anthropic API calls
// ---------------------------------------------------------------------------
const fetchSpy = vi.fn();
const originalFetch = global.fetch;
global.fetch = fetchSpy as unknown as typeof global.fetch;

afterAll(() => {
  global.fetch = originalFetch;
});

/** Build a mock Anthropic API response */
function mockAnthropicResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        content: [{ type: "text", text }],
      }),
  };
}

/** Return a captured request body from the last fetch call */
function lastRequestBody(): {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
} {
  const [, opts] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
  return JSON.parse(opts.body as string);
}

/** Return captured request headers from the last fetch call */
function lastRequestHeaders(): Record<string, string> {
  const [, opts] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
  return opts.headers as Record<string, string>;
}

import app from "../index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authToken(userId = "user-1") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role: "user" },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

const TOKEN = authToken();

function postChat(body: Record<string, unknown>): Promise<{
  status: number;
  body: { role: string; content: string };
}> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = JSON.stringify(body);
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/chat",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TOKEN}`,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            try {
              resolve({
                status: res.statusCode || 0,
                body: JSON.parse(data),
              });
            } catch {
              resolve({ status: res.statusCode || 0, body: { role: "", content: data } });
            }
          });
        },
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      req.write(bodyStr);
      req.end();
    });
  });
}

const SAMPLE_SCENE = `const floor = box(8, 0.2, 6);
const wall1 = translate(box(8, 3, 0.2), 0, 1.6, -2.9);
const wall2 = translate(box(8, 3, 0.2), 0, 1.6, 2.9);
const wall3 = translate(box(0.2, 3, 6), -3.9, 1.6, 0);
const wall4 = translate(box(0.2, 3, 6), 3.9, 1.6, 0);
scene.add(floor, { material: "concrete_c25", color: [0.8, 0.8, 0.8] });
scene.add(wall1, { material: "pine_48x148_c24", color: [0.85, 0.75, 0.55] });
scene.add(wall2, { material: "pine_48x148_c24", color: [0.85, 0.75, 0.55] });
scene.add(wall3, { material: "pine_48x148_c24", color: [0.85, 0.75, 0.55] });
scene.add(wall4, { material: "pine_48x148_c24", color: [0.85, 0.75, 0.55] });`;

const SAMPLE_BOM = [
  { material: "pine_48x148_c24", qty: 120, unit: "jm", total: 480.0 },
  { material: "concrete_c25", qty: 4.8, unit: "m³", total: 576.0 },
  { material: "rockwool_66", qty: 45, unit: "m²", total: 337.5 },
];

const SAMPLE_BUILDING_INFO = {
  address: "Mannerheimintie 1, Helsinki",
  type: "omakotitalo",
  year_built: 1978,
  area_m2: 142,
  floors: 2,
  material: "puu",
  heating: "öljylämmitys",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchSpy.mockReset();
});

// =====================================================================
// 1. Scene editing — Finnish prompts
// =====================================================================
describe("AI acceptance: scene editing", () => {
  it("handles 'Lisää harjakatto' (add gable roof)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Tässä on päivitetty kohtaus harjakatolla:\n\n```javascript\n" +
          SAMPLE_SCENE +
          '\nconst roofL = translate(rotate(box(5, 0.1, 7), 0, 0, 25), -2, 3.5, 0);\nscene.add(roofL, { material: "roofing", color: [0.4, 0.2, 0.1] });\n```',
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Lisää harjakatto taloon" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content.length).toBeGreaterThan(0);
    expect(res.body.content).toContain("```");
  });

  it("handles 'Lisää ikkuna seinään' (add window to wall)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Lisään ikkunan etuseinään subtract-operaatiolla:\n\n```javascript\nconst windowHole = translate(box(1.2, 0.9, 0.3), 1.5, 1.8, 2.9);\nconst wallWithWindow = subtract(wall2, windowHole);\n```",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Lisää ikkuna etuseinään" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toContain("ikkuna");
  });

  it("handles 'Rakenna terassi talon eteen' (build terrace)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Lisään terassin painekyllästetystä puusta:\n\n```javascript\nconst deck = translate(box(6, 0.15, 3), 0, 0.15, 5.5);\nscene.add(deck, { material: \"pressure_treated_28x120\", color: [0.6, 0.5, 0.3] });\n```\n\nTerassin koko on 6 x 3 m. Painekyllästetty lauta ~200-400 EUR/m².",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Rakenna terassi talon eteen" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toContain("terassi");
  });

  it("handles 'Lisää autotalli' (add garage)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Tässä on autotalli (6 x 4 m) talon viereen:\n\n```javascript\nconst garageFloor = translate(box(6, 0.2, 4), 7, 0, 0);\nscene.add(garageFloor, { material: \"concrete_c25\", color: [0.7, 0.7, 0.7] });\n```",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Lisää autotalli talon oikealle puolelle" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content.length).toBeGreaterThan(0);
  });
});

// =====================================================================
// 2. Material questions
// =====================================================================
describe("AI acceptance: material questions", () => {
  it("handles 'Mikä eriste sopii ulkoseinään?' (insulation for exterior wall)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Ulkoseinän eristykseen suosittelen mineraalivillaa (rockwool_66). U-arvo tavoite ≤ 0.17 W/m²K uudisrakennuksessa. Hinta: ~7.50 EUR/m².",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Mikä eriste sopii ulkoseinään?" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content.length).toBeGreaterThan(20);
  });

  it("handles lumber substitution question", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Voit vaihtaa pine_48x98_c24 tilalle pine_48x148_c24 jos tarvitset leveämpää runkotolppaa. Molemmat kuuluvat samaan substituutioryhmään.",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Voiko runkotolpan vaihtaa paksumpaan?" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content.length).toBeGreaterThan(0);
  });

  it("handles English material question", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "For your exterior walls, I recommend mineral wool insulation (mineraalivilla), specifically rockwool_66 at 7.50 EUR/m². For 142 m² of wall area, budget approximately 1,065 EUR for materials.",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "What insulation should I use for the walls?" }],
      currentScene: SAMPLE_SCENE,
      buildingInfo: SAMPLE_BUILDING_INFO,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toContain("EUR");
  });
});

// =====================================================================
// 3. Cost queries
// =====================================================================
describe("AI acceptance: cost queries", () => {
  it("handles 'Paljonko kattoremontti maksaa?' (roof renovation cost)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Kattoremontin hinta riippuu materiaalista:\n- Bitumihuopa: 50-80 EUR/m²\n- Peltikatto: 80-120 EUR/m²\n- Tiililaatta: 100-150 EUR/m²\n\nTalosi 142 m² kattoalalle peltikatto maksaisi noin 11,000-17,000 EUR asennettuna.",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Paljonko kattoremontti maksaa?" }],
      currentScene: SAMPLE_SCENE,
      buildingInfo: SAMPLE_BUILDING_INFO,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toContain("EUR");
  });

  it("handles total BOM cost question with BOM context", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Nykyinen materiaalibudjetti on yhteensä 1,393.50 EUR:\n- pine_48x148_c24: 480.00 EUR\n- concrete_c25: 576.00 EUR\n- rockwool_66: 337.50 EUR",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Paljonko materiaalit maksavat yhteensä?" }],
      currentScene: SAMPLE_SCENE,
      bomSummary: SAMPLE_BOM,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toContain("EUR");
  });

  it("handles 'Miten voin säästää kuluissa?' (how to save costs)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Voit säästää vaihtamalla edullisempiin materiaaleihin samasta substituutioryhmästä. Esimerkiksi runkotolpissa pine_48x98_c24 on edullisempi kuin pine_48x148_c24, jos rakenteen mitoitus sallii.",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Miten voin säästää materiaalikustannuksissa?" }],
      currentScene: SAMPLE_SCENE,
      bomSummary: SAMPLE_BOM,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content.length).toBeGreaterThan(20);
  });
});

// =====================================================================
// 4. Building code questions
// =====================================================================
describe("AI acceptance: building code", () => {
  it("handles minimum ceiling height question", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Suomen rakennusmääräyksissä (RakMK) asuintilojen vähimmäishuonekorkeus on 2,5 m. Olemassa olevissa rakennuksissa hyväksytään 2,4 m.",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Mikä on minimikorkeus asuinhuoneessa?" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toContain("2,5");
  });

  it("handles staircase requirements question", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Portaiden vaatimukset RakMK:n mukaan:\n- Nousu max 190 mm\n- Etenemä min 250 mm\n- Portaikon vähimmäisleveys 900 mm omakotitalossa",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Mitkä ovat portaiden mitat rakennusmääräyksissä?" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content.length).toBeGreaterThan(0);
  });

  it("handles energy class question for 1978 building", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Vuonna 1978 rakennettu omakotitalo on todennäköisesti energialuokassa D-E. Tyypillisiä piirteitä: öljylämmitys, heikko eristys, 2-lasinen ikkuna. Suosittelen lämpöpumppuun vaihtoa ja lisäeristystä.",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Mikä on taloni energialuokka?" }],
      currentScene: SAMPLE_SCENE,
      buildingInfo: SAMPLE_BUILDING_INFO,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toContain("1978");
  });

  it("handles wet room waterproofing question", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Märkätilan vedeneristys: RakMK vaatii luokan 1 vedeneristysjärjestelmän. Seinät ja lattia tulee vedeneristää kokonaan. Saunatilassa erityisesti höyrynsulku on kriittinen.",
      ),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Mitä vaatimuksia on märkätilan vedeneristykseen?" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content.length).toBeGreaterThan(0);
  });
});

// =====================================================================
// 5. Response format validation
// =====================================================================
describe("AI acceptance: response format", () => {
  it("returns valid ChatMessage structure (role + content)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse("Moi! Miten voin auttaa?"),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "Hei" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("role", "assistant");
    expect(res.body).toHaveProperty("content");
    expect(typeof res.body.content).toBe("string");
    expect(res.body.content.length).toBeGreaterThan(0);
  });

  it("returns non-empty content for a complex Finnish prompt", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse(
        "Vaihtaisin öljylämmityksen maalämpöpumppuun. Kustannusarvio asennettuna 15,000-25,000 EUR. Energialuokka paranee arviolta D:stä B:hen.",
      ),
    );

    const res = await postChat({
      messages: [
        { role: "user", content: "Haluan vaihtaa lämmitysjärjestelmän" },
      ],
      currentScene: SAMPLE_SCENE,
      buildingInfo: SAMPLE_BUILDING_INFO,
    });

    expect(res.status).toBe(200);
    expect(res.body.content.length).toBeGreaterThan(10);
  });
});

// =====================================================================
// 6. Context injection into AI request
// =====================================================================
describe("AI acceptance: context injection", () => {
  it("includes scene script in the system prompt sent to Anthropic", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "Muokkaa kohtausta" }],
      currentScene: SAMPLE_SCENE,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const reqBody = lastRequestBody();
    // System prompt must contain the scene script
    expect(reqBody.system).toContain("Current scene script:");
    expect(reqBody.system).toContain("box(8, 0.2, 6)");
  });

  it("includes BOM summary in the system prompt when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "Analysoi materiaalit" }],
      currentScene: SAMPLE_SCENE,
      bomSummary: SAMPLE_BOM,
    });

    const reqBody = lastRequestBody();
    expect(reqBody.system).toContain("Current BOM");
    expect(reqBody.system).toContain("pine_48x148_c24");
    expect(reqBody.system).toContain("480.00 EUR");
    expect(reqBody.system).toContain("total 1393.50 EUR");
  });

  it("includes building info in the system prompt when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "Arvioi talo" }],
      currentScene: SAMPLE_SCENE,
      buildingInfo: SAMPLE_BUILDING_INFO,
    });

    const reqBody = lastRequestBody();
    expect(reqBody.system).toContain("Building info:");
    expect(reqBody.system).toContain("Mannerheimintie 1, Helsinki");
    expect(reqBody.system).toContain("omakotitalo");
    expect(reqBody.system).toContain("1978");
    expect(reqBody.system).toContain("142 m²");
    expect(reqBody.system).toContain("öljylämmitys");
  });

  it("includes project info in the system prompt when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "Kerro projektista" }],
      currentScene: SAMPLE_SCENE,
      projectInfo: {
        name: "Keittiöremontti 2026",
        description: "Täydellinen keittiön uusiminen",
      },
    });

    const reqBody = lastRequestBody();
    expect(reqBody.system).toContain('Project: "Keittiöremontti 2026"');
    expect(reqBody.system).toContain("Täydellinen keittiön uusiminen");
  });

  it("includes renovation ROI context in the system prompt when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "Kannattaako tämä remontti?" }],
      currentScene: SAMPLE_SCENE,
      renovationRoiSummary: "Cost 25000 EUR, best subsidy 3200 EUR, net 21800 EUR, estimated value impact 14000 EUR, 10-year ROI +8%.",
    });

    const reqBody = lastRequestBody();
    expect(reqBody.system).toContain("Renovation ROI dashboard:");
    expect(reqBody.system).toContain("estimated value impact 14000 EUR");
    expect(reqBody.system).toContain("separate estimate, assumption, and recommendation");
  });

  it("sends correct Anthropic API headers", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "Test" }],
      currentScene: "",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");

    const headers = lastRequestHeaders();
    expect(headers["x-api-key"]).toBe("sk-ant-test-fake-key-for-acceptance");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("passes user messages correctly to Anthropic", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [
        { role: "user", content: "Hei, auta minua" },
        { role: "assistant", content: "Moi! Miten voin auttaa?" },
        { role: "user", content: "Lisää saunatila" },
      ],
      currentScene: SAMPLE_SCENE,
    });

    const reqBody = lastRequestBody();
    expect(reqBody.messages).toHaveLength(3);
    expect(reqBody.messages[0]).toEqual({ role: "user", content: "Hei, auta minua" });
    expect(reqBody.messages[2]).toEqual({ role: "user", content: "Lisää saunatila" });
  });
});

// =====================================================================
// 7. API error handling — fallback to local response
// =====================================================================
describe("AI acceptance: error handling", () => {
  it("falls back to local response when Anthropic API returns an error", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const res = await postChat({
      messages: [{ role: "user", content: "Add a roof to my house" }],
      currentScene: SAMPLE_SCENE,
    });

    // Should still return 200 with a local fallback response
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content.length).toBeGreaterThan(0);
    // Local fallback for "add roof" includes a code block
    expect(res.body.content).toContain("roof");
  });

  it("falls back to local response when fetch throws a network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network unreachable"));

    const res = await postChat({
      messages: [{ role: "user", content: "Add a door" }],
      currentScene:
        'const wall2 = box(4, 3, 0.2);\nscene.add(wall2, {material: "wood"});',
    });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("assistant");
    expect(res.body.content).toContain("door");
  });
});
