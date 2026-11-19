import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing.tsx"));
const AuthPage = lazy(() => import("./pages/Auth.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const Analyze = lazy(() => import("./pages/Analyze.tsx"));
const AnalysisWorkspace = lazy(() => import("./pages/AnalysisWorkspace.tsx"));
const Explorer = lazy(() => import("./pages/Explorer.tsx"));
const LibraryPage = lazy(() => import("./pages/Library.tsx"));
const ResearchGraph = lazy(() => import("./pages/ResearchGraph.tsx"));
const Assistant = lazy(() => import("./pages/Assistant.tsx"));
const Reports = lazy(() => import("./pages/Reports.tsx"));
const Notifications = lazy(() => import("./pages/Notifications.tsx"));
const Settings = lazy(() => import("./pages/Settings.tsx"));
const Info = lazy(() => import("./pages/Info.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[Preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthPage redirectAfterAuth="/dashboard" />} />
              <Route path="/analyze" element={<Analyze />} />
              <Route path="/analysis/:id" element={<AnalysisWorkspace />} />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth
                    title="Sign in to open your research desk"
                    description="Your verification sessions, saved papers and evidence chains live here."
                  >
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route path="/explorer" element={<Explorer />} />
              <Route
                path="/library"
                element={
                  <RequireAuth
                    title="Sign in to open your library"
                    description="Saved papers, notes, collections and citation exports live here."
                  >
                    <LibraryPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/graph"
                element={
                  <RequireAuth
                    title="Sign in to explore citation graphs"
                    description="Build a real citation network from OpenAlex metadata."
                  >
                    <ResearchGraph />
                  </RequireAuth>
                }
              />
              <Route
                path="/assistant"
                element={
                  <RequireAuth
                    title="Sign in to ask the research assistant"
                    description="The assistant answers only from evidence already stored in your analyses."
                  >
                    <Assistant />
                  </RequireAuth>
                }
              />
              <Route
                path="/reports"
                element={
                  <RequireAuth
                    title="Sign in to open reports and analytics"
                    description="Download claim-level reports and portfolio verification metrics."
                  >
                    <Reports />
                  </RequireAuth>
                }
              />
              <Route
                path="/notifications"
                element={
                  <RequireAuth
                    title="Sign in to see notifications"
                    description="Report and verification updates appear here."
                  >
                    <Notifications />
                  </RequireAuth>
                }
              />
              <Route
                path="/settings"
                element={
                  <RequireAuth
                    title="Sign in to manage settings"
                    description="Profile, appearance and data controls are scoped to your session."
                  >
                    <Settings />
                  </RequireAuth>
                }
              />
              <Route path="/privacy" element={<Info mode="privacy" />} />
              <Route path="/about" element={<Info mode="about" />} />
              <Route path="/terms" element={<Info mode="terms" />} />
              <Route path="/contact" element={<Info mode="contact" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
