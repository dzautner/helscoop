import { Router } from "express";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";
import { query } from "../db";
import {
  createAuditLog,
  listAuditLogs,
  getAuditLog,
  listAuditLogsByProject,
} from "../audit";

const router = Router();

// All audit routes require authentication
router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /audit/logs — list all audit entries (admin only, paginated)
// ---------------------------------------------------------------------------
router.get("/logs", requirePermission("admin:access"), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const result = await listAuditLogs(limit, offset);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ---------------------------------------------------------------------------
// GET /audit/logs/:id — get a single audit entry (admin only)
// ---------------------------------------------------------------------------
router.get("/logs/:id", requirePermission("admin:access"), async (req, res) => {
  const { id } = req.params;

  // Basic UUID format validation
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).json({ error: "Invalid audit log ID" });
  }

  try {
    const log = await getAuditLog(id);
    if (!log) {
      return res.status(404).json({ error: "Audit log not found" });
    }
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

// ---------------------------------------------------------------------------
// GET /audit/project/:projectId — get audit entries for a project
// (project owner or admin)
// ---------------------------------------------------------------------------
router.get("/project/:projectId", async (req, res) => {
  const { projectId } = req.params;

  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const userId = req.user!.id;
  const userRole = req.user!.role;

  // Check project ownership for non-admins
  if (userRole !== "admin") {
    try {
      const projectResult = await query(
        "SELECT user_id FROM projects WHERE id = $1",
        [projectId]
      );
      if (projectResult.rows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (projectResult.rows[0].user_id !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
    } catch (err) {
      return res.status(500).json({ error: "Failed to verify project access" });
    }
  }

  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const result = await listAuditLogsByProject(projectId, limit, offset);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ---------------------------------------------------------------------------
// POST /audit/log — create an audit entry (internal use)
// Requires admin:access to prevent abuse. Export routes should call
// createAuditLog() directly from the audit module instead.
// ---------------------------------------------------------------------------
router.post("/log", requirePermission("admin:access"), async (req, res) => {
  const { projectId, action, artifactType, artifactHash, sourceSnapshot, metadata } = req.body;

  if (!action || typeof action !== "string") {
    return res.status(400).json({ error: "action is required" });
  }

  try {
    const log = await createAuditLog(
      req.user!.id,
      projectId || null,
      action,
      artifactType || null,
      artifactHash || null,
      sourceSnapshot || {},
      metadata || {}
    );

    if (!log) {
      return res.status(500).json({ error: "Failed to create audit log" });
    }

    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: "Failed to create audit log" });
  }
});

export default router;
