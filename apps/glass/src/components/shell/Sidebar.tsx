import { useAtomValue } from "@effect/atom-react";
import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Folder,
  GitBranch,
  ListFilter,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Sparkles,
  Trash2,
  EyeOff,
} from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/Button";
import {
  ContextMenu,
  ContextMenuPopup,
  ContextMenuTrigger,
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/Menu";
import { ProviderIcon, useProviderInstance } from "~/components/ui/ProviderIcon";
import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import { basename, relativeAge, shortcutLabel } from "~/lib/format";
import { useActiveThreadRef, useOpenThread } from "~/lib/navigation";
import { useFlip } from "~/lib/useFlip";
import { useNow } from "~/lib/useNow";
import {
  enabledEnvironmentIdsAtom,
  environmentProjects,
  orchestrationEnvironment,
} from "~/state/atoms";
import { useEnvironmentQuery } from "~/state/hooks";
import { projectKeyOf, sectionSessions, sessionRowsAtom, type SessionRow } from "~/state/sessions";
import { useThreadActions } from "~/state/useThreadActions";
import { useLayout } from "~/stores/layout";
import { EnvironmentFooter } from "./EnvironmentFooter";
import { StatusGlyph } from "./StatusGlyph";

/** The session list: the data model of the app, filtered by project and sorted by attention. */
export function Sidebar() {
  const width = useLayout((state) => state.sidebarWidth);
  const collapsed = useLayout((state) => state.sidebarCollapsed);
  const setWidth = useLayout((state) => state.setSidebarWidth);
  const showArchived = useLayout((state) => state.showArchived);

  return (
    <aside
      className="relative z-10 h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? 0 : width }}
      aria-hidden={collapsed}
    >
      <div className="flex h-full flex-col py-2 pl-2" style={{ width }}>
        <div className="glass flex h-full flex-col overflow-hidden rounded-2xl border border-line">
          <SidebarHeader />
          <ProjectFilterBar />
          {showArchived ? <ArchivedList /> : <SessionList />}
          <EnvironmentFooter />
        </div>
      </div>
      <ResizeHandle width={width} onResize={setWidth} />
    </aside>
  );
}

function ResizeHandle({
  width,
  onResize,
}: {
  readonly width: number;
  readonly onResize: (width: number) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      className="absolute top-0 right-0 z-20 h-full w-2 cursor-col-resize"
      onDoubleClick={() => onResize(272)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onResize(width - 16);
        if (event.key === "ArrowRight") onResize(width + 16);
      }}
      onPointerDown={(event) => {
        const startX = event.clientX;
        const startWidth = width;
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) => onResize(startWidth + moveEvent.clientX - startX);
        const up = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", up);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
      }}
    />
  );
}

function SidebarHeader() {
  const toggleSidebar = useLayout((state) => state.toggleSidebar);
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 px-2">
      <Tooltip label="Hide sidebar" shortcut={shortcutLabel("mod+s")}>
        <Button size="icon" variant="ghost" aria-label="Hide sidebar" onClick={toggleSidebar}>
          <PanelLeft className="size-4" />
        </Button>
      </Tooltip>
      <Button size="icon" variant="ghost" aria-label="Back" onClick={() => router.history.back()}>
        <ArrowLeft className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Forward"
        onClick={() => router.history.forward()}
      >
        <ArrowRight className="size-4" />
      </Button>
      <div className="flex-1" />
      <Tooltip label="New session" shortcut={shortcutLabel("alt+n")}>
        <Button
          size="icon"
          variant="ghost"
          aria-label="New session"
          onClick={() => void navigate({ to: "/" })}
        >
          <Plus className="size-4" />
        </Button>
      </Tooltip>
    </div>
  );
}

function ProjectFilterBar() {
  const projects = useAtomValue(environmentProjects.projectsAtom);
  const rows = useAtomValue(sessionRowsAtom);
  const filter = useLayout((state) => state.projectFilter);
  const setFilter = useLayout((state) => state.setProjectFilter);
  const grouping = useLayout((state) => state.sidebarGrouping);
  const setGrouping = useLayout((state) => state.setSidebarGrouping);
  const showArchived = useLayout((state) => state.showArchived);
  const setShowArchived = useLayout((state) => state.setShowArchived);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = projectKeyOf(row.shell.environmentId, row.shell.projectId);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const selected = projects.find(
    (project) => projectKeyOf(project.environmentId, project.id) === filter,
  );
  const sortedProjects = [...projects].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 px-2">
      <Menu>
        <MenuTrigger className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-[13px] font-medium outline-none hover:bg-hover">
          <Folder className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate text-left">
            {showArchived ? "Archived" : (selected?.title ?? "All projects")}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-faint" />
        </MenuTrigger>
        <MenuPopup className="w-64">
          <MenuRadioGroup
            value={filter ?? "all"}
            onValueChange={(value: string) => {
              setShowArchived(false);
              setFilter(value === "all" ? null : value);
            }}
          >
            <MenuRadioItem value="all" description={`${rows.length} sessions`}>
              All projects
            </MenuRadioItem>
            {sortedProjects.length > 0 ? <MenuSeparator /> : null}
            {sortedProjects.map((project) => {
              const key = projectKeyOf(project.environmentId, project.id);
              return (
                <MenuRadioItem
                  key={key}
                  value={key}
                  description={`${counts.get(key) ?? 0} sessions · ${basename(project.workspaceRoot)}`}
                >
                  {project.title}
                </MenuRadioItem>
              );
            })}
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>
      <Menu>
        <Tooltip label="View options">
          <MenuTrigger
            render={
              <Button size="icon" variant="ghost" aria-label="View options">
                <ListFilter className="size-4" />
              </Button>
            }
          />
        </Tooltip>
        <MenuPopup align="end" className="w-52">
          <MenuLabel>Group sessions</MenuLabel>
          <MenuRadioGroup
            value={grouping}
            onValueChange={(value: string) => setGrouping(value === "project" ? "project" : "flat")}
          >
            <MenuRadioItem value="flat">By attention</MenuRadioItem>
            <MenuRadioItem value="project">By project</MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuCheckboxItem checked={showArchived} onCheckedChange={setShowArchived}>
            Show archived
          </MenuCheckboxItem>
        </MenuPopup>
      </Menu>
    </div>
  );
}

function SessionList() {
  const rows = useAtomValue(sessionRowsAtom);
  const filter = useLayout((state) => state.projectFilter);
  const grouping = useLayout((state) => state.sidebarGrouping);
  const listRef = useRef<HTMLDivElement>(null);
  const [pinnedOpen, setPinnedOpen] = useState(true);

  const visible = useMemo(
    () =>
      filter === null
        ? rows
        : rows.filter(
            (row) => projectKeyOf(row.shell.environmentId, row.shell.projectId) === filter,
          ),
    [rows, filter],
  );
  const sections = useMemo(() => sectionSessions(visible), [visible]);

  const groups = useMemo(() => {
    if (grouping !== "project") return null;
    const map = new Map<string, { title: string; rows: SessionRow[] }>();
    for (const row of sections.sessions) {
      const key = projectKeyOf(row.shell.environmentId, row.shell.projectId);
      const group = map.get(key) ?? { title: row.project?.title ?? "Unknown project", rows: [] };
      group.rows.push(row);
      map.set(key, group);
    }
    return [...map.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title));
  }, [grouping, sections.sessions]);

  useFlip(listRef);

  if (visible.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-[13px] text-muted">
        <Sparkles className="size-5 text-faint" />
        {filter === null
          ? "No sessions yet. Start one from the canvas."
          : "No sessions in this project."}
      </div>
    );
  }

  return (
    <div ref={listRef} className="fade-y no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {sections.pinned.length > 0 ? (
        <>
          <SectionHeader open={pinnedOpen} onToggle={() => setPinnedOpen(!pinnedOpen)}>
            Pinned
          </SectionHeader>
          {pinnedOpen
            ? sections.pinned.map((row) => <SessionRowItem key={row.key} row={row} />)
            : null}
          <SectionHeader>Sessions</SectionHeader>
        </>
      ) : null}
      {groups
        ? groups.map(([key, group]) => (
            <div key={key}>
              <SectionHeader>{group.title}</SectionHeader>
              {group.rows.map((row) => (
                <SessionRowItem key={row.key} row={row} hideProject />
              ))}
            </div>
          ))
        : sections.sessions.map((row) => <SessionRowItem key={row.key} row={row} />)}
    </div>
  );
}

function SectionHeader({
  children,
  open,
  onToggle,
}: {
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!onToggle}
      className="flex w-full items-center justify-between px-2 pt-3 pb-1 text-[11.5px] font-medium text-faint enabled:hover:text-muted"
    >
      {children}
      {onToggle ? (
        <ChevronDown
          className={cn("size-3 transition-transform duration-200", !open && "-rotate-90")}
        />
      ) : null}
    </button>
  );
}

function SessionRowItem({
  row,
  hideProject = false,
}: {
  readonly row: SessionRow;
  readonly hideProject?: boolean;
}) {
  const now = useNow();
  const active = useActiveThreadRef();
  const openThread = useOpenThread();
  const actions = useThreadActions();
  const provider = useProviderInstance(
    row.shell.environmentId,
    row.shell.modelSelection.instanceId,
  );
  const [renaming, setRenaming] = useState(false);
  const isActive =
    active?.environmentId === row.shell.environmentId && active.threadId === row.shell.id;
  const pullRequest = row.shell.linkedPullRequest ?? row.shell.branchPullRequest ?? null;
  const ref = { environmentId: row.shell.environmentId, threadId: row.shell.id };

  const menuItems = (
    <>
      <MenuItem icon={<Pencil className="size-3.5" />} onClick={() => setRenaming(true)}>
        Rename
      </MenuItem>
      <MenuItem
        icon={<Sparkles className="size-3.5" />}
        onClick={() => void actions.regenerateTitle(row.shell)}
      >
        Regenerate title
      </MenuItem>
      <MenuItem
        icon={
          row.shell.pinnedAt === null ? (
            <Pin className="size-3.5" />
          ) : (
            <PinOff className="size-3.5" />
          )
        }
        onClick={() => void actions.togglePin(row.shell)}
      >
        {row.shell.pinnedAt === null ? "Pin" : "Unpin"}
      </MenuItem>
      <MenuItem
        icon={<EyeOff className="size-3.5" />}
        onClick={() => void actions.markUnread(row.shell)}
      >
        Mark unread
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<Archive className="size-3.5" />}
        onClick={() => void actions.archive(row.shell)}
      >
        Archive
      </MenuItem>
      <MenuItem
        danger
        icon={<Trash2 className="size-3.5" />}
        onClick={() => void actions.remove(row.shell)}
      >
        Delete…
      </MenuItem>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        data-flip-key={row.key}
        className={cn(
          "group relative mb-0.5 block rounded-xl px-2.5 py-2 transition-colors duration-150",
          isActive ? "bg-active" : "hover:bg-hover",
        )}
      >
        <button
          type="button"
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          aria-label={row.shell.title}
          aria-current={isActive ? "page" : undefined}
          onClick={(event) => {
            if (event.detail > 1) return;
            openThread(ref);
          }}
          onDoubleClick={() => setRenaming(true)}
        />
        <div className="pointer-events-none relative flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] text-faint">
            {hideProject
              ? row.environmentLabel
              : `${row.project?.title ?? "Project"} @ ${row.environmentLabel}`}
          </span>
          <span className="group-hover:invisible">
            <StatusGlyph status={row.status} age={relativeAge(row.activityAt, now)} />
          </span>
        </div>
        <div className="pointer-events-none relative mt-0.5 flex items-center gap-2">
          <ProviderIcon provider={provider} size="sm" />
          {renaming ? (
            <input
              autoFocus
              defaultValue={row.shell.title}
              className="pointer-events-auto min-w-0 flex-1 rounded-md bg-sunken px-1 text-[13.5px] outline-none ring-1 ring-accent/60"
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") setRenaming(false);
              }}
              onBlur={(event) => {
                setRenaming(false);
                void actions.rename(row.shell, event.currentTarget.value);
              }}
            />
          ) : (
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13.5px]",
                row.unread || row.status === "approval" || row.status === "input"
                  ? "font-semibold text-fg"
                  : "text-fg/90",
              )}
            >
              {row.shell.title}
            </span>
          )}
        </div>
        {row.shell.branch || pullRequest ? (
          <div className="pointer-events-none relative mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
            {row.shell.branch ? (
              <>
                <GitBranch className="size-3 shrink-0" />
                <span className="min-w-0 truncate">{row.shell.branch}</span>
              </>
            ) : null}
            {pullRequest ? (
              <span className="ml-auto shrink-0 rounded-md bg-success/12 px-1.5 py-px font-medium text-success">
                #{pullRequest.number}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="absolute top-1.5 right-1.5 hidden group-hover:block">
          <Menu>
            <MenuTrigger
              render={
                <Button size="icon-sm" variant="ghost" aria-label="Session actions">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              }
            />
            <MenuPopup align="end" className="w-48">
              {menuItems}
            </MenuPopup>
          </Menu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuPopup className="w-48">{menuItems}</ContextMenuPopup>
    </ContextMenu>
  );
}

function ArchivedList() {
  const environmentIds = useAtomValue(enabledEnvironmentIdsAtom);
  return (
    <div className="fade-y no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {environmentIds.map((environmentId) => (
        <ArchivedEnvironment key={environmentId} environmentId={environmentId} />
      ))}
    </div>
  );
}

function ArchivedEnvironment({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const query = useEnvironmentQuery(
    orchestrationEnvironment.archivedShellSnapshot({ environmentId, input: {} }),
  );
  const actions = useThreadActions();
  const now = useNow();
  const projects = new Map(
    (query.data?.projects ?? []).map((project) => [project.id, project.title]),
  );
  const threads = [...(query.data?.threads ?? [])]
    .map((thread) => presentThreadShell(environmentId, thread))
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));

  if (query.isPending && query.data === null) {
    return <div className="px-2 py-3 text-xs text-faint">Loading archived sessions…</div>;
  }
  if (query.error) return <div className="px-2 py-3 text-xs text-danger">{query.error}</div>;
  if (threads.length === 0) {
    return <div className="px-2 py-3 text-xs text-faint">No archived sessions.</div>;
  }
  return (
    <>
      {threads.map((thread) => (
        <div
          key={thread.id}
          className="group mb-0.5 flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-hover"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] text-faint">
              {projects.get(thread.projectId) ?? "Project"} · archived{" "}
              {relativeAge(thread.archivedAt, now)}
            </div>
            <div className="truncate text-[13px] text-fg/80">{thread.title}</div>
          </div>
          <Tooltip label="Unarchive">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Unarchive"
              onClick={async () => {
                await actions.unarchive(thread);
                query.refresh();
              }}
            >
              <ArchiveRestore className="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip label="Delete">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete"
              onClick={async () => {
                await actions.remove(thread);
                query.refresh();
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      ))}
    </>
  );
}
