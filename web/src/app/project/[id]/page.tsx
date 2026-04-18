"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { SkeletonProjectEditor } from "@/components/Skeleton";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import SceneEditor from "@/components/SceneEditor";
import BomPanel from "@/components/BomPanel";
import ChatPanel from "@/components/ChatPanel";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import type { KeyboardShortcut } from "@/hooks/useKeyboardShortcuts";
import type { Material, BomItem, Project } from "@/types";

function Viewport3DLoading() {
  const { t } = useTranslation();
  return (
    <div style={{ width: "100%", height: "100%", background: "#111113", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
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
  const [wireframe, setWireframe] = useState(false);
  const [objectCount, setObjectCount] = useState(0);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [viewportKey, setViewportKey] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bomChangedRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

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

  const handleSceneChange = useCallback(
    (code: string) => {
      setSceneJs(code);
      pushHistory(code);
    },
    [pushHistory]
  );

  const handleApplyCode = useCallback(
    (code: string) => {
      setSceneJs(code);
      pushHistory(code);
    },
    [pushHistory]
  );

  /* ── Keyboard shortcuts ──────────────────────────────────────── */
  const closeAllPanels = useCallback(() => {
    setShowCode(false);
    setShowShortcutsHelp(false);
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
    [materials]
  );

  const removeBomItem = useCallback((materialId: string) => {
    bomChangedRef.current = true;
    setBom((prev) => prev.filter((b) => b.material_id !== materialId));
  }, []);

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
        <button className="btn btn-ghost" onClick={() => router.push("/")} style={{ padding: "6px 10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ width: 1, height: 20, background: "var(--border)" }} />
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          style={{
            fontSize: 16,
            fontWeight: 600,
            fontFamily: "var(--font-display)",
            border: "none",
            background: "transparent",
            outline: "none",
            color: "var(--text-primary)",
            flex: 1,
          }}
        />
        <input
          className="editor-header-desc"
          value={projectDesc}
          onChange={(e) => setProjectDesc(e.target.value)}
          placeholder={t('project.descriptionPlaceholder')}
        />
        <div style={{ display: "flex", gap: 2 }}>
          <button
            className="btn btn-ghost"
            onClick={undo}
            disabled={!canUndo}
            title={t('editor.undoShortcut')}
            style={{ padding: "6px 8px", opacity: canUndo ? 1 : 0.3 }}
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
            style={{ padding: "6px 8px", opacity: canRedo ? 1 : 0.3 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
            </svg>
          </button>
        </div>
        <div className="editor-header-actions">
          <div style={{ width: 1, height: 20, background: "var(--border)" }} />
          <span style={{
            fontSize: 11,
            color: saveStatus === "unsaved" ? "var(--warning, #e5c07b)" : saveStatus === "saving" ? "var(--accent)" : "var(--success)",
            fontFamily: "var(--font-mono)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            {saveStatus === "saving" && (
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", animation: "pulse 1.5s infinite" }} />
            )}
            {saveStatus === "saved" && (
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--success)" }} />
            )}
            {saveStatus === "unsaved" && (
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--warning, #e5c07b)" }} />
            )}
            {saveStatus === "saving"
              ? t('editor.saving')
              : saveStatus === "saved"
                ? `${t('editor.saved')}${lastSaved ? ` ${lastSaved}` : ""}`
                : t('editor.unsaved')}
          </span>
          <button className="btn btn-primary" onClick={save} style={{ padding: "6px 16px" }}>
            {t('editor.save')}
          </button>
          <button className="btn btn-ghost" data-tour="export-btn" onClick={async () => {
            try {
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
          }}>
            {t('editor.export')}
          </button>
          <button className="btn btn-ghost" onClick={async () => {
            try {
              await api.exportPdf(projectId, projectName, locale);
            } catch (err) {
              toast(err instanceof Error ? err.message : t('toast.bomExportFailed'), "error");
            }
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 18 15 15" />
            </svg>
            {t('editor.exportPdf')}
          </button>
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </div>

      {/* Main content */}
      <div className="editor-main">
        {/* Left: Viewport + Code */}
        <div className="editor-viewport-area">
          {/* Toolbar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: "var(--bg-tertiary)",
              borderBottom: "1px solid var(--border)",
              flexShrink: 0,
            }}
          >
            <button
              className="btn"
              onClick={() => setShowCode(!showCode)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                background: showCode ? "var(--bg-hover)" : "transparent",
                color: showCode ? "var(--text-primary)" : "var(--text-muted)",
                border: showCode ? "1px solid var(--border-strong)" : "1px solid transparent",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              {showCode ? t('editor.hideCode') : t('editor.showCode')}
            </button>
            <div style={{ width: 1, height: 16, background: "var(--border)" }} />
            <button
              className="btn"
              onClick={() => setWireframe(!wireframe)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                background: wireframe ? "var(--bg-hover)" : "transparent",
                color: wireframe ? "var(--text-primary)" : "var(--text-muted)",
                border: wireframe ? "1px solid var(--border-strong)" : "1px solid transparent",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              {t('editor.wireframe')}
            </button>
            <button
              className="btn"
              onClick={() => {
                const container = viewportRef.current;
                if (container) {
                  const el = container.querySelector("div") as HTMLDivElement & { resetCamera?: () => void };
                  el?.resetCamera?.();
                }
              }}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px solid transparent",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              {t('editor.resetCamera')}
            </button>
            <div style={{ flex: 1 }} />
            <span style={{
              fontSize: 11,
              color: sceneError ? "var(--danger)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}>
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
                    background: "#111113",
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
                        color: "#fafafa",
                        fontSize: 16,
                        fontWeight: 600,
                        marginBottom: 8,
                      }}
                    >
                      {t('editor.viewportCrashTitle')}
                    </h3>
                    <p
                      style={{
                        color: "#52525b",
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
              />
            </ErrorBoundary>
          </div>

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
          <ChatPanel sceneJs={sceneJs} onApplyCode={handleApplyCode} />
        </div>

        {/* BOM panel */}
        {showBom && (
          <BomPanel
            bom={bom}
            materials={materials}
            onAdd={addBomItem}
            onRemove={removeBomItem}
            onUpdateQty={updateBomQty}
          />
        )}
      </div>

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp
        open={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        shortcuts={shortcuts}
      />
    </div>
  );
}
