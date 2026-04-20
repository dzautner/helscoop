/**
 * Platform-aware keyboard shortcut label helpers.
 *
 * Uses the Mac modifier symbol (⌘) on macOS and "Ctrl" elsewhere so that
 * tooltip hints match what the user actually needs to press.
 */

let _isMac: boolean | null = null;

function isMac(): boolean {
  if (_isMac !== null) return _isMac;
  if (typeof navigator === "undefined") return false;
  // navigator.platform is deprecated but still widely supported;
  // navigator.userAgentData is the modern replacement but not universal.
  _isMac = /Mac|iPod|iPhone|iPad/.test(
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform ??
      ""
  );
  return _isMac;
}

/**
 * Return the platform-appropriate modifier key label.
 *
 * - macOS: "⌘"
 * - Other: "Ctrl"
 */
export function modKey(): string {
  return isMac() ? "⌘" : "Ctrl";
}

/**
 * Format a shortcut combo string like "Cmd+Shift+S" into a display label
 * using the correct platform modifier.
 *
 * Examples:
 *   shortcutLabel("Cmd+S")        → "⌘S" (Mac) / "Ctrl+S" (other)
 *   shortcutLabel("Cmd+Shift+Z")  → "⌘⇧Z" (Mac) / "Ctrl+Shift+Z" (other)
 *   shortcutLabel("Cmd+K")        → "⌘K" (Mac) / "Ctrl+K" (other)
 *   shortcutLabel("Escape")       → "Esc"
 *   shortcutLabel("Cmd+/")        → "⌘/" (Mac) / "Ctrl+/" (other)
 *   shortcutLabel("Cmd+Enter")    → "⌘↵" (Mac) / "Ctrl+Enter" (other)
 */
export function shortcutLabel(combo: string): string {
  const mac = isMac();
  const parts = combo.split("+");

  const hasMod = parts.includes("Cmd");
  const hasShift = parts.includes("Shift");
  // The "key" is the last part that isn't Cmd or Shift
  let key = parts.filter((p) => p !== "Cmd" && p !== "Shift").join("+") || "";

  if (key === "Escape") key = "Esc";

  if (mac) {
    const mod = hasMod ? "⌘" : "";
    const shift = hasShift ? "⇧" : "";
    const displayKey = key === "Enter" ? "↵" : key.toUpperCase();
    return `${mod}${shift}${displayKey}`;
  }

  const segments: string[] = [];
  if (hasMod) segments.push("Ctrl");
  if (hasShift) segments.push("Shift");
  segments.push(key);
  return segments.join("+");
}

/** Reset cached platform detection — only used in tests. */
export function _resetPlatformCache(): void {
  _isMac = null;
}
