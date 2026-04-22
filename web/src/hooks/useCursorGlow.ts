"use client";

import { useCallback, useRef } from "react";

export function useCursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef<number>(0);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--glow-x", `${e.clientX - rect.left}px`);
      el.style.setProperty("--glow-y", `${e.clientY - rect.top}px`);
      el.style.setProperty("--glow-opacity", "1");
    });
  }, []);

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.setProperty("--glow-opacity", "0");
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}
