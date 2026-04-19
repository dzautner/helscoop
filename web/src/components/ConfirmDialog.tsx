"use client";

import { useEffect, useRef, useCallback } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  // Focus trap: cycle between cancel and confirm buttons
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === "Enter") {
        // Only confirm on Enter if focus is not on the cancel button
        if (document.activeElement !== cancelBtnRef.current) {
          e.preventDefault();
          onConfirm();
          return;
        }
      }

      if (e.key === "Tab") {
        const focusable = [cancelBtnRef.current, confirmBtnRef.current].filter(
          Boolean
        ) as HTMLElement[];
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [open, onCancel, onConfirm]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      // Focus the cancel button by default (safer default)
      requestAnimationFrame(() => cancelBtnRef.current?.focus());
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "fadeIn 0.15s ease both",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 420,
          background: "var(--surface-2)",
          border: "1px solid var(--border-medium)",
          borderRadius: "var(--radius-lg)",
          padding: "28px 28px 24px",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
          animation: "dialogSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <h2
          id="confirm-dialog-title"
          className="heading-display"
          style={{
            fontSize: 18,
            margin: "0 0 8px",
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h2>

        <p
          id="confirm-dialog-message"
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            margin: "0 0 24px",
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            ref={cancelBtnRef}
            className="btn btn-ghost"
            onClick={onCancel}
            style={{ padding: "10px 20px", fontSize: 13 }}
          >
            {cancelText}
          </button>
          <button
            ref={confirmBtnRef}
            className={`btn ${isDanger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              ...(isDanger
                ? {
                    background: "var(--danger)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--danger)",
                  }
                : {}),
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
