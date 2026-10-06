import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";

import { RouteError } from "./components/shell/RouteError";
import { Shell } from "./components/shell/Shell";
import { NewSessionRoute } from "./routes/NewSessionRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { ThreadRoute } from "./routes/ThreadRoute";

const rootRoute = createRootRoute({ component: Shell, errorComponent: RouteError });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: NewSessionRoute,
});

const threadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/t/$environmentId/$threadId",
  component: ThreadRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  // `?section=environments` deep-links a settings page; unknown values fall back.
  validateSearch: (search: Record<string, unknown>): { section?: string } =>
    typeof search.section === "string" ? { section: search.section } : {},
  component: SettingsRoute,
});

// The pairing screen is outside the router (see App), so a stale /pair link
// lands on the new-session canvas once the gate has resolved.
const pairRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pair",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const routeTree = rootRoute.addChildren([indexRoute, threadRoute, settingsRoute, pairRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  // Route errors render inside the shell; the root fallback covers shell crashes.
  defaultErrorComponent: RouteError,
  scrollRestoration: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
