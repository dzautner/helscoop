"use client";

import { useState, useEffect } from "react";
import { api, setToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { SkeletonProjectCard } from "@/components/Skeleton";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import ProjectCard from "@/components/ProjectCard";
import TemplateGrid from "@/components/TemplateGrid";
import type { Project, Template } from "@/types";

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t, locale } = useTranslation();

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getProjects(), api.getTemplates()])
      .then(([projs, tmpls]) => {
        if (mounted) {
          setProjects(projs);
          setTemplates(tmpls);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          toast(err instanceof Error ? err.message : t('toast.loadProjectsFailed'), "error");
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, [toast, t]);

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await api.createProject({ name: newName });
      setProjects([p, ...projects]);
      setNewName("");
      toast(t('toast.projectCreated'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.createProjectFailed'), "error");
    }
    setCreating(false);
  }

  async function createFromTemplate(tmpl: Template) {
    setCreating(true);
    try {
      const p = await api.createProject({
        name: tmpl.name,
        description: tmpl.description,
        scene_js: tmpl.scene_js,
      });
      if (tmpl.bom.length > 0) {
        await api.saveBOM(p.id, tmpl.bom);
      }
      setProjects([{ ...p, estimated_cost: tmpl.estimated_cost }, ...projects]);
      toast(t('toast.templateCreated'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.templateFailed'), "error");
    }
    setCreating(false);
  }

  async function deleteProject(id: string) {
    if (!confirm(t('project.deleteConfirm'))) return;
    try {
      await api.deleteProject(id);
      setProjects(projects.filter((p) => p.id !== id));
      toast(t('toast.projectDeleted'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.deleteFailed'), "error");
    }
  }

  async function duplicateProject(id: string) {
    try {
      const p = await api.duplicateProject(id);
      setProjects([p, ...projects]);
      toast(t('toast.projectDuplicated'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.duplicateFailed'), "error");
    }
  }

  function projectCountText(count: number): string {
    if (locale === 'fi') {
      return `${count} projekti${count !== 1 ? "a" : ""}`;
    }
    return `${count} project${count !== 1 ? "s" : ""}`;
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
            <span className="label-mono">{t('nav.projects')}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <LanguageSwitcher />
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => (window.location.href = "/admin")}>
              {t('nav.admin')}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setToken(null); window.location.reload(); }}>
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Hero create section */}
        <div className="anim-up" style={{ marginBottom: 48 }}>
          <h1 className="heading-display" style={{ fontSize: 36, marginBottom: 6 }}>
            {t('project.myProjects')}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 24 }}>
            {loading
              ? t('project.loadingProjects')
              : projects.length > 0
                ? projectCountText(projects.length)
                : t('project.startFirst')}
          </p>

          <div style={{ display: "flex", gap: 8, maxWidth: 560 }}>
            <input
              className="input"
              placeholder={t('project.newProjectPlaceholder')}
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
              {creating ? "..." : t('project.create')}
            </button>
          </div>

          {/* Template picker */}
          <TemplateGrid
            templates={templates}
            loading={loading}
            creating={creating}
            onCreateFromTemplate={createFromTemplate}
          />
        </div>

        {loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <SkeletonProjectCard key={i} delay={i * 0.08} />
            ))}
          </div>
        ) : projects.length === 0 ? (
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
              {t('project.noProjects')}
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 14, maxWidth: 360, margin: "0 auto" }}>
              {t('project.noProjectsDesc')}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {projects.map((p, i) => (
              <ProjectCard
                key={p.id}
                project={p}
                index={i}
                onDuplicate={duplicateProject}
                onDelete={deleteProject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
