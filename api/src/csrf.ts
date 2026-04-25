import type { NextFunction, Request, Response } from "express";
import { getAuthCookieToken, getBearerTokenFromRequest } from "./session-cookie";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function requestOrigin(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin.trim()) return origin;

  const referer = req.headers.referer;
  if (typeof referer !== "string" || !referer.trim()) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return "invalid";
  }
}

export function configuredCorsOrigins(
  raw: string | undefined,
  fallback: string[],
): string[] {
  const normalize = (origin: string) => {
    try {
      return new URL(origin).origin;
    } catch {
      return origin.replace(/\/+$/, "");
    }
  };
  const origins = raw
    ?.split(",")
    .map((origin) => origin.trim())
    .map(normalize)
    .filter(Boolean);
  return origins?.length ? origins : fallback;
}

export function rejectCrossOriginCookieAuth(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNSAFE_METHODS.has(req.method.toUpperCase())) return next();
    if (getBearerTokenFromRequest(req)) return next();
    if (!getAuthCookieToken(req)) return next();

    const origin = requestOrigin(req);
    if (!origin || allowed.has(origin)) return next();

    return res.status(403).json({ error: "Invalid request origin" });
  };
}
