"use client";

import { useRef, type TouchEvent } from "react";

export interface MobileEditorTab<T extends string> {
  id: T;
  label: string;
  badge?: string | number;
}

export type MobileEditorSwipeDirection = "left" | "right" | "up" | "down";

interface MobileEditorTabsProps<T extends string> {
  active: T;
  tabs: MobileEditorTab<T>[];
  onChange: (tab: T) => void;
  onSwipe?: (direction: MobileEditorSwipeDirection) => void;
  ariaLabel: string;
}

export default function MobileEditorTabs<T extends string>({
  active,
  tabs,
  onChange,
  onSwipe,
  ariaLabel,
}: MobileEditorTabsProps<T>) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    touchStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || !onSwipe) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 40;

    if (Math.max(absX, absY) < threshold) return;
    if (absX > absY) {
      onSwipe(dx < 0 ? "left" : "right");
    } else {
      onSwipe(dy < 0 ? "up" : "down");
    }
  };

  return (
    <div
      className="mobile-editor-tabs"
      role="tablist"
      aria-label={ariaLabel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className="mobile-editor-tab"
          data-active={active === tab.id}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.badge !== undefined && tab.badge !== 0 && (
            <span className="mobile-editor-tab-badge">{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
