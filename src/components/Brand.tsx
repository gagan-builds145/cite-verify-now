import { useId } from "react";
import { Link } from "react-router";

/**
 * CiteVerify's "proof mark": a document-blue tile, an open C for citation and
 * a verified check crossing the opening. It reads at 16px and in the favicon.
 */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  const gradientId = `cv-logo-${useId().replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="CiteVerify"
    >
      <defs>
        <linearGradient id={gradientId} x1="5" y1="3" x2="35" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1B3558" />
          <stop offset="0.55" stopColor="#2463B5" />
          <stop offset="1" stopColor="#3B82D6" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11.5" fill={`url(#${gradientId})`} />
      <rect
        x="0.8"
        y="0.8"
        width="38.4"
        height="38.4"
        rx="10.9"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.22"
        strokeWidth="1.1"
      />
      <path
        d="M26.7 13.2h-5.8c-4.7 0-8.2 3.2-8.2 7.4s3.5 7.4 8.2 7.4h5.8"
        fill="none"
        stroke="#F8F3E7"
        strokeWidth="3.25"
        strokeLinecap="round"
      />
      <path
        d="m15.9 20.2 3.2 3.2 6.3-6.6"
        fill="none"
        stroke="#A8E6C7"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="30.1" cy="13.4" r="2.15" fill="#F1C66A" />
    </svg>
  );
}

export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-brand leading-none tracking-[-0.045em] ${className}`}>
      Cite<span className="text-[var(--ink)]">Verify</span>
    </span>
  );
}

export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`group inline-flex items-center gap-2.5 text-foreground ${className}`}
      aria-label="CiteVerify home"
    >
      <LogoMark className="size-8 transition-transform duration-300 group-hover:-rotate-3" />
      <BrandWordmark className="text-[21px]" />
    </Link>
  );
}
