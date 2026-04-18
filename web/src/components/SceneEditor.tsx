"use client";

import { useTranslation } from "@/components/LocaleProvider";

export default function SceneEditor({
  sceneJs,
  onChange,
}: {
  sceneJs: string;
  onChange: (code: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {t('editor.scene')}
        </span>
      </div>
      <textarea
        value={sceneJs}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineHeight: 1.7,
          padding: 20,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          resize: "none",
          background: "var(--bg-tertiary)",
          color: "#cdd6f4",
          outline: "none",
          tabSize: 2,
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
            }, 0);
          }
        }}
      />
    </div>
  );
}
