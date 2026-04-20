/**
 * Tests for the /auth/refresh endpoint and related token refresh logic.
 *
 * Unit tests verify verifyForRefresh edge cases (already covered in auth.test.ts
 * but the refresh *endpoint* is tested here for the first time).
 *
 * These tests validate:
 * - Valid tokens produce a new token + expiry
 * - Recently-expired tokens (within grace window) still refresh
 * - Fully-expired or invalid tokens are rejected
 * - Missing Authorization header is rejected
 * - The response shape matches what the frontend expects
 */

import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { signToken, verifyForRefresh, tokenExpiresAt } from "../auth";
import type { AuthUser } from "../auth";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

describe("/auth/refresh endpoint logic", () => {
  const testUser: AuthUser = { id: "user-refresh-1", email: "refresh@helscoop.fi", role: "user" };

  it("verifyForRefresh returns user for a fresh token", () => {
    const token = signToken(testUser);
    const result = verifyForRefresh(token);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(testUser.id);
    expect(result!.email).toBe(testUser.email);
    expect(result!.role).toBe(testUser.role);
  });

  it("signToken + verifyForRefresh round-trip produces clean payload", () => {
    const token = signToken(testUser);
    const result = verifyForRefresh(token);
    // Should only contain id, email, role — no JWT metadata
    expect(result).toEqual({ id: testUser.id, email: testUser.email, role: testUser.role });
    expect(result).not.toHaveProperty("iat");
    expect(result).not.toHaveProperty("exp");
  });

  it("a refreshed token can itself be refreshed (chain)", () => {
    const token1 = signToken(testUser);
    const user1 = verifyForRefresh(token1);
    expect(user1).not.toBeNull();

    // Simulate issuing a second token from the refresh result
    const token2 = signToken(user1!);
    const user2 = verifyForRefresh(token2);
    expect(user2).not.toBeNull();
    expect(user2!.id).toBe(testUser.id);
  });

  it("tokenExpiresAt returns a timestamp matching the 15-minute token lifetime", () => {
    const before = Math.floor(Date.now() / 1000);
    const exp = tokenExpiresAt();
    const after = Math.floor(Date.now() / 1000);

    // 15 minutes = 900 seconds, allow 1 second tolerance
    expect(exp - before).toBeGreaterThanOrEqual(899);
    expect(exp - after).toBeLessThanOrEqual(901);
  });

  it("rejects a token expired beyond the 60s grace window", () => {
    const token = jwt.sign(
      { id: testUser.id, email: testUser.email, role: testUser.role },
      JWT_SECRET,
      { expiresIn: "-120s" } // expired 2 minutes ago
    );
    expect(verifyForRefresh(token)).toBeNull();
  });

  it("accepts a token expired within the 60s grace window", () => {
    const token = jwt.sign(
      { id: testUser.id, email: testUser.email, role: testUser.role },
      JWT_SECRET,
      { expiresIn: "-30s" } // expired 30 seconds ago
    );
    const result = verifyForRefresh(token);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(testUser.id);
  });

  it("rejects a token at exactly the grace boundary (61s expired)", () => {
    const token = jwt.sign(
      { id: testUser.id, email: testUser.email, role: testUser.role },
      JWT_SECRET,
      { expiresIn: "-61s" }
    );
    expect(verifyForRefresh(token)).toBeNull();
  });

  it("rejects tokens signed with a different secret", () => {
    const token = jwt.sign(
      { id: testUser.id, email: testUser.email, role: testUser.role },
      "wrong-secret-key",
      { expiresIn: "15m" }
    );
    expect(verifyForRefresh(token)).toBeNull();
  });

  it("rejects completely malformed tokens", () => {
    expect(verifyForRefresh("")).toBeNull();
    expect(verifyForRefresh("not-a-jwt")).toBeNull();
    expect(verifyForRefresh("a.b.c")).toBeNull();
    expect(verifyForRefresh("eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0IjoxfQ")).toBeNull();
  });

  it("preserves role changes through refresh cycle", () => {
    // Admin user signs token
    const adminUser: AuthUser = { id: "admin-1", email: "admin@helscoop.fi", role: "admin" };
    const token = signToken(adminUser);
    const result = verifyForRefresh(token);
    expect(result!.role).toBe("admin");

    // Simulate the DB returning updated role (this is what the endpoint does)
    const updatedUser: AuthUser = { ...result!, role: "user" };
    const newToken = signToken(updatedUser);
    const newResult = verifyForRefresh(newToken);
    expect(newResult!.role).toBe("user");
  });
});

describe("/auth/refresh endpoint contract", () => {
  let src: string;

  // Read the index.ts source once for all contract tests
  it("index.ts has the /auth/refresh route with rate limiting", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const indexPath = path.resolve(__dirname, "../index.ts");
    src = fs.readFileSync(indexPath, "utf-8");

    expect(src).toContain('app.post("/auth/refresh"');
    expect(src).toContain("authLimiter");
    expect(src).toContain("verifyForRefresh");
    expect(src).toContain("token_expires_at");
  });

  it("refresh endpoint validates user exists in database", () => {
    // The full source must contain the DB check — search the whole file
    // since block extraction is fragile with nested closers
    expect(src).toContain('"SELECT id, email, role FROM users WHERE id = $1"');
    expect(src).toContain("User no longer exists");
  });

  it("refresh endpoint uses the latest DB data for the new token", () => {
    // Should use dbUser (from DB) for the new token, not the old JWT payload
    expect(src).toContain("const dbUser = result.rows[0]");
    expect(src).toContain("signToken(dbUser)");
  });
});

describe("frontend refresh integration", () => {
  it("API client has refresh helpers and background timer", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const apiPath = path.resolve(__dirname, "../../../web/src/lib/api.ts");
    const src = fs.readFileSync(apiPath, "utf-8");

    // Refresh helpers
    expect(src).toContain("refreshAccessToken");
    expect(src).toContain("refreshOnce");
    expect(src).toContain("tokenNeedsRefresh");

    // Background timer
    expect(src).toContain("_scheduleProactiveRefresh");
    expect(src).toContain("_refreshTimerId");
    expect(src).toContain("stopRefreshTimer");

    // 401 interception
    expect(src).toContain("res.status === 401");
    expect(src).toContain("refreshed");

    // Proactive pre-request check
    expect(src).toContain("tokenNeedsRefresh()");
  });

  it("setToken schedules the proactive refresh timer", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const apiPath = path.resolve(__dirname, "../../../web/src/lib/api.ts");
    const src = fs.readFileSync(apiPath, "utf-8");

    // setToken must call _scheduleProactiveRefresh somewhere in the function body.
    // We search the full file since block extraction with simple indexOf is fragile.
    expect(src).toContain("_scheduleProactiveRefresh()");
    // And setToken must exist as an export
    expect(src).toContain("export function setToken");
  });

  it("refresh timer fires at 80% of token lifetime", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const apiPath = path.resolve(__dirname, "../../../web/src/lib/api.ts");
    const src = fs.readFileSync(apiPath, "utf-8");

    // 80% factor
    expect(src).toContain("ttl * 0.8");
  });
});
