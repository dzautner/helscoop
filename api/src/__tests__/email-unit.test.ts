import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendPriceAlertEmail,
} from "../email";

let consoleSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
const originalEnv = {
  APP_URL: process.env.APP_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
  NODE_ENV: process.env.NODE_ENV,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
};

beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.APP_URL = "https://app.helscoop.test";
  delete process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  restoreEnv("APP_URL", originalEnv.APP_URL);
  restoreEnv("EMAIL_FROM", originalEnv.EMAIL_FROM);
  restoreEnv("NODE_ENV", originalEnv.NODE_ENV);
  restoreEnv("RESEND_API_KEY", originalEnv.RESEND_API_KEY);
  vi.restoreAllMocks();
});

function restoreEnv(name: keyof typeof originalEnv, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function loggedOutput() {
  return [
    ...consoleSpy.mock.calls.flat().map(String),
    ...consoleErrorSpy.mock.calls.flat().map(String),
  ].join("\n");
}

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

  it("logs redacted metadata without the raw token", async () => {
    await sendPasswordResetEmail("user@example.com", "tok-abc");
    const output = loggedOutput();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Password reset"),
    );
    expect(output).toContain("us**@example.com");
    expect(output).toContain("token [redacted]");
    expect(output).not.toContain("tok-abc");
  });

  it("fails safe in production when no provider is configured", async () => {
    process.env.NODE_ENV = "production";
    const result = await sendPasswordResetEmail("user@example.com", "prod-reset-token");
    const output = loggedOutput();
    expect(result).toBe(false);
    expect(output).toContain("RESEND_API_KEY is not configured");
    expect(output).not.toContain("prod-reset-token");
  });
});

describe("sendVerificationEmail", () => {
  it("returns true", async () => {
    const result = await sendVerificationEmail("user@example.com", "verify-xyz");
    expect(result).toBe(true);
  });

  it("logs redacted metadata without the raw token", async () => {
    await sendVerificationEmail("new@example.com", "vrf-123");
    const output = loggedOutput();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Verification"),
    );
    expect(output).toContain("ne*@example.com");
    expect(output).toContain("token [redacted]");
    expect(output).not.toContain("vrf-123");
  });

  it("fails safe in production when no provider is configured", async () => {
    process.env.NODE_ENV = "production";
    const result = await sendVerificationEmail("new@example.com", "prod-verify-token");
    const output = loggedOutput();
    expect(result).toBe(false);
    expect(output).toContain("RESEND_API_KEY is not configured");
    expect(output).not.toContain("prod-verify-token");
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
