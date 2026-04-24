"use client";

import { useDeferredValue, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { GalleryCostRange, GalleryProject, ProjectType } from "@/types";

const COST_RANGES: { value: GalleryCostRange | ""; label: string }[] = [
  { value: "", label: "Any budget" },
  { value: "under-5k", label: "Under 5k EUR" },
  { value: "5k-15k", label: "5k-15k EUR" },
  { value: "15k-50k", label: "15k-50k EUR" },
  { value: "50k-plus", label: "50k+ EUR" },
];

function formatEuro(value: number): string {
  return `${Math.round(value || 0).toLocaleString("fi-FI")} EUR`;
}

function projectTypeLabel(type?: ProjectType): string {
  if (type === "taloyhtio") return "Housing company";
  return "Detached house";
}

export default function GalleryPage() {
  const router = useRouter();
  const { track } = useAnalytics();
  const [projects, setProjects] = useState<GalleryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [projectType, setProjectType] = useState<ProjectType | "">("");
  const [costRange, setCostRange] = useState<GalleryCostRange | "">("");
  const [region, setRegion] = useState("");
  const [material, setMaterial] = useState("");
  const [cloningId, setCloningId] = useState<string | null>(null);
  const deferredQ = useDeferredValue(q);
  const deferredRegion = useDeferredValue(region);
  const deferredMaterial = useDeferredValue(material);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    api.getGalleryProjects({
      q: deferredQ.trim(),
      project_type: projectType,
      cost_range: costRange,
      region: deferredRegion.trim(),
      material: deferredMaterial.trim(),
      limit: 36,
    })
      .then((result) => {
        if (!active) return;
        setProjects(result.projects);
        track("gallery_viewed", {
          result_count: result.projects.length,
          has_query: Boolean(deferredQ.trim() || deferredRegion.trim() || deferredMaterial.trim()),
          project_type: projectType || undefined,
          cost_range: costRange || undefined,
        });
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [costRange, deferredMaterial, deferredQ, deferredRegion, projectType, track]);

  async function cloneProject(project: GalleryProject) {
    setCloningId(project.id);
    try {
      const clone = await api.cloneGalleryProject(project.id);
      track("gallery_project_cloned", { project_id: project.id, source: "gallery" });
      router.push(`/project/${clone.id}`);
    } catch {
      setError(true);
    } finally {
      setCloningId(null);
    }
  }

  return (
    <main className="gallery-page">
      <div className="gallery-noise" aria-hidden="true" />
      <section className="gallery-hero">
        <Link href="/" className="gallery-back-link">Helscoop</Link>
        <div className="gallery-kicker">Public renovation gallery</div>
        <h1>Steal the material list before you start from zero.</h1>
        <p>
          Browse real homeowner projects, inspect the 3D plan, and clone the
          bill of materials into your own workspace.
        </p>
      </section>

      <section className="gallery-filters" aria-label="Gallery filters">
        <label>
          Search
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="sauna, roof, terrace..." />
        </label>
        <label>
          Home type
          <select value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType | "")}>
            <option value="">All homes</option>
            <option value="omakotitalo">Detached house</option>
            <option value="taloyhtio">Housing company</option>
          </select>
        </label>
        <label>
          Budget
          <select value={costRange} onChange={(event) => setCostRange(event.target.value as GalleryCostRange | "")}>
            {COST_RANGES.map((range) => (
              <option key={range.value || "any"} value={range.value}>{range.label}</option>
            ))}
          </select>
        </label>
        <label>
          Region
          <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Espoo, Uusimaa..." />
        </label>
        <label>
          Material
          <input value={material} onChange={(event) => setMaterial(event.target.value)} placeholder="lumber, insulation..." />
        </label>
      </section>

      <section className="gallery-results" aria-live="polite">
        <div className="gallery-results-head">
          <span>{loading ? "Loading projects..." : `${projects.length} published projects`}</span>
          {(deferredQ || projectType || costRange || deferredRegion || deferredMaterial) && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setProjectType("");
                setCostRange("");
                setRegion("");
                setMaterial("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <div className="gallery-empty" role="alert">
            Could not load the gallery. Try again in a moment.
          </div>
        )}

        {!error && !loading && projects.length === 0 && (
          <div className="gallery-empty">
            No public projects match these filters yet.
          </div>
        )}

        <div className="gallery-grid">
          {projects.map((project) => (
            <article className="gallery-card" key={project.id}>
              <Link
                href={`/gallery/${project.id}`}
                className="gallery-card-image"
                onClick={() => track("gallery_project_opened", { project_id: project.id, source: "card" })}
                aria-label={`Open ${project.name}`}
              >
                {project.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={project.thumbnail_url} alt="" />
                ) : (
                  <div className="gallery-card-placeholder" aria-hidden="true">
                    <span />
                  </div>
                )}
              </Link>
              <div className="gallery-card-body">
                <div className="gallery-card-meta">
                  <span>{projectTypeLabel(project.project_type)}</span>
                  <span>{project.region || "Finland"}</span>
                </div>
                <h2>
                  <Link
                    href={`/gallery/${project.id}`}
                    onClick={() => track("gallery_project_opened", { project_id: project.id, source: "card" })}
                  >
                    {project.name}
                  </Link>
                </h2>
                <p>{project.description || "Published homeowner renovation plan."}</p>
                <div className="gallery-materials">
                  {(project.material_highlights ?? []).slice(0, 4).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div className="gallery-card-stats">
                  <span>{formatEuro(Number(project.estimated_cost))}</span>
                  <span>{Number(project.view_count || 0)} views</span>
                  <span>{Number(project.heart_count || 0)} hearts</span>
                  <span>{Number(project.clone_count || 0)} clones</span>
                </div>
                <button
                  className="gallery-clone-button"
                  type="button"
                  disabled={cloningId === project.id}
                  onClick={() => cloneProject(project)}
                >
                  {cloningId === project.id ? "Cloning..." : "Inspire your own"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
