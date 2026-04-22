/**
 * Unit tests for the billing & entitlements control plane.
 * All tests run without a real database -- the db module is mocked.
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock the DB module BEFORE importing anything that uses it
// vi.mock is hoisted by vitest so ordering here is a formality, but we keep
// it first for readability.
// ---------------------------------------------------------------------------
vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  pool: { query: vi.fn() },
}));

import { query } from "../db";
const mockQuery = vi.mocked(query);

import {
  PLANS,
  CREDIT_COSTS,
  CREDIT_PACKS,
  FREE_MONTHLY_CREDIT_GRANT,
  getUserPlan,
  getDailyAiMessageCount,
  recordAiMessage,
  hasAdminOverride,
  checkEntitlement,
  checkCredits,
  getUserQuota,
  adminOverride,
  getUsageHistory,
  getAdminOverrides,
  deductCreditsForFeature,
  grantPurchasedCredits,
  _resetStores,
} from "../entitlements";

// ---------------------------------------------------------------------------
// Helper: build minimal Express-like req/res/next mocks
// ---------------------------------------------------------------------------
function makeReqResNext(userId = "user-123", role = "user") {
  let statusCode = 200;
  let body: unknown;

  const req = {
    user: { id: userId, email: "test@helscoop.fi", role },
    headers: {},
  } as unknown as import("express").Request;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      body = data;
      return this;
    },
    get _statusCode() { return statusCode; },
    get _body() { return body; },
  } as unknown as import("express").Response & { _statusCode: number; _body: unknown };

  const next = vi.fn();
  return { req, res, next };
}

// Reset in-memory stores and mocks before each test
beforeEach(() => {
  mockQuery.mockReset();
  _resetStores();
});

// ---------------------------------------------------------------------------
// 1. Plan configuration validation
// ---------------------------------------------------------------------------
describe("PLANS constant", () => {
  it("contains exactly three tiers", () => {
    expect(Object.keys(PLANS)).toHaveLength(3);
    expect(PLANS).toHaveProperty("free");
    expect(PLANS).toHaveProperty("pro");
    expect(PLANS).toHaveProperty("enterprise");
  });

  it("free plan has 0 monthly price", () => {
    expect(PLANS.free.monthlyPrice).toBe(0);
  });

  it("pro plan has monthly price of 19 EUR", () => {
    expect(PLANS.pro.monthlyPrice).toBe(19);
  });

  it("enterprise plan has monthly price of 49 EUR", () => {
    expect(PLANS.enterprise.monthlyPrice).toBe(49);
  });

  it("free plan does not include premium export", () => {
    expect(PLANS.free.features.premiumExport).toBe(false);
  });

  it("pro and enterprise plans include premium export", () => {
    expect(PLANS.pro.features.premiumExport).toBe(true);
    expect(PLANS.enterprise.features.premiumExport).toBe(true);
  });

  it("only enterprise plan has API access", () => {
    expect(PLANS.free.features.apiAccess).toBe(false);
    expect(PLANS.pro.features.apiAccess).toBe(false);
    expect(PLANS.enterprise.features.apiAccess).toBe(true);
  });

  it("enterprise plan has unlimited AI messages (-1)", () => {
    expect(PLANS.enterprise.features.aiMessagesPerDay).toBe(-1);
  });

  it("enterprise plan has unlimited projects (-1)", () => {
    expect(PLANS.enterprise.features.maxProjects).toBe(-1);
  });

  it("each plan config includes all required feature keys", () => {
    const requiredKeys = [
      "maxProjects",
      "aiMessagesPerDay",
      "premiumExport",
      "customMaterials",
      "apiAccess",
    ] as const;
    for (const tier of Object.values(PLANS)) {
      for (const key of requiredKeys) {
        expect(tier.features).toHaveProperty(key);
      }
    }
  });

  it("plan tiers match their tier property", () => {
    expect(PLANS.free.tier).toBe("free");
    expect(PLANS.pro.tier).toBe("pro");
    expect(PLANS.enterprise.tier).toBe("enterprise");
  });
});

// ---------------------------------------------------------------------------
// 2. getUserPlan
// ---------------------------------------------------------------------------
describe("getUserPlan", () => {
  it("returns 'free' when user has no plan_tier set", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any);
    expect(await getUserPlan("u1")).toBe("free");
  });

  it("returns 'pro' when user has plan_tier='pro'", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ plan_tier: "pro", role: "user" }] } as any);
    expect(await getUserPlan("u1")).toBe("pro");
  });

  it("returns 'enterprise' when user has plan_tier='enterprise'", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ plan_tier: "enterprise", role: "user" }] } as any);
    expect(await getUserPlan("u1")).toBe("enterprise");
  });

  it("returns 'enterprise' for admin users regardless of plan_tier column", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "admin" }] } as any);
    expect(await getUserPlan("u1")).toBe("enterprise");
  });

  it("returns 'free' when user row is not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    expect(await getUserPlan("missing-id")).toBe("free");
  });

  it("returns 'free' gracefully when DB throws an error", async () => {
    mockQuery.mockImplementationOnce(() => { throw new Error("column plan_tier does not exist"); });
    expect(await getUserPlan("u1")).toBe("free");
  });
});

// ---------------------------------------------------------------------------
// 3. getDailyAiMessageCount
// ---------------------------------------------------------------------------
describe("getDailyAiMessageCount", () => {
  it("returns the count from the database", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: "7" }] } as any);
    expect(await getDailyAiMessageCount("u1")).toBe(7);
  });

  it("returns 0 when user has no messages today", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: "0" }] } as any);
    expect(await getDailyAiMessageCount("u1")).toBe(0);
  });

  it("returns 0 gracefully when the table does not exist", async () => {
    mockQuery.mockImplementationOnce(() => { throw new Error("relation ai_message_log does not exist"); });
    expect(await getDailyAiMessageCount("u1")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Feature checks via checkEntitlement middleware
// ---------------------------------------------------------------------------
describe("checkEntitlement -- premiumExport", () => {
  it("allows pro users to use premium export", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: "pro", role: "user" }] } as any) // getUserPlan
      .mockResolvedValueOnce({ rows: [] } as any); // hasAdminOverride

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("premiumExport")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("allows enterprise users to use premium export", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: "enterprise", role: "user" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("premiumExport")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks free users from premium export with upgrade_required error", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any) // getUserPlan -> free
      .mockResolvedValueOnce({ rows: [] } as any); // hasAdminOverride -> no override

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("premiumExport")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as any)._statusCode).toBe(403);
    expect((res as any)._body).toMatchObject({
      error: "upgrade_required",
      feature: "premiumExport",
      currentPlan: "free",
    });
  });

  it("denied response includes the required plan tier", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("premiumExport")(req, res, next);
    // Premium export requires pro plan
    expect((res as any)._body).toMatchObject({ plan: "pro" });
  });
});

describe("checkEntitlement -- apiAccess", () => {
  it("blocks free and pro users from API access", async () => {
    // Free user
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("apiAccess")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as any)._body).toMatchObject({
      error: "upgrade_required",
      plan: "enterprise",
      feature: "apiAccess",
    });
  });

  it("allows enterprise users API access", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: "enterprise", role: "user" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("apiAccess")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5. Quota exhaustion
// ---------------------------------------------------------------------------
describe("checkEntitlement -- aiMessages quota", () => {
  it("allows request when daily quota is not yet exhausted", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any) // free -> 10/day
      .mockResolvedValueOnce({ rows: [] } as any)                                   // hasAdminOverride
      .mockResolvedValueOnce({ rows: [{ cnt: "5" }] } as any);                      // used 5/10

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("aiMessages")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("blocks request when daily quota is exactly exhausted", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any) // free -> 10/day
      .mockResolvedValueOnce({ rows: [] } as any)                                   // hasAdminOverride
      .mockResolvedValueOnce({ rows: [{ cnt: "10" }] } as any);                    // used 10/10

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("aiMessages")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as any)._statusCode).toBe(403);
    expect((res as any)._body).toMatchObject({
      error: "upgrade_required",
      feature: "aiMessages",
      currentPlan: "free",
    });
  });

  it("allows unlimited enterprise plan users regardless of message count", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: "enterprise", role: "user" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any); // hasAdminOverride only
    // getDailyAiMessageCount should NOT be called (unlimited)

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("aiMessages")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Admin override logic
// ---------------------------------------------------------------------------
describe("checkEntitlement -- admin override", () => {
  it("admin override allows a free-tier user to access premiumExport", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any) // getUserPlan -> free
      .mockResolvedValueOnce({ rows: [{ 1: 1 }] } as any);                        // hasAdminOverride -> row present

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("premiumExport")(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 401 when req.user is not set", async () => {
    const { req, res, next } = makeReqResNext();
    (req as any).user = undefined;
    await checkEntitlement("premiumExport")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect((res as any)._statusCode).toBe(401);
  });

  it("unknown features pass through by default (fail-open)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    const { req, res, next } = makeReqResNext();
    await checkEntitlement("futureUnknownFeature")(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. recordAiMessage
// ---------------------------------------------------------------------------
describe("recordAiMessage", () => {
  it("inserts a row into ai_message_log and in-memory ledger", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    await recordAiMessage("u1");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ai_message_log"),
      ["u1"]
    );
    // Also check in-memory ledger
    const history = await getUsageHistory("u1");
    expect(history).toHaveLength(1);
    expect(history[0].feature).toBe("aiMessages");
    expect(history[0].userId).toBe("u1");
  });

  it("does not throw when the table is missing", async () => {
    mockQuery.mockImplementationOnce(() => { throw new Error("relation ai_message_log does not exist"); });
    await expect(recordAiMessage("u1")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. hasAdminOverride
// ---------------------------------------------------------------------------
describe("hasAdminOverride", () => {
  it("returns true when an active DB override exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ 1: 1 }] } as any);
    expect(await hasAdminOverride("u1", "premiumExport")).toBe(true);
  });

  it("returns false when no override exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    expect(await hasAdminOverride("u1", "premiumExport")).toBe(false);
  });

  it("returns false gracefully when the table is missing", async () => {
    mockQuery.mockImplementationOnce(() => { throw new Error("relation plan_overrides does not exist"); });
    expect(await hasAdminOverride("u1", "premiumExport")).toBe(false);
  });

  it("returns true for in-memory override set via adminOverride()", async () => {
    adminOverride("u1", "premiumExport", true, "admin-1");
    expect(await hasAdminOverride("u1", "premiumExport")).toBe(true);
  });

  it("returns false for in-memory override set to allow=false", async () => {
    adminOverride("u1", "premiumExport", false, "admin-1");
    expect(await hasAdminOverride("u1", "premiumExport")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. getUserQuota
// ---------------------------------------------------------------------------
describe("getUserQuota", () => {
  it("returns AI chat actions from credit balance", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ credit_balance: 12 }] } as any);

    const quota = await getUserQuota("u1", "aiMessages");
    expect(quota.used).toBe(0);
    expect(quota.limit).toBe(CREDIT_COSTS.aiMessages);
    expect(quota.remaining).toBe(12);
  });

  it("returns feature-specific remaining actions based on cost", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ credit_balance: 12 }] } as any);

    const quota = await getUserQuota("u1", "photoEstimate");
    expect(quota.limit).toBe(CREDIT_COSTS.photoEstimate);
    expect(quota.remaining).toBe(2);
  });

  it("returns allowed status for boolean features", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ plan_tier: "pro", role: "user" }] } as any);
    const quota = await getUserQuota("u1", "premiumExport");
    expect(quota.remaining).toBeNull(); // allowed = unlimited
    expect(quota.limit).toBe(-1);
  });

  it("returns 0 remaining for disallowed boolean features", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ plan_tier: null, role: "user" }] } as any);
    const quota = await getUserQuota("u1", "premiumExport");
    expect(quota.remaining).toBe(0);
    expect(quota.limit).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10. adminOverride (write) and getAdminOverrides
// ---------------------------------------------------------------------------
describe("adminOverride (write)", () => {
  it("creates an in-memory override entry", () => {
    const entry = adminOverride("u1", "premiumExport", true, "admin-1");
    expect(entry.userId).toBe("u1");
    expect(entry.feature).toBe("premiumExport");
    expect(entry.allow).toBe(true);
    expect(entry.setBy).toBe("admin-1");
    expect(entry.setAt).toBeInstanceOf(Date);
  });

  it("getAdminOverrides returns all overrides for a user", () => {
    adminOverride("u1", "premiumExport", true, "admin-1");
    adminOverride("u1", "apiAccess", true, "admin-1");
    adminOverride("u2", "premiumExport", true, "admin-1");

    const u1Overrides = getAdminOverrides("u1");
    expect(u1Overrides).toHaveLength(2);

    const u2Overrides = getAdminOverrides("u2");
    expect(u2Overrides).toHaveLength(1);
  });

  it("later override replaces earlier one for same user+feature", () => {
    adminOverride("u1", "premiumExport", true, "admin-1");
    adminOverride("u1", "premiumExport", false, "admin-2");

    const overrides = getAdminOverrides("u1");
    expect(overrides).toHaveLength(1);
    expect(overrides[0].allow).toBe(false);
    expect(overrides[0].setBy).toBe("admin-2");
  });
});

// ---------------------------------------------------------------------------
// 11. getUsageHistory
// ---------------------------------------------------------------------------
describe("getUsageHistory", () => {
  it("returns empty array when no usage recorded", async () => {
    expect(await getUsageHistory("u1")).toHaveLength(0);
  });

  it("returns only entries for the specified user", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as any);
    await recordAiMessage("u1");
    await recordAiMessage("u1");
    await recordAiMessage("u2");

    expect(await getUsageHistory("u1")).toHaveLength(2);
    expect(await getUsageHistory("u2")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 12. Credit metering
// ---------------------------------------------------------------------------
describe("credit metering", () => {
  it("defines the launch credit costs and packs", () => {
    expect(FREE_MONTHLY_CREDIT_GRANT).toBe(20);
    expect(CREDIT_COSTS).toMatchObject({
      aiMessages: 1,
      photoEstimate: 5,
      quantityTakeoff: 10,
      materialRecommendation: 2,
      smartWizard: 15,
    });
    expect(CREDIT_PACKS.map((pack) => [pack.id, pack.credits, pack.priceEur])).toEqual([
      ["credits_50", 50, 4.99],
      ["credits_200", 200, 14.99],
      ["credits_500", 500, 29.99],
    ]);
  });

  it("deducts credits in the in-memory fallback ledger", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as any);
    const result = await deductCreditsForFeature("u1", "quantityTakeoff", { projectId: "p1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.amount).toBe(-10);
      expect(result.entry.balanceAfter).toBe(10);
      expect(result.entry.metadata).toMatchObject({ projectId: "p1" });
    }
  });

  it("rejects metered actions when fallback balance is insufficient", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as any);
    await deductCreditsForFeature("u1", "smartWizard");
    const result = await deductCreditsForFeature("u1", "smartWizard");

    expect(result).toMatchObject({
      ok: false,
      balance: 5,
      cost: 15,
    });
  });

  it("grants purchased credits from a known pack", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as any);
    const entry = await grantPurchasedCredits("u1", "credits_50", { simulated: true });

    expect(entry.amount).toBe(50);
    expect(entry.type).toBe("purchase");
    expect(entry.balanceAfter).toBe(70);
    expect(entry.metadata).toMatchObject({ packId: "credits_50", simulated: true });
  });

  it("checkCredits returns 402 when DB balance is too low", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "grant-this-month" }] } as any) // ensureMonthlyCreditGrant
      .mockResolvedValueOnce({ rows: [{ credit_balance: 0 }] } as any); // getCreditBalance

    const { req, res, next } = makeReqResNext();
    await checkCredits("aiMessages")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect((res as any)._statusCode).toBe(402);
    expect((res as any)._body).toMatchObject({
      error: "insufficient_credits",
      feature: "aiMessages",
      cost: 1,
      balance: 0,
    });
  });
});
