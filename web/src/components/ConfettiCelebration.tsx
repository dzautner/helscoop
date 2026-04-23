"use client";

import { useEffect, useRef, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

const COLORS = [
  "#e5a04b", // amber
  "#7ab3e0", // blue
  "#8bc48b", // green
  "#d4a0e0", // purple
  "#f0b86a", // gold
  "#e07a7a", // coral
];

const PARTICLE_COUNT = 80;
const DURATION = 3000;
const GRAVITY = 0.12;
const DRAG = 0.98;

export default function ConfettiCelebration({ onComplete }: { onComplete?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const startRef = useRef(0);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const cx = canvas.width / 2;
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 4 + Math.random() * 8;
      particles.push({
        x: cx + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        width: 6 + Math.random() * 6,
        height: 4 + Math.random() * 3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        opacity: 1,
      });
    }
    particlesRef.current = particles;
    startRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onComplete?.();
      return;
    }

    init();

    const animate = (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const elapsed = now - startRef.current;
      const fadeStart = DURATION * 0.6;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particlesRef.current) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (elapsed > fadeStart) {
          p.opacity = Math.max(0, 1 - (elapsed - fadeStart) / (DURATION - fadeStart));
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();
      }

      if (elapsed < DURATION) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        onComplete?.();
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [init, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );
}
