"use client";

import { useRef, useEffect } from "react";

export interface AutocompleteItem {
  label: string;
  insertText: string;
  detail?: string;
  kind: "primitive" | "transform" | "boolean" | "scene" | "material" | "snippet";
}

const KIND_COLORS: Record<AutocompleteItem["kind"], string> = {
  primitive: "var(--syntax-primitive, #e5a04b)",
  transform: "var(--syntax-transform, #7ab3e0)",
  boolean: "var(--syntax-boolean, #8bc48b)",
  scene: "var(--syntax-scene-add, #f0b86a)",
  material: "var(--syntax-string, #c4a06e)",
  snippet: "var(--syntax-keyword, #e5a04b)",
};

export const STATIC_COMPLETIONS: AutocompleteItem[] = [
  { label: "box", insertText: "box(", detail: "(width, height, depth)", kind: "primitive" },
  { label: "cylinder", insertText: "cylinder(", detail: "(radius, height)", kind: "primitive" },
  { label: "sphere", insertText: "sphere(", detail: "(radius)", kind: "primitive" },
  { label: "translate", insertText: "translate(", detail: "(shape, x, y, z)", kind: "transform" },
  { label: "rotate", insertText: "rotate(", detail: "(shape, rx, ry, rz)", kind: "transform" },
  { label: "scale", insertText: "scale(", detail: "(shape, sx, sy, sz)", kind: "transform" },
  { label: "union", insertText: "union(", detail: "(a, b)", kind: "boolean" },
  { label: "subtract", insertText: "subtract(", detail: "(a, b)", kind: "boolean" },
  { label: "intersect", insertText: "intersect(", detail: "(a, b)", kind: "boolean" },
  { label: "scene.add", insertText: "scene.add(", detail: '(shape, { material: "..." })', kind: "scene" },
];

export interface AutocompleteContext {
  prefix: string;
  startPos: number;
  isMaterialString: boolean;
}

export function getAutocompleteContext(text: string, cursorPos: number): AutocompleteContext {
  const before = text.slice(0, cursorPos);
  const materialMatch = before.match(/material:\s*"([^"]*)$/);
  if (materialMatch) {
    return {
      prefix: materialMatch[1],
      startPos: cursorPos - materialMatch[1].length,
      isMaterialString: true,
    };
  }
  const wordMatch = before.match(/([a-zA-Z_][\w.]*)$/);
  if (wordMatch) {
    return {
      prefix: wordMatch[1],
      startPos: cursorPos - wordMatch[1].length,
      isMaterialString: false,
    };
  }
  return { prefix: "", startPos: cursorPos, isMaterialString: false };
}

export function filterCompletions(
  ctx: AutocompleteContext,
  materials?: { id: string; name: string }[],
): AutocompleteItem[] {
  if (ctx.prefix.length < 2 && !ctx.isMaterialString) return [];

  if (ctx.isMaterialString) {
    if (!materials?.length) return [];
    const lower = ctx.prefix.toLowerCase();
    return materials
      .filter((m) => m.id.toLowerCase().includes(lower) || m.name.toLowerCase().includes(lower))
      .slice(0, 12)
      .map((m) => ({
        label: m.id,
        insertText: m.id,
        detail: m.name,
        kind: "material" as const,
      }));
  }

  const lower = ctx.prefix.toLowerCase();
  return STATIC_COMPLETIONS.filter(
    (c) => c.label.toLowerCase().startsWith(lower) && c.label !== ctx.prefix,
  );
}

export default function SceneAutocomplete({
  items,
  selectedIndex,
  position,
  onSelect,
}: {
  items: AutocompleteItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (item: AutocompleteItem) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Autocomplete suggestions"
      style={{
        position: "absolute",
        top: position.top,
        left: Math.min(position.left, 280),
        zIndex: 10,
        background: "var(--bg-secondary, #1a1a24)",
        border: "1px solid var(--border, #2a2a3a)",
        borderRadius: "var(--radius-sm, 4px)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        maxHeight: 200,
        overflowY: "auto",
        minWidth: 220,
        maxWidth: 380,
        fontSize: 12,
        fontFamily: "var(--font-mono)",
      }}
    >
      {items.map((item, i) => (
        <div
          key={item.label + item.kind}
          role="option"
          aria-selected={i === selectedIndex}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 10px",
            cursor: "pointer",
            background: i === selectedIndex ? "rgba(255,255,255,0.08)" : "transparent",
            borderLeft: `2px solid ${i === selectedIndex ? KIND_COLORS[item.kind] : "transparent"}`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: KIND_COLORS[item.kind],
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--text-primary)", flexShrink: 0 }}>
            {item.label}
          </span>
          {item.detail && (
            <span
              style={{
                color: "var(--text-muted)",
                fontSize: 11,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
