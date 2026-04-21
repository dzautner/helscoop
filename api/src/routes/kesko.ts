import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";
import {
  KeskoProduct,
  getCachedKeskoProduct,
  mapKeskoCategory,
  normalizeKeskoProduct,
  rememberKeskoProducts,
  searchKeskoProducts,
} from "../kesko-client";

const router = Router();

router.use(requireAuth);
router.use(requirePermission("pricing:read"));

router.get("/products/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const branchCode = typeof req.query.branchCode === "string" ? req.query.branchCode : undefined;

  if (q.length < 2) {
    return res.status(400).json({ error: "q must be at least 2 characters" });
  }
  if (q.length > 100) {
    return res.status(400).json({ error: "q must be 100 characters or fewer" });
  }

  const result = await searchKeskoProducts(q, branchCode);
  res.json(result);
});

router.post("/products/import", async (req, res) => {
  const product = resolveImportProduct(req.body);
  if (!product) {
    return res.status(400).json({ error: "A valid Kesko product is required" });
  }

  const validation = validateImportProduct(product);
  if (validation) {
    return res.status(400).json({ error: validation });
  }

  rememberKeskoProducts([product]);

  const categoryId = mapKeskoCategory(product.categoryName, product.name);
  const categoryResult = await query(
    "SELECT id, display_name, display_name_fi FROM categories WHERE id = $1 AND hidden = false",
    [categoryId],
  );
  const category = categoryResult.rows[0] || { id: "hardware", display_name: "Hardware", display_name_fi: "Tarvikkeet" };
  const unitPrice = product.unitPrice ?? 0;
  const inStock = product.stockLevel === "in_stock" || product.stockLevel === "low_stock"
    ? true
    : product.stockLevel === "out_of_stock"
      ? false
      : null;

  await query(
    `INSERT INTO suppliers (id, name, url, currency, region, scrape_enabled, scrape_config)
     VALUES ('k-rauta', 'K-Rauta', 'https://www.k-rauta.fi', 'EUR', 'Finland', false, '{"type":"kesko-api"}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       url = EXCLUDED.url,
       currency = EXCLUDED.currency,
       scrape_config = suppliers.scrape_config || EXCLUDED.scrape_config,
       updated_at = now()`,
  );

  const materialResult = await query(
    `INSERT INTO materials (
       id, name, category_id, tags, description, image_url, waste_factor
     )
     VALUES ($1, $2, $3, $4, $5, $6, 1.05)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       category_id = EXCLUDED.category_id,
       tags = EXCLUDED.tags,
       description = EXCLUDED.description,
       image_url = COALESCE(EXCLUDED.image_url, materials.image_url),
       updated_at = now()
     RETURNING id, name, category_id, image_url, waste_factor`,
    [
      product.materialId,
      product.name.slice(0, 240),
      category.id,
      ["kesko", "k-rauta", product.categoryName || category.id].filter(Boolean),
      buildMaterialDescription(product),
      product.imageUrl,
    ],
  );

  const pricingResult = await query(
    `INSERT INTO pricing (
       material_id, supplier_id, unit, unit_price, currency, sku, ean, link,
       is_primary, in_stock, stock_level, store_location, last_checked_at,
       last_scraped_at, last_verified_at
     )
     VALUES ($1, 'k-rauta', $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, now(), now())
     ON CONFLICT (material_id, supplier_id) DO UPDATE SET
       unit = EXCLUDED.unit,
       unit_price = EXCLUDED.unit_price,
       currency = EXCLUDED.currency,
       sku = EXCLUDED.sku,
       ean = EXCLUDED.ean,
       link = EXCLUDED.link,
       is_primary = true,
       in_stock = EXCLUDED.in_stock,
       stock_level = EXCLUDED.stock_level,
       store_location = EXCLUDED.store_location,
       last_checked_at = EXCLUDED.last_checked_at,
       last_scraped_at = now(),
       last_verified_at = now(),
       updated_at = now()
     RETURNING id, material_id, supplier_id, unit, unit_price, currency, sku, ean, link,
       is_primary, in_stock, stock_level, store_location, last_checked_at`,
    [
      product.materialId,
      product.unit,
      unitPrice,
      product.currency || "EUR",
      product.sku,
      product.ean,
      product.productUrl,
      inStock,
      product.stockLevel,
      product.storeLocation || product.storeName,
      product.lastCheckedAt,
    ],
  );

  await query(
    `INSERT INTO pricing_history (pricing_id, unit_price, source)
     VALUES ($1, $2, 'kesko-api')`,
    [pricingResult.rows[0].id, unitPrice],
  );

  const material = materialResult.rows[0];
  const pricing = {
    ...pricingResult.rows[0],
    supplier_name: "K-Rauta",
    supplier_url: "https://www.k-rauta.fi",
  };
  const categoryName = category.display_name || category.id;
  const categoryNameFi = category.display_name_fi || null;

  res.status(201).json({
    material: {
      ...material,
      name_fi: material.name,
      name_en: material.name,
      category_name: categoryName,
      category_name_fi: categoryNameFi,
      pricing: [pricing],
    },
    bom_item: {
      material_id: material.id,
      material_name: material.name,
      category_name: categoryName,
      image_url: material.image_url,
      quantity: 1,
      unit: pricing.unit,
      unit_price: Number(pricing.unit_price),
      total: Number(pricing.unit_price),
      supplier: "K-Rauta",
      link: pricing.link,
      in_stock: pricing.in_stock,
      stock_level: pricing.stock_level,
      store_location: pricing.store_location,
      stock_last_checked_at: pricing.last_checked_at,
    },
  });
});

function resolveImportProduct(body: unknown): KeskoProduct | null {
  if (!body || typeof body !== "object") return null;
  const input = body as { productId?: unknown; product?: unknown };
  if (typeof input.productId === "string") {
    const cached = getCachedKeskoProduct(input.productId);
    if (cached) return cached;
  }
  if (!input.product || typeof input.product !== "object" || Array.isArray(input.product)) return null;
  const product = input.product as Partial<KeskoProduct>;
  if (typeof product.id === "string" && typeof product.name === "string" && typeof product.materialId === "string") {
    return {
      id: product.id,
      materialId: product.materialId,
      name: product.name,
      ean: typeof product.ean === "string" ? product.ean : null,
      sku: typeof product.sku === "string" ? product.sku : null,
      unitPrice: typeof product.unitPrice === "number" ? product.unitPrice : null,
      priceText: typeof product.priceText === "string" ? product.priceText : null,
      currency: typeof product.currency === "string" ? product.currency : "EUR",
      unit: typeof product.unit === "string" ? product.unit : "kpl",
      imageUrl: typeof product.imageUrl === "string" ? product.imageUrl : null,
      productUrl: typeof product.productUrl === "string" ? product.productUrl : null,
      stockLevel: product.stockLevel === "in_stock" || product.stockLevel === "low_stock" || product.stockLevel === "out_of_stock"
        ? product.stockLevel
        : "unknown",
      stockQuantity: typeof product.stockQuantity === "number" ? product.stockQuantity : null,
      storeName: typeof product.storeName === "string" ? product.storeName : null,
      storeLocation: typeof product.storeLocation === "string" ? product.storeLocation : null,
      categoryName: typeof product.categoryName === "string" ? product.categoryName : null,
      branchCode: typeof product.branchCode === "string" ? product.branchCode : "unknown",
      lastCheckedAt: typeof product.lastCheckedAt === "string" ? product.lastCheckedAt : new Date().toISOString(),
    };
  }
  return normalizeKeskoProduct(input.product as Record<string, unknown>, "unknown", new Date().toISOString());
}

function validateImportProduct(product: KeskoProduct): string | null {
  if (!product.materialId.startsWith("kesko_")) return "materialId must be a Kesko-generated id";
  if (product.name.trim().length < 2 || product.name.length > 240) return "product name is invalid";
  if (product.unit.length < 1 || product.unit.length > 24) return "unit is invalid";
  if (product.unitPrice !== null && (!Number.isFinite(product.unitPrice) || product.unitPrice < 0 || product.unitPrice > 100000)) {
    return "unitPrice is invalid";
  }
  if (product.productUrl && !isAllowedUrl(product.productUrl, ["k-rauta.fi", "krauta.fi", "kesko.fi"])) {
    return "productUrl must point to an allowed Kesko or K-Rauta host";
  }
  if (product.imageUrl && !isAllowedUrl(product.imageUrl, [])) {
    return "imageUrl must be https";
  }
  return null;
}

function isAllowedUrl(raw: string, allowedHosts: string[]): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (allowedHosts.length === 0) return true;
    return allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function buildMaterialDescription(product: KeskoProduct): string {
  const parts = [
    "Imported from Kesko/K-Rauta live catalog.",
    product.ean ? `EAN: ${product.ean}` : null,
    product.sku ? `SKU: ${product.sku}` : null,
    product.branchCode ? `Branch: ${product.branchCode}` : null,
  ];
  return parts.filter(Boolean).join(" ");
}

export default router;
