"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { SkeletonProjectEditor } from "@/components/Skeleton";

interface Material {
  id: string;
  name: string;
  category_name: string;
  image_url: string | null;
  pricing: { unit_price: number; unit: string; supplier_name: string; is_primary: boolean }[] | null;
}

interface BomItem {
  id?: string;
  material_id: string;
  material_name?: string;
  image_url?: string | null;
  quantity: number;
  unit: string;
  unit_price?: number;
  total?: number;
  supplier?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  scene_js: string | null;
  display_scale: number;
  estimated_cost: number;
  updated_at: string;
  bom?: BomItem[];
}

function SceneEditor({
  sceneJs,
  onChange,
}: {
  sceneJs: string;
  onChange: (code: string) => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Kohtaus
        </span>
      </div>
      <textarea
        value={sceneJs}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          lineHeight: 1.7,
          padding: 20,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          resize: "none",
          background: "var(--bg-tertiary)",
          color: "#cdd6f4",
          outline: "none",
          tabSize: 2,
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const target = e.target as HTMLTextAreaElement;
            const start = target.selectionStart;
            const end = target.selectionEnd;
            const val = target.value;
            onChange(val.substring(0, start) + "  " + val.substring(end));
            setTimeout(() => {
              target.selectionStart = target.selectionEnd = start + 2;
            }, 0);
          }
        }}
      />
    </div>
  );
}

function BomPanel({
  bom,
  materials,
  onAdd,
  onRemove,
  onUpdateQty,
}: {
  bom: BomItem[];
  materials: Material[];
  onAdd: (materialId: string, qty: number) => void;
  onRemove: (materialId: string) => void;
  onUpdateQty: (materialId: string, qty: number) => void;
}) {
  const [selectedMat, setSelectedMat] = useState("");
  const [qty, setQty] = useState(1);

  const total = bom.reduce((sum, item) => sum + (item.total || 0), 0);

  return (
    <div
      style={{
        width: 360,
        borderLeft: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Materiaalilista</h3>
          <span className="badge badge-success" style={{ fontSize: 12, padding: "3px 10px" }}>
            {total.toFixed(2)} EUR
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {bom.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Ei materiaaleja
            </div>
          </div>
        ) : (
          bom.map((item) => (
            <div
              key={item.material_id}
              style={{
                padding: "12px 14px",
                background: "var(--bg-tertiary)",
                borderRadius: "var(--radius-sm)",
                marginBottom: 6,
                fontSize: 13,
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.material_name || ""}
                      style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: "var(--bg-elevated)", flexShrink: 0 }} />
                  )}
                  <strong style={{ fontSize: 13, fontWeight: 500 }}>{item.material_name}</strong>
                </div>
                <button
                  onClick={() => onRemove(item.material_id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--danger)",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "0 4px",
                    opacity: 0.6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
                >
                  x
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={item.quantity}
                  onChange={(e) =>
                    onUpdateQty(item.material_id, parseFloat(e.target.value) || 0)
                  }
                  style={{
                    width: 56,
                    padding: "4px 6px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "var(--text-primary)",
                    outline: "none",
                    fontFamily: "var(--font-mono)",
                  }}
                />
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {item.unit} x {(item.unit_price || 0).toFixed(2)}
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 600, color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {(item.total || 0).toFixed(2)}
                </span>
              </div>
              {item.supplier && (
                <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 6 }}>
                  {item.supplier}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          padding: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <select
          value={selectedMat}
          onChange={(e) => setSelectedMat(e.target.value)}
          style={{
            flex: 1,
            padding: "7px 8px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            color: "var(--text-primary)",
            outline: "none",
          }}
        >
          <option value="">Lisaa materiaali...</option>
          {materials
            .filter((m) => !bom.some((b) => b.material_id === m.id))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(parseInt(e.target.value) || 1)}
          style={{
            width: 48,
            padding: "7px 6px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            color: "var(--text-primary)",
            outline: "none",
            fontFamily: "var(--font-mono)",
          }}
        />
        <button
          className={`btn ${selectedMat ? "btn-primary" : ""}`}
          onClick={() => {
            if (selectedMat) {
              onAdd(selectedMat, qty);
              setSelectedMat("");
              setQty(1);
            }
          }}
          disabled={!selectedMat}
          style={{
            padding: "7px 14px",
            fontSize: 12,
            opacity: selectedMat ? 1 : 0.4,
          }}
        >
          Lisaa
        </button>
      </div>
    </div>
  );
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function ChatPanel({
  sceneJs,
  onApplyCode,
}: {
  sceneJs: string;
  onApplyCode: (code: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const reply = await api.chat(newMessages, sceneJs);
      setMessages([...newMessages, reply]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "AI-avustajan virhe / AI assistant error", "error");
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Jokin meni pieleen. Yrita uudelleen." },
      ]);
    }
    setLoading(false);
  }

  function extractCode(content: string): string | null {
    const match = content.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
    return match ? match[1].trim() : null;
  }

  return (
    <div
      className="animate-slide"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-secondary)",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        AI-avustaja
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "24px 12px", textAlign: "center", lineHeight: 2 }}>
            Kuvaile mita haluat rakentaa tai muuttaa.
            <br />
            <span style={{ color: "#c4915c", opacity: 0.7 }}>
              &ldquo;Lisaa katto rakennukseen&rdquo;
            </span>
            <br />
            <span style={{ color: "#c4915c", opacity: 0.7 }}>
              &ldquo;Lisaa ikkuna takaseinaan&rdquo;
            </span>
          </div>
        )}
        {messages.map((msg, i) => {
          const code = msg.role === "assistant" ? extractCode(msg.content) : null;
          const textContent = msg.content
            .replace(/```(?:javascript|js)?\n[\s\S]*?```/g, "[code block]")
            .trim();

          return (
            <div
              key={i}
              className="animate-in"
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  fontSize: 13,
                  lineHeight: 1.5,
                  background: msg.role === "user" ? "var(--accent)" : "var(--bg-elevated)",
                  color: msg.role === "user" ? "#fff" : "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {textContent}
              </div>
              {code && (
                <button
                  className="btn"
                  onClick={() => onApplyCode(code)}
                  style={{
                    marginTop: 6,
                    padding: "4px 10px",
                    background: "var(--success-muted)",
                    color: "var(--success)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Aseta kohtaukseen
                </button>
              )}
            </div>
          );
        })}
        {loading && (
          <div style={{ color: "var(--accent)", fontSize: 13, padding: 8 }}>
            <span style={{ animation: "pulse 1.5s infinite" }}>Mietitaan...</span>
          </div>
        )}
      </div>
      <div
        style={{
          padding: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: 6,
        }}
      >
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Kuvaile muutos..."
          style={{ flex: 1, padding: "8px 12px", fontSize: 13 }}
        />
        <button
          className="btn btn-primary"
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            opacity: loading || !input.trim() ? 0.4 : 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

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

  const [project, setProject] = useState<Project | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [bom, setBom] = useState<BomItem[]>([]);
  const [sceneJs, setSceneJs] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [showChat, setShowChat] = useState(false);

  // Undo/redo history for scene script
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);

  // Debounce timer for auto-save
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether BOM changed since last save
  const bomChangedRef = useRef(false);
  // Track whether initial load is done (to avoid auto-saving on mount)
  const initialLoadDoneRef = useRef(false);

  // Push a scene script entry to the history stack
  const pushHistory = useCallback((code: string) => {
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    // Remove any forward history when a new change is made
    const newHistory = history.slice(0, idx + 1);
    newHistory.push(code);
    // Enforce limit
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
        // Initialize history with the loaded scene
        historyRef.current = [initialScene];
        historyIndexRef.current = 0;
        setMaterials(mats);
        if (proj.bom) setBom(proj.bom);
        // Mark initial load as done after a tick so auto-save doesn't fire for initial state
        setTimeout(() => {
          initialLoadDoneRef.current = true;
        }, 0);
      })
      .catch((err) => {
        if (err.message?.includes("401") || err.message?.includes("authorization") || err.message?.includes("Session expired")) {
          setToken(null);
          router.push("/");
        } else {
          toast(err instanceof Error ? err.message : "Projektin lataus epaonnistui / Failed to load project", "error");
          setLoadError(true);
        }
      });
  }, [projectId, router, toast]);

  // Save function (used by both auto-save and manual save)
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
      toast("Tallennettu / Saved", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Tallennus epaonnistui / Save failed", "error");
      setSaveStatus("unsaved");
    }
  }, [projectId, projectName, projectDesc, sceneJs, bom, toast]);

  // Schedule auto-save (debounced 2 seconds)
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

  // Auto-save when project data changes
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    scheduleAutoSave();
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [sceneJs, projectName, projectDesc, bom, scheduleAutoSave]);

  // beforeunload warning for unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === "unsaved" || saveStatus === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "z" && !e.shiftKey) {
        // Only intercept if the active element is not the scene textarea
        // Actually, we want undo/redo for scene regardless
        e.preventDefault();
        undo();
      } else if (isMod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  // Handle scene changes: push to history and update state
  const handleSceneChange = useCallback(
    (code: string) => {
      setSceneJs(code);
      pushHistory(code);
    },
    [pushHistory]
  );

  // Handle AI chat applying code: push to history as single unit
  const handleApplyCode = useCallback(
    (code: string) => {
      setSceneJs(code);
      pushHistory(code);
    },
    [pushHistory]
  );


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
        <h2 className="heading-display" style={{ marginBottom: 8 }}>Virhe</h2>
        <p style={{ color: "var(--danger)", marginBottom: 16 }}>Projektia ei voitu ladata / Could not load project</p>
        <button className="btn btn-primary" onClick={() => router.push("/")}>
          Takaisin projekteihin
        </button>
      </div>
    );
  }

  if (!project) {
    return <SkeletonProjectEditor />;
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 16px",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
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
          value={projectDesc}
          onChange={(e) => setProjectDesc(e.target.value)}
          placeholder="Kuvaus..."
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            border: "none",
            background: "transparent",
            outline: "none",
            width: 180,
          }}
        />
        {/* Undo/Redo buttons */}
        <div style={{ display: "flex", gap: 2 }}>
          <button
            className="btn btn-ghost"
            onClick={undo}
            disabled={!canUndo}
            title="Kumoa (Ctrl+Z)"
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
            title="Tee uudelleen (Ctrl+Shift+Z)"
            style={{ padding: "6px 8px", opacity: canRedo ? 1 : 0.3 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
            </svg>
          </button>
        </div>
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
            ? "Tallentaa..."
            : saveStatus === "saved"
              ? `Tallennettu${lastSaved ? ` ${lastSaved}` : ""}`
              : "Ei tallennettu"}
        </span>
        <button className="btn" onClick={save} style={{ padding: "6px 16px", background: "linear-gradient(135deg, #c4915c 0%, #a67745 100%)", color: "#fff", border: "none" }}>
          Tallenna
        </button>
        <button className="btn btn-ghost" onClick={async () => {
          try {
            const res = await api.exportBOM(projectId);
            const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `bom_${projectId}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast("BOM viety / BOM exported", "success");
          } catch (err) {
            toast(err instanceof Error ? err.message : "BOM-vienti epaonnistui / BOM export failed", "error");
          }
        }}>
          Vie BOM
        </button>
        <button
          className="btn"
          onClick={() => setShowChat(!showChat)}
          style={{
            padding: "6px 12px",
            background: showChat ? "#c4915c" : "rgba(196,145,92,0.12)",
            color: showChat ? "#fff" : "#c4915c",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Avustaja
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: 16,
            gap: 12,
          }}
        >
          <SceneEditor sceneJs={sceneJs} onChange={handleSceneChange} />
        </div>
        {showChat && (
          <div style={{ width: 340, borderLeft: "1px solid var(--border)", flexShrink: 0 }}>
            <ChatPanel sceneJs={sceneJs} onApplyCode={handleApplyCode} />
          </div>
        )}
        <BomPanel
          bom={bom}
          materials={materials}
          onAdd={addBomItem}
          onRemove={removeBomItem}
          onUpdateQty={updateBomQty}
        />
      </div>
    </div>
  );
}
