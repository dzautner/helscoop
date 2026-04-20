import { Request, Response, NextFunction } from "express";
import { query } from "./db";

// ---------------------------------------------------------------------------
// Plan & feature type definitions
// ---------------------------------------------------------------------------

export type PlanTier = "free" | "pro" | "enterprise";

export type Feature =
  | "aiMessages"
  | "premiumExport"
  | "customMaterials"
  | "apiAccess";

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

// ---------------------------------------------------------------------------
// In-memory stores for credit ledger and admin overrides
// (Foundation layer — will be replaced by database tables later)
// ---------------------------------------------------------------------------

export interface CreditLedgerEntry {
  userId: string;
  feature: Feature;
  timestamp: Date;
}

export interface AdminOverrideEntry {
  userId: string;
  feature: Feature;
  allow: boolean;
  setBy: string;
  setAt: Date;
}

// Credit usage ledger — records every metered action
const creditLedger: CreditLedgerEntry[] = [];

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
  creditLedger.push({
    userId,
    feature: "aiMessages",
    timestamp: new Date(),
  });

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
  const tier = await getUserPlan(userId);
  const plan = PLANS[tier];

  switch (feature) {
    case "aiMessages": {
      const limit = plan.features.aiMessagesPerDay;
      const used = await getDailyAiMessageCount(userId);
      return {
        used,
        limit,
        remaining: limit === -1 ? null : Math.max(0, limit - used),
      };
    }
    default: {
      // Boolean features: check if allowed
      const allowed = isFeatureAllowed(plan, feature);
      return {
        used: 0,
        limit: allowed ? -1 : 0,
        remaining: allowed ? null : 0,
      };
    }
  }
}

/**
 * Return the full credit usage history for a user.
 */
export function getUsageHistory(userId: string): CreditLedgerEntry[] {
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
  adminOverrides.clear();
}
