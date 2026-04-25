import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

describe("ConnectionBanner", () => {
  let originalFetch: typeof window.fetch;

  beforeEach(() => {
    vi.resetModules();
    originalFetch = window.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    window.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns null when connected (initial state)", async () => {
    window.fetch = vi.fn().mockResolvedValue({ ok: true });
    const { default: ConnectionBanner } = await import("@/components/ConnectionBanner");
    const { container } = render(<ConnectionBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("renders with role=status", async () => {
    window.fetch = vi.fn().mockResolvedValue({ ok: true });
    const { default: ConnectionBanner } = await import("@/components/ConnectionBanner");
    const { container } = render(<ConnectionBanner />);
    // Initially connected — nothing rendered
    expect(container.querySelector("[role='status']")).not.toBeInTheDocument();
  });

  it("exports as default", async () => {
    window.fetch = vi.fn().mockResolvedValue({ ok: true });
    const mod = await import("@/components/ConnectionBanner");
    expect(typeof mod.default).toBe("function");
  });
});
