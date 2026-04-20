import { Router } from "express";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";
import {
  PLANS,
  getUserPlan,
  getDailyAiMessageCount,
  getUserQuota,
  getUsageHistory,
  adminOverride,
  getAdminOverrides,
  Feature,
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

  res.json({
    plan: tier,
    planConfig: plan,
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
  const history = getUsageHistory(userId);
  const quota = await getUserQuota(userId, "aiMessages");

  res.json({
    quota,
    history: history.map((entry) => ({
      feature: entry.feature,
      timestamp: entry.timestamp.toISOString(),
    })),
  });
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
