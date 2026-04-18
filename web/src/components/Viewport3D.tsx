"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { interpretScene, SceneObject } from "@/lib/scene-interpreter";

interface Viewport3DProps {
  sceneJs: string;
  wireframe?: boolean;
  onObjectCount?: (count: number) => void;
  onError?: (error: string | null) => void;
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

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
    camera.position.set(8, 6, 8);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
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
    controls.target.set(0, 1, 0);
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

      // Clear existing objects
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
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
          camera.position.set(8, 6, 8);
          controls.target.set(0, 1, 0);
          controls.update();
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
      }}
    />
  );
}
