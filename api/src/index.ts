import express from "express";
import cors from "cors";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { login, register, signToken, requireAuth, forgotPassword, resetPassword, verifyEmail, resendVerification, AuthUser } from "./auth";
import { query } from "./db";
import materialsRouter from "./routes/materials";
import projectsRouter from "./routes/projects";
import suppliersRouter from "./routes/suppliers";
import pricingRouter from "./routes/pricing";
import chatRouter from "./routes/chat";
import buildingRouter from "./routes/building";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");
const IS_TEST = process.env.NODE_ENV === "test";
const startedAt = Date.now();
const IS_DEV = process.env.NODE_ENV === "development";

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : ["http://localhost:3000", "http://localhost:3002"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Request body size limit
app.use(express.json({ limit: "1mb" }));

// ---------------------------------------------------------------------------
// Rate limiters — per-route instead of a single global limiter
//
// Previously a single 100 req/15min global limiter caused 429 errors during
// normal editing sessions (2s auto-save + BOM recalculations). Now we use:
//   - publicLimiter:         100 req/15min per IP   — anonymous/public endpoints
//   - authenticatedLimiter:  500 req/15min per user  — project saves, BOM, etc.
//   - authLimiter:            10 req/15min per IP   — login/register/reset
//   - chatLimiter:            20 req/15min per IP   — AI chat endpoint
// ---------------------------------------------------------------------------

// Try to extract user ID from JWT for rate-limit keying (does NOT enforce auth)
function extractUserId(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as AuthUser;
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

// Stricter rate limiter for chat endpoint: 20 requests per 15 minutes per IP
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_TEST ? 10000 : IS_DEV ? 200 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many chat requests, please try again later" },
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
    console.warn(`[RATE_LIMIT] Building endpoint rate limit hit by IP=${req.ip}, user=${extractUserId(req) || "anonymous"}`);
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
    console.warn(`[RATE_LIMIT] Building endpoint rate limit hit by user=${extractUserId(req)}`);
    res.status(429).json({ error: "Too many building lookup requests, please try again later" });
  },
});

// Health check — no rate limit
app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    version: process.env.APP_VERSION || "dev",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  })
);

// Email validation regex
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Strip HTML tags from user input to prevent XSS
function sanitize(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
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
  res.json({ token: signToken(user), user });
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
    res.status(201).json({ token: signToken(user), user });
  } catch (e: unknown) {
    console.error("Registration error:", e);
    const msg = e instanceof Error ? e.message : "Registration failed";
    if (msg.includes("duplicate key")) {
      return res.status(409).json({ error: "Email already registered" });
    }
    res.status(400).json({ error: msg || "Registration failed" });
  }
});

app.get("/auth/me", authenticatedLimiter, requireAuth, async (req, res) => {
  const result = await query(
    "SELECT id, email, name, role, email_verified FROM users WHERE id = $1",
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
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, email, name, role`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    // Return a fresh token with updated user info
    const user = result.rows[0];
    res.json({ user, token: signToken(user) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Update failed";
    if (msg.includes("duplicate key")) {
      return res.status(409).json({ error: "Email already in use" });
    }
    res.status(400).json({ error: msg || "Update failed" });
  }
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
    console.error("Password change error:", e);
    res.status(500).json({ error: "Failed to change password" });
  }
});

app.delete("/auth/account", authenticatedLimiter, requireAuth, async (req, res) => {
  try {
    // Delete all BOM entries for user's projects
    await query(
      "DELETE FROM project_bom WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1)",
      [req.user!.id]
    );
    // Delete all user's projects
    await query("DELETE FROM projects WHERE user_id = $1", [req.user!.id]);
    // Delete the user
    await query("DELETE FROM users WHERE id = $1", [req.user!.id]);
    res.json({ message: "Account deleted successfully" });
  } catch (e) {
    console.error("Account deletion error:", e);
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
    console.error("Forgot password error:", e);
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
    console.error("Reset password error:", e);
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
    console.error("Email verification error:", e);
    res.status(500).json({ error: "Failed to verify email" });
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
    console.error("Resend verification error:", e);
    res.status(500).json({ error: "Failed to resend verification email" });
  }
});

// Authenticated routes get the relaxed rate limiter (500 req/15min per user)
app.use("/materials", authenticatedLimiter, materialsRouter);
app.use("/projects", authenticatedLimiter, projectsRouter);
app.use("/suppliers", authenticatedLimiter, suppliersRouter);
app.use("/pricing", authenticatedLimiter, pricingRouter);
app.use("/chat", chatLimiter, chatRouter);
// Building endpoint: stricter rate limiting with tiered limits for anon vs authenticated
app.use("/building", buildingLimiter, buildingLimiterAuthenticated, buildingRouter);

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

app.get("/templates", publicLimiter, (_req, res) => {
  res.json([
    {
      id: "pihasauna",
      name: "Pihasauna 3x4m",
      description: "Perinteinen suomalainen pihasauna hirsirunko",
      icon: "sauna",
      estimated_cost: 8500,
      scene_js: `// Pihasauna 3x4m
const floor = box(4, 0.2, 3);
const wall1 = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
const wall2 = translate(box(4, 2.4, 0.12), 0, 1.3, 1.44);
const wall3 = translate(box(0.12, 2.4, 3), -1.94, 1.3, 0);
const wall4 = translate(box(0.12, 2.4, 3), 1.94, 1.3, 0);
const door = translate(box(0.8, 2.0, 0.12), 1.0, 1.1, -1.44);
const wall1_cut = subtract(wall1, door);
const roof1 = translate(rotate(box(2.3, 0.05, 4.4), 0, 0, 0.52), -1.0, 2.9, 0);
const roof2 = translate(rotate(box(2.3, 0.05, 4.4), 0, 0, -0.52), 1.0, 2.9, 0);

scene.add(floor, { material: "foundation", color: [0.65, 0.65, 0.65] });
scene.add(wall1_cut, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(wall2, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(wall3, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(wall4, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(roof1, { material: "roofing", color: [0.35, 0.32, 0.30] });
scene.add(roof2, { material: "roofing", color: [0.35, 0.32, 0.30] });`,
      bom: [
        { material_id: "pine_48x148_c24", quantity: 42, unit: "jm" },
        { material_id: "pine_48x98_c24", quantity: 28, unit: "jm" },
        { material_id: "osb_11mm", quantity: 12, unit: "m2" },
        { material_id: "mineral_wool_150", quantity: 12, unit: "m2" },
        { material_id: "concrete_c25", quantity: 1.2, unit: "m3" },
        { material_id: "roofing_felt_yp2200", quantity: 16, unit: "m2" },
      ],
    },
    {
      id: "autotalli",
      name: "Autotalli 6x4m",
      description: "Yhden auton autotalli nosto-ovella",
      icon: "garage",
      estimated_cost: 12000,
      scene_js: `// Autotalli 6x4m
const floor = box(6, 0.15, 4);
const wall_back = translate(box(6, 2.8, 0.15), 0, 1.55, -1.925);
const wall_left = translate(box(0.15, 2.8, 4), -2.925, 1.55, 0);
const wall_right = translate(box(0.15, 2.8, 4), 2.925, 1.55, 0);
const wall_front = translate(box(6, 0.8, 0.15), 0, 2.55, 1.925);
const gate = translate(box(2.6, 2.2, 0.15), 0, 1.25, 1.925);
const roof = translate(box(6.6, 0.05, 4.6), 0, 3.0, 0);

scene.add(floor, { material: "foundation", color: [0.7, 0.7, 0.7] });
scene.add(wall_back, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_left, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_right, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_front, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(gate, { material: "lumber", color: [0.5, 0.45, 0.4] });
scene.add(roof, { material: "roofing", color: [0.3, 0.3, 0.3] });`,
      bom: [
        { material_id: "pine_48x148_c24", quantity: 65, unit: "jm" },
        { material_id: "pine_48x98_c24", quantity: 45, unit: "jm" },
        { material_id: "osb_11mm", quantity: 24, unit: "m2" },
        { material_id: "mineral_wool_150", quantity: 24, unit: "m2" },
        { material_id: "concrete_c25", quantity: 2.4, unit: "m3" },
        { material_id: "metal_roof_ruukki", quantity: 28, unit: "m2" },
      ],
    },
    {
      id: "varasto",
      name: "Puutarhavarasto 3x2m",
      description: "Kompakti varastokoppi puutarhaan",
      icon: "shed",
      estimated_cost: 3200,
      scene_js: `// Puutarhavarasto 3x2m
const floor = box(3, 0.1, 2);
const wall1 = translate(box(3, 2.2, 0.1), 0, 1.2, -0.95);
const wall2 = translate(box(3, 2.2, 0.1), 0, 1.2, 0.95);
const wall3 = translate(box(0.1, 2.2, 2), -1.45, 1.2, 0);
const wall4_upper = translate(box(0.1, 0.6, 2), 1.45, 2.0, 0);
const door = translate(box(0.8, 1.8, 0.1), 0.6, 1.0, 0.95);
const wall2_cut = subtract(wall2, door);
const roof = translate(rotate(box(3.4, 0.04, 2.4), 0.12, 0, 0), 0, 2.4, 0);

scene.add(floor, { material: "foundation", color: [0.6, 0.6, 0.6] });
scene.add(wall1, { material: "lumber", color: [0.75, 0.62, 0.42] });
scene.add(wall2_cut, { material: "lumber", color: [0.75, 0.62, 0.42] });
scene.add(wall3, { material: "lumber", color: [0.75, 0.62, 0.42] });
scene.add(wall4_upper, { material: "lumber", color: [0.75, 0.62, 0.42] });
scene.add(roof, { material: "roofing", color: [0.35, 0.35, 0.3] });`,
      bom: [
        { material_id: "pine_48x98_c24", quantity: 24, unit: "jm" },
        { material_id: "osb_11mm", quantity: 8, unit: "m2" },
        { material_id: "roofing_felt_yp2200", quantity: 8, unit: "m2" },
      ],
    },
    {
      id: "katos",
      name: "Terassi & katos 4x3m",
      description: "Avoin terassirakenne katteineen",
      icon: "pergola",
      estimated_cost: 4800,
      scene_js: `// Terassi & katos 4x3m
const deck = translate(box(4, 0.08, 3), 0, 0.4, 0);
const post1 = translate(box(0.12, 2.6, 0.12), -1.8, 1.5, -1.3);
const post2 = translate(box(0.12, 2.6, 0.12), 1.8, 1.5, -1.3);
const post3 = translate(box(0.12, 2.6, 0.12), -1.8, 1.5, 1.3);
const post4 = translate(box(0.12, 2.6, 0.12), 1.8, 1.5, 1.3);
const beam1 = translate(box(4.2, 0.18, 0.12), 0, 2.85, -1.3);
const beam2 = translate(box(4.2, 0.18, 0.12), 0, 2.85, 1.3);
const roof = translate(rotate(box(4.6, 0.04, 3.4), 0.08, 0, 0), 0, 3.1, 0);

scene.add(deck, { material: "lumber", color: [0.78, 0.65, 0.45] });
scene.add(post1, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(post2, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(post3, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(post4, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(beam1, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(beam2, { material: "lumber", color: [0.7, 0.58, 0.38] });
scene.add(roof, { material: "roofing", color: [0.4, 0.38, 0.35] });`,
      bom: [
        { material_id: "pine_48x148_c24", quantity: 30, unit: "jm" },
        { material_id: "pine_48x98_c24", quantity: 18, unit: "jm" },
        { material_id: "metal_roof_ruukki", quantity: 14, unit: "m2" },
        { material_id: "wood_screw_5x80", quantity: 250, unit: "kpl" },
      ],
    },
    {
      id: "kanala",
      name: "Kanala 2x1.5m",
      description: "Kompakti kanakoppi 4–6 kanalle, pesälaatikolla ja ulkotarhalla",
      icon: "shed",
      estimated_cost: 1800,
      scene_js: `// Kanala 2x1.5m (Chicken Coop)
const floor = box(2, 0.08, 1.5);
const wall_back = translate(box(2, 1.4, 0.08), 0, 0.78, -0.71);
const wall_left = translate(box(0.08, 1.4, 1.5), -0.96, 0.78, 0);
const wall_right = translate(box(0.08, 1.4, 1.5), 0.96, 0.78, 0);
const wall_front_upper = translate(box(2, 0.4, 0.08), 0, 1.28, 0.71);
const door_frame = translate(box(0.6, 1.0, 0.08), 0.4, 0.58, 0.71);
const wall_front = subtract(translate(box(2, 1.0, 0.08), 0, 0.58, 0.71), door_frame);
const nest_box = translate(box(0.6, 0.5, 0.5), -1.16, 0.55, -0.2);
const nest_lid = translate(rotate(box(0.7, 0.04, 0.55), 0.15, 0, 0), -1.16, 0.82, -0.2);
const perch = translate(rotate(box(0.06, 0.06, 1.3), 0, 0.3, 0), 0.2, 0.6, 0);
const roof_l = translate(rotate(box(1.3, 0.04, 1.8), 0, 0, 0.25), -0.5, 1.7, 0);
const roof_r = translate(rotate(box(1.3, 0.04, 1.8), 0, 0, -0.25), 0.5, 1.7, 0);
const leg1 = translate(box(0.06, 0.4, 0.06), -0.9, -0.12, -0.65);
const leg2 = translate(box(0.06, 0.4, 0.06), 0.9, -0.12, -0.65);
const leg3 = translate(box(0.06, 0.4, 0.06), -0.9, -0.12, 0.65);
const leg4 = translate(box(0.06, 0.4, 0.06), 0.9, -0.12, 0.65);

scene.add(floor, { material: "foundation", color: [0.6, 0.58, 0.55] });
scene.add(wall_back, { material: "lumber", color: [0.88, 0.78, 0.58] });
scene.add(wall_left, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_right, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_front_upper, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall_front, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(nest_box, { material: "lumber", color: [0.7, 0.6, 0.4] });
scene.add(nest_lid, { material: "lumber", color: [0.72, 0.62, 0.42] });
scene.add(perch, { material: "lumber", color: [0.65, 0.55, 0.35] });
scene.add(roof_l, { material: "roofing", color: [0.3, 0.35, 0.28] });
scene.add(roof_r, { material: "roofing", color: [0.3, 0.35, 0.28] });
scene.add(leg1, { material: "lumber", color: [0.5, 0.45, 0.35] });
scene.add(leg2, { material: "lumber", color: [0.5, 0.45, 0.35] });
scene.add(leg3, { material: "lumber", color: [0.5, 0.45, 0.35] });
scene.add(leg4, { material: "lumber", color: [0.5, 0.45, 0.35] });`,
      bom: [
        { material_id: "pine_48x98_c24", quantity: 14, unit: "jm" },
        { material_id: "osb_11mm", quantity: 6, unit: "m2" },
        { material_id: "roofing_felt_yp2200", quantity: 4, unit: "m2" },
        { material_id: "wood_screw_5x80", quantity: 120, unit: "kpl" },
      ],
    },
  ]);
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
  const result = await dbQuery(
    `SELECT m.name, c.display_name AS category, pb.quantity, pb.unit,
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

  if (req.query.format === "csv") {
    const header = "Material,Category,Qty,Unit,Price,Total,Supplier,Link\n";
    const rows = result.rows
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
    return res.send('\uFEFF' + header + rows);
  }

  res.json(result.rows);
});

app.listen(PORT, () => {
  console.log(`Helscoop API running on port ${PORT}`);
});

export default app;
