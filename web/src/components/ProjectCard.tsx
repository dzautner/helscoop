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
      className="card anim-up"
      style={{
        animationDelay: `${index * 0.04}s`,
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
      onClick={() => (window.location.href = `/project/${project.id}`)}
    >
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
      <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
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
  );
}
