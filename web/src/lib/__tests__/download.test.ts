import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob, downloadDataUrl } from "@/lib/download";

describe("download helpers", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    document.body.innerHTML = "";
  });

  it("downloads data URLs with a temporary attached anchor", () => {
    let clickedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchor = this;
    });

    expect(downloadDataUrl("data:image/png;base64,abc", "scene.png")).toBe(true);

    expect(clickedAnchor).not.toBeNull();
    const anchor = clickedAnchor as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("scene.png");
    expect(anchor.href).toBe("data:image/png;base64,abc");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("keeps blob URLs alive long enough for browser download managers", () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:download"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    expect(downloadBlob(new Blob(["csv"], { type: "text/csv" }), "bom.csv")).toBe(true);

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
  });
});
