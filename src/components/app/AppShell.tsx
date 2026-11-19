import { Brand, LogoMark } from "@/components/Brand";
import { LogoutConfirmDialog } from "@/components/app/LogoutConfirmDialog";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "convex/react";
import {
  ArrowUpRight,
  Bell,
  Bot,
  Database,
  FileBarChart,
  Home,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Research",
    items: [
      { to: "/", label: "Home", icon: Home },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/library", label: "My Library", icon: Library },
      { to: "/graph", label: "Research Graph", icon: Network },
    ],
  },
  {
    label: "Verify",
    items: [
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

const STORAGE_KEY = "citeverify:sidebar-collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function navLinkClass(isActive: boolean, collapsed: boolean): string {
  return `group relative flex items-center rounded-xl py-2 text-[12.5px] font-medium transition-all ${
    collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
  } ${
    isActive
      ? "bg-accent text-accent-foreground shadow-[inset_0_0_0_1px_var(--border)]"
      : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
  }`;
}

function SidebarContent({
  collapsed,
  onToggleCollapse,
  onNavigate,
  onClose,
  mobile = false,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
  mobile?: boolean;
}) {
  const { user } = useAuth();
  const unread = useQuery(api.workspace.unreadCount) ?? 0;
  const admin = useQuery(api.adminData.me);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const initial = (user?.name ?? user?.email ?? "U").trim().charAt(0).toUpperCase();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex items-center border-b border-border py-4 ${
          collapsed ? "justify-center px-2" : "justify-between gap-3 px-4"
        }`}
      >
        {collapsed ? (
          <Link to="/" aria-label="CiteVerify home" onClick={onNavigate}>
            <LogoMark className="size-8" />
          </Link>
        ) : (
          <div className="min-w-0">
            <Brand />
            <p className="mt-2 pl-[42px] text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
              Evidence desk
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
          onClick={mobile ? onClose : onToggleCollapse}
          aria-label={mobile ? "Close navigation" : collapsed ? "Expand navigation" : "Collapse navigation"}
          title={mobile ? "Close navigation" : collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {mobile ? (
            <X className="size-4" />
          ) : collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </div>

      <nav className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-2.5 py-4" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={({ isActive }) => navLinkClass(isActive, collapsed)}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && item.to === "/notifications" && unread > 0 && (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[9px] text-primary-foreground">
                        {unread}
                      </span>
                    )}
                    {collapsed && item.to === "/notifications" && unread > 0 && (
                      <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-primary" />
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}

        {admin?.isReviewer && (
          <div>
            {!collapsed && (
              <p className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                Administration
              </p>
            )}
            <div className="space-y-0.5">
              <NavLink
                to="/admin/annotations"
                onClick={onNavigate}
                title={collapsed ? "Annotations" : undefined}
                aria-label={collapsed ? "Annotations" : undefined}
                className={({ isActive }) => navLinkClass(isActive, collapsed)}
              >
                <ShieldCheck className="size-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">Annotations</span>}
              </NavLink>
              {admin.isAdmin && (
                <NavLink
                  to="/admin/models"
                  onClick={onNavigate}
                  title={collapsed ? "Models" : undefined}
                  aria-label={collapsed ? "Models" : undefined}
                  className={({ isActive }) => navLinkClass(isActive, collapsed)}
                >
                  <Database className="size-4 shrink-0" />
                  {!collapsed && <span className="flex-1 truncate">Models</span>}
                </NavLink>
              )}
            </div>
          </div>
        )}
      </nav>

      <div className={`border-t border-border py-3 ${collapsed ? "px-2" : "px-3"}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground"
              title={user?.email ?? user?.name ?? "This browser session"}
            >
              {user?.name || user?.email ? initial : <UserRound className="size-3.5" />}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              onClick={() => setConfirmLogout(true)}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="size-3.5" />
            </Button>
            <Link
              to="/privacy"
              onClick={onNavigate}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
              aria-label="Data handling"
              title="Data handling"
            >
              <ShieldCheck className="size-3.5" />
            </Link>
          </div>
        ) : (
          <>
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
                  onClick={onNavigate}
                  className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
                >
                  Add an email sign-in
                  <ArrowUpRight className="size-3" />
                </Link>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <Link
                to="/privacy"
                onClick={onNavigate}
                className="inline-flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <ShieldCheck className="size-3" />
                Data handling
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-[11.5px] text-muted-foreground"
                onClick={() => setConfirmLogout(true)}
              >
                <LogOut className="size-3.5" />
                Log out
              </Button>
            </div>
          </>
        )}
      </div>

      <LogoutConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        onBeforeNavigate={onNavigate}
      />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Preference persistence is optional.
      }
      return next;
    });
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <div
      className={`min-h-dvh bg-background motion-reduce:transition-none lg:grid lg:transition-[grid-template-columns] lg:duration-300 lg:ease-out ${
        collapsed ? "lg:grid-cols-[76px_1fr]" : "lg:grid-cols-[244px_1fr]"
      }`}
    >
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-sidebar lg:flex lg:flex-col">
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur-md lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-lg"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            title="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <Brand />
        </header>

        {children}
      </div>

      <div
        className={`fixed inset-0 z-50 lg:hidden ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close navigation overlay"
          tabIndex={mobileOpen ? 0 : -1}
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-foreground/25 transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-[282px] max-w-[86vw] flex-col border-r border-border bg-sidebar shadow-[18px_0_50px_rgba(20,35,61,0.18)] transition-transform duration-300 ease-out motion-reduce:transition-none ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Mobile navigation"
        >
          <SidebarContent
            collapsed={false}
            mobile
            onClose={() => setMobileOpen(false)}
            onNavigate={() => setMobileOpen(false)}
          />
        </aside>
      </div>
    </div>
  );
}
