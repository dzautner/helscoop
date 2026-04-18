"use client";

import { useTranslation } from "@/components/LocaleProvider";

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation();

  return (
    <button
      onClick={() => setLocale(locale === "fi" ? "en" : "fi")}
      style={{
        background: "rgba(196,145,92,0.08)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "4px 8px",
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        letterSpacing: "0.05em",
        color: "var(--text-secondary)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        transition: "border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--amber-border)";
        e.currentTarget.style.color = "var(--amber)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      <span style={{ opacity: locale === "fi" ? 1 : 0.4 }}>FI</span>
      <span style={{ opacity: 0.3 }}>|</span>
      <span style={{ opacity: locale === "en" ? 1 : 0.4 }}>EN</span>
    </button>
  );
}
