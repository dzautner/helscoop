import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScenarioRenderPanel from "@/components/ScenarioRenderPanel";
import type { ViewportPresentationApi } from "@/components/Viewport3D";

const mockToast = vi.fn();
const mockTrack = vi.fn();

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({ locale: "en" }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

function makeCaptureApi() {
  const captureFrame = vi.fn((options?: { presetId?: string }) =>
    `data:image/png;base64,${options?.presetId ?? "current"}`,
  );
  const focusPreset = vi.fn();
  const ref = {
    current: {
      captureFrame,
      focusPreset,
    } satisfies ViewportPresentationApi,
  };
  return { ref, captureFrame, focusPreset };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ScenarioRenderPanel", () => {
  it("captures a four-view render set and tracks generation", async () => {
    const { ref, captureFrame, focusPreset } = makeCaptureApi();
    const onLightingPresetChange = vi.fn();

    render(
      <ScenarioRenderPanel
        projectId="proj-1"
        projectName="Kitchen"
        beforeImage="data:image/jpeg;base64,before"
        captureApiRef={ref}
        lightingPreset="default"
        onLightingPresetChange={onLightingPresetChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Generate render set" }));

    await waitFor(() => {
      expect(captureFrame).toHaveBeenCalledTimes(4);
    });

    expect(await screen.findByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Side")).toBeInTheDocument();
    expect(screen.getByText("Aerial")).toBeInTheDocument();
    expect(screen.getByText("Iso")).toBeInTheDocument();
    expect(screen.getByAltText("Before reference")).toBeInTheDocument();
    expect(screen.getByAltText("Rendered renovation scenario")).toBeInTheDocument();
    expect(mockTrack).toHaveBeenCalledWith("scenario_render_generated", expect.objectContaining({
      project_id: "proj-1",
      view_count: 4,
      has_before_image: true,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Side" }));
    expect(focusPreset).toHaveBeenCalledWith("side");
  });

  it("auto-generates when opened from the viewport toolbar", async () => {
    const { ref, captureFrame } = makeCaptureApi();

    render(
      <ScenarioRenderPanel
        projectId="proj-1"
        projectName="Kitchen"
        captureApiRef={ref}
        lightingPreset="winter"
        onLightingPresetChange={vi.fn()}
        onClose={vi.fn()}
        autoGenerateToken={1}
      />,
    );

    await waitFor(() => {
      expect(captureFrame).toHaveBeenCalledTimes(4);
    });
    expect(mockTrack).toHaveBeenCalledWith("scenario_render_generated", expect.objectContaining({
      source: "toolbar",
      lighting_preset: "winter",
    }));
    expect(screen.getByText(/Add a photo overlay/)).toBeInTheDocument();
  });
});
