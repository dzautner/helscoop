import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import BeforeAfterSharePanel from "@/components/BeforeAfterSharePanel";
import type { SharePreviewState } from "@/types";

const mockTrack = vi.fn();
const mockGetEntitlements = vi.fn();
const mockSaveSharePreview = vi.fn();
const mockWriteText = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars) return `${key}:${JSON.stringify(vars)}`;
      return key;
    },
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getEntitlements: (...args: unknown[]) => mockGetEntitlements(...args),
    saveSharePreview: (...args: unknown[]) => mockSaveSharePreview(...args),
  },
}));

const captureApiRef = {
  current: {
    focusPreset: vi.fn(),
    captureFrame: vi.fn(() => "data:image/png;base64,YWZ0ZXI="),
  },
};

const savedPreview: SharePreviewState = {
  kind: "before_after",
  before_image: "data:image/png;base64,YmVmb3Jl",
  after_image: "data:image/png;base64,YWZ0ZXI=",
  split: 50,
  preset_id: "iso",
  watermark: true,
  generated_at: "2026-04-25T00:00:00.000Z",
};

function renderPanel(overrides: Partial<ComponentProps<typeof BeforeAfterSharePanel>> = {}) {
  return render(
    <BeforeAfterSharePanel
      projectId="project-1"
      shareToken="share-token"
      projectName="Facade renovation"
      beforeImage="data:image/png;base64,YmVmb3Jl"
      captureApiRef={captureApiRef}
      onCopySuccess={vi.fn()}
      onCopyError={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mockWriteText },
  });
  mockWriteText.mockResolvedValue(undefined);
  mockGetEntitlements.mockResolvedValue({ planConfig: { features: { premiumExport: false } } });
  mockSaveSharePreview.mockResolvedValue({
    share_preview: savedPreview,
    share_token: "share-token",
    share_token_expires_at: "2999-01-01T00:00:00.000Z",
  });
});

describe("BeforeAfterSharePanel", () => {
  it("renders the social comparison controls", () => {
    renderPanel();

    expect(screen.getByLabelText("share.beforeAfterTitle")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "share.beforeAfterCamera" })).toBeInTheDocument();
    expect(screen.getByText("share.beforeAfterGenerate")).toBeInTheDocument();
    expect(screen.getByText("share.beforeAfterCopy")).toBeInTheDocument();
  });

  it("captures and saves a watermarked preview for free users", async () => {
    const onShareSaved = vi.fn();
    renderPanel({ onShareSaved });

    fireEvent.click(screen.getByText("share.beforeAfterGenerate"));

    await waitFor(() => expect(mockSaveSharePreview).toHaveBeenCalled());
    expect(captureApiRef.current.captureFrame).toHaveBeenCalledWith(expect.objectContaining({
      width: 1600,
      height: 900,
      watermark: true,
    }));
    expect(mockSaveSharePreview.mock.calls[0][0]).toBe("project-1");
    expect(mockSaveSharePreview.mock.calls[0][1]).toMatchObject({
      kind: "before_after",
      before_image: "data:image/png;base64,YmVmb3Jl",
      watermark: true,
    });
    expect(onShareSaved).toHaveBeenCalled();
  });

  it("copies the public /share comparison link after saving", async () => {
    renderPanel();

    fireEvent.click(screen.getByText("share.beforeAfterCopy"));

    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining("/share/share-token?compare=1")));
  });

  it("does not watermark Pro previews", async () => {
    mockGetEntitlements.mockResolvedValueOnce({ planConfig: { features: { premiumExport: true } } });
    renderPanel();

    await screen.findByText("share.watermarkPro");
    fireEvent.click(screen.getByText("share.beforeAfterGenerate"));

    await waitFor(() => expect(mockSaveSharePreview).toHaveBeenCalled());
    expect(captureApiRef.current.captureFrame).toHaveBeenCalledWith(expect.objectContaining({ watermark: false }));
  });
});
