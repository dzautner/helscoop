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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = isRegister
        ? await api.register(email, password, name)
        : await api.login(email, password);
      setToken(result.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: 32, background: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.1)" }}>
      <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>DingCAD</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>Parametric CAD for construction</p>
      <form onSubmit={handleSubmit}>
        {isRegister && (
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", padding: 12, marginBottom: 12, borderRadius: 8, border: "1px solid #ddd", boxSizing: "border-box" }} />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required
          style={{ width: "100%", padding: 12, marginBottom: 12, borderRadius: 8, border: "1px solid #ddd", boxSizing: "border-box" }} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required
          style={{ width: "100%", padding: 12, marginBottom: 16, borderRadius: 8, border: "1px solid #ddd", boxSizing: "border-box" }} />
        {error && <p style={{ color: "red", fontSize: 14 }}>{error}</p>}
        <button type="submit" style={{ width: "100%", padding: 12, background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 16 }}>
          {isRegister ? "Sign Up" : "Log In"}
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>
        <button onClick={() => setIsRegister(!isRegister)} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer" }}>
          {isRegister ? "Already have an account? Log in" : "Need an account? Sign up"}
        </button>
      </p>
    </div>
  );
}

function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    api.getProjects().then(setProjects).catch(console.error);
  }, []);

  async function createProject() {
    if (!newName.trim()) return;
    const p = await api.createProject({ name: newName });
    setProjects([p, ...projects]);
    setNewName("");
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
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ margin: 0 }}>My Projects</h1>
        <button onClick={() => { setToken(null); window.location.reload(); }}
          style={{ background: "none", border: "1px solid #ddd", padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>
          Log Out
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input placeholder="New project name..." value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createProject()}
          style={{ flex: 1, padding: 12, borderRadius: 8, border: "1px solid #ddd" }} />
        <button onClick={createProject}
          style={{ padding: "12px 24px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
          Create
        </button>
      </div>

      {projects.length === 0 ? (
        <p style={{ color: "#666", textAlign: "center", padding: 40 }}>No projects yet. Create your first one above.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {projects.map((p) => (
            <div key={p.id} style={{ background: "#fff", padding: 20, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: "0 0 4px" }}>{p.name}</h3>
                <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
                  {p.description || "No description"}
                  {p.estimated_cost > 0 && ` — Est. ${Number(p.estimated_cost).toFixed(2)} EUR`}
                </p>
                <p style={{ margin: "4px 0 0", color: "#999", fontSize: 12 }}>
                  Updated {new Date(p.updated_at).toLocaleDateString()}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => window.location.href = `/project/${p.id}`}
                  style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
                  Open
                </button>
                <button onClick={() => duplicateProject(p.id)}
                  style={{ padding: "8px 12px", background: "#f3f4f6", border: "none", borderRadius: 6, cursor: "pointer" }}>
                  Duplicate
                </button>
                <button onClick={() => deleteProject(p.id)}
                  style={{ padding: "8px 12px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, cursor: "pointer" }}>
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
