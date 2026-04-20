/**
 * Catalog validation script for materials/materials.json
 *
 * Checks:
 *  - All required fields are present on each material
 *  - conversionFactor is positive and sensible (0 < x <= 100)
 *  - No duplicate supplier SKUs across materials
 *  - Warns when lastUpdated is older than 90 days
 *
 * Usage:
 *   npx ts-node materials/validate-catalog.ts
 *   node --loader ts-node/esm materials/validate-catalog.ts
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MaterialEntry {
  name: string;
  category: string;
  purchasableUnit?: string;
  designUnit?: string;
  packSize?: number | null;
  conversionFactor?: number;
  vatClass?: number;
  supplierSku?: Record<string, string>;
  substitutionGroup?: string | null;
  lastUpdated?: string;
}

interface Catalog {
  version: number;
  materials: Record<string, MaterialEntry>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS: (keyof MaterialEntry)[] = [
  "name",
  "category",
  "purchasableUnit",
  "designUnit",
  "conversionFactor",
  "vatClass",
  "supplierSku",
  "substitutionGroup",
  "lastUpdated",
];

const VALID_PURCHASABLE_UNITS = new Set([
  "sheet", "bag", "bundle", "piece", "m", "m2", "m3",
]);

const VALID_DESIGN_UNITS = new Set([
  "m2", "m", "m3", "kpl", "kg",
]);

const VALID_VAT_CLASSES = new Set([14, 24, 25.5]);

const STALE_DAYS = 90;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(catalog: Catalog): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Track all supplier SKUs globally to detect duplicates
  // Map: "supplier:sku" -> first materialId that used it
  const skuRegistry = new Map<string, string>();

  for (const [id, mat] of Object.entries(catalog.materials)) {
    const prefix = `[${id}]`;

    // --- Required fields ---
    for (const field of REQUIRED_FIELDS) {
      if (mat[field] === undefined) {
        errors.push(`${prefix} Missing required field: "${field}"`);
      }
    }

    // --- purchasableUnit ---
    if (mat.purchasableUnit !== undefined && !VALID_PURCHASABLE_UNITS.has(mat.purchasableUnit)) {
      warnings.push(
        `${prefix} Unrecognised purchasableUnit "${mat.purchasableUnit}". ` +
        `Expected one of: ${[...VALID_PURCHASABLE_UNITS].join(", ")}`
      );
    }

    // --- designUnit ---
    if (mat.designUnit !== undefined && !VALID_DESIGN_UNITS.has(mat.designUnit)) {
      warnings.push(
        `${prefix} Unrecognised designUnit "${mat.designUnit}". ` +
        `Expected one of: ${[...VALID_DESIGN_UNITS].join(", ")}`
      );
    }

    // --- conversionFactor ---
    if (mat.conversionFactor !== undefined) {
      if (mat.conversionFactor <= 0) {
        errors.push(`${prefix} conversionFactor must be > 0, got ${mat.conversionFactor}`);
      } else if (mat.conversionFactor > 100) {
        warnings.push(
          `${prefix} conversionFactor is unusually large (${mat.conversionFactor}). ` +
          `Did you mean to invert it?`
        );
      }
    }

    // --- vatClass ---
    if (mat.vatClass !== undefined && !VALID_VAT_CLASSES.has(mat.vatClass)) {
      errors.push(
        `${prefix} Invalid vatClass ${mat.vatClass}. ` +
        `Expected one of: ${[...VALID_VAT_CLASSES].join(", ")}`
      );
    }

    // --- packSize consistency ---
    // If purchasableUnit is sheet/bag/bundle we expect a packSize
    if (
      mat.purchasableUnit !== undefined &&
      ["sheet", "bag", "bundle"].includes(mat.purchasableUnit) &&
      (mat.packSize === undefined || mat.packSize === null)
    ) {
      warnings.push(
        `${prefix} purchasableUnit is "${mat.purchasableUnit}" but packSize is null/missing. ` +
        `Consider setting a packSize so buy quantities can be computed.`
      );
    }

    // --- Duplicate SKU check ---
    if (mat.supplierSku) {
      for (const [supplier, sku] of Object.entries(mat.supplierSku)) {
        if (!sku || sku.trim() === "") {
          warnings.push(`${prefix} Empty SKU for supplier "${supplier}"`);
          continue;
        }
        const key = `${supplier}:${sku}`;
        if (skuRegistry.has(key)) {
          errors.push(
            `${prefix} Duplicate SKU "${sku}" for supplier "${supplier}" ` +
            `(also used by "${skuRegistry.get(key)}")`
          );
        } else {
          skuRegistry.set(key, id);
        }
      }
    }

    // --- Stale lastUpdated ---
    if (mat.lastUpdated) {
      const days = daysSince(mat.lastUpdated);
      if (days > STALE_DAYS) {
        warnings.push(
          `${prefix} lastUpdated is ${days} days ago (${mat.lastUpdated}). ` +
          `Please verify pricing is still current.`
        );
      }
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  const catalogPath = path.resolve(__dirname, "materials.json");

  if (!fs.existsSync(catalogPath)) {
    console.error(`ERROR: Catalog not found at ${catalogPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(catalogPath, "utf-8");
  let catalog: Catalog;
  try {
    catalog = JSON.parse(raw) as Catalog;
  } catch (e) {
    console.error("ERROR: Failed to parse materials.json:", e);
    process.exit(1);
  }

  const materialCount = Object.keys(catalog.materials).length;
  console.log(`\nValidating catalog v${catalog.version} (${materialCount} materials)\n`);

  const { errors, warnings } = validate(catalog);

  if (warnings.length > 0) {
    console.log("WARNINGS:");
    for (const w of warnings) {
      console.log("  " + w);
    }
    console.log();
  }

  if (errors.length > 0) {
    console.log("ERRORS:");
    for (const e of errors) {
      console.log("  " + e);
    }
    console.log();
    console.error(`Catalog validation failed with ${errors.length} error(s).`);
    process.exit(1);
  }

  console.log(
    `Catalog OK — ${materialCount} materials, ` +
    `${warnings.length} warning(s), 0 errors.`
  );
}

main();
