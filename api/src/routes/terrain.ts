import { Router, Request, Response } from "express";
import { sampleTerrainForFootprint, sampleTerrainGrid } from "../lib/terrain";

const router = Router();

function parseNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBbox(value: unknown): [number, number, number, number] | null {
  if (typeof value !== "string") return null;
  const parts = value.split(",").map((part) => parseNumber(part.trim()));
  if (parts.length !== 4 || parts.some((part) => part === null)) return null;
  const [minX, minY, maxX, maxY] = parts as [number, number, number, number];
  if (minX === maxX || minY === maxY) return null;
  return [
    Math.min(minX, maxX),
    Math.min(minY, maxY),
    Math.max(minX, maxX),
    Math.max(minY, maxY),
  ];
}

function parseCrs(value: unknown): "EPSG:3067" | "EPSG:4326" {
  const normalized = typeof value === "string" ? value.toUpperCase().replace(/^EPSG:/, "") : "3067";
  return normalized === "4326" ? "EPSG:4326" : "EPSG:3067";
}

router.get("/", (req: Request, res: Response) => {
  const bbox = parseBbox(req.query.bbox);
  if (bbox) {
    const crs = parseCrs(req.query.crs);
    const samples = parseNumber(req.query.samples) ?? 7;
    return res.json(sampleTerrainGrid(bbox, crs, samples));
  }

  const lat = parseNumber(req.query.lat);
  const lon = parseNumber(req.query.lon);
  if (lat !== null && lon !== null) {
    const lengthMeters = parseNumber(req.query.length_m) ?? 12;
    const widthMeters = parseNumber(req.query.width_m) ?? 10;
    return res.json(sampleTerrainForFootprint({
      center: { lat, lon },
      lengthMeters,
      widthMeters,
    }));
  }

  return res.status(400).json({
    error: "Provide bbox=minx,miny,maxx,maxy with crs=3067 or lat/lon with optional length_m,width_m",
  });
});

export default router;
