import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Mock the db module before importing auth
vi.mock("../db", () => ({
  query: vi.fn(),
  pool: { query: vi.fn() },
}));

// Mock the email module
vi.mock("../email", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

import { verifyGoogleToken, verifyAppleToken, googleLogin, appleLogin } from "../auth";
import { query } from "../db";

const mockedQuery = vi.mocked(query);

// ---------------------------------------------------------------------------
// verifyGoogleToken
// ---------------------------------------------------------------------------

describe("verifyGoogleToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when the token verification request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await verifyGoogleToken("bad-token");
    expect(result).toBeNull();
  });

  it("returns null when the response is missing required fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ aud: "test-client-id" }), // missing email and sub
      })
    );
    const result = await verifyGoogleToken("incomplete-token");
    expect(result).toBeNull();
  });

  it("returns the payload for a valid token response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: "google-uid-123",
            email: "user@gmail.com",
            email_verified: "true",
            name: "Test User",
            picture: "https://lh3.googleusercontent.com/photo.jpg",
            aud: "some-client-id",
          }),
      })
    );
    const result = await verifyGoogleToken("valid-token");
    expect(result).not.toBeNull();
    expect(result!.sub).toBe("google-uid-123");
    expect(result!.email).toBe("user@gmail.com");
    expect(result!.email_verified).toBe(true);
    expect(result!.name).toBe("Test User");
  });

  it("returns null when fetch throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await verifyGoogleToken("any-token");
    expect(result).toBeNull();
  });

  it("falls back to email prefix when name is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: "google-uid-456",
            email: "matti.meikalainen@gmail.com",
            email_verified: true,
          }),
      })
    );
    const result = await verifyGoogleToken("valid-token");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("matti.meikalainen");
  });
});

// ---------------------------------------------------------------------------
// googleLogin
// ---------------------------------------------------------------------------

describe("googleLogin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedQuery.mockReset();
  });

  const payload = {
    sub: "google-uid-789",
    email: "test@gmail.com",
    email_verified: true,
    name: "Test User",
  };

  it("returns existing user when google_id matches", async () => {
    const existingUser = { id: "user-1", email: "test@gmail.com", name: "Test User", role: "homeowner" };
    mockedQuery
      .mockResolvedValueOnce({ rows: [existingUser], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] });

    const result = await googleLogin(payload);
    expect(result).toEqual(existingUser);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM user_oauth_providers"),
      ["google", "google-uid-789"]
    );
  });

  it("links Google account to existing email user", async () => {
    const existingUser = { id: "user-2", email: "test@gmail.com", name: "Existing User", role: "homeowner" };
    mockedQuery
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [existingUser], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] });

    const result = await googleLogin(payload);
    expect(result).toEqual(existingUser);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users"),
      ["google-uid-789", true, null, "google", "user-2"]
    );
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO user_oauth_providers"),
      ["user-2", "google", "google-uid-789", "test@gmail.com", true, "Test User", null]
    );
  });

  it("creates a new user when no match exists", async () => {
    const newUser = { id: "user-new", email: "test@gmail.com", name: "Test User", role: "homeowner" };
    mockedQuery
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [newUser], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] });

    const result = await googleLogin(payload);
    expect(result).toEqual(newUser);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      ["test@gmail.com", "Test User", "google", null, "google-uid-789"]
    );
  });
});

// ---------------------------------------------------------------------------
// Apple Sign In
// ---------------------------------------------------------------------------

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

describe("verifyAppleToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for malformed identity tokens", async () => {
    const result = await verifyAppleToken("not-a-jwt");
    expect(result).toBeNull();
  });

  it("verifies a signed Apple identity token with JWKS", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    const header = { alg: "RS256", kid: "apple-test-key" };
    const payload = {
      iss: "https://appleid.apple.com",
      aud: "fi.helscoop.web",
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: "apple-user-123",
      email: "user@privaterelay.appleid.com",
      email_verified: "true",
    };
    const signingInput = `${b64url(header)}.${b64url(payload)}`;
    const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
    const token = `${signingInput}.${signature}`;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ keys: [{ ...jwk, kid: "apple-test-key", alg: "RS256", use: "sig" }] }),
    }));

    const result = await verifyAppleToken(token, { name: "Apple User" });
    expect(result).toEqual({
      sub: "apple-user-123",
      email: "user@privaterelay.appleid.com",
      email_verified: true,
      name: "Apple User",
    });
  });
});

describe("appleLogin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedQuery.mockReset();
  });

  it("links Apple account to an existing user with the same verified email", async () => {
    const existingUser = { id: "user-apple", email: "test@example.com", name: "Existing User", role: "homeowner" };
    mockedQuery
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [existingUser], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] });

    const result = await appleLogin({
      sub: "apple-sub-1",
      email: "test@example.com",
      email_verified: true,
      name: "Apple User",
    });

    expect(result).toEqual(existingUser);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO user_oauth_providers"),
      ["user-apple", "apple", "apple-sub-1", "test@example.com", true, "Apple User", null],
    );
  });
});
