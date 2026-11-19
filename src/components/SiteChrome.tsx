import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router";

const NAV_LINKS = [
  { label: "Product", to: "/", hash: "#capabilities" },
  { label: "How It Works", to: "/", hash: "#how-it-works" },
  { label: "Explore", to: "/explorer", hash: "" },
  { label: "Privacy", to: "/privacy", hash: "" },
  { label: "About", to: "/about", hash: "" },
];

export function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header
      className={`sticky top-0 z-50 border-b ${
        transparent ? "border-border/60 bg-background/85 backdrop-blur-md" : "border-border bg-background"
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Brand />

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              to={`${link.to}${link.hash}`}
              className="rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild size="sm" className="hidden h-9 rounded-full px-4 text-[13px] md:inline-flex">
            <Link to={isAuthenticated ? "/dashboard" : "/analyze"}>
              {isAuthenticated ? "Dashboard" : "Get Started"}
              <ArrowUpRight className="ml-1 size-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border bg-background md:hidden"
          >
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-5 py-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  to={`${link.to}${link.hash}`}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
              <Button asChild className="mt-2 h-10 rounded-full">
                <Link to={isAuthenticated ? "/dashboard" : "/analyze"} onClick={() => setOpen(false)}>
                  {isAuthenticated ? "Dashboard" : "Get Started"}
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-secondary/40">
      <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Brand />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
              An evidence traceability tool for research. Every verdict links back to the retrieved
              record it came from.
            </p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/80">
              Crossref · OpenAlex · Europe PMC · DataCite · arXiv
            </p>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: "Upload a paper", to: "/analyze" },
              { label: "Research explorer", to: "/explorer" },
              { label: "My library", to: "/library" },
              { label: "Citation graph", to: "/graph" },
              { label: "Analysis dashboard", to: "/dashboard" },
            ]}
          />
          <FooterColumn
            title="Company"
            links={[
              { label: "About", to: "/about" },
              { label: "Contact", to: "/contact" },
            ]}
          />
          <FooterColumn
            title="Legal & privacy"
            links={[
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
