import { LoadingScreen } from "@/components/LoadingScreen";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Keeps the app mounted while a short branded first-paint overlay fades away.
 * There is no artificial network wait: the timer only covers the entrance.
 */
export function AppBoot({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"visible" | "leaving" | "hidden">("visible");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPhase("leaving"), reduced ? 80 : 520);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("hidden"), 380);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <>
      {children}
      {phase !== "hidden" && <LoadingScreen leaving={phase === "leaving"} />}
    </>
  );
}
