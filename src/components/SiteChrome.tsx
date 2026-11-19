import { Brand } from "@/components/Brand";
import { FooterDoodle } from "@/components/illustrations/Editorial";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";

type NavItem = { label: string; to: string; hash: string };

const NAV_LINKS: NavItem[] = [
  { label: "Home", to: "/", hash: "" },
  { label: "Features", to: "/", hash: "#features" },
  { label: "How It Works", to: "/", hash: "#how-it-works" },
  { label: "Statement Check", to: "/statements", hash: "" },
  { label: "Explore", to: "/explorer", hash: "" },
  { label: "About", to: "/about", hash: "" },
];

function isActive(link: NavItem, pathname: string, hash: string): boolean {
  if (link.hash) return pathname === "/" && hash === link.hash;
  if (link.to === "/") return pathname === "/" && !hash;
  return pathname === link.to || pathname.startsWith(`${link.to}/`);
}

function navLinkClass(active: boolean): string {
  return [
    "group relative inline-flex items-center rounded-full px-2.5 py-2 text-[14px] font-semibold tracking-[-0.01em] transition-colors duration-200 xl:px-3",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    active
      ? "bg-accent text-accent-foreground after:absolute after:bottom-0.5 after:left-1/2 after:h-[2px] after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-[var(--ink)]"
      : "text-foreground/75 hover:bg-accent hover:text-accent-foreground",
  ].join(" ");
}

export function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const returnTo =
    location.pathname === "/" ? "/dashboard" : `${location.pathname}${location.search}`;
  const authQuery = `returnTo=${encodeURIComponent(returnTo)}`;
  const loginHref = `/login?${authQuery}`;
  const signupHref = `/signup?${authQuery}`;

  return (
    <header
      className={`sticky top-0 z-50 border-b ${
        transparent
          ? "border-border/80 bg-background/90 backdrop-blur-xl"
          : "border-border bg-background"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Brand className="shrink-0" />

        <nav aria-label="Primary navigation" className="hidden items-center gap-0.5 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = isActive(link, location.pathname, location.hash);
            return (
              <Link
                key={link.label}
                to={`${link.to}${link.hash}`}
                aria-current={active ? "page" : undefined}
                className={navLinkClass(active)}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {isAuthenticated ? (
            <Button
              asChild
              variant="brand"
              size="sm"
              className="hidden h-9 rounded-full px-4 text-[13px] md:inline-flex"
            >
              <Link to="/dashboard">
                Dashboard
                <ArrowUpRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden h-9 rounded-full px-3 text-[13px] font-semibold text-foreground/85 hover:text-foreground md:inline-flex"
              >
                <Link to={loginHref}>Log In</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="hidden h-9 rounded-full border-border bg-card px-3.5 text-[13px] font-semibold text-foreground shadow-none hover:border-[var(--ink)]/45 hover:bg-accent md:inline-flex"
              >
                <Link to={signupHref}>Sign Up</Link>
              </Button>
              <Button
                asChild
                variant="brand"
                size="sm"
                className="hidden h-9 rounded-full px-4 text-[13px] md:inline-flex"
              >
                <Link to="/analyze">
                  Get Started
                  <ArrowUpRight className="ml-1 size-3.5" />
                </Link>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-full lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-navigation"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border bg-background lg:hidden"
          >
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
              <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => {
                  const active = isActive(link, location.pathname, location.hash);
                  return (
                    <Link
                      key={link.label}
                      to={`${link.to}${link.hash}`}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`rounded-xl px-3 py-2.5 text-[14px] font-semibold transition-colors ${
                        active
                          ? "bg-accent text-accent-foreground shadow-[inset_2px_0_0_var(--ink)]"
                          : "text-foreground/80 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
                {isAuthenticated ? (
                  <Button asChild variant="brand" className="h-10 rounded-full sm:col-span-2">
                    <Link to="/dashboard" onClick={() => setOpen(false)}>
                      Dashboard
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button
                      asChild
                      variant="brand"
                      className="h-10 rounded-full sm:col-span-2"
                      onClick={() => setOpen(false)}
                    >
                      <Link to="/analyze">Get Started</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-10 rounded-full"
                      onClick={() => setOpen(false)}
                    >
                      <Link to={loginHref}>Log In</Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-10 rounded-full"
                      onClick={() => setOpen(false)}
                    >
                      <Link to={signupHref}>Sign Up</Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-border bg-secondary/40">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
              An evidence traceability tool for research. Every verdict links back to the retrieved
              record it came from.
            </p>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground/80">
              Crossref · OpenAlex · Europe PMC · DataCite · arXiv
            </p>
            <div className="mt-3 w-[150px] opacity-70">
              <FooterDoodle />
            </div>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: "Upload a paper", to: "/analyze" },
              { label: "Statement check", to: "/statements" },
              { label: "Research explorer", to: "/explorer" },
              { label: "My library", to: "/library" },
              { label: "Citation graph", to: "/graph" },
              { label: "Analysis dashboard", to: "/dashboard" },
            ]}
          />
          <FooterColumn
            title="Account"
            links={[
              { label: "Log in", to: "/login" },
              { label: "Create account", to: "/signup" },
              { label: "Dashboard", to: "/dashboard" },
              { label: "Settings", to: "/settings" },
            ]}
          />
          <FooterColumn
            title="Legal & privacy"
            links={[
              { label: "About", to: "/about" },
              { label: "Contact", to: "/contact" },
              { label: "Privacy policy", to: "/privacy" },
              { label: "Terms of use", to: "/terms" },
            ]}
          />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} CiteVerify. A research integrity tool, not an accusation engine.</p>
          <p className="max-w-md leading-5">
            Automated results are assistive. Absence from an index does not prove a paper does not
            exist, and no verdict should be used as evidence of misconduct without human review.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; to: string }[];
}) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              to={link.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
