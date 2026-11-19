import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { VERDICT_META, formatDateTime, type Verdict } from "@/lib/analysis-ui";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Eraser,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

type AnalysisItem = {
  _id: Id<"analyses">;
  title: string;
  status: "processing" | "ready" | "failed";
  completedAt?: number;
  _creationTime: number;
  summary?: { claims: number };
};

type Citation = { claimId: string; referenceKey?: string; verdict?: Verdict };

const PROMPTS = [
  "Summarise the main findings this manuscript claims.",
  "Which claims are not supported by their cited sources?",
  "What limitations does the evidence record show?",
  "Compare the supported and unverified claims.",
];

export default function Assistant() {
  const [searchParams] = useSearchParams();
  const analyses = useQuery(api.analyses.list);
  const ask = useAction(api.assistant.ask);
  const clear = useMutation(api.assistantData.clear);

  const [selectedId, setSelectedId] = useState<Id<"analyses"> | null>(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [engine, setEngine] = useState<"ai" | "retrieval" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const ready = ((analyses ?? []) as unknown as AnalysisItem[]).filter(
    (analysis) => analysis.status === "ready" && (analysis.summary?.claims ?? 0) > 0,
  );

  useEffect(() => {
    const fromUrl = searchParams.get("analysis");
    if (fromUrl && ready.some((analysis) => analysis._id === fromUrl)) {
      setSelectedId(fromUrl as Id<"analyses">);
      return;
    }
    if (!selectedId && ready.length > 0) setSelectedId(ready[0]._id);
  }, [ready, searchParams, selectedId]);

  const messages = useQuery(
    api.assistantData.messages,
    selectedId ? { analysisId: selectedId } : "skip",
  );

  const selected = ready.find((analysis) => analysis._id === selectedId) ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, sending]);

  const handleAsk = async (promptText?: string) => {
    if (!selectedId) return;
    const text = (promptText ?? question).trim();
    if (text.length < 3) return;
    setSending(true);
    setQuestion("");
    try {
      const result = await ask({ analysisId: selectedId, question: text });
      if (!result.ok) {
        toast.error(result.error);
        setQuestion(text);
        return;
      }
      setEngine(result.engine);
      if (result.notice) toast.warning(result.notice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The assistant could not answer.");
      setQuestion(text);
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    if (!selectedId) return;
    try {
      await clear({ analysisId: selectedId });
      toast("Conversation cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear the conversation.");
    }
  };

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-5xl flex-col px-5 py-9 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Ask</p>
            <h1 className="mt-2.5 font-display text-4xl leading-none tracking-tight">
              Research Assistant
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted-foreground">
              Answers are grounded in the claims, verdicts and evidence already stored for one
              analysis. Every reply cites the claims it used.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/analyze">
              New analysis
              <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </Button>
        </div>

        {ready.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <Bot className="mx-auto size-7 text-muted-foreground/60" />
            <h2 className="mt-3 font-display text-2xl tracking-tight">No completed analysis yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-[12px] leading-6 text-muted-foreground">
              {analyses === undefined
                ? "Loading your analyses…"
                : "Run a paper through verification first. The assistant can only use evidence that has actually been retrieved and stored."}
            </p>
            <Button asChild className="mt-4 rounded-full" size="sm">
              <Link to="/analyze">Upload a paper</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                Analysis
              </span>
              <Select
                value={selectedId ?? undefined}
                onValueChange={(value) => {
                  setSelectedId(value as Id<"analyses">);
                  setEngine(null);
                }}
              >
                <SelectTrigger className="h-8 min-w-[240px] flex-1 text-[11.5px]">
                  <SelectValue placeholder="Choose an analysis" />
                </SelectTrigger>
                <SelectContent>
                  {ready.map((analysis) => (
                    <SelectItem key={analysis._id} value={analysis._id}>
                      {analysis.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedId && messages && messages.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-[10.5px]" onClick={() => void handleClear()}>
                  <Eraser className="mr-1 size-3" />
                  Clear
                </Button>
              )}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_250px]">
              <div className="flex min-h-[460px] flex-col overflow-hidden rounded-xl border border-border bg-card">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  {messages === undefined ? (
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Loading conversation
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-4">
                      <p className="flex items-center gap-2 text-[12.5px] font-medium">
                        <Sparkles className="size-3.5 text-primary" />
                        Ask about {selected?.title.slice(0, 80) ?? "this paper"}
                      </p>
                      <p className="mt-1.5 text-[11.5px] leading-6 text-muted-foreground">
                        The assistant will refuse to answer outside the stored record. It does not fetch
                        new papers and does not invent references.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {PROMPTS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => void handleAsk(prompt)}
                            className="rounded-full border border-border bg-card px-2.5 py-1 text-left text-[10.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => {
                      let citations: Citation[] = [];
                      try {
                        const parsed = JSON.parse(message.citationsJson);
                        if (Array.isArray(parsed)) citations = parsed;
                      } catch {
                        citations = [];
                      }
                      const isUser = message.role === "user";
                      return (
                        <div key={message._id} className={`flex gap-2.5 ${isUser ? "justify-end" : ""}`}>
                          {!isUser && (
                            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <Bot className="size-3.5 text-primary" />
                            </span>
                          )}
                          <div className={`max-w-[88%] ${isUser ? "order-1" : ""}`}>
                            <div
                              className={`whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[12px] leading-6 ${
                                isUser
                                  ? "bg-foreground text-background"
                                  : "border border-border bg-secondary/40 text-foreground/90"
                              }`}
                            >
                              {message.content}
                            </div>
                            {!isUser && citations.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {citations.map((citation) => (
                                  <Link
                                    key={`${message._id}-${citation.claimId}`}
                                    to={`/analysis/${message.analysisId}?panel=claims&claim=${citation.claimId}`}
                                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[9.5px] text-primary hover:bg-secondary"
                                  >
                                    {citation.claimId}
                                    {citation.verdict && (
                                      <span className="text-muted-foreground">
                                        · {VERDICT_META[citation.verdict].short}
                                      </span>
                                    )}
                                  </Link>
                                ))}
                              </div>
                            )}
                            <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
                              {isUser ? "You" : "CiteVerify"} · {formatDateTime(message.createdAt)}
                            </p>
                          </div>
                          {isUser && (
                            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                              <User className="size-3.5 text-muted-foreground" />
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                  {sending && (
                    <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Reading the stored evidence record
                    </div>
                  )}
                  <div ref={endRef} />
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleAsk();
                  }}
                  className="border-t border-border p-3"
                >
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleAsk();
                        }
                      }}
                      placeholder="Ask about a claim, citation, method or limitation…"
                      className="min-h-[44px] max-h-[140px] resize-none text-[12px]"
                      disabled={sending}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      className="size-10 shrink-0 rounded-full"
                      disabled={sending || question.trim().length < 3}
                      aria-label="Send question"
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                  <p className="mt-1.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-muted-foreground/70">
                    {engine === "retrieval"
                      ? "retrieval-only mode"
                      : "answers use AI reasoning on stored evidence"}
                  </p>
                </form>
              </div>

              <aside className="space-y-3">
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="eyebrow">Grounding rules</p>
                  <ul className="mt-2 space-y-2 text-[10.5px] leading-5 text-muted-foreground">
                    <li>• Answers are limited to this analysis's stored claims and evidence.</li>
                    <li>• Every cited claim id is validated before the message is saved.</li>
                    <li>• No new references, DOIs or statistics are generated.</li>
                    <li>• Unverified claims are clearly described as unverified.</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-medium">
                    <ShieldCheck className="size-3.5 text-[var(--verdict-supported)]" />
                    Inspect, don't trust
                  </p>
                  <p className="mt-1.5 text-[10.5px] leading-5 text-muted-foreground">
                    Follow a citation chip to the exact claim, its source record and the retrieved
                    passage.
                  </p>
                </div>
                {selectedId && (
                  <Button asChild variant="outline" size="sm" className="w-full rounded-full">
                    <Link to={`/analysis/${selectedId}`}>
                      Open full report
                      <ArrowUpRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
