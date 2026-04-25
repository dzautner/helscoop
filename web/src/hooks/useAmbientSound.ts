"use client";

import { useCallback } from "react";
import { playSound, type SoundName } from "@/lib/sounds";

const STORAGE_KEY = "helscoop_ambient_sound";

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    const explicit = localStorage.getItem(STORAGE_KEY);
    if (explicit !== "true") return false;
  }
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function getAmbientSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setAmbientSoundEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(enabled));
}

export function useAmbientSound() {
  const play = useCallback((name: SoundName) => {
    if (!isEnabled()) return;
    playSound(name);
  }, []);

  return { play };
}
