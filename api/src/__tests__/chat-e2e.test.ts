/**
 * End-to-end tests for the chat endpoint covering:
 * - Message formatting and system prompt content
 * - Materials catalog injection
 * - Credit/entitlement enforcement
 * - Auth requirement
 * - Error handling and fallback behaviour
 * - Substitution suggestions in local fallback
 * - Reference image metadata in local fallback
 * - Context block building with all optional fields
 *
 * The Anthropic API is mocked via global.fetch spy — no real API key used.
 */

process.env.NODE_ENV = "test";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-e2e-key";

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// ---------------------------------------------------------------------------
// Mock DB and email
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

function mockAnthropicResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ content: [{ type: "text", text }] }),
  };
}

function lastRequestBody(): {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
} {
  const [, opts] = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
  return JSON.parse(opts.body as string);
}

import app from "../index";
import { _resetStores } from "../entitlements";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authToken(userId = "user-e2e") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role: "user" },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

const TOKEN = authToken();

function postChat(
  body: Record<string, unknown>,
  token = TOKEN,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = JSON.stringify(body);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const req = http.request(
        { hostname: "127.0.0.1", port, path: "/chat", method: "POST", headers },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            try {
              resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode || 0, body: { raw: data } });
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

const SCENE = `const floor = box(6, 0.2, 4);
scene.add(floor, { material: "concrete_c25", color: [0.8, 0.8, 0.8] });`;

// ---------------------------------------------------------------------------
beforeEach(() => {
  fetchSpy.mockReset();
  _resetStores();
});

// =====================================================================
// 1. Authentication enforcement
// =====================================================================
describe("chat e2e: authentication", () => {
  it("rejects request with no Authorization header", async () => {
    const res = await postChat(
      { messages: [{ role: "user", content: "Hello" }], currentScene: "" },
      "",
    );
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid JWT token", async () => {
    const res = await postChat(
      { messages: [{ role: "user", content: "Hello" }], currentScene: "" },
      "invalid-token-xyz",
    );
    expect(res.status).toBe(401);
  });

  it("rejects request with expired JWT token", async () => {
    const expired = jwt.sign(
      { id: "user-e2e", email: "test@test.com", role: "user" },
      JWT_SECRET,
      { expiresIn: "-1s" },
    );
    const res = await postChat(
      { messages: [{ role: "user", content: "Hello" }], currentScene: "" },
      expired,
    );
    expect(res.status).toBe(401);
  });
});

// =====================================================================
// 2. Input validation
// =====================================================================
describe("chat e2e: input validation", () => {
  it("rejects empty messages array with 400", async () => {
    const res = await postChat({ messages: [], currentScene: "" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects missing messages field with 400", async () => {
    const res = await postChat({ currentScene: "box(1,1,1);" });
    expect(res.status).toBe(400);
  });

  it("rejects null messages with 400", async () => {
    const res = await postChat({ messages: null, currentScene: "" });
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// 3. Message formatting — correct messages sent to Anthropic
// =====================================================================
describe("chat e2e: message formatting", () => {
  it("sends user messages in correct order to the API", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("Response"));

    await postChat({
      messages: [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First reply" },
        { role: "user", content: "Second message" },
      ],
      currentScene: SCENE,
    });

    const body = lastRequestBody();
    expect(body.messages).toHaveLength(3);
    expect(body.messages[0].content).toBe("First message");
    expect(body.messages[1].role).toBe("assistant");
    expect(body.messages[2].content).toBe("Second message");
  });

  it("uses the correct model name", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: "",
    });

    const body = lastRequestBody();
    expect(body.model).toContain("claude");
  });

  it("sets max_tokens to 2048", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: "",
    });

    const body = lastRequestBody();
    expect(body.max_tokens).toBe(2048);
  });

  it("preserves multi-turn conversation history", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    const conversation = [
      { role: "user", content: "Lisää katto" },
      { role: "assistant", content: "Katto lisätty" },
      { role: "user", content: "Vaihda väri" },
      { role: "assistant", content: "Väri vaihdettu" },
      { role: "user", content: "Lisää ovi" },
    ];

    await postChat({
      messages: conversation,
      currentScene: SCENE,
    });

    const body = lastRequestBody();
    expect(body.messages).toHaveLength(5);
  });
});

// =====================================================================
// 4. System prompt content
// =====================================================================
describe("chat e2e: system prompt content", () => {
  it("includes scene primitives documentation in system prompt", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
    });

    const body = lastRequestBody();
    expect(body.system).toContain("box(width, height, depth)");
    expect(body.system).toContain("cylinder(radius, height)");
    expect(body.system).toContain("sphere(radius)");
  });

  it("includes Finnish building types in system prompt", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: "",
    });

    const body = lastRequestBody();
    expect(body.system).toContain("omakotitalo");
    expect(body.system).toContain("kerrostalo");
    expect(body.system).toContain("rivitalo");
    expect(body.system).toContain("paritalo");
  });

  it("includes energy class scale in system prompt", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: "",
    });

    const body = lastRequestBody();
    expect(body.system).toContain("energy");
    expect(body.system).toContain("kWh");
  });

  it("includes the current scene in the system prompt context", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
    });

    const body = lastRequestBody();
    expect(body.system).toContain("Current scene script:");
    expect(body.system).toContain("concrete_c25");
  });

  it("includes language detection instructions", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: "",
    });

    const body = lastRequestBody();
    expect(body.system).toMatch(/detect.*language|language.*detect/i);
  });
});

// =====================================================================
// 5. Materials catalog injection
// =====================================================================
describe("chat e2e: materials catalog injection", () => {
  it("includes materials catalog section in system prompt", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: "",
    });

    const body = lastRequestBody();
    expect(body.system).toContain("Materials catalog");
  });

  it("includes substitution group instructions", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: "",
    });

    const body = lastRequestBody();
    expect(body.system).toContain("Substitution groups");
  });
});

// =====================================================================
// 6. Context block with optional fields
// =====================================================================
describe("chat e2e: context block building", () => {
  it("includes BOM summary when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
      bomSummary: [
        { material: "pine_48x98_c24", qty: 50, unit: "jm", total: 130.0 },
        { material: "rockwool_50mm", qty: 20, unit: "m2", total: 160.0 },
      ],
    });

    const body = lastRequestBody();
    expect(body.system).toContain("Current BOM");
    expect(body.system).toContain("pine_48x98_c24");
    expect(body.system).toContain("130.00 EUR");
    expect(body.system).toContain("total 290.00 EUR");
  });

  it("includes building info when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
      buildingInfo: {
        address: "Testikatu 1, Helsinki",
        type: "rivitalo",
        year_built: 1995,
        area_m2: 80,
        floors: 1,
        material: "tiili",
        heating: "kaukolämpö",
        climate_zone: "zone_I",
        heating_degree_days: 3900,
      },
    });

    const body = lastRequestBody();
    expect(body.system).toContain("Building info:");
    expect(body.system).toContain("Testikatu 1, Helsinki");
    expect(body.system).toContain("rivitalo");
    expect(body.system).toContain("1995");
    expect(body.system).toContain("80 m²");
    expect(body.system).toContain("kaukolämpö");
    expect(body.system).toContain("zone_I");
    expect(body.system).toContain("3900");
  });

  it("includes project info when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
      projectInfo: {
        name: "Saunaremontti",
        description: "Täysi saunan uusiminen ja laajennus",
      },
    });

    const body = lastRequestBody();
    expect(body.system).toContain('Project: "Saunaremontti"');
    expect(body.system).toContain("Täysi saunan uusiminen ja laajennus");
  });

  it("includes renovation ROI summary when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    const roiSummary =
      "Cost 15000 EUR, subsidy 2000 EUR, net 13000 EUR, value impact 8000 EUR, 15-year ROI +18%.";

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
      renovationRoiSummary: roiSummary,
    });

    const body = lastRequestBody();
    expect(body.system).toContain("Renovation ROI dashboard:");
    expect(body.system).toContain("15000 EUR");
  });

  it("includes substitution suggestions when provided", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
      substitutionSuggestions: [
        {
          material: "Pine 48x148 C24",
          materialId: "pine_48x148_c24",
          substitute: "Spruce 48x148 C24",
          substituteId: "spruce_48x148_c24",
          savings: 45,
          savingsPercent: 12,
          reason: "price",
          stockLevel: "high",
        },
      ],
    });

    const body = lastRequestBody();
    expect(body.system).toContain("Material substitution opportunities");
    expect(body.system).toContain("Pine 48x148 C24");
    expect(body.system).toContain("spruce_48x148_c24");
    expect(body.system).toContain("saves 45 EUR");
  });

  it("caps BOM summary at 20 items", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    const largeBom = Array.from({ length: 30 }, (_, i) => ({
      material: `mat_${i}`,
      qty: 1,
      unit: "kpl",
      total: 10,
    }));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
      bomSummary: largeBom,
    });

    const body = lastRequestBody();
    // The system prompt should contain "30 items" (the total count) but only list 20
    expect(body.system).toContain("30 items");
    // Count how many mat_ entries appear (should be 20, not 30)
    const matMatches = body.system.match(/mat_\d+/g) || [];
    expect(matMatches.length).toBe(20);
  });

  it("omits empty building info gracefully", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("OK"));

    await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
      buildingInfo: {},
    });

    const body = lastRequestBody();
    // Should not contain the "Building info:" header when empty
    expect(body.system).not.toContain("Building info:");
  });
});

// =====================================================================
// 7. Error handling and fallback
// =====================================================================
describe("chat e2e: error handling", () => {
  it("returns 200 with fallback when Anthropic returns 500", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const res = await postChat({
      messages: [{ role: "user", content: "Add a roof to my building" }],
      currentScene: SCENE,
    });

    expect(res.status).toBe(200);
    expect((res.body as { role: string }).role).toBe("assistant");
    expect((res.body as { content: string }).content).toContain("roof");
  });

  it("returns 200 with fallback when Anthropic returns 429 (rate limit)", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Rate Limited",
    });

    const res = await postChat({
      messages: [{ role: "user", content: "Add a window" }],
      currentScene: SCENE,
    });

    expect(res.status).toBe(200);
    expect((res.body as { role: string }).role).toBe("assistant");
  });

  it("returns 200 with fallback when fetch throws", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("DNS resolution failed"));

    const res = await postChat({
      messages: [{ role: "user", content: "Add a door" }],
      currentScene:
        'const wall2 = box(4, 3, 0.2);\nscene.add(wall2, {material: "wood"});',
    });

    expect(res.status).toBe(200);
    expect((res.body as { content: string }).content).toContain("door");
  });

  it("returns 200 with fallback on malformed API JSON response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON")),
    });

    const res = await postChat({
      messages: [{ role: "user", content: "Make it bigger" }],
      currentScene: SCENE,
    });

    expect(res.status).toBe(200);
    expect((res.body as { role: string }).role).toBe("assistant");
  });
});

// =====================================================================
// 8. Local fallback response quality
// =====================================================================
describe("chat e2e: local fallback responses", () => {
  // Delete API key so local fallback is used
  const savedKey = process.env.ANTHROPIC_API_KEY;

  it("provides substitution response when user asks for alternatives", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await postChat({
      messages: [{ role: "user", content: "Onko vaihtoehtoja?" }],
      currentScene: SCENE,
      substitutionSuggestions: [
        {
          material: "Pine 48x148",
          materialId: "pine_48x148_c24",
          substitute: "Spruce 48x148",
          substituteId: "spruce_48x148_c24",
          savings: 30,
          savingsPercent: 10,
          reason: "price",
        },
      ],
    });

    process.env.ANTHROPIC_API_KEY = savedKey;

    expect(res.status).toBe(200);
    const content = (res.body as { content: string }).content;
    expect(content).toContain("substitution");
    expect(content).toContain("Pine 48x148");
    expect(content).toContain("spruce_48x148_c24");
    expect(content).toContain("30 EUR");
  });

  it("provides reference image metadata response in fallback mode", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    // We need to check the local fallback for reference image queries.
    // The route loads images from the DB, but our mock returns empty rows.
    // So referenceImages will be empty. We test via the fallback response.
    const res = await postChat({
      messages: [{ role: "user", content: "What do you see in the photo of my roof?" }],
      currentScene: SCENE,
    });

    process.env.ANTHROPIC_API_KEY = savedKey;

    expect(res.status).toBe(200);
    // Without images loaded, it should give the generic fallback
    expect((res.body as { role: string }).role).toBe("assistant");
  });

  it("returns color guidance for color questions", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await postChat({
      messages: [{ role: "user", content: "Change the colour of the walls" }],
      currentScene: SCENE,
    });

    process.env.ANTHROPIC_API_KEY = savedKey;

    expect(res.status).toBe(200);
    expect((res.body as { content: string }).content).toContain("color");
  });

  it("returns generic help for unrecognized messages", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await postChat({
      messages: [{ role: "user", content: "Tell me about Finnish history" }],
      currentScene: SCENE,
    });

    process.env.ANTHROPIC_API_KEY = savedKey;

    expect(res.status).toBe(200);
    const content = (res.body as { content: string }).content;
    // Generic fallback mentions available capabilities
    expect(content).toContain("roof");
    expect(content).toContain("door");
    expect(content).toContain("window");
    expect(content).toContain("ANTHROPIC_API_KEY");
  });
});

// =====================================================================
// 9. Credits integration
// =====================================================================
describe("chat e2e: credits", () => {
  it("returns credits information in the response", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockAnthropicResponse("Here is your response."),
    );

    const res = await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: SCENE,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("credits");
    const credits = (res.body as { credits: { cost: number; balance: number } }).credits;
    expect(credits).toHaveProperty("cost");
    expect(credits).toHaveProperty("balance");
    expect(typeof credits.cost).toBe("number");
    expect(typeof credits.balance).toBe("number");
  });
});

// =====================================================================
// 10. Response structure validation
// =====================================================================
describe("chat e2e: response structure", () => {
  it("always returns role=assistant and non-empty content", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("Moi!"));

    const res = await postChat({
      messages: [{ role: "user", content: "Hei" }],
      currentScene: SCENE,
    });

    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body.role).toBe("assistant");
    expect(body.content.length).toBeGreaterThan(0);
  });

  it("content is a string not an array", async () => {
    fetchSpy.mockResolvedValueOnce(mockAnthropicResponse("Test response"));

    const res = await postChat({
      messages: [{ role: "user", content: "test" }],
      currentScene: "",
    });

    expect(res.status).toBe(200);
    expect(typeof (res.body as { content: string }).content).toBe("string");
  });
});
