"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { SkeletonProjectEditor } from "@/components/Skeleton";
import { useTranslation } from "@/components/LocaleProvider";
import SceneEditor from "@/components/SceneEditor";
import BomPanel from "@/components/BomPanel";
import ChatPanel from "@/components/ChatPanel";
import SceneApiReference from "@/components/SceneApiReference";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import OnboardingTour from "@/components/OnboardingTour";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { generateQuotePdf } from "@/lib/pdf";
import Link from "next/link";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAnalytics, useEditorSession } from "@/hooks/useAnalytics";
import type { KeyboardShortcut } from "@/hooks/useKeyboardShortcuts";
import type { Material, BomItem, Project } from "@/types";

/** Parse a validation warning key like "validation.typoDetected:scene" into
 *  an i18n key and parameters, then resolve via the translation function. */
function formatWarning(raw: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return t(raw);
  const key = raw.substring(0, colonIdx);
  const rest = raw.substring(colonIdx + 1);

  // Different keys use different param names
  if (key === "validation.unmatchedCloser" || key === "validation.unmatchedOpener") {
    const [char, line] = rest.split(":");
    return t(key, { char, line });
  }
  if (key === "validation.typoDetected") {
    return t(key, { name: rest });
  }
  if (key === "validation.undefinedIdentifier") {
    return t(key, { name: rest });
  }
  if (key === "validation.tooManyObjects") {
    return t(key, { count: rest });
  }
  if (key === "validation.farFromOrigin") {
    return t(key, { distance: rest });
  }
  if (key === "validation.invalidDimension") {
    return t(key, { geometry: rest });
  }
  return t(key);
}

function Viewport3DLoading() {
  const { t } = useTranslation();
  return (
    <div style={{ width: "100%", height: "100%", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
      {t('editor.loading3D')}
    </div>
  );
}

const Viewport3D = dynamic(() => import("@/components/Viewport3D"), {
  ssr: false,
  loading: () => <Viewport3DLoading />,
});

const DEFAULT_SCENE = `// Helscoop Scene Script
// Available: box(w,h,d), cylinder(r,h), sphere(r)
// Transforms: translate(mesh, x,y,z), rotate(mesh, rx,ry,rz)
// Boolean: union(a,b), subtract(a,b), intersect(a,b)
// Output: scene.add(mesh, {material: "name", color: [r,g,b]})

const floor = box(6, 0.2, 4);
const wall1 = translate(box(6, 2.8, 0.15), 0, 1.5, -1.925);
const wall2 = translate(box(6, 2.8, 0.15), 0, 1.5, 1.925);
const wall3 = translate(box(0.15, 2.8, 4), -2.925, 1.5, 0);
const wall4 = translate(box(0.15, 2.8, 4), 2.925, 1.5, 0);

scene.add(floor, { material: "foundation", color: [0.7, 0.7, 0.7] });
scene.add(wall1, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall2, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall3, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall4, { material: "lumber", color: [0.85, 0.75, 0.55] });
`;

type SaveStatus = "saved" | "saving" | "unsaved";

const HISTORY_LIMIT = 50;

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { toast } = useToast();
  const { t, locale } = useTranslation();
  const { track } = useAnalytics();
  const { markCodeEditor, markChat } = useEditorSession();

  const [project, setProject] = useState<Project | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [bom, setBom] = useState<BomItem[]>([]);
  const [sceneJs, setSceneJs] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [showBom, setShowBom] = useState(true);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [bomWidth, setBomWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("helscoop_bom_width");
      if (saved) return Math.max(260, Math.min(600, parseInt(saved, 10)));
    }
    return 340;
  });
  const [objectCount, setObjectCount] = useState(0);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [viewportKey, setViewportKey] = useState(0);
  const [sceneWarnings, setSceneWarnings] = useState<string[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);

  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bomChangedRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const captureThumbRef = useRef<(() => string | null) | null>(null);
  const resizingRef = useRef(false);

  const pushHistory = useCallback((code: string) => {
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    const newHistory = history.slice(0, idx + 1);
    newHistory.push(code);
    if (newHistory.length > HISTORY_LIMIT) {
      newHistory.shift();
    }
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      setSceneJs(historyRef.current[historyIndexRef.current]);
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      setSceneJs(historyRef.current[historyIndexRef.current]);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    Promise.all([api.getProject(projectId), api.getMaterials()])
      .then(([proj, mats]) => {
        setProject(proj);
        setProjectName(proj.name);
        setProjectDesc(proj.description || "");
        if (proj.share_token) setShareToken(proj.share_token);
        const initialScene = proj.scene_js || DEFAULT_SCENE;
        setSceneJs(initialScene);
        historyRef.current = [initialScene];
        historyIndexRef.current = 0;
        setMaterials(mats);
        if (proj.bom) setBom(proj.bom.map((b: BomItem & { line_cost?: number }) => ({
          ...b,
          total: b.total ?? b.line_cost ?? ((b.unit_price || 0) * b.quantity),
        })));
        setTimeout(() => {
          initialLoadDoneRef.current = true;
        }, 0);
      })
      .catch((err) => {
        if (err.message?.includes("401") || err.message?.includes("authorization") || err.message?.includes("Session expired")) {
          setToken(null);
          router.push("/");
        } else {
          toast(err instanceof Error ? err.message : t('toast.loadProjectFailed'), "error");
          setLoadError(true);
        }
      });
  }, [projectId, router, toast, t]);

  const save = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const savePromises: Promise<unknown>[] = [
        api.updateProject(projectId, {
          name: projectName,
          description: projectDesc,
          scene_js: sceneJs,
        }),
      ];
      if (bomChangedRef.current) {
        savePromises.push(
          api.saveBOM(
            projectId,
            bom.map((b) => ({
              material_id: b.material_id,
              quantity: b.quantity,
              unit: b.unit,
            }))
          )
        );
        bomChangedRef.current = false;
      }
      // Capture and save thumbnail in the background (non-blocking)
      const thumbDataUrl = captureThumbRef.current?.();
      if (thumbDataUrl) {
        savePromises.push(api.saveThumbnail(projectId, thumbDataUrl));
      }
      await Promise.all(savePromises);
      setLastSaved(new Date().toLocaleTimeString());
      setSaveStatus("saved");
      toast(t('toast.saved'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.saveFailed'), "error");
      setSaveStatus("unsaved");
    }
  }, [projectId, projectName, projectDesc, sceneJs, bom, toast, t]);

  const scheduleAutoSave = useCallback(() => {
    if (!initialLoadDoneRef.current) return;
    setSaveStatus("unsaved");
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      save();
    }, 2000);
  }, [save]);

  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    scheduleAutoSave();
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [sceneJs, projectName, projectDesc, bom, scheduleAutoSave]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === "unsaved" || saveStatus === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus]);

  useEffect(() => {
    if (!showExportMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-tour="export-btn"]')) setShowExportMenu(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showExportMenu]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = bomWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(260, Math.min(600, startWidth + delta));
      setBomWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setBomWidth((w) => {
        localStorage.setItem("helscoop_bom_width", String(w));
        return w;
      });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [bomWidth]);

  const handleSceneChange = useCallback(
    (code: string) => {
      setSceneJs(code);
      pushHistory(code);
    },
    [pushHistory]
  );

  const handleApplyCode = useCallback(
    (code: string) => {
      markChat();
      setSceneJs(code);
      pushHistory(code);
    },
    [pushHistory, markChat]
  );

  /* ── Keyboard shortcuts ──────────────────────────────────────── */
  const closeAllPanels = useCallback(() => {
    setShowCode(false);
    setShowShortcutsHelp(false);
    setShowExportMenu(false);
    setShowDocs(false);
  }, []);

  const shortcuts = useMemo<KeyboardShortcut[]>(() => [
    {
      key: "Cmd+S",
      mod: true,
      code: "s",
      action: save,
      descriptionKey: "shortcuts.save",
    },
    {
      key: "Cmd+B",
      mod: true,
      code: "b",
      action: () => setShowBom((v) => !v),
      descriptionKey: "shortcuts.toggleBom",
    },
    {
      key: "Cmd+Enter",
      mod: true,
      code: "Enter",
      action: () => {
        handleApplyCode(sceneJs);
      },
      descriptionKey: "shortcuts.applyCode",
    },
    {
      key: "Escape",
      mod: false,
      code: "Escape",
      action: closeAllPanels,
      descriptionKey: "shortcuts.closePanel",
    },
    {
      key: "Cmd+/",
      mod: true,
      code: "/",
      action: () => setShowShortcutsHelp((v) => !v),
      descriptionKey: "shortcuts.showShortcuts",
    },
    {
      key: "Cmd+Z",
      mod: true,
      code: "z",
      action: undo,
      descriptionKey: "shortcuts.undo",
    },
    {
      key: "Cmd+Shift+Z",
      mod: true,
      shift: true,
      code: "z",
      action: redo,
      descriptionKey: "shortcuts.redo",
    },
  ], [save, handleApplyCode, sceneJs, closeAllPanels, undo, redo]);

  useKeyboardShortcuts(shortcuts);

  const handleViewportReset = useCallback(() => {
    setSceneJs(DEFAULT_SCENE);
    pushHistory(DEFAULT_SCENE);
    setSceneError(null);
    setViewportKey((k) => k + 1);
  }, [pushHistory]);

  const addBomItem = useCallback(
    (materialId: string, quantity: number) => {
      const mat = materials.find((m) => m.id === materialId);
      if (!mat) return;
      const pricing = mat.pricing?.find((p) => p.is_primary) || mat.pricing?.[0];
      bomChangedRef.current = true;
      track("bom_item_added", { material_id: materialId, category: mat.category_name || "" });
      setBom((prev) => [
        ...prev,
        {
          material_id: materialId,
          material_name: mat.name,
          image_url: mat.image_url,
          quantity,
          unit: pricing?.unit || "kpl",
          unit_price: pricing?.unit_price || 0,
          total: (pricing?.unit_price || 0) * quantity,
          supplier: pricing?.supplier_name,
        },
      ]);
    },
    [materials, track]
  );

  const removeBomItem = useCallback((materialId: string) => {
    bomChangedRef.current = true;
    track("bom_item_removed", { material_id: materialId });
    setBom((prev) => prev.filter((b) => b.material_id !== materialId));
  }, [track]);

  const updateBomQty = useCallback((materialId: string, qty: number) => {
    bomChangedRef.current = true;
    setBom((prev) =>
      prev.map((b) =>
        b.material_id === materialId
          ? { ...b, quantity: qty, total: (b.unit_price || 0) * qty }
          : b
      )
    );
  }, []);

  if (loadError) {
    return (
      <div className="anim-up" style={{ padding: 60, textAlign: "center" }}>
        <h2 className="heading-display" style={{ marginBottom: 8 }}>{t('editor.error')}</h2>
        <p style={{ color: "var(--danger)", marginBottom: 16 }}>{t('editor.errorLoadProject')}</p>
        <button className="btn btn-primary" onClick={() => router.push("/")}>
          {t('editor.backToProjects')}
        </button>
      </div>
    );
  }

  if (!project) {
    return <SkeletonProjectEditor />;
  }

  return (
    <div className="editor-page">

      {/* Header */}
      <div className="editor-header">
        <button className="btn btn-ghost" onClick={() => router.push("/")} style={{ padding: "6px 10px" }} title={t('nav.back')} aria-label={t('nav.back')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />
        <input
          className="editor-header-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />
        <div className="editor-save-status" style={{
          color: saveStatus === "unsaved" ? "var(--warning, #e5c07b)" : saveStatus === "saving" ? "var(--accent)" : "var(--text-muted)",
        }}>
          <span className="editor-save-dot" data-status={saveStatus} />
          {saveStatus === "saving"
            ? t('editor.saving')
            : saveStatus === "saved"
              ? `${t('editor.saved')}${lastSaved ? ` ${lastSaved}` : ""}`
              : t('editor.unsaved')}
        </div>
        <div className="editor-header-actions">
          <button
            className="btn btn-ghost"
            onClick={undo}
            disabled={!canUndo}
            title={t('editor.undoShortcut')}
            aria-label={t('editor.undoShortcut')}
            style={{ padding: "5px 7px", opacity: canUndo ? 1 : 0.3 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
          <button
            className="btn btn-ghost"
            onClick={redo}
            disabled={!canRedo}
            title={t('editor.redoShortcut')}
            aria-label={t('editor.redoShortcut')}
            style={{ padding: "5px 7px", opacity: canRedo ? 1 : 0.3 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
            </svg>
          </button>
          <button
            className="btn btn-ghost"
            title={t('project.copy')}
            onClick={async () => {
              try {
                const dup = await api.duplicateProject(projectId);
                toast(t('toast.projectDuplicated'), "success");
                router.push(`/project/${dup.id}`);
              } catch (err) {
                toast(err instanceof Error ? err.message : t('toast.duplicateFailed'), "error");
              }
            }}
            style={{ padding: "5px 7px" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <div style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />
          <button
            className="btn btn-ghost"
            title={t('editor.share')}
            aria-label={t('editor.share')}
            onClick={async () => {
              if (!shareToken) {
                setShareLoading(true);
                try {
                  const res = await api.shareProject(projectId);
                  setShareToken(res.share_token);
                } catch (err) {
                  toast(err instanceof Error ? err.message : t('toast.shareFailed'), "error");
                  setShareLoading(false);
                  return;
                }
                setShareLoading(false);
              }
              setShowShareDialog(true);
            }}
            style={{ padding: "5px 7px", display: "flex", alignItems: "center", gap: 4 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {shareToken && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--forest)", flexShrink: 0 }} />
            )}
          </button>
          <div style={{ position: "relative" }} data-tour="export-btn">
            <button className="btn btn-ghost" title={t('editor.export')} aria-label={t('editor.export')} onClick={() => setShowExportMenu(v => !v)} style={{ padding: "5px 7px", display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showExportMenu && (
              <div className="dropdown-menu" style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-lg)",
                padding: 4,
                minWidth: 160,
                zIndex: 100,
              }}>
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    setShowExportMenu(false);
                    try {
                      track("bom_exported", { format: "pdf" });
                      generateQuotePdf({ projectName, projectDescription: projectDesc, bom, locale });
                      toast(t('toast.bomExported'), "success");
                    } catch (err) {
                      toast(err instanceof Error ? err.message : t('toast.bomExportFailed'), "error");
                    }
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  PDF
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    setShowExportMenu(false);
                    try {
                      track("bom_exported", { format: "csv" });
                      await api.exportBOMCsv(projectId, projectName);
                      toast(t('toast.bomExported'), "success");
                    } catch (err) {
                      toast(err instanceof Error ? err.message : t('toast.bomExportFailed'), "error");
                    }
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="3" x2="9" y2="21" />
                  </svg>
                  CSV
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    setShowExportMenu(false);
                    try {
                      track("bom_exported", { format: "json" });
                      const res = await api.exportBOM(projectId);
                      const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `bom_${projectId}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast(t('toast.bomExported'), "success");
                    } catch (err) {
                      toast(err instanceof Error ? err.message : t('toast.bomExportFailed'), "error");
                    }
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" />
                    <polyline points="16 3 16 8 21 8" />
                  </svg>
                  JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="editor-main">
        {/* Left: Viewport + Code */}
        <div className="editor-viewport-area">
          {/* Toolbar */}
          <div className="viewport-toolbar">
            <button
              className="viewport-toolbar-btn"
              data-active={showCode}
              onClick={() => { if (!showCode) markCodeEditor(); setShowCode(!showCode); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              {showCode ? t('editor.hideCode') : t('editor.showCode')}
            </button>
            <button
              className="viewport-toolbar-btn"
              data-active={wireframe}
              onClick={() => setWireframe(!wireframe)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              {t('editor.wireframe')}
            </button>
            <button
              className="viewport-toolbar-btn"
              onClick={() => {
                const container = viewportRef.current;
                if (container) {
                  const el = container.querySelector("div") as HTMLDivElement & { resetCamera?: () => void };
                  el?.resetCamera?.();
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              {t('editor.resetCamera')}
            </button>
            <button
              className="viewport-toolbar-btn"
              data-active={showDocs}
              onClick={() => setShowDocs(!showDocs)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              {t('editor.docs') || "Docs"}
            </button>
            <div style={{ flex: 1 }} />
            <span className="viewport-status" data-error={!!sceneError}>
              {sceneError
                ? `${t('editor.sceneErrorPrefix')}: ${sceneError.substring(0, 40)}${sceneError.length > 40 ? "..." : ""}`
                : t('editor.objectCount', { count: objectCount })}
            </span>
          </div>

          {/* 3D Viewport */}
          <div
            ref={viewportRef}
            data-tour="viewport"
            style={{
              flex: 1,
              minHeight: 0,
              padding: 8,
              paddingBottom: showCode ? 0 : 8,
            }}
          >
            <ErrorBoundary
              key={viewportKey}
              onReset={handleViewportReset}
              fallback={({ error, reset }) => (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div style={{ textAlign: "center", padding: 32, maxWidth: 420 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        margin: "0 auto 16px",
                        borderRadius: "50%",
                        background: "rgba(239,68,68,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <h3
                      style={{
                        color: "var(--text-primary)",
                        fontSize: 16,
                        fontWeight: 600,
                        marginBottom: 8,
                      }}
                    >
                      {t('editor.viewportCrashTitle')}
                    </h3>
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 13,
                        lineHeight: 1.5,
                        marginBottom: 8,
                      }}
                    >
                      {t('editor.viewportCrashMessage')}
                    </p>
                    <p
                      style={{
                        color: "#ef4444",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        marginBottom: 20,
                        wordBreak: "break-word",
                      }}
                    >
                      {error.message}
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={reset}
                      style={{
                        padding: "8px 20px",
                        fontSize: 13,
                      }}
                    >
                      {t('editor.resetScene')}
                    </button>
                  </div>
                </div>
              )}
            >
              <Viewport3D
                sceneJs={sceneJs}
                wireframe={wireframe}
                onObjectCount={setObjectCount}
                onError={setSceneError}
                onWarnings={setSceneWarnings}
                captureRef={captureThumbRef}
                onToggleWireframe={() => setWireframe(!wireframe)}
                projectName={projectName}
              />
            </ErrorBoundary>
          </div>

          {/* Scene validation warnings */}
          {sceneWarnings.length > 0 && (
            <div
              style={{
                padding: "6px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                flexShrink: 0,
              }}
            >
              {sceneWarnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 10px",
                    background: "var(--amber-glow)",
                    border: "1px solid var(--amber-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 12,
                    color: "var(--amber)",
                    lineHeight: 1.4,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>{formatWarning(w, t)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible Code Editor */}
          {showCode && (
            <div
              style={{
                height: 260,
                flexShrink: 0,
                padding: "0 8px 8px 8px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <SceneEditor sceneJs={sceneJs} onChange={handleSceneChange} />
            </div>
          )}

          {/* Embedded AI assistant */}
          <ChatPanel
            sceneJs={sceneJs}
            onApplyCode={handleApplyCode}
            bom={bom}
            projectName={projectName}
            projectDescription={projectDesc}
            buildingInfo={project?.building_info ?? undefined}
          />
        </div>

        {/* Resize handle + BOM panel */}
        {showBom && (
          <>
            <div
              className="resize-handle-v"
              onMouseDown={startResize}
            />
            <BomPanel
              bom={bom}
              materials={materials}
              onAdd={addBomItem}
              onRemove={removeBomItem}
              onUpdateQty={updateBomQty}
              style={{ width: bomWidth }}
            />
          </>
        )}

        {/* Scene API Reference panel */}
        {showDocs && (
          <div style={{ width: 320, flexShrink: 0, height: "100%", overflow: "hidden" }}>
            <SceneApiReference
              onInsertCode={(code) => {
                setSceneJs((prev) => prev + "\n" + code);
                pushHistory(sceneJs + "\n" + code);
                setShowCode(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Share dialog */}
      {showShareDialog && shareToken && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            animation: "fadeIn 0.15s ease both",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShareDialog(false);
          }}
        >
          <div style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
          }} />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 460,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-lg)",
              padding: "28px 28px 24px",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
              animation: "dialogSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            <h2
              className="heading-display"
              style={{ fontSize: 18, margin: "0 0 8px", color: "var(--text-primary)" }}
            >
              {t('share.title')}
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 20px", lineHeight: 1.5 }}>
              {t('share.description')}
            </p>

            {/* Share URL field */}
            <div style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
            }}>
              <input
                className="input"
                readOnly
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/shared/${shareToken}`}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  padding: "10px 12px",
                }}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  const url = `${window.location.origin}/shared/${shareToken}`;
                  navigator.clipboard.writeText(url);
                  setShareCopied(true);
                  toast(t('toast.linkCopied'), "success");
                  setTimeout(() => setShareCopied(false), 2000);
                }}
                style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, flexShrink: 0 }}
              >
                {shareCopied ? t('share.copied') : t('share.copyLink')}
              </button>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  if (!confirm(t('share.unshareConfirm'))) return;
                  try {
                    await api.unshareProject(projectId);
                    setShareToken(null);
                    setShowShareDialog(false);
                    toast(t('toast.projectUnshared'), "success");
                  } catch (err) {
                    toast(err instanceof Error ? err.message : t('toast.unshareFailed'), "error");
                  }
                }}
                style={{
                  padding: "10px 16px",
                  fontSize: 13,
                  color: "var(--danger)",
                }}
              >
                {t('share.unshare')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowShareDialog(false)}
                style={{ padding: "10px 20px", fontSize: 13 }}
              >
                {t('editor.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp
        open={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        shortcuts={shortcuts}
      />

      <OnboardingTour />
    </div>
  );
}
