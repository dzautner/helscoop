import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps, MutableRefObject } from "react";
import ArCameraOverlay, { type ArModification } from "@/components/ArCameraOverlay";
import type { ViewportPresentationApi } from "@/components/Viewport3D";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

const captureFrame = vi.fn(() => "data:image/png;base64,cGxhbm5lZA==");
const captureApiRef = {
  current: {
    captureFrame,
  } as unknown as ViewportPresentationApi,
} as MutableRefObject<ViewportPresentationApi | null>;

const modifications: ArModification[] = [
  { id: "wall", label: "Facade siding", kind: "wall", color: "rgba(228,182,92,0.34)" },
  { id: "roof", label: "Standing seam roof", kind: "roof", color: "rgba(108,157,120,0.32)" },
];

function renderOverlay(overrides: Partial<ComponentProps<typeof ArCameraOverlay>> = {}) {
  return render(
    <ArCameraOverlay
      open
      projectName="Test house"
      modifications={modifications}
      captureApiRef={captureApiRef}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});

describe("ArCameraOverlay", () => {
  it("renders the camera permission entry point and captures the current 3D view", () => {
    renderOverlay();

    expect(screen.getByRole("dialog", { name: "ar.title" })).toBeInTheDocument();
    expect(screen.getByText("ar.permissionCopy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ar.startCamera" })).toBeInTheDocument();
    expect(captureFrame).toHaveBeenCalledWith(expect.objectContaining({
      width: 1280,
      height: 720,
      presetId: "front",
      watermark: false,
    }));
  });

  it("shows a fallback when browser camera APIs are unavailable", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    renderOverlay();

    fireEvent.click(screen.getByRole("button", { name: "ar.startCamera" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ar.unsupported");
    expect(screen.getByText("ar.fallbackCopy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ar.backTo3d" })).toBeInTheDocument();
  });

  it("starts the environment camera and exposes modification toggles", async () => {
    const stopTrack = vi.fn();
    const stream = {
      getTracks: vi.fn(() => [{ stop: stopTrack }]),
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const onClose = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    renderOverlay({ onClose });

    fireEvent.click(screen.getByRole("button", { name: "ar.startCamera" }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: false,
      video: expect.objectContaining({ facingMode: { ideal: "environment" } }),
    })));
    expect(await screen.findByText("Facade siding")).toBeInTheDocument();
    expect(screen.getByText("Standing seam roof")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ar.showBefore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ar.screenshot" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("ar.close"));

    expect(stopTrack).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
