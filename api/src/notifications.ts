import crypto from "crypto";
import { query } from "./db";
import { sendEmail } from "./email";

export interface WeeklyDigestProject {
  id: string;
  name: string;
  views: number;
}

export interface WeeklyDigestPriceChange {
  project_id: string;
  project_name: string;
  material_name: string;
  previous_unit_price: string | number;
  unit_price: string | number;
  supplier_name?: string | null;
}

export interface WeeklyDigestUser {
  id: string;
  email: string;
  name: string;
  email_unsubscribe_token: string;
  last_activity_digest_at?: string | Date | null;
  locale?: string | null;
  projects: WeeklyDigestProject[];
  priceChanges: WeeklyDigestPriceChange[];
}

const VIEW_DEDUPE_WINDOW = "1 hour";
const PRICE_CHANGE_THRESHOLD = 0.05;

export function hashViewerIp(ip: string | undefined | null): string {
  const salt = process.env.VIEW_IP_HASH_SALT || process.env.JWT_SECRET || "helscoop-dev-secret";
  return crypto
    .createHash("sha256")
    .update(`${salt}:${ip || "unknown"}`)
    .digest("hex");
}

export async function logProjectView(projectId: string, viewerIp: string | undefined, referrer?: string | null): Promise<boolean> {
  const viewerHash = hashViewerIp(viewerIp);
  const result = await query(
    `INSERT INTO project_views (project_id, viewer_ip_hash, referrer)
     SELECT $1, $2, $3
     WHERE NOT EXISTS (
       SELECT 1
       FROM project_views
       WHERE project_id = $1
         AND viewer_ip_hash = $2
         AND viewed_at > NOW() - INTERVAL '${VIEW_DEDUPE_WINDOW}'
     )
     RETURNING id`,
    [projectId, viewerHash, referrer || null],
  );
  return result.rows.length > 0;
}

export function priceChangePercent(previous: string | number | null | undefined, current: string | number | null | undefined): number {
  const prev = Number(previous);
  const next = Number(current);
  if (!Number.isFinite(prev) || !Number.isFinite(next) || prev <= 0 || next <= 0) return 0;
  return (next - prev) / prev;
}

export function isDigestWorthyPriceChange(change: WeeklyDigestPriceChange): boolean {
  return Math.abs(priceChangePercent(change.previous_unit_price, change.unit_price)) >= PRICE_CHANGE_THRESHOLD;
}

function formatCurrency(value: string | number, locale: string): string {
  return `${Number(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EUR`;
}

export function buildWeeklyDigestEmail(user: WeeklyDigestUser, appUrl = process.env.APP_URL || "https://helscoop.fi") {
  const locale = user.locale === "en" ? "en" : "fi";
  const projectLines = user.projects
    .filter((project) => Number(project.views) > 0)
    .map((project) =>
      locale === "fi"
        ? `- ${project.name}: katsottu ${project.views} kertaa`
        : `- ${project.name}: viewed ${project.views} times`,
    );

  const priceLines = user.priceChanges
    .filter(isDigestWorthyPriceChange)
    .map((change) => {
      const pct = priceChangePercent(change.previous_unit_price, change.unit_price);
      const sign = pct > 0 ? "+" : "";
      return `- ${change.project_name} / ${change.material_name}: ${formatCurrency(change.previous_unit_price, locale)} -> ${formatCurrency(change.unit_price, locale)} (${sign}${Math.round(pct * 100)}%)`;
    });

  const unsubscribeUrl = `${appUrl.replace(/\/$/, "")}/auth/unsubscribe/${encodeURIComponent(user.email_unsubscribe_token)}`;
  const subject =
    locale === "fi"
      ? "Helscoop: viikkokooste projektiesi aktiivisuudesta"
      : "Helscoop: weekly project activity digest";
  const body = [
    locale === "fi" ? `Hei ${user.name},` : `Hi ${user.name},`,
    "",
    locale === "fi" ? "Tässä viikon yhteenveto Helscoop-projekteistasi." : "Here is this week's Helscoop project activity summary.",
    "",
    locale === "fi" ? "Jaetut projektit:" : "Shared projects:",
    projectLines.length > 0 ? projectLines.join("\n") : locale === "fi" ? "- Ei katseluita tällä viikolla" : "- No views this week",
    "",
    locale === "fi" ? "Materiaalihintojen muutokset:" : "Material price changes:",
    priceLines.length > 0 ? priceLines.join("\n") : locale === "fi" ? "- Ei yli 5 % muutoksia" : "- No changes above 5%",
    "",
    locale === "fi" ? `Voit poistaa koosteet käytöstä: ${unsubscribeUrl}` : `Unsubscribe from digests: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject, body };
}

export async function collectWeeklyDigestUsers(): Promise<WeeklyDigestUser[]> {
  const users = await query(
    `SELECT id, email, name, email_unsubscribe_token, last_activity_digest_at
     FROM users
     WHERE email_notifications = true`,
  );

  const digests: WeeklyDigestUser[] = [];
  for (const user of users.rows) {
    const since = user.last_activity_digest_at || null;
    const projects = await query(
      `SELECT p.id, p.name, COUNT(pv.id)::int AS views
       FROM projects p
       LEFT JOIN project_views pv
         ON pv.project_id = p.id
        AND pv.viewed_at >= COALESCE($2::timestamptz, NOW() - INTERVAL '7 days')
       WHERE p.user_id = $1
       GROUP BY p.id, p.name
       HAVING COUNT(pv.id) > 0`,
      [user.id, since],
    );
    const priceChanges = await query(
      `SELECT p.id AS project_id, p.name AS project_name, m.name AS material_name,
              pr.previous_unit_price, pr.unit_price, s.name AS supplier_name
       FROM projects p
       JOIN project_bom pb ON pb.project_id = p.id
       JOIN materials m ON m.id = pb.material_id
       JOIN pricing pr ON pr.material_id = m.id AND pr.is_primary = true
       LEFT JOIN suppliers s ON s.id = pr.supplier_id
       WHERE p.user_id = $1
         AND pr.previous_unit_price IS NOT NULL
         AND pr.previous_unit_price > 0
         AND pr.updated_at >= COALESCE($2::timestamptz, NOW() - INTERVAL '7 days')
         AND ABS((pr.unit_price - pr.previous_unit_price) / pr.previous_unit_price) >= $3`,
      [user.id, since, PRICE_CHANGE_THRESHOLD],
    );

    const digest: WeeklyDigestUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      email_unsubscribe_token: user.email_unsubscribe_token,
      last_activity_digest_at: user.last_activity_digest_at,
      projects: projects.rows,
      priceChanges: priceChanges.rows,
    };
    if (digest.projects.length > 0 || digest.priceChanges.length > 0) digests.push(digest);
  }
  return digests;
}

export async function sendWeeklyActivityDigests(): Promise<number> {
  const users = await collectWeeklyDigestUsers();
  let sent = 0;
  for (const user of users) {
    const email = buildWeeklyDigestEmail(user);
    const ok = await sendEmail(user.email, email.subject, email.body);
    if (ok) {
      sent += 1;
      await query("UPDATE users SET last_activity_digest_at = NOW() WHERE id = $1", [user.id]);
    }
  }
  return sent;
}
