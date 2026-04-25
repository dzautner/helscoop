import * as Sentry from "@sentry/node";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { login, register, signToken, tokenExpiresAt, verifyForRefresh, requireAuth, forgotPassword, resetPassword, verifyEmail, resendVerification, verifyGoogleToken, googleLogin, verifyAppleToken, appleLogin, AuthUser } from "./auth";
import { requirePermission } from "./permissions";
import { query, pool } from "./db";
import materialsRouter from "./routes/materials";
import projectsRouter from "./routes/projects";
import suppliersRouter from "./routes/suppliers";
import pricingRouter from "./routes/pricing";
import notificationsRouter from "./routes/notifications";
import chatRouter from "./routes/chat";
import buildingRouter from "./routes/building";
import bomRouter from "./routes/bom";
import entitlementsRouter, { handleCreditCheckoutWebhook } from "./routes/entitlements";
import rolesRouter from "./routes/roles";
import auditRouter from "./routes/audit";
import adminRouter from "./routes/admin";
import affiliatesRouter from "./routes/affiliates";
import complianceRouter from "./routes/compliance";
import buildingRegistryRouter from "./routes/building-registry";
import carbonRouter from "./routes/carbon";
import huoltokirjaRouter from "./routes/huoltokirja";
import wasteRouter from "./routes/waste";
import ifcExportRouter from "./routes/ifc-export";
import permitPackRouter from "./routes/permit-pack";
import stockRouter from "./routes/stock";
import subsidiesRouter from "./routes/subsidies";
import keskoRouter from "./routes/kesko";
import araGrantRouter from "./routes/ara-grant";
import ryhtiRouter from "./routes/ryhti";
import photoEstimateRouter from "./routes/photo-estimate";
import quantityTakeoffRouter from "./routes/quantity-takeoff";
import roomScanRouter from "./routes/room-scan";
import marketplaceRouter from "./routes/marketplace";
import terrainRouter from "./routes/terrain";
import proRouter from "./routes/pro";
import projectImagesRouter from "./routes/project-images";
import logger from "./logger";
import { logAuditEvent } from "./audit";
import { sendEmail } from "./email";
import { hashViewerIp, logProjectView } from "./notifications";
import { installCollaborationServer } from "./collaboration";
import { assertProductionSecrets, getJwtSecret } from "./secrets";
import { clearAuthCookie, getAuthTokenFromRequest, setAuthCookie } from "./session-cookie";
import { configuredCorsOrigins, rejectCrossOriginCookieAuth } from "./csrf";

// ---------------------------------------------------------------------------
// Sentry — initialize before anything else so it can instrument the app
// ---------------------------------------------------------------------------
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    release: process.env.APP_VERSION,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  });
}

assertProductionSecrets();

const app = express();
const PORT = parseInt(process.env.PORT || "3001");
const IS_TEST = process.env.NODE_ENV === "test";
const IS_E2E = process.env.E2E === "1";
const startedAt = Date.now();
const IS_DEV = process.env.NODE_ENV === "development";
const DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://localhost:3002", "http://localhost:3052"];
const ALLOWED_CORS_ORIGINS = configuredCorsOrigins(process.env.CORS_ORIGIN, DEFAULT_CORS_ORIGINS);

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: ALLOWED_CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(rejectCrossOriginCookieAuth(ALLOWED_CORS_ORIGINS));

// Stripe sends signed webhook payloads; this route must receive the raw body
// before the JSON parser mutates it.
app.post("/entitlements/credits/webhook", express.raw({ type: "application/json" }), handleCreditCheckoutWebhook);

// Request body size limit. Photo-estimate uploads send compressed image data URLs,
// so the API needs a larger JSON envelope than the rest of the editor.
app.use(express.json({ limit: "8mb" }));

// ---------------------------------------------------------------------------
// Request ID middleware — tags every request with a unique ID for correlation
// ---------------------------------------------------------------------------
app.use((req, _res, next) => {
  (req as express.Request & { requestId: string }).requestId =
    (req.headers["x-request-id"] as string) || crypto.randomUUID();
  next();
});

// ---------------------------------------------------------------------------
// Rate limiters — per-route instead of a single global limiter
//
// Previously a single 100 req/15min global limiter caused 429 errors during
// normal editing sessions (2s auto-save + BOM recalculations). Now we use:
//   - publicLimiter:         100 req/15min per IP   — anonymous/public endpoints
//   - authenticatedLimiter:  500 req/15min per user  — project saves, BOM, etc.
//   - authLimiter:            10 req/15min per IP   — login/register/reset
//   - chatLimiter:            40 req/15min per user  — AI chat endpoint
// ---------------------------------------------------------------------------

// Try to extract user ID from JWT for rate-limit keying (does NOT enforce auth)
function extractUserId(req: express.Request): string | null {
  const token = getAuthTokenFromRequest(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthUser;
    return decoded.id || null;
  } catch {
    return null;
  }
}

// Anonymous/public endpoints: 100 requests per 15 minutes per IP
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_TEST ? 10000 : IS_DEV ? 1000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

// Authenticated API endpoints: 500 requests per 15 minutes, keyed by user ID.
// This covers project saves, BOM updates, and other frequent editor operations.
// Falls back to IP-based keying for unauthenticated requests that reach these
// routes (they'll be rejected by requireAuth anyway, but still rate-limited).
const authenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_TEST ? 10000 : IS_DEV ? 5000 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return extractUserId(req) || req.ip || "unknown";
  },
  message: { error: "Too many requests, please try again later" },
});

// Auth endpoints: 30 requests per 15 minutes per IP (generous enough for
// typos and page refreshes, tight enough to deter brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_TEST ? 10000 : IS_DEV ? 200 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later" },
});

// Chat endpoint rate limiter: 40 requests per 15 minutes keyed by user ID.
// Falls back to IP for unauthenticated requests so shared networks (offices,
// universities) don't exhaust a single bucket for all their users.
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_TEST ? 10000 : IS_DEV ? 400 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return extractUserId(req) || req.ip || "unknown";
  },
  handler: (req, res, _next, options) => {
    // Expose when the window resets so the frontend can show a countdown.
    const resetMs = (req as express.Request & { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime?.getTime();
    const retryAfter = resetMs ? Math.ceil((resetMs - Date.now()) / 1000) : options.windowMs / 1000;
    res.setHeader("Retry-After", retryAfter);
    res.status(429).json({
      error: "Too many chat requests, please try again later",
      retryAfter,
      resetAt: resetMs ? new Date(resetMs).toISOString() : null,
    });
  },
});

// Building lookup rate limiter: unauthenticated gets 10 req/min,
// authenticated gets 60 req/min (keyed by user ID).
// This protects the public building lookup endpoint against scraping and abuse.
const buildingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: IS_TEST ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    const userId = extractUserId(req);
    if (userId) return `user:${userId}`;
    return req.ip || "unknown";
  },
  handler: (req, res) => {
    logger.warn({ ip: req.ip, userId: extractUserId(req) || "anonymous" }, "Building endpoint rate limit hit");
    res.status(429).json({ error: "Too many building lookup requests, please try again later" });
  },
  skip: (req) => {
    // Authenticated users get a higher limit
    const userId = extractUserId(req);
    if (userId) {
      // We use a separate counter check concept — but express-rate-limit
      // doesn't support per-key max easily. Instead we override max
      // dynamically using the request.
      return false;
    }
    return false;
  },
});

// Higher limit for authenticated building lookups
const buildingLimiterAuthenticated = rateLimit({
  windowMs: 60 * 1000,
  max: IS_TEST ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return extractUserId(req) || req.ip || "unknown";
  },
  handler: (req, res) => {
    logger.warn({ userId: extractUserId(req) }, "Building endpoint rate limit hit (authenticated)");
    res.status(429).json({ error: "Too many building lookup requests, please try again later" });
  },
});

// Health check — no rate limit
// Served at both /health (legacy) and /api/health (standard prefix)
const healthHandler = async (_req: express.Request, res: express.Response) => {
  let dbStatus: "ok" | "error" = "error";
  let redisStatus: "ok" | "error" | "unconfigured" = "unconfigured";

  // Check database connectivity
  try {
    await pool.query("SELECT 1");
    dbStatus = "ok";
  } catch {
    dbStatus = "error";
  }

  // Check Redis connectivity if configured (simple TCP probe)
  if (process.env.REDIS_URL) {
    try {
      const redisUrl = new URL(process.env.REDIS_URL);
      const host = redisUrl.hostname;
      const port = parseInt(redisUrl.port || "6379");
      await new Promise<void>((resolve, reject) => {
        const net = require("net") as typeof import("net");
        const socket = net.connect(port, host, () => {
          socket.destroy();
          resolve();
        });
        socket.on("error", reject);
        socket.setTimeout(2000, () => {
          socket.destroy();
          reject(new Error("Redis TCP timeout"));
        });
      });
      redisStatus = "ok";
    } catch {
      redisStatus = "error";
    }
  }

  const overallStatus = dbStatus === "ok" ? "ok" : "degraded";

  res.status(overallStatus === "ok" ? 200 : 503).json({
    status: overallStatus,
    version: process.env.APP_VERSION || "dev",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    db: dbStatus,
    redis: redisStatus,
  });
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// Email validation regex
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strip HTML tags from user input to prevent XSS
function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

const galleryCostExpression = `(
  (SELECT COALESCE(SUM(pb.quantity * COALESCE(pr.unit_price, 0) * COALESCE(m.waste_factor, 1)), 0)
   FROM project_bom pb
   JOIN materials m ON pb.material_id = m.id
   LEFT JOIN pricing pr ON pb.material_id = pr.material_id AND pr.is_primary = true
   WHERE pb.project_id = p.id)
  * CASE WHEN p.project_type = 'taloyhtio' THEN GREATEST(COALESCE(p.unit_count, 1), 1) ELSE 1 END
)`;

const galleryPostalCodeExpression = `substring(COALESCE(
  NULLIF(p.building_info->>'postal_code', ''),
  NULLIF(p.building_info->>'postalCode', ''),
  NULLIF(p.building_info->>'postinumero', ''),
  p.building_info->>'address',
  ''
) from '([0-9]{5})')`;

const gallerySelectFields = `
  p.id, p.name, p.description, p.thumbnail_url, p.share_token,
  p.is_public, p.published_at, p.created_at, p.updated_at, p.project_type,
  COALESCE(p.gallery_like_count, 0)::int AS heart_count,
  COALESCE(p.gallery_clone_count, 0)::int AS clone_count,
  u.name AS owner_name,
  COALESCE(p.building_info->>'municipality', p.building_info->>'city', p.building_info->>'region', 'Finland') AS region,
  ${galleryPostalCodeExpression} AS postal_code_area,
  ${galleryCostExpression} AS estimated_cost,
  (SELECT COUNT(*)::int FROM project_views pv WHERE pv.project_id = p.id) AS view_count,
  ARRAY(
    SELECT DISTINCT m.name
    FROM project_bom pb
    JOIN materials m ON pb.material_id = m.id
    WHERE pb.project_id = p.id
    ORDER BY m.name
    LIMIT 4
  ) AS material_highlights
`;

function costBandExpression(): string {
  return `CASE
    WHEN ${galleryCostExpression} < 5000 THEN 'under-5k'
    WHEN ${galleryCostExpression} < 15000 THEN '5k-15k'
    WHEN ${galleryCostExpression} < 50000 THEN '15k-50k'
    ELSE '50k-plus'
  END`;
}

function normalizeGalleryLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 24;
  return Math.min(parsed, 60);
}

function normalizePostalCodeParam(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.match(/\b\d{5}\b/);
  return match?.[0] ?? "";
}

function normalizeShortTextParam(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").trim().slice(0, maxLength);
}

function publicGalleryWhere(): string[] {
  return [
    "p.is_public = true",
    "p.deleted_at IS NULL",
    "COALESCE(p.gallery_status, 'approved') = 'approved'",
    "p.share_token IS NOT NULL",
  ];
}

function sendAuthSession(res: express.Response, user: AuthUser, status = 200) {
  const token = signToken(user);
  const expiresAt = tokenExpiresAt();
  setAuthCookie(res, token, expiresAt);
  return res.status(status).json({ token, token_expires_at: expiresAt, user });
}

app.post("/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  const user = await login(email, password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  sendAuthSession(res, user);
});

app.post("/auth/register", authLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: "Email, password, and name are required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (name.length > 200) {
    return res.status(400).json({ error: "Name must be 200 characters or fewer" });
  }
  const sanitizedName = sanitize(name);
  try {
    const user = await register(email, password, sanitizedName);
    sendAuthSession(res, user, 201);
  } catch (e: unknown) {
    logger.error({ err: e }, "Registration error");
    Sentry.captureException(e);
    const msg = e instanceof Error ? e.message : "Registration failed";
    if (msg.includes("duplicate key")) {
      return res.status(409).json({ error: "Email already registered" });
    }
    res.status(400).json({ error: msg || "Registration failed" });
  }
});

app.post("/auth/google", authLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: "Google credential is required" });
  }
  try {
    const payload = await verifyGoogleToken(credential);
    if (!payload) {
      return res.status(401).json({ error: "Invalid Google credential" });
    }
    if (!payload.email_verified) {
      return res.status(401).json({ error: "Google email is not verified" });
    }
    const user = await googleLogin(payload);
    sendAuthSession(res, user);
  } catch (e: unknown) {
    logger.error({ err: e }, "Google auth error");
    Sentry.captureException(e);
    const msg = e instanceof Error ? e.message : "Google authentication failed";
    res.status(500).json({ error: msg });
  }
});

app.post("/auth/apple", authLimiter, async (req, res) => {
  const { identityToken, user: appleUser } = req.body;
  if (!identityToken) {
    return res.status(400).json({ error: "Apple identity token is required" });
  }
  try {
    const nameParts = appleUser?.name;
    const displayName =
      typeof appleUser?.name === "string"
        ? appleUser.name
        : [nameParts?.firstName, nameParts?.lastName].filter(Boolean).join(" ");
    const payload = await verifyAppleToken(identityToken, {
      name: displayName,
      email: appleUser?.email,
    });
    if (!payload) {
      return res.status(401).json({ error: "Invalid Apple identity token" });
    }
    if (!payload.email_verified) {
      return res.status(401).json({ error: "Apple email is not verified" });
    }
    const user = await appleLogin(payload);
    sendAuthSession(res, user);
  } catch (e: unknown) {
    logger.error({ err: e }, "Apple auth error");
    Sentry.captureException(e);
    const msg = e instanceof Error ? e.message : "Apple authentication failed";
    res.status(500).json({ error: msg });
  }
});

app.get("/auth/me", authenticatedLimiter, requireAuth, async (req, res) => {
  const result = await query(
    `SELECT id, email, name, role, email_verified, avatar_url, auth_provider,
            email_notifications, price_alert_email_frequency, push_notifications
     FROM users WHERE id = $1`,
    [req.user!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(result.rows[0]);
});

app.put("/auth/profile", authenticatedLimiter, requireAuth, async (req, res) => {
  const { name, email } = req.body;
  if (!name && !email) {
    return res.status(400).json({ error: "Name or email is required" });
  }
  if (email && !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  if (name && name.length > 200) {
    return res.status(400).json({ error: "Name must be 200 characters or fewer" });
  }
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (name) {
      fields.push(`name = $${idx++}`);
      values.push(sanitize(name));
    }
    if (email) {
      fields.push(`email = $${idx++}`);
      values.push(email.trim().toLowerCase());
    }
    values.push(req.user!.id);
    const result = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx}
       RETURNING id, email, name, role, email_notifications, price_alert_email_frequency, push_notifications`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    // Return a fresh token with updated user info
    const user = result.rows[0];
    res.json({ user, token: signToken(user), token_expires_at: tokenExpiresAt() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    if (msg.includes("duplicate key")) {
      return res.status(409).json({ error: "Email already in use" });
    }
    res.status(400).json({ error: msg || "Update failed" });
  }
});

app.put("/auth/notifications", authenticatedLimiter, requireAuth, async (req, res) => {
  const { email_notifications, price_alert_email_frequency, push_notifications } = req.body;
  if (typeof email_notifications !== "boolean") {
    return res.status(400).json({ error: "email_notifications must be a boolean" });
  }
  if (
    price_alert_email_frequency !== undefined &&
    !["off", "daily", "weekly"].includes(price_alert_email_frequency)
  ) {
    return res.status(400).json({ error: "price_alert_email_frequency must be off, daily, or weekly" });
  }
  if (push_notifications !== undefined && typeof push_notifications !== "boolean") {
    return res.status(400).json({ error: "push_notifications must be a boolean" });
  }
  const result = await query(
    `UPDATE users
     SET email_notifications = $1,
         price_alert_email_frequency = COALESCE($2, price_alert_email_frequency),
         push_notifications = COALESCE($3, push_notifications)
     WHERE id = $4
     RETURNING id, email_notifications, price_alert_email_frequency, push_notifications`,
    [email_notifications, price_alert_email_frequency ?? null, push_notifications ?? null, req.user!.id],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json(result.rows[0]);
});

app.get("/auth/unsubscribe/:token", publicLimiter, async (req, res) => {
  const token = req.params.token;
  if (!token || token.length > 128) {
    return res.status(400).send("Invalid unsubscribe token");
  }
  const result = await query(
    "UPDATE users SET email_notifications = false WHERE email_unsubscribe_token = $1 RETURNING id",
    [token],
  );
  if (result.rows.length === 0) {
    return res.status(404).send("Unsubscribe link not found");
  }
  res.type("text/plain").send("You have been unsubscribed from Helscoop activity digests.");
});

app.put("/auth/password", authenticatedLimiter, requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  try {
    const userResult = await query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user!.id]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.user!.id]);
    res.json({ message: "Password updated successfully" });
  } catch (e) {
    logger.error({ err: e }, "Password change error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to change password" });
  }
});

app.delete("/auth/account", authenticatedLimiter, requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    // Delete all BOM entries for user's projects
    await query(
      "DELETE FROM project_bom WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1)",
      [userId]
    );
    // Delete all user's projects
    await query("DELETE FROM projects WHERE user_id = $1", [userId]);
    // Delete the user
    await query("DELETE FROM users WHERE id = $1", [userId]);
    logAuditEvent(userId, "account.delete", { ip: req.ip });
    res.json({ message: "Account deleted successfully" });
  } catch (e) {
    logger.error({ err: e }, "Account deletion error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

app.post("/auth/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  try {
    // forgotPassword now sends the reset email directly
    await forgotPassword(email);
  } catch (e) {
    // Log but don't reveal errors to the client
    logger.error({ err: e }, "Forgot password error");
  }
  // Always return success to avoid revealing whether email exists
  res.json({ message: "If the email is registered, a reset link has been sent." });
});

app.post("/auth/reset-password", authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  try {
    const success = await resetPassword(token, password);
    if (!success) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }
    res.json({ message: "Password has been reset successfully" });
  } catch (e) {
    logger.error({ err: e }, "Reset password error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Email verification endpoint
app.get("/auth/verify-email", authLimiter, async (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    return res.status(400).json({ error: "Verification token is required" });
  }
  try {
    const success = await verifyEmail(token);
    if (!success) {
      return res.status(400).json({ error: "Invalid or expired verification token" });
    }
    res.json({ message: "Email verified successfully" });
  } catch (e) {
    logger.error({ err: e }, "Email verification error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to verify email" });
  }
});

// GDPR data export — rate limited to 1 request per minute per user
const exportDataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_TEST ? 10000 : IS_DEV ? 100 : 1,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return extractUserId(req) || req.ip || "unknown";
  },
  message: { error: "Too many export requests, please try again later" },
});

app.get("/auth/export-data", exportDataLimiter, requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Fetch user profile
    const userResult = await query(
      "SELECT id, email, name, role, email_verified, created_at FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const profile = userResult.rows[0];

    // Fetch all projects
    const projectsResult = await query(
      "SELECT id, name, description, scene_js, building_info, permit_metadata, share_token, created_at, updated_at FROM projects WHERE user_id = $1 ORDER BY created_at",
      [userId]
    );

    // Fetch all BOM items for user's projects
    const bomResult = await query(
      `SELECT pb.project_id, pb.material_id, pb.quantity, pb.unit
       FROM project_bom pb
       WHERE pb.project_id IN (SELECT id FROM projects WHERE user_id = $1)
       ORDER BY pb.project_id`,
      [userId]
    );

    // Group BOM items by project
    const bomByProject: Record<string, typeof bomResult.rows> = {};
    for (const item of bomResult.rows) {
      (bomByProject[item.project_id] ||= []).push(item);
    }

    const projects = projectsResult.rows.map((p) => ({
      ...p,
      bom: bomByProject[p.id] || [],
    }));

    res.json({
      exported_at: new Date().toISOString(),
      profile: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        email_verified: profile.email_verified,
        created_at: profile.created_at,
      },
      projects,
    });
  } catch (e) {
    logger.error({ err: e }, "Data export error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to export data" });
  }
});

// Resend verification email
app.post("/auth/resend-verification", authenticatedLimiter, requireAuth, async (req, res) => {
  try {
    const sent = await resendVerification(req.user!.id);
    if (!sent) {
      return res.status(400).json({ error: "Email already verified or user not found" });
    }
    res.json({ message: "Verification email sent" });
  } catch (e) {
    logger.error({ err: e }, "Resend verification error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to resend verification email" });
  }
});

app.post("/auth/logout", authLimiter, (_req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

// Refresh token endpoint — accepts a valid or recently-expired JWT and returns
// a new access token.  Uses authLimiter to prevent abuse.
// Validates that the user still exists in the database before issuing a new token.
app.post("/auth/refresh", authLimiter, async (req, res) => {
  const oldToken = getAuthTokenFromRequest(req);
  if (!oldToken) {
    return res.status(401).json({ error: "Missing authentication token" });
  }
  const user = verifyForRefresh(oldToken);
  if (!user) {
    clearAuthCookie(res);
    return res.status(401).json({ error: "Token expired or invalid" });
  }

  // Verify the user still exists and is active in the database
  try {
    const result = await query(
      "SELECT id, email, role FROM users WHERE id = $1",
      [user.id]
    );
    if (result.rows.length === 0) {
      clearAuthCookie(res);
      return res.status(401).json({ error: "User no longer exists" });
    }
    // Use the latest user data from DB (role/email may have changed)
    const dbUser = result.rows[0];
    const token = signToken(dbUser);
    const expiresAt = tokenExpiresAt();
    setAuthCookie(res, token, expiresAt);
    res.json({ token, token_expires_at: expiresAt });
  } catch (e) {
    logger.error({ err: e }, "Token refresh error");
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

// Authenticated routes get the relaxed rate limiter (500 req/15min per user)
app.use("/materials", authenticatedLimiter, materialsRouter);
app.use("/projects", authenticatedLimiter, projectImagesRouter);
app.use("/projects", authenticatedLimiter, projectsRouter);
app.use("/bom", authenticatedLimiter, bomRouter);
app.use("/suppliers", authenticatedLimiter, suppliersRouter);
app.use("/pricing", authenticatedLimiter, pricingRouter);
app.use("/notifications", authenticatedLimiter, notificationsRouter);
app.use("/chat", chatLimiter, chatRouter);
app.use("/entitlements", authenticatedLimiter, entitlementsRouter);
app.use("/roles", authenticatedLimiter, rolesRouter);
app.use("/pro", authenticatedLimiter, proRouter);
app.use("/audit", authenticatedLimiter, auditRouter);
app.use("/admin", authenticatedLimiter, adminRouter);
app.use("/affiliates", authenticatedLimiter, affiliatesRouter);
app.use("/compliance", authenticatedLimiter, complianceRouter);
app.use("/building-registry", buildingLimiter, buildingRegistryRouter);
app.use("/carbon", authenticatedLimiter, carbonRouter);
app.use("/huoltokirja", authenticatedLimiter, huoltokirjaRouter);
app.use("/waste", authenticatedLimiter, wasteRouter);
app.use("/ifc-export", authenticatedLimiter, ifcExportRouter);
app.use("/permit-pack", authenticatedLimiter, permitPackRouter);
app.use("/stock", authenticatedLimiter, stockRouter);
app.use("/subsidies", authenticatedLimiter, subsidiesRouter);
app.use("/kesko", authenticatedLimiter, keskoRouter);
app.use("/ara-grant", authenticatedLimiter, araGrantRouter);
app.use("/ryhti", authenticatedLimiter, ryhtiRouter);
app.use("/photo-estimate", authenticatedLimiter, photoEstimateRouter);
app.use("/quantity-takeoff", authenticatedLimiter, quantityTakeoffRouter);
app.use("/room-scan", authenticatedLimiter, roomScanRouter);
app.use("/marketplace", authenticatedLimiter, marketplaceRouter);
app.use("/terrain", buildingLimiter, terrainRouter);
app.use("/api/terrain", buildingLimiter, terrainRouter);
// Building endpoint: stricter rate limiting with tiered limits for anon vs authenticated
app.use("/building", buildingLimiter, buildingLimiterAuthenticated, buildingRouter);

// Public inspiration gallery — browse opt-in published projects without auth.
app.get("/gallery/projects", publicLimiter, async (req, res) => {
  const where = publicGalleryWhere();
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const q = normalizeShortTextParam(req.query.q, 120);
  if (q) {
    const needle = addParam(`%${q}%`);
    where.push(`(
      p.name ILIKE ${needle}
      OR COALESCE(p.description, '') ILIKE ${needle}
      OR COALESCE(p.building_info->>'address', '') ILIKE ${needle}
      OR EXISTS (
        SELECT 1
        FROM project_bom pbq
        JOIN materials mq ON pbq.material_id = mq.id
        JOIN categories cq ON mq.category_id = cq.id
        WHERE pbq.project_id = p.id
          AND (mq.name ILIKE ${needle} OR mq.id ILIKE ${needle} OR cq.display_name ILIKE ${needle})
      )
    )`);
  }

  const postalCode = normalizePostalCodeParam(req.query.postal_code ?? req.query.postalCode);
  if (postalCode) {
    where.push(`${galleryPostalCodeExpression} = ${addParam(postalCode)}`);
  }

  const renovationType = normalizeShortTextParam(req.query.renovation_type ?? req.query.renovationType, 80);
  if (renovationType) {
    const needle = addParam(`%${renovationType}%`);
    where.push(`(
      COALESCE(p.description, '') ILIKE ${needle}
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) project_tag(tag)
        WHERE project_tag.tag ILIKE ${needle}
      )
      OR EXISTS (
        SELECT 1
        FROM project_bom pbr
        JOIN materials mr ON pbr.material_id = mr.id
        JOIN categories cr ON mr.category_id = cr.id
        WHERE pbr.project_id = p.id
          AND (mr.name ILIKE ${needle} OR cr.display_name ILIKE ${needle})
      )
    )`);
  }

  const projectType = typeof req.query.project_type === "string" ? req.query.project_type : "";
  if (projectType === "omakotitalo" || projectType === "taloyhtio") {
    where.push(`p.project_type = ${addParam(projectType)}`);
  }

  const region = normalizeShortTextParam(req.query.region, 80);
  if (region) {
    const needle = addParam(`%${region}%`);
    where.push(`(
      COALESCE(p.building_info->>'municipality', '') ILIKE ${needle}
      OR COALESCE(p.building_info->>'city', '') ILIKE ${needle}
      OR COALESCE(p.building_info->>'region', '') ILIKE ${needle}
      OR COALESCE(p.building_info->>'address', '') ILIKE ${needle}
    )`);
  }

  const material = normalizeShortTextParam(req.query.material, 80);
  if (material) {
    const needle = addParam(`%${material}%`);
    const tag = addParam(material);
    where.push(`EXISTS (
      SELECT 1
      FROM project_bom pbm
      JOIN materials mm ON pbm.material_id = mm.id
      JOIN categories cm ON mm.category_id = cm.id
      WHERE pbm.project_id = p.id
        AND (mm.name ILIKE ${needle} OR mm.id ILIKE ${needle} OR cm.display_name ILIKE ${needle} OR ${tag} = ANY(COALESCE(mm.tags, ARRAY[]::text[])))
    )`);
  }

  const costRange = typeof req.query.cost_range === "string"
    ? req.query.cost_range
    : typeof req.query.costRange === "string"
      ? req.query.costRange
      : "";
  if (costRange === "under-5k") {
    where.push(`${galleryCostExpression} < 5000`);
  } else if (costRange === "5k-15k") {
    where.push(`${galleryCostExpression} >= 5000 AND ${galleryCostExpression} < 15000`);
  } else if (costRange === "15k-50k") {
    where.push(`${galleryCostExpression} >= 15000 AND ${galleryCostExpression} < 50000`);
  } else if (costRange === "50k-plus") {
    where.push(`${galleryCostExpression} >= 50000`);
  }

  const limit = addParam(normalizeGalleryLimit(req.query.limit));
  const result = await query(
    `SELECT ${gallerySelectFields}, ${costBandExpression()} AS cost_band
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(p.published_at, p.updated_at) DESC, p.updated_at DESC
     LIMIT ${limit}`,
    params,
  );

  res.json({ projects: result.rows });
});

app.get("/gallery/neighborhood-insights", publicLimiter, async (req, res) => {
  const postalCode = normalizePostalCodeParam(req.query.postal_code ?? req.query.postalCode);
  if (!postalCode) {
    return res.status(400).json({ error: "postal_code must include a 5 digit Finnish postal code" });
  }

  const where = publicGalleryWhere();
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  where.push(`${galleryPostalCodeExpression} = ${addParam(postalCode)}`);

  const projectType = typeof req.query.project_type === "string" ? req.query.project_type : "";
  if (projectType === "omakotitalo" || projectType === "taloyhtio") {
    where.push(`p.project_type = ${addParam(projectType)}`);
  }

  const excludeProjectId = normalizeShortTextParam(req.query.exclude_project_id ?? req.query.excludeProjectId, 80);
  if (excludeProjectId) {
    where.push(`p.id <> ${addParam(excludeProjectId)}`);
  }

  const whereSql = where.join(" AND ");
  const sharedParams = [...params];
  const similarParams = [...sharedParams, normalizeGalleryLimit(req.query.limit)];
  const similarLimit = `$${similarParams.length}`;
  const [stats, renovationTypes, materials, similar] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS project_count,
         COUNT(*) FILTER (WHERE COALESCE(p.published_at, p.updated_at) >= date_trunc('year', now()))::int AS projects_this_year,
         COALESCE(ROUND(AVG(${galleryCostExpression})::numeric), 0)::float AS average_cost
       FROM projects p
       WHERE ${whereSql}`,
      sharedParams,
    ),
    query(
      `SELECT project_tag.tag AS type, COUNT(*)::int AS count
       FROM projects p
       CROSS JOIN LATERAL unnest(COALESCE(p.tags, ARRAY[]::text[])) project_tag(tag)
       WHERE ${whereSql}
         AND project_tag.tag <> ''
       GROUP BY project_tag.tag
       ORDER BY count DESC, project_tag.tag ASC
       LIMIT 6`,
      sharedParams,
    ),
    query(
      `SELECT COALESCE(c.display_name, m.name) AS name, COUNT(DISTINCT p.id)::int AS project_count
       FROM projects p
       JOIN project_bom pb ON pb.project_id = p.id
       JOIN materials m ON pb.material_id = m.id
       JOIN categories c ON m.category_id = c.id
       WHERE ${whereSql}
       GROUP BY COALESCE(c.display_name, m.name)
       ORDER BY project_count DESC, name ASC
       LIMIT 6`,
      sharedParams,
    ),
    query(
      `SELECT ${gallerySelectFields}, ${costBandExpression()} AS cost_band
       FROM projects p
       JOIN users u ON u.id = p.user_id
       WHERE ${whereSql}
       ORDER BY COALESCE(p.published_at, p.updated_at) DESC, p.updated_at DESC
       LIMIT ${similarLimit}`,
      similarParams,
    ),
  ]);

  const projectCount = Number(stats.rows[0]?.project_count ?? 0);
  res.json({
    postal_code_area: postalCode,
    project_type: projectType === "omakotitalo" || projectType === "taloyhtio" ? projectType : null,
    project_count: projectCount,
    projects_this_year: Number(stats.rows[0]?.projects_this_year ?? 0),
    average_cost: Number(stats.rows[0]?.average_cost ?? 0),
    renovation_types: renovationTypes.rows,
    popular_materials: materials.rows.map((row) => ({
      ...row,
      share_pct: projectCount > 0 ? Math.round((Number(row.project_count) / projectCount) * 100) : 0,
    })),
    similar_projects: similar.rows,
  });
});

app.get("/gallery/projects/:id", publicLimiter, async (req, res) => {
  const result = await query(
    `SELECT ${gallerySelectFields}, p.scene_js, p.building_info, ${costBandExpression()} AS cost_band
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1
       AND p.is_public = true
       AND p.deleted_at IS NULL
       AND COALESCE(p.gallery_status, 'approved') = 'approved'
       AND p.share_token IS NOT NULL`,
    [req.params.id],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Gallery project not found" });
  }

  const project = result.rows[0];
  const bom = await query(
    `SELECT pb.*, m.name AS material_name, c.display_name AS category_name,
      pr.unit_price, pr.link, s.name AS supplier_name,
      pr.in_stock, pr.stock_level, pr.store_location, pr.last_checked_at AS stock_last_checked_at,
      (pb.quantity * pr.unit_price * m.waste_factor) AS total
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing pr ON m.id = pr.material_id AND pr.is_primary = true
     LEFT JOIN suppliers s ON pr.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY c.sort_order`,
    [project.id],
  );

  res.json({ ...project, bom: bom.rows, comments: [] });
});

app.post("/gallery/projects/:id/clone", authenticatedLimiter, requireAuth, requirePermission("project:create"), async (req, res) => {
  const sourceResult = await query(
    `SELECT id, name, description, project_type, unit_count, tags
     FROM projects p
     WHERE id = $1
       AND is_public = true
       AND deleted_at IS NULL
       AND COALESCE(gallery_status, 'approved') = 'approved'`,
    [req.params.id],
  );
  if (sourceResult.rows.length === 0) {
    return res.status(404).json({ error: "Gallery project not found" });
  }

  const source = sourceResult.rows[0];
  const sceneJs = [
    `// Inspired by public gallery project: ${String(source.name || "Helscoop project").slice(0, 120)}`,
    "// Geometry intentionally starts blank. The material list was copied for planning.",
    "",
  ].join("\n");
  const cloneResult = await query(
    `INSERT INTO projects (
       user_id, name, description, scene_js, original_scene_js,
       project_type, unit_count, tags, status
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'planning')
     RETURNING *`,
    [
      req.user!.id,
      `Inspired by ${String(source.name || "gallery project").slice(0, 120)}`.slice(0, 200),
      `Started from the public gallery project "${source.name}". Materials were copied; geometry starts blank.`,
      sceneJs,
      sceneJs,
      source.project_type ?? "omakotitalo",
      source.unit_count ?? null,
      Array.isArray(source.tags) ? source.tags : [],
    ],
  );
  const clone = cloneResult.rows[0];

  await query(
    `INSERT INTO project_bom (project_id, material_id, quantity, unit)
     SELECT $1, material_id, quantity, unit
     FROM project_bom
     WHERE project_id = $2`,
    [clone.id, source.id],
  );
  await query(
    "UPDATE projects SET gallery_clone_count = COALESCE(gallery_clone_count, 0) + 1 WHERE id = $1",
    [source.id],
  );
  logAuditEvent(req.user!.id, "gallery.clone", { targetId: source.id, clonedProjectId: clone.id, ip: req.ip });

  res.status(201).json({ ...clone, cloned_from_project_id: source.id });
});

function parseSharePreviewImage(value: unknown): { mime: string; bytes: Buffer } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const preview = value as Record<string, unknown>;
  const candidates = [preview.after_image, preview.before_image];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const match = candidate.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) continue;
    const subtype = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
    return {
      mime: `image/${subtype}`,
      bytes: Buffer.from(match[2], "base64"),
    };
  }
  return null;
}

app.get("/shared/:token/og-image", publicLimiter, async (req, res) => {
  const { token } = req.params;
  if (!token || typeof token !== "string" || token.length > 64) {
    return res.status(400).json({ error: "Invalid share token" });
  }

  const result = await query(
    `SELECT id, share_preview, share_token_expires_at
     FROM projects
     WHERE share_token = $1
       AND deleted_at IS NULL`,
    [token],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Shared project not found" });
  }

  const project = result.rows[0];
  if (project.share_token_expires_at && new Date(project.share_token_expires_at).getTime() <= Date.now()) {
    return res.status(410).json({ error: "Shared project link has expired", code: "share_expired" });
  }

  const image = parseSharePreviewImage(project.share_preview);
  if (!image) {
    return res.status(404).json({ error: "Shared preview image not found" });
  }

  res.setHeader("Content-Type", image.mime);
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
  res.send(image.bytes);
});

// Public shared project endpoint — no auth required
app.get("/shared/:token", publicLimiter, async (req, res) => {
  const { token } = req.params;
  if (!token || typeof token !== "string" || token.length > 64) {
    return res.status(400).json({ error: "Invalid share token" });
  }

  const result = await query(
    `SELECT p.id, p.name, p.description, p.scene_js, p.building_info, p.thumbnail_url, p.share_preview,
      p.is_public, p.published_at, p.project_type, p.created_at, p.updated_at, p.share_token_expires_at,
      COALESCE(p.gallery_like_count, 0)::int AS heart_count,
      COALESCE(p.gallery_clone_count, 0)::int AS clone_count,
      u.name AS owner_name,
      (SELECT COUNT(*)::int FROM project_views WHERE project_id = p.id) AS view_count
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE p.share_token = $1
       AND p.deleted_at IS NULL`,
    [token]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Shared project not found" });
  }

  const project = result.rows[0];
  if (project.share_token_expires_at && new Date(project.share_token_expires_at).getTime() <= Date.now()) {
    return res.status(410).json({ error: "Shared project link has expired", code: "share_expired" });
  }
  try {
    await logProjectView(project.id, req.ip, req.get("referer") || req.get("referrer") || null);
  } catch (err) {
    logger.warn({ err, projectId: project.id }, "Failed to log shared project view");
  }

  const bom = await query(
    `SELECT pb.*, m.name AS material_name, c.display_name AS category_name,
      p.unit_price, p.link, s.name AS supplier_name,
      p.in_stock, p.stock_level, p.store_location, p.last_checked_at AS stock_last_checked_at,
      (pb.quantity * p.unit_price * m.waste_factor) AS total
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY c.sort_order`,
    [project.id]
  );

  const comments = await query(
    `SELECT id, commenter_name, message, created_at
     FROM project_share_comments
     WHERE project_id = $1
     ORDER BY created_at ASC`,
    [project.id]
  );

  res.json({ ...project, bom: bom.rows, comments: comments.rows });
});

app.post("/shared/:token/comments", publicLimiter, async (req, res) => {
  const { token } = req.params;
  if (!token || typeof token !== "string" || token.length > 64) {
    return res.status(400).json({ error: "Invalid share token" });
  }

  const commenterName = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 2000) : "";
  if (!commenterName || !message) {
    return res.status(400).json({ error: "Name and message are required" });
  }

  const projectResult = await query(
    `SELECT p.id, p.name, p.user_id, p.share_token_expires_at,
            u.email AS owner_email, u.name AS owner_name, u.email_notifications
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE p.share_token = $1
       AND p.deleted_at IS NULL`,
    [token],
  );
  if (projectResult.rows.length === 0) {
    return res.status(404).json({ error: "Shared project not found" });
  }

  const project = projectResult.rows[0];
  if (project.share_token_expires_at && new Date(project.share_token_expires_at).getTime() <= Date.now()) {
    return res.status(410).json({ error: "Shared project link has expired", code: "share_expired" });
  }

  const commentResult = await query(
    `INSERT INTO project_share_comments (project_id, commenter_name, message, viewer_ip_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, commenter_name, message, created_at`,
    [project.id, commenterName, message, hashViewerIp(req.ip)],
  );
  const comment = commentResult.rows[0];
  const title = "New contractor comment";
  const body = `${commenterName} commented on ${project.name}`;

  await query(
    `INSERT INTO notifications (user_id, type, title, body, metadata_json)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      project.user_id,
      "contractor_comment",
      title,
      body,
      JSON.stringify({
        project_id: project.id,
        project_name: project.name,
        comment_id: comment.id,
        commenter_name: commenterName,
      }),
    ],
  );

  if (project.email_notifications !== false && project.owner_email) {
    const appUrl = (process.env.APP_URL || "https://helscoop.fi").replace(/\/$/, "");
    const emailBody = [
      `Hi ${project.owner_name || "there"},`,
      "",
      `${commenterName} left a contractor comment on "${project.name}":`,
      "",
      message,
      "",
      `Open project: ${appUrl}/project/${project.id}`,
    ].join("\n");
    sendEmail(project.owner_email, `Helscoop: contractor comment on ${project.name}`, emailBody).catch((err) => {
      logger.warn({ err, projectId: project.id }, "Failed to send contractor comment email");
    });
  }

  res.status(201).json(comment);
});

// Public endpoints get the stricter IP-based limiter
app.get("/materials/export/viewer", publicLimiter, async (_req, res) => {
  const { query: dbQuery } = await import("./db");
  const mats = await dbQuery(`
    SELECT m.*, c.id AS cat_id, c.display_name AS category_name
    FROM materials m JOIN categories c ON m.category_id = c.id
    ORDER BY c.sort_order, m.name
  `);
  const pricing = await dbQuery(`
    SELECT p.*, s.name AS supplier_name, s.id AS supplier_id
    FROM pricing p JOIN suppliers s ON p.supplier_id = s.id
  `);
  const cats = await dbQuery("SELECT * FROM categories ORDER BY sort_order");
  const sups = await dbQuery("SELECT * FROM suppliers ORDER BY name");

  const pricingByMat: Record<string, typeof pricing.rows> = {};
  for (const p of pricing.rows) {
    (pricingByMat[p.material_id] ||= []).push(p);
  }

  const materials: Record<string, unknown> = {};
  for (const m of mats.rows) {
    const prices = pricingByMat[m.id] || [];
    const primary = prices.find((p) => p.is_primary) || prices[0];
    const alts = prices.filter((p) => p !== primary);

    materials[m.id] = {
      name: m.name,
      name_fi: m.name_fi || m.name,
      name_en: m.name_en || m.name,
      category: m.cat_id,
      tags: m.tags || [],
      visual: {
        albedo: m.visual_albedo || [0.8, 0.8, 0.8],
        roughness: m.visual_roughness ?? 0.5,
        metallic: m.visual_metallic ?? 0.0,
        ...(m.visual_albedo_texture && { albedoTexture: m.visual_albedo_texture }),
        ...(m.visual_normal_texture && { normalTexture: m.visual_normal_texture }),
      },
      thermal: {
        conductivity: m.thermal_conductivity ?? 0,
        thickness: m.thermal_thickness ?? 0,
      },
      structural: {
        gradeClass: m.structural_grade_class || "",
        maxSpan_floor_mm: m.structural_max_span_floor_mm ?? 0,
        maxSpan_wall_mm: m.structural_max_span_wall_mm ?? 0,
        maxSpan_rafter_mm: m.structural_max_span_rafter_mm ?? 0,
        bendingStrength_MPa: m.structural_bending_strength_mpa ?? 0,
        modulus_GPa: m.structural_modulus_gpa ?? 0,
      },
      pricing: primary
        ? {
            unit: primary.unit,
            unitPrice: parseFloat(primary.unit_price),
            supplier: primary.supplier_name,
            link: primary.link || "",
            sku: primary.sku || "",
            ean: primary.ean || "",
            currency: primary.currency || "EUR",
            lastPriceCheck: primary.last_scraped_at || "",
            alternativeSuppliers: alts.map((a) => ({
              supplier: a.supplier_name,
              unitPrice: parseFloat(a.unit_price),
              link: a.link || "",
              sku: a.sku || "",
            })),
          }
        : { unit: "kpl", unitPrice: 0, supplier: "", link: "" },
    };
  }

  const categories: Record<string, unknown> = {};
  for (const c of cats.rows) {
    categories[c.id] = {
      displayName: c.display_name,
      displayNameFi: c.display_name_fi,
      sortOrder: c.sort_order,
    };
  }

  const suppliers: Record<string, unknown> = {};
  for (const s of sups.rows) {
    suppliers[s.id] = {
      name: s.name,
      website: s.url || s.website || "",
      country: s.country || "FI",
    };
  }

  res.json({ version: 1, materials, categories, suppliers });
});

const TEMPLATE_CATEGORIES = new Set(["sauna", "garage", "shed", "terrace", "other"]);
const TEMPLATE_DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);
const TEMPLATE_SORTS = new Set(["popular", "newest", "price"]);

interface TemplateBomItem {
  material_id: string;
  quantity: number;
  unit: string;
}

interface TemplateInsertPayload {
  id: string;
  name: string;
  name_fi: string | null;
  name_en: string | null;
  description: string;
  description_fi: string | null;
  description_en: string | null;
  category: string;
  icon: string | null;
  scene_js: string;
  bom: TemplateBomItem[];
  thumbnail_url: string | null;
  estimated_cost: number | null;
  difficulty: string;
  area_m2: number | null;
  is_featured: boolean;
  is_community: boolean;
  moderation_status: "pending" | "approved";
  author_id: string | null;
}

function queryStringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function normalizeTemplateLang(value: unknown): "fi" | "en" {
  return queryStringValue(value) === "en" ? "en" : "fi";
}

function normalizeTemplateLimit(value: unknown): number {
  const parsed = Number(queryStringValue(value) ?? value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 60;
  return Math.min(parsed, 100);
}

function slugifyTemplateId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return slug || `template-${Date.now()}`;
}

function readTemplateText(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const cleaned = sanitize(value).slice(0, maxLength);
  return cleaned || null;
}

function readTemplateRawText(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function readTemplateNumber(body: Record<string, unknown>, key: string): number | null {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readTemplateBom(value: unknown): TemplateBomItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 120).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const materialId = typeof row.material_id === "string" ? sanitize(row.material_id).slice(0, 120) : "";
    const unit = typeof row.unit === "string" ? sanitize(row.unit).slice(0, 24) : "kpl";
    const quantity = Number(row.quantity);
    if (!materialId || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ material_id: materialId, quantity, unit: unit || "kpl" }];
  });
}

function buildTemplatePayload(
  body: Record<string, unknown>,
  options: { community: boolean; authorId: string | null },
): TemplateInsertPayload | { error: string } {
  const name = readTemplateText(body, "name", 100);
  const sceneJs = readTemplateRawText(body, "scene_js", 100_000);
  if (!name || !sceneJs) {
    return { error: "Template name and scene_js are required" };
  }

  const categoryCandidate = readTemplateText(body, "category", 40) || "other";
  const difficultyCandidate = readTemplateText(body, "difficulty", 20) || "intermediate";
  const idCandidate = readTemplateText(body, "id", 64);
  const description = readTemplateText(body, "description", 2000) || "";

  return {
    id: options.community
      ? `${slugifyTemplateId(idCandidate || name)}-${crypto.randomBytes(3).toString("hex")}`
      : slugifyTemplateId(idCandidate || name),
    name,
    name_fi: readTemplateText(body, "name_fi", 100),
    name_en: readTemplateText(body, "name_en", 100),
    description,
    description_fi: readTemplateText(body, "description_fi", 2000),
    description_en: readTemplateText(body, "description_en", 2000),
    category: TEMPLATE_CATEGORIES.has(categoryCandidate) ? categoryCandidate : "other",
    icon: readTemplateText(body, "icon", 40),
    scene_js: sceneJs,
    bom: readTemplateBom(body.bom),
    thumbnail_url: readTemplateRawText(body, "thumbnail_url", 250_000),
    estimated_cost: readTemplateNumber(body, "estimated_cost"),
    difficulty: TEMPLATE_DIFFICULTIES.has(difficultyCandidate) ? difficultyCandidate : "intermediate",
    area_m2: readTemplateNumber(body, "area_m2"),
    is_featured: options.community ? false : body.is_featured === true,
    is_community: options.community || body.is_community === true,
    moderation_status: options.community ? "pending" : "approved",
    author_id: options.authorId,
  };
}

function normalizeTemplateRow(row: Record<string, unknown>, lang: "fi" | "en") {
  const nameFi = typeof row.name_fi === "string" ? row.name_fi : null;
  const nameEn = typeof row.name_en === "string" ? row.name_en : null;
  const descriptionFi = typeof row.description_fi === "string" ? row.description_fi : null;
  const descriptionEn = typeof row.description_en === "string" ? row.description_en : null;
  const name = typeof row.name === "string" ? row.name : "";
  const description = typeof row.description === "string" ? row.description : "";

  return {
    id: row.id,
    name: (lang === "en" ? nameEn : nameFi) || name,
    name_fi: nameFi,
    name_en: nameEn,
    description: (lang === "en" ? descriptionEn : descriptionFi) || description,
    description_fi: descriptionFi,
    description_en: descriptionEn,
    category: row.category,
    icon: row.icon,
    scene_js: row.scene_js,
    bom: Array.isArray(row.bom) ? row.bom : [],
    thumbnail_url: row.thumbnail_url,
    estimated_cost: row.estimated_cost === null || row.estimated_cost === undefined ? null : Number(row.estimated_cost),
    difficulty: row.difficulty,
    area_m2: row.area_m2 === null || row.area_m2 === undefined ? null : Number(row.area_m2),
    is_featured: row.is_featured === true,
    is_community: row.is_community === true,
    author_id: row.author_id,
    author_name: row.author_name,
    use_count: row.use_count === null || row.use_count === undefined ? 0 : Number(row.use_count),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function insertTemplate(payload: TemplateInsertPayload) {
  return query(
    `INSERT INTO templates (
       id, name, name_fi, name_en, description, description_fi, description_en,
       category, icon, scene_js, bom, thumbnail_url, estimated_cost, difficulty,
       area_m2, is_featured, is_community, moderation_status, author_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [
      payload.id,
      payload.name,
      payload.name_fi,
      payload.name_en,
      payload.description,
      payload.description_fi,
      payload.description_en,
      payload.category,
      payload.icon,
      payload.scene_js,
      JSON.stringify(payload.bom),
      payload.thumbnail_url,
      payload.estimated_cost,
      payload.difficulty,
      payload.area_m2,
      payload.is_featured,
      payload.is_community,
      payload.moderation_status,
      payload.author_id,
    ],
  );
}

app.get("/templates", publicLimiter, async (req, res) => {
  const lang = normalizeTemplateLang(req.query.lang);
  const category = queryStringValue(req.query.category);
  const search = queryStringValue(req.query.q);
  const sortCandidate = queryStringValue(req.query.sort) || "popular";
  const sort = TEMPLATE_SORTS.has(sortCandidate) ? sortCandidate : "popular";
  const limit = normalizeTemplateLimit(req.query.limit);
  const params: unknown[] = [];
  const filters = ["t.moderation_status = 'approved'"];

  if (category && category !== "all" && TEMPLATE_CATEGORIES.has(category)) {
    params.push(category);
    filters.push(`t.category = $${params.length}`);
  }

  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    filters.push(
      `(t.name ILIKE $${params.length} OR t.name_fi ILIKE $${params.length} OR t.name_en ILIKE $${params.length} OR t.description ILIKE $${params.length})`,
    );
  }

  params.push(limit);
  const orderBy = sort === "newest"
    ? "t.created_at DESC, t.name ASC"
    : sort === "price"
      ? "COALESCE(t.estimated_cost, 2147483647) ASC, t.name ASC"
      : "t.is_featured DESC, t.use_count DESC, t.created_at DESC, t.name ASC";

  try {
    const result = await query(
      `SELECT t.*, u.name AS author_name
       FROM templates t
       LEFT JOIN users u ON u.id = t.author_id
       WHERE ${filters.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT $${params.length}`,
      params,
    );
    res.json(result.rows.map((row) => normalizeTemplateRow(row, lang)));
  } catch (e: unknown) {
    logger.error({ err: e }, "Template list error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to load templates" });
  }
});

app.post("/templates", authenticatedLimiter, requireAuth, requirePermission("admin:access"), async (req, res) => {
  const payload = buildTemplatePayload((req.body ?? {}) as Record<string, unknown>, {
    community: false,
    authorId: req.user?.id || null,
  });
  if ("error" in payload) return res.status(400).json({ error: payload.error });

  try {
    const result = await insertTemplate(payload);
    res.status(201).json(normalizeTemplateRow(result.rows[0], "fi"));
  } catch (e: unknown) {
    logger.error({ err: e }, "Template create error");
    Sentry.captureException(e);
    const message = e instanceof Error ? e.message : "";
    res.status(message.includes("duplicate key") ? 409 : 500).json({
      error: message.includes("duplicate key") ? "Template id already exists" : "Failed to create template",
    });
  }
});

app.post("/templates/submit", authenticatedLimiter, requireAuth, async (req, res) => {
  const payload = buildTemplatePayload((req.body ?? {}) as Record<string, unknown>, {
    community: true,
    authorId: req.user?.id || null,
  });
  if ("error" in payload) return res.status(400).json({ error: payload.error });

  try {
    const result = await insertTemplate(payload);
    res.status(201).json(normalizeTemplateRow(result.rows[0], "fi"));
  } catch (e: unknown) {
    logger.error({ err: e }, "Template submission error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to submit template" });
  }
});

app.put("/templates/:id/use", publicLimiter, async (req, res) => {
  try {
    const result = await query(
      `UPDATE templates
       SET use_count = use_count + 1, updated_at = now()
       WHERE id = $1 AND moderation_status = 'approved'
       RETURNING id, use_count`,
      [req.params.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Template not found" });
    res.json({ ok: true, id: result.rows[0].id, use_count: Number(result.rows[0].use_count) });
  } catch (e: unknown) {
    logger.error({ err: e }, "Template use tracking error");
    Sentry.captureException(e);
    res.status(500).json({ error: "Failed to track template use" });
  }
});

app.get("/categories", publicLimiter, async (_req, res) => {
  const { query: dbQuery } = await import("./db");
  const result = await dbQuery(
    "SELECT * FROM categories WHERE hidden = false ORDER BY sort_order"
  );
  res.json(result.rows);
});

app.get("/bom/export/:projectId", authenticatedLimiter, requireAuth, async (req, res) => {
  const { query: dbQuery } = await import("./db");
  const lang = (req.query.lang as string) || "fi";
  const result = await dbQuery(
    `SELECT m.name, m.name_fi, m.name_en,
      c.display_name AS category, c.display_name_fi AS category_fi,
      pb.quantity, pb.unit,
      p.unit_price, (pb.quantity * p.unit_price * m.waste_factor) AS total,
      s.name AS supplier, p.link
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY c.sort_order`,
    [req.params.projectId]
  );

  // Apply locale-specific names
  const rows = result.rows.map((r) => ({
    ...r,
    name: lang === "en" ? (r.name_en || r.name) : (r.name_fi || r.name),
    category: lang === "en" ? (r.category || r.category) : (r.category_fi || r.category),
  }));

  if (req.query.format === "csv") {
    const header = "Material,Category,Qty,Unit,Price,Total,Supplier,Link\n";
    const csvRows = rows
      .map(
        (r) =>
          `"${r.name}","${r.category}",${r.quantity},"${r.unit}",${r.unit_price ?? 0},${r.total ?? 0},"${r.supplier ?? ""}","${r.link ?? ""}"`
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bom_${req.params.projectId}.csv"`
    );
    return res.send('\uFEFF' + header + csvRows);
  }

  res.json(rows);
});

// Sentry error handler — must be after routes, before generic error handler
if (process.env.SENTRY_DSN) {
  // Cast to any to avoid @types/express overload resolution issues with Sentry's handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(Sentry.expressErrorHandler() as any);
}

// Generic error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

// Only start listening when run directly. Playwright runs the real server with
// NODE_ENV=test for deterministic limits, so it opts in via E2E=1.
if (!IS_TEST || IS_E2E) {
  const server = http.createServer(app);
  installCollaborationServer(server);
  server.listen(PORT, () => {
    logger.info({ port: PORT, env: process.env.NODE_ENV || "development" }, "Helscoop API running");
  });
}

export default app;
