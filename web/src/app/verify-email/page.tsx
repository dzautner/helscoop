"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg(t("verifyEmail.missingToken"));
      return;
    }

    api.verifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : t("verifyEmail.failed"));
      });
  }, [token, t]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 24px",
      background: "var(--bg-primary)",
    }}>
      <div className="card anim-up" style={{
        width: "100%",
        maxWidth: 420,
        padding: "40px 36px",
        textAlign: "center",
      }}>
        {status === "loading" && (
          <>
            <h1 className="heading-display" style={{ fontSize: 28, marginBottom: 16 }}>
              {t("verifyEmail.verifying")}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              {t("verifyEmail.pleaseWait")}
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ marginBottom: 16 }} aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success, #4ade80)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h1 className="heading-display" style={{ fontSize: 28, marginBottom: 16 }}>
              {t("verifyEmail.successTitle")}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              {t("verifyEmail.successMessage")}
            </p>
            <a
              href="/"
              className="btn btn-primary"
              style={{ textDecoration: "none", padding: "13px 32px", fontSize: 14 }}
            >
              {t("verifyEmail.continue")}
            </a>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="heading-display" style={{ fontSize: 28, marginBottom: 16 }}>
              {t("verifyEmail.failedTitle")}
            </h1>
            <div style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--danger-dim)",
              color: "var(--danger)",
              fontSize: 13,
              border: "1px solid rgba(199,95,95,0.12)",
              marginBottom: 24,
            }}>
              {errorMsg}
            </div>
            <a
              href="/"
              className="btn btn-ghost"
              style={{ fontSize: 13, textDecoration: "none" }}
            >
              {t("verifyEmail.backHome")}
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  const { t } = useTranslation();

  return (
    <Suspense fallback={
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        color: "var(--text-muted)",
      }}>
        {t("verifyEmail.loading")}
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
