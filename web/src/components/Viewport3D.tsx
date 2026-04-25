"use client";

import { useEffect, useRef, useCallback, useId, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { evaluateSceneWorker, initWorker } from "@/lib/manifold-worker-client";
import type { TessellatedObject, EvaluateOptions } from "@/lib/manifold-engine";
import { useTranslation } from "@/components/LocaleProvider";
import ViewportContextMenu, { type ContextMenuItem } from "@/components/ViewportContextMenu";
import ScreenshotPopover from "@/components/ScreenshotPopover";
import { shortcutLabel } from "@/lib/shortcut-label";
import { getPresentationPreset, type PresentationPresetId } from "@/lib/presentation-export";
import { useAmbientSound } from "@/hooks/useAmbientSound";
import ViewCube from "@/components/ViewCube";
import Minimap from "@/components/Minimap";
import { groupLayerSeeds, type LayerSeed } from "@/lib/scene-layers";
import { isMeshStandardMaterial } from "@/lib/three-material-guards";
import type { ShadowStudySample } from "@/lib/sun-position";
import type { AirflowAnalysis } from "@/lib/airflow-engine";

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

export interface ViewportCameraState {
  position: [number, number, number];
  target: [number, number, number];
}

export interface ViewportAssemblyGuideState {
  stepKey: string;
  completedObjectIds: string[];
  currentObjectIds: string[];
  ghostObjectIds: string[];
}

interface Viewport3DProps {
  sceneJs: string;
  wireframe?: boolean;
  explodedView?: boolean;
  materialCategoryMap?: Record<string, string>;
  onObjectCount?: (count: number) => void;
  onError?: (error: string | null) => void;
  onErrorLine?: (line: number | null) => void;
  onWarnings?: (warnings: string[]) => void;
  captureRef?: React.MutableRefObject<(() => string | null) | null>;
  presentationRef?: React.MutableRefObject<ViewportPresentationApi | null>;
  initialPresentationPreset?: PresentationPresetId;
  onToggleWireframe?: () => void;
  onMaterialSurfaceSelect?: (selection: ViewportMaterialSelection) => void;
  onObjectSurfaceSelect?: (objectId: string) => void;
  onRenderedLayersChange?: (layers: LayerSeed[]) => void;
  onMeasurementModeChange?: (active: boolean) => void;
  projectName?: string;
  thermalView?: boolean;
  thermalColorMap?: Map<string, [number, number, number]>;
  lightingPreset?: LightingPresetId;
  selectedObjectId?: string | null;
  hiddenObjectIds?: Set<string>;
  lockedObjectIds?: Set<string>;
  cameraSyncState?: ViewportCameraState | null;
  onCameraSyncChange?: (state: ViewportCameraState) => void;
  sunDirection?: [number, number, number];
  sunAltitude?: number;
  shadowStudySamples?: ShadowStudySample[] | null;
  assemblyGuideState?: ViewportAssemblyGuideState | null;
  airflowView?: boolean;
  airflowAnalysis?: AirflowAnalysis | null;
  focusObjectRef?: React.MutableRefObject<((objectId: string) => void) | null>;
  onRevealComplete?: () => void;
}

export type LightingPresetId = "default" | "summer" | "winter" | "evening";

interface LightingConfig {
  ambient: { color: number; intensity: number };
  hemisphere: { sky: number; ground: number; intensity: number };
  directional: { color: number; intensity: number; position: [number, number, number] };
  fill: { color: number; intensity: number };
  envGradient: string[];
  groundColor: number;
  fogColor: number;
  toneMappingExposure: number;
  bloomStrength: number;
}

const LIGHTING_PRESETS: Record<LightingPresetId, LightingConfig> = {
  default: {
    ambient: { color: 0xe8e4df, intensity: 0.35 },
    hemisphere: { sky: 0x7799cc, ground: 0x3d3528, intensity: 0.45 },
    directional: { color: 0xfff0dd, intensity: 1.3, position: [5, 8, 4] },
    fill: { color: 0xc4d4e8, intensity: 0.3 },
    envGradient: ["#1a2030", "#2a3545", "#3a3428", "#2a2520", "#0a0a08"],
    groundColor: 0x1f1e1c,
    fogColor: 0x1a1d22,
    toneMappingExposure: 0.9,
    bloomStrength: 0.12,
  },
  summer: {
    ambient: { color: 0xfff5e0, intensity: 0.45 },
    hemisphere: { sky: 0x88bbee, ground: 0x556633, intensity: 0.55 },
    directional: { color: 0xffe8c0, intensity: 1.6, position: [4, 10, 3] },
    fill: { color: 0xaaccee, intensity: 0.35 },
    envGradient: ["#2a3a55", "#4a6588", "#887750", "#665530", "#1a1808"],
    groundColor: 0x2a2820,
    fogColor: 0x222830,
    toneMappingExposure: 1.05,
    bloomStrength: 0.15,
  },
  winter: {
    ambient: { color: 0xc8d4e8, intensity: 0.25 },
    hemisphere: { sky: 0x6680aa, ground: 0x282830, intensity: 0.35 },
    directional: { color: 0xdde4f0, intensity: 1.0, position: [8, 3, 4] },
    fill: { color: 0x8899bb, intensity: 0.25 },
    envGradient: ["#141828", "#1e2a40", "#282838", "#1e1e28", "#080810"],
    groundColor: 0x22222a,
    fogColor: 0x141820,
    toneMappingExposure: 0.75,
    bloomStrength: 0.08,
  },
  evening: {
    ambient: { color: 0xffd0a0, intensity: 0.3 },
    hemisphere: { sky: 0x554488, ground: 0x442210, intensity: 0.4 },
    directional: { color: 0xffaa55, intensity: 1.4, position: [10, 2, 3] },
    fill: { color: 0x665588, intensity: 0.2 },
    envGradient: ["#1a1030", "#2a1838", "#553318", "#442210", "#0a0508"],
    groundColor: 0x201a14,
    fogColor: 0x18141e,
    toneMappingExposure: 0.85,
    bloomStrength: 0.2,
  },
};

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

interface DimensionOverlay {
  id: string;
  anchor: THREE.Vector3;
  width: number;
  height: number;
  depth: number;
}

type AirflowParticleSource = "warm" | "cold" | "mixed";

interface AirflowParticle {
  position: THREE.Vector3;
  age: number;
  maxAge: number;
  warmth: number;
  phase: number;
  source: AirflowParticleSource;
}

interface AirflowRuntime {
  points: THREE.Points;
  arrowGroup: THREE.Group;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  colors: Float32Array;
  particles: AirflowParticle[];
  bounds: THREE.Box3;
  analysis: AirflowAnalysis;
  lastTime: number;
}

const MEASUREMENT_UNITS: MeasurementUnit[] = ["mm", "cm", "m"];
const VIEWPORT_KEY_ROTATION_STEP = Math.PI / 18;
const VIEWPORT_KEY_ZOOM_IN = 0.88;
const VIEWPORT_KEY_ZOOM_OUT = 1.12;
const AIRFLOW_COLD = new THREE.Color(0x58c7ff);
const AIRFLOW_MIXED = new THREE.Color(0xddefff);
const AIRFLOW_WARM = new THREE.Color(0xffa64d);

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function updateMaterialColorTransitions(group: THREE.Group | null) {
  if (!group) return;
  const reducedMotion = prefersReducedMotion();
  const target = new THREE.Color();
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
    const targetColor = child.material.userData.targetColor as [number, number, number] | undefined;
    if (!targetColor) return;
    target.setRGB(targetColor[0], targetColor[1], targetColor[2]);
    const dr = child.material.color.r - target.r;
    const dg = child.material.color.g - target.g;
    const db = child.material.color.b - target.b;
    if (reducedMotion || (dr * dr + dg * dg + db * db) < 0.000016) {
      child.material.color.copy(target);
    } else {
      child.material.color.lerp(target, 0.16);
    }
  });
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function disposeAirflowObject(obj: THREE.Object3D) {
  while (obj.children.length > 0) {
    const child = obj.children[0];
    disposeAirflowObject(child);
    obj.remove(child);
  }
  if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments || obj instanceof THREE.Points) {
    obj.geometry.dispose();
    if (Array.isArray(obj.material)) {
      obj.material.forEach((material) => material.dispose());
    } else if (obj.material) {
      (obj.material as THREE.Material).dispose();
    }
  }
}

function spawnAirflowParticle(bounds: THREE.Box3, analysis: AirflowAnalysis, source?: AirflowParticleSource): AirflowParticle {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const selectedSource = source ?? (Math.random() < 0.38 ? "warm" : Math.random() < 0.68 ? "cold" : "mixed");
  const marginX = Math.max(0.1, size.x * 0.08);
  const marginZ = Math.max(0.1, size.z * 0.08);
  const lowY = bounds.min.y + size.y * randomBetween(0.08, 0.24);
  const highY = bounds.min.y + size.y * randomBetween(0.62, 0.9);

  let position: THREE.Vector3;
  if (selectedSource === "warm") {
    position = new THREE.Vector3(
      center.x + randomBetween(-size.x * 0.18, size.x * 0.18),
      bounds.min.y + size.y * randomBetween(0.06, 0.18),
      center.z + randomBetween(-size.z * 0.18, size.z * 0.18),
    );
  } else if (selectedSource === "cold") {
    const side = Math.floor(Math.random() * 4);
    position = new THREE.Vector3(
      side === 0 ? bounds.min.x + marginX : side === 1 ? bounds.max.x - marginX : randomBetween(bounds.min.x + marginX, bounds.max.x - marginX),
      Math.random() < 0.55 ? lowY : highY,
      side === 2 ? bounds.min.z + marginZ : side === 3 ? bounds.max.z - marginZ : randomBetween(bounds.min.z + marginZ, bounds.max.z - marginZ),
    );
  } else {
    position = new THREE.Vector3(
      randomBetween(bounds.min.x + marginX, bounds.max.x - marginX),
      randomBetween(bounds.min.y + size.y * 0.16, bounds.max.y - size.y * 0.12),
      randomBetween(bounds.min.z + marginZ, bounds.max.z - marginZ),
    );
  }

  return {
    position,
    age: randomBetween(0, 2),
    maxAge: randomBetween(3.2, 6.2),
    warmth: selectedSource === "warm" ? randomBetween(0.74, 1) : selectedSource === "cold" ? randomBetween(0, 0.28) : randomBetween(0.35, 0.68),
    phase: randomBetween(0, Math.PI * 2),
    source: selectedSource,
  };
}

function setAirflowParticleColor(runtime: AirflowRuntime, index: number, particle: AirflowParticle) {
  const height = Math.max(0.001, runtime.bounds.max.y - runtime.bounds.min.y);
  const normalizedY = clamp01((particle.position.y - runtime.bounds.min.y) / height);
  const warmth = clamp01(particle.warmth * 0.72 + normalizedY * 0.28);
  const color = warmth < 0.5
    ? AIRFLOW_COLD.clone().lerp(AIRFLOW_MIXED, warmth / 0.5)
    : AIRFLOW_MIXED.clone().lerp(AIRFLOW_WARM, (warmth - 0.5) / 0.5);
  const fade = Math.sin(clamp01(particle.age / particle.maxAge) * Math.PI);
  runtime.colors[index * 3] = color.r * (0.35 + fade * 0.65);
  runtime.colors[index * 3 + 1] = color.g * (0.35 + fade * 0.65);
  runtime.colors[index * 3 + 2] = color.b * (0.35 + fade * 0.65);
}

function createAirflowArrowGroup(bounds: THREE.Box3, analysis: AirflowAnalysis): THREE.Group {
  const group = new THREE.Group();
  if (!analysis.showArrows) return group;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const windAngle = (analysis.windDirectionDeg * Math.PI) / 180;
  const wind = new THREE.Vector3(Math.cos(windAngle), 0, Math.sin(windAngle));
  const count = Math.max(2, Math.min(6, analysis.openingCount + 1));
  const length = Math.max(0.35, Math.min(1.4, Math.max(size.x, size.z) * 0.12));

  for (let i = 0; i < count; i++) {
    const side = i % 4;
    const low = i % 2 === 0;
    const origin = new THREE.Vector3(
      side === 0 ? bounds.min.x + size.x * 0.08 : side === 1 ? bounds.max.x - size.x * 0.08 : center.x + randomBetween(-size.x * 0.32, size.x * 0.32),
      bounds.min.y + size.y * (low ? 0.22 : 0.74),
      side === 2 ? bounds.min.z + size.z * 0.08 : side === 3 ? bounds.max.z - size.z * 0.08 : center.z + randomBetween(-size.z * 0.32, size.z * 0.32),
    );
    const horizontal = low ? wind.clone().multiplyScalar(0.55) : wind.clone().multiplyScalar(-0.35);
    const direction = horizontal.add(new THREE.Vector3(0, low ? 0.18 : 0.82, 0)).normalize();
    const arrow = new THREE.ArrowHelper(direction, origin, length * (low ? 0.8 : 1), low ? 0x58c7ff : 0xffa64d, length * 0.25, length * 0.12);
    arrow.renderOrder = 8;
    arrow.userData.airflowArrowIndex = i;
    group.add(arrow);
  }

  return group;
}

function createAirflowRuntime(bounds: THREE.Box3, analysis: AirflowAnalysis): AirflowRuntime {
  const particleCount = analysis.particleCount;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const particles = Array.from({ length: particleCount }, (_, index) => {
    const source = index % 5 === 0 ? "warm" : index % 5 === 1 ? "cold" : undefined;
    return spawnAirflowParticle(bounds, analysis, source);
  });
  const geometry = new THREE.BufferGeometry();
  const size = bounds.getSize(new THREE.Vector3());
  const pointSize = Math.max(0.035, Math.min(0.14, size.length() / 180));

  particles.forEach((particle, index) => {
    positions[index * 3] = particle.position.x;
    positions[index * 3 + 1] = particle.position.y;
    positions[index * 3 + 2] = particle.position.z;
  });
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: pointSize,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 7;
  const runtime: AirflowRuntime = {
    points,
    arrowGroup: createAirflowArrowGroup(bounds, analysis),
    geometry,
    positions,
    colors,
    particles,
    bounds: bounds.clone(),
    analysis,
    lastTime: performance.now(),
  };
  particles.forEach((particle, index) => setAirflowParticleColor(runtime, index, particle));
  geometry.attributes.color.needsUpdate = true;
  return runtime;
}

function updateAirflowRuntime(runtime: AirflowRuntime, now: number) {
  const dt = Math.min(0.05, Math.max(0.001, (now - runtime.lastTime) / 1000));
  runtime.lastTime = now;
  const { bounds, analysis } = runtime;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const height = Math.max(0.001, size.y);
  const windAngle = (analysis.windDirectionDeg * Math.PI) / 180;
  const wind = new THREE.Vector3(Math.cos(windAngle), 0, Math.sin(windAngle)).multiplyScalar(analysis.windSpeedMps * 0.028);
  const stack = Math.max(0.04, analysis.stackVelocityMps * 0.22 + analysis.heatWatts / 9000);
  const speed = analysis.speedMultiplier;

  runtime.particles.forEach((particle, index) => {
    particle.age += dt * speed;
    const normalizedY = clamp01((particle.position.y - bounds.min.y) / height);
    const relX = size.x > 0 ? (particle.position.x - center.x) / Math.max(size.x * 0.5, 0.001) : 0;
    const relZ = size.z > 0 ? (particle.position.z - center.z) / Math.max(size.z * 0.5, 0.001) : 0;
    const swirl = new THREE.Vector3(-relZ, 0, relX).multiplyScalar(0.045 + analysis.openingCount * 0.006);
    const plume = particle.source === "warm"
      ? stack * (1.25 - normalizedY * 0.55)
      : particle.source === "cold" && normalizedY > 0.45
        ? -stack * 0.46
        : stack * 0.22;
    const breathing = Math.sin(now * 0.0015 + particle.phase) * 0.018;
    const velocity = swirl
      .add(wind)
      .add(new THREE.Vector3(0, plume + breathing, 0))
      .multiplyScalar(speed);

    particle.position.addScaledVector(velocity, dt);
    particle.warmth = clamp01(particle.warmth + (particle.source === "warm" ? 0.08 : -0.035) * dt + normalizedY * 0.012 * dt);

    const margin = Math.max(0.18, Math.max(size.x, size.y, size.z) * 0.08);
    const expired = particle.age >= particle.maxAge ||
      particle.position.y > bounds.max.y + margin ||
      particle.position.y < bounds.min.y - margin ||
      particle.position.x < bounds.min.x - margin ||
      particle.position.x > bounds.max.x + margin ||
      particle.position.z < bounds.min.z - margin ||
      particle.position.z > bounds.max.z + margin;
    if (expired) {
      const next = spawnAirflowParticle(bounds, analysis);
      particle.position.copy(next.position);
      particle.age = 0;
      particle.maxAge = next.maxAge;
      particle.warmth = next.warmth;
      particle.phase = next.phase;
      particle.source = next.source;
    }

    runtime.positions[index * 3] = particle.position.x;
    runtime.positions[index * 3 + 1] = particle.position.y;
    runtime.positions[index * 3 + 2] = particle.position.z;
    setAirflowParticleColor(runtime, index, particle);
  });

  runtime.geometry.attributes.position.needsUpdate = true;
  runtime.geometry.attributes.color.needsUpdate = true;
  runtime.arrowGroup.children.forEach((child, index) => {
    const pulse = 0.92 + Math.sin(now * 0.004 + index) * 0.08;
    child.scale.setScalar(pulse);
  });
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

function formatDimensionMeters(distanceMeters: number, locale: string): string {
  const localeTag = locale === "fi" ? "fi-FI" : "en-GB";
  return `${distanceMeters.toLocaleString(localeTag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
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
  mesh.userData.baseColor = tess.color;
  mesh.userData.baseOpacity = pbr.opacity ?? 1;
  mesh.userData.baseTransparent = Boolean(pbr.transparent);
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

function buildRenderedLayerSeeds(meshes: TessellatedObject[]): LayerSeed[] {
  return groupLayerSeeds(
    meshes.map((mesh) => ({
      objectId: mesh.objectId,
      materialId: mesh.material,
      color: mesh.color,
    })),
  );
}

function createShadowCarpetMesh(
  sample: ShadowStudySample,
  bounds: THREE.Box3,
  index: number,
): THREE.Mesh {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const footprintWidth = Math.max(1, Math.min(12, Math.max(size.x, size.z) * 0.82));
  const nearWidth = footprintWidth;
  const farWidth = footprintWidth * 0.55;
  const length = Math.max(0.5, Math.min(55, sample.shadowLength));
  const [vx, vz] = sample.shadowVector;
  const px = -vz;
  const pz = vx;
  const y = Math.max(0.012, bounds.min.y + 0.018 + index * 0.001);
  const baseX = center.x + vx * 0.2;
  const baseZ = center.z + vz * 0.2;
  const farX = center.x + vx * length;
  const farZ = center.z + vz * length;

  const positions = new Float32Array([
    baseX + px * nearWidth / 2, y, baseZ + pz * nearWidth / 2,
    baseX - px * nearWidth / 2, y, baseZ - pz * nearWidth / 2,
    farX - px * farWidth / 2, y, farZ - pz * farWidth / 2,
    farX + px * farWidth / 2, y, farZ + pz * farWidth / 2,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(sample.color),
    transparent: true,
    opacity: Math.min(0.24, 0.08 + index * 0.012),
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 4;
  mesh.userData.daylightShadowSample = sample.label;
  return mesh;
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

function readViewportCameraState(camera: THREE.PerspectiveCamera, controls: OrbitControls): ViewportCameraState {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
  };
}

function cameraStateSignature(state: ViewportCameraState): string {
  return [...state.position, ...state.target].map((value) => value.toFixed(4)).join(":");
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
          data-tooltip={`${t("editor.ruler")} (${shortcutLabel("Cmd+M")})`}
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
  explodedView = false,
  materialCategoryMap = {},
  onObjectCount,
  onError,
  onErrorLine,
  onWarnings,
  captureRef,
  presentationRef,
  initialPresentationPreset,
  onToggleWireframe,
  onMaterialSurfaceSelect,
  onObjectSurfaceSelect,
  onRenderedLayersChange,
  onMeasurementModeChange,
  projectName,
  thermalView = false,
  thermalColorMap,
  lightingPreset = "default",
  selectedObjectId = null,
  hiddenObjectIds,
  lockedObjectIds,
  cameraSyncState = null,
  onCameraSyncChange,
  sunDirection,
  sunAltitude,
  shadowStudySamples,
  assemblyGuideState = null,
  airflowView = false,
  airflowAnalysis = null,
  focusObjectRef,
  onRevealComplete,
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
  const dimensionOverlayRef = useRef<DimensionOverlay | null>(null);
  const dimensionLabelRef = useRef<HTMLDivElement | null>(null);
  const surfacePointerDownRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const animFrameRef = useRef<number>(0);
  const viewportDescriptionId = useId();
  const lastValidSceneRef = useRef<string>(sceneJs);
  const sceneBoundsRef = useRef<{ center: THREE.Vector3; size: number } | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [tessProgress, setTessProgress] = useState<{ done: number; total: number } | null>(null);
  const [sceneRenderTick, setSceneRenderTick] = useState(0);
  const [measurementMode, setMeasurementMode] = useState(false);
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("mm");
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementStart, setMeasurementStart] = useState<THREE.Vector3 | null>(null);
  const [measurementPreviewEnd, setMeasurementPreviewEnd] = useState<THREE.Vector3 | null>(null);
  const [dimensionOverlay, setDimensionOverlay] = useState<DimensionOverlay | null>(null);
  const [sectionMode, setSectionMode] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<"x" | "y" | "z">("z");
  const [sectionPos, setSectionPos] = useState(0);
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const hemisphereLightRef = useRef<THREE.HemisphereLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const groundMeshRef = useRef<THREE.Mesh | null>(null);
  const shadowStudyGroupRef = useRef<THREE.Group | null>(null);
  const airflowGroupRef = useRef<THREE.Group | null>(null);
  const airflowRuntimeRef = useRef<AirflowRuntime | null>(null);
  const clippingPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, -1), 0));
  const updateIdRef = useRef(0);
  const hasAppliedInitialPresentationPresetRef = useRef(false);
  const [explodeFactor, setExplodeFactor] = useState(0.5);
  const originalPositionsRef = useRef<Map<THREE.Object3D, THREE.Vector3>>(new Map());
  const assemblyAnimFrameRef = useRef<number>(0);
  const assemblyBasePositionsRef = useRef<Map<THREE.Mesh, THREE.Vector3>>(new Map());
  const onCameraSyncChangeRef = useRef(onCameraSyncChange);
  const applyingCameraSyncRef = useRef(false);
  const lastCameraSyncSignatureRef = useRef("");
  const { t, locale } = useTranslation();

  useEffect(() => {
    onCameraSyncChangeRef.current = onCameraSyncChange;
  }, [onCameraSyncChange]);

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

    const dimensionNode = dimensionLabelRef.current;
    const dimension = dimensionOverlayRef.current;
    if (dimensionNode && dimension) {
      const projected = dimension.anchor.clone().project(camera);
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      dimensionNode.style.transform = `translate(${x}px, ${y}px) translate(-50%, calc(-100% - 14px))`;
      dimensionNode.style.opacity = projected.z > 1 ? "0" : "1";
    }
  }, []);

  const getSceneIntersections = useCallback((clientX: number, clientY: number): THREE.Intersection[] => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const group = objectGroupRef.current;
    if (!renderer || !camera || !group) return [];

    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    return raycaster.intersectObjects(group.children, true);
  }, []);

  const pickSceneIntersection = useCallback((
    clientX: number,
    clientY: number,
    options?: {
      requireMaterial?: boolean;
      requireObjectId?: boolean;
      ignoreLocked?: boolean;
    },
  ): THREE.Intersection | null => {
    const intersections = getSceneIntersections(clientX, clientY);
    return intersections.find((candidate) => {
      const object = candidate.object;
      if (!(object instanceof THREE.Mesh) || !object.visible) return false;

      const objectId = typeof object.userData.objectId === "string" ? object.userData.objectId : null;
      if (options?.requireObjectId && !objectId) return false;
      if (options?.ignoreLocked !== false && objectId && lockedObjectIds?.has(objectId)) return false;

      if (options?.requireMaterial) {
        const materialId = object.userData.materialId;
        return typeof materialId === "string" && materialId.length > 0 && materialId !== "default";
      }

      return true;
    }) ?? null;
  }, [getSceneIntersections, lockedObjectIds]);

  const pickDimensionOverlay = useCallback((clientX: number, clientY: number): DimensionOverlay | null => {
    const hit = pickSceneIntersection(clientX, clientY, { ignoreLocked: false });
    if (!hit) return null;

    const mesh = hit.object as THREE.Mesh;
    const bounds = new THREE.Box3().setFromObject(mesh);
    if (bounds.isEmpty()) return null;

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    return {
      id: typeof mesh.userData.objectId === "string" ? mesh.userData.objectId : mesh.uuid,
      anchor: new THREE.Vector3(center.x, bounds.max.y, center.z),
      width: size.x,
      height: size.y,
      depth: size.z,
    };
  }, [pickSceneIntersection]);

  const pickMeasurementPoint = useCallback((clientX: number, clientY: number): THREE.Vector3 | null => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!camera || !renderer) return null;

    const rect = renderer.domElement.getBoundingClientRect();
    const hit = pickSceneIntersection(clientX, clientY, { ignoreLocked: false });
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
  }, [pickSceneIntersection]);

  const pickMaterialSurface = useCallback((clientX: number, clientY: number): ViewportMaterialSelection | null => {
    const hit = pickSceneIntersection(clientX, clientY, { requireMaterial: true });
    if (!hit) return null;

    return {
      materialId: hit.object.userData.materialId,
      objectId: hit.object.userData.objectId,
      point: [hit.point.x, hit.point.y, hit.point.z],
      clientX,
      clientY,
    };
  }, [pickSceneIntersection]);

  const pickObjectSurface = useCallback((clientX: number, clientY: number): string | null => {
    const hit = pickSceneIntersection(clientX, clientY, { requireObjectId: true });
    const objectId = hit?.object.userData.objectId;
    return typeof objectId === "string" && objectId.length > 0 ? objectId : null;
  }, [pickSceneIntersection]);

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
    const emitCameraSyncChange = () => {
      if (applyingCameraSyncRef.current) return;
      const callback = onCameraSyncChangeRef.current;
      if (!callback) return;
      const state = readViewportCameraState(camera, controls);
      const signature = cameraStateSignature(state);
      if (signature === lastCameraSyncSignatureRef.current) return;
      lastCameraSyncSignatureRef.current = signature;
      callback(state);
    };
    controls.addEventListener("change", emitCameraSyncChange);

    // Procedural environment map for subtle PBR reflections (Nordic twilight palette)
    let envCanvas: HTMLCanvasElement | null = document.createElement("canvas");
    envCanvas.width = 256;
    envCanvas.height = 128;
    const envCtx = envCanvas.getContext("2d")!;
    const envGrad = envCtx.createLinearGradient(0, 0, 0, 128);
    envGrad.addColorStop(0, "#1a2030");
    envGrad.addColorStop(0.35, "#2a3545");
    envGrad.addColorStop(0.5, "#3a3428");
    envGrad.addColorStop(0.65, "#2a2520");
    envGrad.addColorStop(1, "#0a0a08");
    envCtx.fillStyle = envGrad;
    envCtx.fillRect(0, 0, 256, 128);
    const envTexture = new THREE.CanvasTexture(envCanvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envMap = pmremGenerator.fromEquirectangular(envTexture).texture;
    scene.environment = envMap;
    envTexture.dispose();
    pmremGenerator.dispose();

    const ambientLight = new THREE.AmbientLight(0xe8e4df, 0.35);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const hemisphereLight = new THREE.HemisphereLight(0x7799cc, 0x3d3528, 0.45);
    scene.add(hemisphereLight);
    hemisphereLightRef.current = hemisphereLight;

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
    dirLightRef.current = dirLight;

    const fillLight = new THREE.DirectionalLight(0xc4d4e8, 0.3);
    fillLight.position.set(-4, 3, -2);
    scene.add(fillLight);
    fillLightRef.current = fillLight;

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
    let groundAlphaCanvas: HTMLCanvasElement | null = document.createElement("canvas");
    groundAlphaCanvas.width = 256;
    groundAlphaCanvas.height = 256;
    const gCtx = groundAlphaCanvas.getContext("2d")!;
    const gGrad = gCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gGrad.addColorStop(0, "#ffffff");
    gGrad.addColorStop(0.35, "#ffffff");
    gGrad.addColorStop(0.7, "#555555");
    gGrad.addColorStop(1, "#000000");
    gCtx.fillStyle = gGrad;
    gCtx.fillRect(0, 0, 256, 256);
    const groundAlphaMap = new THREE.CanvasTexture(groundAlphaCanvas);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1f1e1c,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      alphaMap: groundAlphaMap,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    groundMeshRef.current = ground;

    const shadowStudyGroup = new THREE.Group();
    shadowStudyGroup.visible = false;
    scene.add(shadowStudyGroup);
    shadowStudyGroupRef.current = shadowStudyGroup;

    const airflowGroup = new THREE.Group();
    airflowGroup.visible = false;
    scene.add(airflowGroup);
    airflowGroupRef.current = airflowGroup;

    // Post-processing: subtle bloom for photographic quality
    const lowPower = typeof navigator !== "undefined" && navigator.hardwareConcurrency < 4;
    let composer: EffectComposer | null = null;
    if (!lowPower) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(container.clientWidth, container.clientHeight),
        0.12,
        0.8,
        0.88,
      );
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      composerRef.current = composer;
      bloomPassRef.current = bloomPass;
    }

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
      if (airflowRuntimeRef.current) {
        updateAirflowRuntime(airflowRuntimeRef.current, performance.now());
      }
      updateMaterialColorTransitions(objectGroupRef.current);
      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
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
      if (composer) composer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animFrameRef.current);
      cancelAnimationFrame(revealAnimRef.current);
      cancelAnimationFrame(assemblyAnimFrameRef.current);
      assemblyBasePositionsRef.current.clear();
      controls.removeEventListener("change", emitCameraSyncChange);
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
      if (shadowStudyGroupRef.current) {
        disposeMeasurementGroup(shadowStudyGroupRef.current);
        scene.remove(shadowStudyGroupRef.current);
        shadowStudyGroupRef.current = null;
      }
      if (airflowGroupRef.current) {
        disposeAirflowObject(airflowGroupRef.current);
        scene.remove(airflowGroupRef.current);
        airflowGroupRef.current = null;
      }
      airflowRuntimeRef.current = null;

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
      scene.environment = null;
      bgTexture.dispose();
      envMap.dispose();
      if (gradientCanvas) {
        gradientCanvas.width = 0;
        gradientCanvas.height = 0;
        gradientCanvas = null;
      }
      if (envCanvas) {
        envCanvas.width = 0;
        envCanvas.height = 0;
        envCanvas = null;
      }

      groundGeom.dispose();
      groundAlphaMap.dispose();
      if (groundAlphaCanvas) {
        groundAlphaCanvas.width = 0;
        groundAlphaCanvas.height = 0;
        groundAlphaCanvas = null;
      }
      groundMat.dispose();

      if (composer) {
        composer.dispose();
        composerRef.current = null;
        bloomPassRef.current = null;
      }
      ambientLightRef.current = null;
      hemisphereLightRef.current = null;
      dirLightRef.current = null;
      fillLightRef.current = null;
      groundMeshRef.current = null;

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

  useEffect(() => {
    if (!cameraSyncState) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const nextSignature = cameraStateSignature(cameraSyncState);
    if (cameraStateSignature(readViewportCameraState(camera, controls)) === nextSignature) return;

    applyingCameraSyncRef.current = true;
    try {
      camera.position.set(...cameraSyncState.position);
      controls.target.set(...cameraSyncState.target);
      camera.lookAt(controls.target);
      controls.update();
      lastCameraSyncSignatureRef.current = nextSignature;
    } finally {
      applyingCameraSyncRef.current = false;
    }
  }, [cameraSyncState]);

  const hasAutoFitRef = useRef(false);
  const hasRevealedRef = useRef(false);
  const revealAnimRef = useRef<number>(0);

  const updateScene = useCallback(
    async (script: string, wf: boolean) => {
      const group = objectGroupRef.current;
      const parentScene = sceneRef.current;
      if (!group || !parentScene) return;

      const thisId = ++updateIdRef.current;
      setIsComputing(true);
      setTessProgress(null);
      setDimensionOverlay(null);

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
            setSceneRenderTick((tick) => tick + 1);
            onObjectCount?.(count);
            onRenderedLayersChange?.(buildRenderedLayerSeeds(fallback.meshes));
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
      setSceneRenderTick((tick) => tick + 1);

      lastValidSceneRef.current = script;
      onError?.(null);
      onErrorLine?.(null);
      onObjectCount?.(result.meshes.length);
      onRenderedLayersChange?.(buildRenderedLayerSeeds(result.meshes));
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

        // 3-phase cinematic reveal: wireframe → surface fill → lighting settle
        if (!hasRevealedRef.current && result.meshes.length > 0 && !prefersReducedMotion()) {
          hasRevealedRef.current = true;
          cancelAnimationFrame(revealAnimRef.current);

          const meshes: THREE.Mesh[] = [];
          const origMaterials: THREE.Material[] = [];
          const wireframeMeshes: THREE.Mesh[] = [];
          stagingGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              meshes.push(child);
              origMaterials.push(child.material);
              if (isMeshStandardMaterial(child.material)) {
                child.material.transparent = true;
                child.material.opacity = 0;
                child.material.needsUpdate = true;
              }

              const wireMat = new THREE.MeshBasicMaterial({
                wireframe: true,
                color: 0xe5a04b,
                transparent: true,
                opacity: 0,
              });
              const wireClone = new THREE.Mesh(child.geometry, wireMat);
              wireClone.position.copy(child.position);
              wireClone.rotation.copy(child.rotation);
              wireClone.scale.copy(child.scale);
              wireClone.matrixAutoUpdate = true;
              child.parent?.add(wireClone);
              wireframeMeshes.push(wireClone);
            }
          });

          const rimLight = new THREE.PointLight(0xe5a04b, 0, 20);
          const box = new THREE.Box3().setFromObject(stagingGroup);
          const edgePos = new THREE.Vector3();
          box.getCenter(edgePos);
          const size = new THREE.Vector3();
          box.getSize(size);
          rimLight.position.set(
            edgePos.x + size.x * 0.6,
            edgePos.y + size.y * 0.3,
            edgePos.z + size.z * 0.4,
          );
          stagingGroup.add(rimLight);

          const camera = cameraRef.current;
          const controls = controlsRef.current;
          const startAngle = camera ? Math.atan2(
            camera.position.x - (controls?.target.x ?? 0),
            camera.position.z - (controls?.target.z ?? 0),
          ) : 0;
          const cameraRadius = camera ? camera.position.distanceTo(controls?.target ?? new THREE.Vector3()) : 10;
          const startCameraY = camera ? camera.position.y : 4;
          const dollyStart = cameraRadius * 1.15;

          const DURATION = 1800;
          const P1_END = 600;
          const P2_END = 1200;
          const startTime = performance.now();
          let revealCompleteFired = false;

          const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
          const spring = (x: number) => {
            const c4 = (2 * Math.PI) / 3;
            return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
          };

          const revealStep = () => {
            const elapsed = performance.now() - startTime;
            const raw = Math.min(elapsed / DURATION, 1);

            if (elapsed <= P1_END) {
              // Phase 1: Wireframe emerge
              const p = Math.min(elapsed / P1_END, 1);
              const eased = spring(p);
              for (const wm of wireframeMeshes) {
                (wm.material as THREE.MeshBasicMaterial).opacity = eased * 0.6;
                (wm.material as THREE.MeshBasicMaterial).needsUpdate = true;
              }
            } else if (elapsed <= P2_END) {
              // Phase 2: Surface fill, wireframe fade
              const p = Math.min((elapsed - P1_END) / (P2_END - P1_END), 1);
              const eased = easeOutCubic(p);
              for (let i = 0; i < meshes.length; i++) {
                if (isMeshStandardMaterial(meshes[i].material)) {
                  meshes[i].material.opacity = eased;
                  meshes[i].material.needsUpdate = true;
                }
              }
              for (const wm of wireframeMeshes) {
                (wm.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - eased);
                (wm.material as THREE.MeshBasicMaterial).needsUpdate = true;
              }
              rimLight.intensity = eased * 0.3;

              if (!revealCompleteFired && p > 0.5) {
                revealCompleteFired = true;
                onRevealComplete?.();
              }
            } else {
              // Phase 3: Lighting settle + orbit
              const p = Math.min((elapsed - P2_END) / (DURATION - P2_END), 1);
              const eased = easeOutCubic(p);
              rimLight.intensity = 0.3 * (1 - eased);
            }

            // Camera dolly-in + orbit over full duration
            if (camera && controls) {
              const t = easeOutCubic(raw);
              const orbitAngle = startAngle + t * (5 * Math.PI / 180);
              const currentRadius = dollyStart + (cameraRadius - dollyStart) * t;
              camera.position.x = controls.target.x + Math.sin(orbitAngle) * currentRadius;
              camera.position.z = controls.target.z + Math.cos(orbitAngle) * currentRadius;
              camera.position.y = startCameraY;
              controls.update();
            }

            if (raw < 1) {
              revealAnimRef.current = requestAnimationFrame(revealStep);
            } else {
              // Cleanup: remove wireframe meshes and rim light
              for (const wm of wireframeMeshes) {
                wm.parent?.remove(wm);
                (wm.material as THREE.MeshBasicMaterial).dispose();
              }
              stagingGroup.remove(rimLight);
              rimLight.dispose();
              for (let i = 0; i < meshes.length; i++) {
                if (isMeshStandardMaterial(meshes[i].material)) {
                  meshes[i].material.transparent = false;
                  meshes[i].material.opacity = 1;
                  meshes[i].material.needsUpdate = true;
                }
              }
              if (!revealCompleteFired) {
                onRevealComplete?.();
              }
            }
          };
          revealAnimRef.current = requestAnimationFrame(revealStep);
        }
      }
    },
    [initialPresentationPreset, onObjectCount, onError, onErrorLine, onRenderedLayersChange, onWarnings]
  );

  // Debounced scene update — 100ms for snappy param slider response
  useEffect(() => {
    const timer = setTimeout(() => {
      updateScene(sceneJs, wireframe);
    }, 100);
    return () => clearTimeout(timer);
  }, [sceneJs, wireframe, updateScene]);

  const refreshMeshAppearance = useCallback(() => {
    const group = objectGroupRef.current;
    if (!group) return;

    const assemblyCurrent = new Set(assemblyGuideState?.currentObjectIds ?? []);
    const assemblyCompleted = new Set(assemblyGuideState?.completedObjectIds ?? []);
    const assemblyGhost = new Set(assemblyGuideState?.ghostObjectIds ?? []);
    const assemblyActive = Boolean(assemblyGuideState);

    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (!isMeshStandardMaterial(child.material)) return;

      const mat = child.material;
      const materialId = child.userData.materialId as string | undefined;
      const objectId = child.userData.objectId as string | undefined;
      const baseColor = Array.isArray(child.userData.baseColor)
        ? child.userData.baseColor as [number, number, number]
        : [1, 1, 1] as [number, number, number];
      const baseOpacity = typeof child.userData.baseOpacity === "number" ? child.userData.baseOpacity : 1;
      const baseTransparent = Boolean(child.userData.baseTransparent);
      const thermalRgb = thermalView && materialId ? thermalColorMap?.get(materialId) : undefined;
      const displayColor = thermalRgb ?? baseColor;
      const isAssemblyCurrent = Boolean(objectId && assemblyCurrent.has(objectId));
      const isAssemblyCompleted = Boolean(objectId && assemblyCompleted.has(objectId));
      const isAssemblyGhost = Boolean(objectId && assemblyGhost.has(objectId));
      const isSelected = Boolean(objectId && selectedObjectId === objectId);
      const isHidden = Boolean(objectId && hiddenObjectIds?.has(objectId) && !isAssemblyGhost);

      child.visible = !isHidden;
      mat.wireframe = isAssemblyGhost ? true : wireframe;

      let opacity = baseOpacity;
      let transparent = baseTransparent;
      let color: [number, number, number] = displayColor;

      if (assemblyActive) {
        if (isAssemblyGhost) {
          opacity = 0.14;
          transparent = true;
          color = [1, 0.78, 0.38];
        } else if (isAssemblyCompleted) {
          opacity = Math.min(baseOpacity, 0.42);
          transparent = true;
          color = [displayColor[0] * 0.75, displayColor[1] * 0.75, displayColor[2] * 0.75];
        } else if (isAssemblyCurrent) {
          opacity = baseOpacity;
          transparent = true;
        }
      }

      mat.transparent = transparent;
      mat.opacity = opacity;
      mat.userData.targetColor = color;
      if (!mat.userData.hasColorTransitionTarget || prefersReducedMotion()) {
        mat.color.setRGB(color[0], color[1], color[2]);
        mat.userData.hasColorTransitionTarget = true;
      }

      const emissiveBase: [number, number, number] = thermalRgb
        ? [thermalRgb[0] * 0.15, thermalRgb[1] * 0.15, thermalRgb[2] * 0.15]
        : [0, 0, 0];
      if (isSelected || isAssemblyCurrent) {
        mat.emissive.setRGB(
          Math.min(1, emissiveBase[0] + 0.45),
          Math.min(1, emissiveBase[1] + 0.24),
          Math.min(1, emissiveBase[2] + 0.06),
        );
      } else {
        mat.emissive.setRGB(emissiveBase[0], emissiveBase[1], emissiveBase[2]);
      }
      mat.needsUpdate = true;
    });
  }, [assemblyGuideState, hiddenObjectIds, selectedObjectId, thermalColorMap, thermalView, wireframe]);

  useEffect(() => {
    refreshMeshAppearance();
  }, [refreshMeshAppearance, sceneRenderTick]);

  useEffect(() => {
    cancelAnimationFrame(assemblyAnimFrameRef.current);
    assemblyBasePositionsRef.current.forEach((position, mesh) => {
      mesh.position.copy(position);
    });
    assemblyBasePositionsRef.current.clear();

    const group = objectGroupRef.current;
    if (!group || !assemblyGuideState || assemblyGuideState.currentObjectIds.length === 0) {
      refreshMeshAppearance();
      return;
    }

    const currentIds = new Set(assemblyGuideState.currentObjectIds);
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && currentIds.has(child.userData.objectId as string)) {
        meshes.push(child);
      }
    });

    if (meshes.length === 0 || prefersReducedMotion()) {
      refreshMeshAppearance();
      return;
    }

    const bounds = new THREE.Box3().setFromObject(group);
    const size = bounds.getSize(new THREE.Vector3()).length();
    const dropOffset = Math.max(0.25, Math.min(1.2, size * 0.045));
    const duration = 520;
    const start = performance.now();
    meshes.forEach((mesh) => {
      const base = mesh.position.clone();
      assemblyBasePositionsRef.current.set(mesh, base);
      mesh.position.z = base.z + dropOffset;
      if (isMeshStandardMaterial(mesh.material)) {
        mesh.material.transparent = true;
        mesh.material.opacity = 0.08;
        mesh.material.needsUpdate = true;
      }
    });

    const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
    const animate = () => {
      const raw = Math.min((performance.now() - start) / duration, 1);
      const eased = easeOutCubic(raw);

      for (const mesh of meshes) {
        const base = assemblyBasePositionsRef.current.get(mesh);
        if (!base) continue;
        mesh.position.z = base.z + dropOffset * (1 - eased);
        if (isMeshStandardMaterial(mesh.material)) {
          const baseOpacity = typeof mesh.userData.baseOpacity === "number" ? mesh.userData.baseOpacity : 1;
          mesh.material.opacity = Math.min(baseOpacity, 0.08 + eased * 0.92);
          mesh.material.transparent = true;
          mesh.material.needsUpdate = true;
        }
      }

      if (raw < 1) {
        assemblyAnimFrameRef.current = requestAnimationFrame(animate);
      } else {
        assemblyBasePositionsRef.current.forEach((position, mesh) => {
          mesh.position.copy(position);
        });
        assemblyBasePositionsRef.current.clear();
        refreshMeshAppearance();
      }
    };

    assemblyAnimFrameRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(assemblyAnimFrameRef.current);
      assemblyBasePositionsRef.current.forEach((position, mesh) => {
        mesh.position.copy(position);
      });
      assemblyBasePositionsRef.current.clear();
    };
  }, [assemblyGuideState, refreshMeshAppearance, sceneRenderTick]);

  useEffect(() => {
    if (!focusObjectRef) return;
    focusObjectRef.current = (objectId: string) => {
      const group = objectGroupRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!group || !camera || !controls) return;

      const box = new THREE.Box3();
      let found = false;
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.objectId === objectId && child.visible) {
          box.expandByObject(child);
          found = true;
        }
      });
      if (!found) return;

      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 0.5);
      const dist = maxDim * 2.5;
      const offset = new THREE.Vector3(dist * 0.6, dist * 0.5, dist * 0.7);
      const pos: [number, number, number] = [
        center.x + offset.x,
        center.y + offset.y,
        center.z + offset.z,
      ];
      animateCamera(camera, controls, pos, [center.x, center.y, center.z], 500);
    };
    return () => { focusObjectRef.current = null; };
  }, [focusObjectRef]);

  // Lighting preset: update lights, fog, ground, bloom, and env map
  useEffect(() => {
    const config = LIGHTING_PRESETS[lightingPreset];
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!config || !scene || !renderer) return;

    const ambient = ambientLightRef.current;
    const hemi = hemisphereLightRef.current;
    const dir = dirLightRef.current;
    const fill = fillLightRef.current;
    const ground = groundMeshRef.current;
    const bloom = bloomPassRef.current;

    if (ambient) {
      ambient.color.setHex(config.ambient.color);
      ambient.intensity = config.ambient.intensity;
    }
    if (hemi) {
      hemi.color.setHex(config.hemisphere.sky);
      hemi.groundColor.setHex(config.hemisphere.ground);
      hemi.intensity = config.hemisphere.intensity;
    }
    if (dir) {
      dir.color.setHex(config.directional.color);
      dir.intensity = config.directional.intensity;
      dir.position.set(...config.directional.position);
    }
    if (fill) {
      fill.color.setHex(config.fill.color);
      fill.intensity = config.fill.intensity;
    }
    if (ground) {
      if (isMeshStandardMaterial(ground.material)) {
        ground.material.color.setHex(config.groundColor);
      }
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.setHex(config.fogColor);
    }
    if (bloom) {
      bloom.strength = config.bloomStrength;
    }
    renderer.toneMappingExposure = config.toneMappingExposure;

    const envCanvas = document.createElement("canvas");
    envCanvas.width = 256;
    envCanvas.height = 128;
    const ctx = envCanvas.getContext("2d")!;
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    const stops = config.envGradient;
    for (let i = 0; i < stops.length; i++) {
      grad.addColorStop(i / (stops.length - 1), stops[i]);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);
    const envTexture = new THREE.CanvasTexture(envCanvas);
    envTexture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const oldEnv = scene.environment;
    scene.environment = pmrem.fromEquirectangular(envTexture).texture;
    envTexture.dispose();
    pmrem.dispose();
    envCanvas.width = 0;
    envCanvas.height = 0;
    if (oldEnv) oldEnv.dispose();

    const bgCanvas = document.createElement("canvas");
    bgCanvas.width = 2;
    bgCanvas.height = 256;
    const bgCtx = bgCanvas.getContext("2d")!;
    const bgGrad = bgCtx.createLinearGradient(0, 0, 0, 256);
    bgGrad.addColorStop(0, stops[0]);
    bgGrad.addColorStop(0.5, stops[Math.floor(stops.length / 2)]);
    bgGrad.addColorStop(1, stops[stops.length - 1]);
    bgCtx.fillStyle = bgGrad;
    bgCtx.fillRect(0, 0, 2, 256);
    const oldBg = scene.background;
    scene.background = new THREE.CanvasTexture(bgCanvas);
    bgCanvas.width = 0;
    bgCanvas.height = 0;
    if (oldBg instanceof THREE.Texture) oldBg.dispose();
  }, [lightingPreset]);

  useEffect(() => {
    const dir = dirLightRef.current;
    if (!dir || !sunDirection) return;
    dir.position.set(sunDirection[0] * 15, sunDirection[1] * 15, sunDirection[2] * 15);
    const altitude = sunAltitude ?? 30;
    const warmth = Math.max(0, Math.min(1, altitude / 60));
    dir.color.setRGB(0.82 + warmth * 0.18, 0.86 + warmth * 0.14, 0.96 - warmth * 0.26);
    dir.intensity = altitude <= 0 ? 0.08 : Math.max(0.2, Math.min(2, altitude / 30));
  }, [sunDirection, sunAltitude]);

  useEffect(() => {
    const carpet = shadowStudyGroupRef.current;
    if (!carpet) return;
    disposeMeasurementGroup(carpet);

    const samples = shadowStudySamples ?? [];
    const group = objectGroupRef.current;
    if (samples.length === 0 || !group) {
      carpet.visible = false;
      return;
    }

    const bounds = new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty()) {
      carpet.visible = false;
      return;
    }

    samples.slice(0, 24).forEach((sample, index) => {
      carpet.add(createShadowCarpetMesh(sample, bounds, index));
    });
    carpet.visible = true;
  }, [sceneRenderTick, shadowStudySamples]);

  useEffect(() => {
    const airflowGroup = airflowGroupRef.current;
    if (!airflowGroup) return;

    if (airflowRuntimeRef.current) {
      airflowGroup.remove(airflowRuntimeRef.current.points);
      airflowGroup.remove(airflowRuntimeRef.current.arrowGroup);
      disposeAirflowObject(airflowRuntimeRef.current.points);
      disposeAirflowObject(airflowRuntimeRef.current.arrowGroup);
      airflowRuntimeRef.current = null;
    }

    const objectGroup = objectGroupRef.current;
    if (!airflowView || !airflowAnalysis || !objectGroup) {
      airflowGroup.visible = false;
      return;
    }

    const bounds = new THREE.Box3().setFromObject(objectGroup);
    if (bounds.isEmpty()) {
      airflowGroup.visible = false;
      return;
    }

    const runtime = createAirflowRuntime(bounds, airflowAnalysis);
    airflowGroup.add(runtime.points);
    airflowGroup.add(runtime.arrowGroup);
    airflowGroup.visible = true;
    airflowRuntimeRef.current = runtime;

    return () => {
      airflowGroup.remove(runtime.points);
      airflowGroup.remove(runtime.arrowGroup);
      disposeAirflowObject(runtime.points);
      disposeAirflowObject(runtime.arrowGroup);
      if (airflowRuntimeRef.current === runtime) airflowRuntimeRef.current = null;
    };
  }, [airflowAnalysis, airflowView, sceneRenderTick]);

  // Exploded view: shift mesh positions by category group
  useEffect(() => {
    const group = objectGroupRef.current;
    if (!group) return;

    const CONSTRUCTION_ORDER = [
      "masonry", "foundation", "lumber", "sheathing", "roofing",
      "insulation", "membrane", "hardware", "cladding", "finish",
      "trim", "interior", "fasteners", "opening", "unknown",
    ];

    if (!explodedView) {
      // Restore original positions
      originalPositionsRef.current.forEach((pos, obj) => {
        obj.position.copy(pos);
      });
      originalPositionsRef.current.clear();
      return;
    }

    // Group meshes by category
    const categoryMeshes: Record<string, THREE.Mesh[]> = {};
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const matId = child.userData.materialId as string | undefined;
      const category = (matId && materialCategoryMap[matId]) || "unknown";
      if (!categoryMeshes[category]) categoryMeshes[category] = [];
      categoryMeshes[category].push(child);
    });

    // Store original positions (only on first explode after scene load)
    if (originalPositionsRef.current.size === 0) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          originalPositionsRef.current.set(child, child.position.clone());
        }
      });
    }

    // Compute scene center
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const sceneSize = box.getSize(new THREE.Vector3()).length();

    // Sort categories by construction order
    const sortedCategories = Object.keys(categoryMeshes).sort((a, b) => {
      const ai = CONSTRUCTION_ORDER.indexOf(a);
      const bi = CONSTRUCTION_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Assign explosion offsets per category
    const categoryCount = sortedCategories.length;
    const maxOffset = sceneSize * 0.6 * explodeFactor;

    for (let i = 0; i < categoryCount; i++) {
      const category = sortedCategories[i];
      const meshes = categoryMeshes[category];
      if (!meshes || meshes.length === 0) continue;

      // Compute category centroid
      const centroid = new THREE.Vector3();
      for (const mesh of meshes) {
        const orig = originalPositionsRef.current.get(mesh);
        if (orig) centroid.add(orig);
      }
      centroid.divideScalar(meshes.length);

      // Direction from center to category centroid
      const dir = centroid.clone().sub(center);
      if (dir.length() < 0.001) {
        // For categories at center, push along Y (up in scene-local coords, which is Z-up)
        dir.set(0, 0, 1);
      }
      dir.normalize();

      // Offset: spread outward, with inner layers staying closer
      const layerFraction = categoryCount > 1 ? (i - (categoryCount - 1) / 2) / ((categoryCount - 1) / 2 || 1) : 0;
      const offset = dir.multiplyScalar(layerFraction * maxOffset);

      for (const mesh of meshes) {
        const orig = originalPositionsRef.current.get(mesh);
        if (orig) {
          mesh.position.copy(orig).add(offset);
        }
      }
    }
  }, [explodedView, explodeFactor, materialCategoryMap]);

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
    if (measurementMode) {
      setDimensionOverlay(null);
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

  useEffect(() => {
    onMeasurementModeChange?.(measurementMode);
  }, [measurementMode, onMeasurementModeChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewportApi = container as HTMLDivElement & { toggleMeasurementMode?: () => void };
    viewportApi.toggleMeasurementMode = toggleMeasurementMode;
    return () => {
      delete viewportApi.toggleMeasurementMode;
    };
  }, [toggleMeasurementMode]);

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

  const handleDimensionPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (measurementMode) {
      setDimensionOverlay(null);
      return;
    }

    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("select") || target.closest("textarea")) {
      setDimensionOverlay(null);
      return;
    }

    const nextOverlay = pickDimensionOverlay(e.clientX, e.clientY);
    setDimensionOverlay((current) => {
      if (!nextOverlay) return current ? null : current;
      if (
        current &&
        current.id === nextOverlay.id &&
        current.anchor.distanceToSquared(nextOverlay.anchor) < 0.000001 &&
        Math.abs(current.width - nextOverlay.width) < 0.000001 &&
        Math.abs(current.height - nextOverlay.height) < 0.000001 &&
        Math.abs(current.depth - nextOverlay.depth) < 0.000001
      ) {
        return current;
      }
      return nextOverlay;
    });
  }, [measurementMode, pickDimensionOverlay]);

  const handleViewportPointerLeave = useCallback(() => {
    setDimensionOverlay(null);
    setMeasurementPreviewEnd(null);
  }, []);

  const handleSurfacePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((!onMaterialSurfaceSelect && !onObjectSurfaceSelect) || measurementMode || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a") || target.closest("input") || target.closest("select") || target.closest("textarea")) return;
    surfacePointerDownRef.current = { x: e.clientX, y: e.clientY, button: e.button };
  }, [measurementMode, onMaterialSurfaceSelect, onObjectSurfaceSelect]);

  const handleSurfacePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((!onMaterialSurfaceSelect && !onObjectSurfaceSelect) || measurementMode) return;
    const start = surfacePointerDownRef.current;
    surfacePointerDownRef.current = null;
    if (!start || start.button !== e.button || e.button !== 0) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > 36) return;

    if (onObjectSurfaceSelect) {
      const objectId = pickObjectSurface(e.clientX, e.clientY);
      if (objectId) onObjectSurfaceSelect(objectId);
    }

    if (onMaterialSurfaceSelect) {
      const selection = pickMaterialSurface(e.clientX, e.clientY);
      if (selection) onMaterialSurfaceSelect(selection);
    }
  }, [measurementMode, onMaterialSurfaceSelect, onObjectSurfaceSelect, pickMaterialSurface, pickObjectSurface]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setMeasurementMode((active) => !active);
      } else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
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
    dimensionOverlayRef.current = dimensionOverlay;
    updateMeasurementLabelPositions();
  }, [dimensionOverlay, updateMeasurementLabelPositions]);

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
    ...(selectedObjectId ? [{
      id: "focus-selection",
      label: t("editor.focusSelection"),
      icon: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
      onClick: () => { focusObjectRef?.current?.(selectedObjectId); },
    }] : []),
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
      onPointerMove={(e) => {
        handleMeasurementPointerMove(e);
        handleDimensionPointerMove(e);
      }}
      onPointerLeave={handleViewportPointerLeave}
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
      <Minimap
        sceneRef={sceneRef}
        cameraRef={cameraRef}
        controlsRef={controlsRef}
        sceneBoundsRef={sceneBoundsRef}
        onNavigate={(pos, target) => {
          const camera = cameraRef.current;
          const controls = controlsRef.current;
          if (camera && controls) animateCamera(camera, controls, pos, target);
        }}
      />
      {explodedView && (
        <div className="viewport-explode-slider">
          <label style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
            {t("editor.explodeDistance")}
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explodeFactor}
            onChange={(e) => setExplodeFactor(parseFloat(e.target.value))}
            aria-label={t("editor.explodeDistance")}
            style={{ width: 120, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", minWidth: 32, textAlign: "right" }}>
            {Math.round(explodeFactor * 100)}%
          </span>
        </div>
      )}
      {measurementMode && (
        <div className="viewport-measure-hint">
          {measurementStart ? t("editor.measurePickSecond") : t("editor.measurePickFirst")}
        </div>
      )}
      <div className="viewport-scale-indicator" aria-label={t("editor.gridScale")}>
        <span className="viewport-scale-rule" />
        <span>{t("editor.gridScale")}</span>
        <strong>1 m</strong>
      </div>
      {onObjectSurfaceSelect && !measurementMode && (
        <div className="viewport-measure-hint" style={{ left: 12, right: "auto" }}>
          {t("layers.viewportHint")}
        </div>
      )}
      {!onObjectSurfaceSelect && onMaterialSurfaceSelect && !measurementMode && (
        <div className="viewport-measure-hint" style={{ left: 12, right: "auto" }}>
          {t("editor.materialConfiguratorHint")}
        </div>
      )}
      {dimensionOverlay && (
        <div
          ref={dimensionLabelRef}
          className="viewport-dimension-label"
          aria-live="polite"
        >
          <span>{t("editor.dimensions")}</span>
          <strong>
            {t("editor.measureWidth")} {formatDimensionMeters(dimensionOverlay.width, locale)}
          </strong>
          <strong>
            {t("editor.measureHeight")} {formatDimensionMeters(dimensionOverlay.height, locale)}
          </strong>
          <strong>
            {t("editor.measureDepth")} {formatDimensionMeters(dimensionOverlay.depth, locale)}
          </strong>
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
