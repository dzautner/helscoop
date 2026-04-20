"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { setToken } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import Link from "next/link";

function UserAvatar({ name, onClick, expanded }: { name: string; onClick?: () => void; expanded: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      aria-label={`User menu for ${name}`}
      aria-haspopup="true"
      aria-expanded={expanded}
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        background: "var(--amber-glow)",
        border: "1px solid var(--amber-border)",
        color: "var(--amber)",
        fontSize: 13,
        fontWeight: 700,
        fontFamily: "var(--font-mono)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: "border-color var(--transition-fast), box-shadow var(--transition-fast)",
        outline: "none",
      }}
      className="avatar-btn"
    >
      {initials || "?"}
    </button>
  );
}

export default function UserMenu({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    // Return focus to the trigger button when closing via keyboard
    const triggerBtn = triggerRef.current?.querySelector<HTMLElement>(".avatar-btn");
    triggerBtn?.focus();
  }, []);

  const getMenuItems = useCallback((): HTMLElement[] => {
    if (!menuRef.current) return [];
    return Array.from(menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }, []);

  const focusItem = useCallback((index: number) => {
    const items = getMenuItems();
    if (items.length === 0) return;
    const clamped = (index + items.length) % items.length;
    items[clamped]?.focus();
  }, [getMenuItems]);

  // Focus the first menu item whenever the menu opens
  useEffect(() => {
    if (!open) return;
    // Defer so the DOM is rendered before we query items
    const id = requestAnimationFrame(() => {
      const items = getMenuItems();
      items[0]?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open, getMenuItems]);

  // Arrow-key / Home / End / Escape navigation (WAI-ARIA menu widget pattern)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = getMenuItems();
      const focused = document.activeElement as HTMLElement;
      const currentIndex = items.indexOf(focused);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          focusItem(currentIndex < 0 ? 0 : currentIndex + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          focusItem(currentIndex <= 0 ? items.length - 1 : currentIndex - 1);
          break;
        case "Home":
          e.preventDefault();
          focusItem(0);
          break;
        case "End":
          e.preventDefault();
          focusItem(items.length - 1);
          break;
        case "Escape":
          e.preventDefault();
          closeMenu();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeMenu, getMenuItems, focusItem]);

  return (
    <div style={{ position: "relative" }} ref={triggerRef}>
      <UserAvatar name={userName} onClick={() => setOpen(!open)} expanded={open} />
      {open && (
        <>
          {/* Backdrop to close menu */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 100 }}
            onClick={() => setOpen(false)}
          />
          <div
            className="card anim-fade"
            role="menu"
            aria-label={`${userName} menu`}
            ref={menuRef}
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              minWidth: 180,
              padding: "6px",
              zIndex: 200,
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-secondary)",
                borderBottom: "1px solid var(--border)",
                marginBottom: 4,
              }}
            >
              {userName}
            </div>
            <Link
              href="/settings"
              className="menu-item"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
            >
              {t("nav.settings")}
            </Link>
            <button
              className="menu-item"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setToken(null);
                window.location.reload();
              }}
            >
              {t("nav.logout")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
