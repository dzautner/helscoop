import crypto from "crypto";
import { Router, Request, Response } from "express";
import { requireAuth } from "../auth";
import { query } from "../db";
import { requirePermission } from "../permissions";
import {
  PLANS,
  CREDIT_PACKS,
  CREDIT_COSTS,
  getUserPlan,
  getDailyAiMessageCount,
  getUserQuota,
  getUsageHistory,
  getCreditState,
  grantPurchasedCredits,
  adminOverride,
  getAdminOverrides,
  Feature,
  type CreditPack,
} from "../entitlements";

const router = Router();

// ---------------------------------------------------------------------------
// GET /entitlements/plans — public, no auth required
// Returns the available subscription plans and their features.
// ---------------------------------------------------------------------------
router.get("/plans", (_req, res) => {
  res.json(Object.values(PLANS));
});

// ---------------------------------------------------------------------------
// GET /entitlements — requires auth
// Returns the authenticated user's current plan, feature flags, and daily usage.
// ---------------------------------------------------------------------------
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const tier = await getUserPlan(userId);
  const plan = PLANS[tier];
  const dailyAiUsed = await getDailyAiMessageCount(userId);
  const credits = await getCreditState(userId);

  res.json({
    plan: tier,
    planConfig: plan,
    credits,
    usage: {
      aiMessagesToday: dailyAiUsed,
      aiMessagesLimit: plan.features.aiMessagesPerDay, // -1 = unlimited
      aiMessagesRemaining:
        plan.features.aiMessagesPerDay === -1
          ? null // null = unlimited
          : Math.max(0, plan.features.aiMessagesPerDay - dailyAiUsed),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /entitlements/usage — requires auth
// Returns the authenticated user's usage history (credit ledger).
// ---------------------------------------------------------------------------
router.get("/usage", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const history = await getUsageHistory(userId);
  const quota = await getUserQuota(userId, "aiMessages");

  res.json({
    quota,
    costs: CREDIT_COSTS,
    history: history.map((entry) => ({
      id: entry.id,
      feature: entry.feature,
      amount: entry.amount,
      type: entry.type,
      balanceAfter: entry.balanceAfter,
      metadata: entry.metadata,
      timestamp: entry.timestamp.toISOString(),
    })),
  });
});

// ---------------------------------------------------------------------------
interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  metadata?: Record<string, string | undefined>;
  payment_status?: string;
}

function appUrl(): string {
  return process.env.WEB_APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";
}

async function createStripeCheckoutSession(userId: string, pack: CreditPack): Promise<string> {
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("client_reference_id", userId);
  params.set("success_url", process.env.STRIPE_SUCCESS_URL || `${appUrl()}/?credits=success`);
  params.set("cancel_url", process.env.STRIPE_CANCEL_URL || `${appUrl()}/?credits=cancelled`);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "eur");
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(pack.priceEur * 100)));
  params.set("line_items[0][price_data][product_data][name]", `Helscoop ${pack.credits} AI credits`);
  params.set("line_items[0][price_data][product_data][description]", "Prepaid AI feature credits");
  params.set("metadata[userId]", userId);
  params.set("metadata[packId]", pack.id);
  params.set("metadata[credits]", String(pack.credits));
  params.set("payment_intent_data[metadata][userId]", userId);
  params.set("payment_intent_data[metadata][packId]", pack.id);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const body = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !body.url) {
    throw new Error(body.error?.message || "Failed to create Stripe Checkout session");
  }
  return body.url;
}

function verifyStripeSignature(payload: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function stripeSessionAlreadyGranted(sessionId: string): Promise<boolean> {
  try {
    const existing = await query(
      `SELECT id FROM credit_transactions
       WHERE type = 'purchase'
         AND metadata->>'stripeSessionId' = $1
       LIMIT 1`,
      [sessionId],
    );
    return existing.rows.length > 0;
  } catch {
    return false;
  }
}

export async function handleCreditCheckoutWebhook(req: Request, res: Response) {
  const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  if (!verifyStripeSignature(payload, req.headers["stripe-signature"] as string | undefined)) {
    return res.status(400).json({ error: "Invalid Stripe signature" });
  }

  const event = JSON.parse(payload.toString("utf8")) as {
    id: string;
    type: string;
    data?: { object?: StripeCheckoutSession };
  };

  if (event.type !== "checkout.session.completed") {
    return res.json({ received: true, ignored: true });
  }

  const session = event.data?.object;
  const userId = session?.metadata?.userId;
  const packId = session?.metadata?.packId;
  const pack = CREDIT_PACKS.find((candidate) => candidate.id === packId);
  if (!session?.id || !userId || !pack) {
    return res.status(400).json({ error: "Missing credit checkout metadata" });
  }

  if (await stripeSessionAlreadyGranted(session.id)) {
    return res.json({ received: true, duplicate: true });
  }

  await grantPurchasedCredits(userId, pack.id, {
    stripeSessionId: session.id,
    stripeEventId: event.id,
    paymentStatus: session.payment_status,
  });
  res.json({ received: true });
}

// ---------------------------------------------------------------------------
// POST /entitlements/credits/checkout — requires auth
// Creates a credit-pack checkout. Production uses Stripe Checkout when
// STRIPE_SECRET_KEY is set. Tests/local environments can use simulate=true to
// exercise post-payment credit grants without charging a card.
// ---------------------------------------------------------------------------
router.post("/credits/checkout", requireAuth, async (req, res) => {
  const { packId, simulate } = req.body as { packId?: string; simulate?: boolean };
  const pack = CREDIT_PACKS.find((candidate) => candidate.id === packId);
  if (!pack) return res.status(400).json({ error: "Invalid credit pack" });

  if (simulate === true && process.env.NODE_ENV !== "production") {
    const transaction = await grantPurchasedCredits(req.user!.id, pack.id, { simulated: true });
    return res.json({ pack, transaction, checkoutUrl: null, simulated: true });
  }

  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const checkoutUrl = await createStripeCheckoutSession(req.user!.id, pack);
      return res.json({ pack, checkoutUrl });
    } catch (err) {
      return res.status(502).json({
        error: "stripe_checkout_failed",
        message: err instanceof Error ? err.message : "Failed to create Stripe Checkout session",
        pack,
      });
    }
  }

  const baseUrl = process.env.CREDIT_CHECKOUT_URL;
  if (!baseUrl) {
    return res.status(501).json({
      error: "credit_checkout_not_configured",
      message: "Set STRIPE_SECRET_KEY or CREDIT_CHECKOUT_URL to sell credit packs.",
      pack,
    });
  }

  const checkoutUrl = new URL(baseUrl);
  checkoutUrl.searchParams.set("pack", pack.id);
  checkoutUrl.searchParams.set("credits", String(pack.credits));
  checkoutUrl.searchParams.set("user", req.user!.id);
  res.json({ pack, checkoutUrl: checkoutUrl.toString() });
});

// ---------------------------------------------------------------------------
// POST /entitlements/admin/override — admin only
// Set or revoke an admin override for a user/feature pair.
// Body: { userId: string, feature: Feature, allow: boolean }
// ---------------------------------------------------------------------------
router.post("/admin/override", requireAuth, requirePermission("admin:access"), (req, res) => {
  const { userId, feature, allow } = req.body;

  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "userId is required" });
  }
  if (!feature || typeof feature !== "string") {
    return res.status(400).json({ error: "feature is required" });
  }
  if (typeof allow !== "boolean") {
    return res.status(400).json({ error: "allow must be a boolean" });
  }

  const validFeatures: Feature[] = [
    "aiMessages",
    "photoEstimate",
    "quantityTakeoff",
    "materialRecommendation",
    "smartWizard",
    "premiumExport",
    "customMaterials",
    "apiAccess",
  ];
  if (!validFeatures.includes(feature as Feature)) {
    return res.status(400).json({
      error: `Invalid feature. Valid features: ${validFeatures.join(", ")}`,
    });
  }

  const entry = adminOverride(userId, feature as Feature, allow, req.user!.id);
  res.json({
    message: allow
      ? `Override granted: ${feature} enabled for user ${userId}`
      : `Override revoked: ${feature} disabled for user ${userId}`,
    override: entry,
  });
});

// ---------------------------------------------------------------------------
// GET /entitlements/admin/overrides/:userId — admin only
// List all active admin overrides for a user.
// ---------------------------------------------------------------------------
router.get(
  "/admin/overrides/:userId",
  requireAuth,
  requirePermission("admin:access"),
  (req, res) => {
    const overrides = getAdminOverrides(req.params.userId);
    res.json({ overrides });
  }
);

export default router;
