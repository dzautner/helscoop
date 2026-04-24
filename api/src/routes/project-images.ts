import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { query } from "../db";
import { requireAuth } from "../auth";
import { logAuditEvent } from "../audit";
import {
  deleteProjectImageObjects,
  readProjectImageObject,
  writeProjectImageObject,
  type ProjectImageVariant,
} from "../project-image-storage";

const router = Router();

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES_PER_PROJECT = 10;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

interface ProjectImageRow {
  id: string;
  project_id: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  uploaded_at: string;
  storage_key: string;
  thumbnail_200_key: string;
  thumbnail_800_key: string;
}

function publicImage(row: ProjectImageRow, projectId: string) {
  return {
    id: row.id,
    project_id: row.project_id,
    original_filename: row.original_filename,
    content_type: row.content_type,
    byte_size: Number(row.byte_size || 0),
    width: row.width,
    height: row.height,
    uploaded_at: row.uploaded_at,
    urls: {
      original: `/projects/${projectId}/images/${row.id}/assets/original`,
      thumb_200: `/projects/${projectId}/images/${row.id}/assets/thumb200`,
      thumb_800: `/projects/${projectId}/images/${row.id}/assets/thumb800`,
    },
  };
}

function isAllowedImage(file: Express.Multer.File): boolean {
  if (ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname);
}

async function requireOwnedProject(projectId: string, userId: string): Promise<boolean> {
  const result = await query(
    "SELECT id FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [projectId, userId],
  );
  return result.rows.length > 0;
}

async function getOwnedImage(projectId: string, imageId: string, userId: string): Promise<ProjectImageRow | null> {
  const result = await query(
    `SELECT pi.*
     FROM project_images pi
     JOIN projects p ON p.id = pi.project_id
     WHERE pi.id=$1 AND pi.project_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL`,
    [imageId, projectId, userId],
  );
  return (result.rows[0] as ProjectImageRow | undefined) ?? null;
}

async function processImage(file: Express.Multer.File) {
  let image = sharp(file.buffer, { failOn: "none" }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? null;
  const height = metadata.height ?? null;

  const original = await image
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  const thumb200 = await sharp(file.buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 200, height: 200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const thumb800 = await sharp(file.buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();

  return { original, thumb200, thumb800, width, height };
}

router.use(requireAuth);

router.get("/:projectId/images", async (req, res) => {
  if (!(await requireOwnedProject(req.params.projectId, req.user!.id))) {
    return res.status(404).json({ error: "Project not found" });
  }

  const result = await query(
    `SELECT id, project_id, original_filename, content_type, byte_size, width, height, uploaded_at,
            storage_key, thumbnail_200_key, thumbnail_800_key
     FROM project_images
     WHERE project_id=$1 AND user_id=$2
     ORDER BY uploaded_at DESC`,
    [req.params.projectId, req.user!.id],
  );

  res.json({ images: (result.rows as ProjectImageRow[]).map((row) => publicImage(row, req.params.projectId)) });
});

router.post("/:projectId/images", (req, res) => {
  upload.single("image")(req, res, async (err: unknown) => {
    if (err) {
      const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
        ? "Image must be 10MB or smaller"
        : "Invalid image upload";
      return res.status(400).json({ error: message });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: "image file is required" });
    if (!isAllowedImage(file)) {
      return res.status(415).json({ error: "Accepted image formats: JPEG, PNG, HEIC, HEIF, WebP" });
    }

    if (!(await requireOwnedProject(req.params.projectId, req.user!.id))) {
      return res.status(404).json({ error: "Project not found" });
    }

    const countResult = await query(
      "SELECT COUNT(*)::int AS count FROM project_images WHERE project_id=$1 AND user_id=$2",
      [req.params.projectId, req.user!.id],
    );
    const imageCount = Number(countResult.rows[0]?.count || 0);
    if (imageCount >= MAX_IMAGES_PER_PROJECT) {
      return res.status(400).json({ error: "A project can have at most 10 reference photos" });
    }

    const imageId = randomUUID();
    const storagePrefix = `${req.params.projectId}/${imageId}`;
    const storageKey = `${storagePrefix}/original.jpg`;
    const thumb200Key = `${storagePrefix}/thumb_200.jpg`;
    const thumb800Key = `${storagePrefix}/thumb_800.jpg`;

    let processed: Awaited<ReturnType<typeof processImage>>;
    try {
      processed = await processImage(file);
    } catch (processErr) {
      console.error("Project image processing failed:", processErr);
      return res.status(415).json({ error: "Could not process this image format" });
    }

    const storageKeys = [storageKey, thumb200Key, thumb800Key];
    let insert;
    try {
      await writeProjectImageObject(storageKey, processed.original);
      await writeProjectImageObject(thumb200Key, processed.thumb200);
      await writeProjectImageObject(thumb800Key, processed.thumb800);

      insert = await query(
        `INSERT INTO project_images (
           id, project_id, user_id, storage_key, thumbnail_200_key, thumbnail_800_key,
           original_filename, content_type, byte_size, width, height
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, project_id, original_filename, content_type, byte_size, width, height, uploaded_at,
                   storage_key, thumbnail_200_key, thumbnail_800_key`,
        [
          imageId,
          req.params.projectId,
          req.user!.id,
          storageKey,
          thumb200Key,
          thumb800Key,
          file.originalname.slice(0, 240),
          "image/jpeg",
          processed.original.length,
          processed.width,
          processed.height,
        ],
      );
    } catch (storeErr) {
      await deleteProjectImageObjects(storageKeys).catch((cleanupErr) => {
        console.error("Project image cleanup failed:", cleanupErr);
      });
      console.error("Project image storage failed:", storeErr);
      return res.status(500).json({ error: "Could not store reference photo" });
    }

    logAuditEvent(req.user!.id, "project_image.uploaded", {
      targetId: req.params.projectId,
      imageId,
      originalFilename: file.originalname,
      byteSize: processed.original.length,
      ip: req.ip,
    });

    res.status(201).json({ image: publicImage(insert.rows[0] as ProjectImageRow, req.params.projectId) });
  });
});

router.get("/:projectId/images/:imageId/assets/:variant", async (req, res) => {
  const variant = req.params.variant as ProjectImageVariant;
  if (!["original", "thumb200", "thumb800"].includes(variant)) {
    return res.status(400).json({ error: "Invalid image variant" });
  }

  const image = await getOwnedImage(req.params.projectId, req.params.imageId, req.user!.id);
  if (!image) return res.status(404).json({ error: "Image not found" });

  const key = variant === "original"
    ? image.storage_key
    : variant === "thumb200"
      ? image.thumbnail_200_key
      : image.thumbnail_800_key;
  try {
    const bytes = await readProjectImageObject(key);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(bytes);
  } catch {
    res.status(404).json({ error: "Image asset not found" });
  }
});

router.delete("/:projectId/images/:imageId", async (req, res) => {
  const image = await getOwnedImage(req.params.projectId, req.params.imageId, req.user!.id);
  if (!image) return res.status(404).json({ error: "Image not found" });

  await query(
    "DELETE FROM project_images WHERE id=$1 AND project_id=$2 AND user_id=$3",
    [req.params.imageId, req.params.projectId, req.user!.id],
  );
  await deleteProjectImageObjects([image.storage_key, image.thumbnail_200_key, image.thumbnail_800_key]);

  logAuditEvent(req.user!.id, "project_image.deleted", {
    targetId: req.params.projectId,
    imageId: req.params.imageId,
    ip: req.ip,
  });

  res.json({ ok: true });
});

export default router;
