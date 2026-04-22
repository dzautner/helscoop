import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  query: vi.fn(),
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("../push", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(1),
}));

import { query } from "../db";
import { sendEmail } from "../email";
import { sendPushToUser } from "../push";
import {
  notifyPriceWatchers,
  priceDropPercent,
  shouldTriggerPriceWatch,
} from "../price-alerts";

const mockQuery = vi.mocked(query);
const mockSendEmail = vi.mocked(sendEmail);
const mockSendPush = vi.mocked(sendPushToUser);

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0, command: "", oid: 0, fields: [] } as never);
});

describe("price alerts", () => {
  it("calculates price drop percentage only for decreases", () => {
    expect(priceDropPercent(100, 80)).toBeCloseTo(0.2);
    expect(priceDropPercent(100, 120)).toBe(0);
    expect(priceDropPercent(0, 10)).toBe(0);
  });

  it("triggers on any decrease or target price hit", () => {
    expect(shouldTriggerPriceWatch({
      previousUnitPrice: 10,
      unitPrice: 9.5,
      watchAnyDecrease: true,
    })).toBe(true);
    expect(shouldTriggerPriceWatch({
      previousUnitPrice: 10,
      unitPrice: 9.8,
      targetPrice: 9.9,
      watchAnyDecrease: false,
    })).toBe(true);
    expect(shouldTriggerPriceWatch({
      previousUnitPrice: 10,
      unitPrice: 10.2,
      targetPrice: 9.9,
      watchAnyDecrease: true,
    })).toBe(false);
  });

  it("creates notification, email, and push records for matching watches", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "watch-1",
          user_id: "user-1",
          project_id: "project-1",
          material_id: "pine",
          target_price: null,
          watch_any_decrease: true,
          notify_email: true,
          notify_push: true,
          email: "owner@example.com",
          name: "Owner",
          email_notifications: true,
          price_alert_email_frequency: "daily",
          push_notifications: true,
          project_name: "Sauna",
          material_name: "Pine",
          supplier_name: "K-Rauta",
        }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ id: "notification-1" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await expect(notifyPriceWatchers({
      materialId: "pine",
      supplierId: "k-rauta",
      previousUnitPrice: 10,
      unitPrice: 8,
      source: "test",
    })).resolves.toBe(1);

    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO notifications");
    expect(mockSendEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.stringContaining("Pine"),
      expect.stringContaining("10,00 EUR -> 8,00 EUR"),
    );
    expect(mockSendPush).toHaveBeenCalledWith("user-1", expect.objectContaining({
      title: expect.stringContaining("Pine"),
      url: "/project/project-1",
    }));
  });
});
