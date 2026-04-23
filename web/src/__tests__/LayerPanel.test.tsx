import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string, params?: Record<string, string | number>) =>
      params?.name ? `${key}:${params.name}` : key,
  }),
}));

import LayerPanel from "@/components/LayerPanel";
import type { SceneLayer } from "@/lib/scene-layers";

const layers: SceneLayer[] = [
  {
    id: "front_wall",
    objectId: "front_wall",
    materialId: "pine_48x98_c24",
    color: [1, 0, 0],
    meshCount: 1,
    name: "Front Wall",
    approxCost: 120,
  },
  {
    id: "roof_panel",
    objectId: "roof_panel",
    materialId: "metal_roof_sheet",
    color: [0, 0, 1],
    meshCount: 1,
    name: "Roof Panel",
    approxCost: 80,
  },
];

describe("LayerPanel", () => {
  it("renders scene layers", () => {
    render(
      <LayerPanel
        layers={layers}
        selectedLayerId="front_wall"
        hiddenLayerIds={new Set()}
        lockedLayerIds={new Set()}
        onSelectLayer={vi.fn()}
        onToggleLayerVisibility={vi.fn()}
        onToggleLayerLock={vi.fn()}
      />,
    );

    expect(screen.getByRole("listbox", { name: "layers.title" })).toBeInTheDocument();
    expect(screen.getByText("Front Wall")).toBeInTheDocument();
    expect(screen.getByText("Roof Panel")).toBeInTheDocument();
  });

  it("supports arrow navigation and keyboard shortcuts", () => {
    const onSelectLayer = vi.fn();
    const onToggleLayerVisibility = vi.fn();
    const onToggleLayerLock = vi.fn();
    const onOpenLayerMaterial = vi.fn();

    render(
      <LayerPanel
        layers={layers}
        selectedLayerId="front_wall"
        hiddenLayerIds={new Set()}
        lockedLayerIds={new Set()}
        onSelectLayer={onSelectLayer}
        onToggleLayerVisibility={onToggleLayerVisibility}
        onToggleLayerLock={onToggleLayerLock}
        onOpenLayerMaterial={onOpenLayerMaterial}
      />,
    );

    const listbox = screen.getByRole("listbox", { name: "layers.title" });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onSelectLayer).toHaveBeenCalledWith("roof_panel");

    fireEvent.keyDown(listbox, { key: "v" });
    expect(onToggleLayerVisibility).toHaveBeenCalledWith("front_wall");

    fireEvent.keyDown(listbox, { key: "l" });
    expect(onToggleLayerLock).toHaveBeenCalledWith("front_wall");

    fireEvent.keyDown(listbox, { key: "s" });
    expect(onToggleLayerVisibility).toHaveBeenCalledWith("front_wall", { solo: true });

    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onOpenLayerMaterial).toHaveBeenCalledWith("front_wall");
  });

  it("uses shift-click on the visibility button to solo a layer", () => {
    const onToggleLayerVisibility = vi.fn();

    render(
      <LayerPanel
        layers={layers}
        selectedLayerId="front_wall"
        hiddenLayerIds={new Set()}
        lockedLayerIds={new Set()}
        onSelectLayer={vi.fn()}
        onToggleLayerVisibility={onToggleLayerVisibility}
        onToggleLayerLock={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("layers.hideLayer:Front Wall"), { shiftKey: true });
    expect(onToggleLayerVisibility).toHaveBeenCalledWith("front_wall", { solo: true });
  });
});
