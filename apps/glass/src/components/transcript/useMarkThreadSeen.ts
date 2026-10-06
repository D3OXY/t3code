import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { environmentThreadShells, serverEnvironment, threadEnvironment } from "~/state/atoms";
import { useAtomCommand } from "~/state/hooks";
import type { ThreadTab } from "~/stores/tabs";

const VISIT_THROTTLE_MS = 10_000;

function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

const documentVisible = () => document.visibilityState === "visible";

/**
 * Records the server-side visit watermark while a thread is on screen, so its
 * unread state clears on every device. An unseen completion publishes at once;
 * mid-run activity (several bumps a second while streaming) rides a trailing
 * 10s throttle whose timer always carries the newest watermark. Dispatches are
 * deduped per thread and `updatedAt`, which also keeps a mark-unread on the
 * open thread sticky until new activity lands. Mirrors apps/web ChatView.
 */
export function useMarkThreadSeen(threadRef: ThreadTab) {
  const shell = useAtomValue(environmentThreadShells.threadShellAtom(threadRef));
  const tracking =
    useAtomValue(serverEnvironment.configValueAtom(threadRef.environmentId))?.environment
      .capabilities.threadVisitedTracking === true;
  const visible = useSyncExternalStore(subscribeVisibility, documentVisible);
  const visit = useAtomCommand(threadEnvironment.visit);
  const lastDispatchKey = useRef<string | null>(null);
  const lastDispatchAt = useRef(0);

  const updatedAt = shell?.updatedAt ?? null;
  const lastVisitedAt = shell?.lastVisitedAt;
  const completedAt = shell?.latestRun?.completedAt ?? null;
  const { environmentId, threadId } = threadRef;

  useEffect(() => {
    if (!tracking || !visible || updatedAt === null || lastVisitedAt === undefined) return;
    const updated = Date.parse(updatedAt);
    if (Number.isNaN(updated)) return;
    const visited = lastVisitedAt ? Date.parse(lastVisitedAt) : Number.NaN;
    if (!Number.isNaN(visited) && visited >= updated) return;

    const key = `${environmentId}:${threadId}:${updatedAt}`;
    if (lastDispatchKey.current === key) return;
    const dispatch = () => {
      lastDispatchKey.current = key;
      lastDispatchAt.current = Date.now();
      void visit({ environmentId, input: { threadId, visitedAt: updatedAt } });
    };

    const completed = completedAt ? Date.parse(completedAt) : Number.NaN;
    const unseenCompletion =
      !Number.isNaN(completed) && (Number.isNaN(visited) || completed > visited);
    const sinceLast = Date.now() - lastDispatchAt.current;
    if (unseenCompletion || sinceLast >= VISIT_THROTTLE_MS) {
      dispatch();
      return;
    }
    const timer = window.setTimeout(dispatch, VISIT_THROTTLE_MS - sinceLast);
    return () => window.clearTimeout(timer);
  }, [completedAt, environmentId, lastVisitedAt, threadId, tracking, updatedAt, visible, visit]);
}
