"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import type { AppNotification } from "@/types";

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationCenter() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function refreshCount() {
    if (!getToken()) return;
    try {
      const result = await api.getUnreadNotificationCount();
      setUnread(result.unread);
    } catch {
      // Notification center should never break the editor shell.
    }
  }

  async function loadItems() {
    if (!getToken()) return;
    setLoading(true);
    try {
      const notifications = await api.getNotifications(20);
      setItems(notifications);
      setUnread(notifications.filter((item) => !item.read).length);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!mounted || !getToken()) return;
    void refreshCount();
    const timer = window.setInterval(() => {
      void refreshCount();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [mounted]);

  if (!mounted || !getToken()) return null;

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 80 }}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void loadItems();
        }}
        style={{
          position: "relative",
          width: 38,
          height: 38,
          borderRadius: 999,
          border: "1px solid var(--border)",
          background: "rgba(12, 12, 14, 0.84)",
          color: "var(--text-primary)",
          boxShadow: "0 10px 35px rgba(0,0,0,0.22)",
          cursor: "pointer",
          backdropFilter: "blur(14px)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            aria-label={`${unread} unread notifications`}
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 999,
              background: "var(--amber)",
              color: "#111",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: "18px",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notification center"
          style={{
            marginTop: 10,
            width: 340,
            maxWidth: "calc(100vw - 32px)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            background: "var(--surface-elevated)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12 }}>
            <strong style={{ fontSize: 14 }}>Price alerts</strong>
            <button
              type="button"
              className="btn-ghost"
              style={{ fontSize: 11, padding: "2px 6px" }}
              onClick={async () => {
                await api.markAllNotificationsRead();
                setItems((prev) => prev.map((item) => ({ ...item, read: true })));
                setUnread(0);
              }}
            >
              Mark read
            </button>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>
            ) : items.length === 0 ? (
              <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>No alerts yet.</div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    if (!item.read) {
                      await api.markNotificationRead(item.id);
                      setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n));
                      setUnread((value) => Math.max(0, value - 1));
                    }
                    const projectId = item.metadata_json?.project_id;
                    if (typeof projectId === "string") {
                      window.location.href = `/project/${projectId}`;
                    }
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: 0,
                    borderBottom: "1px solid var(--border)",
                    background: item.read ? "transparent" : "rgba(245, 158, 11, 0.08)",
                    color: "var(--text-primary)",
                    padding: "12px 16px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>{item.title}</strong>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{formatTime(item.created_at)}</span>
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.45 }}>{item.body}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
