import { describe, expect, it } from "vitest";
import {
  buildConstructionTimelapse,
  buildTimelapseExportJson,
  buildTimelapseFrames,
  buildTimelapseSvg,
  elapsedSecondsForStep,
  formatTimelapseDuration,
  stepIndexAtTime,
} from "@/lib/construction-timelapse";
import type { AssemblyGuide } from "@/lib/assembly-guide";

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
    {
      id: "roof",
      index: 2,
      title: "Roofing: sheets",
      description: "Install roof.",
      category: "roofing",
      categoryLabel: "Roofing",
      layerIds: ["roof_panel"],
      layerNames: ["Roof Panel"],
      parts: [
        {
          materialId: "roofing",
          name: "Metal roof",
          quantity: 12,
          unit: "m2",
          approxCost: 50,
          color: [0.2, 0.4, 0.8],
        },
      ],
      tools: ["ladder"],
      instructions: [],
      estimatedMinutes: 90,
      approxCost: 50,
      color: [0.2, 0.4, 0.8],
    },
  ],
};

describe("construction-timelapse", () => {
  it("builds a scheduled timelapse plan from assembly steps", () => {
    const plan = buildConstructionTimelapse(guide);

    expect(plan.steps).toHaveLength(3);
    expect(plan.totalDays).toBe(2);
    expect(plan.weekendEstimate).toBe(1);
    expect(plan.totalSeconds).toBe(11);
    expect(plan.totalCost).toBe(400);
    expect(plan.steps.map((step) => step.scheduledDay)).toEqual(["Day 1", "Day 1-2", "Day 2"]);
    expect(plan.steps.map((step) => step.runningCost)).toEqual([100, 350, 400]);
    expect(plan.steps[1]).toMatchObject({
      materialCount: 1,
      layerIds: ["front_wall", "side_wall"],
      annotation: "Adding 24 m C24 lumber",
    });
  });

  it("maps elapsed playback time to the active step", () => {
    const plan = buildConstructionTimelapse(guide);

    expect(stepIndexAtTime(plan, 0)).toBe(0);
    expect(stepIndexAtTime(plan, 4.1)).toBe(1);
    expect(stepIndexAtTime(plan, 8.25)).toBe(2);
    expect(stepIndexAtTime(plan, 100)).toBe(2);
    expect(elapsedSecondsForStep(plan, 2)).toBe(8);
  });

  it("exports frame plans with accumulated visible layers", () => {
    const plan = buildConstructionTimelapse(guide);
    const frames = buildTimelapseFrames(plan, "cinematic", 2);

    expect(frames).toHaveLength(23);
    expect(frames[0]).toMatchObject({
      frame: 0,
      stepIndex: 0,
      cameraMode: "cinematic",
      visibleLayerIds: ["foundation_slab"],
    });
    expect(frames[frames.length - 1].visibleLayerIds).toEqual(["foundation_slab", "front_wall", "side_wall", "roof_panel"]);
    expect(frames[frames.length - 1].progress).toBe(1);

    const exported = JSON.parse(buildTimelapseExportJson(plan, "follow", 2));
    expect(exported.type).toBe("helscoop-construction-timelapse");
    expect(exported.cameraMode).toBe("follow");
    expect(exported.frames).toHaveLength(23);
  });

  it("exports an animated SVG storyboard", () => {
    const plan = buildConstructionTimelapse(guide);
    const svg = buildTimelapseSvg(plan, "orbit");

    expect(svg).toContain("<svg");
    expect(svg).toContain("Helscoop construction time-lapse");
    expect(svg).toContain("Foundation: slab");
    expect(svg).toContain("orbit camera");
  });

  it("formats short and long playback durations", () => {
    expect(formatTimelapseDuration(11)).toBe("11s");
    expect(formatTimelapseDuration(65)).toBe("1m 5s");
    expect(formatTimelapseDuration(120)).toBe("2m");
  });
});
