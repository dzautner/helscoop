import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { query } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
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
  const result = await query(
    "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, role",
    [email, name, hash]
  );
  return result.rows[0];
}

// Generate a reset token for the given email. Returns the token if user exists, null otherwise.
export async function forgotPassword(email: string): Promise<string | null> {
  const result = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (result.rows.length === 0) return null;

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  await query(
    "UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3",
    [token, expires.toISOString(), email]
  );

  return token;
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
