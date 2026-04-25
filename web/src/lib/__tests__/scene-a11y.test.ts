import { describe, expect, it } from "vitest";
import { countSceneAddCalls } from "@/lib/scene-a11y";

describe("scene accessibility helpers", () => {
  it("counts simple scene.add calls", () => {
    expect(countSceneAddCalls("scene.add(box(1, 1, 1));\nscene.add(box(2, 2, 2));")).toBe(2);
  });

  it("counts calls with whitespace around the dot and function", () => {
    expect(countSceneAddCalls("scene . add (box(1, 1, 1));")).toBe(1);
  });

  it("returns zero for empty or non-scene scripts", () => {
    expect(countSceneAddCalls("const wall = box(1, 2, 3);")).toBe(0);
  });
});
