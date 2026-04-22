import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendPriceAlertEmail,
} from "../email";

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("sendEmail", () => {
  it("returns true", async () => {
    const result = await sendEmail("user@example.com", "Test", "Body");
    expect(result).toBe(true);
  });

  it("logs recipient and subject", async () => {
    await sendEmail("user@example.com", "Hello", "Body text");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("user@example.com"),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Hello"),
    );
  });

  it("logs attachment count when attachments provided", async () => {
    await sendEmail("user@example.com", "With attachment", "Body", [
      { filename: "file.pdf", content: "data", contentType: "application/pdf" },
    ]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 attachment"),
    );
  });

  it("does not mention attachments when none provided", async () => {
    await sendEmail("user@example.com", "Plain message", "Body");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.not.stringContaining("attachment"),
    );
  });

  it("handles multiple attachments", async () => {
    await sendEmail("user@example.com", "Multi", "Body", [
      { filename: "a.pdf", content: "a", contentType: "application/pdf" },
      { filename: "b.csv", content: "b", contentType: "text/csv" },
    ]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("2 attachment"),
    );
  });
});

describe("sendPasswordResetEmail", () => {
  it("returns true", async () => {
    const result = await sendPasswordResetEmail("user@example.com", "token123");
    expect(result).toBe(true);
  });

  it("logs email and token", async () => {
    await sendPasswordResetEmail("user@example.com", "tok-abc");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("user@example.com"),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("tok-abc"),
    );
  });
});

describe("sendVerificationEmail", () => {
  it("returns true", async () => {
    const result = await sendVerificationEmail("user@example.com", "verify-xyz");
    expect(result).toBe(true);
  });

  it("logs email and token", async () => {
    await sendVerificationEmail("new@example.com", "vrf-123");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("new@example.com"),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("vrf-123"),
    );
  });
});

describe("sendPriceAlertEmail", () => {
  it("returns true", async () => {
    const result = await sendPriceAlertEmail("user@example.com", { material: "wood" });
    expect(result).toBe(true);
  });

  it("logs email", async () => {
    await sendPriceAlertEmail("alert@example.com", {});
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("alert@example.com"),
    );
  });
});
