"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Jokin meni pieleen");
    }
    setLoading(false);
  }

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
      }}>
        <h1 className="heading-display" style={{ fontSize: 28, marginBottom: 8, textAlign: "center" }}>
          Salasanan nollaus
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", marginBottom: 28 }}>
          Syota sahkopostiosoitteesi niin lahetamme nollauslinkin.
        </p>

        {submitted ? (
          <div style={{ textAlign: "center" }}>
            <div style={{
              padding: "16px 20px",
              borderRadius: "var(--radius-sm)",
              background: "var(--amber-glow)",
              border: "1px solid var(--amber-border)",
              color: "var(--text-primary)",
              fontSize: 14,
              marginBottom: 24,
              lineHeight: 1.6,
            }}>
              Jos sahkoposti on rekisteroity, saat nollauslinkin.
            </div>
            <a
              href="/"
              className="btn btn-ghost"
              style={{ fontSize: 13, textDecoration: "none" }}
            >
              Takaisin kirjautumiseen
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>Sahkoposti</label>
              <input
                className="input"
                type="email"
                placeholder="matti@esimerkki.fi"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>

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
              {loading ? "Lahetetaan..." : "Laheta nollauslinkki"}
            </button>

            <div style={{ textAlign: "center", marginTop: 8 }}>
              <a
                href="/"
                style={{
                  color: "var(--amber)",
                  fontSize: 13,
                  textDecoration: "none",
                  fontFamily: "var(--font-body)",
                }}
              >
                Takaisin kirjautumiseen
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
