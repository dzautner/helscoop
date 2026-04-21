"use client";

import { useTranslation } from "@/components/LocaleProvider";
import type { SaveStatus } from "@/components/SaveStatusIndicator";

interface EditorStatusBarProps {
  objectCount: number;
  materialCount: number;
  scriptByteSize: number;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  warningCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function EditorStatusBar({
  objectCount,
  materialCount,
  scriptByteSize,
  saveStatus,
  lastSavedAt,
  warningCount,
}: EditorStatusBarProps) {
  const { t } = useTranslation();

  const saveIcon = saveStatus === "error" ? "var(--danger)"
    : saveStatus === "unsaved" ? "var(--amber)"
    : saveStatus === "saving" ? "var(--text-muted)"
    : "var(--forest)";

  const saveText = saveStatus === "saving" ? t("editor.saving")
    : saveStatus === "error" ? t("editor.saveFailed")
    : saveStatus === "unsaved" ? t("editor.unsaved")
    : lastSavedAt ? formatTimeSince(lastSavedAt) : t("editor.saved");

  return (
    <div className="editor-status-bar no-print">
      <span className="editor-status-segment">
        {t("editor.objectCount", { count: objectCount })}
      </span>
      <span className="editor-status-sep" />
      <span className="editor-status-segment">
        {materialCount} {t("editor.statusMaterials")}
      </span>
      <span className="editor-status-sep" />
      <span className="editor-status-segment">
        {formatBytes(scriptByteSize)}
      </span>
      {warningCount > 0 && (
        <>
          <span className="editor-status-sep" />
          <span className="editor-status-segment" style={{ color: "var(--amber)" }}>
            {warningCount} {warningCount === 1 ? t("editor.statusWarning") : t("editor.statusWarnings")}
          </span>
        </>
      )}
      <span style={{ flex: 1 }} />
      <span className="editor-status-segment">
        <span
          className={saveStatus === "saving" ? "status-pulse" : undefined}
          style={{ color: saveIcon, marginRight: 4, fontSize: 8, lineHeight: 1 }}
        >
          {"\u2B24"}
        </span>
        {saveText}
      </span>
    </div>
  );
}
