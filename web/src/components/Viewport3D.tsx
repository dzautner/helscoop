"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { interpretScene, SceneObject } from "@/lib/scene-interpreter";
import { useTranslation } from "@/components/LocaleProvider";
import ViewportContextMenu, { type ContextMenuItem } from "@/components/ViewportContextMenu";
import ScreenshotPopover from "@/components/ScreenshotPopover";

interface Viewport3DProps {
  sceneJs: string;
  wireframe?: boolean;
  onObjectCount?: (count: number) => void;
  onError?: (error: string | null) => void;
  onWarnings?: (warnings: string[]) => void;
  captureRef?: React.MutableRefObject<(() => string | null) | null>;
  onToggleWireframe?: () => void;
  /** Project name for screenshot filenames */
  projectName?: string;
}

interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  key: string;
}

const CAMERA_PRESETS: CameraPreset[] = [
  { position: [0, 2, 8], target: [0, 1.5, 0], key: "editor.cameraFront" },
  { position: [8, 2, 0], target: [0, 1.5, 0], key: "editor.cameraSide" },
  { position: [0, 10, 0.01], target: [0, 0, 0], key: "editor.cameraTop" },
  { position: [5, 4, 5], target: [0, 1.5, 0], key: "editor.cameraIso" },
];


/** Recursively dispose all geometries and materials in an Object3D tree */
function disposeObject(obj: THREE.Object3D) {
  while (obj.children.length > 0) {
    const child = obj.children[0];
    disposeObject(child);
    obj.remove(child);
  }
  if (obj instanceof THREE.Mesh) {
    obj.geometry.dispose();
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => m.dispose());
    } else if (obj.material) {
      obj.material.dispose();
    }
  }
}

function createGeometry(obj: SceneObject): THREE.BufferGeometry {
  switch (obj.geometry) {
    case "box":
      return new THREE.BoxGeometry(
        obj.args[0] || 1,
        obj.args[1] || 1,
        obj.args[2] || 1
      );
    case "cylinder":
      return new THREE.CylinderGeometry(
        obj.args[0] || 0.5,
        obj.args[0] || 0.5,
        obj.args[1] || 1,
        32
      );
    case "sphere":
      return new THREE.SphereGeometry(obj.args[0] || 0.5, 32, 16);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function addSceneObjects(
  parent: THREE.Group,
  objects: SceneObject[],
  wireframe: boolean
): number {
  let count = 0;

  for (const obj of objects) {
    if (obj.geometry === "group" && obj.children) {
      const group = new THREE.Group();
      group.position.set(...obj.position);
      group.rotation.set(...obj.rotation);
      count += addSceneObjects(group, obj.children, wireframe);
      parent.add(group);
    } else {
      const geometry = createGeometry(obj);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(obj.color[0], obj.color[1], obj.color[2]),
        roughness: 0.7,
        metalness: 0.05,
        wireframe,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...obj.position);
      mesh.rotation.set(...obj.rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      count++;
    }
  }

  return count;
}

/** Smoothly animate camera + controls target to a new position over ~400ms */
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
  const startTime = performance.now();

  function step() {
    const elapsed = performance.now() - startTime;
    const raw = Math.min(elapsed / duration, 1);
    // ease-out cubic
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

function CameraToolbar({
  cameraRef,
  controlsRef,
  rendererRef,
  sceneRef,
  projectName,
}: {
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  controlsRef: React.RefObject<OrbitControls | null>;
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>;
  sceneRef: React.RefObject<THREE.Scene | null>;
  projectName?: string;
}) {
  const { t } = useTranslation();
  const [activePreset, setActivePreset] = useState(3); // default to Iso
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);

  const handlePreset = useCallback(
    (preset: CameraPreset, index: number) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      setActivePreset(index);
      animateCamera(camera, controls, preset.position, preset.target);
    },
    [cameraRef, controlsRef]
  );

  const handleScreenshot = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    // Render one clean frame
    renderer.render(scene, camera);

    const canvas = renderer.domElement;
    // Create an offscreen canvas to composite watermark
    const offscreen = document.createElement("canvas");
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);

    // Watermark
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

    // Show popover instead of directly downloading
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
            title={t(preset.key)}
          >
            {t(preset.key)}
          </button>
        ))}
        <button
          className="viewport-cam-btn"
          data-active={screenshotDataUrl !== null}
          onClick={handleScreenshot}
          title={`${t("editor.screenshot")} (Cmd+Shift+S)`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
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
  onWarnings,
  captureRef,
  onToggleWireframe,
  projectName,
}: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const objectGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastValidSceneRef = useRef<string>(sceneJs);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const { t } = useTranslation();

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Sky gradient background — Nordic twilight atmosphere
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#0d1117");
    gradient.addColorStop(0.25, "#151b2b");
    gradient.addColorStop(0.5, "#1c2333");
    gradient.addColorStop(0.75, "#252a35");
    gradient.addColorStop(0.9, "#2d2f38");
    gradient.addColorStop(1, "#1e1d1b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 512);
    const bgTexture = new THREE.CanvasTexture(canvas);
    bgTexture.magFilter = THREE.LinearFilter;
    scene.background = bgTexture;

    // Camera — default to Iso preset
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
    camera.position.set(5, 4, 5);
    camera.lookAt(0, 1.5, 0);
    cameraRef.current = camera;

    // Renderer — preserveDrawingBuffer for screenshot support
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
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 1.5, 0);
    controls.minDistance = 2;
    controls.maxDistance = 50;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.update();
    controlsRef.current = controls;

    // Lights — three-point setup for architectural visualization
    const ambientLight = new THREE.AmbientLight(0xe8e4df, 0.35);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0x7799cc, 0x3d3528, 0.45);
    scene.add(hemisphereLight);

    // Key light — warm sun from upper right
    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.3);
    dirLight.position.set(5, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // Fill light — cool bounce from left
    const fillLight = new THREE.DirectionalLight(0xc4d4e8, 0.3);
    fillLight.position.set(-4, 3, -2);
    scene.add(fillLight);

    // Grid floor
    const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
    (gridHelper.material as THREE.Material).opacity = 0.15;
    (gridHelper.material as THREE.Material).transparent = true;
    scene.add(gridHelper);

    // Depth fog
    scene.fog = new THREE.Fog(0x1a1d22, 15, 45);

    // Ground plane (receives shadows)
    const groundGeom = new THREE.PlaneGeometry(40, 40);
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

    // Object group (will be populated with scene objects)
    const objectGroup = new THREE.Group();
    scene.add(objectGroup);
    objectGroupRef.current = objectGroup;

    // Animation loop
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
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
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      bgTexture.dispose();
      groundGeom.dispose();
      groundMat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update scene objects when sceneJs or wireframe changes
  const updateScene = useCallback(
    (script: string, wf: boolean) => {
      const group = objectGroupRef.current;
      if (!group) return;

      // Recursively dispose all geometries and materials (including nested groups)
      // to prevent GPU memory leaks during prolonged editing sessions
      while (group.children.length > 0) {
        const child = group.children[0];
        disposeObject(child);
        group.remove(child);
      }

      // Interpret and render
      const result = interpretScene(script);
      onWarnings?.(result.warnings);

      if (result.error) {
        onError?.(result.error);
        // On error, try rendering last valid scene
        if (script !== lastValidSceneRef.current) {
          const fallback = interpretScene(lastValidSceneRef.current);
          if (!fallback.error) {
            const count = addSceneObjects(group, fallback.objects, wf);
            onObjectCount?.(count);
          }
        }
        return;
      }

      lastValidSceneRef.current = script;
      onError?.(null);
      const count = addSceneObjects(group, result.objects, wf);
      onObjectCount?.(count);
    },
    [onObjectCount, onError, onWarnings]
  );

  // Debounced scene update
  useEffect(() => {
    const timer = setTimeout(() => {
      updateScene(sceneJs, wireframe);
    }, 150);
    return () => clearTimeout(timer);
  }, [sceneJs, wireframe, updateScene]);

  // Expose reset camera function via ref on container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    (container as HTMLDivElement & { resetCamera?: () => void }).resetCamera =
      () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) {
          animateCamera(camera, controls, [5, 4, 5], [0, 1.5, 0]);
        }
      };
  }, []);

  // Expose thumbnail capture function via captureRef
  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return null;
      renderer.render(scene, camera);
      const canvas = renderer.domElement;
      // Create a small thumbnail (320x180) to keep payload under 200KB
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

  // Right-click context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuPos(null);
  }, []);

  // Screenshot handler for context menu
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

  // Build context menu items
  const contextMenuItems: ContextMenuItem[] = [
    {
      id: "camera-front",
      label: t("editor.cameraFront"),
      icon: "M3 12h18M12 3v18",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) animateCamera(camera, controls, [0, 2, 8], [0, 1.5, 0]);
      },
    },
    {
      id: "camera-side",
      label: t("editor.cameraSide"),
      icon: "M12 3v18M21 12H3",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) animateCamera(camera, controls, [8, 2, 0], [0, 1.5, 0]);
      },
    },
    {
      id: "camera-top",
      label: t("editor.cameraTop"),
      icon: "M12 5v14M5 12h14M7.5 7.5l9 9M16.5 7.5l-9 9",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) animateCamera(camera, controls, [0, 10, 0.01], [0, 0, 0]);
      },
    },
    {
      id: "camera-iso",
      label: t("editor.cameraIso"),
      icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
      onClick: () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls) animateCamera(camera, controls, [5, 4, 5], [0, 1.5, 0]);
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
        if (camera && controls) animateCamera(camera, controls, [5, 4, 5], [0, 1.5, 0]);
      },
    },
  ];

  return (
    <div
      ref={containerRef}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 200,
        background: "#111113",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <CameraToolbar
        cameraRef={cameraRef}
        controlsRef={controlsRef}
        rendererRef={rendererRef}
        sceneRef={sceneRef}
        projectName={projectName}
      />
      <ViewportContextMenu
        items={contextMenuItems}
        position={contextMenuPos}
        onClose={closeContextMenu}
      />
    </div>
  );
}
