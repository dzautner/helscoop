"use client";

import { useState, useEffect, useMemo } from "react";
import { api, setToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { SkeletonProjectCard } from "@/components/Skeleton";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import ConfirmDialog from "@/components/ConfirmDialog";
import ProjectCard from "@/components/ProjectCard";
import TemplateGrid from "@/components/TemplateGrid";
import type { Project, Template } from "@/types";

type SortKey = "modified" | "created" | "name" | "cost";

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("modified");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
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

  function deleteProject(id: string) {
    setDeleteTarget(id);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
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

  const filteredProjects = useMemo(() => {
    let result = projects;

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Sort
    const sorted = [...result];
    switch (sortKey) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name, locale === "fi" ? "fi" : "en"));
        break;
      case "created":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "cost":
        sorted.sort((a, b) => Number(b.estimated_cost) - Number(a.estimated_cost));
        break;
      case "modified":
      default:
        sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
    }

    return sorted;
  }, [projects, searchQuery, sortKey, locale]);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <div className="nav-bar">
        <div className="nav-inner" style={{ maxWidth: 1080 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="heading-display" style={{ fontSize: 20 }}>
              <span style={{ color: "var(--text-primary)" }}>Hel</span>
              <span style={{ color: "var(--amber)" }}>scoop</span>
            </span>
            <div style={{ width: 1, height: 20, background: "var(--border-strong)", margin: "0 4px" }} />
            <span className="label-mono">{t('nav.projects')}</span>
          </div>
          <div className="nav-links">
            <LanguageSwitcher />
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => (window.location.href = "/admin")}>
              {t('nav.admin')}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setToken(null); window.location.reload(); }}>
              {t('nav.logout')}
            </button>
          </div>
          <button
            className="nav-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {mobileMenuOpen ? (
                <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              ) : (
                <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
              )}
            </svg>
          </button>
        </div>
        <div className={`nav-mobile-menu ${mobileMenuOpen ? "open" : ""}`}>
          <LanguageSwitcher />
          <button className="btn btn-ghost" style={{ fontSize: 12, width: "100%", justifyContent: "flex-start" }} onClick={() => (window.location.href = "/admin")}>
            {t('nav.admin')}
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 12, width: "100%", justifyContent: "flex-start" }} onClick={() => { setToken(null); window.location.reload(); }}>
            {t('nav.logout')}
          </button>
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
          <>
            {/* Search and sort bar */}
            <div className="anim-up delay-1" style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
              alignItems: "center",
              flexWrap: "wrap",
            }}>
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-muted)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                  }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  className="input"
                  placeholder={t('project.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: 36 }}
                />
              </div>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                style={{
                  padding: "11px 14px",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  outline: "none",
                  cursor: "pointer",
                  appearance: "none",
                  WebkitAppearance: "none",
                  paddingRight: 32,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236f6860' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                }}
              >
                <option value="modified">{t('project.sortByModified')}</option>
                <option value="name">{t('project.sortByName')}</option>
                <option value="created">{t('project.sortByCreated')}</option>
                <option value="cost">{t('project.sortByCost')}</option>
              </select>
            </div>

            {filteredProjects.length === 0 ? (
              <div style={{
                padding: "48px 40px",
                textAlign: "center",
                borderRadius: "var(--radius-xl)",
                border: "1px dashed var(--border-strong)",
                background: "var(--bg-secondary)",
              }}>
                <p style={{ color: "var(--text-secondary)", fontSize: 15, marginBottom: 4 }}>
                  {t('project.noSearchResults')}
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  {t('project.noSearchResultsDesc')}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredProjects.map((p, i) => (
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
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('dialog.deleteProjectTitle')}
        message={t('dialog.deleteProjectMessage')}
        confirmText={t('project.delete')}
        cancelText={t('dialog.cancel')}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
