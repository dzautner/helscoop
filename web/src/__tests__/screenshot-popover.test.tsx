import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockToast = vi.fn();
let rafCallback: ((ts: number) => void) | null = null;

vi.stubGlobal("requestAnimationFrame", (cb: (ts: number) => void) => {
  rafCallback = cb;
  return 1;
});

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

import ScreenshotPopover from "@/components/ScreenshotPopover";

beforeEach(() => {
  vi.clearAllMocks();
  rafCallback = null;
});

function renderPopover(imageDataUrl: string | null = "data:image/png;base64,abc", onClose = vi.fn()) {
  const result = render(
    <ScreenshotPopover imageDataUrl={imageDataUrl} projectName="Test" onClose={onClose} />,
  );
  if (rafCallback) act(() => { rafCallback!(0); });
  return { ...result, onClose };
}

describe("ScreenshotPopover", () => {
  it("returns null when imageDataUrl is null", () => {
    const { container } = render(
      <ScreenshotPopover imageDataUrl={null} projectName="Test" onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when imageDataUrl is provided", () => {
    renderPopover();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-label on dialog", () => {
    renderPopover();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "screenshot.popoverLabel");
  });

  it("has aria-modal true", () => {
    renderPopover();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("renders preview image", () => {
    renderPopover();
    const img = screen.getByAltText("screenshot.previewAlt");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "data:image/png;base64,abc");
  });

  it("renders download button", () => {
    renderPopover();
    expect(screen.getByText("screenshot.download")).toBeInTheDocument();
  });

  it("renders copy button", () => {
    renderPopover();
    expect(screen.getByText("screenshot.copy")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    renderPopover("data:image/png;base64,abc", onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
