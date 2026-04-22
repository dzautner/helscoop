"use client";

import { useEffect, useRef, useCallback, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { evaluateSceneWorker, initWorker } from "@/lib/manifold-worker-client";
import type { TessellatedObject, EvaluateOptions } from "@/lib/manifold-engine";
import { useTranslation } from "@/components/LocaleProvider";
import ViewportContextMenu, { type ContextMenuItem } from "@/components/ViewportContextMenu";
import ScreenshotPopover from "@/components/ScreenshotPopover";
import { shortcutLabel } from "@/lib/shortcut-label";
import { getPresentationPreset, type PresentationPresetId } from "@/lib/presentation-export";
import { useAmbientSound } from "@/hooks/useAmbientSound";
import ViewCube from "@/components/ViewCube";

export interface ViewportPresentationApi {
  captureFrame: (options?: {
    presetId?: PresentationPresetId;
    width?: number;
    height?: number;
    watermark?: boolean;
  }) => string | null;
  focusPreset: (presetId: PresentationPresetId) => void;
}

export interface ViewportMaterialSelection {
  materialId: string;
  objectId?: string;
  point: [number, number, number];
  clientX: number;
  clientY: number;
}

interface Viewport3DProps {
  sceneJs: string;
  wireframe?: boolean;
  onObjectCount?: (count: number) => void;
  onError?: (error: string | null) => void;
  onErrorLine?: (line: number | null) => void;
  onWarnings?: (warnings: string[]) => void;
  captureRef?: React.MutableRefObject<(() => string | null) | null>;
  presentationRef?: React.MutableRefObject<ViewportPresentationApi | null>;
  initialPresentationPreset?: PresentationPresetId;
  onToggleWireframe?: () => void;
  onMaterialSurfaceSelect?: (selection: ViewportMaterialSelection) => void;
  projectName?: string;
}

interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  key: string;
}

type MeasurementUnit = "mm" | "cm" | "m";

interface Measurement {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

const MEASUREMENT_UNITS: MeasurementUnit[] = ["mm", "cm", "m"];
const VIEWPORT_KEY_ROTATION_STEP = Math.PI / 18;
const VIEWPORT_KEY_ZOOM_IN = 0.88;
const VIEWPORT_KEY_ZOOM_OUT = 1.12;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatMeasurementDistance(distanceMeters: number, unit: MeasurementUnit, locale: string): string {
  const localeTag = locale === "fi" ? "fi-FI" : "en-GB";
  if (unit === "mm") {
    return `${Math.round(distanceMeters * 1000).toLocaleString(localeTag)} mm`;
  }
  if (unit === "cm") {
    return `${(distanceMeters * 100).toLocaleString(localeTag, { maximumFractionDigits: 1 })} cm`;
  }
  return `${distanceMeters.toLocaleString(localeTag, { maximumFractionDigits: 3 })} m`;
}

function disposeMeasurementGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child instanceof THREE.Line || child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  }
}

const CAMERA_PRESETS: CameraPreset[] = [
  { position: [0, 2, 8], target: [0, 1.5, 0], key: "editor.cameraFront" },
  { position: [8, 2, 0], target: [0, 1.5, 0], key: "editor.cameraSide" },
  { position: [0, 10, 0.01], target: [0, 0, 0], key: "editor.cameraTop" },
  { position: [5, 4, 5], target: [0, 1.5, 0], key: "editor.cameraIso" },
];

function disposeObject(obj: THREE.Object3D) {
  while (obj.children.length > 0) {
    const child = obj.children[0];
    disposeObject(child);
    obj.remove(child);
  }
  if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
    obj.geometry.dispose();
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m.dispose());
    } else if (obj.material) {
      (obj.material as THREE.Material).dispose();
    }
  }
}

interface MaterialPBR {
  roughness: number;
  metalness: number;
  opacity?: number;
  transparent?: boolean;
}

const MATERIAL_PBR: Record<string, MaterialPBR> = {
  galvanized_roofing: { roughness: 0.35, metalness: 0.85 },
  galvanized_flashing: { roughness: 0.3, metalness: 0.8 },
  hardware_cloth: { roughness: 0.5, metalness: 0.6, opacity: 0.7, transparent: true },
  hinges_galvanized: { roughness: 0.4, metalness: 0.75 },
  joist_hanger: { roughness: 0.45, metalness: 0.7 },
  screws_50mm: { roughness: 0.35, metalness: 0.8 },
  concrete_block: { roughness: 0.95, metalness: 0.0 },
  builders_sand: { roughness: 0.98, metalness: 0.0 },
  vapor_barrier: { roughness: 0.2, metalness: 0.1, opacity: 0.85, transparent: true },
  insulation_100mm: { roughness: 0.9, metalness: 0.0 },
  exterior_paint_red: { roughness: 0.6, metalness: 0.02 },
  exterior_paint_yellow: { roughness: 0.6, metalness: 0.02 },
  exterior_paint_gray_door: { roughness: 0.55, metalness: 0.03 },
  exterior_paint_white: { roughness: 0.55, metalness: 0.02 },
  osb_9mm: { roughness: 0.85, metalness: 0.0 },
  osb_18mm: { roughness: 0.85, metalness: 0.0 },
  door_thermal_bridge: { roughness: 0.5, metalness: 0.1 },
  vent_thermal_bridge: { roughness: 0.5, metalness: 0.15 },
};

function getMaterialPBR(materialId: string): MaterialPBR {
  return MATERIAL_PBR[materialId] || { roughness: 0.7, metalness: 0.05 };
}

function addSingleTessellatedMesh(
  parent: THREE.Group,
  tess: TessellatedObject,
  wireframe: boolean
): void {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(tess.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(tess.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(tess.indices, 1));

  const pbr = getMaterialPBR(tess.material);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tess.color[0], tess.color[1], tess.color[2]),
    roughness: pbr.roughness,
    metalness: pbr.metalness,
    wireframe,
    ...(pbr.transparent ? { transparent: true, opacity: pbr.opacity ?? 1 } : {}),
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.materialId = tess.material;
  mesh.userData.objectId = tess.objectId;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function addTessellatedMeshes(
  parent: THREE.Group,
  meshes: TessellatedObject[],
  wireframe: boolean
): number {
  for (const tess of meshes) {
    addSingleTessellatedMesh(parent, tess, wireframe);
  }
  return meshes.length;
}

function animateCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  toPos: [number, number, number],
  toTarget: [number, number, number],
  duration = 400
) {
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const endPos = new THREE.Vector3(...toPos);
  const endTarget = new THREE.Vector3(...toTarget);

  if (duration <= 0 || prefersReducedMotion()) {
    camera.position.copy(endPos);
    controls.target.copy(endTarget);
    controls.update();
    return;
  }

  const startTime = performance.now();

  function step() {
    const elapsed = performance.now() - startTime;
    const raw = Math.min(elapsed / duration, 1);
    const t = 1 - Math.pow(1 - raw, 3);

    camera.position.lerpVectors(startPos, endPos, t);
    controls.target.lerpVectors(startTarget, endTarget, t);
    controls.update();

    if (raw < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

function computePresets(bounds: { center: THREE.Vector3; size: number } | null): CameraPreset[] {
  if (!bounds) {
    return [
      { position: [0, 2, 8], target: [0, 1.5, 0], key: "editor.cameraFront" },
      { position: [8, 2, 0], target: [0, 1.5, 0], key: "editor.cameraSide" },
      { position: [0, 10, 0.01], target: [0, 0, 0], key: "editor.cameraTop" },
      { position: [5, 4, 5], target: [0, 1.5, 0], key: "editor.cameraIso" },
    ];
  }
  const { center, size } = bounds;
  const d = size * 1.2;
  const cx = center.x, cy = center.y, cz = center.z;
  return [
    { position: [cx, cy + d * 0.15, cz + d], target: [cx, cy, cz], key: "editor.cameraFront" },
    { position: [cx + d, cy + d * 0.15, cz], target: [cx, cy, cz], key: "editor.cameraSide" },
    { position: [cx, cy + d, cz + 0.01], target: [cx, cy, cz], key: "editor.cameraTop" },
    { position: [cx + d * 0.55, cy + d * 0.45, cz + d * 0.55], target: [cx, cy, cz], key: "editor.cameraIso" },
  ];
}

function applyCameraPreset(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  bounds: { center: THREE.Vector3; size: number } | null,
  presetId: PresentationPresetId,
  animated = true,
) {
  const preset = getPresentationPreset(presetId);
  const cameraPreset = computePresets(bounds)[preset.cameraIndex];
  if (animated) {
    animateCamera(camera, controls, cameraPreset.position, cameraPreset.target);
    return;
  }
  camera.position.set(...cameraPreset.position);
  controls.target.set(...cameraPreset.target);
  camera.lookAt(...cameraPreset.target);
  controls.update();
}

function CameraToolbar({
  cameraRef,
  controlsRef,
  rendererRef,
  sceneRef,
  projectName,
  sceneBoundsRef,
  measurementMode,
  measurementUnit,
  measurementCount,
  onToggleMeasurementMode,
  onClearMeasurements,
  onCycleMeasurementUnit,
  sectionMode,
  sectionAxis,
  sectionPos,
  onToggleSectionMode,
  onCycleSectionAxis,
  onSetSectionPos,
}: {
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  controlsRef: React.RefObject<OrbitControls | null>;
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>;
  sceneRef: React.RefObject<THREE.Scene | null>;
  projectName?: string;
  sceneBoundsRef: React.RefObject<{ center: THREE.Vector3; size: number } | null>;
  measurementMode: boolean;
  measurementUnit: MeasurementUnit;
  measurementCount: number;
  onToggleMeasurementMode: () => void;
  onClearMeasurements: () => void;
  onCycleMeasurementUnit: () => void;
  sectionMode: boolean;
  sectionAxis: "x" | "y" | "z";
  sectionPos: number;
  onToggleSectionMode: () => void;
  onCycleSectionAxis: () => void;
  onSetSectionPos: (pos: number) => void;
}) {
  const { t } = useTranslation();
  const { play: playSfx } = useAmbientSound();
  const [activePreset, setActivePreset] = useState(3);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);

  const handlePreset = useCallback(
    (preset: CameraPreset, index: number) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      setActivePreset(index);
      const presets = computePresets(sceneBoundsRef.current);
      animateCamera(camera, controls, presets[index].position, presets[index].target);
      playSfx("cameraSnap");
    },
    [cameraRef, controlsRef, sceneBoundsRef, playSfx]
  );

  const handleScreenshot = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    renderer.render(scene, camera);

    const canvas = renderer.domElement;
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);

    const fontSize = Math.max(12, Math.round(canvas.height * 0.018));
    ctx.font = `${fontSize}px "SF Mono", "Fira Code", "Cascadia Code", monospace`;
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(
      "helscoop.fi",
      canvas.width - fontSize,
      canvas.height - fontSize * 0.6
    );

    setScreenshotDataUrl(offscreen.toDataURL("image/png"));
  }, [rendererRef, sceneRef, cameraRef]);

  return (
    <>
      <div className="viewport-cam-bar">
        {CAMERA_PRESETS.map((preset, i) => (
          <button
            key={i}
            className="viewport-cam-btn"
            data-active={i === activePreset}
            onClick={() => handlePreset(preset, i)}
            data-tooltip={t(preset.key)}
            aria-label={t(preset.key)}
          >
            {t(preset.key)}
          </button>
        ))}
        <button
          className="viewport-cam-btn"
          data-active={screenshotDataUrl !== null}
          onClick={handleScreenshot}
          data-tooltip={`${t("editor.screenshot")} (${shortcutLabel("Cmd+Shift+S")})`}
          aria-label={t("editor.screenshotAriaLabel")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        <button
          className="viewport-cam-btn"
          data-active={measurementMode}
          onClick={onToggleMeasurementMode}
          data-tooltip={`${t("editor.ruler")} (R)`}
          aria-label={t("editor.rulerTooltip")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17L17 3l4 4L7 21l-4-4z" />
            <path d="M14 6l4 4M11 9l2 2M8 12l4 4M5 15l2 2" />
          </svg>
        </button>
        {measurementCount > 0 && (
          <button
            className="viewport-cam-btn"
            onClick={onClearMeasurements}
            data-tooltip={t("editor.measureClear")}
            aria-label={t("editor.measureClear")}
          >
            {t("editor.measureClearShort")}
          </button>
        )}
        {measurementMode && (
          <button
            className="viewport-cam-btn"
            onClick={onCycleMeasurementUnit}
            data-tooltip={t("editor.measureUnit")}
            aria-label={t("editor.measureUnit")}
          >
            {measurementUnit}
          </button>
        )}
        <button
          className="viewport-cam-btn"
          data-active={sectionMode}
          onClick={onToggleSectionMode}
          data-tooltip={`${t("editor.sectionViewTooltip")} (X)`}
          aria-label={t("editor.sectionView")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        </button>
        {sectionMode && (
          <>
            <button
              className="viewport-cam-btn"
              onClick={onCycleSectionAxis}
              data-tooltip={t("editor.sectionAxisLabel")}
              aria-label={t("editor.sectionAxisLabel")}
            >
              {sectionAxis.toUpperCase()}
            </button>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.1}
              value={sectionPos}
              onChange={(e) => onSetSectionPos(parseFloat(e.target.value))}
              aria-label={t("editor.sectionPositionLabel")}
              style={{ width: 80, accentColor: "var(--accent)" }}
            />
          </>
        )}
      </div>
      <ScreenshotPopover
        imageDataUrl={screenshotDataUrl}
        projectName={projectName}
        onClose={() => setScreenshotDataUrl(null)}
      />
    </>
  );
}

export default function Viewport3D({
  sceneJs,
  wireframe = false,
  onObjectCount,
  onError,
  onErrorLine,
  onWarnings,
  captureRef,
  presentationRef,
  initialPresentationPreset,
  onToggleWireframe,
  onMaterialSurfaceSelect,
  projectName,
}: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const objectGroupRef = useRef<THREE.Group | null>(null);
  const measurementGroupRef = useRef<THREE.Group | null>(null);
  const measurementsRef = useRef<Measurement[]>([]);
  const previewMeasurementRef = useRef<Measurement | null>(null);
  const measurementLabelRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const surfacePointerDownRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const animFrameRef = useRef<number>(0);
  const viewportDescriptionId = useId();
  const lastValidSceneRef = useRef<string>(sceneJs);
  const sceneBoundsRef = useRef<{ center: THREE.Vector3; size: number } | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [tessProgress, setTessProgress] = useState<{ done: number; total: number } | null>(null);
  const [measurementMode, setMeasurementMode] = useState(false);
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("mm");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementStart, setMeasurementStart] = useState<THREE.Vector3 | null>(null);
  const [measurementPreviewEnd, setMeasurementPreviewEnd] = useState<THREE.Vector3 | null>(null);
  const [sectionMode, setSectionMode] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<"x" | "y" | "z">("z");
  const [sectionPos, setSectionPos] = useState(0);
  const clippingPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, -1), 0));
  const updateIdRef = useRef(0);
  const hasAppliedInitialPresentationPresetRef = useRef(false);
  const { t, locale } = useTranslation();

  useEffect(() => {
    hasAppliedInitialPresentationPresetRef.current = false;
  }, [initialPresentationPreset]);

  // Pre-load Manifold WASM on mount
  useEffect(() => {
    initWorker().catch(() => {});
  }, []);

  const setMeasurementLabelRef = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) measurementLabelRefs.current.set(id, node);
    else measurementLabelRefs.current.delete(id);
  }, []);

  const updateMeasurementLabelPositions = useCallback(() => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const container = containerRef.current;
    if (!camera || !renderer || !container) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const allMeasurements = previewMeasurementRef.current
      ? [...measurementsRef.current, previewMeasurementRef.current]
      : measurementsRef.current;

    for (const measurement of allMeasurements) {
      const node = measurementLabelRefs.current.get(measurement.id);
      if (!node) continue;
      const midpoint = measurement.start.clone().add(measurement.end).multiplyScalar(0.5);
      const projected = midpoint.project(camera);
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      node.style.opacity = projected.z > 1 ? "0" : "1";
    }
  }, []);

  const pickMeasurementPoint = useCallback((clientX: number, clientY: number): THREE.Vector3 | null => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const group = objectGroupRef.current;
    if (!renderer || !camera || !group) return null;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersections = raycaster.intersectObjects(group.children, true);
    const hit = intersections[0];
    if (!hit) return null;

    const mesh = hit.object instanceof THREE.Mesh ? hit.object : null;
    const position = mesh?.geometry.getAttribute("position");
    if (!mesh || !position) return hit.point.clone();

    let nearest: THREE.Vector3 | null = null;
    let nearestDistanceSq = 25;
    const vertex = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    const edgeC = new THREE.Vector3();
    const screenA = new THREE.Vector2();
    const screenB = new THREE.Vector2();
    const step = Math.max(1, Math.ceil(position.count / 25000));
    const toScreenPoint = (worldPoint: THREE.Vector3, target: THREE.Vector2) => {
      projected.copy(worldPoint).project(camera);
      target.set(
        (projected.x * 0.5 + 0.5) * rect.width + rect.left,
        (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
      );
    };
    const considerVertex = (worldPoint: THREE.Vector3) => {
      toScreenPoint(worldPoint, screenA);
      const dx = screenA.x - clientX;
      const dy = screenA.y - clientY;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistanceSq) {
        nearestDistanceSq = distSq;
        nearest = worldPoint.clone();
      }
    };
    const considerEdge = (start: THREE.Vector3, end: THREE.Vector3) => {
      toScreenPoint(start, screenA);
      toScreenPoint(end, screenB);
      const abx = screenB.x - screenA.x;
      const aby = screenB.y - screenA.y;
      const lengthSq = abx * abx + aby * aby;
      if (lengthSq < 0.0001) return;
      const ratio = Math.max(
        0,
        Math.min(1, ((clientX - screenA.x) * abx + (clientY - screenA.y) * aby) / lengthSq),
      );
      const sx = screenA.x + abx * ratio;
      const sy = screenA.y + aby * ratio;
      const dx = sx - clientX;
      const dy = sy - clientY;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistanceSq) {
        nearestDistanceSq = distSq;
        nearest = start.clone().lerp(end, ratio);
      }
    };

    for (let i = 0; i < position.count; i += step) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      considerVertex(vertex);
    }

    const index = mesh.geometry.getIndex();
    const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3);
    const triangleStep = Math.max(1, Math.ceil(triangleCount / 25000));
    const readVertex = (vertexIndex: number, target: THREE.Vector3) => {
      target.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
    };
    for (let triangle = 0; triangle < triangleCount; triangle += triangleStep) {
      const base = triangle * 3;
      const ia = index ? index.getX(base) : base;
      const ib = index ? index.getX(base + 1) : base + 1;
      const ic = index ? index.getX(base + 2) : base + 2;
      readVertex(ia, edgeA);
      readVertex(ib, edgeB);
      readVertex(ic, edgeC);
      considerEdge(edgeA, edgeB);
      considerEdge(edgeB, edgeC);
      considerEdge(edgeC, edgeA);
    }

    return nearest ?? hit.point.clone();
  }, []);

  const pickMaterialSurface = useCallback((clientX: number, clientY: number): ViewportMaterialSelection | null => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const group = objectGroupRef.current;
    if (!renderer || !camera || !group) return null;

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersections = raycaster.intersectObjects(group.children, true);
    const hit = intersections.find((candidate) => {
      const materialId = candidate.object.userData.materialId;
      return typeof materialId === "string" && materialId.length > 0 && materialId !== "default";
    });
    if (!hit) return null;

    return {
      materialId: hit.object.userData.materialId,
      objectId: hit.object.userData.objectId,
      point: [hit.point.x, hit.point.y, hit.point.z],
      clientX,
      clientY,
    };
  }, []);

  const rebuildMeasurementVisuals = useCallback(() => {
    const group = measurementGroupRef.current;
    if (!group) return;
    disposeMeasurementGroup(group);

    const allMeasurements = previewMeasurementRef.current
      ? [...measurementsRef.current, previewMeasurementRef.current]
      : measurementsRef.current;

    for (const measurement of allMeasurements) {
      const isPreview = measurement.id === "preview";
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([measurement.start, measurement.end]);
      const lineMaterial = new THREE.LineDashedMaterial({
        color: isPreview ? 0xffffff : 0xe5a04b,
        dashSize: 0.08,
        gapSize: 0.04,
        transparent: true,
        opacity: isPreview ? 0.65 : 0.95,
        depthTest: false,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      line.computeLineDistances();
      line.renderOrder = 999;
      group.add(line);

      const direction = measurement.end.clone().sub(measurement.start);
      const distance = direction.length();
      if (distance > 0.01) {
        const normalized = direction.normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const addArrowhead = (point: THREE.Vector3, vector: THREE.Vector3) => {
          const height = 0.16;
          const arrowGeometry = new THREE.ConeGeometry(0.055, height, 14);
          const arrowMaterial = new THREE.MeshBasicMaterial({
            color: isPreview ? 0xffffff : 0xe5a04b,
            transparent: true,
            opacity: isPreview ? 0.7 : 1,
            depthTest: false,
          });
          const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
          arrow.quaternion.setFromUnitVectors(up, vector);
          arrow.position.copy(point).addScaledVector(vector, -height / 2);
          arrow.renderOrder = 1000;
          group.add(arrow);
        };
        addArrowhead(measurement.end, normalized);
        addArrowhead(measurement.start, normalized.clone().multiplyScalar(-1));
      }

      for (const point of [measurement.start, measurement.end]) {
        const markerGeometry = new THREE.SphereGeometry(0.045, 12, 12);
        const markerMaterial = new THREE.MeshBasicMaterial({
          color: isPreview ? 0xffffff : 0xe5a04b,
          transparent: true,
          opacity: isPreview ? 0.7 : 1,
          depthTest: false,
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(point);
        marker.renderOrder = 1000;
        group.add(marker);
      }
    }
    updateMeasurementLabelPositions();
  }, [updateMeasurementLabelPositions]);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Sky gradient background
    let gradientCanvas: HTMLCanvasElement | null = document.createElement("canvas");
    gradientCanvas.width = 2;
    gradientCanvas.height = 512;
    const ctx = gradientCanvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#0d1117");
    gradient.addColorStop(0.25, "#151b2b");
    gradient.addColorStop(0.5, "#1c2333");
    gradient.addColorStop(0.75, "#252a35");
    gradient.addColorStop(0.9, "#2d2f38");
    gradient.addColorStop(1, "#1e1d1b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 512);
    const bgTexture = new THREE.CanvasTexture(gradientCanvas);
    bgTexture.magFilter = THREE.LinearFilter;
    scene.background = bgTexture;

    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
    camera.position.set(5, 4, 5);
    camera.lookAt(0, 1.5, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.localClippingEnabled = true;
    renderer.domElement.setAttribute("aria-hidden", "true");
    renderer.domElement.setAttribute("tabindex", "-1");
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.5, 0);
    controls.minDistance = 2;
    controls.maxDistance = 200;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.update();
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xe8e4df, 0.35);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0x7799cc, 0x3d3528, 0.45);
    scene.add(hemisphereLight);

    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.3);
    dirLight.position.set(5, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xc4d4e8, 0.3);
    fillLight.position.set(-4, 3, -2);
    scene.add(fillLight);

    const gridMinor = new THREE.GridHelper(40, 40, 0x2a2a2a, 0x2a2a2a);
    (gridMinor.material as THREE.Material).opacity = 0.12;
    (gridMinor.material as THREE.Material).transparent = true;
    scene.add(gridMinor);
    const gridMajor = new THREE.GridHelper(40, 8, 0x3a3a3a, 0x3a3a3a);
    (gridMajor.material as THREE.Material).opacity = 0.25;
    (gridMajor.material as THREE.Material).transparent = true;
    gridMajor.position.y = 0.001;
    scene.add(gridMajor);

    const axesHelper = new THREE.AxesHelper(1.5);
    axesHelper.setColors(
      new THREE.Color(0xe05555),
      new THREE.Color(0x55b855),
      new THREE.Color(0x5588dd),
    );
    (axesHelper.material as THREE.Material).transparent = true;
    (axesHelper.material as THREE.Material).opacity = 0.6;
    scene.add(axesHelper);

    scene.fog = new THREE.Fog(0x1a1d22, 30, 120);

    const groundGeom = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1f1e1c,
      roughness: 0.92,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // Object group — rotated to convert Z-up (Manifold/C++ viewer) to Y-up (Three.js)
    const objectGroup = new THREE.Group();
    objectGroup.rotation.x = -Math.PI / 2;
    scene.add(objectGroup);
    objectGroupRef.current = objectGroup;

    const measurementGroup = new THREE.Group();
    scene.add(measurementGroup);
    measurementGroupRef.current = measurementGroup;

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      updateMeasurementLabelPositions();
    }
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();

      // Dispose all meshes in the object group (user scene objects)
      if (objectGroupRef.current) {
        disposeObject(objectGroupRef.current);
        objectGroupRef.current = null;
      }
      if (measurementGroupRef.current) {
        disposeMeasurementGroup(measurementGroupRef.current);
        scene.remove(measurementGroupRef.current);
        measurementGroupRef.current = null;
      }

      // Dispose grid helpers, axes, lights, and their materials
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else if (child.material) {
            (child.material as THREE.Material).dispose();
          }
        }
      });

      // Dispose shadow map texture
      dirLight.shadow.map?.dispose();

      // Dispose background texture and release underlying canvas
      scene.background = null;
      bgTexture.dispose();
      if (gradientCanvas) {
        gradientCanvas.width = 0;
        gradientCanvas.height = 0;
        gradientCanvas = null;
      }

      groundGeom.dispose();
      groundMat.dispose();

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAutoFitRef = useRef(false);

  const updateScene = useCallback(
    async (script: string, wf: boolean) => {
      const group = objectGroupRef.current;
      const parentScene = sceneRef.current;
      if (!group || !parentScene) return;

      const thisId = ++updateIdRef.current;
      setIsComputing(true);
      setTessProgress(null);

      // Yield to browser so the spinner renders before heavy WASM work
      await new Promise((r) => setTimeout(r, 0));
      if (thisId !== updateIdRef.current) { setIsComputing(false); setTessProgress(null); return; }

      // Build new meshes into a staging group — old scene stays visible
      const stagingGroup = new THREE.Group();
      stagingGroup.rotation.x = -Math.PI / 2;

      let addedCount = 0;
      const progressOptions: EvaluateOptions = {
        onProgress: (meshes, done, total) => {
          if (thisId !== updateIdRef.current) return;
          for (let i = addedCount; i < meshes.length; i++) {
            addSingleTessellatedMesh(stagingGroup, meshes[i], wf);
          }
          addedCount = meshes.length;
          onObjectCount?.(addedCount);
          setTessProgress({ done, total });
        },
      };

      const result = await evaluateSceneWorker(script, progressOptions);

      // Stale update — a newer one has started
      if (thisId !== updateIdRef.current) {
        disposeObject(stagingGroup);
        setIsComputing(false);
        setTessProgress(null);
        return;
      }

      onWarnings?.(result.warnings);

      if (result.error) {
        onError?.(result.error);
        onErrorLine?.(result.errorLine);
        disposeObject(stagingGroup);
        if (script !== lastValidSceneRef.current) {
          const fallback = await evaluateSceneWorker(lastValidSceneRef.current);
          if (thisId !== updateIdRef.current) { setIsComputing(false); setTessProgress(null); return; }
          if (!fallback.error) {
            const freshGroup = new THREE.Group();
            freshGroup.rotation.x = -Math.PI / 2;
            const count = addTessellatedMeshes(freshGroup, fallback.meshes, wf);
            // Atomic swap
            parentScene.remove(group);
            disposeObject(group);
            parentScene.add(freshGroup);
            objectGroupRef.current = freshGroup;
            onObjectCount?.(count);
          }
        }
        setIsComputing(false);
        setTessProgress(null);
        return;
      }

      // Atomic swap — remove old group, add new one in same frame
      parentScene.remove(group);
      disposeObject(group);
      parentScene.add(stagingGroup);
      objectGroupRef.current = stagingGroup;

      lastValidSceneRef.current = script;
      onError?.(null);
      onErrorLine?.(null);
      onObjectCount?.(result.meshes.length);
      setIsComputing(false);
      setTessProgress(null);

      const box = new THREE.Box3().setFromObject(stagingGroup);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const sizeVec = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
        sceneBoundsRef.current = { center: center.clone(), size: maxDim };

        if (initialPresentationPreset && !hasAppliedInitialPresentationPresetRef.current) {
          hasAppliedInitialPresentationPresetRef.current = true;
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          if (camera && controls) {
            applyCameraPreset(camera, controls, sceneBoundsRef.current, initialPresentationPreset, false);
          }
          return;
        }

        if (!hasAutoFitRef.current && result.meshes.length > 10) {
          hasAutoFitRef.current = true;
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          if (camera && controls) {
            const fov = camera.fov * (Math.PI / 180);
            const dist = maxDim / (2 * Math.tan(fov / 2)) * 1.4;
            const newPos: [number, number, number] = [
              center.x + dist * 0.5,
              center.y + dist * 0.4,
              center.z + dist * 0.5,
            ];
            const newTarget: [number, number, number] = [center.x, center.y, center.z];
            animateCamera(camera, controls, newPos, newTarget, 600);
          }
        }
      }
    },
    [initialPresentationPreset, onObjectCount, onError, onErrorLine, onWarnings]
  );

  // Debounced scene update — 100ms for snappy param slider response
  useEffect(() => {
    const timer = setTimeout(() => {
      updateScene(sceneJs, wireframe);
    }, 100);
    return () => clearTimeout(timer);
  }, [sceneJs, wireframe, updateScene]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    (container as HTMLDivElement & { resetCamera?: () => void }).resetCamera =
      () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) {
          const p = computePresets(sceneBoundsRef.current);
          animateCamera(camera, controls, p[3].position, p[3].target);
        }
      };
  }, []);

  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return null;
      renderer.render(scene, camera);
      const canvas = renderer.domElement;
      const thumbW = 320;
      const thumbH = 180;
      const offscreen = document.createElement("canvas");
      offscreen.width = thumbW;
      offscreen.height = thumbH;
      const ctx = offscreen.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(canvas, 0, 0, thumbW, thumbH);
      return offscreen.toDataURL("image/webp", 0.7);
    };
    return () => {
      captureRef.current = null;
    };
  }, [captureRef]);

  useEffect(() => {
    if (!presentationRef) return;

    const focusPreset = (presetId: PresentationPresetId, animated = true) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      applyCameraPreset(camera, controls, sceneBoundsRef.current, presetId, animated);
    };

    presentationRef.current = {
      focusPreset: (presetId) => focusPreset(presetId, true),
      captureFrame: (options = {}) => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;

        if (options.presetId) {
          focusPreset(options.presetId, false);
        }

        renderer.render(scene, camera);
        const source = renderer.domElement;
        const width = options.width ?? source.width;
        const height = options.height ?? source.height;
        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#0f0f12";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(source, 0, 0, width, height);

        if (options.watermark !== false) {
          const fontSize = Math.max(16, Math.round(height * 0.024));
          ctx.font = `${fontSize}px "SF Mono", "Fira Code", "Cascadia Code", monospace`;
          ctx.fillStyle = "rgba(255,255,255,0.34)";
          ctx.textAlign = "right";
          ctx.textBaseline = "bottom";
          ctx.fillText("Made with Helscoop", width - fontSize, height - fontSize * 0.7);
        }

        return offscreen.toDataURL("image/png");
      },
    };

    return () => {
      presentationRef.current = null;
    };
  }, [presentationRef]);

  useEffect(() => {
    measurementsRef.current = measurements;
    previewMeasurementRef.current =
      measurementStart && measurementPreviewEnd
        ? { id: "preview", start: measurementStart, end: measurementPreviewEnd }
        : null;
    rebuildMeasurementVisuals();
  }, [measurementPreviewEnd, measurementStart, measurements, rebuildMeasurementVisuals]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !measurementMode;
    }
    if (!measurementMode) {
      setMeasurementStart(null);
      setMeasurementPreviewEnd(null);
    }
  }, [measurementMode]);

  const clearMeasurements = useCallback(() => {
    setMeasurements([]);
    setMeasurementStart(null);
    setMeasurementPreviewEnd(null);
  }, []);

  const toggleMeasurementMode = useCallback(() => {
    setMeasurementMode((active) => !active);
  }, []);

  const cycleMeasurementUnit = useCallback(() => {
    setMeasurementUnit((unit) => {
      const index = MEASUREMENT_UNITS.indexOf(unit);
      return MEASUREMENT_UNITS[(index + 1) % MEASUREMENT_UNITS.length];
    });
  }, []);

  const handleMeasurementPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!measurementMode || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;

    e.preventDefault();
    e.stopPropagation();
    const point = pickMeasurementPoint(e.clientX, e.clientY);
    if (!point) return;

    if (!measurementStart) {
      setMeasurementStart(point);
      setMeasurementPreviewEnd(point);
      return;
    }

    const start = measurementStart.clone();
    const end = point.clone();
    if (start.distanceTo(end) < 0.001) return;

    setMeasurements((prev) => [
      ...prev,
      { id: `measure-${Date.now()}-${prev.length}`, start, end },
    ]);
    setMeasurementStart(null);
    setMeasurementPreviewEnd(null);
  }, [measurementMode, measurementStart, pickMeasurementPoint]);

  const handleMeasurementPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!measurementMode || !measurementStart) return;
    const point = pickMeasurementPoint(e.clientX, e.clientY);
    if (point) setMeasurementPreviewEnd(point);
  }, [measurementMode, measurementStart, pickMeasurementPoint]);

  const handleSurfacePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!onMaterialSurfaceSelect || measurementMode || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("select") || target.closest("textarea")) return;
    surfacePointerDownRef.current = { x: e.clientX, y: e.clientY, button: e.button };
  }, [measurementMode, onMaterialSurfaceSelect]);

  const handleSurfacePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!onMaterialSurfaceSelect || measurementMode) return;
    const start = surfacePointerDownRef.current;
    surfacePointerDownRef.current = null;
    if (!start || start.button !== e.button || e.button !== 0) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > 36) return;

    const selection = pickMaterialSurface(e.clientX, e.clientY);
    if (selection) onMaterialSurfaceSelect(selection);
  }, [measurementMode, onMaterialSurfaceSelect, pickMaterialSurface]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping) return;

      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        setMeasurementMode((active) => !active);
      } else if (e.key.toLowerCase() === "x" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSectionMode((active) => !active);
      } else if (e.key === "Escape" && measurementMode) {
        e.preventDefault();
        if (measurementStart) {
          setMeasurementStart(null);
          setMeasurementPreviewEnd(null);
        } else {
          clearMeasurements();
          setMeasurementMode(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearMeasurements, measurementMode, measurementStart]);

  useEffect(() => {
    const group = objectGroupRef.current;
    if (!group) return;
    const normal = new THREE.Vector3(
      sectionAxis === "x" ? -1 : 0,
      sectionAxis === "y" ? -1 : 0,
      sectionAxis === "z" ? -1 : 0
    );
    const plane = clippingPlaneRef.current;
    plane.normal.copy(normal);
    plane.constant = sectionPos;

    const planes = sectionMode ? [plane] : [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.Material;
        mat.clippingPlanes = planes;
        mat.clipShadows = sectionMode;
        mat.needsUpdate = true;
      }
    });
  }, [sectionMode, sectionAxis, sectionPos]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (measurementMode) return;
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, [measurementMode]);

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(null);
  }, []);

  const rotateViewportCamera = useCallback((deltaTheta: number, deltaPhi: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const offset = camera.position.clone().sub(controls.target);
    if (offset.lengthSq() === 0) return;

    const spherical = new THREE.Spherical().setFromVector3(offset);
    const minPhi = Math.max(0.1, controls.minPolarAngle);
    const maxPhi = Math.min(Math.PI - 0.1, controls.maxPolarAngle);
    spherical.theta += deltaTheta;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaPhi, minPhi, maxPhi);
    offset.setFromSpherical(spherical);

    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    controls.update();
  }, []);

  const zoomViewportCamera = useCallback((scale: number) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const offset = camera.position.clone().sub(controls.target);
    const distance = THREE.MathUtils.clamp(
      offset.length() * scale,
      controls.minDistance,
      controls.maxDistance,
    );
    offset.setLength(distance);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    controls.update();
  }, []);

  const resetViewportCamera = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const p = computePresets(sceneBoundsRef.current);
    animateCamera(camera, controls, p[3].position, p[3].target);
  }, []);

  const handleViewportKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    const rotationStep = e.shiftKey ? VIEWPORT_KEY_ROTATION_STEP / 2 : VIEWPORT_KEY_ROTATION_STEP;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        e.stopPropagation();
        rotateViewportCamera(rotationStep, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        e.stopPropagation();
        rotateViewportCamera(-rotationStep, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        e.stopPropagation();
        rotateViewportCamera(0, -rotationStep);
        break;
      case "ArrowDown":
        e.preventDefault();
        e.stopPropagation();
        rotateViewportCamera(0, rotationStep);
        break;
      case "+":
      case "=":
        e.preventDefault();
        e.stopPropagation();
        zoomViewportCamera(VIEWPORT_KEY_ZOOM_IN);
        break;
      case "-":
      case "_":
        e.preventDefault();
        e.stopPropagation();
        zoomViewportCamera(VIEWPORT_KEY_ZOOM_OUT);
        break;
      case "Home":
        e.preventDefault();
        e.stopPropagation();
        resetViewportCamera();
        break;
    }
  }, [resetViewportCamera, rotateViewportCamera, zoomViewportCamera]);

  const handleScreenshot = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const canvas = renderer.domElement;
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    const fontSize = Math.max(12, Math.round(canvas.height * 0.018));
    ctx.font = `${fontSize}px "SF Mono", "Fira Code", "Cascadia Code", monospace`;
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("helscoop.fi", canvas.width - fontSize, canvas.height - fontSize * 0.6);
    const link = document.createElement("a");
    link.download = "helscoop-screenshot.png";
    link.href = offscreen.toDataURL("image/png");
    link.click();
  }, []);

  const contextMenuItems: ContextMenuItem[] = [
    {
      id: "camera-front",
      label: t("editor.cameraFront"),
      icon: "M3 12h18M12 3v18",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const p = computePresets(sceneBoundsRef.current);
        animateCamera(camera, controls, p[0].position, p[0].target);
      },
    },
    {
      id: "camera-side",
      label: t("editor.cameraSide"),
      icon: "M12 3v18M21 12H3",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const p = computePresets(sceneBoundsRef.current);
        animateCamera(camera, controls, p[1].position, p[1].target);
      },
    },
    {
      id: "camera-top",
      label: t("editor.cameraTop"),
      icon: "M12 5v14M5 12h14M7.5 7.5l9 9M16.5 7.5l-9 9",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const p = computePresets(sceneBoundsRef.current);
        animateCamera(camera, controls, p[2].position, p[2].target);
      },
    },
    {
      id: "camera-iso",
      label: t("editor.cameraIso"),
      icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const p = computePresets(sceneBoundsRef.current);
        animateCamera(camera, controls, p[3].position, p[3].target);
      },
    },
    {
      id: "wireframe",
      label: t("editor.wireframe"),
      icon: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
      active: wireframe,
      onClick: () => { onToggleWireframe?.(); },
    },
    {
      id: "screenshot",
      label: t("editor.screenshot"),
      icon: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
      onClick: handleScreenshot,
    },
    {
      id: "reset-camera",
      label: t("editor.resetCamera"),
      icon: "M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const p = computePresets(sceneBoundsRef.current);
        animateCamera(camera, controls, p[3].position, p[3].target);
      },
    },
  ];

  return (
    <div
      ref={containerRef}
      role="application"
      tabIndex={0}
      aria-label={t("editor.viewportA11yLabel")}
      aria-describedby={viewportDescriptionId}
      onContextMenu={handleContextMenu}
      onKeyDown={handleViewportKeyDown}
      onPointerDown={(e) => {
        handleSurfacePointerDown(e);
        handleMeasurementPointerDown(e);
      }}
      onPointerUp={handleSurfacePointerUp}
      onPointerMove={handleMeasurementPointerMove}
      data-measuring={measurementMode}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 200,
        background: "var(--bg-secondary)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <p id={viewportDescriptionId} className="sr-only">
        {t("editor.viewportA11yDescription")} {t("editor.viewportA11yKeyboardHelp")}
      </p>
      {isComputing && (
        <>
          <div
            className="viewport-progress-bar"
            style={{ animation: "fadeIn 0.3s ease" }}
          >
            <div
              className="viewport-progress-fill"
              style={{
                width: tessProgress && tessProgress.total > 0
                  ? `${Math.round((tessProgress.done / tessProgress.total) * 100)}%`
                  : "0%",
              }}
            />
          </div>
          <div className="viewport-computing-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            <span style={{ color: "var(--text-secondary)", fontSize: 12, fontFamily: "var(--font-sans)" }}>
              {tessProgress && tessProgress.total > 0
                ? `${Math.round((tessProgress.done / tessProgress.total) * 100)}%`
                : t('editor.computing')}
            </span>
          </div>
        </>
      )}
      <CameraToolbar
        cameraRef={cameraRef}
        controlsRef={controlsRef}
        rendererRef={rendererRef}
        sceneRef={sceneRef}
        projectName={projectName}
        sceneBoundsRef={sceneBoundsRef}
        measurementMode={measurementMode}
        measurementUnit={measurementUnit}
        measurementCount={measurements.length}
        onToggleMeasurementMode={toggleMeasurementMode}
        onClearMeasurements={clearMeasurements}
        onCycleMeasurementUnit={cycleMeasurementUnit}
        sectionMode={sectionMode}
        sectionAxis={sectionAxis}
        sectionPos={sectionPos}
        onToggleSectionMode={() => setSectionMode((s) => !s)}
        onCycleSectionAxis={() => setSectionAxis((a) => a === "x" ? "y" : a === "y" ? "z" : "x")}
        onSetSectionPos={setSectionPos}
      />
      <ViewCube
        cameraRef={cameraRef}
        controlsRef={controlsRef}
        sceneBoundsRef={sceneBoundsRef}
        onNavigate={(pos, target) => {
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          if (camera && controls) animateCamera(camera, controls, pos, target);
        }}
      />
      {measurementMode && (
        <div className="viewport-measure-hint">
          {measurementStart ? t("editor.measurePickSecond") : t("editor.measurePickFirst")}
        </div>
      )}
      {onMaterialSurfaceSelect && !measurementMode && (
        <div className="viewport-measure-hint" style={{ left: 12, right: "auto" }}>
          {t("editor.materialConfiguratorHint")}
        </div>
      )}
      <div className="viewport-measure-label-layer" aria-hidden="true">
        {measurements.map((measurement) => (
          <div
            key={measurement.id}
            ref={(node) => setMeasurementLabelRef(measurement.id, node)}
            className="viewport-measure-label"
          >
            {formatMeasurementDistance(measurement.start.distanceTo(measurement.end), measurementUnit, locale)}
          </div>
        ))}
        {measurementStart && measurementPreviewEnd && (
          <div
            ref={(node) => setMeasurementLabelRef("preview", node)}
            className="viewport-measure-label viewport-measure-label-preview"
          >
            {formatMeasurementDistance(measurementStart.distanceTo(measurementPreviewEnd), measurementUnit, locale)}
          </div>
        )}
      </div>
      <ViewportContextMenu
        items={contextMenuItems}
        position={contextMenuPos}
        onClose={closeContextMenu}
      />
    </div>
  );
}
