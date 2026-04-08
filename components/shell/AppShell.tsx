"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppearance } from "@/app/appearance-context";
import DesktopShell from "./DesktopShell";
import JMKShell from "./JMKShell";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { appearance } = useAppearance();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();

  // If ?shell=none, render children directly (used by iframe windows in Desktop mode)
  if (searchParams.get("shell") === "none") return <>{children}</>;

  // Always use modern on mobile
  if (isMobile) return <>{children}</>;

  switch (appearance) {
    case "desktop":
      return <DesktopShell>{children}</DesktopShell>;
    case "jmk":
      return <JMKShell>{children}</JMKShell>;
    case "pipboy":
      return <div className="pipboy-theme">{children}</div>;
    default:
      return <>{children}</>;
  }
}
