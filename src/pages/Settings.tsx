import { AppShell } from "@/components/app/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { clearLocalPdfs } from "@/lib/pdf-store";
import { useMutation, useQuery } from "convex/react";
import { ArrowUpRight, Loader2, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

export default function Settings() {
  const profile = useQuery(api.users.profile);
  const updateName = useMutation(api.users.updateName);
  const deleteAllData = useMutation(api.users.deleteAllData);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? profile?.name ?? "";
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateName({ name });
      toast("Profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const result = await deleteAllData();
      await clearLocalPdfs().catch(() => undefined);
      toast("All data deleted", {
        description: `${result.analyses} analysis session(s) and ${result.savedPapers} saved paper(s) removed.`,
      });
      await signOut();
      navigate("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete all data.");
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-5 py-9 sm:px-8">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="mt-2.5 font-display text-4xl leading-none tracking-tight">Settings</h1>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
            Profile and data controls for this session.
          </p>
        </div>

        <section className="mt-7 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <UserRound className="size-4 text-primary" />
            <h2 className="text-[12.5px] font-semibold tracking-tight">Profile</h2>
          </div>
          <div className="space-y-4 px-4 py-4">
            <div className="max-w-sm">
              <Label className="eyebrow">Display name used on reviews</Label>
              <Input
                value={name}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Reviewer name"
                className="mt-1.5 h-9 text-[12px]"
              />
              <p className="mt-1.5 text-[10.5px] leading-5 text-muted-foreground">
                Shown next to human review decisions. Email: {profile?.email || "not signed in"}.
              </p>
            </div>
            <Button size="sm" className="rounded-full" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Save profile
            </Button>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <ShieldCheck className="size-4 text-[var(--verdict-supported)]" />
            <h2 className="text-[12.5px] font-semibold tracking-tight">Data handling</h2>
          </div>
          <div className="space-y-2 px-4 py-4 text-[11.5px] leading-6 text-muted-foreground">
            <p>
              Uploaded PDFs stay in this browser's IndexedDB. Only extracted text is sent to Convex;
              that text is deleted after the pipeline finishes.
            </p>
            <p>
              Claims, references and evidence excerpts are stored until you delete the analysis. The
              research assistant stores its conversation with the analysis.
            </p>
            <Link
              to="/privacy"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              Read the full data-handling page
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-[var(--verdict-contradicted)]/25 bg-[var(--verdict-contradicted-soft)]/50">
          <div className="flex items-center gap-2 border-b border-[var(--verdict-contradicted)]/20 px-4 py-3">
            <Trash2 className="size-4 text-[var(--verdict-contradicted)]" />
            <h2 className="text-[12.5px] font-semibold tracking-tight text-[var(--verdict-contradicted)]">
              Delete all data
            </h2>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <p className="max-w-md text-[11.5px] leading-6 text-muted-foreground">
              Permanently removes every analysis, claim, reference, review, saved paper, collection,
              assistant message and notification in this session, plus locally stored PDFs.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-[var(--verdict-contradicted)]/40 text-[var(--verdict-contradicted)] hover:bg-[var(--verdict-contradicted-soft)]"
              onClick={() => setConfirmDelete(true)}
            >
              Delete everything
            </Button>
          </div>
        </section>

        <p className="mt-6 text-[10.5px] leading-5 text-muted-foreground">
          CiteVerify is a verification aid, not an authority. Retraction flags, verdicts and confidence
          indicators must be checked against the source record before any conclusion is drawn.
        </p>
      </main>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all CiteVerify data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all analyses, evidence records, reviews, saved papers and conversations in
              this session, and clears the PDFs stored in this browser. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteAll();
              }}
            >
              {deleting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
