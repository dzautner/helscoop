import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { query } from "./db";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { Role, normalizeRole, ROLES, isValidRole } from "./permissions";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

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
  return jwt.sign(user, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES });
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
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    return { id: payload.id, email: payload.email, role: payload.role };
  } catch (err) {
    // If expired, check grace window
    if (err instanceof jwt.TokenExpiredError) {
      try {
        const payload = jwt.verify(token, JWT_SECRET, {
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
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as AuthUser;
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

interface GoogleTokenPayload {
  sub: string;       // Google unique user ID
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
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

    if (!payload.email || !payload.sub) return null;

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      email_verified: payload.email_verified === "true" || payload.email_verified === true,
      name: (payload.name as string) || (payload.email as string).split("@")[0],
      picture: payload.picture as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Find or create a user from a verified Google token payload.
 * - If a user with the same google_id exists, return them.
 * - If a user with the same email exists (local signup), link the Google account.
 * - Otherwise, create a new user.
 */
export async function googleLogin(payload: GoogleTokenPayload) {
  // 1. Check by google_id first (returning Google user)
  const byGoogleId = await query(
    "SELECT id, email, name, role FROM users WHERE google_id = $1",
    [payload.sub]
  );
  if (byGoogleId.rows.length > 0) {
    return byGoogleId.rows[0];
  }

  // 2. Check by email (existing local user signing in with Google for the first time)
  const byEmail = await query(
    "SELECT id, email, name, role FROM users WHERE email = $1",
    [payload.email]
  );
  if (byEmail.rows.length > 0) {
    // Link Google account to existing user
    await query(
      "UPDATE users SET google_id = $1, email_verified = true WHERE id = $2",
      [payload.sub, byEmail.rows[0].id]
    );
    return byEmail.rows[0];
  }

  // 3. Create new user
  const result = await query(
    `INSERT INTO users (email, name, google_id, auth_provider, email_verified, accepted_terms_at)
     VALUES ($1, $2, $3, 'google', true, NOW())
     RETURNING id, email, name, role`,
    [payload.email, payload.name || payload.email.split("@")[0], payload.sub]
  );
  return result.rows[0];
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
