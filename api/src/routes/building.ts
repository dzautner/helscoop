import { Router, Request, Response } from "express";
import { readFileSync } from "fs";
import { join } from "path";

const router = Router();

// Load demo building data at startup
interface BuildingInfo {
  type: string;
  year_built: number;
  material: string;
  floors: number;
  area_m2: number;
  heating: string;
  roof_type?: string;
  roof_material?: string;
  units?: number;
}

interface BomItem {
  material_id: string;
  quantity: number;
  unit: string;
}

interface BuildingData {
  address: string;
  coordinates: { lat: number; lon: number };
  building_info: BuildingInfo;
  scene_js: string;
  bom_suggestion: BomItem[];
}

function loadDemoData(): BuildingData[] {
  const dataDir = join(__dirname, "..", "..", "..", "data", "demo");
  const files = ["ribbingintie-109.json", "uunimaentie-1.json"];
  const buildings: BuildingData[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(dataDir, file), "utf-8");
      buildings.push(JSON.parse(raw));
    } catch (e) {
      console.warn(`Could not load demo data file ${file}:`, e);
    }
  }

  return buildings;
}

const demoBuildings = loadDemoData();

/**
 * Normalize an address string for fuzzy matching:
 * lowercase, collapse whitespace, strip commas and dots.
 */
function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/[,.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check whether a query address matches a demo address.
 * Matches if the normalized query contains the street name and number.
 */
function matchesDemoAddress(query: string, demoAddress: string): boolean {
  const normQ = normalizeAddress(query);
  const normD = normalizeAddress(demoAddress);

  // Extract the street name and number (first part before postal code)
  const streetPart = normD.split(/\d{5}/)[0].trim();
  if (!streetPart) return false;

  // Try exact substring match on the street portion
  if (normQ.includes(streetPart)) return true;

  // Also try matching just the street name (without house number suffix)
  const words = streetPart.split(" ");
  const streetName = words[0];
  if (streetName && streetName.length > 4 && normQ.includes(streetName)) {
    return true;
  }

  return false;
}

/**
 * Generate a generic building based on postal code area characteristics.
 */
function generateGenericBuilding(address: string): BuildingData {
  // Try to extract postal code
  const postalMatch = address.match(/\b(\d{5})\b/);
  const postalCode = postalMatch ? postalMatch[1] : "00100";
  const prefix = postalCode.substring(0, 2);

  // Helsinki downtown (001-002): likely apartment
  // Helsinki suburbs (003-009): likely detached/row house
  // Espoo (02): mixed
  // Vantaa (01): mixed suburban
  let buildingType = "omakotitalo";
  let floors = 2;
  let area = 120;
  let yearBuilt = 1990;
  let material = "puu";

  if (prefix === "00" && parseInt(postalCode) < 300) {
    buildingType = "kerrostalo";
    floors = 5;
    area = 65;
    yearBuilt = 1960;
    material = "betoni";
  } else if (prefix === "00" && parseInt(postalCode) >= 300) {
    buildingType = "omakotitalo";
    floors = 2;
    area = 130;
    yearBuilt = 1985;
    material = "puu";
  } else if (prefix === "02") {
    buildingType = "omakotitalo";
    floors = 2;
    area = 145;
    yearBuilt = 1995;
    material = "puu";
  }

  return {
    address,
    coordinates: { lat: 60.17, lon: 24.94 },
    building_info: {
      type: buildingType,
      year_built: yearBuilt,
      material: material,
      floors: floors,
      area_m2: area,
      heating: "kaukolampo",
      roof_type: "harjakatto",
      roof_material: "pelti",
    },
    scene_js: generateGenericScene(buildingType, floors, area),
    bom_suggestion: [
      { material_id: "pine_48x148_c24", quantity: Math.round(area * 0.6), unit: "jm" },
      { material_id: "pine_48x98_c24", quantity: Math.round(area * 0.4), unit: "jm" },
      { material_id: "osb_11mm", quantity: Math.round(area * 0.35), unit: "m2" },
      { material_id: "mineral_wool_150", quantity: Math.round(area * 0.7), unit: "m2" },
      { material_id: "concrete_c25", quantity: Math.round(area * 0.06 * 10) / 10, unit: "m3" },
      { material_id: "metal_roof_ruukki", quantity: Math.round(area * 0.55), unit: "m2" },
    ],
  };
}

function generateGenericScene(
  type: string,
  floors: number,
  area: number
): string {
  const floorHeight = 2.7;
  // Approximate footprint from area
  const ratio = 1.2; // length/width ratio
  const width = Math.sqrt(area / floors / ratio);
  const length = width * ratio;
  const w = Math.round(width * 10) / 10;
  const l = Math.round(length * 10) / 10;

  let lines = `// Generic ${type}, ${floors} floors, ~${area}m2\n`;
  lines += `const foundation = translate(cube({size: [${l}, 0.3, ${w}], center: true}), [0, 0.15, 0]);\n`;

  for (let f = 0; f < floors; f++) {
    const baseY = 0.3 + f * (floorHeight + 0.25);
    const prefix = f === 0 ? "gf" : `f${f}`;
    lines += `const ${prefix}_front = translate(cube({size: [${l}, ${floorHeight}, 0.2], center: true}), [0, ${(baseY + floorHeight / 2).toFixed(2)}, ${(-w / 2 - 0.1).toFixed(2)}]);\n`;
    lines += `const ${prefix}_back = translate(cube({size: [${l}, ${floorHeight}, 0.2], center: true}), [0, ${(baseY + floorHeight / 2).toFixed(2)}, ${(w / 2 + 0.1).toFixed(2)}]);\n`;
    lines += `const ${prefix}_left = translate(cube({size: [0.2, ${floorHeight}, ${w}], center: true}), [${(-l / 2 - 0.1).toFixed(2)}, ${(baseY + floorHeight / 2).toFixed(2)}, 0]);\n`;
    lines += `const ${prefix}_right = translate(cube({size: [0.2, ${floorHeight}, ${w}], center: true}), [${(l / 2 + 0.1).toFixed(2)}, ${(baseY + floorHeight / 2).toFixed(2)}, 0]);\n`;
    if (f < floors - 1) {
      lines += `const slab${f} = translate(cube({size: [${l}, 0.25, ${w}], center: true}), [0, ${(baseY + floorHeight + 0.125).toFixed(2)}, 0]);\n`;
    }
  }

  const totalH = 0.3 + floors * floorHeight + (floors - 1) * 0.25;
  const roofPeakH = totalH + w * 0.29; // ~30deg pitch
  lines += `const roof_l = translate(rotate(cube({size: [${l + 0.6}, 0.08, ${(w / 2 + 0.6).toFixed(1)}], center: true}), [0.52, 0, 0]), [0, ${((totalH + roofPeakH) / 2).toFixed(2)}, ${(-w / 4).toFixed(2)}]);\n`;
  lines += `const roof_r = translate(rotate(cube({size: [${l + 0.6}, 0.08, ${(w / 2 + 0.6).toFixed(1)}], center: true}), [-0.52, 0, 0]), [0, ${((totalH + roofPeakH) / 2).toFixed(2)}, ${(w / 4).toFixed(2)}]);\n`;

  // Collect all parts
  const parts = ["foundation"];
  for (let f = 0; f < floors; f++) {
    const prefix = f === 0 ? "gf" : `f${f}`;
    parts.push(`${prefix}_front`, `${prefix}_back`, `${prefix}_left`, `${prefix}_right`);
    if (f < floors - 1) parts.push(`slab${f}`);
  }
  parts.push("roof_l", "roof_r");

  lines += `\nscene = union(${parts.join(", ")});`;

  return lines;
}

// GET /building?address=<address>
router.get("/", (req: Request, res: Response) => {
  const address = (req.query.address as string) || "";
  if (!address || address.length < 3) {
    return res.status(400).json({ error: "Address query parameter required (min 3 characters)" });
  }

  // Try to match against demo buildings
  for (const building of demoBuildings) {
    if (matchesDemoAddress(address, building.address)) {
      return res.json({
        ...building,
        confidence: "verified" as const,
        data_sources: ["Helsinki CityGML", "K-Rauta hinnat 04/2026"],
      });
    }
  }

  // Fallback: generate generic building
  const generic = generateGenericBuilding(address);
  return res.json({
    ...generic,
    confidence: "estimated" as const,
    data_sources: ["Yleinen kerrostalomalli"],
  });
});

export default router;
