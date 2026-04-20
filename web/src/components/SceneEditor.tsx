"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslation } from "@/components/LocaleProvider";

/* ── Syntax highlighting colours ─────────────────────────────────── */
const COLORS = {
  primitive: "#e5a04b",   // box, cylinder, sphere
  transform: "#60a5fa",   // translate, rotate, scale
  boolean:   "#4ade80",   // union, subtract, intersect
  sceneAdd:  "#e5a04b",   // scene.add
  number:    "#c084fc",
  comment:   "#52525b",
  string:    "#4ade80",
  default:   "#a1a1aa",
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

/* ── Component ───────────────────────────────────────────────────── */
export default function SceneEditor({
  sceneJs,
  onChange,
  error,
  errorLine,
}: {
  sceneJs: string;
  onChange: (code: string) => void;
  /** Current scene error message, or null when valid. */
  error?: string | null;
  /** 1-based line number of the error in the script, or null. */
  errorLine?: number | null;
}) {
  const { t } = useTranslation();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const [cursorLine, setCursorLine] = useState<number>(0);

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

  /* ── Shared text style (keep textarea + overlay pixel-identical) */
  const sharedStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    lineHeight: "22.1px",  // 13 * 1.7
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

  /* ── Listen for cursor changes via interval while focused ───── */
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startCursorTracking = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(updateCursorLine, 50);
  }, [updateCursorLine]);

  const stopCursorTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /* ── Error line (0-based index, or -1 if no error line) ──────── */
  const errorLineIdx = error && errorLine != null && errorLine >= 1 && errorLine <= lines.length
    ? errorLine - 1
    : -1;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: error ? "var(--danger)" : "var(--success)",
          transition: "background 0.15s ease",
        }} />
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

      {/* Editor container */}
      <div
        onClick={focusTextarea}
        style={{
          flex: 1,
          display: "flex",
          position: "relative",
          border: `1px solid ${error ? "rgba(224, 85, 85, 0.3)" : "var(--border)"}`,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-tertiary)",
          overflow: "hidden",
          cursor: "text",
          transition: "border-color 0.15s ease",
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
                height: "22.1px",
                ...(i === errorLineIdx
                  ? { color: "#e05555", fontWeight: 600 }
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
              top: 20 + cursorLine * 22.1,
              left: 0,
              right: 0,
              height: 22.1,
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
                top: 20 + errorLineIdx * 22.1,
                left: 0,
                right: 0,
                height: 22.1,
                background: "rgba(224, 85, 85, 0.1)",
                borderBottom: "2px solid rgba(224, 85, 85, 0.5)",
                pointerEvents: "none",
                zIndex: 0,
              }}
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
              zIndex: 1,
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
            }}
            onScroll={syncScroll}
            onKeyUp={updateCursorLine}
            onMouseUp={updateCursorLine}
            onFocus={startCursorTracking}
            onBlur={stopCursorTracking}
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
              zIndex: 2,
              overflow: "auto",
              border: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const target = e.target as HTMLTextAreaElement;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                const val = target.value;
                onChange(val.substring(0, start) + "  " + val.substring(end));
                setTimeout(() => {
                  target.selectionStart = target.selectionEnd = start + 2;
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
                top: 20 + (errorLineIdx + 1) * 22.1,
                left: 20,
                right: 8,
                zIndex: 3,
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
                  color: "#e05555",
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
            color: "#e05555",
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
