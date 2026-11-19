import { Link } from "react-router";

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="0.9" y="0.9" width="30.2" height="30.2" rx="8" fill="currentColor" opacity="0.1" />
      <rect x="0.9" y="0.9" width="30.2" height="30.2" rx="8" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.45" />
      <path d="M10 9.5h5.2v2.1h-3.1v11h3.1v2.1H10z" fill="currentColor" opacity="0.65" />
      <path d="M22 9.5h-5.2v2.1h3.1v11h-3.1v2.1H22z" fill="currentColor" opacity="0.65" />
      <path
        d="M12.1 17.1l2.6 2.7 5.1-5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`group inline-flex items-center gap-2.5 text-foreground ${className}`}
      aria-label="CiteVerify home"
    >
      <LogoMark className="size-8 text-primary transition-transform duration-300 group-hover:-rotate-3" />
      <span className="font-brand text-[21px] leading-none text-foreground">
        Cite<span className="text-[var(--ink)]">Verify</span>
      </span>
    </Link>
  );
}
