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
    <div style={{
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      position: "relative",
    }}>
      {/* Left: Brand panel */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 80px",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(160deg, #1a1510 0%, #12110f 100%)",
      }}>
        {/* Decorative diagonal lines */}
        <div style={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 40px,
            var(--amber) 40px,
            var(--amber) 41px
          )`,
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="anim-up" style={{ marginBottom: 48 }}>
            <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 16, letterSpacing: "0.12em" }}>
              N&Auml;E TALOSI &middot; MUUTA &middot; RAKENNA
            </div>
            <h1 className="heading-display" style={{ fontSize: 56, lineHeight: 1.05, marginBottom: 20 }}>
              <span style={{ color: "var(--text-primary)" }}>Hel</span>
              <span style={{ color: "var(--amber)" }}>scoop</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.7, color: "var(--text-secondary)", maxWidth: 420 }}>
              Parametrinen suunnittelutyokalu rakennusprojekteille.
              Reaaliaikaiset hinnat suoraan K-Raudasta ja Sarokkaasta.
            </p>
          </div>

          <div className="anim-up delay-2" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {[
              { num: "28", label: "Materiaalia", desc: "puu, eriste, katto, betoni" },
              { num: "6", label: "Toimittajaa", desc: "K-Rauta, Sarokas, Ruukki..." },
              { num: "AI", label: "Avustaja", desc: "kuvaile muutos, se toteutuu" },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 0",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--radius-sm)",
                  background: "var(--amber-glow)",
                  border: "1px solid var(--amber-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: item.num === "AI" ? 14 : 18,
                  color: "var(--amber)",
                  flexShrink: 0,
                }}>
                  {item.num}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 40px",
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border)",
      }}>
        <div className="anim-up delay-1" style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 36 }}>
            <h2 className="heading-display" style={{ fontSize: 28, marginBottom: 8 }}>
              {isRegister ? "Luo tili" : "Kirjaudu sisaan"}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              {isRegister
                ? "Aloita rakennusprojektien suunnittelu"
                : "Jatka siita mihin jait"}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isRegister && (
              <div>
                <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>Nimi</label>
                <input
                  className="input"
                  placeholder="Matti Meikalainen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>Sahkoposti</label>
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
              <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>Salasana</label>
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
              {loading ? "Ladataan..." : isRegister ? "Luo tili" : "Kirjaudu"}
            </button>
          </form>

          <div className="divider-amber" style={{ marginTop: 28, marginBottom: 20 }} />

          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--amber)",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "var(--font-body)",
              }}
            >
              {isRegister ? "Onko jo tili? Kirjaudu" : "Ei tilia? Luo uusi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimated_cost: number;
  scene_js: string;
  bom: { material_id: string; quantity: number; unit: string }[];
}

const TEMPLATE_ICONS: Record<string, string> = {
  sauna: "M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5l7-3 7 3v16",
  garage: "M3 21V8l9-5 9 5v13M3 21h18M9 21v-6h6v6",
  shed: "M3 21V10l4-3h10l4 3v11M3 21h18M10 21v-4h4v4",
  pergola: "M4 22V12M20 22V12M2 12h20M6 12v-2M10 12v-2M14 12v-2M18 12v-2",
};

function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    api.getProjects().then(setProjects).catch(console.error);
    api.getTemplates().then(setTemplates).catch(console.error);
  }, []);

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    const p = await api.createProject({ name: newName });
    setProjects([p, ...projects]);
    setNewName("");
    setCreating(false);
  }

  async function createFromTemplate(t: Template) {
    setCreating(true);
    const p = await api.createProject({
      name: t.name,
      description: t.description,
      scene_js: t.scene_js,
    });
    if (t.bom.length > 0) {
      await api.saveBOM(p.id, t.bom);
    }
    setProjects([{ ...p, estimated_cost: t.estimated_cost }, ...projects]);
    setShowTemplates(false);
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
    <div style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(18,17,15,0.85)",
        backdropFilter: "blur(16px) saturate(1.2)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="heading-display" style={{ fontSize: 20 }}>
              <span style={{ color: "var(--text-primary)" }}>Hel</span>
              <span style={{ color: "var(--amber)" }}>scoop</span>
            </span>
            <div style={{ width: 1, height: 20, background: "var(--border-strong)", margin: "0 4px" }} />
            <span className="label-mono">Projektit</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => (window.location.href = "/admin")}>
              Hallinta
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setToken(null); window.location.reload(); }}>
              Ulos
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Hero create section */}
        <div className="anim-up" style={{ marginBottom: 48 }}>
          <h1 className="heading-display" style={{ fontSize: 36, marginBottom: 6 }}>
            Omat projektit
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 24 }}>
            {projects.length > 0
              ? `${projects.length} projekti${projects.length !== 1 ? "a" : ""}`
              : "Aloita ensimmainen projektisi"}
          </p>

          <div style={{ display: "flex", gap: 8, maxWidth: 560 }}>
            <input
              className="input"
              placeholder="Uusi projekti, esim. 'Autotalli 6x4m'..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              style={{ flex: 1 }}
            />
            <button
              className={`btn ${newName.trim() ? "btn-primary" : "btn-ghost"}`}
              onClick={createProject}
              disabled={creating || !newName.trim()}
              style={{ padding: "11px 24px" }}
            >
              {creating ? "..." : "Luo"}
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="anim-up delay-1" style={{
            padding: "80px 40px",
            textAlign: "center",
            borderRadius: "var(--radius-xl)",
            border: "1px dashed var(--border-strong)",
            background: "var(--bg-secondary)",
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "var(--amber-glow)",
              border: "1px solid var(--amber-border)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5l7-3 7 3v16" />
              </svg>
            </div>
            <h3 className="heading-display" style={{ fontSize: 22, marginBottom: 8 }}>
              Aloita ensimmainen projektisi
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 14, maxWidth: 360, margin: "0 auto" }}>
              Kirjoita projektin nimi yllaolevaan kenttaan.
              Materiaalihinnat paivitetaan automaattisesti.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {projects.map((p, i) => (
              <div
                key={p.id}
                className="card anim-up"
                style={{
                  animationDelay: `${i * 0.04}s`,
                  padding: "22px 28px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--amber-border)";
                  e.currentTarget.style.boxShadow = "var(--shadow-amber)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                onClick={() => (window.location.href = `/project/${p.id}`)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                    <h3 className="heading-display" style={{ fontSize: 18 }}>{p.name}</h3>
                    {p.estimated_cost > 0 && (
                      <span className="badge badge-amber">
                        {Number(p.estimated_cost).toFixed(0)} &euro;
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-muted)", fontSize: 13 }}>
                    <span>{p.description || "Ei kuvausta"}</span>
                    <span style={{ opacity: 0.5 }}>&middot;</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {new Date(p.updated_at).toLocaleDateString("fi-FI")}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
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
