import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { EmptyStateIllustration } from "@/components/illustrations/Editorial";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader transparent />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-20">
        <div className="pointer-events-none absolute inset-0 paper-dots opacity-35" />
        <div className="pointer-events-none absolute -left-20 top-10 size-64 rounded-[52%_48%_41%_59%/53%_42%_58%_47%] bg-accent" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative w-full max-w-md text-center"
        >
          <div className="mx-auto max-w-[210px]">
            <EmptyStateIllustration kind="search" />
          </div>
          <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#2463B5]">
            404 · page not found
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-[-0.04em]">This page left no record.</h1>
          <p className="mx-auto mt-3 max-w-sm text-[13px] leading-6 text-muted-foreground">
            The address may be wrong, or the page may have moved. Your analyses and saved papers are
            still available from the research desk.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild variant="brand" className="rounded-full px-5">
              <Link to="/">
                Back to home
                <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-border bg-card px-5">
              <Link to="/dashboard">Open research desk</Link>
            </Button>
          </div>
        </motion.div>
      </main>
      <SiteFooter />
    </div>
  );
}
