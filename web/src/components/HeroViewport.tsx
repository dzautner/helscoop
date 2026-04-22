"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

function buildHouseGeometry(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd4a574,
    roughness: 0.85,
    metalness: 0.05,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x8b4513,
    roughness: 0.7,
    metalness: 0.1,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x87ceeb,
    roughness: 0.1,
    metalness: 0.3,
    transparent: true,
    opacity: 0.6,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), mat);
  body.position.set(0, 2.5, 0);
  group.add(body);

  const roofGeo = new THREE.ConeGeometry(7.5, 3.5, 4);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 6.75, 0);
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  const doorGeo = new THREE.BoxGeometry(1.2, 2.4, 0.3);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 1.2, 4.15);
  group.add(door);

  const winGeo = new THREE.BoxGeometry(1.4, 1.2, 0.15);
  const winL = new THREE.Mesh(winGeo, glassMat);
  winL.position.set(-3, 3.1, 4.05);
  group.add(winL);
  const winR = new THREE.Mesh(winGeo, glassMat);
  winR.position.set(3, 3.1, 4.05);
  group.add(winR);

  const chimneyGeo = new THREE.BoxGeometry(1, 2.5, 1);
  const chimney = new THREE.Mesh(chimneyGeo, mat.clone());
  chimney.material.color.set(0xb8b8b8);
  chimney.position.set(3, 7.25, -1);
  group.add(chimney);

  return group;
}

export default function HeroViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(18, 12, 18);
    camera.lookAt(0, 3, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0db, 1.2);
    dirLight.position.set(10, 15, 8);
    dirLight.castShadow = false;
    scene.add(dirLight);

    const rimLight = new THREE.PointLight(0xe5a04b, 0.4, 50);
    rimLight.position.set(-8, 6, -8);
    scene.add(rimLight);

    const house = buildHouseGeometry();
    scene.add(house);

    const radius = 24;
    let angle = 0;
    let frameId = 0;

    const reducedMotion = typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const speed = reducedMotion ? 0 : 0.003;

    function animate() {
      angle += speed;
      camera.position.x = Math.cos(angle) * radius;
      camera.position.z = Math.sin(angle) * radius;
      camera.position.y = 12;
      camera.lookAt(0, 3, 0);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    setVisible(true);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: 200,
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        border: "1px solid rgba(229,160,75,0.15)",
        boxShadow: "0 0 32px rgba(229,160,75,0.06)",
        background: "transparent",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.6s ease",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}
