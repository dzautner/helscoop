import { describe, it, expect } from "vitest";
import {
  hashViewerIp,
  priceChangePercent,
  isDigestWorthyPriceChange,
  buildWeeklyDigestEmail,
} from "../notifications";
import type { WeeklyDigestUser, WeeklyDigestPriceChange } from "../notifications";

describe("hashViewerIp", () => {
  it("returns a hex string", () => {
    const hash = hashViewerIp("192.168.1.1");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces consistent hash for same IP", () => {
    const h1 = hashViewerIp("10.0.0.1");
    const h2 = hashViewerIp("10.0.0.1");
    expect(h1).toBe(h2);
  });

  it("produces different hash for different IPs", () => {
    const h1 = hashViewerIp("10.0.0.1");
    const h2 = hashViewerIp("10.0.0.2");
    expect(h1).not.toBe(h2);
  });

  it("handles null IP", () => {
    const hash = hashViewerIp(null);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles undefined IP", () => {
    const hash = hashViewerIp(undefined);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("priceChangePercent", () => {
  it("returns 0 for null previous", () => {
    expect(priceChangePercent(null, 10)).toBe(0);
  });

  it("returns 0 for zero previous", () => {
    expect(priceChangePercent(0, 10)).toBe(0);
  });

  it("computes positive change", () => {
    expect(priceChangePercent(10, 12)).toBeCloseTo(0.2);
  });

  it("computes negative change", () => {
    expect(priceChangePercent(10, 8)).toBeCloseTo(-0.2);
  });

  it("handles string inputs", () => {
    expect(priceChangePercent("10", "15")).toBeCloseTo(0.5);
  });

  it("returns 0 for null current", () => {
    expect(priceChangePercent(10, null)).toBe(0);
  });
});

describe("isDigestWorthyPriceChange", () => {
  it("returns true for 10% increase", () => {
    const change: WeeklyDigestPriceChange = {
      project_id: "p1",
      project_name: "Test",
      material_name: "Wood",
      previous_unit_price: 10,
      unit_price: 11,
    };
    expect(isDigestWorthyPriceChange(change)).toBe(true);
  });

  it("returns false for 2% change", () => {
    const change: WeeklyDigestPriceChange = {
      project_id: "p1",
      project_name: "Test",
      material_name: "Wood",
      previous_unit_price: 10,
      unit_price: 10.2,
    };
    expect(isDigestWorthyPriceChange(change)).toBe(false);
  });

  it("returns true for 5% decrease", () => {
    const change: WeeklyDigestPriceChange = {
      project_id: "p1",
      project_name: "Test",
      material_name: "Wood",
      previous_unit_price: 10,
      unit_price: 9.5,
    };
    expect(isDigestWorthyPriceChange(change)).toBe(true);
  });

  it("returns true for exactly 5% threshold", () => {
    const change: WeeklyDigestPriceChange = {
      project_id: "p1",
      project_name: "Test",
      material_name: "Wood",
      previous_unit_price: 100,
      unit_price: 105,
    };
    expect(isDigestWorthyPriceChange(change)).toBe(true);
  });
});

describe("buildWeeklyDigestEmail", () => {
  const baseUser: WeeklyDigestUser = {
    id: "u1",
    email: "test@example.com",
    name: "Testi",
    email_unsubscribe_token: "tok123",
    projects: [{ id: "p1", name: "Sauna", views: 5 }],
    priceChanges: [],
  };

  it("returns subject and body", () => {
    const result = buildWeeklyDigestEmail(baseUser);
    expect(result.subject).toBeTruthy();
    expect(result.body).toBeTruthy();
  });

  it("Finnish locale produces Finnish subject", () => {
    const user = { ...baseUser, locale: "fi" };
    const result = buildWeeklyDigestEmail(user);
    expect(result.subject).toContain("viikkokooste");
  });

  it("English locale produces English subject", () => {
    const user = { ...baseUser, locale: "en" };
    const result = buildWeeklyDigestEmail(user);
    expect(result.subject).toContain("weekly");
  });

  it("includes project views in body", () => {
    const result = buildWeeklyDigestEmail(baseUser);
    expect(result.body).toContain("Sauna");
    expect(result.body).toContain("5");
  });

  it("includes user name in greeting", () => {
    const result = buildWeeklyDigestEmail(baseUser);
    expect(result.body).toContain("Testi");
  });

  it("includes unsubscribe link", () => {
    const result = buildWeeklyDigestEmail(baseUser);
    expect(result.body).toContain("tok123");
    expect(result.body).toContain("unsubscribe");
  });

  it("shows no views message when no project views", () => {
    const user = { ...baseUser, projects: [{ id: "p1", name: "Sauna", views: 0 }] };
    const result = buildWeeklyDigestEmail(user);
    expect(result.body).toContain("Ei katseluita");
  });

  it("includes price changes above threshold", () => {
    const user: WeeklyDigestUser = {
      ...baseUser,
      priceChanges: [
        {
          project_id: "p1",
          project_name: "Sauna",
          material_name: "Pine",
          previous_unit_price: 10,
          unit_price: 12,
        },
      ],
    };
    const result = buildWeeklyDigestEmail(user);
    expect(result.body).toContain("Pine");
    expect(result.body).toContain("+20%");
  });

  it("uses custom app URL", () => {
    const result = buildWeeklyDigestEmail(baseUser, "https://custom.example.com");
    expect(result.body).toContain("custom.example.com");
  });
});
