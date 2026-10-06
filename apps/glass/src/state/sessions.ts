import type {
  EnvironmentProject,
  EnvironmentThreadShell,
  ThreadRunSummary,
  ThreadRuntimeSummary,
} from "@t3tools/client-runtime/state/shell";
import { sortPinnedThreadsByOrderKey } from "@t3tools/client-runtime/state/thread-sort";
import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { environmentCatalog, environmentProjects, environmentThreadShells } from "./atoms";

/**
 * What a session row needs the user to know, most urgent first:
 * - approval / input: the agent is blocked on the user
 * - failed / limited: the last run failed (limited = usage limit)
 * - plan: a proposed plan is ready for review
 * - working: a run is in progress
 * - waiting: parked idle by background work it is waiting on
 * - done: finished since the user last looked
 * - idle: nothing new
 */
export type SessionStatus =
  | "approval"
  | "input"
  | "failed"
  | "limited"
  | "plan"
  | "working"
  | "waiting"
  | "done"
  | "idle";

export interface SessionRow {
  readonly key: string;
  readonly shell: EnvironmentThreadShell;
  readonly project: EnvironmentProject | null;
  readonly environmentLabel: string;
  readonly status: SessionStatus;
  readonly unread: boolean;
  /** When the session last did something worth sorting by (ISO). */
  readonly activityAt: string;
}

export const sessionKey = (environmentId: EnvironmentId, threadId: string) =>
  `${environmentId}:${threadId}`;
export const projectKeyOf = (environmentId: EnvironmentId, projectId: string) =>
  `${environmentId}:${projectId}`;

const ACTIVE_STATUSES = new Set(["preparing", "queued", "starting", "running", "waiting"]);

/** Completed since the server-tracked visit watermark. Never-visited threads count as read. */
export function hasUnseenCompletion(shell: {
  readonly latestRun: Pick<ThreadRunSummary, "completedAt"> | null;
  readonly lastVisitedAt?: string | null | undefined;
}): boolean {
  const completedAt = shell.latestRun?.completedAt;
  if (!completedAt || !shell.lastVisitedAt) return false;
  const completed = Date.parse(completedAt);
  const visited = Date.parse(shell.lastVisitedAt);
  if (Number.isNaN(completed)) return false;
  return Number.isNaN(visited) || completed > visited;
}

export function resolveSessionStatus(
  shell: Pick<
    EnvironmentThreadShell,
    "hasPendingApprovals" | "hasPendingUserInput" | "hasActionableProposedPlan"
  > & { readonly runtime: Pick<ThreadRuntimeSummary, "status" | "lastErrorClass"> | null },
  unread: boolean,
): SessionStatus {
  if (shell.hasPendingApprovals) return "approval";
  if (shell.hasPendingUserInput) return "input";
  const runtime = shell.runtime;
  if (runtime !== null && ACTIVE_STATUSES.has(runtime.status)) return "working";
  if (runtime?.status === "idle") return "waiting";
  if (runtime?.status === "failed")
    return runtime.lastErrorClass === "usage_limit" ? "limited" : "failed";
  if (shell.hasActionableProposedPlan) return "plan";
  return unread ? "done" : "idle";
}

const STATUS_RANK: Record<SessionStatus, number> = {
  approval: 0,
  input: 0,
  failed: 1,
  limited: 1,
  plan: 1,
  working: 2,
  waiting: 2,
  done: 3,
  idle: 4,
};

/** Statuses that ask something of the user; they float to the top and count toward the pill. */
export const isAttentionStatus = (status: SessionStatus) => STATUS_RANK[status] <= 1;

type SortableRow = Pick<SessionRow, "key" | "status" | "activityAt">;

const byActivityDesc = (a: SortableRow, b: SortableRow) =>
  b.activityAt.localeCompare(a.activityAt) || a.key.localeCompare(b.key);

/** Attention-sorted: blocked first, then failures and plans, then running, unread, the rest. */
export function sortSessionsByAttention<T extends SortableRow>(rows: ReadonlyArray<T>): T[] {
  return [...rows].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || byActivityDesc(a, b),
  );
}

/** Every navigable session (not archived, not a subagent) across enabled environments. */
export const sessionRowsAtom = Atom.make((get): ReadonlyArray<SessionRow> => {
  const catalog = get(environmentCatalog.catalogValueAtom);
  const projects = new Map<string, EnvironmentProject>();
  for (const project of get(environmentProjects.projectsAtom)) {
    projects.set(projectKeyOf(project.environmentId, project.id), project);
  }
  return get(environmentThreadShells.navigationThreadShellsAtom).map((shell) => {
    const unread = hasUnseenCompletion(shell);
    return {
      key: sessionKey(shell.environmentId, shell.id),
      shell,
      project: projects.get(projectKeyOf(shell.environmentId, shell.projectId)) ?? null,
      environmentLabel: catalog.entries.get(shell.environmentId)?.target.label ?? "Unknown",
      status: resolveSessionStatus(shell, unread),
      unread,
      activityAt:
        shell.latestUserMessageAt && shell.latestUserMessageAt > shell.updatedAt
          ? shell.latestUserMessageAt
          : shell.updatedAt,
    };
  });
}).pipe(Atom.withLabel("glass-session-rows"));

export interface SessionSections {
  readonly pinned: ReadonlyArray<SessionRow>;
  readonly sessions: ReadonlyArray<SessionRow>;
}

/** Splits rows into the user-ordered pinned block and the attention-sorted rest. */
export function sectionSessions(rows: ReadonlyArray<SessionRow>): SessionSections {
  const pinnedRows = rows.filter((row) => row.shell.pinnedAt !== null);
  const pinnedOrder = sortPinnedThreadsByOrderKey(pinnedRows.map((row) => row.shell));
  const byShell = new Map(pinnedRows.map((row) => [row.shell, row]));
  return {
    pinned: pinnedOrder.flatMap((shell) => byShell.get(shell) ?? []),
    sessions: sortSessionsByAttention(rows.filter((row) => row.shell.pinnedAt === null)),
  };
}

export const sessionRowByKeyAtom = Atom.family((key: string) =>
  Atom.make((get) => get(sessionRowsAtom).find((row) => row.key === key) ?? null),
);
