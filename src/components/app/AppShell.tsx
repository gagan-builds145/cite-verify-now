import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { ArrowUpRight, FilePlus2, LayoutGrid, LogOut, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";

const NAV = [
  { to: "/analyze", label: "New analysis", icon: FilePlus2 },
  { to: "/dashboard", label: "Analyses", icon: LayoutGrid },
  { to: "/privacy", label: "Privacy", icon: ShieldCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[236px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-sidebar lg:flex">
        <div className="px-5 py-5">
          <Brand />
        </div>

        <nav className="flex-1 space-y-1 px-3">
          <p className="px-2 pb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
            Workspace
          </p>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                }`
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border px-3 py-3">
          <div className="rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {user?.isAnonymous ? "Anonymous session" : "Signed in"}
            </p>
            <p className="mt-1 truncate text-[11.5px] font-medium">
              {user?.email ?? user?.name ?? "This browser session"}
            </p>
            {user?.isAnonymous && (
              <Link
                to="/auth?returnTo=%2Fdashboard"
                className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
              >
                Add an email sign-in
                <ArrowUpRight className="size-3" />
              </Link>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-[11.5px] text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md lg:hidden">
          <Brand />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="outline" size="sm" className="h-8 rounded-full text-[11.5px]">
              <Link to="/analyze">New</Link>
            </Button>
          </div>
        </header>

        <div className="border-b border-border lg:hidden">
          <nav className="flex gap-1 overflow-x-auto px-3 py-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                    isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {children}
      </div>
    </div>
  );
}
