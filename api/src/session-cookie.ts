import type { Request, Response } from "express";
import type http from "http";

export const AUTH_COOKIE_NAME = "helscoop_session";

type RequestLike = Pick<Request, "headers"> | http.IncomingMessage;

function cleanEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function parseCookieHeader(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join(";") : header;
  if (!raw) return {};
  return raw.split(";").reduce<Record<string, string>>((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return cookies;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

function getCookieOptions(expiresAt?: number) {
  const envSameSite = cleanEnv("AUTH_COOKIE_SAMESITE")?.toLowerCase();
  const sameSite = envSameSite === "strict" || envSameSite === "lax" || envSameSite === "none"
    ? envSameSite
    : process.env.NODE_ENV === "production"
      ? "none"
      : "lax";
  const envSecure = cleanEnv("AUTH_COOKIE_SECURE");
  const secure = envSecure ? envSecure === "true" : process.env.NODE_ENV === "production" || sameSite === "none";
  const domain = cleanEnv("AUTH_COOKIE_DOMAIN") || undefined;
  const expires = expiresAt ? new Date(expiresAt * 1000) : undefined;

  return {
    httpOnly: true,
    secure,
    sameSite: sameSite as "strict" | "lax" | "none",
    path: "/",
    domain,
    expires,
    maxAge: expiresAt ? Math.max(0, expiresAt * 1000 - Date.now()) : undefined,
  };
}

export function getBearerTokenFromRequest(req: RequestLike): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7);
  if (!token || token !== token.trim()) return null;
  return token;
}

export function getAuthCookieToken(req: RequestLike): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[AUTH_COOKIE_NAME] || null;
}

export function getAuthTokenFromRequest(req: RequestLike): string | null {
  return getBearerTokenFromRequest(req) || getAuthCookieToken(req);
}

export function setAuthCookie(res: Response, token: string, expiresAt: number): void {
  res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions(expiresAt));
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, getCookieOptions());
}
