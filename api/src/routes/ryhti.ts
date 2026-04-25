import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { generateIFC } from "../ifc-generator";
import logger from "../logger";
import {
  RyhtiBomInput,
  RyhtiProjectInput,
  buildRyhtiPermitPackage,
  normalizeBuildingInfo,
  sanitizePermitMetadata,
  submitRyhtiPackage,
  validateRyhtiPackage,
} from "../ryhti-client";

const router = Router();

router.use(requireAuth);

interface ProjectRow extends RyhtiProjectInput {
  permit_metadata?: unknown;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) ? num : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

async function loadProject(projectId: string, userId: string): Promise<ProjectRow | null> {
  const result = await query(
    `SELECT id, name, description, scene_js, building_info, permit_metadata
     FROM projects
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
}

async function loadBom(projectId: string): Promise<RyhtiBomInput[]> {
  const bomResult = await query(
    `SELECT pb.material_id, pb.quantity, pb.unit,
            m.name AS material_name,
            c.display_name AS category_name
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     WHERE pb.project_id = $1
     ORDER BY c.sort_order`,
    [projectId],
  );

  return bomResult.rows.map((row) => ({
    material_id: row.material_id,
    material_name: row.material_name,
    category_name: row.category_name,
    quantity: Number(row.quantity),
    unit: row.unit,
  }));
}

function buildingInfoForIFC(project: ProjectRow) {
  const info = normalizeBuildingInfo(project.building_info);
  const metadata = sanitizePermitMetadata(project.permit_metadata ?? {});
  const floorAreaM2 = numberOrUndefined(metadata.floorAreaM2) ?? numberOrUndefined(info.floorAreaM2);
  const grossAreaM2 = numberOrUndefined(metadata.grossAreaM2) ?? floorAreaM2;

  return {
    address: stringOrUndefined(metadata.address) ?? stringOrUndefined(info.address),
    buildingType: stringOrUndefined(info.buildingType),
    yearBuilt: numberOrUndefined(info.yearBuilt),
    area: floorAreaM2,
    floorAreaM2,
    grossAreaM2,
    floors: numberOrUndefined(metadata.floors) ?? numberOrUndefined(info.floors),
    permanentBuildingIdentifier:
      stringOrUndefined(metadata.permanentBuildingIdentifier) ?? stringOrUndefined(info.permanentBuildingIdentifier),
    propertyIdentifier: stringOrUndefined(metadata.propertyIdentifier) ?? stringOrUndefined(info.propertyIdentifier),
    municipalityNumber: stringOrUndefined(metadata.municipalityNumber) ?? stringOrUndefined(info.municipalityNumber),
    latitude: numberOrUndefined(metadata.latitude) ?? numberOrUndefined(info.latitude),
    longitude: numberOrUndefined(metadata.longitude) ?? numberOrUndefined(info.longitude),
    energyClass: stringOrUndefined(metadata.energyClass) ?? stringOrUndefined(info.energyClass),
  };
}

function buildPackage(project: ProjectRow, bom: RyhtiBomInput[]) {
  const ifcContent = generateIFC({
    project: {
      id: project.id,
      name: project.name,
      description: project.description ?? undefined,
      scene_js: project.scene_js ?? undefined,
    },
    bom: bom.map((item) => ({
      material_id: item.material_id,
      material_name: item.material_name ?? item.material_id,
      quantity: item.quantity,
      unit: item.unit,
      category_name: item.category_name ?? undefined,
    })),
    buildingInfo: buildingInfoForIFC(project),
    permitMetadata: sanitizePermitMetadata(project.permit_metadata ?? {}),
  });

  return buildRyhtiPermitPackage({
    project,
    bom,
    permitMetadata: project.permit_metadata,
    ifcContent,
  });
}

async function latestSubmission(projectId: string) {
  const result = await query(
    `SELECT id, project_id, mode, status, permit_identifier, ryhti_tracking_id,
            validation, response, error, created_at, updated_at
     FROM ryhti_submissions
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId],
  );
  return result.rows[0] ?? null;
}

async function packageResponse(project: ProjectRow) {
  const bom = await loadBom(project.id);
  const pkg = buildPackage(project, bom);
  const validation = validateRyhtiPackage(pkg);
  return {
    package: pkg,
    validation,
    permitMetadata: sanitizePermitMetadata(project.permit_metadata ?? {}),
    latestSubmission: await latestSubmission(project.id),
  };
}

router.get("/projects/:id/package", async (req, res) => {
  try {
    const project = await loadProject(req.params.id, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(await packageResponse(project));
  } catch (err) {
    logger.error({ err, projectId: req.params.id }, "Ryhti package generation failed");
    res.status(500).json({ error: "Failed to generate Ryhti package" });
  }
});

router.put("/projects/:id/metadata", async (req, res) => {
  try {
    const project = await loadProject(req.params.id, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const current = sanitizePermitMetadata(project.permit_metadata ?? {});
    const incoming = sanitizePermitMetadata(parseJsonObject(req.body).metadata ?? req.body);
    const merged = sanitizePermitMetadata({ ...current, ...incoming });

    const result = await query(
      `UPDATE projects
       SET permit_metadata = $1::jsonb, updated_at = now()
       WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
       RETURNING id, name, description, scene_js, building_info, permit_metadata`,
      [JSON.stringify(merged), req.params.id, req.user!.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Project not found" });

    res.json(await packageResponse(result.rows[0]));
  } catch (err) {
    logger.error({ err, projectId: req.params.id }, "Ryhti metadata update failed");
    res.status(500).json({ error: "Failed to update Ryhti metadata" });
  }
});

router.post("/projects/:id/validate", async (req, res) => {
  try {
    const project = await loadProject(req.params.id, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const bom = await loadBom(project.id);
    const pkg = buildPackage(project, bom);
    const validation = validateRyhtiPackage(pkg);
    res.status(validation.ready ? 200 : 422).json({ package: pkg, validation });
  } catch (err) {
    logger.error({ err, projectId: req.params.id }, "Ryhti validation failed");
    res.status(500).json({ error: "Failed to validate Ryhti package" });
  }
});

router.post("/projects/:id/submit", async (req, res) => {
  try {
    const project = await loadProject(req.params.id, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const bom = await loadBom(project.id);
    const pkg = buildPackage(project, bom);
    const validation = validateRyhtiPackage(pkg);
    if (!validation.ready) {
      return res.status(422).json({
        error: "Ryhti package is not ready",
        package: pkg,
        validation,
      });
    }

    const result = await submitRyhtiPackage(pkg, validation);
    const inserted = await query(
      `INSERT INTO ryhti_submissions (
         project_id,
         user_id,
         mode,
         status,
         permit_identifier,
         ryhti_tracking_id,
         validation,
         payload,
         response,
         error
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
       RETURNING id, project_id, mode, status, permit_identifier, ryhti_tracking_id,
                 validation, payload, response, error, created_at, updated_at`,
      [
        project.id,
        req.user!.id,
        result.mode,
        result.status,
        pkg.permanentPermitIdentifier,
        result.trackingId,
        JSON.stringify(validation),
        JSON.stringify(pkg),
        JSON.stringify(result.remoteResponse ?? null),
        result.error ?? null,
      ],
    );

    res.status(result.status === "rejected" || result.status === "failed" ? 502 : 201).json({
      submission: inserted.rows[0],
      result,
    });
  } catch (err) {
    logger.error({ err, projectId: req.params.id }, "Ryhti submission failed");
    res.status(500).json({ error: "Failed to submit Ryhti package" });
  }
});

router.get("/projects/:id/status", async (req, res) => {
  try {
    const project = await loadProject(req.params.id, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ latestSubmission: await latestSubmission(project.id) });
  } catch (err) {
    logger.error({ err, projectId: req.params.id }, "Ryhti status lookup failed");
    res.status(500).json({ error: "Failed to load Ryhti status" });
  }
});

export default router;
