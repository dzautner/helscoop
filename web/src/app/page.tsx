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
      setError(err instanceof Error ? err.message : "Failed");
    }
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 60%)",
      }}
    >
      <div className="animate-in" style={{ width: 380, padding: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "var(--accent-muted)",
              marginBottom: 16,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20h20M5 20V8l7-5 7 5v12M9 20v-6h6v6" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>DingCAD</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Parametric CAD for construction
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {isRegister && (
            <input
              className="input"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <div className="badge-danger" style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, background: "var(--danger-muted)" }}>
              {error}
            </div>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "12px 16px", fontSize: 14, marginTop: 4 }}
          >
            {loading ? "..." : isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={() => { setIsRegister(!isRegister); setError(""); }}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {isRegister ? "Already have an account? Sign in" : "Need an account? Create one"}
          </button>
        </div>
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
    if (!confirm("Delete this project?")) return;
    await api.deleteProject(id);
    setProjects(projects.filter((p) => p.id !== id));
  }

  async function duplicateProject(id: string) {
    const p = await api.duplicateProject(id);
    setProjects([p, ...projects]);
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px" }}>
      <div className="animate-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 36 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Projects</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => (window.location.href = "/admin")}
            className="btn btn-ghost"
          >
            Admin
          </button>
          <button
            onClick={() => { setToken(null); window.location.reload(); }}
            className="btn btn-ghost"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="animate-in" style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        <input
          className="input"
          placeholder="New project name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createProject()}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary"
          onClick={createProject}
          disabled={creating || !newName.trim()}
          style={{ padding: "10px 24px" }}
        >
          {creating ? "..." : "Create"}
        </button>
      </div>

      {projects.length === 0 ? (
        <div
          className="card animate-in"
          style={{
            padding: "60px 40px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "var(--accent-muted)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            No projects yet. Create your first one above.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.map((p, i) => (
            <div
              key={p.id}
              className="card"
              style={{
                padding: "18px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
                animation: `fadeIn 0.3s ease-out ${i * 0.05}s both`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--text-muted)";
                e.currentTarget.style.background = "var(--bg-tertiary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.background = "var(--bg-secondary)";
              }}
              onClick={() => (window.location.href = `/project/${p.id}`)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{p.name}</h3>
                  {p.estimated_cost > 0 && (
                    <span className="badge badge-success">
                      {Number(p.estimated_cost).toFixed(0)} EUR
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
                  {p.description || "No description"}
                  <span style={{ marginLeft: 8, opacity: 0.6 }}>
                    {new Date(p.updated_at).toLocaleDateString()}
                  </span>
                </p>
              </div>
              <div
                style={{ display: "flex", gap: 6 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button className="btn btn-ghost" style={{ padding: "6px 12px" }} onClick={() => duplicateProject(p.id)}>
                  Duplicate
                </button>
                <button className="btn btn-danger" style={{ padding: "6px 12px" }} onClick={() => deleteProject(p.id)}>
                  Delete
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
