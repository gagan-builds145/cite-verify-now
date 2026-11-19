import { BrandWordmark, LogoMark } from "@/components/Brand";

/**
 * Branded first-paint and route-transition screen. The app remains mounted
 * underneath the initial overlay, so this never delays data fetching.
 */
export function LoadingScreen({
  leaving = false,
  compact = false,
}: {
  leaving?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`cv-loading-screen ${leaving ? "cv-loading-screen--leaving" : ""} ${
        compact ? "cv-loading-screen--compact" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-label="Loading CiteVerify"
    >
      <div className="cv-loading-glow" aria-hidden="true" />
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <span className="cv-loading-orbit" aria-hidden="true" />
          <span className="cv-loading-orbit cv-loading-orbit--inner" aria-hidden="true" />
          <LogoMark className="cv-loading-mark size-[62px]" />
        </div>
        <div className="mt-5 flex flex-col items-center">
          <BrandWordmark className="text-[26px]" />
          <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Evidence, made traceable
          </p>
        </div>
        <div className="cv-loading-track mt-6" aria-hidden="true">
          <span />
        </div>
        <p className="mt-3 text-[10.5px] font-medium text-muted-foreground">
          Preparing your research desk
        </p>
      </div>
    </div>
  );
}
