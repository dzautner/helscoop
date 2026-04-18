"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";

interface Material {
  id: string;
  name: string;
  category_name: string;
  pricing: { unit_price: number; unit: string; supplier_name: string; is_primary: boolean }[] | null;
}

interface BomItem {
  id?: string;
  material_id: string;
  material_name?: string;
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
      <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#666" }}>
        Scene Script (JavaScript)
      </h3>
      <textarea
        value={sceneJs}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          fontFamily: "ui-monospace, 'Cascadia Code', Menlo, monospace",
          fontSize: 13,
          lineHeight: 1.5,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 8,
          resize: "none",
          background: "#1e1e2e",
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
        borderLeft: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
      }}
    >
      <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid #e5e7eb" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Bill of Materials</h3>
        <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
          Est. total:{" "}
          <strong style={{ color: "#059669" }}>{total.toFixed(2)} EUR</strong>
        </p>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {bom.length === 0 ? (
          <p style={{ color: "#999", textAlign: "center", padding: 20, fontSize: 13 }}>
            No materials added yet.
          </p>
        ) : (
          bom.map((item) => (
            <div
              key={item.material_id}
              style={{
                padding: "10px 12px",
                background: "#f9fafb",
                borderRadius: 8,
                marginBottom: 8,
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong>{item.material_name}</strong>
                <button
                  onClick={() => onRemove(item.material_id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontSize: 16,
                    padding: "0 4px",
                  }}
                >
                  x
                </button>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <input
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={item.quantity}
                  onChange={(e) =>
                    onUpdateQty(item.material_id, parseFloat(e.target.value) || 0)
                  }
                  style={{
                    width: 60,
                    padding: "4px 6px",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    fontSize: 13,
                  }}
                />
                <span style={{ color: "#666" }}>
                  {item.unit} x {(item.unit_price || 0).toFixed(2)} EUR
                </span>
                <span style={{ marginLeft: "auto", fontWeight: 600 }}>
                  {(item.total || 0).toFixed(2)}
                </span>
              </div>
              {item.supplier && (
                <div style={{ color: "#999", fontSize: 11, marginTop: 4 }}>
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
          borderTop: "1px solid #e5e7eb",
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
            padding: "6px 8px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          <option value="">Add material...</option>
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
            width: 50,
            padding: "6px 8px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 13,
          }}
        />
        <button
          onClick={() => {
            if (selectedMat) {
              onAdd(selectedMat, qty);
              setSelectedMat("");
              setQty(1);
            }
          }}
          disabled={!selectedMat}
          style={{
            padding: "6px 14px",
            background: selectedMat ? "#2563eb" : "#e5e7eb",
            color: selectedMat ? "#fff" : "#999",
            border: "none",
            borderRadius: 6,
            cursor: selectedMat ? "pointer" : "default",
            fontSize: 13,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

const DEFAULT_SCENE = `// DingCAD Scene Script
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

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [bom, setBom] = useState<BomItem[]>([]);
  const [sceneJs, setSceneJs] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");

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
        setSceneJs(proj.scene_js || DEFAULT_SCENE);
        setMaterials(mats);
        if (proj.bom) setBom(proj.bom);
      })
      .catch((err) => {
        if (err.message?.includes("401") || err.message?.includes("authorization")) {
          setToken(null);
          router.push("/");
        } else {
          setError(err.message);
        }
      });
  }, [projectId, router]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.updateProject(projectId, {
        name: projectName,
        description: projectDesc,
        scene_js: sceneJs,
      });
      setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
    setSaving(false);
  }, [projectId, projectName, projectDesc, sceneJs]);

  const addBomItem = useCallback(
    (materialId: string, quantity: number) => {
      const mat = materials.find((m) => m.id === materialId);
      if (!mat) return;
      const pricing = mat.pricing?.find((p) => p.is_primary) || mat.pricing?.[0];
      setBom((prev) => [
        ...prev,
        {
          material_id: materialId,
          material_name: mat.name,
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
    setBom((prev) => prev.filter((b) => b.material_id !== materialId));
  }, []);

  const updateBomQty = useCallback((materialId: string, qty: number) => {
    setBom((prev) =>
      prev.map((b) =>
        b.material_id === materialId
          ? { ...b, quantity: qty, total: (b.unit_price || 0) * qty }
          : b
      )
    );
  }, []);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>Error</h2>
        <p style={{ color: "#dc2626" }}>{error}</p>
        <button
          onClick={() => router.push("/")}
          style={{
            padding: "8px 16px",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Back to Projects
        </button>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
        Loading project...
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f5f5f5",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "1px solid #ddd",
            padding: "6px 12px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Back
        </button>
        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          style={{
            fontSize: 18,
            fontWeight: 600,
            border: "none",
            background: "transparent",
            outline: "none",
            flex: 1,
          }}
        />
        <input
          value={projectDesc}
          onChange={(e) => setProjectDesc(e.target.value)}
          placeholder="Description..."
          style={{
            fontSize: 13,
            color: "#666",
            border: "none",
            background: "transparent",
            outline: "none",
            width: 200,
          }}
        />
        <span style={{ fontSize: 12, color: "#999" }}>
          {saving
            ? "Saving..."
            : lastSaved
            ? `Saved ${lastSaved}`
            : ""}
        </span>
        <button
          onClick={save}
          style={{
            padding: "6px 16px",
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Save
        </button>
        <button
          onClick={async () => {
            const res = await api.exportBOM(projectId);
            const blob = new Blob([JSON.stringify(res, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `bom_${projectId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{
            padding: "6px 12px",
            background: "#f3f4f6",
            border: "1px solid #ddd",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Export BOM
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
          <SceneEditor sceneJs={sceneJs} onChange={setSceneJs} />
        </div>
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
