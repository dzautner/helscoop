import webPush from "web-push";
import { query } from "./db";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

let configured = false;

function configureWebPush(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:alerts@helscoop.fi",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!configureWebPush()) return 0;

  const subscriptions = await query(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = $1 AND enabled = true`,
    [userId],
  );

  let sent = 0;
  for (const sub of subscriptions.rows as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(payload),
      );
      sent += 1;
      await query(
        "UPDATE push_subscriptions SET last_success_at = now(), last_error_at = NULL, last_error = NULL, updated_at = now() WHERE id = $1",
        [sub.id],
      );
    } catch (err: unknown) {
      const statusCode = typeof err === "object" && err !== null && "statusCode" in err
        ? Number((err as { statusCode?: unknown }).statusCode)
        : 0;
      const disable = statusCode === 404 || statusCode === 410;
      const message = err instanceof Error ? err.message : "Push delivery failed";
      await query(
        `UPDATE push_subscriptions
         SET enabled = CASE WHEN $2::boolean THEN false ELSE enabled END,
             last_error_at = now(),
             last_error = $3,
             updated_at = now()
         WHERE id = $1`,
        [sub.id, disable, message.slice(0, 500)],
      );
    }
  }

  return sent;
}
