import { pool, query } from "../db";

async function snapshotPriceHistory() {
  const result = await query(
    `INSERT INTO pricing_history (pricing_id, unit_price, source)
     SELECT p.id, p.unit_price, 'daily_snapshot'
     FROM pricing p
     WHERE p.unit_price IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pricing_history ph
         WHERE ph.pricing_id = p.id
           AND ph.source = 'daily_snapshot'
           AND ph.scraped_at::date = CURRENT_DATE
       )`,
  );

  console.log(`Recorded ${result.rowCount ?? 0} price history snapshots`);
}

snapshotPriceHistory()
  .catch((err) => {
    console.error("Failed to snapshot price history", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
