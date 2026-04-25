"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useAmbientSound } from "@/hooks/useAmbientSound";

interface ViewCubeProps {
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  controlsRef: React.RefObject<OrbitControls | null>;
  sceneBoundsRef: React.RefObject<{ center: THREE.Vector3; size: number } | null>;
  onNavigate: (position: [number, number, number], target: [number, number, number]) => void;
}

// BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
const FACE_LABELS = ["R", "L", "T", "Bo", "F", "B"];
const FACE_NORMALS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

function createFaceCanvas(label: string, active: boolean): HTMLCanvasElement {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = active ? "rgba(229, 160, 75, 0.22)" : "rgba(35, 35, 40, 0.55)";
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = active ? "rgba(229, 160, 75, 0.45)" : "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, s - 4, s - 4);
  ctx.fillStyle = active ? "rgba(229, 160, 75, 0.95)" : "rgba(255, 255, 255, 0.6)";
  ctx.font = `bold ${label.length > 1 ? 38 : 50}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, s / 2, s / 2);
  return canvas;
}

function computeFacePreset(
  faceIndex: number,
  bounds: { center: THREE.Vector3; size: number } | null,
): [[number, number, number], [number, number, number]] {
  const cx = bounds?.center.x ?? 0;
  const cy = bounds?.center.y ?? 0;
  const cz = bounds?.center.z ?? 0;
  const d = (bounds?.size ?? 8) * 1.2;
  const e = d * 0.15;
  switch (faceIndex) {
    case 0: return [[cx + d, cy + e, cz], [cx, cy, cz]];
    case 1: return [[cx - d, cy + e, cz], [cx, cy, cz]];
    case 2: return [[cx, cy + d, cz + 0.01], [cx, cy, cz]];
    case 3: return [[cx, cy - d, cz + 0.01], [cx, cy, cz]];
    case 4: return [[cx, cy + e, cz + d], [cx, cy, cz]];
    case 5: return [[cx, cy + e, cz - d], [cx, cy, cz]];
    default: return [[cx + d * 0.55, cy + d * 0.45, cz + d * 0.55], [cx, cy, cz]];
  }
}

interface ViewCubeState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cube: THREE.Mesh;
  textures: THREE.CanvasTexture[];
  activeFace: number;
  animFrame: number;
}

export default function ViewCube({ cameraRef, controlsRef, sceneBoundsRef, onNavigate }: ViewCubeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ViewCubeState | null>(null);
  const { play: playSfx } = useAmbientSound();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100);
    camera.position.set(4, 3, 4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(100, 100);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const canvases = FACE_LABELS.map((l) => createFaceCanvas(l, false));
    const textures = canvases.map((c) => new THREE.CanvasTexture(c));
    const materials = textures.map((t) => new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    const cube = new THREE.Mesh(geometry, materials);
    scene.add(cube);

    const edgesGeo = new THREE.EdgesGeometry(geometry);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
    cube.add(new THREE.LineSegments(edgesGeo, edgesMat));

    const axisData: { color: number; dir: [number, number, number] }[] = [
      { color: 0xef4444, dir: [1.6, 0, 0] },
      { color: 0x22c55e, dir: [0, 1.6, 0] },
      { color: 0x3b82f6, dir: [0, 0, 1.6] },
    ];
    for (const { color, dir } of axisData) {
      const pts = [new THREE.Vector3(), new THREE.Vector3(...dir)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthTest: false });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 999;
      scene.add(line);
      const tipGeo = new THREE.SphereGeometry(0.07, 8, 8);
      const tipMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(...dir);
      tip.renderOrder = 1000;
      scene.add(tip);
    }

    const _dir = new THREE.Vector3();
    const _viewDir = new THREE.Vector3();
    const _normal = new THREE.Vector3();
    let activeFace = -1;

    const state: ViewCubeState = { renderer, scene, camera, cube, textures, activeFace, animFrame: 0 };
    stateRef.current = state;

    function animate() {
      state.animFrame = requestAnimationFrame(animate);
      const mainCam = cameraRef.current;
      const controls = controlsRef.current;
      if (!mainCam || !controls) {
        renderer.render(scene, camera);
        return;
      }

      _dir.copy(mainCam.position).sub(controls.target).normalize();
      camera.position.copy(_dir).multiplyScalar(5.5);
      camera.lookAt(0, 0, 0);

      _viewDir.copy(_dir).negate();
      let maxDot = -Infinity;
      let newActive = -1;
      for (let i = 0; i < 6; i++) {
        _normal.set(...FACE_NORMALS[i]);
        const d = _normal.dot(_viewDir);
        if (d > maxDot) { maxDot = d; newActive = i; }
      }

      if (newActive !== activeFace) {
        const prev = activeFace;
        activeFace = newActive;
        state.activeFace = newActive;
        if (prev >= 0) {
          textures[prev].image = createFaceCanvas(FACE_LABELS[prev], false);
          textures[prev].needsUpdate = true;
        }
        if (newActive >= 0) {
          textures[newActive].image = createFaceCanvas(FACE_LABELS[newActive], true);
          textures[newActive].needsUpdate = true;
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(state.animFrame);
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          const mat = child.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); });
          } else {
            (mat as THREE.MeshBasicMaterial & { map?: THREE.Texture }).map?.dispose();
            (mat as THREE.Material).dispose();
          }
        }
      });
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [cameraRef, controlsRef]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    if (!s) return;
    const rect = s.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, s.camera);
    const hits = raycaster.intersectObject(s.cube);
    if (hits.length > 0) {
      const fi = hits[0].face?.materialIndex;
      if (fi !== undefined && fi >= 0 && fi < 6) {
        const [pos, target] = computeFacePreset(fi, sceneBoundsRef.current);
        onNavigate(pos, target);
        playSfx("cameraSnap");
      }
    }
  }, [onNavigate, sceneBoundsRef, playSfx]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const s = stateRef.current;
    const container = containerRef.current;
    if (!s || !container) return;
    const rect = s.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, s.camera);
    const hits = raycaster.intersectObject(s.cube);
    container.style.cursor = hits.length > 0 ? "pointer" : "default";
  }, []);

  return (
    <div
      ref={containerRef}
      className="view-cube"
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      role="toolbar"
      aria-label="Orientation cube"
    />
  );
}
