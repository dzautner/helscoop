import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileEditorTabs from "@/components/MobileEditorTabs";

function renderTabs(onSwipe = vi.fn()) {
  render(
    <MobileEditorTabs
      active="viewport"
      ariaLabel="Editor mobile panels"
      onChange={vi.fn()}
      onSwipe={onSwipe}
      tabs={[
        { id: "viewport", label: "Scene" },
        { id: "chat", label: "Chat", badge: 2 },
        { id: "bom", label: "Materials" },
      ]}
    />
  );
  return screen.getByRole("tablist", { name: "Editor mobile panels" });
}

describe("MobileEditorTabs swipe gestures", () => {
  it("reports horizontal swipes", () => {
    const onSwipe = vi.fn();
    const tablist = renderTabs(onSwipe);

    fireEvent.touchStart(tablist, { touches: [{ clientX: 180, clientY: 40 }] });
    fireEvent.touchEnd(tablist, { changedTouches: [{ clientX: 80, clientY: 45 }] });

    expect(onSwipe).toHaveBeenCalledWith("left");
  });

  it("reports vertical swipes", () => {
    const onSwipe = vi.fn();
    const tablist = renderTabs(onSwipe);

    fireEvent.touchStart(tablist, { touches: [{ clientX: 80, clientY: 160 }] });
    fireEvent.touchEnd(tablist, { changedTouches: [{ clientX: 84, clientY: 80 }] });

    expect(onSwipe).toHaveBeenCalledWith("up");
  });

  it("ignores small accidental touch movement", () => {
    const onSwipe = vi.fn();
    const tablist = renderTabs(onSwipe);

    fireEvent.touchStart(tablist, { touches: [{ clientX: 80, clientY: 80 }] });
    fireEvent.touchEnd(tablist, { changedTouches: [{ clientX: 95, clientY: 90 }] });

    expect(onSwipe).not.toHaveBeenCalled();
  });
});
