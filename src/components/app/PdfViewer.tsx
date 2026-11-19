import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VERDICT_META, type ClaimRecord } from "@/lib/analysis-ui";
import { findHighlightBoxes, openPdf, type HighlightBox, type PdfDocumentHandle } from "@/lib/pdf";
import { loadPdfLocally } from "@/lib/pdf-store";
import { ChevronLeft, ChevronRight, FileWarning, Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

type HighlightGroup = { claim: ClaimRecord; boxes: HighlightBox[] };

export function PdfViewer({
  analysisId,
  claims,
  selectedClaimId,
  onSelectClaim,
  focusRequest,
}: {
  analysisId: string;
  claims: ClaimRecord[];
  selectedClaimId: string | null;
  onSelectClaim: (claimId: string) => void;
  focusRequest?: { page: number; token: number } | null;
}) {
  const [doc, setDoc] = useState<PdfDocumentHandle | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.05);
  const [fitMode, setFitMode] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 });
  const [highlights, setHighlights] = useState<HighlightGroup[]>([]);
  const [pageInput, setPageInput] = useState("1");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const selectedClaim = useMemo(
    () => claims.find((claim) => claim.claimId === selectedClaimId) ?? null,
    [claims, selectedClaimId],
  );

  const goToPage = useCallback((next: number) => {
    setPage(next);
    setPageInput(String(next));
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setStatus("loading");
    });
    loadPdfLocally(analysisId)
      .then(async (stored) => {
        if (!stored) {
          if (!cancelled) setStatus("missing");
          return;
        }
        const loaded = await openPdf(new Uint8Array(stored.bytes));
        if (cancelled) return;
        setDoc(loaded);
        setNumPages(loaded.numPages);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  useEffect(() => {
    if (!selectedClaim) return;
    const target = Math.min(Math.max(1, selectedClaim.page), numPages || selectedClaim.page);
    queueMicrotask(() => goToPage(target));
  }, [selectedClaim, numPages, goToPage]);

  useEffect(() => {
    if (!focusRequest) return;
    const target = Math.min(Math.max(1, focusRequest.page), numPages || focusRequest.page);
    queueMicrotask(() => goToPage(target));
  }, [focusRequest, numPages, goToPage]);

  // Fit the page to the available width until the reader zooms manually. A
  // ResizeObserver handles the mobile layout, where the viewer is mounted inside
  // a hidden panel and only gets a real width when the Document tab opens.
  useEffect(() => {
    if (!doc || !fitMode) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    let cancelled = false;

    const compute = (width: number) => {
      if (width < 120) return;
      doc.getPage(page).then((pdfPage) => {
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const next = Math.min(2.2, Math.max(0.5, (width - 36) / base.width));
        setScale((current) =>
          Math.abs(current - next) < 0.01 ? current : Number(next.toFixed(3)),
        );
      });
    };

    compute(surface.clientWidth);
    const observer = new ResizeObserver((entries) => {
      compute(entries[0]?.contentRect.width ?? surface.clientWidth);
    });
    observer.observe(surface);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [doc, page, fitMode]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;

    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      setPageSize({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
      const context = canvas.getContext("2d");
      if (!context) return;
      const task = pdfPage.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      await task.promise.catch(() => undefined);
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page, scale]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const pageClaims = claims.filter((claim) => claim.page === page);
    queueMicrotask(() => {
      if (!cancelled) setHighlights([]);
    });

    (async () => {
      const pdfPage = await doc.getPage(page);
      const groups: HighlightGroup[] = [];
      for (const claim of pageClaims) {
        const boxes = await findHighlightBoxes(pdfPage, claim.text, scale);
        if (cancelled) return;
        if (boxes.length > 0) groups.push({ claim, boxes });
      }
      if (!cancelled) setHighlights(groups);
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page, scale, claims]);

  useEffect(() => {
    if (!selectedClaimId || !scrollRef.current) return;
    const element = scrollRef.current.querySelector<HTMLElement>(
      `[data-claim="${selectedClaimId}"]`,
    );
    if (element) {
      scrollRef.current.scrollTo({
        top: Math.max(0, element.offsetTop - scrollRef.current.clientHeight * 0.32),
        behavior: "smooth",
      });
    }
  }, [selectedClaimId, highlights]);

  const pageClaims = claims.filter((claim) => claim.page === page);

  if (status === "missing") {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 p-8 text-center">
        <FileWarning className="size-7 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">The PDF for this analysis is not in this browser</p>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-6 text-muted-foreground">
            Files are kept locally and are never stored on the server, so the viewer works only in the
            browser that started the analysis. Results and the report remain available.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/analyze">Upload the PDF again</Link>
        </Button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
        <FileWarning className="size-7 text-muted-foreground" />
        <p className="text-sm font-semibold">The locally stored PDF could not be rendered</p>
        <p className="max-w-sm text-[12.5px] leading-6 text-muted-foreground">
          The local copy may be corrupted. Results and the report are unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => goToPage(Math.max(1, page - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
            <Input
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={() => {
                const next = Number(pageInput);
                if (Number.isFinite(next)) {
                  goToPage(Math.min(Math.max(1, Math.round(next)), numPages || 1));
                } else {
                  setPageInput(String(page));
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="h-7 w-10 rounded border-none bg-muted px-1 text-center font-mono text-[11px] shadow-none focus-visible:ring-1"
              aria-label="Page number"
            />
            <span>/ {numPages || "–"}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Next page"
            disabled={numPages > 0 && page >= numPages}
            onClick={() => goToPage(Math.min(numPages || page, page + 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Zoom out"
            onClick={() => {
              setFitMode(false);
              setScale((value) => Math.max(0.5, Number((value - 0.15).toFixed(2))));
            }}
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="w-9 text-center font-mono text-[10.5px] text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Zoom in"
            onClick={() => {
              setFitMode(false);
              setScale((value) => Math.min(2.4, Number((value + 0.15).toFixed(2))));
            }}
          >
            <ZoomIn className="size-4" />
          </Button>
          <Button
            variant={fitMode ? "secondary" : "ghost"}
            size="icon"
            className="size-7"
            aria-label="Fit page width"
            onClick={() => setFitMode(true)}
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {pageClaims.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-secondary/30 px-4 py-2">
          <span className="mr-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            On this page
          </span>
          {pageClaims.map((claim) => {
            const meta = VERDICT_META[claim.verdict];
            const active = claim.claimId === selectedClaimId;
            return (
              <button
                key={claim.claimId}
                type="button"
                onClick={() => onSelectClaim(claim.claimId)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  active ? "border-foreground/30 bg-card" : "border-border hover:bg-card"
                }`}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                {claim.claimId}
              </button>
            );
          })}
        </div>
      )}

      <div ref={scrollRef} className="relative flex-1 overflow-auto bg-secondary/50">
        <div ref={surfaceRef} className="min-h-full px-4 py-5">
          <div
            className="relative mx-auto bg-white ring-1 ring-black/10"
            style={{ width: pageSize.width, height: status === "ready" ? pageSize.height : undefined }}
          >
            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-card">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <canvas ref={canvasRef} className="block" />
            <div className="pointer-events-none absolute inset-0">
              {highlights.map((group) => {
                const meta = VERDICT_META[group.claim.verdict];
                const active = group.claim.claimId === selectedClaimId;
                return group.boxes.map((box, index) => (
                  <button
                    key={`${group.claim.claimId}-${index}`}
                    type="button"
                    data-claim={group.claim.claimId}
                    onClick={() => onSelectClaim(group.claim.claimId)}
                    className="pointer-events-auto absolute rounded-[2px] transition-[background-color,box-shadow] duration-200"
                    style={{
                      left: box.left,
                      top: box.top,
                      width: box.width,
                      height: box.height,
                      backgroundColor: meta.color,
                      opacity: active ? 0.42 : 0.2,
                      boxShadow: active ? `0 0 0 1.5px ${meta.color}` : undefined,
                    }}
                    title={`${group.claim.claimId} — ${meta.label}`}
                    aria-label={`Highlighted claim ${group.claim.claimId}: ${meta.label}`}
                  />
                ));
              })}
            </div>
          </div>

          {status === "ready" && highlights.length === 0 && pageClaims.length > 0 && (
            <p className="mx-auto mt-3 max-w-md text-center font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
              Claim text on this page could not be located for highlighting
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {(["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED", "INSUFFICIENT_EVIDENCE", "UNVERIFIED"] as const).map(
            (verdict) => (
              <span
                key={verdict}
                className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground"
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: VERDICT_META[verdict].color }}
                />
                {VERDICT_META[verdict].short}
              </span>
            ),
          )}
        </div>
        <span className="hidden font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground sm:block">
          PDF stays on this device
        </span>
      </div>
    </div>
  );
}
