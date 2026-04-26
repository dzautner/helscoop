"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { safeGetLocalStorageItem, safeSetLocalStorageItem } from "@/lib/browser-storage";

type ThemeChoice = "dark" | "light" | "auto";
export type DarkMood = "warm" | "cool" | "black";

interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: "dark" | "light";
  mood: DarkMood;
  toggle: () => void;
  setTheme: (t: ThemeChoice) => void;
  setMood: (m: DarkMood) => void;
}

const STORAGE_KEY = "helscoop-theme";
const MOOD_KEY = "helscoop-mood";
export const DARK_MOODS: DarkMood[] = ["warm", "cool", "black"];

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  resolved: "dark",
  mood: "warm",
  toggle: () => {},
  setTheme: () => {},
  setMood: () => {},
});

function resolveTheme(
  choice: ThemeChoice,
  prefersDark: boolean
): "dark" | "light" {
  if (choice === "auto") return prefersDark ? "dark" : "light";
  return choice;
}

const CYCLE: ThemeChoice[] = ["dark", "light", "auto"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("dark");
  const [mood, setMoodState] = useState<DarkMood>("warm");
  const [prefersDark, setPrefersDark] = useState(true);

  useEffect(() => {
    const stored = safeGetLocalStorageItem(STORAGE_KEY) as ThemeChoice | null;
    if (stored && CYCLE.includes(stored)) {
      setThemeState(stored);
    }
    const storedMood = safeGetLocalStorageItem(MOOD_KEY) as DarkMood | null;
    if (storedMood && DARK_MOODS.includes(storedMood)) {
      setMoodState(storedMood);
    }
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setPrefersDark(mql.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const resolved = resolveTheme(theme, prefersDark);

  useEffect(() => {
    document.documentElement.classList.add("theme-transitioning");
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-mood", resolved === "dark" ? mood : "");
    const id = setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
    }, 350);
    return () => clearTimeout(id);
  }, [resolved, mood]);

  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    safeSetLocalStorageItem(STORAGE_KEY, t);
  }, []);

  const setMood = useCallback((m: DarkMood) => {
    setMoodState(m);
    safeSetLocalStorageItem(MOOD_KEY, m);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const idx = CYCLE.indexOf(prev);
      const next = CYCLE[(idx + 1) % CYCLE.length];
      safeSetLocalStorageItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, mood, toggle, setTheme, setMood }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
