"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Appearance = "modern" | "desktop" | "jmk" | "pipboy" | "amber" | "dracula";

interface AppearanceContextType {
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
}

const AppearanceContext = createContext<AppearanceContextType | undefined>(undefined);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>("modern");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("appearance") as Appearance | null;
    if (saved && ["modern", "desktop", "jmk", "pipboy", "amber", "dracula"].includes(saved)) {
      setAppearanceState(saved);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("appearance", appearance);
    }
  }, [appearance, mounted]);

  const setAppearance = (newAppearance: Appearance) => {
    setAppearanceState(newAppearance);
  };

  if (!mounted) return null;

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (context === undefined) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return context;
}
