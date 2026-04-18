"use client";

import { useTranslation } from "@/components/LocaleProvider";
import type { Project } from "@/types";

export default function ProjectCard({
  project,
  index,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  index: number;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t, locale } = useTranslation();

  return (
    <div
      className="card card-interactive anim-up project-card-grid"
      style={{
        animationDelay: `${index * 0.04}s`,
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
      }}
      onClick={() => (window.location.href = `/project/${project.id}`)}
    >
      {/* Thumbnail or placeholder */}
      <div style={{
        height: 120,
        background: project.thumbnail_url
          ? `url(${project.thumbnail_url}) center/cover no-repeat`
          : "linear-gradient(135deg, #1a1d22 0%, #111113 50%, #1f1e1c 100%)",
        position: "relative",
        borderBottom: "1px solid var(--border)",
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
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 40,
          background: "linear-gradient(transparent, var(--bg-secondary))",
        }} />
      </div>
      <div style={{ padding: "14px 22px 18px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <h3 className="heading-display" style={{ fontSize: 18 }}>{project.name}</h3>
            {project.estimated_cost > 0 && (
              <span className="badge badge-amber">
                {Number(project.estimated_cost).toFixed(0)} &euro;
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-muted)", fontSize: 13 }}>
            <span>{project.description || t('project.emptyDescription')}</span>
            <span style={{ opacity: 0.5 }}>&middot;</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
              {new Date(project.updated_at).toLocaleDateString(locale === 'fi' ? 'fi-FI' : 'en-GB')}
            </span>
          </div>
        </div>
        <div className="project-card-actions" onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => (window.location.href = `/project/${project.id}`)}>
            {t('project.open')}
          </button>
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onDuplicate(project.id)}>
            {t('project.copy')}
          </button>
          <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onDelete(project.id)}>
            {t('project.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
