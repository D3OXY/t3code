/**
 * PROTOTYPE — throw away after validating the split navigator direction.
 * Curated mock data only; no server entities or mutations.
 */
import {
  ArchiveIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleXIcon,
  CircleIcon,
  InboxIcon,
  LoaderIcon,
  MessageSquareWarningIcon,
  PauseIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { formatRelativeTimeLabel } from "../../timestampFormat";
import { SidebarBrand } from "../Sidebar";
import { SidebarFooter, SidebarHeader } from "../ui/sidebar";

type ThreadSignal =
  | "approval"
  | "input"
  | "running"
  | "connecting"
  | "plan"
  | "completed"
  | "error"
  | "interrupted"
  | "inactive";
type NavigatorSelection = "focus" | string;

interface PrototypeThread {
  readonly key: string;
  readonly projectKey: string;
  readonly signal: ThreadSignal;
  readonly title: string;
  readonly updatedAt: string;
}

interface PrototypeProject {
  readonly key: string;
  readonly monogram: string;
  readonly name: string;
  readonly threads: readonly PrototypeThread[];
}

const SIGNAL_PRIORITY: Record<ThreadSignal, number> = {
  approval: 6,
  input: 5,
  plan: 4,
  error: 4,
  completed: 3,
  running: 2,
  connecting: 2,
  interrupted: 1,
  inactive: 1,
};

function timestampAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function mockThread(
  projectKey: string,
  key: string,
  title: string,
  signal: ThreadSignal,
  minutesAgo: number,
): PrototypeThread {
  return { key, projectKey, title, signal, updatedAt: timestampAgo(minutesAgo) };
}

function sortThreads(threads: readonly PrototypeThread[]): PrototypeThread[] {
  return [...threads].toSorted((left, right) => {
    const priorityDifference = SIGNAL_PRIORITY[right.signal] - SIGNAL_PRIORITY[left.signal];
    if (priorityDifference !== 0) return priorityDifference;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

function makeLoadTestProject(index: number): PrototypeProject {
  const number = String(index).padStart(2, "0");
  const key = `load-test-${number}`;
  const ageOffset = index * 7;
  const actionSignal: ThreadSignal = index % 10 === 0 ? "input" : "approval";

  return {
    key,
    monogram: index.toString(36).toUpperCase().padStart(2, "0"),
    name: `Load Test Project ${number}`,
    threads: sortThreads([
      ...(index % 5 === 0
        ? [
            mockThread(
              key,
              `${key}:action`,
              `Resolve a pending project decision ${number}`,
              actionSignal,
              9 + ageOffset,
            ),
          ]
        : []),
      ...(index % 4 === 0
        ? [
            mockThread(
              key,
              `${key}:working`,
              `Working through a deliberately long thread title to test truncation ${number}`,
              "running",
              41 + ageOffset,
            ),
          ]
        : []),
      ...(index % 8 === 0
        ? [
            mockThread(
              key,
              `${key}:connecting`,
              `Connecting to the project environment ${number}`,
              "connecting",
              18 + ageOffset,
            ),
          ]
        : []),
      ...(index % 7 === 0
        ? [
            mockThread(
              key,
              `${key}:error`,
              `Deployment task failed unexpectedly ${number}`,
              "error",
              32 + ageOffset,
            ),
          ]
        : []),
      ...(index % 6 === 0
        ? [
            mockThread(
              key,
              `${key}:interrupted`,
              `Refactor was interrupted before completion ${number}`,
              "interrupted",
              70 + ageOffset,
            ),
          ]
        : []),
      ...(index % 3 === 0
        ? [
            mockThread(
              key,
              `${key}:completed`,
              `Completed result waiting to be reviewed ${number}`,
              "completed",
              index % 9 === 0 ? 5_000 + ageOffset : 90 + ageOffset,
            ),
          ]
        : []),
      mockThread(
        key,
        `${key}:recent`,
        `Recently inactive exploration ${number}`,
        "inactive",
        1_200 + ageOffset,
      ),
      mockThread(
        key,
        `${key}:older`,
        `Inactive thread older than three days ${number}`,
        "inactive",
        8_000 + ageOffset,
      ),
    ]),
  };
}

const PROJECTS: readonly PrototypeProject[] = [
  {
    key: "t3code",
    monogram: "T3",
    name: "t3code",
    threads: sortThreads([
      mockThread("t3code", "t3code:approval", "Approve filesystem access", "approval", 3),
      mockThread("t3code", "t3code:reconnect", "Fix reconnect race condition", "running", 7),
      mockThread("t3code", "t3code:sidebar", "Sidebar status model", "completed", 14),
      mockThread("t3code", "t3code:palette", "Command palette polish", "inactive", 1_560),
      mockThread("t3code", "t3code:terminal", "Investigate terminal resize", "inactive", 12_400),
    ]),
  },
  {
    key: "acme-dashboard",
    monogram: "AC",
    name: "Acme Dashboard",
    threads: sortThreads([
      mockThread("acme-dashboard", "acme:billing", "Choose billing migration path", "input", 1),
      mockThread("acme-dashboard", "acme:checkout", "Review checkout redesign plan", "plan", 22),
      mockThread("acme-dashboard", "acme:audit", "Add audit log export", "completed", 48),
      mockThread("acme-dashboard", "acme:charts", "Reduce chart bundle size", "inactive", 4_320),
    ]),
  },
  {
    key: "mobile-sync",
    monogram: "MO",
    name: "mobile-sync",
    threads: sortThreads([
      mockThread("mobile-sync", "mobile:offline", "Implement offline queue", "running", 11),
      mockThread("mobile-sync", "mobile:conflicts", "Resolve sync conflicts", "completed", 33),
      mockThread("mobile-sync", "mobile:push", "Push notification spike", "inactive", 10_080),
    ]),
  },
  {
    key: "old-lab",
    monogram: "OL",
    name: "old-lab",
    threads: sortThreads([
      mockThread("old-lab", "lab:sqlite", "Try SQLite replication", "inactive", 43_200),
      mockThread("old-lab", "lab:wasm", "WASM runtime experiment", "inactive", 129_600),
    ]),
  },
  ...Array.from({ length: 18 }, (_, index) => makeLoadTestProject(index + 1)),
];

const ALL_THREADS = sortThreads(PROJECTS.flatMap((project) => project.threads));
const OLDER_INACTIVE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1_000;

function isOlderInactiveThread(thread: PrototypeThread): boolean {
  return (
    thread.signal === "inactive" &&
    Date.now() - Date.parse(thread.updatedAt) >= OLDER_INACTIVE_THRESHOLD_MS
  );
}

function signalLabel(signal: ThreadSignal): string {
  switch (signal) {
    case "approval":
      return "Approval needed";
    case "input":
      return "Waiting for you";
    case "running":
      return "Working";
    case "connecting":
      return "Connecting";
    case "plan":
      return "Plan ready";
    case "completed":
      return "Completed";
    case "error":
      return "Failed";
    case "interrupted":
      return "Interrupted";
    case "inactive":
      return "Inactive";
  }
}

function signalClasses(signal: ThreadSignal): string {
  switch (signal) {
    case "approval":
      return "bg-amber-500 text-amber-950";
    case "input":
      return "bg-indigo-500 text-white";
    case "running":
    case "connecting":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-300";
    case "plan":
      return "bg-violet-500/15 text-violet-600 dark:text-violet-300";
    case "completed":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "error":
      return "bg-red-500/15 text-red-600 dark:text-red-300";
    case "interrupted":
      return "bg-muted text-muted-foreground";
    case "inactive":
      return "bg-muted text-muted-foreground/65";
  }
}

function signalIcon(signal: ThreadSignal): ReactNode {
  switch (signal) {
    case "approval":
    case "input":
      return <MessageSquareWarningIcon className="size-3" />;
    case "running":
    case "connecting":
      return <LoaderIcon className="size-3 animate-status-pulse" />;
    case "plan":
      return <SquarePenIcon className="size-3" />;
    case "completed":
      return <CheckIcon className="size-3" />;
    case "error":
      return <CircleXIcon className="size-3" />;
    case "interrupted":
      return <PauseIcon className="size-3" />;
    case "inactive":
      return <CircleIcon className="size-2 fill-current" />;
  }
}

function projectName(projectKey: string): string {
  return PROJECTS.find((project) => project.key === projectKey)?.name ?? projectKey;
}

function ThreadRow({
  active,
  showProject,
  thread,
  onSelect,
}: {
  active: boolean;
  showProject?: boolean;
  thread: PrototypeThread;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex w-full min-w-0 gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
        active
          ? "bg-accent text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent/65 hover:text-foreground"
      }`}
    >
      <span
        className={`flex size-5 shrink-0 self-center items-center justify-center rounded-md ${signalClasses(thread.signal)}`}
      >
        {signalIcon(thread.signal)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium leading-4">
            {thread.title}
          </span>
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground/45">
            {formatRelativeTimeLabel(thread.updatedAt)}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[10px] leading-3.5">
          {showProject ? (
            <>
              <span className="max-w-24 truncate text-muted-foreground/55">
                {projectName(thread.projectKey)}
              </span>
              <span className="text-muted-foreground/30">·</span>
            </>
          ) : null}
          <span
            className={`min-w-0 truncate whitespace-nowrap ${
              thread.signal === "inactive" ? "text-muted-foreground/45" : "text-foreground/60"
            }`}
          >
            {signalLabel(thread.signal)}
          </span>
        </span>
      </span>
      {active ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-foreground/65" />
      ) : null}
    </button>
  );
}

function ThreadGroup({
  activeThreadKey,
  emptyLabel,
  label,
  showProject,
  threads,
  onSelectThread,
}: {
  activeThreadKey: string | null;
  emptyLabel?: string;
  label: string;
  showProject?: boolean;
  threads: readonly PrototypeThread[];
  onSelectThread: (threadKey: string) => void;
}) {
  if (threads.length === 0) {
    return emptyLabel ? (
      <div className="px-3 py-5 text-center text-xs text-muted-foreground/45">{emptyLabel}</div>
    ) : null;
  }

  return (
    <section className="px-1.5 pb-2">
      <div className="flex h-7 items-center px-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
        <span>{label}</span>
        <span className="ml-auto font-mono tracking-normal">{threads.length}</span>
      </div>
      <div className="space-y-0.5">
        {threads.map((thread) => (
          <ThreadRow
            key={thread.key}
            active={activeThreadKey === thread.key}
            showProject={showProject ?? false}
            thread={thread}
            onSelect={() => onSelectThread(thread.key)}
          />
        ))}
      </div>
    </section>
  );
}

function ProjectRail({
  selection,
  onSelect,
}: {
  selection: NavigatorSelection;
  onSelect: (selection: NavigatorSelection) => void;
}) {
  const focusCount = ALL_THREADS.filter(
    (thread) =>
      thread.signal === "approval" ||
      thread.signal === "input" ||
      thread.signal === "plan" ||
      thread.signal === "error",
  ).length;

  return (
    <nav className="flex h-full min-h-0 flex-col items-center overflow-hidden border-r border-border/70 bg-muted/20 px-1.5 py-2">
      <button
        type="button"
        title="Focus"
        aria-label={`Focus, ${focusCount} threads need attention`}
        onClick={() => onSelect("focus")}
        className={`relative flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
          selection === "focus"
            ? "bg-foreground text-background shadow-sm"
            : "text-muted-foreground/60 hover:bg-accent hover:text-foreground"
        }`}
      >
        <InboxIcon className="size-4" />
        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-amber-500 font-mono text-[8px] font-semibold text-amber-950 ring-2 ring-sidebar">
          {focusCount}
        </span>
      </button>

      <div className="my-2 h-px w-6 bg-border/70" />

      <div className="min-h-0 w-[calc(100%+1rem)] flex-1 self-start space-y-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-1 pr-4 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PROJECTS.map((project) => {
          const isSelected = selection === project.key;
          const actionCount = project.threads.filter(
            (thread) =>
              thread.signal === "approval" || thread.signal === "input" || thread.signal === "plan",
          ).length;
          const errorCount = project.threads.filter((thread) => thread.signal === "error").length;
          const updateCount = project.threads.filter(
            (thread) => thread.signal === "completed",
          ).length;

          return (
            <button
              key={project.key}
              type="button"
              title={project.name}
              aria-label={`${project.name}, ${actionCount} need input, ${errorCount} failed, ${updateCount} completed`}
              onClick={() => onSelect(project.key)}
              className={`relative mx-auto flex size-9 items-center justify-center rounded-lg font-mono text-[10px] font-semibold tracking-tight transition-colors ${
                isSelected
                  ? "bg-accent text-foreground shadow-sm ring-1 ring-foreground/30 ring-offset-1 ring-offset-sidebar"
                  : "bg-muted/35 text-muted-foreground/55 hover:bg-accent/70 hover:text-foreground"
              }`}
            >
              {project.monogram}
              {errorCount > 0 ? (
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-red-500 ring-2 ring-inset ring-sidebar" />
              ) : actionCount > 0 ? (
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-amber-500 ring-2 ring-inset ring-sidebar" />
              ) : updateCount > 0 ? (
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-emerald-500 ring-2 ring-inset ring-sidebar" />
              ) : null}
              {isSelected ? (
                <span className="absolute -left-1.5 h-4 w-0.5 rounded-full bg-foreground/70" />
              ) : null}
            </button>
          );
        })}
      </div>

      <Link
        to="/settings/archived"
        title="Archived"
        aria-label="Archived, 14 threads"
        className="mt-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground/55 transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArchiveIcon className="size-4" />
      </Link>
    </nav>
  );
}

function NewThreadButton({
  projectName,
  onNewThread,
}: {
  projectName?: string;
  onNewThread: () => void;
}) {
  return (
    <div className="border-b border-border/60 p-2">
      <button
        type="button"
        onClick={onNewThread}
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-lg bg-foreground px-2.5 text-left text-background shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-background/15">
          <PlusIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">New thread</span>
        <span className="max-w-24 truncate font-mono text-[9px] text-background/55">
          {projectName ? `in ${projectName}` : "Choose project"}
        </span>
      </button>
    </div>
  );
}

function FocusPanel({
  activeThreadKey,
  onNewThread,
  onSelectThread,
}: {
  activeThreadKey: string | null;
  onNewThread: () => void;
  onSelectThread: (threadKey: string) => void;
}) {
  const actions = ALL_THREADS.filter(
    (thread) =>
      thread.signal === "approval" || thread.signal === "input" || thread.signal === "plan",
  );
  const updates = ALL_THREADS.filter((thread) => thread.signal === "completed");
  const failures = ALL_THREADS.filter((thread) => thread.signal === "error");
  const running = ALL_THREADS.filter(
    (thread) => thread.signal === "running" || thread.signal === "connecting",
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <NewThreadButton onNewThread={onNewThread} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="Action required"
          showProject
          threads={actions}
          onSelectThread={onSelectThread}
        />
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="Failed"
          showProject
          threads={failures}
          onSelectThread={onSelectThread}
        />
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="Completed"
          showProject
          threads={updates}
          onSelectThread={onSelectThread}
        />
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="In progress"
          showProject
          threads={running}
          onSelectThread={onSelectThread}
        />
      </div>
    </div>
  );
}

function ProjectPanel({
  activeThreadKey,
  onNewThread,
  project,
  onSelectThread,
}: {
  activeThreadKey: string | null;
  onNewThread: () => void;
  project: PrototypeProject;
  onSelectThread: (threadKey: string) => void;
}) {
  const actions = project.threads.filter(
    (thread) =>
      thread.signal === "approval" || thread.signal === "input" || thread.signal === "plan",
  );
  const completed = project.threads.filter((thread) => thread.signal === "completed");
  const failures = project.threads.filter((thread) => thread.signal === "error");
  const working = project.threads.filter(
    (thread) => thread.signal === "running" || thread.signal === "connecting",
  );
  const recent = project.threads.filter(
    (thread) =>
      thread.signal === "interrupted" ||
      (thread.signal === "inactive" && !isOlderInactiveThread(thread)),
  );
  const older = project.threads.filter(isOlderInactiveThread);
  const allThreadsAreOlder = project.threads.length > 0 && older.length === project.threads.length;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <NewThreadButton projectName={project.name} onNewThread={onNewThread} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="Needs you"
          threads={actions}
          onSelectThread={onSelectThread}
        />
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="Failed"
          threads={failures}
          onSelectThread={onSelectThread}
        />
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="Completed"
          threads={completed}
          onSelectThread={onSelectThread}
        />
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="Working"
          threads={working}
          onSelectThread={onSelectThread}
        />
        <ThreadGroup
          activeThreadKey={activeThreadKey}
          label="Recent"
          threads={recent}
          onSelectThread={onSelectThread}
        />

        {older.length > 0 ? (
          <details
            className="group mx-2 mb-2 border-t border-border/60 pt-1"
            open={allThreadsAreOlder}
          >
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 px-1 text-[10px] text-muted-foreground/45 transition-colors hover:text-muted-foreground">
              <ChevronRightIcon className="size-3 transition-transform group-open:rotate-90" />
              Older
              <span className="ml-auto font-mono">{older.length}</span>
            </summary>
            <div className="space-y-0.5 pb-1">
              {older.map((thread) => (
                <ThreadRow
                  key={thread.key}
                  active={activeThreadKey === thread.key}
                  thread={thread}
                  onSelect={() => onSelectThread(thread.key)}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export function BetterSidebarPrototype() {
  const [selection, setSelection] = useState<NavigatorSelection>("focus");
  const [activeThreadKey, setActiveThreadKey] = useState<string | null>("acme:billing");
  const selectedProject = PROJECTS.find((project) => project.key === selection) ?? null;

  return (
    <>
      <SidebarHeader className="@container/sidebar-header h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center border-b border-border/70 px-3 py-0 md:px-0">
        <SidebarBrand />
      </SidebarHeader>

      <div className="border-b border-border/60 p-2">
        <div className="flex h-7 items-center gap-2 rounded-md bg-muted/50 px-2 text-[11px] text-muted-foreground/55">
          <SearchIcon className="size-3.5" />
          Find anything
          <span className="ml-auto font-mono text-[9px] opacity-60">⌘K</span>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="grid h-full min-h-0 flex-1 grid-cols-[3.25rem_minmax(0,1fr)] overflow-hidden">
          <ProjectRail selection={selection} onSelect={setSelection} />
          {selectedProject ? (
            <ProjectPanel
              activeThreadKey={activeThreadKey}
              onNewThread={() => setActiveThreadKey(null)}
              project={selectedProject}
              onSelectThread={setActiveThreadKey}
            />
          ) : (
            <FocusPanel
              activeThreadKey={activeThreadKey}
              onNewThread={() => setActiveThreadKey(null)}
              onSelectThread={setActiveThreadKey}
            />
          )}
        </div>
      </div>

      <SidebarFooter className="border-t border-border/60 p-2">
        <Link
          to="/settings"
          className="flex h-8 items-center gap-2 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <SettingsIcon className="size-3.5" />
          Settings
        </Link>
      </SidebarFooter>
    </>
  );
}
