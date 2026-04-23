import { describe, expect, it } from "vitest";
import {
  PHOTO_OVERLAY_DEFAULTS,
  clampNumber,
  coverRect,
  createPhotoOverlayState,
  normalizePhotoOverlayState,
} from "@/lib/photo-overlay";

describe("photo overlay helpers", () => {
  it("normalizes persisted overlay metadata and clamps alignment values", () => {
    const overlay = normalizePhotoOverlayState({
      data_url: "data:image/jpeg;base64,abc123",
      file_name: "front-house.jpg",
      opacity: 2,
      compare_mode: true,
      compare_position: 120,
      offset_x: -80,
      offset_y: 80,
      scale: 8,
      rotation: -90,
    });

    expect(overlay).toMatchObject({
      data_url: "data:image/jpeg;base64,abc123",
      file_name: "front-house.jpg",
      opacity: 1,
      compare_mode: true,
      compare_position: 100,
      offset_x: -50,
      offset_y: 50,
      scale: 2.5,
      rotation: -30,
    });
  });

  it("rejects unsupported persisted overlay URLs", () => {
    expect(normalizePhotoOverlayState({ data_url: "https://example.com/house.jpg" })).toBeNull();
    expect(normalizePhotoOverlayState(null)).toBeNull();
  });

  it("creates default overlay state for a compressed upload", () => {
    const overlay = createPhotoOverlayState("data:image/jpeg;base64,abc123", "house.png");
    expect(overlay).toMatchObject({
      data_url: "data:image/jpeg;base64,abc123",
      file_name: "house.png",
      ...PHOTO_OVERLAY_DEFAULTS,
    });
    expect(overlay.updated_at).toBeTruthy();
  });

  it("calculates cover draw dimensions for export compositing", () => {
    expect(coverRect(1000, 500, 500, 500, 1)).toEqual({
      width: 1000,
      height: 500,
      x: -500,
      y: -250,
    });
  });

  it("clamps invalid numbers to fallback", () => {
    expect(clampNumber("bad", 0, 10, 4)).toBe(4);
    expect(clampNumber(12, 0, 10, 4)).toBe(10);
    expect(clampNumber(-1, 0, 10, 4)).toBe(0);
  });
});
