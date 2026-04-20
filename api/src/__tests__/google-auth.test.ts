import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { verifyGoogleToken, googleLogin } from "../auth";
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
    mockedQuery.mockResolvedValueOnce({ rows: [existingUser], command: "", rowCount: 1, oid: 0, fields: [] });

    const result = await googleLogin(payload);
    expect(result).toEqual(existingUser);
    // Should only query once (by google_id)
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery).toHaveBeenCalledWith(
      "SELECT id, email, name, role FROM users WHERE google_id = $1",
      ["google-uid-789"]
    );
  });

  it("links Google account to existing email user", async () => {
    const existingUser = { id: "user-2", email: "test@gmail.com", name: "Existing User", role: "homeowner" };
    // First query (by google_id) returns empty
    mockedQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    // Second query (by email) returns existing user
    mockedQuery.mockResolvedValueOnce({ rows: [existingUser], command: "", rowCount: 1, oid: 0, fields: [] });
    // Third query (UPDATE to link google_id)
    mockedQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 1, oid: 0, fields: [] });

    const result = await googleLogin(payload);
    expect(result).toEqual(existingUser);
    expect(mockedQuery).toHaveBeenCalledTimes(3);
    // Verify the UPDATE was called to link google_id
    expect(mockedQuery).toHaveBeenCalledWith(
      "UPDATE users SET google_id = $1, email_verified = true WHERE id = $2",
      ["google-uid-789", "user-2"]
    );
  });

  it("creates a new user when no match exists", async () => {
    const newUser = { id: "user-new", email: "test@gmail.com", name: "Test User", role: "homeowner" };
    // First query (by google_id) returns empty
    mockedQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    // Second query (by email) returns empty
    mockedQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    // Third query (INSERT) returns new user
    mockedQuery.mockResolvedValueOnce({ rows: [newUser], command: "", rowCount: 1, oid: 0, fields: [] });

    const result = await googleLogin(payload);
    expect(result).toEqual(newUser);
    expect(mockedQuery).toHaveBeenCalledTimes(3);
    // Verify the INSERT was called with correct values
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      ["test@gmail.com", "Test User", "google-uid-789"]
    );
  });
});
