import crypto from "crypto";
import logger from "./logger";
import { query } from "./db";

export interface AuditEventDetails {
  targetId?: string;
  ip?: string;
  [key: string]: unknown;
}

/**
 * Log a structured audit event. All audit events are tagged with `audit: true`
 * so they can be filtered independently from regular application logs.
 *
 * Usage:
 *   logAuditEvent(req.user!.id, "project.delete", { targetId: projectId, ip: req.ip });
 */
export function logAuditEvent(
  userId: string,
  action: string,
  details: AuditEventDetails = {}
): void {
  logger.info({
    audit: true,
    userId,
    action,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

// ---------------------------------------------------------------------------
// Compliance audit trail — immutable database records for export artifacts
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  user_id: string;
  project_id: string | null;
  action: string;
  artifact_type: string | null;
  artifact_hash: string | null;
  source_snapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Compute SHA-256 hash of an artifact (Buffer or string).
 */
export function hashArtifact(content: Buffer | string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Record a compliance audit event in the database.
 *
 * This is the primary function called by export routes to create an immutable
 * record of what was generated, from what inputs, and by whom.
 *
 * Returns the created audit log entry, or null if the table doesn't exist yet.
 */
export async function createAuditLog(
  userId: string,
  projectId: string | null,
  action: string,
  artifactType: string | null,
  artifactHash: string | null,
  sourceSnapshot: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {}
): Promise<AuditLogEntry | null> {
  try {
    const result = await query(
      `INSERT INTO audit_logs (user_id, project_id, action, artifact_type, artifact_hash, source_snapshot, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        projectId,
        action,
        artifactType,
        artifactHash,
        JSON.stringify(sourceSnapshot),
        JSON.stringify(metadata),
      ]
    );
    return result.rows[0] as AuditLogEntry;
  } catch (err) {
    // Log but don't fail the calling operation — audit is best-effort
    // until the migration has been applied.
    logger.warn(
      { err, userId, action },
      "Failed to write audit log (table may not exist yet)"
    );
    return null;
  }
}

/**
 * List audit log entries with pagination. Admin-only in practice.
 */
export async function listAuditLogs(
  limit = 50,
  offset = 0
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const [logsResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM audit_logs`),
  ]);
  return {
    logs: logsResult.rows as AuditLogEntry[],
    total: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Get a single audit log entry by ID.
 */
export async function getAuditLog(
  id: string
): Promise<AuditLogEntry | null> {
  const result = await query(`SELECT * FROM audit_logs WHERE id = $1`, [id]);
  return (result.rows[0] as AuditLogEntry) ?? null;
}

/**
 * List audit log entries for a specific project.
 */
export async function listAuditLogsByProject(
  projectId: string,
  limit = 50,
  offset = 0
): Promise<{ logs: AuditLogEntry[]; total: number }> {
  const [logsResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM audit_logs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [projectId, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM audit_logs WHERE project_id = $1`, [
      projectId,
    ]),
  ]);
  return {
    logs: logsResult.rows as AuditLogEntry[],
    total: parseInt(countResult.rows[0].total, 10),
  };
}
