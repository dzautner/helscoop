"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { useTranslation } from "@/components/LocaleProvider";
import type { Material } from "@/types";

type PreviewGeometry = "slab" | "sphere" | "corner";
type LightingPreset = "overcast" | "sun" | "interior" | "dusk";
type FinishVariant = "matte" | "satin" | "gloss" | "textured";

interface MaterialPreviewBallProps {
  material: Material;
  onClose: () => void;
  anchorRect?: DOMRect | null;
}

const LIGHTING: Record<LightingPreset, {
  ambient: [number, number, number];
  ambientIntensity: number;
  dir: [number, number, number];
  dirColor: [number, number, number];
  dirIntensity: number;
}> = {
  overcast: {
    ambient: [0.75, 0.78, 0.82],
    ambientIntensity: 0.9,
    dir: [2, 4, 1],
    dirColor: [0.9, 0.9, 0.95],
    dirIntensity: 0.5,
  },
  sun: {
    ambient: [0.5, 0.55, 0.65],
    ambientIntensity: 0.4,
    dir: [3, 5, 2],
    dirColor: [1.0, 0.95, 0.85],
    dirIntensity: 1.8,
  },
  interior: {
    ambient: [0.35, 0.28, 0.2],
    ambientIntensity: 0.5,
    dir: [0, 3, 2],
    dirColor: [1.0, 0.88, 0.7],
    dirIntensity: 1.2,
  },
  dusk: {
    ambient: [0.25, 0.2, 0.3],
    ambientIntensity: 0.35,
    dir: [5, 1.5, 0],
    dirColor: [1.0, 0.75, 0.45],
    dirIntensity: 1.5,
  },
};

const FINISH_PBR: Record<FinishVariant, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.95, metalness: 0.0 },
  satin: { roughness: 0.5, metalness: 0.05 },
  gloss: { roughness: 0.1, metalness: 0.15 },
  textured: { roughness: 0.85, metalness: 0.0 },
};

function getMaterialColor(material: Material): THREE.Color {
  const albedo = material.visual_albedo;
  if (Array.isArray(albedo) && albedo.length >= 3) {
    return new THREE.Color(albedo[0], albedo[1], albedo[2]);
  }
  const palette = [0x8b6f47, 0xc49058, 0x4a5568, 0x4a8b7f, 0x718096, 0xcbd5e0];
  const seed = Array.from(material.category_name || material.name).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  );
  return new THREE.Color(palette[seed % palette.length]);
}

function createPreviewGeometry(type: PreviewGeometry): THREE.BufferGeometry {
  switch (type) {
    case "sphere":
      return new THREE.SphereGeometry(1, 64, 64);
    case "slab": {
      return new THREE.BoxGeometry(2.2, 1.4, 0.2, 1, 1, 1);
    }
    case "corner": {
      const group = new THREE.BufferGeometry();
      const wall1 = new THREE.BoxGeometry(1.6, 1.6, 0.15);
      wall1.translate(-0.075, 0, 0.8);
      const wall2 = new THREE.BoxGeometry(0.15, 1.6, 1.6);
      wall2.translate(0.8, 0, -0.075);
      const merged = mergeGeometries([wall1, wall2]);
      group.copy(merged);
      wall1.dispose();
      wall2.dispose();
      merged.dispose();
      return group;
    }
  }
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of geometries) {
    totalVerts += g.getAttribute("position").count;
    totalIdx += g.index ? g.index.count : 0;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIdx);
  let vertOffset = 0;
  let idxOffset = 0;
  for (const g of geometries) {
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const norm = g.getAttribute("normal") as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, vertOffset * 3);
    normals.set(norm.array as Float32Array, vertOffset * 3);
    if (g.index) {
      const idx = g.index.array;
      for (let i = 0; i < idx.length; i++) {
        indices[idxOffset + i] = idx[i] + vertOffset;
      }
      idxOffset += idx.length;
    }
    vertOffset += pos.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

export default function MaterialPreviewBall({
  material,
  onClose,
  anchorRect,
}: MaterialPreviewBallProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const animFrameRef = useRef(0);

  const [geometry, setGeometry] = useState<PreviewGeometry>("sphere");
  const [lighting, setLighting] = useState<LightingPreset>("overcast");
  const [activeFinish, setActiveFinish] = useState<FinishVariant>("matte");

  const baseColor = useRef(getMaterialColor(material));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(220, 220);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    camera.position.set(2.5, 1.8, 2.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;
    controls.dampingFactor = 0.08;
    controls.enableDamping = true;
    controlsRef.current = controls;

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);
    ambientRef.current = ambient;

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(2, 4, 1);
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const floorGeo = new THREE.PlaneGeometry(6, 6);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.05;
    floor.receiveShadow = true;
    scene.add(floor);

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (meshRef.current) {
      (meshRef.current.material as THREE.MeshStandardMaterial).dispose();
      meshRef.current.geometry.dispose();
      scene.remove(meshRef.current);
    }

    const geo = createPreviewGeometry(geometry);
    const pbr = FINISH_PBR[activeFinish];
    const mat = new THREE.MeshStandardMaterial({
      color: baseColor.current.clone(),
      roughness: pbr.roughness,
      metalness: pbr.metalness,
      ...(activeFinish === "textured"
        ? { bumpScale: 0.03 }
        : {}),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    scene.add(mesh);
    meshRef.current = mesh;
  }, [geometry, activeFinish]);

  useEffect(() => {
    const ambient = ambientRef.current;
    const dirLight = dirLightRef.current;
    if (!ambient || !dirLight) return;
    const preset = LIGHTING[lighting];
    ambient.color.setRGB(...preset.ambient);
    ambient.intensity = preset.ambientIntensity;
    dirLight.color.setRGB(...preset.dirColor);
    dirLight.intensity = preset.dirIntensity;
    dirLight.position.set(...preset.dir);
  }, [lighting]);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".material-preview-widget")) return;
      onClose();
    },
    [onClose]
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, handleClickOutside]);

  const positionStyle: React.CSSProperties = {};
  if (anchorRect) {
    const spaceRight = window.innerWidth - anchorRect.right;
    if (spaceRight > 280) {
      positionStyle.left = anchorRect.right + 8;
      positionStyle.top = Math.max(8, anchorRect.top - 40);
    } else {
      positionStyle.right = window.innerWidth - anchorRect.left + 8;
      positionStyle.top = Math.max(8, anchorRect.top - 40);
    }
  } else {
    positionStyle.top = "50%";
    positionStyle.left = "50%";
    positionStyle.transform = "translate(-50%, -50%)";
  }

  const geometries: { key: PreviewGeometry; label: string }[] = [
    { key: "sphere", label: t("materialPreview.sphere") },
    { key: "slab", label: t("materialPreview.slab") },
    { key: "corner", label: t("materialPreview.corner") },
  ];

  const lightingPresets: { key: LightingPreset; label: string; icon: string }[] = [
    { key: "overcast", label: t("materialPreview.overcast"), icon: "\u2601" },
    { key: "sun", label: t("materialPreview.sun"), icon: "\u2600" },
    { key: "interior", label: t("materialPreview.interior"), icon: "\uD83D\uDCA1" },
    { key: "dusk", label: t("materialPreview.dusk"), icon: "\uD83C\uDF19" },
  ];

  const finishVariants: FinishVariant[] = ["matte", "satin", "gloss", "textured"];

  return (
    <div
      className="material-preview-widget"
      style={{ position: "fixed", zIndex: 1300, ...positionStyle }}
    >
      <div className="material-preview-header">
        <span className="material-preview-title">{material.name}</span>
        <button
          type="button"
          className="material-preview-close"
          onClick={onClose}
          aria-label={t("materialPreview.close")}
        >
          &times;
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={220}
        height={220}
        className="material-preview-canvas"
      />

      <div className="material-preview-lighting">
        {lightingPresets.map((lp) => (
          <button
            key={lp.key}
            type="button"
            className="material-preview-light-btn"
            data-active={lighting === lp.key}
            onClick={() => setLighting(lp.key)}
            title={lp.label}
          >
            {lp.icon}
          </button>
        ))}
      </div>

      <div className="material-preview-divider" />

      <div className="material-preview-geometry">
        {geometries.map((g) => (
          <button
            key={g.key}
            type="button"
            className="material-preview-geo-btn"
            data-active={geometry === g.key}
            onClick={() => setGeometry(g.key)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="material-preview-divider" />

      <div className="material-preview-finishes">
        <span className="material-preview-finish-label">
          {t("materialPreview.finish")}
        </span>
        <div className="material-preview-finish-strip">
          {finishVariants.map((fv) => {
            const pbr = FINISH_PBR[fv];
            const col = baseColor.current.clone();
            const brightness = 0.3 + (1 - pbr.roughness) * 0.4;
            const css = `rgb(${Math.round(col.r * 255 * brightness)}, ${Math.round(col.g * 255 * brightness)}, ${Math.round(col.b * 255 * brightness)})`;
            return (
              <button
                key={fv}
                type="button"
                className="material-preview-finish-ball"
                data-active={activeFinish === fv}
                onClick={() => setActiveFinish(fv)}
                title={t(`materialPreview.${fv}`)}
                style={{
                  background: `radial-gradient(circle at 35% 35%, ${css}, rgba(0,0,0,0.5))`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
