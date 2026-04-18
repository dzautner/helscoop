"use client";

import { useState } from "react";
import Link from "next/link";
import { api, setToken } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { BuildingResult } from "@/types";

export default function LoginForm({ onLogin, pendingBuilding }: { onLogin: () => void; pendingBuilding: BuildingResult | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isRegister && !acceptedTerms) {
      setError(t('auth.acceptTermsRequired'));
      return;
    }
    setLoading(true);
    try {
      const result = isRegister
        ? await api.register(email, password, name, acceptedTerms)
        : await api.login(email, password);
      setToken(result.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    }
    setLoading(false);
  }

  return (
    <div className="login-grid">
      {/* Left: Brand panel */}
      <div className="login-brand">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="anim-up" style={{ marginBottom: 40 }}>
            <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 12, letterSpacing: "0.06em" }}>
              {t('brand.tagline')}
            </div>
            <h1 className="heading-display" style={{ fontSize: 40, lineHeight: 1.1, marginBottom: 16 }}>
              <span style={{ color: "var(--text-primary)" }}>Hel</span>
              <span style={{ color: "var(--amber)" }}>scoop</span>
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--text-secondary)", maxWidth: 380 }}>
              {t('brand.description')}
            </p>
          </div>

          <div className="anim-up delay-2" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { num: "28", label: t('brand.featureMaterials'), desc: t('brand.featureMaterialsDesc') },
              { num: "6", label: t('brand.featureSuppliers'), desc: t('brand.featureSuppliersDesc') },
              { num: "AI", label: t('brand.featureAI'), desc: t('brand.featureAIDesc') },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 0",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: "var(--radius-sm)",
                  background: "var(--amber-glow)",
                  border: "1px solid var(--amber-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  fontSize: item.num === "AI" ? 11 : 13,
                  color: "var(--amber)",
                  flexShrink: 0,
                }}>
                  {item.num}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{item.label}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="login-form-panel">
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <ThemeToggle />
            <LanguageSwitcher />
        </div>
        <div className="anim-up delay-1" style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 28 }}>
            <h2 className="heading-display" style={{ fontSize: 22, marginBottom: 6 }}>
              {isRegister ? t('auth.registerTitle') : t('auth.loginTitle')}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              {pendingBuilding
                ? t('auth.loginSubtitleBuilding') + pendingBuilding.address
                : isRegister
                  ? t('auth.registerSubtitle')
                  : t('auth.loginSubtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isRegister && (
              <div>
                <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.name')}</label>
                <input
                  className="input"
                  placeholder={t('auth.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.email')}</label>
              <input
                className="input"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.password')}</label>
              <input
                className="input"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {!isRegister && (
                <div style={{ marginTop: 8, textAlign: "right" }}>
                  <a
                    href="/forgot-password"
                    style={{
                      color: "var(--amber)",
                      fontSize: 13,
                      textDecoration: "none",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    Unohditko salasanan?
                  </a>
                </div>
              )}
            </div>

            {isRegister && (
              <label className="terms-checkbox">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                />
                <span className="terms-checkbox-label">
                  {t('auth.acceptTerms')}{' '}
                  <Link href="/terms" target="_blank">{t('auth.termsOfService')}</Link>
                  {' '}{t('auth.and')}{' '}
                  <Link href="/privacy" target="_blank">{t('auth.privacyPolicy')}</Link>
                </span>
              </label>
            )}

            {error && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                background: "var(--danger-dim)",
                color: "var(--danger)",
                fontSize: 13,
                border: "1px solid rgba(199,95,95,0.12)",
              }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", padding: "13px 16px", fontSize: 14, marginTop: 4 }}
            >
              {loading ? t('auth.loading') : isRegister ? t('auth.register') : t('auth.login')}
            </button>
          </form>

          <div className="divider-amber" style={{ marginTop: 28, marginBottom: 20 }} />

          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => { setIsRegister(!isRegister); setError(""); setAcceptedTerms(false); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--amber)",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "var(--font-body)",
              }}
            >
              {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}
            </button>
          </div>

          {/* Footer links to legal pages */}
          <div style={{
            marginTop: 24,
            textAlign: "center",
            display: "flex",
            justifyContent: "center",
            gap: 16,
          }}>
            <Link
              href="/privacy"
              style={{
                color: "var(--text-muted)",
                fontSize: 12,
                textDecoration: "none",
                fontFamily: "var(--font-body)",
              }}
            >
              {t('legal.privacyPolicy')}
            </Link>
            <Link
              href="/terms"
              style={{
                color: "var(--text-muted)",
                fontSize: 12,
                textDecoration: "none",
                fontFamily: "var(--font-body)",
              }}
            >
              {t('legal.termsOfService')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
