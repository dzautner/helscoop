import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AssemblyGuidePanel from "@/components/AssemblyGuidePanel";
import type { AssemblyGuide } from "@/lib/assembly-guide";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string, params?: Record<string, string | number>) => {
      if (params?.step && params?.title) return `${key}:${params.step}:${params.title}`;
      if (params?.current && params?.total) return `${key}:${params.current}/${params.total}`;
      return key;
    },
  }),
}));

const guide: AssemblyGuide = {
  totalMinutes: 75,
  totalCost: 300,
  steps: [
    {
      id: "step-1",
      index: 0,
      title: "Foundation: Slab",
      description: "Place the slab.",
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
          approxCost: 200,
          color: [0.5, 0.5, 0.5],
        },
      ],
      tools: ["level"],
      instructions: [
        { id: "prep", text: "Prepare", tip: "Check level", minutes: 10 },
      ],
      estimatedMinutes: 45,
      approxCost: 200,
      color: [0.5, 0.5, 0.5],
    },
    {
      id: "step-2",
      index: 1,
      title: "Lumber: Wall",
      description: "Place the wall.",
      category: "lumber",
      categoryLabel: "Lumber",
      layerIds: ["front_wall"],
      layerNames: ["Front Wall"],
      parts: [
        {
          materialId: "lumber",
          name: "C24 lumber",
          quantity: 12,
          unit: "m",
          approxCost: 100,
          color: [0.8, 0.6, 0.4],
        },
      ],
      tools: ["drill"],
      instructions: [
        { id: "place", text: "Place", tip: "Pre-drill", minutes: 20 },
      ],
      estimatedMinutes: 30,
      approxCost: 100,
      color: [0.8, 0.6, 0.4],
    },
  ],
};

describe("AssemblyGuidePanel", () => {
  it("renders active step parts, controls, and timeline", () => {
    render(
      <AssemblyGuidePanel
        guide={guide}
        activeStepIndex={0}
        completedStepIds={new Set()}
        playing={false}
        speed={1}
        onStepChange={vi.fn()}
        onToggleComplete={vi.fn()}
        onPlayingChange={vi.fn()}
        onSpeedChange={vi.fn()}
        onFocusStep={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("complementary", { name: "assemblyGuide.title" })).toBeInTheDocument();
    expect(screen.getByText("Foundation: Slab")).toBeInTheDocument();
    expect(screen.getByText("Concrete")).toBeInTheDocument();
    expect(screen.getByLabelText("assemblyGuide.jumpToStep:2:Lumber: Wall")).toBeInTheDocument();
  });

  it("calls step navigation, completion, focus, and playback handlers", () => {
    const onStepChange = vi.fn();
    const onToggleComplete = vi.fn();
    const onPlayingChange = vi.fn();
    const onFocusStep = vi.fn();

    render(
      <AssemblyGuidePanel
        guide={guide}
        activeStepIndex={0}
        completedStepIds={new Set()}
        playing={false}
        speed={1}
        onStepChange={onStepChange}
        onToggleComplete={onToggleComplete}
        onPlayingChange={onPlayingChange}
        onSpeedChange={vi.fn()}
        onFocusStep={onFocusStep}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("assemblyGuide.next"));
    expect(onStepChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByText("assemblyGuide.markDone"));
    expect(onToggleComplete).toHaveBeenCalledWith("step-1");

    fireEvent.click(screen.getByText("assemblyGuide.play"));
    expect(onPlayingChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByText("assemblyGuide.recenter"));
    expect(onFocusStep).toHaveBeenCalledWith(0);
  });
});
