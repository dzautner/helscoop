"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import type { Project, ProjectStatus } from "@/types";
import AchievementBadges from "@/components/AchievementBadges";

const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: "var(--amber, #e5a04b)",
  in_progress: "var(--info, #7ab3e0)",
  completed: "var(--success, #8bc48b)",
  archived: "var(--text-muted, #666)",
};
const STATUS_KEYS: Record<ProjectStatus, string> = {
  planning: "project.statusPlanning",
  in_progress: "project.statusInProgress",
  completed: "project.statusCompleted",
  archived: "project.statusArchived",
};

export default function ProjectCard({
  project,
  index,
  onDuplicate,
  onDelete,
  selectable = false,
  selected = false,
  onSelectChange,
}: {
  project: Project;
  index: number;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
}) {
  const { t, locale } = useTranslation();

  const progress = useMemo(() => {
    const phases = [
      { key: "progressDesign", done: !!project.scene_js },
      { key: "progressMaterials", done: (project.bom?.length ?? 0) > 0 },
      { key: "progressBudget", done: project.estimated_cost > 0 },
      { key: "progressExecution", done: project.status === "in_progress" || project.status === "completed" },
      { key: "progressComplete", done: project.status === "completed" },
    ];
    const completed = phases.filter((p) => p.done).length;
    return { phases, completed, total: phases.length, pct: Math.round((completed / phases.length) * 100) };
  }, [project.scene_js, project.bom, project.estimated_cost, project.status]);

  return (
    <div
      className="card card-interactive anim-up project-card-grid"
      style={{
        animationDelay: `${index * 0.04}s`,
        padding: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {selectable && (
        <label
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 3,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 8px",
            borderRadius: "999px",
            border: "1px solid var(--border)",
            background: "color-mix(in srgb, var(--bg-elevated) 88%, transparent)",
            color: "var(--text-secondary)",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            boxShadow: "var(--shadow-sm)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectChange?.(event.currentTarget.checked)}
            aria-label={t("bomAggregate.selectProject", { name: project.name })}
          />
          {t("bomAggregate.selectShort")}
        </label>
      )}
      {/* Thumbnail or placeholder */}
      <div className="project-card-thumb" style={{
        background: project.thumbnail_url
          ? `url(${project.thumbnail_url}) center/cover no-repeat`
          : undefined,
      }}>
        {!project.thumbnail_url && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
        )}
        <div className="project-card-thumb-fade" />
      </div>
      <div style={{ padding: "14px 22px 18px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, minWidth: 0 }}>
            <h3 className="heading-display" style={{ fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              <Link
                href={`/project/${project.id}`}
                style={{
                  color: "inherit",
                  textDecoration: "none",
                }}
                className="project-card-link"
              >
                {project.name}
              </Link>
            </h3>
            {project.estimated_cost > 0 && (
              <span className="badge badge-amber">
                {Number(project.estimated_cost).toFixed(0)} &euro;
              </span>
            )}
            {Number(project.view_count || 0) > 0 && (
              <span className="badge badge-muted">
                {t("project.viewCount", { count: Number(project.view_count || 0) })}
              </span>
            )}
            {project.status && project.status !== "planning" && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                color: STATUS_COLORS[project.status],
                fontFamily: "var(--font-mono)",
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: STATUS_COLORS[project.status],
                }} />
                {t(STATUS_KEYS[project.status])}
              </span>
            )}
          </div>
          {project.tags && project.tags.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              {project.tags.slice(0, 5).map((tag) => (
                <span key={tag} style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: "var(--radius-sm, 4px)",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "nowrap",
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-muted)", fontSize: 13, minWidth: 0 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{project.description || t('project.emptyDescription')}</span>
            <span style={{ opacity: 0.5 }}>&middot;</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              {new Date(project.updated_at).toLocaleDateString(locale === 'fi' ? 'fi-FI' : 'en-GB')}
            </span>
          </div>
        </div>
        {progress.completed > 0 && progress.completed < progress.total && (
          <div className="project-progress" style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span className="project-progress-label">{t("project.progressLabel")}</span>
              <span className="project-progress-pct">{progress.pct}%</span>
            </div>
            <div className="project-progress-track">
              <div className="project-progress-fill" style={{ width: `${progress.pct}%` }} />
            </div>
            <div className="project-progress-phases">
              {progress.phases.map((p) => (
                <span key={p.key} className={`project-progress-phase${p.done ? " done" : ""}`}>
                  {p.done ? "\u2713" : "\u2022"} {t(`project.${p.key}`)}
                </span>
              ))}
            </div>
          </div>
        )}
        <AchievementBadges project={project} />
        <div className="project-card-actions" style={{ marginTop: 10, position: "relative", zIndex: 1 }}>
          <button className="btn btn-ghost" style={{ minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 12px", fontSize: 11, gap: 4 }} aria-label={t('project.copyAriaLabel', { name: project.name })} onClick={() => onDuplicate(project.id)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {t('project.copy')}
          </button>
          <button className="btn btn-danger" style={{ minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 12px", fontSize: 11, gap: 4 }} aria-label={t('project.deleteAriaLabel', { name: project.name })} onClick={() => onDelete(project.id)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            {t('project.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
