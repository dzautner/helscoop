"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MINIMAP_W = 200;
const MINIMAP_H = 140;
const RENDER_INTERVAL = 100;

interface MinimapProps {
  sceneRef: React.RefObject<THREE.Scene | null>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  controlsRef: React.RefObject<OrbitControls | null>;
  sceneBoundsRef: React.RefObject<{ center: THREE.Vector3; size: number } | null>;
  onNavigate: (position: [number, number, number], target: [number, number, number]) => void;
}

interface MinimapState {
  renderer: THREE.WebGLRenderer;
  orthoCamera: THREE.OrthographicCamera;
  interval: ReturnType<typeof setInterval>;
}

export default function Minimap({ sceneRef, cameraRef, controlsRef, sceneBoundsRef, onNavigate }: MinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(true);
  const stateRef = useRef<MinimapState | null>(null);
  const draggingRef = useRef(false);
  const offsetRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const saved = localStorage.getItem("helscoop-minimap-visible");
    if (saved !== null) setVisible(saved !== "false");

    const handleKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt?.tagName === "INPUT" || tgt?.tagName === "TEXTAREA" || tgt?.tagName === "SELECT" || tgt?.isContentEditable) return;
      if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setVisible((v) => {
          const next = !v;
          localStorage.setItem("helscoop-minimap-visible", String(next));
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !visible) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(MINIMAP_W, MINIMAP_H);
    renderer.setClearColor(0x111113, 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.borderRadius = "5px";
    container.insertBefore(renderer.domElement, container.firstChild);

    const orthoCamera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 500);
    orthoCamera.up.set(0, 0, -1);
    orthoCamera.position.set(0, 100, 0);
    orthoCamera.lookAt(0, 0, 0);

    const _projected = new THREE.Vector3();

    function toMinimap(world: THREE.Vector3): [number, number] {
      _projected.copy(world).project(orthoCamera);
      return [
        (_projected.x * 0.5 + 0.5) * MINIMAP_W,
        (-_projected.y * 0.5 + 0.5) * MINIMAP_H,
      ];
    }

    function renderMinimap() {
      const scene = sceneRef.current;
      const mainCamera = cameraRef.current;
      const controls = controlsRef.current;
      const bounds = sceneBoundsRef.current;
      if (!scene) return;

      if (bounds) {
        const pad = bounds.size * 0.8;
        const aspect = MINIMAP_W / MINIMAP_H;
        orthoCamera.left = -pad * aspect;
        orthoCamera.right = pad * aspect;
        orthoCamera.top = pad;
        orthoCamera.bottom = -pad;
        orthoCamera.position.set(bounds.center.x, bounds.center.y + 100, bounds.center.z);
        orthoCamera.lookAt(bounds.center.x, bounds.center.y, bounds.center.z);
        orthoCamera.updateProjectionMatrix();
      }

      const savedBg = scene.background;
      const savedFog = scene.fog;
      scene.background = null;
      scene.fog = null;
      renderer.render(scene, orthoCamera);
      scene.background = savedBg;
      scene.fog = savedFog;

      const overlay = overlayRef.current;
      if (!overlay || !mainCamera || !controls) return;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

      const target = controls.target;
      const camPos = mainCamera.position;
      const dir = new THREE.Vector3().subVectors(target, camPos);
      const dist = dir.length();
      if (dist < 0.001) return;
      dir.normalize();

      const vFov = mainCamera.fov * Math.PI / 180;
      const halfH = dist * Math.tan(vFov / 2);
      const halfW = halfH * mainCamera.aspect;

      const right = new THREE.Vector3().crossVectors(dir, mainCamera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, dir).normalize();

      const corners = [
        target.clone().add(right.clone().multiplyScalar(-halfW)).add(up.clone().multiplyScalar(halfH)),
        target.clone().add(right.clone().multiplyScalar(halfW)).add(up.clone().multiplyScalar(halfH)),
        target.clone().add(right.clone().multiplyScalar(halfW)).add(up.clone().multiplyScalar(-halfH)),
        target.clone().add(right.clone().multiplyScalar(-halfW)).add(up.clone().multiplyScalar(-halfH)),
      ];

      ctx.beginPath();
      const [x0, y0] = toMinimap(corners[0]);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < 4; i++) {
        const [x, y] = toMinimap(corners[i]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(245, 158, 11, 0.08)";
      ctx.fill();

      const [cx, cy] = toMinimap(camPos);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.fill();

      const [tx, ty] = toMinimap(target);
      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245, 158, 11, 0.9)";
      ctx.fill();
    }

    const interval = setInterval(renderMinimap, RENDER_INTERVAL);
    renderMinimap();

    const state: MinimapState = { renderer, orthoCamera, interval };
    stateRef.current = state;

    return () => {
      clearInterval(interval);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [sceneRef, cameraRef, controlsRef, sceneBoundsRef, visible]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (camera && controls) {
      offsetRef.current.copy(camera.position).sub(controls.target);
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [cameraRef, controlsRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    const s = stateRef.current;
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!s || !controls || !camera) return;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const worldPos = new THREE.Vector3(ndcX, ndcY, 0).unproject(s.orthoCamera);

    controls.target.x = worldPos.x;
    controls.target.z = worldPos.z;
    camera.position.x = worldPos.x + offsetRef.current.x;
    camera.position.z = worldPos.z + offsetRef.current.z;
    controls.update();
  }, [cameraRef, controlsRef]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const handleDoubleClick = useCallback(() => {
    const bounds = sceneBoundsRef.current;
    if (!bounds) return;
    const d = bounds.size * 1.2;
    onNavigate(
      [bounds.center.x + d * 0.55, bounds.center.y + d * 0.45, bounds.center.z + d * 0.55],
      [bounds.center.x, bounds.center.y, bounds.center.z],
    );
  }, [onNavigate, sceneBoundsRef]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className="viewport-minimap">
      <canvas
        ref={overlayRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        className="viewport-minimap-overlay"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        role="toolbar"
        aria-label="Scene minimap"
      />
    </div>
  );
}
