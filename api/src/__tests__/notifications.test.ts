import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  query: vi.fn(),
  pool: { query: vi.fn() },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { query } from "../db";
import { sendEmail } from "../email";
import {
  buildWeeklyDigestEmail,
  hashViewerIp,
  isDigestWorthyPriceChange,
  logProjectView,
  priceChangePercent,
  sendWeeklyActivityDigests,
} from "../notifications";

const mockQuery = vi.mocked(query);
const mockSendEmail = vi.mocked(sendEmail);

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0, command: "", oid: 0, fields: [] } as never);
  mockSendEmail.mockResolvedValue(true);
});

describe("project activity notifications", () => {
  it("hashes viewer IPs deterministically without storing raw IPs", () => {
    const first = hashViewerIp("192.0.2.10");
    const second = hashViewerIp("192.0.2.10");
    expect(first).toBe(second);
    expect(first).not.toContain("192.0.2.10");
    expect(first).toHaveLength(64);
  });

  it("logs a project view through the one-hour dedupe insert", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "view-1" }] } as never);
    await expect(logProjectView("project-1", "192.0.2.10", "https://contractor.test")).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][0]).toContain("NOT EXISTS");
    expect(mockQuery.mock.calls[0][1]).toEqual([
      "project-1",
      hashViewerIp("192.0.2.10"),
      "https://contractor.test",
    ]);
  });

  it("calculates meaningful price changes at the 5 percent threshold", () => {
    expect(priceChangePercent(100, 109)).toBeCloseTo(0.09);
    expect(isDigestWorthyPriceChange({
      project_id: "p1",
      project_name: "House",
      material_name: "Pine",
      previous_unit_price: 100,
      unit_price: 104,
    })).toBe(false);
    expect(isDigestWorthyPriceChange({
      project_id: "p1",
      project_name: "House",
      material_name: "Pine",
      previous_unit_price: 100,
      unit_price: 95,
    })).toBe(true);
  });

  it("builds a bilingual weekly digest body with unsubscribe link", () => {
    const email = buildWeeklyDigestEmail({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      email_unsubscribe_token: "unsubscribe-token",
      locale: "en",
      projects: [{ id: "p1", name: "Garage", views: 3 }],
      priceChanges: [{
        project_id: "p1",
        project_name: "Garage",
        material_name: "Pine C24",
        previous_unit_price: 5,
        unit_price: 5.5,
      }],
    }, "https://helscoop.test");

    expect(email.subject).toContain("weekly");
    expect(email.body).toContain("Garage: viewed 3 times");
    expect(email.body).toContain("Pine C24");
    expect(email.body).toContain("https://helscoop.test/auth/unsubscribe/unsubscribe-token");
  });

  it("sends weekly digests only when activity exists", async () => {
    const lastDigest = "2026-04-14T09:00:00.000Z";
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "user-1", email: "owner@example.com", name: "Owner", email_unsubscribe_token: "token", last_activity_digest_at: lastDigest }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "p1", name: "Garage", views: 2 }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await expect(sendWeeklyActivityDigests()).resolves.toBe(1);
    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockQuery.mock.calls[1][1]).toEqual(["user-1", lastDigest]);
    expect(mockQuery.mock.calls[2][1]).toEqual(["user-1", lastDigest, 0.05]);
    expect(mockQuery.mock.calls.at(-1)?.[0]).toContain("last_activity_digest_at");
  });
});
