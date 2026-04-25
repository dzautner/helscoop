import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { query } from "./db";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { Role, normalizeRole, ROLES, isValidRole } from "./permissions";
import { getJwtSecret } from "./secrets";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export { Role, ROLES, isValidRole, normalizeRole };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Access token lifetime: 15 minutes for security; refresh extends the session.
const ACCESS_TOKEN_EXPIRES = "15m";
const ACCESS_TOKEN_SECONDS = 15 * 60;

// Grace window (seconds) within which an expired token can still be refreshed.
// Prevents race conditions when a request is in-flight at the moment of expiry.
const REFRESH_GRACE_SECONDS = 60;

export function signToken(user: AuthUser): string {
  return jwt.sign(user, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES });
}

/** Returns the absolute expiry timestamp (epoch seconds) for a freshly-signed token. */
export function tokenExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + ACCESS_TOKEN_SECONDS;
}

/**
 * Verify a token for refresh purposes.
 * Accepts tokens that are still valid OR expired within the grace window.
 * Returns the decoded user payload, or null if the token is invalid / too old.
 */
export function verifyForRefresh(token: string): AuthUser | null {
  // First try normal verification
  try {
    const payload = jwt.verify(token, getJwtSecret()) as AuthUser;
    return { id: payload.id, email: payload.email, role: payload.role };
  } catch (err) {
    // If expired, check grace window
    if (err instanceof jwt.TokenExpiredError) {
      try {
        const payload = jwt.verify(token, getJwtSecret(), {
          ignoreExpiration: true,
        }) as AuthUser & { exp: number };
        const expiredAgo = Math.floor(Date.now() / 1000) - payload.exp;
        if (expiredAgo <= REFRESH_GRACE_SECONDS) {
          return { id: payload.id, email: payload.email, role: payload.role };
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }
  try {
    const payload = jwt.verify(header.slice(7), getJwtSecret()) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export async function login(email: string, password: string) {
  const result = await query(
    "SELECT id, email, name, password_hash, role FROM users WHERE email = $1",
    [email]
  );
  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  if (!user.password_hash) return null;
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function register(
  email: string,
  password: string,
  name: string
) {
  const hash = await bcrypt.hash(password, 10);

  // Generate email verification token
  const verificationToken = crypto.randomUUID();
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const result = await query(
    `INSERT INTO users (email, name, password_hash, email_verified, verification_token, verification_token_expires, accepted_terms_at)
     VALUES ($1, $2, $3, false, $4, $5, NOW())
     RETURNING id, email, name, role`,
    [email, name, hash, verificationToken, verificationExpires.toISOString()]
  );

  // Send verification email (fire-and-forget — don't block registration)
  sendVerificationEmail(email, verificationToken).catch((err) => {
    console.error("[AUTH] Failed to send verification email:", err);
  });

  return result.rows[0];
}

// Generate a reset token for the given email. Sends a reset email if user exists.
// Returns the token if user exists, null otherwise.
export async function forgotPassword(email: string): Promise<string | null> {
  const result = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (result.rows.length === 0) return null;

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  await query(
    "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3",
    [token, expires.toISOString(), email]
  );

  // Send the reset email
  await sendPasswordResetEmail(email, token);

  return token;
}

// Verify an email address using the verification token. Returns true on success.
export async function verifyEmail(token: string): Promise<boolean> {
  const result = await query(
    "SELECT id FROM users WHERE verification_token = $1 AND verification_token_expires > NOW()",
    [token]
  );
  if (result.rows.length === 0) return false;

  await query(
    "UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires = NULL WHERE id = $1",
    [result.rows[0].id]
  );

  return true;
}

// Resend verification email for a user. Returns true if email was sent.
export async function resendVerification(userId: string): Promise<boolean> {
  const result = await query(
    "SELECT email, email_verified FROM users WHERE id = $1",
    [userId]
  );
  if (result.rows.length === 0) return false;
  if (result.rows[0].email_verified) return false; // Already verified

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await query(
    "UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3",
    [token, expires.toISOString(), userId]
  );

  return sendVerificationEmail(result.rows[0].email, token);
}

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "";
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";

type OAuthProvider = "google" | "apple";

interface GoogleTokenPayload {
  sub: string;       // Google unique user ID
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}

interface AppleTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
}

interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
}

interface AppleJwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

function cleanOAuthString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function cleanOAuthEmail(value: unknown): string | undefined {
  const cleaned = cleanOAuthString(value, 320)?.toLowerCase();
  return cleaned && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : undefined;
}

function fallbackName(email: string): string {
  return email.split("@")[0] || "Helscoop user";
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const decoded = Buffer.from(segment, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function providerUserColumn(provider: OAuthProvider): "google_id" | "apple_id" {
  return provider === "google" ? "google_id" : "apple_id";
}

async function verifyAppleJwtSignature(
  signingInput: string,
  signatureSegment: string,
  kid: string,
): Promise<boolean> {
  const res = await fetch(APPLE_JWKS_URL);
  if (!res.ok) return false;
  const body = (await res.json()) as { keys?: AppleJwk[] };
  const jwk = body.keys?.find((key) => key.kid === kid && key.kty === "RSA");
  if (!jwk) return false;

  const publicKey = crypto.createPublicKey({ key: jwk as any, format: "jwk" });
  return crypto.verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(signatureSegment, "base64url"),
  );
}

/**
 * Verify a Google ID token via Google's tokeninfo endpoint.
 * Returns the decoded payload or null if verification fails.
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleTokenPayload | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as Record<string, unknown>;

    // Verify the token was issued for our application
    if (GOOGLE_CLIENT_ID && payload.aud !== GOOGLE_CLIENT_ID) {
      return null;
    }

    const email = cleanOAuthEmail(payload.email);
    const sub = cleanOAuthString(payload.sub, 255);
    if (!email || !sub) return null;

    return {
      sub,
      email,
      email_verified: payload.email_verified === "true" || payload.email_verified === true,
      name: cleanOAuthString(payload.name, 200) || fallbackName(email),
      picture: cleanOAuthString(payload.picture, 1000),
    };
  } catch {
    return null;
  }
}

/**
 * Verify an Apple Sign In identity token with Apple's JWKS endpoint.
 * The optional display name is only provided by Apple on the first consent.
 */
export async function verifyAppleToken(
  identityToken: string,
  profileHint: { name?: unknown; email?: unknown } = {},
): Promise<AppleTokenPayload | null> {
  const parts = identityToken.split(".");
  if (parts.length !== 3) return null;

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeBase64UrlJson(headerSegment);
  const payload = decodeBase64UrlJson(payloadSegment);
  if (!header || !payload) return null;
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
  if (payload.iss !== APPLE_ISSUER) return null;
  if (APPLE_CLIENT_ID && payload.aud !== APPLE_CLIENT_ID) return null;

  const exp = typeof payload.exp === "number" ? payload.exp : Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;

  try {
    const verified = await verifyAppleJwtSignature(
      `${headerSegment}.${payloadSegment}`,
      signatureSegment,
      header.kid,
    );
    if (!verified) return null;
  } catch {
    return null;
  }

  const sub = cleanOAuthString(payload.sub, 255);
  const email = cleanOAuthEmail(payload.email) || cleanOAuthEmail(profileHint.email);
  if (!sub || !email) return null;

  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  const name = cleanOAuthString(profileHint.name, 200) || cleanOAuthString(payload.name, 200);

  return {
    sub,
    email,
    email_verified: emailVerified,
    name: name || fallbackName(email),
  };
}

async function linkOAuthProvider(userId: string, profile: OAuthProfile) {
  const providerColumn = providerUserColumn(profile.provider);
  await query(
    `UPDATE users
     SET ${providerColumn} = COALESCE(${providerColumn}, $1),
         email_verified = email_verified OR $2,
         avatar_url = COALESCE(avatar_url, $3),
         auth_provider = CASE WHEN auth_provider = 'local' THEN $4 ELSE auth_provider END
     WHERE id = $5`,
    [profile.providerUserId, profile.emailVerified, profile.avatarUrl ?? null, profile.provider, userId],
  );

  await query(
    `INSERT INTO user_oauth_providers (
       user_id, provider, provider_user_id, email, email_verified, display_name, avatar_url
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (provider, provider_user_id)
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       email = EXCLUDED.email,
       email_verified = EXCLUDED.email_verified,
       display_name = COALESCE(EXCLUDED.display_name, user_oauth_providers.display_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, user_oauth_providers.avatar_url),
       updated_at = now()`,
    [
      userId,
      profile.provider,
      profile.providerUserId,
      profile.email,
      profile.emailVerified,
      profile.name ?? null,
      profile.avatarUrl ?? null,
    ],
  );
}

/**
 * Find or create a user from a verified OAuth provider profile.
 * - Existing provider identity returns the linked user.
 * - Existing verified email links Google/Apple to that user.
 * - Otherwise, a new OAuth-only user is created.
 */
export async function oauthLogin(profile: OAuthProfile) {
  if (!profile.emailVerified) {
    throw new Error("OAuth provider did not verify the email address");
  }

  const email = cleanOAuthEmail(profile.email);
  const providerUserId = cleanOAuthString(profile.providerUserId, 255);
  if (!email || !providerUserId) {
    throw new Error("OAuth profile is missing a valid email or provider id");
  }

  const normalizedProfile: OAuthProfile = {
    ...profile,
    email,
    providerUserId,
    name: cleanOAuthString(profile.name, 200) || fallbackName(email),
    avatarUrl: cleanOAuthString(profile.avatarUrl, 1000),
  };

  const byProvider = await query(
    `SELECT u.id, u.email, u.name, u.role
     FROM user_oauth_providers op
     JOIN users u ON u.id = op.user_id
     WHERE op.provider = $1 AND op.provider_user_id = $2`,
    [normalizedProfile.provider, normalizedProfile.providerUserId],
  );
  if (byProvider.rows.length > 0) {
    await linkOAuthProvider(byProvider.rows[0].id, normalizedProfile);
    return byProvider.rows[0];
  }

  const providerColumn = providerUserColumn(normalizedProfile.provider);
  const byLegacyProvider = await query(
    `SELECT id, email, name, role FROM users WHERE ${providerColumn} = $1`,
    [normalizedProfile.providerUserId],
  );
  if (byLegacyProvider.rows.length > 0) {
    await linkOAuthProvider(byLegacyProvider.rows[0].id, normalizedProfile);
    return byLegacyProvider.rows[0];
  }

  const byEmail = await query(
    "SELECT id, email, name, role FROM users WHERE lower(email) = lower($1)",
    [normalizedProfile.email],
  );
  if (byEmail.rows.length > 0) {
    await linkOAuthProvider(byEmail.rows[0].id, normalizedProfile);
    return byEmail.rows[0];
  }

  const providerColumnValue = normalizedProfile.providerUserId;
  const result = await query(
    `INSERT INTO users (
       email, name, password_hash, email_verified, accepted_terms_at,
       auth_provider, avatar_url, ${providerColumn}
     )
     VALUES ($1, $2, NULL, true, NOW(), $3, $4, $5)
     RETURNING id, email, name, role`,
    [
      normalizedProfile.email,
      normalizedProfile.name || fallbackName(normalizedProfile.email),
      normalizedProfile.provider,
      normalizedProfile.avatarUrl ?? null,
      providerColumnValue,
    ],
  );

  await linkOAuthProvider(result.rows[0].id, normalizedProfile);
  return result.rows[0];
}

export async function googleLogin(payload: GoogleTokenPayload) {
  return oauthLogin({
    provider: "google",
    providerUserId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name,
    avatarUrl: payload.picture,
  });
}

export async function appleLogin(payload: AppleTokenPayload) {
  return oauthLogin({
    provider: "apple",
    providerUserId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified,
    name: payload.name,
  });
}

// Validate a reset token and update the user's password. Returns true on success.
export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const result = await query(
    "SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()",
    [token]
  );
  if (result.rows.length === 0) return false;

  const userId = result.rows[0].id;
  const hash = await bcrypt.hash(newPassword, 10);

  await query(
    "UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2",
    [hash, userId]
  );

  return true;
}
