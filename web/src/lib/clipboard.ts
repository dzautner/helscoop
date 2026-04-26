export async function copyTextToClipboard(text: string): Promise<boolean> {
  const clipboard = getNavigatorClipboard();

  if (clipboard && typeof clipboard.writeText === "function") {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea fallback below.
    }
  }

  return copyTextWithTextarea(text);
}

export async function copyImageBlobToClipboard(blob: Blob): Promise<boolean> {
  const clipboard = getNavigatorClipboard();

  if (
    !clipboard ||
    typeof clipboard.write !== "function" ||
    typeof ClipboardItem === "undefined"
  ) {
    return false;
  }

  try {
    await clipboard.write([
      new ClipboardItem({ [blob.type || "image/png"]: blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}

function getNavigatorClipboard(): Clipboard | undefined {
  if (typeof navigator === "undefined") return undefined;
  try {
    return navigator.clipboard;
  } catch {
    return undefined;
  }
}

function copyTextWithTextarea(text: string): boolean {
  if (
    typeof document === "undefined" ||
    !document.body ||
    typeof document.execCommand !== "function"
  ) {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";

  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  const selectedRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index))
    : [];

  document.body.appendChild(textarea);
  focusWithoutScroll(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    try {
      if (selection) {
        selection.removeAllRanges();
        selectedRanges.forEach((range) => selection.addRange(range));
      }
    } catch {
      // Restoring a stale selection can fail if the original node was removed.
    }
    if (activeElement) focusWithoutScroll(activeElement);
  }
}

function focusWithoutScroll(element: HTMLElement): void {
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}
