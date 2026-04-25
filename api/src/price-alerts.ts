import { query } from "./db";
import { sendEmail } from "./email";
import { sendPushToUser } from "./push";

export interface PriceAlertInput {
  materialId: string;
  supplierId?: string | null;
  previousUnitPrice: string | number | null | undefined;
  unitPrice: string | number | null | undefined;
  regularUnitPrice?: string | number | null | undefined;
  campaignLabel?: string | null | undefined;
  campaignEndsAt?: string | Date | null | undefined;
  source?: string;
}

interface WatchRow {
  id: string;
  user_id: string;
  project_id: string;
  material_id: string;
  target_price: string | number | null;
  watch_any_decrease: boolean;
  notify_email: boolean;
  notify_push: boolean;
  email: string;
  name: string | null;
  email_notifications: boolean;
  price_alert_email_frequency: string;
  push_notifications: boolean;
  project_name: string;
  material_name: string;
  supplier_name: string | null;
}

function toPositiveNumber(value: string | number | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function priceDropPercent(previous: string | number | null | undefined, current: string | number | null | undefined): number {
  const prev = toPositiveNumber(previous);
  const next = toPositiveNumber(current);
  if (prev == null || next == null || next >= prev) return 0;
  return (prev - next) / prev;
}

export function shouldTriggerPriceWatch(input: {
  previousUnitPrice: string | number | null | undefined;
  unitPrice: string | number | null | undefined;
  targetPrice?: string | number | null;
  watchAnyDecrease: boolean;
}): boolean {
  const previous = toPositiveNumber(input.previousUnitPrice);
  const current = toPositiveNumber(input.unitPrice);
  if (previous == null || current == null) return false;
  const target = input.targetPrice == null ? null : toPositiveNumber(input.targetPrice);
  const anyDecreaseHit = input.watchAnyDecrease && current < previous;
  const targetHit = target != null && current <= target;
  return anyDecreaseHit || targetHit;
}

function formatCurrency(value: number): string {
  return `${value.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function buildAlertCopy(row: WatchRow, previous: number, current: number, input: PriceAlertInput) {
  const pct = Math.round(priceDropPercent(previous, current) * 100);
  const supplier = row.supplier_name ? ` (${row.supplier_name})` : "";
  const campaignEndsAt = input.campaignEndsAt ? new Date(input.campaignEndsAt) : null;
  const campaignSuffix = input.campaignLabel
    ? ` ${input.campaignLabel}${campaignEndsAt && !Number.isNaN(campaignEndsAt.getTime()) ? ` until ${campaignEndsAt.toISOString().slice(0, 10)}` : ""}.`
    : "";
  const title = input.campaignLabel
    ? `${row.material_name} is on campaign (${pct}% off)`
    : `${row.material_name} dropped ${pct}%`;
  const body = `${row.project_name}: ${formatCurrency(previous)} -> ${formatCurrency(current)}${supplier}.${campaignSuffix}`;
  return {
    title,
    body,
    metadata: {
      material_id: row.material_id,
      project_id: row.project_id,
      price_watch_id: row.id,
      previous_unit_price: previous,
      unit_price: current,
      regular_unit_price: input.regularUnitPrice == null ? null : Number(input.regularUnitPrice),
      campaign_label: input.campaignLabel ?? null,
      campaign_ends_at: input.campaignEndsAt ?? null,
      drop_percent: pct,
      supplier_id: input.supplierId ?? null,
      source: input.source ?? null,
      target_price: row.target_price == null ? null : Number(row.target_price),
    },
  };
}

export async function notifyPriceWatchers(input: PriceAlertInput): Promise<number> {
  const previous = toPositiveNumber(input.previousUnitPrice);
  const current = toPositiveNumber(input.unitPrice);
  if (previous == null || current == null || current >= previous) return 0;

  const watchResult = await query(
    `SELECT pw.id, pw.user_id, pw.project_id, pw.material_id, pw.target_price,
            pw.watch_any_decrease, pw.notify_email, pw.notify_push,
            u.email, u.name, u.email_notifications,
            u.price_alert_email_frequency, u.push_notifications,
            p.name AS project_name,
            m.name AS material_name,
            s.name AS supplier_name
     FROM price_watches pw
     JOIN users u ON u.id = pw.user_id
     JOIN projects p ON p.id = pw.project_id AND p.deleted_at IS NULL
     JOIN materials m ON m.id = pw.material_id
     LEFT JOIN suppliers s ON s.id = $4
     WHERE pw.material_id = $1
       AND (pw.last_notified_price IS NULL OR $2::numeric < pw.last_notified_price)
       AND (
         pw.watch_any_decrease = true
         OR (pw.target_price IS NOT NULL AND $2::numeric <= pw.target_price)
       )`,
    [input.materialId, current, previous, input.supplierId ?? null],
  );

  let created = 0;
  for (const row of watchResult.rows as WatchRow[]) {
    if (!shouldTriggerPriceWatch({
      previousUnitPrice: previous,
      unitPrice: current,
      targetPrice: row.target_price,
      watchAnyDecrease: row.watch_any_decrease,
    })) {
      continue;
    }

    const copy = buildAlertCopy(row, previous, current, input);
    const notification = await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata_json)
       VALUES ($1, 'price_drop', $2, $3, $4::jsonb)
       RETURNING id`,
      [row.user_id, copy.title, copy.body, JSON.stringify(copy.metadata)],
    );

    await query(
      "UPDATE price_watches SET last_notified_price = $1, updated_at = now() WHERE id = $2",
      [current, row.id],
    );
    created += notification.rows.length;

    if (row.notify_email && row.email_notifications && row.price_alert_email_frequency !== "off") {
      await sendEmail(
        row.email,
        `Helscoop price alert: ${row.material_name}`,
        [
          `Hi ${row.name || "there"},`,
          "",
          copy.body,
          "",
          "Open Helscoop to review your BOM before buying.",
        ].join("\n"),
      );
    }

    if (row.notify_push && row.push_notifications) {
      await sendPushToUser(row.user_id, {
        title: copy.title,
        body: copy.body,
        url: `/project/${row.project_id}`,
        tag: `price-drop-${row.material_id}`,
        data: copy.metadata,
      });
    }
  }

  return created;
}
