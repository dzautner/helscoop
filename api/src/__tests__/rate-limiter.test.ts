/**
 * Rate limiter unit tests.
 *
 * Verifies that the rate limiting middleware works correctly:
 *   - Requests under the limit succeed (2xx)
 *   - Requests over the limit get 429
 *   - Different rate limit tiers exist for different endpoint groups
 *   - Rate limit headers are returned (RateLimit-* standard headers)
 *   - Chat limiter returns retryAfter / resetAt metadata
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/551
 */

import { describe, it, expect } from "vitest";
import express from "express";
import rateLimit from "express-rate-limit";
import http from "http";
import type { AddressInfo } from "net";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal Express app with a single rate-limited endpoint. */
function createLimitedApp(opts: {
  max: number;
  windowMs?: number;
  keyGenerator?: (req: express.Request) => string;
  handler?: Parameters<typeof rateLimit>[0] extends object
    ? Parameters<typeof rateLimit>[0]["handler"]
    : never;
}) {
  const app = express();
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: opts.windowMs ?? 15 * 60 * 1000,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: opts.keyGenerator,
    handler: opts.handler,
    message: { error: "Too many requests, please try again later" },
  });

  app.get("/test", limiter, (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

/** Fire a GET request against a running server. Returns status, body, and headers. */
function fireRequest(
  port: number,
  path = "/test",
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** Start the app, run `fn`, then close the server. */
async function withServer<T>(
  app: express.Application,
  fn: (port: number) => Promise<T>,
): Promise<T> {
  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    return await fn(port);
  } finally {
    server.close();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Rate limiter behaviour", () => {
  it("allows requests under the limit", async () => {
    const app = createLimitedApp({ max: 5 });

    await withServer(app, async (port) => {
      for (let i = 0; i < 5; i++) {
        const res = await fireRequest(port);
        expect(res.status).toBe(200);
        expect((res.body as { ok: boolean }).ok).toBe(true);
      }
    });
  });

  it("returns 429 when the limit is exceeded", async () => {
    const app = createLimitedApp({ max: 3 });

    await withServer(app, async (port) => {
      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        const res = await fireRequest(port);
        expect(res.status).toBe(200);
      }

      // Next request should be rate-limited
      const blocked = await fireRequest(port);
      expect(blocked.status).toBe(429);
      expect((blocked.body as { error: string }).error).toContain("Too many requests");
    });
  });

  it("returns standard RateLimit-* headers", async () => {
    const app = createLimitedApp({ max: 5 });

    await withServer(app, async (port) => {
      const res = await fireRequest(port);
      expect(res.status).toBe(200);

      // express-rate-limit v7+ uses ratelimit-* (lowercase) standard headers
      const limitHeader =
        res.headers["ratelimit-limit"] || res.headers["x-ratelimit-limit"];
      const remainingHeader =
        res.headers["ratelimit-remaining"] || res.headers["x-ratelimit-remaining"];

      expect(limitHeader).toBeDefined();
      expect(remainingHeader).toBeDefined();
      expect(Number(limitHeader)).toBe(5);
      expect(Number(remainingHeader)).toBe(4);
    });
  });

  it("counts requests per key independently", async () => {
    const app = createLimitedApp({
      max: 2,
      keyGenerator: (req) => (req.headers["x-user-id"] as string) || "anonymous",
    });

    await withServer(app, async (port) => {
      // User A: 2 requests -> OK
      for (let i = 0; i < 2; i++) {
        const res = await fireRequest(port, "/test", { "x-user-id": "user-a" });
        expect(res.status).toBe(200);
      }

      // User A: 3rd request -> blocked
      const blockedA = await fireRequest(port, "/test", { "x-user-id": "user-a" });
      expect(blockedA.status).toBe(429);

      // User B: should still be allowed (separate bucket)
      const resB = await fireRequest(port, "/test", { "x-user-id": "user-b" });
      expect(resB.status).toBe(200);
    });
  });

  it("resets the counter after the window expires", async () => {
    // Use a very short window (500ms) so we can test reset
    const app = createLimitedApp({ max: 1, windowMs: 500 });

    await withServer(app, async (port) => {
      // First request: OK
      const first = await fireRequest(port);
      expect(first.status).toBe(200);

      // Second request: blocked
      const blocked = await fireRequest(port);
      expect(blocked.status).toBe(429);

      // Wait for window to reset
      await new Promise((r) => setTimeout(r, 600));

      // Should be allowed again
      const afterReset = await fireRequest(port);
      expect(afterReset.status).toBe(200);
    });
  });
});

describe("Rate limiter tiers (source analysis)", () => {
  /**
   * These tests verify the rate limiter configuration in index.ts by reading
   * the source code, ensuring the correct limits are set for each tier.
   */
  it("defines four distinct rate limiter tiers", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );

    // All four tier names must be present
    expect(src).toContain("publicLimiter");
    expect(src).toContain("authenticatedLimiter");
    expect(src).toContain("authLimiter");
    expect(src).toContain("chatLimiter");
    expect(src).toContain("buildingLimiter");
  });

  it("publicLimiter allows 100 req/15min in production", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );

    // Extract the publicLimiter block
    const start = src.indexOf("const publicLimiter");
    const end = src.indexOf("});", start) + 3;
    const block = src.slice(start, end);

    expect(block).toContain("windowMs: 15 * 60 * 1000");
    // production max is 100 (after IS_TEST and IS_DEV ternaries)
    expect(block).toContain(": 100");
  });

  it("authenticatedLimiter allows 500 req/15min in production", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );

    const start = src.indexOf("const authenticatedLimiter");
    const end = src.indexOf("});", start) + 3;
    const block = src.slice(start, end);

    expect(block).toContain("windowMs: 15 * 60 * 1000");
    expect(block).toContain(": 500");
    expect(block).toContain("extractUserId");
    expect(block).toContain("keyGenerator");
  });

  it("authLimiter allows 30 req/15min in production", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );

    const start = src.indexOf("const authLimiter");
    const end = src.indexOf("});", start) + 3;
    const block = src.slice(start, end);

    expect(block).toContain("windowMs: 15 * 60 * 1000");
    expect(block).toContain(": 30");
  });

  it("chatLimiter allows 40 req/15min and returns retry metadata", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );

    const start = src.indexOf("const chatLimiter");
    const end = src.indexOf("// Building lookup rate limiter");
    const block = src.slice(start, end);

    expect(block).toContain(": 40");
    expect(block).toContain("keyGenerator");
    expect(block).toContain("extractUserId");
    expect(block).toContain("retryAfter");
    expect(block).toContain("resetAt");
    expect(block).toContain("Retry-After");
  });

  it("rate limits are relaxed in test environment (10000)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );

    // All limiters use IS_TEST ? 10000 pattern
    const testLimitCount = (src.match(/IS_TEST \? 10000/g) || []).length;
    // At minimum: public, authenticated, auth, chat, building, buildingAuthenticated, exportData = 7
    expect(testLimitCount).toBeGreaterThanOrEqual(6);
  });

  it("health endpoint is not rate limited", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );

    // The health handler is registered directly, no limiter middleware
    expect(src).toContain('app.get("/health", healthHandler)');
    expect(src).toContain('app.get("/api/health", healthHandler)');
  });
});

describe("Chat rate limiter 429 response shape", () => {
  it("returns retryAfter and resetAt in the 429 body", async () => {
    const app = express();
    app.use(express.json());

    // Replicate the chat limiter's custom handler
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res, _next, options) => {
        const resetMs = (
          req as express.Request & { rateLimit?: { resetTime?: Date } }
        ).rateLimit?.resetTime?.getTime();
        const retryAfter = resetMs
          ? Math.ceil((resetMs - Date.now()) / 1000)
          : options.windowMs / 1000;
        res.setHeader("Retry-After", retryAfter);
        res.status(429).json({
          error: "Too many chat requests, please try again later",
          retryAfter,
          resetAt: resetMs ? new Date(resetMs).toISOString() : null,
        });
      },
      message: { error: "Too many requests" },
    });

    app.get("/chat", limiter, (_req, res) => res.json({ ok: true }));

    await withServer(app, async (port) => {
      // First request: OK
      const ok = await fireRequest(port, "/chat");
      expect(ok.status).toBe(200);

      // Second request: 429 with metadata
      const blocked = await fireRequest(port, "/chat");
      expect(blocked.status).toBe(429);

      const body = blocked.body as {
        error: string;
        retryAfter: number;
        resetAt: string | null;
      };
      expect(body.error).toContain("Too many chat requests");
      expect(typeof body.retryAfter).toBe("number");
      expect(body.retryAfter).toBeGreaterThan(0);
      // Retry-After header should also be set
      expect(blocked.headers["retry-after"]).toBeDefined();
    });
  });
});
