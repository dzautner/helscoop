import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ConstructionTimelapsePanel from "@/components/ConstructionTimelapsePanel";
import type { AssemblyGuide } from "@/lib/assembly-guide";

const mockTrack = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

const guide: AssemblyGuide = {
  totalMinutes: 510,
  totalCost: 400,
  steps: [
    {
      id: "foundation",
      index: 0,
      title: "Foundation: slab",
      description: "Pour slab.",
      category: "foundation",
      categoryLabel: "Foundation",
      layerIds: ["foundation_slab"],
      layerNames: ["Foundation Slab"],
      parts: [
        {
          materialId: "concrete",
          name: "Concrete",
          quantity: 2,
          unit: "m3",
          approxCost: 100,
          color: [0.5, 0.5, 0.5],
        },
      ],
      tools: ["level"],
      instructions: [],
      estimatedMinutes: 180,
      approxCost: 100,
      color: [0.5, 0.5, 0.5],
    },
    {
      id: "walls",
      index: 1,
      title: "Framing: walls",
      description: "Raise walls.",
      category: "framing",
      categoryLabel: "Framing",
      layerIds: ["front_wall", "side_wall"],
      layerNames: ["Front Wall", "Side Wall"],
      parts: [
        {
          materialId: "lumber",
          name: "C24 lumber",
          quantity: 24,
          unit: "m",
          approxCost: 250,
          color: [0.8, 0.6, 0.4],
        },
      ],
      tools: ["drill"],
      instructions: [],
      estimatedMinutes: 240,
      approxCost: 250,
      color: [0.8, 0.6, 0.4],
    },
  ],
};

let clickSpy: { mockRestore: () => void };
const createObjectURL = vi.fn(() => "blob:timelapse");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL,
    revokeObjectURL,
  });
});

afterEach(() => {
  clickSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("ConstructionTimelapsePanel", () => {
  it("renders the active scheduled step and timeline controls", () => {
    render(
      <ConstructionTimelapsePanel
        guide={guide}
        activeStepIndex={0}
        playing={false}
        speed={1}
        cameraMode="orbit"
        projectName="Demo House"
        onStepChange={vi.fn()}
        onPlayingChange={vi.fn()}
        onSpeedChange={vi.fn()}
        onCameraModeChange={vi.fn()}
        onFocusStep={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("complementary", { name: "timelapse.title" })).toBeInTheDocument();
    expect(screen.getByText("Day 1: Foundation: slab")).toBeInTheDocument();
    expect(screen.getByText("Adding 2 m3 Concrete")).toBeInTheDocument();
    expect(screen.getByLabelText("Day 1-2: Framing: walls")).toBeInTheDocument();
  });

  it("calls playback, scrub, camera, and focus handlers", () => {
    const onStepChange = vi.fn();
    const onPlayingChange = vi.fn();
    const onSpeedChange = vi.fn();
    const onCameraModeChange = vi.fn();
    const onFocusStep = vi.fn();

    render(
      <ConstructionTimelapsePanel
        guide={guide}
        activeStepIndex={0}
        playing={false}
        speed={1}
        cameraMode="orbit"
        projectName="Demo House"
        onStepChange={onStepChange}
        onPlayingChange={onPlayingChange}
        onSpeedChange={onSpeedChange}
        onCameraModeChange={onCameraModeChange}
        onFocusStep={onFocusStep}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("timelapse.scrub"), { target: { value: "1" } });
    expect(onStepChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByLabelText("timelapse.next"));
    expect(onStepChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByText("timelapse.play"));
    expect(onPlayingChange).toHaveBeenCalledWith(true);
    expect(mockTrack).toHaveBeenCalledWith("construction_timelapse_started", expect.objectContaining({
      project_name: "Demo House",
      step_count: 2,
      camera_mode: "orbit",
      speed: 1,
    }));

    fireEvent.click(screen.getByText("2x"));
    expect(onSpeedChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByText("Cinematic"));
    expect(onCameraModeChange).toHaveBeenCalledWith("cinematic");

    fireEvent.click(screen.getByText("timelapse.focus"));
    expect(onFocusStep).toHaveBeenCalledWith(0);
  });

  it("exports storyboard and frame-plan files with analytics", () => {
    render(
      <ConstructionTimelapsePanel
        guide={guide}
        activeStepIndex={0}
        playing={false}
        speed={1}
        cameraMode="follow"
        projectName="Demo House"
        onStepChange={vi.fn()}
        onPlayingChange={vi.fn()}
        onSpeedChange={vi.fn()}
        onCameraModeChange={vi.fn()}
        onFocusStep={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("timelapse.exportSvg"));
    fireEvent.click(screen.getByText("timelapse.exportJson"));

    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(mockTrack).toHaveBeenCalledWith("construction_timelapse_exported", expect.objectContaining({
      project_name: "Demo House",
      format: "svg",
      step_count: 2,
      camera_mode: "follow",
    }));
    expect(mockTrack).toHaveBeenCalledWith("construction_timelapse_exported", expect.objectContaining({
      project_name: "Demo House",
      format: "json",
      step_count: 2,
      camera_mode: "follow",
    }));
  });
});
