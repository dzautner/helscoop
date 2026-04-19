"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";

export interface Command {
  /** Unique identifier */
  id: string;
  /** i18n key for the command label */
  labelKey: string;
  /** i18n key for the secondary (English) label shown below */
  labelSecondaryKey?: string;
  /** Keyboard shortcut display string, e.g. "Cmd+B" */
  shortcut?: string;
  /** SVG icon as JSX */
  icon?: React.ReactNode;
  /** Action to run when the command is selected */
  action: () => void;
}

/**
 * Detect whether the user is on macOS to show the correct modifier symbol.
 */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function formatShortcutDisplay(shortcut: string): string {
  const isMac = isMacPlatform();
  if (isMac) {
    return shortcut
      .replace("Cmd+Shift+", "\u2318\u21E7")
      .replace("Cmd+", "\u2318")
      .replace("Ctrl+", "\u2303")
      .replace("Enter", "\u23CE");
  }
  return shortcut.replace("Cmd+", "Ctrl+");
}

/**
 * Simple fuzzy match: all characters of the query must appear in order
 * in the target string. Returns a score (lower = better) or -1 for no match.
 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches
      score += ti - lastMatch === 1 ? 0 : ti - lastMatch;
      lastMatch = ti;
      qi++;
    }
  }

  return qi === q.length ? score : -1;
}

export default function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const { t, locale } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Filter + sort commands by fuzzy match
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;

    const results: { command: Command; score: number }[] = [];
    for (const cmd of commands) {
      const primary = t(cmd.labelKey);
      const secondary = cmd.labelSecondaryKey ? t(cmd.labelSecondaryKey) : "";
      const scorePrimary = fuzzyMatch(query, primary);
      const scoreSecondary = secondary ? fuzzyMatch(query, secondary) : -1;

      // Also match against the command id
      const scoreId = fuzzyMatch(query, cmd.id);

      const bestScore = Math.min(
        ...[scorePrimary, scoreSecondary, scoreId].filter((s) => s >= 0),
        Infinity
      );

      if (bestScore < Infinity) {
        results.push({ command: cmd, score: bestScore });
      }
    }

    results.sort((a, b) => a.score - b.score);
    return results.map((r) => r.command);
  }, [query, commands, t]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input on next frame
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-cmd-item]");
    const item = items[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const executeCommand = useCallback(
    (cmd: Command) => {
      onClose();
      // Delay action slightly so the palette closes first
      requestAnimationFrame(() => {
        cmd.action();
      });
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % Math.max(filtered.length, 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) =>
            i <= 0 ? Math.max(filtered.length - 1, 0) : i - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIndex]) {
            executeCommand(filtered[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, selectedIndex, executeCommand, onClose]
  );

  if (!open) return null;

  const isFi = locale === "fi";

  return (
    <div
      className="cmd-palette-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget || e.target === backdropRef.current) {
          onClose();
        }
      }}
    >
      <div className="cmd-palette-backdrop" ref={backdropRef} />
      <div
        className="cmd-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("commandPalette.title")}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="cmd-palette-input-wrap">
          <svg
            className="cmd-palette-search-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="cmd-palette-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commandPalette.placeholder")}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <kbd className="cmd-palette-esc">Esc</kbd>
        </div>

        {/* Command list */}
        <div className="cmd-palette-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="cmd-palette-empty">
              {t("commandPalette.noResults")}
            </div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              data-cmd-item
              className="cmd-palette-item"
              data-selected={i === selectedIndex}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => executeCommand(cmd)}
            >
              <div className="cmd-palette-item-left">
                {cmd.icon && (
                  <span className="cmd-palette-item-icon">{cmd.icon}</span>
                )}
                <div className="cmd-palette-item-labels">
                  <span className="cmd-palette-item-label">
                    {t(cmd.labelKey)}
                  </span>
                  {cmd.labelSecondaryKey && (
                    <span className="cmd-palette-item-label-secondary">
                      {isFi
                        ? t(cmd.labelSecondaryKey)
                        : t(cmd.labelKey)}
                    </span>
                  )}
                </div>
              </div>
              {cmd.shortcut && (
                <kbd className="cmd-palette-kbd">
                  {formatShortcutDisplay(cmd.shortcut)}
                </kbd>
              )}
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="cmd-palette-footer">
          <span>
            <kbd className="cmd-palette-footer-kbd">&uarr;&darr;</kbd>{" "}
            {t("commandPalette.navigate")}
          </span>
          <span>
            <kbd className="cmd-palette-footer-kbd">&crarr;</kbd>{" "}
            {t("commandPalette.execute")}
          </span>
          <span>
            <kbd className="cmd-palette-footer-kbd">Esc</kbd>{" "}
            {t("commandPalette.close")}
          </span>
        </div>
      </div>
    </div>
  );
}
