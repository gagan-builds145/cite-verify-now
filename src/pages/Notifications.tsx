import { AppShell } from "@/components/app/AppShell";
import { EmptyStateIllustration } from "@/components/illustrations/Editorial";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDateTime } from "@/lib/analysis-ui";
import { useMutation, useQuery } from "convex/react";
import { Bell, BellRing, CheckCheck, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

type Notification = {
  _id: Id<"notifications">;
  title: string;
  body: string;
  kind: string;
  analysisId?: Id<"analyses">;
  readAt?: number;
  createdAt: number;
};

export default function Notifications() {
  const notifications = useQuery(api.workspace.notifications);
  const markRead = useMutation(api.workspace.markRead);
  const markAllRead = useMutation(api.workspace.markAllRead);

  const rows = (notifications ?? []) as unknown as Notification[];
  const unread = rows.filter((row) => !row.readAt).length;

  const handleRead = async (row: Notification) => {
    if (row.readAt) return;
    try {
      await markRead({ notificationId: row._id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark this as read.");
    }
  };

  const handleAll = async () => {
    try {
      await markAllRead();
      toast("All notifications marked as read");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update notifications.");
    }
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-5 py-9 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Updates</p>
            <h1 className="mt-2.5 font-display text-4xl leading-none tracking-tight">Notifications</h1>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              Completed analyses and verification updates in this session.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                {unread} unread
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={unread === 0}
              onClick={() => void handleAll()}
            >
              <CheckCheck className="mr-1.5 size-3.5" />
              Mark all read
            </Button>
          </div>
        </div>

        <div className="mt-6">
          {notifications === undefined ? (
            <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading notifications
            </div>
          ) : rows.length === 0 ? (
            <div className="overflow-hidden rounded-2xl border border-dashed border-border bg-card px-6 py-8 text-center">
              <div className="mx-auto max-w-[190px]">
                <EmptyStateIllustration kind="assistant" />
              </div>
              <h2 className="mt-1 font-display text-2xl tracking-tight">Nothing yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-[12px] leading-6 text-muted-foreground">
                When an analysis finishes, its report notification appears here automatically.
              </p>
              <Button asChild variant="outline" className="mt-4 rounded-full" size="sm">
                <Link to="/analyze">Start an analysis</Link>
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row._id}
                  className={`rounded-xl border p-4 transition-colors ${
                    row.readAt
                      ? "border-border bg-card"
                      : "border-primary/25 bg-[var(--verdict-supported-soft)]/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary">
                      {row.readAt ? (
                        <Bell className="size-3.5 text-muted-foreground" />
                      ) : (
                        <BellRing className="size-3.5 text-primary" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium">{row.title}</p>
                      <p className="mt-0.5 text-[11.5px] leading-5 text-muted-foreground">{row.body}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground/80">
                          {formatDateTime(row.createdAt)}
                        </span>
                        {row.analysisId && (
                          <Link
                            to={`/analysis/${row.analysisId}`}
                            onClick={() => void handleRead(row)}
                            className="text-[10.5px] font-medium text-primary hover:underline"
                          >
                            Open report
                          </Link>
                        )}
                        {!row.readAt && (
                          <button
                            type="button"
                            onClick={() => void handleRead(row)}
                            className="text-[10.5px] text-muted-foreground hover:text-foreground hover:underline"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppShell>
  );
}
