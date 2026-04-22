import { Pool } from "pg";
import * as cheerio from "cheerio";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://dingcad:dingcad_dev@localhost:5432/dingcad",
});

interface PricingRow {
  id: string;
  material_id: string;
  supplier_id: string;
  unit: string;
  unit_price: number | string;
  link: string | null;
}

type StockLevel = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

interface ScrapeResult {
  materialId: string;
  oldPrice: number;
  newPrice: number | null;
  stockLevel?: StockLevel;
  error?: string;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Helscoop PriceBot/1.0; +https://github.com/dzautner/helscoop)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function extractPrice(html: string, config: Record<string, string>): number | null {
  const $ = cheerio.load(html);

  const selectors = [
    config.priceSelector,
    '[data-price]',
    '.product-price',
    '.price__current',
    '.product__price',
    '.price-tag',
    'meta[property="product:price:amount"]',
  ].filter(Boolean) as string[];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (!el.length) continue;

    let text = el.attr("content") || el.attr("data-price") || el.text();
    if (!text) continue;

    text = text.replace(/[^\d.,]/g, "").replace(",", ".");
    const price = parseFloat(text);
    if (!isNaN(price) && price > 0 && price < 100000) return price;
  }
  return null;
}

function classifyStockText(text: string): { stockLevel: StockLevel; inStock: boolean | null } {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return { stockLevel: "unknown", inStock: null };

  const outOfStock = [
    "ei saatavilla",
    "ei varastossa",
    "loppu",
    "tilapäisesti loppu",
    "out of stock",
    "unavailable",
    "sold out",
  ];
  if (outOfStock.some((term) => normalized.includes(term))) {
    return { stockLevel: "out_of_stock", inStock: false };
  }

  const lowStock = [
    "vähän varastossa",
    "rajoitetusti",
    "niukasti",
    "low stock",
    "limited stock",
    "few left",
  ];
  if (lowStock.some((term) => normalized.includes(term))) {
    return { stockLevel: "low_stock", inStock: true };
  }

  const inStock = [
    "varastossa",
    "saatavilla",
    "noutettavissa",
    "toimitettavissa",
    "in stock",
    "available",
  ];
  if (inStock.some((term) => normalized.includes(term))) {
    return { stockLevel: "in_stock", inStock: true };
  }

  return { stockLevel: "unknown", inStock: null };
}

function extractStock(
  html: string,
  config: Record<string, string>,
): { stockLevel: StockLevel; inStock: boolean | null; storeLocation: string | null; checked: boolean } {
  const $ = cheerio.load(html);
  const stockSelectors = [
    config.stockSelector,
    "[data-stock-status]",
    "[data-availability]",
    ".availability",
    ".stock-status",
    ".product-availability",
    ".store-availability",
    ".availability__text",
  ].filter(Boolean) as string[];
  const storeSelectors = [
    config.storeSelector,
    "[data-store-name]",
    ".store-name",
    ".selected-store",
    ".pickup-store",
  ].filter(Boolean) as string[];

  let stockText = "";
  for (const sel of stockSelectors) {
    const el = $(sel).first();
    if (!el.length) continue;
    stockText = [
      el.attr("content"),
      el.attr("data-stock-status"),
      el.attr("data-availability"),
      el.text(),
    ].filter(Boolean).join(" ");
    if (stockText.trim()) break;
  }

  let storeLocation: string | null = null;
  for (const sel of storeSelectors) {
    const text = $(sel).first().text().replace(/\s+/g, " ").trim();
    if (text) {
      storeLocation = text;
      break;
    }
  }

  const classified = classifyStockText(stockText);
  return {
    ...classified,
    storeLocation,
    checked: classified.stockLevel !== "unknown" || storeLocation !== null,
  };
}

async function scrapeSupplier(supplierId: string): Promise<ScrapeResult[]> {
  const supplierResult = await pool.query(
    "SELECT * FROM suppliers WHERE id = $1 AND scrape_enabled = true",
    [supplierId]
  );
  if (supplierResult.rows.length === 0) {
    console.log(`Supplier ${supplierId} not found or scraping disabled`);
    return [];
  }

  const supplier = supplierResult.rows[0];
  const config = (supplier.scrape_config as Record<string, string>) || {};

  if (config.type === "manual") {
    console.log(`Supplier ${supplierId} is manual-only, skipping`);
    return [];
  }

  const pricingResult = await pool.query(
    "SELECT * FROM pricing WHERE supplier_id = $1 AND link IS NOT NULL",
    [supplierId]
  );

  const results: ScrapeResult[] = [];

  for (const row of pricingResult.rows as PricingRow[]) {
    if (!row.link) continue;

    const oldPrice = Number(row.unit_price);
    console.log(`  Scraping ${row.material_id} from ${row.link}`);
    const html = await fetchPage(row.link);

    if (!html) {
      results.push({
        materialId: row.material_id,
        oldPrice,
        newPrice: null,
        error: "Failed to fetch page",
      });
      continue;
    }

    const newPrice = extractPrice(html, config);
    const stock = extractStock(html, config);
    results.push({
      materialId: row.material_id,
      oldPrice,
      newPrice,
      stockLevel: stock.stockLevel,
      error: newPrice === null ? "Price not found on page" : undefined,
    });

    if (newPrice !== null && newPrice !== oldPrice) {
      await pool.query(
        "UPDATE pricing SET previous_unit_price=unit_price, unit_price=$1, last_scraped_at=now(), updated_at=now() WHERE id=$2",
        [newPrice, row.id]
      );
      await pool.query(
        "INSERT INTO pricing_history (pricing_id, unit_price, source) VALUES ($1, $2, 'scraper')",
        [row.id, newPrice]
      );
      if (newPrice < oldPrice) {
        await pool.query(
          `WITH matching_watches AS (
             SELECT pw.id, pw.user_id, pw.project_id, pw.material_id,
                    m.name AS material_name, p.name AS project_name
             FROM price_watches pw
             JOIN projects p ON p.id = pw.project_id AND p.deleted_at IS NULL
             JOIN materials m ON m.id = pw.material_id
             WHERE pw.material_id = $1
               AND (pw.last_notified_price IS NULL OR $2::numeric < pw.last_notified_price)
               AND (
                 pw.watch_any_decrease = true
                 OR (pw.target_price IS NOT NULL AND $2::numeric <= pw.target_price)
               )
           ), inserted AS (
             INSERT INTO notifications (user_id, type, title, body, metadata_json)
             SELECT user_id,
                    'price_drop',
                    material_name || ' dropped ' || ROUND((($3::numeric - $2::numeric) / $3::numeric) * 100)::text || '%',
                    project_name || ': ' || $3::numeric::text || ' EUR -> ' || $2::numeric::text || ' EUR.',
                    jsonb_build_object(
                      'material_id', material_id,
                      'project_id', project_id,
                      'previous_unit_price', $3::numeric,
                      'unit_price', $2::numeric,
                      'source', 'scraper'
                    )
             FROM matching_watches
             RETURNING user_id
           )
           UPDATE price_watches
           SET last_notified_price = $2::numeric, updated_at = now()
           WHERE id IN (SELECT id FROM matching_watches)`,
          [row.material_id, newPrice, oldPrice]
        );
      }
      console.log(
        `    Price updated: ${oldPrice} → ${newPrice} EUR`
      );
    } else if (newPrice !== null) {
      await pool.query(
        "UPDATE pricing SET last_scraped_at=now() WHERE id=$1",
        [row.id]
      );
      console.log(`    Price unchanged: ${newPrice} EUR`);
    }

    if (stock.checked) {
      await pool.query(
        `UPDATE pricing
         SET stock_level=$1, in_stock=$2, store_location=COALESCE($3, store_location),
             last_checked_at=now(), updated_at=now()
         WHERE id=$4`,
        [stock.stockLevel, stock.inStock, stock.storeLocation, row.id]
      );
      console.log(`    Stock: ${stock.stockLevel}${stock.storeLocation ? ` (${stock.storeLocation})` : ""}`);
    }

    // Rate limit: 2s between requests
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const supplierFilter = args.includes("--supplier")
    ? args[args.indexOf("--supplier") + 1]
    : null;

  console.log("=== Helscoop Price Scraper ===\n");

  const suppliersResult = supplierFilter
    ? await pool.query(
        "SELECT id FROM suppliers WHERE id = $1 AND scrape_enabled = true",
        [supplierFilter]
      )
    : await pool.query(
        "SELECT id FROM suppliers WHERE scrape_enabled = true ORDER BY id"
      );

  let totalChecked = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const { id: supplierId } of suppliersResult.rows) {
    console.log(`\nScraping supplier: ${supplierId}`);

    const runResult = await pool.query(
      "INSERT INTO scrape_runs (supplier_id) VALUES ($1) RETURNING id",
      [supplierId]
    );
    const runId = runResult.rows[0].id;

    const results = await scrapeSupplier(supplierId);
    const checked = results.length;
    const updated = results.filter(
      (r) => r.newPrice !== null && r.newPrice !== r.oldPrice
    ).length;
    const errors = results.filter((r) => r.error).length;

    totalChecked += checked;
    totalUpdated += updated;
    totalErrors += errors;

    const errorLog = results
      .filter((r) => r.error)
      .map((r) => `${r.materialId}: ${r.error}`)
      .join("\n");

    await pool.query(
      `UPDATE scrape_runs SET finished_at=now(), status='completed',
        materials_checked=$1, prices_updated=$2, errors=$3, error_log=$4
       WHERE id=$5`,
      [checked, updated, errors, errorLog || null, runId]
    );
  }

  console.log("\n=== Summary ===");
  console.log(`  Checked: ${totalChecked}`);
  console.log(`  Updated: ${totalUpdated}`);
  console.log(`  Errors:  ${totalErrors}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Scraper failed:", err);
  process.exit(1);
});
