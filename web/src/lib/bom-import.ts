import readXlsxFile from "read-excel-file/browser";
import type { BomItem, Material } from "@/types";

export type BomImportMode = "merge" | "replace";

export interface ImportedBomRow {
  rowNumber: number;
  materialKey: string;
  quantity: number;
  unit: string;
  note?: string;
  raw: Record<string, string>;
}

export interface BomImportPreviewRow {
  id: string;
  imported: ImportedBomRow;
  matchedMaterialId: string | null;
  confidence: number;
}

const MATERIAL_HEADERS = [
  "material_id", "material id", "id", "materiaali id", "materiaalitunnus",
  "material", "materiaali", "tuote", "product", "name", "nimi",
];
const QUANTITY_HEADERS = ["quantity", "qty", "maara", "määrä", "kpl", "amount"];
const UNIT_HEADERS = ["unit", "yksikko", "yksikkö"];
const NOTE_HEADERS = ["note", "notes", "muistiinpano", "kommentti", "comment"];

function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumber(value: string): number {
  const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function findHeader(headers: string[], candidates: string[]): string | null {
  const normalizedCandidates = candidates.map(normalizeHeader);
  for (const header of headers) {
    if (normalizedCandidates.includes(normalizeHeader(header))) return header;
  }
  return null;
}

function detectDelimiter(line: string): string {
  const candidates = ["\t", ";", ","];
  return candidates
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseDelimitedRows(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = cleaned.split("\n").find((line) => line.trim().length > 0) ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const next = cleaned[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if (char === "\n" && !quoted) {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function rowsToImportedBomRows(rows: string[][]): ImportedBomRow[] {
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  const materialHeader = findHeader(headers, MATERIAL_HEADERS);
  const quantityHeader = findHeader(headers, QUANTITY_HEADERS);
  const unitHeader = findHeader(headers, UNIT_HEADERS);
  const noteHeader = findHeader(headers, NOTE_HEADERS);

  if (!materialHeader || !quantityHeader) {
    throw new Error("Missing material or quantity column");
  }

  const headerIndex = new Map(headers.map((header, index) => [header, index]));

  return rows.slice(1).flatMap((cells, index) => {
    const raw = Object.fromEntries(headers.map((header, col) => [header, cells[col] ?? ""]));
    const materialKey = cells[headerIndex.get(materialHeader) ?? -1]?.trim() ?? "";
    const quantity = parseNumber(cells[headerIndex.get(quantityHeader) ?? -1] ?? "");
    if (!materialKey || quantity <= 0) return [];

    return [{
      rowNumber: index + 2,
      materialKey,
      quantity,
      unit: unitHeader ? (cells[headerIndex.get(unitHeader) ?? -1]?.trim() || "kpl") : "kpl",
      note: noteHeader ? cells[headerIndex.get(noteHeader) ?? -1]?.trim() : undefined,
      raw,
    }];
  });
}

function parseJsonImport(text: string): ImportedBomRow[] {
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.bom ?? parsed.items;
  if (!Array.isArray(rows)) throw new Error("JSON import must be an array or contain bom/items");

  return rows.flatMap((row: Record<string, unknown>, index: number) => {
    const materialKey = String(
      row.material_id ?? row.materialId ?? row.id ?? row.material ?? row.material_name ?? row.name ?? "",
    ).trim();
    const quantity = parseNumber(String(row.quantity ?? row.qty ?? row.amount ?? ""));
    if (!materialKey || quantity <= 0) return [];

    return [{
      rowNumber: index + 1,
      materialKey,
      quantity,
      unit: String(row.unit ?? "kpl"),
      note: row.note == null ? undefined : String(row.note),
      raw: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? "")])),
    }];
  });
}

export async function parseBomImportFile(file: File): Promise<ImportedBomRow[]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".json")) {
    return parseJsonImport(await file.text());
  }

  if (lowerName.endsWith(".xlsx")) {
    const sheets = await readXlsxFile(file);
    const rows = sheets[0]?.data ?? [];
    return rowsToImportedBomRows(
      rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell)))),
    );
  }

  return rowsToImportedBomRows(parseDelimitedRows(await file.text()));
}

export function parseBomImportText(text: string): ImportedBomRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return parseJsonImport(trimmed);
  return rowsToImportedBomRows(parseDelimitedRows(trimmed));
}

function materialAliases(material: Material): string[] {
  return [
    material.id,
    material.name,
    material.name_fi ?? "",
    material.name_en ?? "",
  ].filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

export function matchImportedBomRows(rows: ImportedBomRow[], materials: Material[]): BomImportPreviewRow[] {
  return rows.map((row, index) => {
    const key = normalizeText(row.materialKey);
    let best: { material: Material | null; confidence: number } = { material: null, confidence: 0 };

    for (const material of materials) {
      const score = Math.max(...materialAliases(material).map((alias) => similarity(key, normalizeText(alias))));
      if (score > best.confidence) best = { material, confidence: score };
    }

    return {
      id: `${row.rowNumber}-${index}`,
      imported: row,
      matchedMaterialId: best.confidence >= 0.62 ? best.material?.id ?? null : null,
      confidence: Math.round(best.confidence * 100),
    };
  });
}

export function buildImportedBomItem(row: ImportedBomRow, material: Material): BomItem {
  const pricing = material.pricing?.find((price) => price.is_primary) ?? material.pricing?.[0];
  const unitPrice = Number(pricing?.unit_price ?? 0);
  const unit = row.unit || material.design_unit || pricing?.unit || "kpl";
  return {
    material_id: material.id,
    material_name: material.name,
    category_name: material.category_name,
    image_url: material.image_url,
    quantity: row.quantity,
    unit,
    unit_price: unitPrice,
    total: unitPrice * row.quantity,
    supplier: pricing?.supplier_name,
    link: pricing?.link,
    in_stock: pricing?.in_stock,
    stock_level: pricing?.stock_level ?? "unknown",
    store_location: pricing?.store_location,
    stock_last_checked_at: pricing?.last_checked_at,
    note: row.note,
  };
}
