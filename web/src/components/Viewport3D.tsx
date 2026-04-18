"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { interpretScene, SceneObject } from "@/lib/scene-interpreter";
import { useTranslation } from "@/components/LocaleProvider";

interface Viewport3DProps {
  sceneJs: string;
  wireframe?: boolean;
  onObjectCount?: (count: number) => void;
  onError?: (error: string | null) => void;
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

const TOOLBAR_BTN: React.CSSProperties = {
  padding: "4px 7px",
  fontSize: 11,
  fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
  background: "rgba(0,0,0,0.55)",
  color: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  cursor: "pointer",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  lineHeight: 1,
  transition: "background 0.15s, color 0.15s",
};

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

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = "rgba(255,255,255,0.15)";
  e.currentTarget.style.color = "rgba(255,255,255,0.95)";
}
function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = "rgba(0,0,0,0.55)";
  e.currentTarget.style.color = "rgba(255,255,255,0.78)";
}

function CameraToolbar({
  cameraRef,
  controlsRef,
  rendererRef,
  sceneRef,
}: {
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  controlsRef: React.RefObject<OrbitControls | null>;
  rendererRef: React.RefObject<THREE.WebGLRenderer | null>;
  sceneRef: React.RefObject<THREE.Scene | null>;
}) {
  const { t } = useTranslation();

  const handlePreset = useCallback(
    (preset: CameraPreset) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
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

    // Download
    const link = document.createElement("a");
    link.download = "helscoop-screenshot.png";
    link.href = offscreen.toDataURL("image/png");
    link.click();
  }, [rendererRef, sceneRef, cameraRef]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        left: 10,
        display: "flex",
        gap: 4,
        zIndex: 10,
        pointerEvents: "auto",
      }}
    >
      {CAMERA_PRESETS.map((preset, i) => (
        <button
          key={i}
          onClick={() => handlePreset(preset)}
          title={t(preset.key)}
          style={TOOLBAR_BTN}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          {t(preset.key)}
        </button>
      ))}
      <button
        onClick={handleScreenshot}
        title={t("editor.screenshot")}
        style={{
          ...TOOLBAR_BTN,
          display: "flex",
          alignItems: "center",
          gap: 3,
        }}
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>
    </div>
  );
}

export default function Viewport3D({
  sceneJs,
  wireframe = false,
  onObjectCount,
  onError,
}: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const objectGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastValidSceneRef = useRef<string>(sceneJs);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Sky gradient background
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, "#1a1d2e");
    gradient.addColorStop(0.6, "#1e1f28");
    gradient.addColorStop(1, "#2a2420");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
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

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.4);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0x8899bb, 0x443322, 0.3);
    scene.add(hemisphereLight);

    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
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

    // Grid floor
    const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x222222);
    (gridHelper.material as THREE.Material).opacity = 0.15;
    (gridHelper.material as THREE.Material).transparent = true;
    scene.add(gridHelper);

    // Ground plane (receives shadows, subtle)
    const groundGeom = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1816,
      roughness: 0.95,
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
    [onObjectCount, onError]
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

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 200,
        background: "#1a1816",
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
      />
    </div>
  );
}
