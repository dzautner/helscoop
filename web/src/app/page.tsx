"use client";

import { useState, useEffect } from "react";
import { api, setToken, getToken } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  description: string;
  estimated_cost: number;
  updated_at: string;
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = isRegister
        ? await api.register(email, password, name)
        : await api.login(email, password);
      setToken(result.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirjautuminen ei onnistunut");
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(165deg, #0c0e14 0%, #121520 40%, #1a1520 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle wood grain accent line */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "linear-gradient(90deg, transparent 0%, #c4915c 30%, #d4a574 50%, #c4915c 70%, transparent 100%)",
      }} />

      <div className="animate-in" style={{ width: 400, padding: "0 20px" }}>
        {/* Logo & Brand */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(196,145,92,0.2) 0%, rgba(196,145,92,0.05) 100%)",
              border: "1px solid rgba(196,145,92,0.15)",
              marginBottom: 20,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#c4915c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5l7-3 7 3v16" />
            </svg>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 6, letterSpacing: "-0.02em" }}>
            DingCAD
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15 }}>
            Suunnittele ja laske rakennusprojektisi
          </p>
        </div>

        {/* Login Card */}
        <div
          className="card"
          style={{
            padding: "32px 28px",
            borderRadius: "var(--radius-xl)",
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {isRegister && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                  Nimi
                </label>
                <input
                  className="input"
                  placeholder="Matti Meikalainen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                Sahkoposti
              </label>
              <input
                className="input"
                type="email"
                placeholder="matti@esimerkki.fi"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6, display: "block" }}>
                Salasana
              </label>
              <input
                className="input"
                type="password"
                placeholder="Salasana"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                background: "var(--danger-muted)",
                color: "var(--danger)",
                fontSize: 13,
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
                padding: "12px 16px",
                fontSize: 14,
                marginTop: 4,
                background: "linear-gradient(135deg, #c4915c 0%, #a67745 100%)",
                border: "none",
              }}
            >
              {loading ? "Ladataan..." : isRegister ? "Luo tili" : "Kirjaudu"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              style={{
                background: "none",
                border: "none",
                color: "#c4915c",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {isRegister ? "Onko jo tili? Kirjaudu" : "Ei tilia? Luo uusi"}
            </button>
          </div>
        </div>

        <p style={{
          textAlign: "center",
          marginTop: 32,
          color: "var(--text-muted)",
          fontSize: 12,
          lineHeight: 1.6,
        }}>
          Materiaalit ja hinnat K-Raudasta, Sarokkaasta ja muilta toimittajilta.
          <br />
          Laske kustannukset reaaliaikaisilla hinnoilla.
        </p>
      </div>
    </div>
  );
}

function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.getProjects().then(setProjects).catch(console.error);
  }, []);

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    const p = await api.createProject({ name: newName });
    setProjects([p, ...projects]);
    setNewName("");
    setCreating(false);
  }

  async function deleteProject(id: string) {
    if (!confirm("Haluatko varmasti poistaa taman projektin?")) return;
    await api.deleteProject(id);
    setProjects(projects.filter((p) => p.id !== id));
  }

  async function duplicateProject(id: string) {
    const p = await api.duplicateProject(id);
    setProjects([p, ...projects]);
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
      {/* Top bar with wood accent */}
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "linear-gradient(90deg, transparent 0%, #c4915c 30%, #d4a574 50%, #c4915c 70%, transparent 100%)",
        zIndex: 100,
      }} />

      <div className="animate-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c4915c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5l7-3 7 3v16" />
            </svg>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Omat projektit</h1>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            {projects.length} projekti{projects.length !== 1 ? "a" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => (window.location.href = "/admin")}
            className="btn btn-ghost"
            style={{ fontSize: 13 }}
          >
            Hallinta
          </button>
          <button
            onClick={() => { setToken(null); window.location.reload(); }}
            className="btn btn-ghost"
            style={{ fontSize: 13 }}
          >
            Kirjaudu ulos
          </button>
        </div>
      </div>

      {/* New project */}
      <div className="animate-in" style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        <input
          className="input"
          placeholder="Uusi projekti, esim. 'Autotalli 6x4m'..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createProject()}
          style={{ flex: 1 }}
        />
        <button
          className="btn"
          onClick={createProject}
          disabled={creating || !newName.trim()}
          style={{
            padding: "10px 24px",
            background: newName.trim() ? "linear-gradient(135deg, #c4915c 0%, #a67745 100%)" : "var(--bg-elevated)",
            color: newName.trim() ? "#fff" : "var(--text-muted)",
            border: "none",
          }}
        >
          {creating ? "..." : "Luo projekti"}
        </button>
      </div>

      {projects.length === 0 ? (
        <div
          className="card animate-in"
          style={{ padding: "60px 40px", textAlign: "center" }}
        >
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "rgba(196,145,92,0.1)",
            border: "1px solid rgba(196,145,92,0.15)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c4915c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20M5 20V8l7-5 7 5v12M9 20v-6h6v6" />
            </svg>
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Aloita ensimmainen projektisi
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Kirjoita projektin nimi yllaolevaan kenttaan ja paina &quot;Luo projekti&quot;.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.map((p, i) => (
            <div
              key={p.id}
              className="card"
              style={{
                padding: "20px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
                animation: `fadeIn 0.3s ease-out ${i * 0.05}s both`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(196,145,92,0.3)";
                e.currentTarget.style.background = "var(--bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--bg-secondary)";
              }}
              onClick={() => (window.location.href = `/project/${p.id}`)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{p.name}</h3>
                  {p.estimated_cost > 0 && (
                    <span className="badge" style={{
                      background: "rgba(196,145,92,0.12)",
                      color: "#d4a574",
                      fontFamily: "var(--font-mono)",
                    }}>
                      {Number(p.estimated_cost).toFixed(0)} EUR
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{p.description || "Ei kuvausta"}</span>
                  <span style={{ opacity: 0.5, fontSize: 12 }}>
                    {new Date(p.updated_at).toLocaleDateString("fi-FI")}
                  </span>
                </p>
              </div>
              <div
                style={{ display: "flex", gap: 6 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => (window.location.href = `/project/${p.id}`)}>
                  Avaa
                </button>
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => duplicateProject(p.id)}>
                  Kopioi
                </button>
                <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => deleteProject(p.id)}>
                  Poista
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    if (getToken()) {
      api.me().then(() => setLoggedIn(true)).catch(() => setToken(null));
    }
  }, []);

  if (!loggedIn) return <LoginForm onLogin={() => setLoggedIn(true)} />;
  return <ProjectList />;
}
