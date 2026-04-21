import { Router, Request, Response } from "express";
import { readFileSync } from "fs";
import { join } from "path";

const router = Router();

// ---------------------------------------------------------------------------
// In-memory LRU cache for building lookup results
// Max 1000 entries, 5-minute TTL per entry
// ---------------------------------------------------------------------------
const CACHE_MAX_SIZE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const buildingCache = new Map<string, CacheEntry>();

function getCached(key: string): unknown | null {
  const entry = buildingCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    buildingCache.delete(key);
    return null;
  }
  // Move to end for LRU ordering (Map preserves insertion order)
  buildingCache.delete(key);
  buildingCache.set(key, entry);
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  // Evict oldest entries if at capacity
  if (buildingCache.size >= CACHE_MAX_SIZE) {
    const oldest = buildingCache.keys().next().value;
    if (oldest !== undefined) {
      buildingCache.delete(oldest);
    }
  }
  buildingCache.set(key, { data, timestamp: Date.now() });
}

// Maximum allowed address length to prevent abuse
const MAX_ADDRESS_LENGTH = 200;

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
  climate_zone?: string;
  heating_degree_days?: number;
  data_source_error?: string;
}

interface ExternalBuildingResult extends BuildingData {
  confidence: "verified" | "estimated";
  data_sources: string[];
}

interface RegistryLookupOutcome {
  building?: ExternalBuildingResult;
  partial?: {
    address: string;
    coordinates: { lat: number; lon: number };
    data_sources: string[];
  };
  error?: string;
}

interface ParsedAddress {
  streetName: string;
  houseNumber: number;
  postalCode?: string;
  city?: string;
}

interface RegistryFeature {
  properties?: Record<string, unknown>;
  geometry?: {
    coordinates?: unknown;
  };
}

interface RegistryFeatureCollection {
  features?: RegistryFeature[];
}

interface AddressLookup {
  address: string;
  coordinates: { lat: number; lon: number };
  city?: string;
  data_sources: string[];
}

interface ClimateLookup {
  climate_zone?: string;
  heating_degree_days?: number;
  source?: string;
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
      // osb_9mm: OSB 9mm sheathing sheets (2400×1200 mm ≈ 2.88 m²/sheet; area*0.35 m² → sheets)
      { material_id: "osb_9mm", quantity: Math.ceil(area * 0.35 / 2.88), unit: "sheet" },
      // insulation_100mm: Mineraalivilla 100mm, priced per sqm
      { material_id: "insulation_100mm", quantity: Math.round(area * 0.7), unit: "sqm" },
      // concrete_block: Betoniharkko 200mm, priced per kpl (~13 blocks/m³)
      { material_id: "concrete_block", quantity: Math.round(area * 0.06 * 13), unit: "kpl" },
      // galvanized_roofing: Peltikatto Sinkitty (Ruukki), priced per sqm
      { material_id: "galvanized_roofing", quantity: Math.round(area * 0.55), unit: "sqm" },
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
  const wallThickness = 0.2;

  // Colors
  const foundationColor = "[0.55, 0.55, 0.52]";
  const wallFrontColor = "[0.76, 0.60, 0.42]";
  const wallBackColor = "[0.72, 0.56, 0.38]";
  const wallLeftColor = "[0.68, 0.53, 0.35]";
  const wallRightColor = "[0.70, 0.55, 0.37]";
  const slabColor = "[0.60, 0.60, 0.58]";
  const roofColor = "[0.25, 0.22, 0.20]";

  let lines = `// Generic ${type}, ${floors} floors, ~${area}m2\n\n`;

  // Foundation slab
  lines += `const foundation = translate(box(${l}, 0.3, ${w}), 0, 0.15, 0);\n`;
  lines += `scene.add(foundation, {material: "concrete", color: ${foundationColor}});\n\n`;

  for (let f = 0; f < floors; f++) {
    const baseY = 0.3 + f * (floorHeight + 0.25);
    const wallCenterY = (baseY + floorHeight / 2).toFixed(2);
    const prefix = f === 0 ? "gf" : `f${f}`;
    const floorLabel = f === 0 ? "Ground floor" : `Floor ${f + 1}`;

    lines += `// ${floorLabel} walls\n`;
    lines += `const ${prefix}_front = translate(box(${l}, ${floorHeight}, ${wallThickness}), 0, ${wallCenterY}, ${(-w / 2).toFixed(2)});\n`;
    lines += `scene.add(${prefix}_front, {material: "wood", color: ${wallFrontColor}});\n`;

    lines += `const ${prefix}_back = translate(box(${l}, ${floorHeight}, ${wallThickness}), 0, ${wallCenterY}, ${(w / 2).toFixed(2)});\n`;
    lines += `scene.add(${prefix}_back, {material: "wood", color: ${wallBackColor}});\n`;

    lines += `const ${prefix}_left = translate(box(${wallThickness}, ${floorHeight}, ${w}), ${(-l / 2).toFixed(2)}, ${wallCenterY}, 0);\n`;
    lines += `scene.add(${prefix}_left, {material: "wood", color: ${wallLeftColor}});\n`;

    lines += `const ${prefix}_right = translate(box(${wallThickness}, ${floorHeight}, ${w}), ${(l / 2).toFixed(2)}, ${wallCenterY}, 0);\n`;
    lines += `scene.add(${prefix}_right, {material: "wood", color: ${wallRightColor}});\n`;

    // Floor slab between stories
    if (f < floors - 1) {
      const slabY = (baseY + floorHeight + 0.125).toFixed(2);
      lines += `\n// Slab above ${floorLabel.toLowerCase()}\n`;
      lines += `const slab${f} = translate(box(${l}, 0.25, ${w}), 0, ${slabY}, 0);\n`;
      lines += `scene.add(slab${f}, {material: "concrete", color: ${slabColor}});\n`;
    }

    lines += `\n`;
  }

  // Pitched roof
  const totalH = 0.3 + floors * floorHeight + (floors - 1) * 0.25;
  const roofPeakH = totalH + w * 0.29; // ~30deg pitch
  const roofCenterY = ((totalH + roofPeakH) / 2).toFixed(2);
  const roofPanelDepth = (w / 2 + 0.6).toFixed(1);
  const roofPanelLength = (l + 0.6).toFixed(1);

  lines += `// Pitched roof\n`;
  lines += `const roof_left = translate(rotate(box(${roofPanelLength}, 0.08, ${roofPanelDepth}), 0.52, 0, 0), 0, ${roofCenterY}, ${(-w / 4).toFixed(2)});\n`;
  lines += `scene.add(roof_left, {material: "metal", color: ${roofColor}});\n`;

  lines += `const roof_right = translate(rotate(box(${roofPanelLength}, 0.08, ${roofPanelDepth}), -0.52, 0, 0), 0, ${roofCenterY}, ${(w / 4).toFixed(2)});\n`;
  lines += `scene.add(roof_right, {material: "metal", color: ${roofColor}});\n`;

  return lines;
}

const DEFAULT_RYHTI_API_URL =
  "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1";
const DEFAULT_FMI_WFS_URL = "https://opendata.fmi.fi/wfs";

function externalRegistryEnabled(): boolean {
  return process.env.BUILDING_REGISTRY_ENABLED === "true" || Boolean(process.env.DVV_API_KEY);
}

function registryTimeoutMs(): number {
  const parsed = Number(process.env.BUILDING_REGISTRY_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2500;
}

function registryHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = process.env.DVV_API_KEY || process.env.MML_API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function fetchJsonWithTimeout<T>(url: URL): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), registryTimeoutMs());

  try {
    const response = await fetch(url, {
      headers: registryHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithTimeout(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), registryTimeoutMs());

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/xml,text/xml,*/*" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function registryBaseUrl(): string {
  return (process.env.DVV_BUILDING_API_URL || DEFAULT_RYHTI_API_URL).replace(/\/+$/, "");
}

function parseFinnishAddress(address: string): ParsedAddress | null {
  const normalized = address.replace(/\s+/g, " ").trim();
  const postalMatch = normalized.match(/\b(\d{5})\b/);
  const postalCode = postalMatch?.[1];
  const beforePostal = postalMatch?.index !== undefined
    ? normalized.slice(0, postalMatch.index).replace(/,\s*$/, "").trim()
    : normalized.split(",")[0].trim();
  const streetMatch = beforePostal.match(/^(.+?)\s+(\d+)(?:[-\s]?[A-Za-zÅÄÖåäö0-9]*)?$/);

  if (!streetMatch) return null;

  let city: string | undefined;
  if (postalMatch?.index !== undefined) {
    city = normalized
      .slice(postalMatch.index + postalMatch[0].length)
      .replace(/^[,\s]+/, "")
      .split(",")[0]
      .trim();
  } else {
    city = normalized.split(",")[1]?.replace(/\b\d{5}\b/g, "").trim();
  }

  return {
    streetName: streetMatch[1].trim(),
    houseNumber: Number(streetMatch[2]),
    postalCode,
    city: city || undefined,
  };
}

function cqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildAddressFilter(parsed: ParsedAddress): string {
  const filters = [
    `address_name_fin=${cqlString(parsed.streetName)}`,
    `number_part_of_address_number=${parsed.houseNumber}`,
  ];

  if (parsed.postalCode) {
    filters.push(`postal_code=${cqlString(parsed.postalCode)}`);
  }

  if (!parsed.postalCode && parsed.city) {
    filters.push(`postal_office_fin=${cqlString(parsed.city)}`);
  }

  return filters.join(" AND ");
}

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(properties: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = readNumber(properties[key]);
    if (value !== null && value > 0) return value;
  }
  return null;
}

function firstString(properties: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(properties[key]);
    if (value) return value;
  }
  return null;
}

function collectPositions(value: unknown, out: number[][] = []): number[][] {
  if (!Array.isArray(value)) return out;

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    out.push([value[0], value[1]]);
    return out;
  }

  for (const child of value) {
    collectPositions(child, out);
  }
  return out;
}

function pointFromGeometry(geometry?: RegistryFeature["geometry"]): { lat: number; lon: number } | null {
  const positions = collectPositions(geometry?.coordinates);
  if (positions.length === 0) return null;

  const sum = positions.reduce(
    (acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
    { lon: 0, lat: 0 }
  );

  return {
    lon: sum.lon / positions.length,
    lat: sum.lat / positions.length,
  };
}

function distanceScore(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = a.lat - b.lat;
  const dLon = a.lon - b.lon;
  return dLat * dLat + dLon * dLon;
}

function selectNearestFeature(
  features: RegistryFeature[] | undefined,
  target: { lat: number; lon: number }
): RegistryFeature | null {
  if (!features?.length) return null;

  let best: RegistryFeature | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const feature of features) {
    const point = pointFromGeometry(feature.geometry);
    const score = point ? distanceScore(point, target) : Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      best = feature;
      bestScore = score;
    }
  }

  return best ?? features[0] ?? null;
}

async function lookupRyhtiAddress(address: string): Promise<AddressLookup | null> {
  const parsed = parseFinnishAddress(address);
  if (!parsed) return null;

  const url = new URL(`${registryBaseUrl()}/collections/open_address/items`);
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("filter-lang", "cql-text");
  url.searchParams.set("filter", buildAddressFilter(parsed));

  const collection = await fetchJsonWithTimeout<RegistryFeatureCollection>(url);
  const feature = collection.features?.[0];
  if (!feature) return null;

  const coordinates = pointFromGeometry(feature.geometry);
  if (!coordinates) return null;

  const props = feature.properties ?? {};
  const streetAddress = readString(props.address_fin)
    ?? `${parsed.streetName} ${parsed.houseNumber}`;
  const postal = [readString(props.postal_code), readString(props.postal_office_fin)]
    .filter(Boolean)
    .join(" ");

  return {
    address: postal ? `${streetAddress}, ${postal}` : streetAddress,
    coordinates,
    city: readString(props.postal_office_fin) ?? parsed.city,
    data_sources: [`Ryhti / DVV osoiterekisteri ${new Date().toISOString()}`],
  };
}

async function lookupRyhtiBuildingProperties(
  coordinates: { lat: number; lon: number }
): Promise<Record<string, unknown> | null> {
  for (const radius of [0.00045, 0.0009, 0.0018]) {
    const url = new URL(`${registryBaseUrl()}/collections/avoimet_lupa_rakennukset/items`);
    url.searchParams.set("f", "json");
    url.searchParams.set("limit", "10");
    url.searchParams.set(
      "bbox",
      [
        coordinates.lon - radius,
        coordinates.lat - radius,
        coordinates.lon + radius,
        coordinates.lat + radius,
      ].join(",")
    );

    const collection = await fetchJsonWithTimeout<RegistryFeatureCollection>(url);
    const feature = selectNearestFeature(collection.features, coordinates);
    if (feature?.properties) return feature.properties;
  }

  return null;
}

function inferBuildingType(area: number): string {
  if (area <= 90) return "kerrostalo";
  if (area >= 240) return "rivitalo";
  return "omakotitalo";
}

function normalizeBuildingType(raw: string | null, area: number): string {
  const value = raw?.toLowerCase() ?? "";
  if (value.includes("kerrostalo")) return "kerrostalo";
  if (value.includes("rivi")) return "rivitalo";
  if (value.includes("pari")) return "paritalo";
  if (value.includes("omakoti") || value.includes("pientalo") || value.includes("erillinen")) {
    return "omakotitalo";
  }
  return inferBuildingType(area);
}

function normalizeMaterial(raw: string | null, fallback: string): string {
  const value = raw?.toLowerCase() ?? "";
  if (value.includes("betoni")) return "betoni";
  if (value.includes("tiili")) return "tiili";
  if (value.includes("hirsi")) return "hirsi";
  if (value.includes("puu")) return "puu";
  if (value.includes("kivi")) return "tiili";
  return fallback;
}

function normalizeHeating(raw: string | null, fallback: string): string {
  const value = raw?.toLowerCase() ?? "";
  if (value.includes("kauko")) return "kaukolampo";
  if (value.includes("maal") || value.includes("geo")) return "maalampopumppu";
  if (value.includes("säh") || value.includes("sah")) return "sahko";
  if (value.includes("ölj") || value.includes("olj")) return "oljy";
  if (value.includes("puu") || value.includes("pelletti")) return "puu";
  return fallback;
}

function yearFromDate(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\b(18|19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

function mapRegistryBuilding(
  addressLookup: AddressLookup,
  properties: Record<string, unknown>,
  climate: ClimateLookup
): ExternalBuildingResult {
  const generic = generateGenericBuilding(addressLookup.address);
  const area = firstNumber(properties, ["kokonaisala", "kerrosala", "huoneistoala"])
    ?? generic.building_info.area_m2;
  const floors = firstNumber(properties, ["kerrosluku"]) ?? generic.building_info.floors;
  const year = yearFromDate(firstString(properties, ["valmistumispaivamaara", "paatospaivamaara"]))
    ?? generic.building_info.year_built;
  const materialRaw = firstString(properties, [
    "kantavien_rakenteiden_rakennusaine",
    "julkisivumateriaali",
  ]);
  const heatingRaw = firstString(properties, ["lammitysenergian_lahde", "lammitystapa"]);
  const type = normalizeBuildingType(
    firstString(properties, ["paaasiallinen_kayttotarkoitus", "kayttotarkoitus"]),
    area
  );
  const roundedArea = Math.round(area);
  const roundedFloors = Math.max(1, Math.round(floors));
  const dataSources = [
    ...addressLookup.data_sources,
    `Ryhti / DVV rakennustiedot ${new Date().toISOString()}`,
  ];

  if (climate.source) {
    dataSources.push(climate.source);
  }

  return {
    ...generic,
    address: addressLookup.address,
    coordinates: addressLookup.coordinates,
    building_info: {
      ...generic.building_info,
      type,
      year_built: year,
      material: normalizeMaterial(materialRaw, generic.building_info.material),
      floors: roundedFloors,
      area_m2: roundedArea,
      heating: normalizeHeating(heatingRaw, generic.building_info.heating),
    },
    climate_zone: climate.climate_zone,
    heating_degree_days: climate.heating_degree_days,
    scene_js: generateGenericScene(type, roundedFloors, roundedArea),
    confidence: "verified",
    data_sources: dataSources,
  };
}

function inferClimateZone(lat: number): string {
  if (lat >= 66.5) return "lapland";
  if (lat >= 63) return "northern";
  if (lat >= 61) return "central";
  return "southern";
}

function extractFmiTemperatures(xml: string): number[] {
  const values: number[] = [];
  const regex = /<(?:\w+:)?ParameterValue>(-?\d+(?:\.\d+)?)<\/(?:\w+:)?ParameterValue>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml)) !== null) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }

  return values;
}

function estimateHeatingDegreeDays(temperatures: number[]): number | undefined {
  if (temperatures.length === 0) return undefined;
  const daily = temperatures.reduce((sum, temp) => sum + Math.max(17 - temp, 0), 0);
  return Math.round((daily / temperatures.length) * 365);
}

async function lookupFmiClimate(
  city: string | undefined,
  coordinates: { lat: number; lon: number }
): Promise<ClimateLookup> {
  const result: ClimateLookup = {
    climate_zone: inferClimateZone(coordinates.lat),
  };

  if (process.env.FMI_LOOKUP_ENABLED === "false") return result;

  try {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const url = new URL(process.env.FMI_WFS_URL || DEFAULT_FMI_WFS_URL);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "getFeature");
    url.searchParams.set("storedquery_id", "fmi::observations::weather::daily::simple");
    url.searchParams.set("parameters", "tday");
    url.searchParams.set("maxlocations", "1");
    url.searchParams.set("starttime", start.toISOString());
    url.searchParams.set("endtime", end.toISOString());

    if (city) {
      url.searchParams.set("place", city);
    } else {
      url.searchParams.set("latlon", `${coordinates.lat},${coordinates.lon}`);
    }

    const xml = await fetchTextWithTimeout(url);
    result.heating_degree_days = estimateHeatingDegreeDays(extractFmiTemperatures(xml));
    if (result.heating_degree_days) {
      result.source = `Ilmatieteen laitos daily observations ${new Date().toISOString()}`;
    }
  } catch {
    // Climate context is additive; registry data should not fail because FMI is unavailable.
  }

  return result;
}

async function lookupFinnishRegistry(address: string): Promise<RegistryLookupOutcome> {
  try {
    const addressLookup = await lookupRyhtiAddress(address);
    if (!addressLookup) {
      return { error: "Finnish registry address match not found" };
    }

    const climate = await lookupFmiClimate(addressLookup.city, addressLookup.coordinates);
    const properties = await lookupRyhtiBuildingProperties(addressLookup.coordinates);

    if (!properties) {
      return {
        partial: {
          address: addressLookup.address,
          coordinates: addressLookup.coordinates,
          data_sources: addressLookup.data_sources,
        },
        error: "Finnish building registry details not found; using estimated building model",
      };
    }

    return {
      building: mapRegistryBuilding(addressLookup, properties, climate),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return { error: `Finnish registry lookup failed: ${detail}` };
  }
}

// GET /building?address=<address>
router.get("/", async (req: Request, res: Response) => {
  const address = (req.query.address as string) || "";

  // Input validation: minimum length
  if (!address || address.length < 3) {
    return res.status(400).json({ error: "Address query parameter required (min 3 characters)" });
  }

  // Input validation: maximum length to prevent abuse
  if (address.length > MAX_ADDRESS_LENGTH) {
    return res.status(400).json({ error: `Address must be ${MAX_ADDRESS_LENGTH} characters or fewer` });
  }

  // Check cache first
  const cacheKey = normalizeAddress(address);
  const cached = getCached(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  // Try to match against demo buildings
  for (const building of demoBuildings) {
    if (matchesDemoAddress(address, building.address)) {
      const result = {
        ...building,
        confidence: "verified" as const,
        data_sources: ["Helsinki CityGML", "K-Rauta hinnat 04/2026"],
      };
      setCache(cacheKey, result);
      return res.json(result);
    }
  }

  let registryOutcome: RegistryLookupOutcome | null = null;
  if (externalRegistryEnabled()) {
    registryOutcome = await lookupFinnishRegistry(address);
    if (registryOutcome.building) {
      setCache(cacheKey, registryOutcome.building);
      return res.json(registryOutcome.building);
    }
  }

  // Fallback: generate generic building
  const generic = generateGenericBuilding(address);
  const partial = registryOutcome?.partial;
  const dataSources = partial
    ? [...partial.data_sources, "Yleinen kerrostalomalli"]
    : ["Yleinen kerrostalomalli"];
  const result = {
    ...generic,
    ...(partial ? { address: partial.address, coordinates: partial.coordinates } : {}),
    confidence: "estimated" as const,
    data_sources: dataSources,
    ...(registryOutcome?.error ? { data_source_error: registryOutcome.error } : {}),
  };
  setCache(cacheKey, result);
  return res.json(result);
});

export default router;
