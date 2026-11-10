import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
type AppAppearance = "premium" | "modern";
type ThemeContextValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void; appearance: AppAppearance; setAppearance: (appearance: AppAppearance) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const storageKey = `olive-press-theme:${userId}`;
  const appearanceStorageKey = `oroverde-appearance:${userId}`;
  const [appearance, setAppearanceState] = useState<AppAppearance>(() => {
    try { return localStorage.getItem(appearanceStorageKey) === "premium" ? "premium" : "modern"; }
    catch { return "modern"; }
  });
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === "dark" || saved === "system" || saved === "light" ? saved : "light";
    } catch { return "light"; }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "dark" || saved === "system" || saved === "light") setModeState(saved);
      else setModeState("light");
    } catch { setModeState("light"); }
  }, [storageKey]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(appearanceStorageKey);
      setAppearanceState(saved === "premium" ? "premium" : "modern");
    } catch { setAppearanceState("modern"); }
  }, [appearanceStorageKey]);

  useEffect(() => {
    document.documentElement.dataset.appAppearance = appearance;
  }, [appearance]);

  useEffect(() => {
    applyTheme(mode);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(mode);
    if (mode === "system") media.addEventListener("change", update);
    const beforePrint = () => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.colorScheme = "light";
    };
    const afterPrint = () => applyTheme(mode);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      if (mode === "system") media.removeEventListener("change", update);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [mode]);

  const setAppearance = (next: AppAppearance) => {
    setAppearanceState(next);
    try { localStorage.setItem(appearanceStorageKey, next); } catch { /* storage may be unavailable */ }
  };
  const setMode = (next: ThemeMode) => {
    setModeState(next);
    try { localStorage.setItem(storageKey, next); } catch { /* storage may be unavailable */ }
  };
  const value = useMemo(() => ({ mode, setMode, appearance, setAppearance }), [mode, appearance]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
