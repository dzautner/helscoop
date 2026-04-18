"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Salasanat eivat tasmaa");
      return;
    }

    if (password.length < 8) {
      setError("Salasanan on oltava vahintaan 8 merkkia");
      return;
    }

    if (!token) {
      setError("Nollauslinkki on virheellinen");
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salasanan vaihto epaonnistui");
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
          Vaihda salasana
        </h1>

        {success ? (
          <div style={{ textAlign: "center" }}>
            <div style={{
              padding: "16px 20px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(196,145,92,0.08)",
              border: "1px solid var(--amber-border)",
              color: "var(--text-primary)",
              fontSize: 14,
              marginBottom: 24,
              lineHeight: 1.6,
              marginTop: 16,
            }}>
              Salasana vaihdettu! Voit nyt kirjautua.
            </div>
            <a
              href="/"
              className="btn btn-primary"
              style={{ fontSize: 14, textDecoration: "none", padding: "13px 28px", display: "inline-block" }}
            >
              Kirjaudu sisaan
            </a>
          </div>
        ) : (
          <>
            <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", marginBottom: 28 }}>
              Syota uusi salasanasi.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>Uusi salasana</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Vahintaan 8 merkkia"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>Vahvista salasana</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Syota salasana uudelleen"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
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
                {loading ? "Vaihdetaan..." : "Vaihda salasana"}
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
          </>
        )}
      </div>
    </div>
  );
}
