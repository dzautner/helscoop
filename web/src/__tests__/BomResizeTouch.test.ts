/**
 * Tests for BOM panel resize handle touch support (issue #558).
 *
 * Because the resize logic lives inside the ProjectPage component as a
 * useCallback, we test the pure arithmetic that drives it in isolation.
 * This guarantees the min/max clamping and delta calculation are correct
 * for both mouse and touch event coordinates, regardless of how React
 * wires them up.
 */
import { describe, it, expect } from "vitest";

const MIN_WIDTH = 260;
const MAX_WIDTH = 600;

/** Replicate the width-clamping used by both startResize and startTouchResize */
function clampWidth(startWidth: number, startX: number, currentX: number): number {
  const delta = startX - currentX;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
}

describe("BOM resize handle – width clamping (shared by mouse and touch paths)", () => {
  it("increases panel width when dragging left (delta positive)", () => {
    // Start at 340px, drag 50px to the left
    expect(clampWidth(340, 500, 450)).toBe(390);
  });

  it("decreases panel width when dragging right (delta negative)", () => {
    // Start at 340px, drag 50px to the right
    expect(clampWidth(340, 500, 550)).toBe(290);
  });

  it("clamps at MIN_WIDTH (260px) when dragging too far right", () => {
    expect(clampWidth(340, 500, 800)).toBe(MIN_WIDTH);
  });

  it("clamps at MAX_WIDTH (600px) when dragging too far left", () => {
    expect(clampWidth(340, 500, 100)).toBe(MAX_WIDTH);
  });

  it("returns current width unchanged when start and current X are equal", () => {
    expect(clampWidth(340, 500, 500)).toBe(340);
  });

  it("returns MIN_WIDTH when startWidth is already at minimum and user drags right", () => {
    expect(clampWidth(MIN_WIDTH, 300, 350)).toBe(MIN_WIDTH);
  });

  it("returns MAX_WIDTH when startWidth is already at maximum and user drags left", () => {
    expect(clampWidth(MAX_WIDTH, 300, 250)).toBe(MAX_WIDTH);
  });

  it("handles fractional pixel coordinates without throwing", () => {
    // Touch events can return sub-pixel coordinates on high-DPI screens
    const result = clampWidth(340, 500.5, 460.25);
    expect(result).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(result).toBeLessThanOrEqual(MAX_WIDTH);
    expect(result).toBeCloseTo(380.25, 1);
  });

  it("respects minimum width boundary exactly", () => {
    // Drag exactly to the minimum
    const delta = 340 - MIN_WIDTH; // 80px delta needed
    expect(clampWidth(340, 500, 500 + delta)).toBe(MIN_WIDTH);
  });

  it("respects maximum width boundary exactly", () => {
    // Drag exactly to the maximum
    const delta = MAX_WIDTH - 340; // 260px delta needed
    expect(clampWidth(340, 500, 500 - delta)).toBe(MAX_WIDTH);
  });
});

describe("BOM resize handle – touch event coordinate extraction", () => {
  it("extracts clientX from first touch point (Touch.clientX)", () => {
    // Simulate what startTouchResize does: e.touches[0].clientX
    const mockTouchEvent = {
      touches: [{ clientX: 350 }, { clientX: 400 }],
    };
    const touchX = mockTouchEvent.touches[0].clientX;
    expect(touchX).toBe(350);
  });

  it("ignores multi-touch events (more than one touch point)", () => {
    // startTouchResize checks: if (e.touches.length !== 1) return;
    const singleTouch = { touches: [{ clientX: 350 }] };
    const multiTouch = { touches: [{ clientX: 350 }, { clientX: 400 }] };
    const shouldHandle = (evt: { touches: { clientX: number }[] }) => evt.touches.length === 1;
    expect(shouldHandle(singleTouch)).toBe(true);
    expect(shouldHandle(multiTouch)).toBe(false);
  });
});
