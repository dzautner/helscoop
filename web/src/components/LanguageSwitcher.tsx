"use client";

import { useTranslation } from "@/components/LocaleProvider";

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();
  const languageStyle = (active: boolean) => ({
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: active ? 700 : 500,
    transition: "color 0.15s ease",
  });

  return (
    <button
      className="lang-switch"
      aria-label={t("aria.switchLanguage")}
      onClick={() => setLocale(locale === "fi" ? "en" : "fi")}
    >
      <span style={languageStyle(locale === "fi")}>FI</span>
      <span style={{ color: "var(--text-secondary)" }}>|</span>
      <span style={languageStyle(locale === "en")}>EN</span>
    </button>
  );
}
