import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { useTabs, type ThreadTab } from "~/stores/tabs";

/** The thread the router is showing, or null on the canvas and settings. */
export function useActiveThreadRef(): ThreadTab | null {
  // Select primitives so the router can compare them; the ref is rebuilt only
  // when the route params change.
  const environmentId = useRouterState({
    select: (state) => activeParam(state.matches, "environmentId"),
  });
  const threadId = useRouterState({ select: (state) => activeParam(state.matches, "threadId") });
  return useMemo(
    () =>
      environmentId && threadId
        ? { environmentId: environmentId as EnvironmentId, threadId: threadId as ThreadId }
        : null,
    [environmentId, threadId],
  );
}

function activeParam(
  matches: ReadonlyArray<{ readonly routeId: string; readonly params: unknown }>,
  key: "environmentId" | "threadId",
): string | null {
  const match = matches.find((entry) => entry.routeId === "/t/$environmentId/$threadId");
  const value = (match?.params as Record<string, string | undefined> | undefined)?.[key];
  return value ?? null;
}

/** Opens a thread as a tab (after the active one) and navigates to it. */
export function useOpenThread() {
  const navigate = useNavigate();
  const active = useActiveThreadRef();
  return useCallback(
    (tab: ThreadTab) => {
      useTabs.getState().open(tab, active);
      void navigate({
        to: "/t/$environmentId/$threadId",
        params: { environmentId: tab.environmentId, threadId: tab.threadId },
      });
    },
    [active, navigate],
  );
}

/** Closes a tab; when it was active, moves to the neighbor tab or the canvas. */
export function useCloseTab() {
  const navigate = useNavigate();
  const active = useActiveThreadRef();
  return useCallback(
    (tab: ThreadTab) => {
      const next = useTabs.getState().close(tab, active);
      if (
        active &&
        active.environmentId === tab.environmentId &&
        active.threadId === tab.threadId
      ) {
        if (next) {
          void navigate({
            to: "/t/$environmentId/$threadId",
            params: { environmentId: next.environmentId, threadId: next.threadId },
          });
        } else {
          void navigate({ to: "/" });
        }
      }
    },
    [active, navigate],
  );
}
