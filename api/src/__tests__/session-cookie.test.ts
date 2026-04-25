import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Response } from "express";
import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  getAuthCookieToken,
  getAuthTokenFromRequest,
  setAuthCookie,
} from "../session-cookie";

const originalEnv = {
  AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
  AUTH_COOKIE_SAMESITE: process.env.AUTH_COOKIE_SAMESITE,
  AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE,
  NODE_ENV: process.env.NODE_ENV,
};

beforeEach(() => {
  delete process.env.AUTH_COOKIE_DOMAIN;
  delete process.env.AUTH_COOKIE_SAMESITE;
  delete process.env.AUTH_COOKIE_SECURE;
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  restoreEnv("AUTH_COOKIE_DOMAIN", originalEnv.AUTH_COOKIE_DOMAIN);
  restoreEnv("AUTH_COOKIE_SAMESITE", originalEnv.AUTH_COOKIE_SAMESITE);
  restoreEnv("AUTH_COOKIE_SECURE", originalEnv.AUTH_COOKIE_SECURE);
  restoreEnv("NODE_ENV", originalEnv.NODE_ENV);
});

function restoreEnv(name: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function mockResponse() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
  };
}

describe("session cookie helpers", () => {
  it("prefers bearer auth when both bearer and cookie are present", () => {
    const token = getAuthTokenFromRequest({
      headers: {
        authorization: "Bearer bearer-token",
        cookie: `${AUTH_COOKIE_NAME}=cookie-token`,
      },
    } as never);
    expect(token).toBe("bearer-token");
  });

  it("reads the auth cookie when no bearer token is present", () => {
    const token = getAuthCookieToken({
      headers: {
        cookie: `theme=dark; ${AUTH_COOKIE_NAME}=cookie-token`,
      },
    } as never);
    expect(token).toBe("cookie-token");
  });

  it("sets httpOnly lax cookies outside production", () => {
    const res = mockResponse();
    const expiresAt = Math.floor(Date.now() / 1000) + 900;
    setAuthCookie(res, "session-token", expiresAt);
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: false,
      }),
    );
  });

  it("sets secure SameSite=None cookies in production", () => {
    process.env.NODE_ENV = "production";
    const res = mockResponse();
    setAuthCookie(res, "session-token", Math.floor(Date.now() / 1000) + 900);
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      "session-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "none",
        secure: true,
      }),
    );
  });

  it("clears the auth cookie with matching cookie options", () => {
    const res = mockResponse();
    clearAuthCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      expect.objectContaining({
        httpOnly: true,
        path: "/",
      }),
    );
  });
});
