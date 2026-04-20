import { Router, Request, Response } from "express";
import logger from "../logger";

const router = Router();

// ---------------------------------------------------------------------------
// DVV Building Registry lookup — estimation service
//
// Infers building metadata from address, year, and location characteristics.
// For MVP this uses heuristic rules based on Finnish construction history:
//   - Year built -> typical construction materials of that era
//   - Location   -> typical heating type (southern cities = kaukolampo, rural = oljy/puu)
//   - Area       -> floor count estimate
// ---------------------------------------------------------------------------

export interface BuildingRegistryResult {
  type: string;
  year_built: number;
  area_m2: number;
  floors: number;
  material: string;
  heating: string;
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Known buildings — demo data for verified addresses
// ---------------------------------------------------------------------------
interface KnownBuilding {
  address: string;
  aliases: string[];
  data: BuildingRegistryResult;
}

const KNOWN_BUILDINGS: KnownBuilding[] = [
  {
    address: "Mannerheimintie 1, Helsinki",
    aliases: ["mannerheimintie 1", "mannerheimintie 1 helsinki", "mannerheimintie 1 00100"],
    data: {
      type: "kerrostalo",
      year_built: 1920,
      area_m2: 4200,
      floors: 6,
      material: "kivi",
      heating: "kaukolampo",
      confidence: "high",
    },
  },
  {
    address: "Hameenkatu 1, Tampere",
    aliases: ["hameenkatu 1", "hameenkatu 1 tampere", "hameenkatu 1 33100", "hameenkatu 1 33100 tampere"],
    data: {
      type: "kerrostalo",
      year_built: 1930,
      area_m2: 3500,
      floors: 5,
      material: "tiili",
      heating: "kaukolampo",
      confidence: "high",
    },
  },
];

// ---------------------------------------------------------------------------
// Finnish construction era heuristics
// ---------------------------------------------------------------------------

/**
 * Infer typical construction material from year built.
 * Based on Finnish building history:
 *   - Pre-1920: hirsi (log) or kivi (stone)
 *   - 1920-1950: tiili (brick)
 *   - 1950-1990: betoni (concrete), elementtirakentaminen
 *   - 1990+: puu (wood), CLT, modern timber
 */
export function inferMaterial(year: number): string {
  if (year < 1920) return "hirsi";
  if (year < 1950) return "tiili";
  if (year < 1990) return "betoni";
  return "puu";
}

/**
 * Infer typical heating type from city/location.
 * Southern Finnish cities have extensive kaukolampo (district heating) networks.
 * Rural areas historically use oil (oljy) or wood (puu).
 */
export function inferHeating(city: string): string {
  const districtHeatingCities = [
    "helsinki", "espoo", "vantaa", "tampere", "turku", "oulu",
    "jyvaskyla", "jyväskylä", "lahti", "kuopio", "pori",
    "joensuu", "lappeenranta", "rovaniemi", "vaasa",
    "kotka", "hameenlinna", "hämeenlinna", "kouvola",
    "mikkeli", "seinajoki", "seinäjoki", "rauma",
  ];

  const normalized = city.toLowerCase().trim();
  if (districtHeatingCities.some((c) => normalized.includes(c))) {
    return "kaukolampo";
  }

  return "oljy";
}

/**
 * Infer floor count from area and building type.
 */
export function inferFloors(area: number, type: string): number {
  if (type === "kerrostalo") {
    if (area > 3000) return 6;
    if (area > 1500) return 4;
    return 3;
  }
  if (type === "rivitalo") return 2;
  if (type === "paritalo") return 2;
  // omakotitalo
  if (area > 200) return 2;
  return 1;
}

/**
 * Infer building type from area.
 */
export function inferBuildingType(area: number): string {
  if (area > 1000) return "kerrostalo";
  if (area > 250) return "rivitalo";
  return "omakotitalo";
}

/**
 * Extract a city name from an address string.
 * Tries common Finnish address patterns:
 *   "Street 1, City"
 *   "Street 1, 00100 City"
 *   "Street 1 City"
 */
export function extractCity(address: string): string {
  // "Street N, NNNNN City" or "Street N, City"
  const commaMatch = address.match(/,\s*(?:\d{5}\s+)?(.+)/i);
  if (commaMatch) return commaMatch[1].trim();

  // "Street N NNNNN City"
  const postalMatch = address.match(/\d{5}\s+(.+)/);
  if (postalMatch) return postalMatch[1].trim();

  return "";
}

/**
 * Normalize address for matching: lowercase, strip diacritics, collapse whitespace.
 */
export function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/[äå]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[,.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// GET /building-registry/lookup?address=<address>[&year=NNNN][&area=NNN]
// ---------------------------------------------------------------------------
router.get("/lookup", (req: Request, res: Response) => {
  const address = (req.query.address as string) || "";

  if (!address || address.trim().length < 3) {
    return res.status(400).json({ error: "Address query parameter required (min 3 characters)" });
  }

  if (address.length > 200) {
    return res.status(400).json({ error: "Address must be 200 characters or fewer" });
  }

  const normalized = normalizeAddress(address);

  // Check known buildings first
  for (const known of KNOWN_BUILDINGS) {
    const normalizedAliases = known.aliases.map(normalizeAddress);
    if (normalizedAliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))) {
      logger.info({ address, match: known.address }, "Building registry: known building match");
      return res.json(known.data);
    }
  }

  // Estimation service: infer from address + optional hints
  const yearStr = req.query.year as string | undefined;
  const areaStr = req.query.area as string | undefined;

  const yearHint = yearStr ? parseInt(yearStr, 10) : null;
  const areaHint = areaStr ? parseFloat(areaStr) : null;

  const validYear = yearHint && !isNaN(yearHint) && yearHint >= 1700 && yearHint <= 2030 ? yearHint : null;
  const validArea = areaHint && !isNaN(areaHint) && areaHint > 0 && areaHint <= 100000 ? areaHint : null;

  const city = extractCity(address);

  // Default year based on city (Helsinki center older, suburbs newer)
  const yearBuilt = validYear || (city.toLowerCase().includes("helsinki") ? 1965 : 1985);
  const areaMeter = validArea || 120;
  const buildingType = inferBuildingType(areaMeter);
  const material = inferMaterial(yearBuilt);
  const heating = inferHeating(city);
  const floors = inferFloors(areaMeter, buildingType);

  // Confidence is low when fully estimating, medium when user provides hints
  const confidence: "high" | "medium" | "low" = validYear && validArea ? "medium" : "low";

  const result: BuildingRegistryResult = {
    type: buildingType,
    year_built: yearBuilt,
    area_m2: areaMeter,
    floors,
    material,
    heating,
    confidence,
  };

  logger.info({ address, city, confidence }, "Building registry: estimated building metadata");

  return res.json(result);
});

export default router;
