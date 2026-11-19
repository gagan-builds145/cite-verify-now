import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export function LogoutConfirmDialog({
  open,
  onOpenChange,
  onBeforeNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBeforeNavigate?: () => void;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await signOut();
      onOpenChange(false);
      onBeforeNavigate?.();
      navigate("/", { replace: true });
      toast.success("Signed out");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not log out. Your session is still active.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (loading) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log out?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to log out of CiteVerify? You will need to sign in again to
            access your research papers and analysis history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={loading}
            onClick={() => void handleLogout()}
          >
            {loading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <LogOut className="mr-1.5 size-3.5" />}
            {loading ? "Logging out…" : "Log out"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
