import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import {
  ArrowUpRight,
  Bell,
  Bot,
  Compass,
  FileBarChart,
  FilePlus2,
  LayoutDashboard,
  Library,
  LogOut,
  Network,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";

const NAV_GROUPS = [
  {
    label: "Research",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/explorer", label: "Research Explorer", icon: Compass },
      { to: "/library", label: "My Library", icon: Library },
      { to: "/graph", label: "Research Graph", icon: Network },
    ],
  },
  {
    label: "Verify",
    items: [
      { to: "/analyze", label: "Upload & Analyze", icon: FilePlus2 },
      { to: "/assistant", label: "Research Assistant", icon: Bot },
      { to: "/reports", label: "Reports & Analytics", icon: FileBarChart },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const FLAT_NAV = NAV_GROUPS.flatMap((group) => group.items);

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const unread = useQuery(api.workspace.unreadCount) ?? 0;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-border bg-sidebar lg:flex">
        <div className="border-b border-border px-5 py-5">
          <Brand />
          <p className="mt-2 pl-[42px] text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
            Evidence desk
          </p>
        </div>

        <nav className="flex-1 space-y-5 px-3 pb-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-all ${
                        isActive
                          ? "bg-accent text-accent-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                          : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
                      }`
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.to === "/notifications" && unread > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[9px] text-primary-foreground">
                        {unread}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border px-3 py-3">
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
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
          <Link
            to="/privacy"
            className="mt-1 inline-flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <ShieldCheck className="size-3" />
            Data handling
          </Link>
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
          <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
            {FLAT_NAV.map((item) => (
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
