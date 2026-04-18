"use client";

import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

const TYPE_STYLES: Record<ToastType, { bg: string; color: string; border: string; icon: string }> = {
  success: {
    bg: "var(--forest-dim)",
    color: "var(--forest)",
    border: "rgba(74, 124, 89, 0.25)",
    icon: "M20 6L9 17l-5-5",
  },
  error: {
    bg: "var(--danger-dim)",
    color: "var(--danger)",
    border: "rgba(199, 95, 95, 0.2)",
    icon: "M18 6L6 18M6 6l12 12",
  },
  info: {
    bg: "var(--amber-glow)",
    color: "var(--amber-light)",
    border: "var(--amber-border)",
    icon: "M12 2v10M12 16v2",
  },
};

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column-reverse",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastMessage key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const style = TYPE_STYLES[toast.type];

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 4000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 18px",
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: "var(--radius-md)",
        color: style.color,
        fontSize: 13,
        fontFamily: "var(--font-body)",
        fontWeight: 500,
        boxShadow: "var(--shadow-md)",
        backdropFilter: "blur(12px)",
        pointerEvents: "auto",
        cursor: "pointer",
        transform: visible && !exiting ? "translateX(0)" : "translateX(120%)",
        opacity: visible && !exiting ? 1 : 0,
        transition: "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease",
        maxWidth: 380,
      }}
      onClick={() => {
        setExiting(true);
        setTimeout(() => onDismiss(toast.id), 300);
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d={style.icon} />
      </svg>
      <span>{toast.message}</span>
    </div>
  );
}
