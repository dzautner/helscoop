"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import SceneAutocomplete, {
  type AutocompleteItem,
  getAutocompleteContext,
  filterCompletions,
} from "@/components/SceneAutocomplete";

/* ── Find / Replace helpers ──────────────────────────────────────── */
interface FindMatch {
  start: number;
  end: number;
}

function findAllMatches(text: string, query: string): FindMatch[] {
  if (!query) return [];
  const matches: FindMatch[] = [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length });
  }
  return matches;
}

/* ── Syntax highlighting colours (CSS custom properties with fallbacks) ── */
const COLORS = {
  primitive: "var(--syntax-primitive, #e5a04b)",
  transform: "var(--syntax-transform, #7ab3e0)",
  boolean:   "var(--syntax-boolean, #8bc48b)",
  sceneAdd:  "var(--syntax-scene-add, #f0b86a)",
  number:    "var(--syntax-number, #d4a0e0)",
  comment:   "var(--syntax-comment, #5a5a64)",
  string:    "var(--syntax-string, #c4a06e)",
  keyword:   "var(--syntax-keyword, #e5a04b)",
  default:   "var(--syntax-default, #9a9aa6)",
};

/* ── Token types & patterns ──────────────────────────────────────── */
type TokenKind = keyof typeof COLORS;

const TOKEN_RULES: [RegExp, TokenKind][] = [
  [/\/\/[^\n]*/,                                            "comment"],
  [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/, "string"],
  [/scene\.add/,                                            "sceneAdd"],
  [/\b(?:box|cylinder|sphere)\b/,                           "primitive"],
  [/\b(?:translate|rotate|scale)\b/,                        "transform"],
  [/\b(?:union|subtract|intersect)\b/,                      "boolean"],
  [/\b(?:const|let|var|function|return|if|else|for|while|new|true|false|null)\b/, "keyword"],
  [/\b\d+(?:\.\d+)?\b/,                                    "number"],
];

/* Build a single combined regex with named groups */
function buildCombinedRegex(): RegExp {
  const parts = TOKEN_RULES.map(([re, kind], i) => `(?<_${kind}_${i}>${re.source})`);
  return new RegExp(parts.join("|"), "g");
}

const COMBINED_RE = buildCombinedRegex();

/** Tokenise a line of code into spans of coloured HTML. */
function highlightLine(line: string): string {
  const result: string[] = [];
  let lastIndex = 0;

  COMBINED_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = COMBINED_RE.exec(line)) !== null) {
    // Push plain text before this match
    if (match.index > lastIndex) {
      result.push(escapeHtml(line.slice(lastIndex, match.index)));
    }

    // Determine which group matched
    let kind: TokenKind = "default";
    if (match.groups) {
      for (const key of Object.keys(match.groups)) {
        if (match.groups[key] !== undefined) {
          // key format: _kind_index – extract the kind portion
          kind = key.split("_")[1] as TokenKind;
          break;
        }
      }
    }

    const color = COLORS[kind] || COLORS.default;
    result.push(`<span style="color:${color}">${escapeHtml(match[0])}</span>`);
    lastIndex = match.index + match[0].length;
  }

  // Trailing plain text
  if (lastIndex < line.length) {
    result.push(escapeHtml(line.slice(lastIndex)));
  }

  // Ensure empty lines still take up space
  return result.length === 0 ? "\n" : result.join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const EDITOR_FONT_SIZE = 13;
const EDITOR_LINE_HEIGHT = Math.round(EDITOR_FONT_SIZE * 1.7 * 10) / 10;
const EDITOR_PADDING_TOP = 20;

/* ── Component ───────────────────────────────────────────────────── */
export default function SceneEditor({
  sceneJs,
  onChange,
  error,
  errorLine,
  materials,
}: {
  sceneJs: string;
  onChange: (code: string) => void;
  /** Current scene error message, or null when valid. */
  error?: string | null;
  /** 1-based line number of the error in the script, or null. */
  errorLine?: number | null;
  materials?: { id: string; name: string }[];
}) {
  const { t } = useTranslation();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [cursorLine, setCursorLine] = useState<number>(0);
  const [isFocused, setIsFocused] = useState(false);

  /* ── Find / Replace state ────────────────────────────────────── */
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  /* ── Autocomplete state ──────────────────────────────────────── */
  const [acItems, setAcItems] = useState<AutocompleteItem[]>([]);
  const [acIndex, setAcIndex] = useState(0);
  const [acPosition, setAcPosition] = useState({ top: 0, left: 0 });
  const acVisible = acItems.length > 0;

  const dismissAutocomplete = useCallback(() => {
    setAcItems([]);
    setAcIndex(0);
  }, []);

  const updateAutocomplete = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || !document.activeElement || document.activeElement !== ta) {
      dismissAutocomplete();
      return;
    }
    const cursor = ta.selectionStart;
    const ctx = getAutocompleteContext(ta.value, cursor);
    const items = filterCompletions(ctx, materials);
    if (items.length === 0) {
      dismissAutocomplete();
      return;
    }
    const before = ta.value.slice(0, cursor);
    const linesBefore = before.split("\n");
    const line = linesBefore.length - 1;
    const col = linesBefore[linesBefore.length - 1].length;
    const charWidth = 7.8;
    setAcPosition({
      top: (line + 1) * EDITOR_LINE_HEIGHT + EDITOR_PADDING_TOP - ta.scrollTop,
      left: col * charWidth + 20,
    });
    setAcItems(items);
    setAcIndex((prev) => Math.min(prev, items.length - 1));
  }, [materials, dismissAutocomplete]);

  const acceptCompletion = useCallback((item: AutocompleteItem) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const ctx = getAutocompleteContext(ta.value, cursor);
    const newValue = ta.value.slice(0, ctx.startPos) + item.insertText + ta.value.slice(cursor);
    onChange(newValue);
    const newCursor = ctx.startPos + item.insertText.length;
    dismissAutocomplete();
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = newCursor;
      ta.focus();
    }, 0);
  }, [onChange, dismissAutocomplete]);

  const findMatches = useMemo(() => findAllMatches(sceneJs, findQuery), [sceneJs, findQuery]);

  // Clamp currentMatchIdx when matches change
  useEffect(() => {
    if (findMatches.length === 0) {
      setCurrentMatchIdx(0);
    } else if (currentMatchIdx >= findMatches.length) {
      setCurrentMatchIdx(0);
    }
  }, [findMatches.length, currentMatchIdx]);

  const openFindReplace = useCallback(() => {
    setShowFindReplace(true);
    setTimeout(() => findInputRef.current?.focus(), 0);
  }, []);

  const closeFindReplace = useCallback(() => {
    setShowFindReplace(false);
    setFindQuery("");
    setReplaceValue("");
    setCurrentMatchIdx(0);
    textareaRef.current?.focus();
  }, []);

  const goToNextMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev + 1) % findMatches.length);
  }, [findMatches.length]);

  const goToPrevMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    setCurrentMatchIdx((prev) => (prev - 1 + findMatches.length) % findMatches.length);
  }, [findMatches.length]);

  const replaceCurrent = useCallback(() => {
    if (findMatches.length === 0 || !findQuery) return;
    const match = findMatches[currentMatchIdx];
    if (!match) return;
    const newCode = sceneJs.slice(0, match.start) + replaceValue + sceneJs.slice(match.end);
    onChange(newCode);
    // After replacement the match at currentMatchIdx is gone; keep index clamped
    if (currentMatchIdx >= findMatches.length - 1 && currentMatchIdx > 0) {
      setCurrentMatchIdx(currentMatchIdx - 1);
    }
  }, [findMatches, currentMatchIdx, findQuery, replaceValue, sceneJs, onChange]);

  const replaceAll = useCallback(() => {
    if (findMatches.length === 0 || !findQuery) return;
    const escaped = findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    onChange(sceneJs.replace(re, replaceValue));
    setCurrentMatchIdx(0);
  }, [findMatches.length, findQuery, replaceValue, sceneJs, onChange]);

  /* ── Scroll sync ──────────────────────────────────────────────── */
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (overlayRef.current) {
      overlayRef.current.scrollTop = ta.scrollTop;
      overlayRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  }, []);

  // Scroll textarea so the current match is visible
  useEffect(() => {
    if (findMatches.length === 0) return;
    const match = findMatches[currentMatchIdx];
    if (!match) return;
    const ta = textareaRef.current;
    if (!ta) return;
    // Compute line number of the match
    const linesBefore = sceneJs.slice(0, match.start).split("\n").length - 1;
    const targetScrollTop = linesBefore * EDITOR_LINE_HEIGHT - ta.clientHeight / 2 + EDITOR_LINE_HEIGHT;
    ta.scrollTop = Math.max(0, targetScrollTop);
    syncScroll();
  }, [currentMatchIdx, findMatches, sceneJs, syncScroll]);

  /* ── Track cursor line ────────────────────────────────────────── */
  const updateCursorLine = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lineNum = ta.value.substring(0, pos).split("\n").length - 1;
    setCursorLine(lineNum);
  }, []);

  /* ── Highlighted HTML ─────────────────────────────────────────── */
  const lines = sceneJs.split("\n");
  const highlightedHtml = lines.map((l) => highlightLine(l)).join("\n");

  /* ── Find-match highlight overlay HTML ───────────────────────── */
  const findHighlightRef = useRef<HTMLPreElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const findHighlightHtml = useMemo(() => {
    if (findMatches.length === 0) return "";
    // Build the text with invisible characters except where matches are highlighted
    const parts: string[] = [];
    let last = 0;
    for (let i = 0; i < findMatches.length; i++) {
      const m = findMatches[i];
      // Invisible text before this match (still needed for positioning)
      if (m.start > last) {
        parts.push(`<span style="visibility:hidden">${escapeHtml(sceneJs.slice(last, m.start))}</span>`);
      }
      const isCurrent = i === currentMatchIdx;
      const bg = isCurrent
        ? "rgba(229, 160, 75, 0.45)"
        : "rgba(229, 160, 75, 0.2)";
      const border = isCurrent
        ? "1px solid rgba(229, 160, 75, 0.7)"
        : "1px solid rgba(229, 160, 75, 0.3)";
      parts.push(
        `<mark style="background:${bg};border:${border};border-radius:2px;color:transparent">${escapeHtml(sceneJs.slice(m.start, m.end))}</mark>`
      );
      last = m.end;
    }
    if (last < sceneJs.length) {
      parts.push(`<span style="visibility:hidden">${escapeHtml(sceneJs.slice(last))}</span>`);
    }
    return parts.join("");
  }, [findMatches, currentMatchIdx, sceneJs]);

  /* ── Shared text style (keep textarea + overlay pixel-identical) */
  const sharedStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: EDITOR_FONT_SIZE,
    lineHeight: `${EDITOR_LINE_HEIGHT}px`,
    padding: "20px 20px 20px 0",
    margin: 0,
    border: "none",
    whiteSpace: "pre",
    wordWrap: "normal",
    overflowWrap: "normal",
    tabSize: 2,
    letterSpacing: "normal",
  };

  /* Focus textarea when clicking anywhere in the editor area */
  const focusTextarea = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  const startCursorTracking = useCallback(() => {
    setIsFocused(true);
    updateCursorLine();
    if (textareaRef.current) textareaRef.current.dataset.tabTrapped = "true";
    if (intervalRef.current) return;
    intervalRef.current = setInterval(updateCursorLine, 50);
  }, [updateCursorLine]);

  const stopCursorTracking = useCallback(() => {
    setIsFocused(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /* ── Error line (0-based index, or -1 if no error line) ──────── */
  const errorLineIdx = error && errorLine != null && errorLine >= 1 && errorLine <= lines.length
    ? errorLine - 1
    : -1;

  /* ── Auto-scroll to error line when it changes ───────────────── */
  useEffect(() => {
    if (errorLineIdx < 0) return;
    const ta = textareaRef.current;
    if (!ta) return;
    // Scroll so the error line is roughly centred in the visible area
    const lineHeight = EDITOR_LINE_HEIGHT;
    const paddingTop = 20;
    const targetScrollTop = paddingTop + errorLineIdx * lineHeight - ta.clientHeight / 2 + lineHeight;
    ta.scrollTop = Math.max(0, targetScrollTop);
    syncScroll();
  }, [errorLineIdx, syncScroll]);

  /* ── Sync find-highlight overlay scroll with textarea ─────────── */
  useEffect(() => {
    const ta = textareaRef.current;
    const fh = findHighlightRef.current;
    if (!ta || !fh) return;
    const handler = () => {
      fh.scrollTop = ta.scrollTop;
      fh.scrollLeft = ta.scrollLeft;
    };
    ta.addEventListener("scroll", handler);
    return () => ta.removeEventListener("scroll", handler);
  }, [findMatches.length]);

  return (
    <div
      ref={containerRef}
      onKeyDown={(e) => {
        // Ctrl+F / Cmd+F — open find/replace
        if ((e.ctrlKey || e.metaKey) && e.key === "f") {
          e.preventDefault();
          openFindReplace();
        }
      }}
      style={{ flex: 1, display: "flex", flexDirection: "column" }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          role="status"
          aria-label={error ? t("editor.sceneError") : t("editor.sceneValid")}
          title={error ? t("editor.sceneError") : t("editor.sceneValid")}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: error ? "var(--danger)" : "var(--success)",
            transition: "background 0.15s ease",
          }}
        />
        <span style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          {t("editor.scene")}
        </span>
      </div>

      {/* ── Find / Replace bar ──────────────────────────────────── */}
      {showFindReplace && (
        <div
          role="search"
          aria-label={t("editor.find")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              closeFindReplace();
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              goToNextMatch();
            }
            if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              goToPrevMatch();
            }
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "8px 12px",
            marginBottom: 4,
            background: "var(--surface-float)",
            border: "1px solid var(--surface-border-float)",
            borderRadius: "var(--radius-md)",
            fontSize: 12,
          }}
        >
          {/* Find row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              ref={findInputRef}
              type="text"
              value={findQuery}
              onChange={(e) => {
                setFindQuery(e.target.value);
                setCurrentMatchIdx(0);
              }}
              placeholder={t("editor.find")}
              aria-label={t("editor.find")}
              style={{
                flex: 1,
                padding: "4px 8px",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                outline: "none",
              }}
            />
            <span style={{
              fontSize: 11,
              color: "var(--text-muted)",
              minWidth: 52,
              textAlign: "center",
              flexShrink: 0,
            }}>
              {findQuery
                ? findMatches.length > 0
                  ? `${currentMatchIdx + 1} / ${findMatches.length}`
                  : t("editor.noMatches")
                : ""}
            </span>
            <button
              onClick={goToPrevMatch}
              disabled={findMatches.length === 0}
              title={t("editor.findPrevious")}
              aria-label={t("editor.findPrevious")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                padding: 0,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: findMatches.length > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                cursor: findMatches.length > 0 ? "pointer" : "default",
                flexShrink: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
            </button>
            <button
              onClick={goToNextMatch}
              disabled={findMatches.length === 0}
              title={t("editor.findNext")}
              aria-label={t("editor.findNext")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                padding: 0,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: findMatches.length > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                cursor: findMatches.length > 0 ? "pointer" : "default",
                flexShrink: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            <button
              onClick={closeFindReplace}
              title={t("editor.closeFindReplace")}
              aria-label={t("editor.closeFindReplace")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                padding: 0,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* Replace row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="text"
              value={replaceValue}
              onChange={(e) => setReplaceValue(e.target.value)}
              placeholder={t("editor.replace")}
              aria-label={t("editor.replace")}
              style={{
                flex: 1,
                padding: "4px 8px",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                outline: "none",
              }}
            />
            <button
              onClick={replaceCurrent}
              disabled={findMatches.length === 0}
              title={t("editor.replaceOne")}
              aria-label={t("editor.replaceOne")}
              style={{
                padding: "6px 10px",
                minHeight: 32,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: findMatches.length > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                cursor: findMatches.length > 0 ? "pointer" : "default",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {t("editor.replaceOne")}
            </button>
            <button
              onClick={replaceAll}
              disabled={findMatches.length === 0}
              title={t("editor.replaceAll")}
              aria-label={t("editor.replaceAll")}
              style={{
                padding: "6px 10px",
                minHeight: 32,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: findMatches.length > 0 ? "var(--text-secondary)" : "var(--text-muted)",
                cursor: findMatches.length > 0 ? "pointer" : "default",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {t("editor.replaceAll")}
            </button>
          </div>
        </div>
      )}

      {/* Editor container */}
      <div
        onClick={focusTextarea}
        style={{
          flex: 1,
          display: "flex",
          position: "relative",
          border: `1px solid ${error ? "rgba(224, 85, 85, 0.3)" : isFocused ? "var(--amber-border)" : "var(--border)"}`,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-tertiary)",
          overflow: "hidden",
          cursor: "text",
          transition: "border-color 0.2s ease",
        }}
      >
        {/* ── Line numbers gutter ─────────────────────────────── */}
        <div
          ref={gutterRef}
          style={{
            ...sharedStyle,
            padding: "20px 12px 20px 16px",
            flexShrink: 0,
            overflow: "hidden",
            textAlign: "right",
            color: "var(--text-muted)",
            userSelect: "none",
            borderRight: "1px solid var(--border)",
            minWidth: 52,
          }}
        >
          {lines.map((_, i) => (
            <div
              key={i}
              style={{
                height: `${EDITOR_LINE_HEIGHT}px`,
                ...(i === errorLineIdx
                  ? { color: "var(--error, #e05555)", fontWeight: 600 }
                  : i === cursorLine
                    ? { color: "var(--text-secondary)" }
                    : {}),
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* ── Code area (textarea + overlay stacked) ──────────── */}
        <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          {/* Current-line highlight */}
          <div
            style={{
              position: "absolute",
              top: EDITOR_PADDING_TOP + cursorLine * EDITOR_LINE_HEIGHT,
              left: 0,
              right: 0,
              height: EDITOR_LINE_HEIGHT,
              background: "rgba(255, 255, 255, 0.03)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          {/* Error-line highlight */}
          {errorLineIdx >= 0 && (
            <div
              style={{
                position: "absolute",
                top: EDITOR_PADDING_TOP + errorLineIdx * EDITOR_LINE_HEIGHT,
                left: 0,
                right: 0,
                height: EDITOR_LINE_HEIGHT,
                background: "rgba(224, 85, 85, 0.1)",
                borderBottom: "2px solid rgba(224, 85, 85, 0.5)",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}

          {/* Find-match highlight overlay */}
          {findMatches.length > 0 && (
            <pre
              ref={findHighlightRef}
              aria-hidden
              style={{
                ...sharedStyle,
                paddingLeft: 20,
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: "hidden",
                pointerEvents: "none",
                color: "transparent",
                zIndex: 1,
                background: "transparent",
              }}
              dangerouslySetInnerHTML={{ __html: findHighlightHtml }}
            />
          )}

          {/* Syntax-highlighted overlay */}
          <pre
            ref={overlayRef}
            aria-hidden
            style={{
              ...sharedStyle,
              paddingLeft: 20,
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              overflow: "hidden",
              pointerEvents: "none",
              color: COLORS.default,
              zIndex: 2,
              background: "transparent",
            }}
            dangerouslySetInnerHTML={{ __html: highlightedHtml + "\n" }}
          />

          {/* Actual textarea (transparent text, visible caret) */}
          <textarea
            ref={textareaRef}
            value={sceneJs}
            onChange={(e) => {
              onChange(e.target.value);
              updateCursorLine();
              setTimeout(updateAutocomplete, 0);
            }}
            onScroll={syncScroll}
            onKeyUp={updateCursorLine}
            onMouseUp={updateCursorLine}
            onFocus={startCursorTracking}
            onBlur={() => {
              stopCursorTracking();
              dismissAutocomplete();
            }}
            spellCheck={false}
            aria-label={t("editor.scene")}
            style={{
              ...sharedStyle,
              paddingLeft: 20,
              position: "relative",
              width: "100%",
              height: "100%",
              resize: "none",
              background: "transparent",
              color: "transparent",
              caretColor: "var(--text-primary)",
              outline: "none",
              zIndex: 3,
              overflow: "auto",
              border: "none",
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "f") {
                e.preventDefault();
                openFindReplace();
                return;
              }
              if (acVisible) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setAcIndex((prev) => (prev + 1) % acItems.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setAcIndex((prev) => (prev - 1 + acItems.length) % acItems.length);
                  return;
                }
                if (e.key === "Tab" || e.key === "Enter") {
                  e.preventDefault();
                  acceptCompletion(acItems[acIndex]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  dismissAutocomplete();
                  return;
                }
              }
              if (e.key === "Escape") {
                (e.target as HTMLTextAreaElement).dataset.tabTrapped = "false";
                return;
              }
              if (e.key === "Tab") {
                const ta = e.target as HTMLTextAreaElement;
                if (ta.dataset.tabTrapped === "false") {
                  ta.dataset.tabTrapped = "true";
                  return;
                }
                e.preventDefault();
                const start = ta.selectionStart;
                const end = ta.selectionEnd;
                const val = ta.value;
                onChange(val.substring(0, start) + "  " + val.substring(end));
                setTimeout(() => {
                  ta.selectionStart = ta.selectionEnd = start + 2;
                  updateCursorLine();
                }, 0);
              }
            }}
          />

          {/* Inline error message decoration */}
          {error && errorLineIdx >= 0 && (
            <div
              aria-live="polite"
              style={{
                position: "absolute",
                top: EDITOR_PADDING_TOP + (errorLineIdx + 1) * EDITOR_LINE_HEIGHT,
                left: 20,
                right: 8,
                zIndex: 4,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 8px",
                  background: "rgba(224, 85, 85, 0.12)",
                  border: "1px solid rgba(224, 85, 85, 0.25)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  color: "var(--error, #e05555)",
                  lineHeight: 1.4,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            </div>
          )}

          {/* Autocomplete popup */}
          <SceneAutocomplete
            items={acItems}
            selectedIndex={acIndex}
            position={acPosition}
            onSelect={acceptCompletion}
          />
        </div>
      </div>

      {/* Bottom error banner (shown when error has no line number) */}
      {error && errorLineIdx < 0 && (
        <div
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            marginTop: 4,
            background: "rgba(224, 85, 85, 0.1)",
            border: "1px solid rgba(224, 85, 85, 0.25)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--error, #e05555)",
            lineHeight: 1.4,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {error}
          </span>
        </div>
      )}
    </div>
  );
}
