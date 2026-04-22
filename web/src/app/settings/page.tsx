"use client";

import { useState, useEffect, useRef } from "react";
import { api, setToken, getToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme, DARK_MOODS, type DarkMood } from "@/components/ThemeProvider";
import ConfirmDialog from "@/components/ConfirmDialog";
import { resetOnboarding } from "@/components/OnboardingTour";
import { Skeleton, SkeletonBlock } from "@/components/Skeleton";
import Link from "next/link";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  email_notifications?: boolean;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Data export
  const [exportingData, setExportingData] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [savingNotifications, setSavingNotifications] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);

  const { toast } = useToast();
  const { t } = useTranslation();
  const { mood, setMood, resolved } = useTheme();

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/";
      return;
    }
    api
      .me()
      .then((u: UserProfile) => {
        setUser(u);
        setName(u.name || "");
        setEmail(u.email || "");
        setEmailNotifications(u.email_notifications !== false);
        setLoading(false);
      })
      .catch(() => {
        setToken(null);
        window.location.href = "/";
      });
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const result = await api.updateProfile({ name, email });
      setUser(result.user);
      if (result.token) {
        setToken(result.token, result.token_expires_at);
      }
      toast(t("settings.profileUpdated"), "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : t("settings.profileUpdateFailed"),
        "error"
      );
    }
    setSavingProfile(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast(t("settings.passwordMismatch"), "error");
      return;
    }
    if (newPassword.length < 8) {
      toast(t("settings.passwordTooShort"), "error");
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast(t("settings.passwordChanged"), "success");
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : t("settings.passwordChangeFailed"),
        "error"
      );
    }
    setChangingPassword(false);
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    try {
      await api.deleteAccount();
      setToken(null);
      toast(t("settings.accountDeleted"), "success");
      window.location.href = "/";
    } catch (err) {
      toast(
        err instanceof Error ? err.message : t("settings.accountDeleteFailed"),
        "error"
      );
      setDeletingAccount(false);
    }
  }

  async function handleExportData() {
    setExportingData(true);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().split("T")[0];
      a.download = `helscoop_data_export_${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t("settings.dataExported"), "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : t("settings.dataExportFailed"),
        "error"
      );
    }
    setExportingData(false);
  }

  async function handleNotificationToggle(nextValue: boolean) {
    setSavingNotifications(true);
    const previous = emailNotifications;
    setEmailNotifications(nextValue);
    try {
      await api.updateNotificationPreferences({ email_notifications: nextValue });
      setUser((prev) => prev ? { ...prev, email_notifications: nextValue } : prev);
      toast(t("settings.notificationsSaved"), "success");
    } catch (err) {
      setEmailNotifications(previous);
      toast(
        err instanceof Error ? err.message : t("settings.notificationsSaveFailed"),
        "error"
      );
    }
    setSavingNotifications(false);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh" }}>
        {/* Top bar skeleton */}
        <div className="nav-bar">
          <div className="nav-inner" style={{ maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <SkeletonBlock width={100} height={20} />
              <div style={{ width: 1, height: 20, background: "var(--border-strong)", margin: "0 4px" }} />
              <SkeletonBlock width={70} height={14} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <SkeletonBlock width={32} height={32} />
              <SkeletonBlock width={32} height={32} />
              <SkeletonBlock width={120} height={32} />
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px" }}>
          {/* Title skeleton */}
          <div style={{ marginBottom: 40 }}>
            <SkeletonBlock width={200} height={36} />
          </div>
          {/* Card skeletons */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card settings-card"
              style={{
                marginBottom: 20,
                padding: "24px 28px",
                animation: `fadeIn 0.3s ease ${i * 0.08}s both`,
              }}
            >
              <Skeleton variant="text" width={160} height={20} style={{ marginBottom: 8 }} />
              <Skeleton variant="text" width="80%" height={14} style={{ marginBottom: 24 }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <Skeleton variant="text" width={60} height={10} style={{ marginBottom: 8 }} />
                  <Skeleton variant="rect" width="100%" height={40} />
                </div>
                <div>
                  <Skeleton variant="text" width={80} height={10} style={{ marginBottom: 8 }} />
                  <Skeleton variant="rect" width="100%" height={40} />
                </div>
              </div>
              <Skeleton variant="rect" width={140} height={40} style={{ marginTop: 16 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <div className="nav-bar">
        <div className="nav-inner" style={{ maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="heading-display" style={{ fontSize: 20 }}>
              <span style={{ color: "var(--text-primary)" }}>Hel</span>
              <span style={{ color: "var(--amber)" }}>scoop</span>
            </span>
            <div
              style={{
                width: 1,
                height: 20,
                background: "var(--border-strong)",
                margin: "0 4px",
              }}
            />
            <span className="label-mono">{t("nav.settings")}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              href="/"
              className="btn btn-ghost"
              style={{ fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {t("settings.backToProjects")}
            </Link>
          </div>
        </div>
      </div>

      <div
        style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px" }}
      >
        <div className="anim-up" style={{ marginBottom: 40 }}>
          <h1
            className="heading-display"
            style={{ fontSize: 36, marginBottom: 6 }}
          >
            {t("settings.title")}
          </h1>
        </div>

        {/* Profile section */}
        <div
          className="card anim-up settings-card"
          style={{ marginBottom: 20 }}
        >
          <h2
            className="heading-display"
            style={{ fontSize: 20, marginBottom: 4 }}
          >
            {t("settings.profile")}
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {t("settings.profileDesc")}
          </p>

          <form
            onSubmit={handleSaveProfile}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div>
              <label
                htmlFor="settings-name"
                className="label-mono"
                style={{ display: "block", marginBottom: 8 }}
              >
                {t("settings.name")}
              </label>
              <input
                id="settings-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("settings.name")}
              />
            </div>
            <div>
              <label
                htmlFor="settings-email"
                className="label-mono"
                style={{ display: "block", marginBottom: 8 }}
              >
                {t("settings.email")}
              </label>
              <input
                id="settings-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("settings.email")}
              />
            </div>
            <div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={savingProfile || (name === (user?.name || "") && email === (user?.email || ""))}
                style={{ padding: "11px 24px" }}
              >
                {savingProfile ? <span className="btn-spinner" /> : t("settings.saveProfile")}
              </button>
            </div>
          </form>
        </div>

        {/* Appearance — dark mode mood */}
        {resolved === "dark" && (
          <div
            className="card anim-up settings-card"
            style={{ marginBottom: 20 }}
          >
            <h2
              className="heading-display"
              style={{ fontSize: 20, marginBottom: 4 }}
            >
              {t("settings.appearance")}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
              {t("settings.moodDescription")}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              {(DARK_MOODS as DarkMood[]).map((m) => {
                const colors: Record<DarkMood, string[]> = {
                  warm: ["#0b0a09", "#131210", "#1a1816", "#211f1b"],
                  cool: ["#090a0d", "#10121a", "#171a24", "#1d2030"],
                  black: ["#000000", "#0a0a0a", "#121212", "#1a1a1a"],
                };
                return (
                  <button
                    key={m}
                    onClick={() => setMood(m)}
                    style={{
                      flex: 1,
                      maxWidth: 140,
                      background: "none",
                      border: mood === m ? "1px solid var(--amber)" : "1px solid var(--border)",
                      borderRadius: 8,
                      padding: 8,
                      cursor: "pointer",
                      transition: "border-color 0.2s",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                      {colors[m].map((c, i) => (
                        <div key={i} style={{ height: 14, background: c }} />
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: mood === m ? "var(--amber)" : "var(--text-secondary)" }}>
                        {t(`settings.mood_${m}`)}
                      </span>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)", opacity: mood === m ? 1 : 0.3 }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Security section */}
        <div
          className="card anim-up delay-1 settings-card"
          style={{ marginBottom: 20 }}
        >
          <h2
            className="heading-display"
            style={{ fontSize: 20, marginBottom: 4 }}
          >
            {t("settings.security")}
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {t("settings.securityDesc")}
          </p>

          <form
            onSubmit={handleChangePassword}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <div>
              <label
                htmlFor="settings-current-password"
                className="label-mono"
                style={{ display: "block", marginBottom: 8 }}
              >
                {t("settings.currentPassword")}
              </label>
              <input
                id="settings-current-password"
                className="input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("settings.currentPassword")}
                required
              />
            </div>
            <div>
              <label
                htmlFor="settings-new-password"
                className="label-mono"
                style={{ display: "block", marginBottom: 8 }}
              >
                {t("settings.newPassword")}
              </label>
              <input
                id="settings-new-password"
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("settings.newPassword")}
                required
              />
            </div>
            <div>
              <label
                htmlFor="settings-confirm-password"
                className="label-mono"
                style={{ display: "block", marginBottom: 8 }}
              >
                {t("settings.confirmPassword")}
              </label>
              <input
                id="settings-confirm-password"
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("settings.confirmPassword")}
                required
              />
            </div>
            <div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={changingPassword}
                style={{ padding: "11px 24px" }}
              >
                {changingPassword
                  ? <span className="btn-spinner" />
                  : t("settings.changePassword")}
              </button>
            </div>
          </form>
        </div>

        {/* Notifications section */}
        <div
          className="card anim-up delay-2 settings-card"
          style={{ marginBottom: 20 }}
        >
          <h2
            className="heading-display"
            style={{ fontSize: 20, marginBottom: 4 }}
          >
            {t("settings.notifications")}
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 20,
            }}
          >
            {t("settings.notificationsDesc")}
          </p>
          <label
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              color: "var(--text-secondary)",
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={emailNotifications}
              disabled={savingNotifications}
              onChange={(e) => handleNotificationToggle(e.target.checked)}
            />
            {t("settings.weeklyDigest")}
          </label>
        </div>

        {/* Onboarding tour section */}
        <div
          className="card anim-up delay-3 settings-card"
          style={{ marginBottom: 20 }}
        >
          <h2
            className="heading-display"
            style={{ fontSize: 20, marginBottom: 4 }}
          >
            {t("onboarding.restartTour")}
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {t("onboarding.restartTourDesc")}
          </p>

          <button
            className="btn btn-ghost"
            onClick={() => {
              resetOnboarding();
              toast(t("onboarding.tourRestarted"), "success");
            }}
            style={{ padding: "11px 24px" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 4 }}
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            {t("onboarding.restartTour")}
          </button>
        </div>

        {/* Legal section */}
        <div
          className="card anim-up delay-4 settings-card"
          style={{ marginBottom: 20 }}
        >
          <h2
            className="heading-display"
            style={{ fontSize: 20, marginBottom: 4 }}
          >
            {t("legal.termsOfService")}
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {t("legal.privacyIntro").split(".")[0] + "."}
          </p>

          <div style={{ display: "flex", gap: 12 }}>
            <Link
              href="/privacy"
              className="btn btn-ghost"
              style={{ padding: "11px 24px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {t("legal.privacyPolicy")}
            </Link>
            <Link
              href="/terms"
              className="btn btn-ghost"
              style={{ padding: "11px 24px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              {t("legal.termsOfService")}
            </Link>
          </div>
        </div>

        {/* Account section */}
        <div
          className="card anim-up delay-4 settings-card"
        >
          <h2
            className="heading-display"
            style={{ fontSize: 20, marginBottom: 4 }}
          >
            {t("settings.account")}
          </h2>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: 14,
              marginBottom: 24,
            }}
          >
            {t("settings.accountDesc")}
          </p>

          <div style={{ marginBottom: 24 }}>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                lineHeight: 1.6,
                margin: "0 0 12px 0",
              }}
            >
              {t("settings.exportDataDesc")}
            </p>
            <button
              className="btn btn-ghost"
              onClick={handleExportData}
              disabled={exportingData}
              style={{ padding: "11px 24px", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {exportingData ? (
                <span className="btn-spinner" />
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {t("settings.exportData")}
                </>
              )}
            </button>
          </div>

          <div
            style={{
              height: 1,
              background: "var(--border-strong)",
              margin: "0 0 24px 0",
            }}
          />

          <div
            style={{
              padding: "16px 20px",
              borderRadius: "var(--radius-sm)",
              background: "var(--danger-dim)",
              border: "1px solid var(--danger-border)",
              marginBottom: 16,
            }}
          >
            <p
              style={{
                color: "var(--danger)",
                fontSize: 13,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              {t("settings.deleteAccountWarning")}
            </p>
          </div>

          <button
            ref={deleteBtnRef}
            className="btn btn-danger"
            onClick={() => setShowDeleteConfirm(true)}
            style={{ padding: "11px 24px" }}
          >
            {t("settings.deleteAccount")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title={t("dialog.deleteAccountTitle")}
        message={t("dialog.deleteAccountMessage")}
        confirmText={t("settings.deleteAccount")}
        cancelText={t("dialog.cancel")}
        variant="danger"
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleDeleteAccount();
        }}
        onCancel={() => {
          setShowDeleteConfirm(false);
          deleteBtnRef.current?.focus();
        }}
      />
    </div>
  );
}
