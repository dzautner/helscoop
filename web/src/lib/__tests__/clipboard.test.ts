import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyImageBlobToClipboard, copyTextToClipboard } from "@/lib/clipboard";

function setClipboard(value: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value,
  });
}

function setExecCommand(value: ((command: string) => boolean) | undefined) {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setClipboard(undefined);
  setExecCommand(undefined);
  vi.stubGlobal("ClipboardItem", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("clipboard helpers", () => {
  it("uses the async Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText } as Partial<Clipboard>);

    await expect(copyTextToClipboard("hello")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to a temporary textarea when writeText is blocked", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    const execCommand = vi.fn().mockReturnValue(true);
    setClipboard({ writeText } as Partial<Clipboard>);
    setExecCommand(execCommand);

    await expect(copyTextToClipboard("fallback")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("fallback");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false when no clipboard path is available", async () => {
    await expect(copyTextToClipboard("no api")).resolves.toBe(false);
  });

  it("copies image blobs when ClipboardItem and clipboard.write are available", async () => {
    class TestClipboardItem {
      constructor(readonly items: Record<string, Blob>) {}
    }
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    setClipboard({ write } as Partial<Clipboard>);

    const blob = new Blob(["png"], { type: "image/png" });
    await expect(copyImageBlobToClipboard(blob)).resolves.toBe(true);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0][0]).toBeInstanceOf(TestClipboardItem);
  });
});
