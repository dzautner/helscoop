"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslation } from "@/components/LocaleProvider";

/* ── Syntax highlighting colours ─────────────────────────────────── */
const COLORS = {
  primitive: "#c4915c",   // box, cylinder, sphere
  transform: "#89b4fa",   // translate, rotate, scale
  boolean:   "#a6e3a1",   // union, subtract, intersect
  sceneAdd:  "#c4915c",   // scene.add
  number:    "#cba6f7",
  comment:   "#6f6860",
  string:    "#a6e3a1",
  default:   "#cdd6f4",
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
}: {
  sceneJs: string;
  onChange: (code: string) => void;
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

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
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
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-tertiary)",
          overflow: "hidden",
          cursor: "text",
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
            color: "#4a4640",
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
                ...(i === cursorLine ? { color: "#8a8478" } : {}),
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
            style={{
              ...sharedStyle,
              paddingLeft: 20,
              position: "relative",
              width: "100%",
              height: "100%",
              resize: "none",
              background: "transparent",
              color: "transparent",
              caretColor: "#cdd6f4",
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
        </div>
      </div>
    </div>
  );
}
