import { Request, Response, NextFunction } from "express";
import { query } from "./db";

// ---------------------------------------------------------------------------
// Plan & feature type definitions
// ---------------------------------------------------------------------------

export type PlanTier = "free" | "pro" | "enterprise";

export type Feature =
  | "aiMessages"
  | "photoEstimate"
  | "quantityTakeoff"
  | "materialRecommendation"
  | "smartWizard"
  | "premiumExport"
  | "customMaterials"
  | "apiAccess";

export type CreditFeature =
  | "aiMessages"
  | "photoEstimate"
  | "quantityTakeoff"
  | "materialRecommendation"
  | "smartWizard";

export type CreditTransactionType = "grant" | "deduct" | "purchase" | "adjustment";

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  monthlyPrice: number; // EUR, 0 for free
  features: {
    maxProjects: number;         // -1 = unlimited
    aiMessagesPerDay: number;    // -1 = unlimited
    premiumExport: boolean;
    customMaterials: boolean;
    apiAccess: boolean;
  };
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  free: {
    tier: "free",
    name: "Ilmainen",
    monthlyPrice: 0,
    features: {
      maxProjects: 3,
      aiMessagesPerDay: 10,
      premiumExport: false,
      customMaterials: false,
      apiAccess: false,
    },
  },
  pro: {
    tier: "pro",
    name: "Pro",
    monthlyPrice: 19,
    features: {
      maxProjects: 20,
      aiMessagesPerDay: 100,
      premiumExport: true,
      customMaterials: true,
      apiAccess: false,
    },
  },
  enterprise: {
    tier: "enterprise",
    name: "Yritys",
    monthlyPrice: 49,
    features: {
      maxProjects: -1,
      aiMessagesPerDay: -1,
      premiumExport: true,
      customMaterials: true,
      apiAccess: true,
    },
  },
};

export const FREE_MONTHLY_CREDIT_GRANT = 20;
export const LOW_CREDIT_THRESHOLD = 5;

export const CREDIT_COSTS: Record<CreditFeature, number> = {
  aiMessages: 1,
  photoEstimate: 5,
  quantityTakeoff: 10,
  materialRecommendation: 2,
  smartWizard: 15,
};

export const CREDIT_PACKS = [
  { id: "credits_50", credits: 50, priceEur: 4.99, unitPriceEur: 0.10 },
  { id: "credits_200", credits: 200, priceEur: 14.99, unitPriceEur: 0.075, savingsPercent: 25 },
  { id: "credits_500", credits: 500, priceEur: 29.99, unitPriceEur: 0.06, savingsPercent: 40 },
] as const;

export type CreditPack = (typeof CREDIT_PACKS)[number];

// ---------------------------------------------------------------------------
// In-memory stores for credit ledger and admin overrides
// (Foundation layer — will be replaced by database tables later)
// ---------------------------------------------------------------------------

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  amount: number;
  type: CreditTransactionType;
  feature?: Feature;
  balanceAfter: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AdminOverrideEntry {
  userId: string;
  feature: Feature;
  allow: boolean;
  setBy: string;
  setAt: Date;
}

// Credit usage ledger fallback — records metered actions when DB tables have
// not been migrated in local/test environments.
const creditLedger: CreditLedgerEntry[] = [];
const creditBalances = new Map<string, number>();

// Admin overrides — keyed by `${userId}:${feature}`
const adminOverrides = new Map<string, AdminOverrideEntry>();

// ---------------------------------------------------------------------------
// Helpers to resolve a user's current plan
// ---------------------------------------------------------------------------

/**
 * Return the plan tier for a user. Admins always get enterprise-equivalent
 * access. Currently all users default to "free" until payment integration is
 * added. Reads the `plan_tier` column from users table when present.
 */
export async function getUserPlan(userId: string): Promise<PlanTier> {
  try {
    const result = await query(
      "SELECT plan_tier, role FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows.length === 0) return "free";
    const row = result.rows[0];
    // Admins get unlimited / enterprise tier
    if (row.role === "admin") return "enterprise";
    const tier = row.plan_tier as string | null;
    if (tier === "pro" || tier === "enterprise") return tier;
    return "free";
  } catch {
    // If plan_tier column doesn't exist yet (pre-migration), default to free
    return "free";
  }
}

// ---------------------------------------------------------------------------
// Credit / usage tracking
// ---------------------------------------------------------------------------

function memoryBalance(userId: string): number {
  return creditBalances.get(userId) ?? FREE_MONTHLY_CREDIT_GRANT;
}

function recordMemoryTransaction(
  userId: string,
  amount: number,
  type: CreditTransactionType,
  feature?: Feature,
  metadata?: Record<string, unknown>,
): CreditLedgerEntry {
  const balanceAfter = memoryBalance(userId) + amount;
  creditBalances.set(userId, balanceAfter);
  const entry: CreditLedgerEntry = {
    id: `mem-${Date.now()}-${creditLedger.length}`,
    userId,
    amount,
    type,
    feature,
    balanceAfter,
    timestamp: new Date(),
    metadata,
  };
  creditLedger.push(entry);
  return entry;
}

function rowToCreditEntry(row: {
  id: string;
  user_id: string;
  amount: number | string;
  type: CreditTransactionType;
  feature?: Feature | null;
  balance_after: number | string;
  created_at: string | Date;
  metadata?: Record<string, unknown> | null;
}): CreditLedgerEntry {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount),
    type: row.type,
    feature: row.feature ?? undefined,
    balanceAfter: Number(row.balance_after),
    timestamp: new Date(row.created_at),
    metadata: row.metadata ?? undefined,
  };
}

export function isCreditFeature(feature: string): feature is CreditFeature {
  return Object.prototype.hasOwnProperty.call(CREDIT_COSTS, feature);
}

export async function getCreditBalance(userId: string): Promise<number> {
  try {
    const result = await query("SELECT credit_balance FROM users WHERE id = $1", [userId]);
    if (result.rows.length > 0) return Number(result.rows[0].credit_balance ?? FREE_MONTHLY_CREDIT_GRANT);
  } catch {
    // Pre-migration/local fallback.
  }
  return memoryBalance(userId);
}

async function insertCreditTransaction(
  userId: string,
  amount: number,
  type: CreditTransactionType,
  balanceAfter: number,
  feature?: Feature,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await query(
    `INSERT INTO credit_transactions (user_id, amount, type, feature, balance_after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [userId, amount, type, feature ?? null, balanceAfter, JSON.stringify(metadata)],
  );
}

export async function ensureMonthlyCreditGrant(userId: string): Promise<void> {
  try {
    const existing = await query(
      `SELECT id FROM credit_transactions
       WHERE user_id = $1
         AND type = 'grant'
         AND metadata->>'reason' = 'monthly_free'
         AND created_at >= date_trunc('month', NOW())
       LIMIT 1`,
      [userId],
    );
    if (existing.rows.length > 0) return;

    const updated = await query(
      "UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance",
      [FREE_MONTHLY_CREDIT_GRANT, userId],
    );
    if (updated.rows.length === 0) return;
    await insertCreditTransaction(
      userId,
      FREE_MONTHLY_CREDIT_GRANT,
      "grant",
      Number(updated.rows[0].credit_balance),
      undefined,
      { reason: "monthly_free" },
    );
  } catch {
    // Avoid granting repeatedly in memory during tests; the default fallback
    // balance already represents the free monthly allowance.
  }
}

export async function getCreditState(userId: string) {
  await ensureMonthlyCreditGrant(userId);
  const balance = await getCreditBalance(userId);
  return {
    balance,
    lowCredit: balance <= LOW_CREDIT_THRESHOLD,
    monthlyGrant: FREE_MONTHLY_CREDIT_GRANT,
    lowCreditThreshold: LOW_CREDIT_THRESHOLD,
    costs: CREDIT_COSTS,
    packs: CREDIT_PACKS,
  };
}

export async function deductCreditsForFeature(
  userId: string,
  feature: CreditFeature,
  metadata: Record<string, unknown> = {},
): Promise<{ ok: true; entry: CreditLedgerEntry } | { ok: false; balance: number; cost: number }> {
  const cost = CREDIT_COSTS[feature];

  try {
    await ensureMonthlyCreditGrant(userId);

    const updated = await query(
      `UPDATE users
       SET credit_balance = credit_balance - $1
       WHERE id = $2 AND credit_balance >= $1
       RETURNING credit_balance`,
      [cost, userId],
    );

    if (updated.rows.length > 0) {
      const balanceAfter = Number(updated.rows[0].credit_balance);
      try {
        await insertCreditTransaction(userId, -cost, "deduct", balanceAfter, feature, metadata);
      } catch {
        // The balance update is authoritative. Do not fall back to memory and
        // risk reporting/deducting a second synthetic transaction.
      }
      return {
        ok: true,
        entry: {
          id: "db",
          userId,
          amount: -cost,
          type: "deduct",
          feature,
          balanceAfter,
          timestamp: new Date(),
          metadata,
        },
      };
    }

    const balanceResult = await query("SELECT credit_balance FROM users WHERE id = $1", [userId]);
    if (balanceResult.rows.length > 0) {
      return {
        ok: false,
        balance: Number(balanceResult.rows[0].credit_balance ?? 0),
        cost,
      };
    }
  } catch {
    // Pre-migration/local fallback below.
  }

  const balance = memoryBalance(userId);
  if (balance < cost) return { ok: false, balance, cost };
  const entry = recordMemoryTransaction(userId, -cost, "deduct", feature, metadata);
  return { ok: true, entry };
}

export async function grantPurchasedCredits(
  userId: string,
  packId: string,
  metadata: Record<string, unknown> = {},
): Promise<CreditLedgerEntry> {
  const pack = CREDIT_PACKS.find((candidate) => candidate.id === packId);
  if (!pack) throw new Error("Unknown credit pack");

  try {
    const updated = await query(
      "UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2 RETURNING credit_balance",
      [pack.credits, userId],
    );
    if (updated.rows.length > 0) {
      const balanceAfter = Number(updated.rows[0].credit_balance);
      const transactionMetadata = { packId, priceEur: pack.priceEur, ...metadata };
      try {
        await insertCreditTransaction(userId, pack.credits, "purchase", balanceAfter, undefined, transactionMetadata);
      } catch {
        // The balance update is authoritative. Avoid in-memory fallback after
        // DB mutation because that would hide duplicate/ledger failures.
      }
      return {
        id: "db",
        userId,
        amount: pack.credits,
        type: "purchase",
        balanceAfter,
        timestamp: new Date(),
        metadata: transactionMetadata,
      };
    }
  } catch {
    // Pre-migration/local fallback below.
  }

  return recordMemoryTransaction(userId, pack.credits, "purchase", undefined, {
    packId,
    priceEur: pack.priceEur,
    ...metadata,
  });
}

/**
 * Return how many AI chat messages the user has sent today (UTC day).
 * Checks in-memory ledger first, then falls back to database.
 */
export async function getDailyAiMessageCount(userId: string): Promise<number> {
  // Count from in-memory ledger for today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const inMemoryCount = creditLedger.filter(
    (e) =>
      e.userId === userId &&
      e.feature === "aiMessages" &&
      e.timestamp >= todayStart
  ).length;

  if (inMemoryCount > 0) return inMemoryCount;

  // Fall back to database
  try {
    const result = await query(
      `SELECT COUNT(*) AS cnt
       FROM ai_message_log
       WHERE user_id = $1
         AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
      [userId]
    );
    return parseInt(result.rows[0]?.cnt ?? "0", 10);
  } catch {
    return 0;
  }
}

/**
 * Record one AI chat message for a user.
 * Writes to both the in-memory ledger and the database.
 */
export async function recordAiMessage(userId: string): Promise<void> {
  recordMemoryTransaction(userId, -CREDIT_COSTS.aiMessages, "deduct", "aiMessages");

  try {
    await query(
      "INSERT INTO ai_message_log (user_id) VALUES ($1)",
      [userId]
    );
  } catch {
    // table doesn't exist yet — in-memory record is sufficient
  }
}

/**
 * Return the remaining quota for a feature, or null if unlimited.
 */
export async function getUserQuota(
  userId: string,
  feature: Feature
): Promise<{ used: number; limit: number; remaining: number | null }> {
  if (isCreditFeature(feature)) {
    const balance = await getCreditBalance(userId);
    const cost = CREDIT_COSTS[feature];
    return {
      used: 0,
      limit: cost,
      remaining: Math.floor(balance / cost),
    };
  }

  const tier = await getUserPlan(userId);
  const plan = PLANS[tier];

  const allowed = isFeatureAllowed(plan, feature);
  return {
    used: 0,
    limit: allowed ? -1 : 0,
    remaining: allowed ? null : 0,
  };
}

/**
 * Return the full credit usage history for a user.
 */
export async function getUsageHistory(userId: string): Promise<CreditLedgerEntry[]> {
  try {
    const result = await query(
      `SELECT id, user_id, amount, type, feature, balance_after, metadata, created_at
       FROM credit_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId],
    );
    if (result.rows.length > 0) return result.rows.map(rowToCreditEntry);
  } catch {
    // Pre-migration/local fallback.
  }
  return creditLedger.filter((e) => e.userId === userId);
}

// ---------------------------------------------------------------------------
// Admin override helpers
// ---------------------------------------------------------------------------

/**
 * Set or remove an admin override for a specific user and feature.
 */
export function adminOverride(
  userId: string,
  feature: Feature,
  allow: boolean,
  adminId: string
): AdminOverrideEntry {
  const key = `${userId}:${feature}`;
  const entry: AdminOverrideEntry = {
    userId,
    feature,
    allow,
    setBy: adminId,
    setAt: new Date(),
  };
  adminOverrides.set(key, entry);
  return entry;
}

/**
 * Check whether a user has an active admin override that unlocks a specific
 * feature. Checks in-memory overrides first, then falls back to DB.
 */
export async function hasAdminOverride(
  userId: string,
  feature: string
): Promise<boolean> {
  // Check in-memory overrides first
  const key = `${userId}:${feature}`;
  const memOverride = adminOverrides.get(key);
  if (memOverride !== undefined) return memOverride.allow;

  // Fall back to database
  try {
    const result = await query(
      `SELECT 1 FROM plan_overrides
       WHERE user_id = $1
         AND feature = $2
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [userId, feature]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Return all active admin overrides for a given user.
 */
export function getAdminOverrides(userId: string): AdminOverrideEntry[] {
  const entries: AdminOverrideEntry[] = [];
  for (const [key, entry] of adminOverrides) {
    if (key.startsWith(`${userId}:`)) {
      entries.push(entry);
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Core entitlement check — used as Express middleware factory
// ---------------------------------------------------------------------------

export interface EntitlementDeniedBody {
  error: "upgrade_required";
  plan: PlanTier;       // minimum plan that unlocks this feature
  feature: string;
  currentPlan: PlanTier;
}

export interface InsufficientCreditsBody {
  error: "insufficient_credits";
  feature: CreditFeature;
  cost: number;
  balance: number;
  packs: typeof CREDIT_PACKS;
}

/**
 * Check whether a plan allows a boolean feature.
 */
function isFeatureAllowed(plan: PlanConfig, feature: string): boolean {
  switch (feature) {
    case "premiumExport":
      return plan.features.premiumExport;
    case "customMaterials":
      return plan.features.customMaterials;
    case "apiAccess":
      return plan.features.apiAccess;
    default:
      return true; // Unknown features fail open
  }
}

/**
 * Returns an Express middleware that checks whether the authenticated user is
 * allowed to use `feature`. Call after `requireAuth` so that `req.user` is set.
 *
 * For boolean features the check is straightforward.
 * For metered features (`aiMessages`) the daily quota is enforced.
 *
 * A 403 with { error: "upgrade_required" } is returned when access is denied.
 *
 * Composable: `router.post("/", checkEntitlement("aiMessages"), handler)`
 */
export function checkEntitlement(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userId = req.user.id;
    const currentPlan = await getUserPlan(userId);
    const planConfig = PLANS[currentPlan];

    // Check admin override first — overrides bypass all plan gates
    const overridden = await hasAdminOverride(userId, feature);
    if (overridden) return next();

    const deny = (requiredPlan: PlanTier): Response =>
      res.status(403).json({
        error: "upgrade_required",
        plan: requiredPlan,
        feature,
        currentPlan,
      } satisfies EntitlementDeniedBody);

    switch (feature) {
      case "premiumExport": {
        if (!planConfig.features.premiumExport) {
          const required = lowestPlanWith((f) => f.premiumExport);
          return deny(required);
        }
        break;
      }

      case "customMaterials": {
        if (!planConfig.features.customMaterials) {
          const required = lowestPlanWith((f) => f.customMaterials);
          return deny(required);
        }
        break;
      }

      case "apiAccess": {
        if (!planConfig.features.apiAccess) {
          const required = lowestPlanWith((f) => f.apiAccess);
          return deny(required);
        }
        break;
      }

      case "aiMessages": {
        const limit = planConfig.features.aiMessagesPerDay;
        if (limit === -1) break; // unlimited
        const used = await getDailyAiMessageCount(userId);
        if (used >= limit) {
          const required = lowestPlanWith(
            (f) => f.aiMessagesPerDay > limit || f.aiMessagesPerDay === -1
          );
          return deny(required);
        }
        // Attach usage context for post-request recording
        (req as Request & { _entitlementFeature?: string }).
          _entitlementFeature = "aiMessages";
        break;
      }

      // Unknown feature — allow by default (fail open so new features aren't
      // accidentally blocked before they are wired up)
      default:
        break;
    }

    next();
  };
}

export function checkCredits(feature: CreditFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    await ensureMonthlyCreditGrant(req.user.id);
    const balance = await getCreditBalance(req.user.id);
    const cost = CREDIT_COSTS[feature];
    if (balance < cost) {
      return res.status(402).json({
        error: "insufficient_credits",
        feature,
        cost,
        balance,
        packs: CREDIT_PACKS,
      } satisfies InsufficientCreditsBody);
    }

    next();
  };
}

/**
 * Find the lowest (cheapest) plan tier whose features satisfy `predicate`.
 * Returns "enterprise" as a safe fallback.
 */
function lowestPlanWith(
  predicate: (features: PlanConfig["features"]) => boolean
): PlanTier {
  const order: PlanTier[] = ["free", "pro", "enterprise"];
  for (const tier of order) {
    if (predicate(PLANS[tier].features)) return tier;
  }
  return "enterprise";
}

// ---------------------------------------------------------------------------
// Test helpers (only used in test environment)
// ---------------------------------------------------------------------------
export function _resetStores(): void {
  creditLedger.length = 0;
  creditBalances.clear();
  adminOverrides.clear();
}
