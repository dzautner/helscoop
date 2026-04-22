/**
 * Unit tests for the chat route.
 *
 * Tests context block building, local response fallback, and endpoint validation.
 * The Anthropic API is never called — tests exercise only the local code paths.
 */

process.env.NODE_ENV = "test";
// Ensure no API key so we get local fallback responses
delete process.env.ANTHROPIC_API_KEY;

import { describe, it, expect, vi, beforeEach } from "vitest";
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

import app from "../index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authToken(userId = "user-1") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role: "user" },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {}
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

// ---------------------------------------------------------------------------
// 1. Authentication
// ---------------------------------------------------------------------------
describe("POST /chat — authentication", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("POST", "/chat", {
      body: {
        messages: [{ role: "user", content: "Hello" }],
        currentScene: "",
      },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2. Input validation
// ---------------------------------------------------------------------------
describe("POST /chat — input validation", () => {
  it("rejects empty messages array", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [],
        currentScene: "",
      },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("Messages");
  });

  it("rejects missing messages field", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        currentScene: "const a = box(1,1,1);",
      },
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 3. Local fallback responses (no API key)
// ---------------------------------------------------------------------------
describe("POST /chat — local fallback responses", () => {
  it("returns a response for roof-related message", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "Add a roof to my building" }],
        currentScene: 'const wall = box(4, 3, 0.2);\nscene.add(wall, {material: "wood"});',
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body.role).toBe("assistant");
    expect(body.content).toContain("roof");
    // Should include a code block with the scene
    expect(body.content).toContain("```");
  });

  it("returns a response for door-related message", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "Add a door to the front wall" }],
        currentScene: 'const wall2 = box(4, 3, 0.2);\nscene.add(wall2, {material: "wood"});',
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body.role).toBe("assistant");
    expect(body.content).toContain("door");
    expect(body.content).toContain("subtract");
  });

  it("returns a response for window-related message", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "I want to add a window" }],
        currentScene: 'const wall1 = box(4, 3, 0.2);\nscene.add(wall1, {material: "wood"});',
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body.role).toBe("assistant");
    expect(body.content).toContain("window");
  });

  it("returns a response for scale/size-related message", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "Make it bigger" }],
        currentScene: 'scene.add(box(4,3,4), {material: "wood"});',
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body.role).toBe("assistant");
    expect(body.content.toLowerCase()).toContain("larger");
  });

  it("returns a response for color-related message", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "Change the color of the walls" }],
        currentScene: 'scene.add(box(4,3,0.2), {material: "wood", color: [1,1,1]});',
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body.role).toBe("assistant");
    expect(body.content).toContain("color");
  });

  it("returns default fallback for unrecognized message", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "What is the meaning of life?" }],
        currentScene: 'scene.add(box(1,1,1), {material: "wood"});',
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body.role).toBe("assistant");
    // Default message should suggest available actions
    expect(body.content).toContain("roof");
    expect(body.content).toContain("door");
    expect(body.content).toContain("window");
  });

  it("uses the last message for keyword matching", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi! How can I help?" },
          { role: "user", content: "Add a roof please" },
        ],
        currentScene: 'scene.add(box(4,3,0.2), {material: "wood"});',
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { content: string };
    expect(body.content).toContain("roof");
  });
});

// ---------------------------------------------------------------------------
// 4. Response structure
// ---------------------------------------------------------------------------
describe("POST /chat — response structure", () => {
  it("response has role and content fields", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "Hello" }],
        currentScene: "",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body).toHaveProperty("role");
    expect(body).toHaveProperty("content");
    expect(body.role).toBe("assistant");
    expect(body.content).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 5. Context-aware responses
// ---------------------------------------------------------------------------
describe("POST /chat — context handling", () => {
  it("accepts optional bomSummary context", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "What materials do I need?" }],
        currentScene: 'scene.add(box(1,1,1), {material: "wood"});',
        bomSummary: [
          { material: "Pine 48x98", qty: 50, unit: "jm", total: 150.0 },
        ],
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string };
    expect(body.role).toBe("assistant");
  });

  it("accepts optional buildingInfo context", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "How can I improve insulation?" }],
        currentScene: 'scene.add(box(1,1,1), {material: "wood"});',
        buildingInfo: {
          address: "Ribbingintie 109",
          type: "omakotitalo",
          year_built: 1985,
          area_m2: 135,
          floors: 2,
          material: "puu",
          heating: "kaukolampo",
        },
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string };
    expect(body.role).toBe("assistant");
  });

  it("accepts optional projectInfo context", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "Help me plan" }],
        currentScene: 'scene.add(box(1,1,1), {material: "wood"});',
        projectInfo: {
          name: "My Renovation",
          description: "Kitchen remodel",
        },
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string };
    expect(body.role).toBe("assistant");
  });

  it("handles all context fields together", async () => {
    const res = await makeRequest("POST", "/chat", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        messages: [{ role: "user", content: "What should I do next?" }],
        currentScene: 'scene.add(box(1,1,1), {material: "wood"});',
        bomSummary: [
          { material: "Pine 48x98", qty: 50, unit: "jm", total: 150.0 },
        ],
        buildingInfo: {
          type: "omakotitalo",
          year_built: 1985,
        },
        projectInfo: {
          name: "Full Renovation",
        },
        renovationRoiSummary: "Cost 12000 EUR, net 9000 EUR, estimated value impact 5000 EUR, 10-year ROI +12%.",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; content: string };
    expect(body.role).toBe("assistant");
    expect(body.content.length).toBeGreaterThan(0);
  });
});
