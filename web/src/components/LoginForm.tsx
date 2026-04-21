"use client";

import { useState, useMemo, type ReactNode } from "react";
import { api, setToken } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import HeroIllustration from "@/components/HeroIllustration";
import TrustLayer from "@/components/TrustLayer";
import ScrollReveal from "@/components/ScrollReveal";
import type { BuildingResult } from "@/types";

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      prompt: () => void;
    };
  };
};

type AppleSignInResponse = {
  authorization?: { id_token?: string };
  user?: unknown;
};

type AppleIdentity = {
  auth: {
    init: (config: {
      clientId: string;
      scope: string;
      redirectURI: string;
      usePopup: boolean;
    }) => void;
    signIn: () => Promise<AppleSignInResponse>;
  };
};

export default function LoginForm({
  onLogin,
  pendingBuilding,
  addressSearch,
}: {
  onLogin: () => void;
  pendingBuilding: BuildingResult | null;
  addressSearch?: ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { t } = useTranslation();
  const { track } = useAnalytics();

  const passwordStrength = useMemo(() => {
    if (!password) return null;
    const hasLength = password.length >= 8;
    const hasNumber = /\d/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    if (hasLength && hasNumber && hasUpper && hasSpecial) {
      return { level: "strong" as const, label: t("auth.passwordStrong"), color: "var(--forest)", width: "100%" };
    }
    if (hasLength && hasNumber) {
      return { level: "medium" as const, label: t("auth.passwordMedium"), color: "var(--amber)", width: "66%" };
    }
    return { level: "weak" as const, label: t("auth.passwordWeak"), color: "var(--danger)", width: "33%" };
  }, [password, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isRegister && !acceptedTerms) {
      setError(t('legal.acceptTermsRequired'));
      return;
    }
    setLoading(true);
    try {
      const result = isRegister
        ? await api.register(email, password, name)
        : await api.login(email, password);
      setToken(result.token, result.token_expires_at);
      track(isRegister ? "auth_register" : "auth_login", {} as Record<string, never>);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    }
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      // Use Google Identity Services popup flow
      const google = (window as unknown as { google?: GoogleIdentity }).google;
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
      if (!google || !clientId) {
        setError(t("auth.googleSignInError"));
        setGoogleLoading(false);
        return;
      }
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: { credential: string }) => {
          try {
            const result = await api.googleLogin(response.credential);
            setToken(result.token, result.token_expires_at);
            track("auth_google_login", {} as Record<string, never>);
            onLogin();
          } catch (err) {
            setError(err instanceof Error ? err.message : t("auth.googleSignInError"));
          }
          setGoogleLoading(false);
        },
      });
      google.accounts.id.prompt();
    } catch {
      setError(t("auth.googleSignInError"));
      setGoogleLoading(false);
    }
  }

  async function handleAppleSignIn() {
    setError("");
    setAppleLoading(true);
    try {
      const AppleID = (window as unknown as { AppleID?: AppleIdentity }).AppleID;
      const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || "";
      if (!AppleID || !clientId) {
        setError(t("auth.appleSignInError"));
        setAppleLoading(false);
        return;
      }

      AppleID.auth.init({
        clientId,
        scope: "name email",
        redirectURI: process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI || window.location.origin,
        usePopup: true,
      });

      const response = await AppleID.auth.signIn();
      const identityToken = response.authorization?.id_token;
      if (!identityToken) {
        setError(t("auth.appleSignInError"));
        setAppleLoading(false);
        return;
      }

      const result = await api.appleLogin(identityToken, response.user);
      setToken(result.token, result.token_expires_at);
      track("auth_apple_login", {} as Record<string, never>);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.appleSignInError"));
    }
    setAppleLoading(false);
  }

  const features = [
    {
      icon: "M3 21h18M9 8h1M9 12h1M5 21V5l7-3 7 3v16",
      num: "28",
      label: t('brand.featureMaterials'),
      desc: t('brand.featureMaterialsDesc'),
    },
    {
      icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6",
      num: "6",
      label: t('brand.featureSuppliers'),
      desc: t('brand.featureSuppliersDesc'),
    },
    {
      icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
      num: "AI",
      label: t('brand.featureAI'),
      desc: t('brand.featureAIDesc'),
    },
  ];

  return (
    <div className="login-grid">
      {/* Left: Brand panel */}
      <div className="login-brand">
        <HeroIllustration />
        <div style={{ position: "relative", zIndex: 1 }}>
          <ScrollReveal>
            <div style={{ marginBottom: 36 }}>
              <h1 className="heading-display brand-title">
                <span>Hel</span><span className="brand-title-accent">scoop</span>
              </h1>
              <p className="brand-subtitle">
                {t('brand.description')}
              </p>
            </div>
          </ScrollReveal>

          {addressSearch && (
            <ScrollReveal delay={0.1}>
              <div style={{ marginBottom: 28 }}>
                <div className="label-mono brand-tagline" style={{ marginBottom: 10 }}>
                  {t('search.sectionLabel')}
                </div>
                {addressSearch}
              </div>
            </ScrollReveal>
          )}

          <div style={{ display: "flex", flexDirection: "column", marginBottom: 36 }}>
            {features.map((item, i) => (
              <ScrollReveal key={i} delay={0.15 + i * 0.07}>
                <div className="brand-feature-item">
                  <div className="brand-feature-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={item.icon} />
                    </svg>
                  </div>
                  <div>
                    <div className="brand-feature-label">
                      <span className="brand-feature-num">{item.num}</span>
                      {item.label}
                    </div>
                    <div className="brand-feature-desc">{item.desc}</div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={0.35}>
            <TrustLayer />
          </ScrollReveal>

          <ScrollReveal delay={0.4}>
            <div className="label-mono brand-tagline">
              {t('brand.tagline')}
            </div>
          </ScrollReveal>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="login-form-panel">
        <div style={{
          position: "absolute",
          top: 20,
          right: 20,
          display: "flex",
          gap: 4,
          alignItems: "center",
        }}>
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
        <div className="anim-up delay-1" style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <h2 className="heading-display" style={{ fontSize: 24, marginBottom: 8 }}>
              {isRegister ? t('auth.registerTitle') : t('auth.loginTitle')}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, lineHeight: 1.5 }}>
              {pendingBuilding
                ? t('auth.loginSubtitleBuilding') + pendingBuilding.address
                : isRegister
                  ? t('auth.registerSubtitle')
                  : t('auth.loginSubtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {isRegister && (
              <div>
                <label htmlFor="login-name" className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.name')}</label>
                <input
                  id="login-name"
                  className="input"
                  placeholder={t('auth.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>
            )}
            <div>
              <label htmlFor="login-email" className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.email')}</label>
              <input
                id="login-email"
                className="input"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.password')}</label>
              <input
                id="login-password"
                className="input"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isRegister ? 8 : undefined}
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
              {isRegister && password && passwordStrength && (
                <div style={{ marginTop: 8 }} role="meter" aria-label={t("auth.passwordStrength")} aria-valuenow={passwordStrength.level === "strong" ? 3 : passwordStrength.level === "medium" ? 2 : 1} aria-valuemin={1} aria-valuemax={3}>
                  <div style={{
                    height: 4,
                    borderRadius: 2,
                    background: "var(--border)",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: passwordStrength.width,
                      background: passwordStrength.color,
                      borderRadius: 2,
                      transition: "width 0.25s ease, background 0.25s ease",
                    }} />
                  </div>
                  <div style={{
                    marginTop: 4,
                    fontSize: 12,
                    color: passwordStrength.color,
                    fontWeight: 500,
                  }}>
                    {passwordStrength.label}
                  </div>
                </div>
              )}
              {!isRegister && (
                <div style={{ marginTop: 8, textAlign: "right" }}>
                  <a
                    href="/forgot-password"
                    className="link-muted"
                    style={{ fontSize: 12 }}
                  >
                    {t('auth.forgotPassword')}
                  </a>
                </div>
              )}
            </div>

            {isRegister && (
              <label style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--text-secondary)",
              }}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  style={{
                    marginTop: 2,
                    accentColor: "var(--amber)",
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                  }}
                />
                <span>
                  {t('legal.acceptTerms').split(t('legal.termsOfService'))[0]}
                  <a href="/terms" target="_blank" style={{ color: "var(--amber)", textDecoration: "none" }}>
                    {t('legal.termsOfService')}
                  </a>
                  {" "}{t('legal.and')}{" "}
                  <a href="/privacy" target="_blank" style={{ color: "var(--amber)", textDecoration: "none" }}>
                    {t('legal.privacyPolicy')}
                  </a>
                </span>
              </label>
            )}

            {error && (
              <div role="alert" className="anim-up" style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--danger-dim)",
                color: "var(--danger)",
                fontSize: 13,
                border: "1px solid rgba(199,95,95,0.12)",
                lineHeight: 1.4,
                animationDuration: "0.2s",
              }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "13px 16px",
                fontSize: 14,
                marginTop: 4,
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              {loading ? <span className="btn-spinner" /> : isRegister ? t('auth.register') : t('auth.login')}
            </button>
          </form>

          {/* Google Sign-In */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 24,
            marginBottom: 24,
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "lowercase" }}>
              {t("auth.orContinueWith")}
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || appleLoading}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface)",
              color: "var(--text-primary)",
              cursor: googleLoading || appleLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: googleLoading || appleLoading ? 0.7 : 1,
              transition: "border-color 0.15s ease, background 0.15s ease",
            }}
          >
            {googleLoading ? (
              <span className="btn-spinner" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                {t("auth.googleSignIn")}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleAppleSignIn}
            disabled={googleLoading || appleLoading}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 500,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--text-primary)",
              color: "var(--bg)",
              cursor: googleLoading || appleLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              opacity: googleLoading || appleLoading ? 0.7 : 1,
              transition: "border-color 0.15s ease, background 0.15s ease",
              marginTop: 10,
            }}
          >
            {appleLoading ? (
              <span className="btn-spinner" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16.36 1.43c0 1.05-.42 2.05-1.12 2.82-.76.84-2.02 1.49-3.08 1.4-.14-1.01.39-2.08 1.05-2.83.75-.85 2.06-1.5 3.15-1.39z" />
                  <path d="M20.27 17.19c-.54 1.24-.8 1.8-1.5 2.9-.98 1.5-2.37 3.38-4.09 3.39-1.53.02-1.93-.99-4.01-.98-2.08.01-2.52 1-4.05.98-1.72-.02-3.03-1.71-4.02-3.21C-.15 16.05-.43 11.1 1.38 8.45c1.28-1.87 3.3-2.96 5.21-2.96 1.95 0 3.17 1.02 4.78 1.02 1.56 0 2.51-1.03 4.77-1.03 1.71 0 3.53.9 4.8 2.45-4.22 2.22-3.54 8.01-.67 9.26z" />
                </svg>
                {t("auth.appleSignIn")}
              </>
            )}
          </button>

          <div className="divider-amber" style={{ marginTop: 24, marginBottom: 24 }} />

          <div style={{ textAlign: "center" }}>
            <button
              className="link-amber"
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              style={{ fontSize: 13 }}
            >
              {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}
            </button>
          </div>

          <div style={{
            marginTop: 20,
            display: "flex",
            justifyContent: "center",
            gap: 16,
          }}>
            <a href="/privacy" className="link-muted" style={{ fontSize: 11 }}>
              {t('legal.privacyPolicy')}
            </a>
            <a href="/terms" className="link-muted" style={{ fontSize: 11 }}>
              {t('legal.termsOfService')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
