import logger from "./logger";

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
