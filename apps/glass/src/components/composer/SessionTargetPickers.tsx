import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentPresentation } from "@t3tools/client-runtime/connection";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, VcsRef } from "@t3tools/contracts";
import {
  Check,
  ChevronDown,
  Folder,
  FolderGit2,
  GitBranch,
  Monitor,
  Plus,
  Search,
} from "lucide-react";
import { type KeyboardEvent, type ReactNode, useDeferredValue, useState } from "react";

import {
  Menu,
  MenuItem,
  MenuLabel,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/Menu";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/Popover";
import { cn } from "~/lib/cn";
import { basename } from "~/lib/format";
import { environmentPresentations, vcsEnvironment } from "~/state/atoms";
import { commandFailureMessage, useAtomCommand, useEnvironmentQuery } from "~/state/hooks";
import type { CheckoutMode } from "~/stores/drafts";
import { showToast } from "~/stores/toasts";

const PHASE_DOT: Record<string, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  reconnecting: "bg-warning",
  error: "bg-danger",
  unsupported: "bg-danger",
};

const TRIGGER_CLASS =
  "flex h-7 max-w-64 min-w-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted outline-none transition-colors duration-150 hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 data-[popup-open]:bg-hover data-[popup-open]:text-fg disabled:pointer-events-none disabled:opacity-50";

function TriggerContent({ icon, label }: { readonly icon: ReactNode; readonly label: ReactNode }) {
  return (
    <>
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3 shrink-0 text-faint" />
    </>
  );
}

/** A search field for picker popovers; arrow keys and Enter are handled by the caller. */
function PickerSearch({
  value,
  onChange,
  placeholder,
  onKeyDown,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex h-9 items-center gap-2 border-b border-line px-3 text-muted focus-within:text-fg">
      <Search className="size-3.5 shrink-0" />
      <input
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint"
      />
    </label>
  );
}

/** Moves a highlight through a list with arrow keys and picks with Enter. */
function useListKeyboard<T>(items: ReadonlyArray<T>, onPick: (item: T) => void) {
  const [highlight, setHighlight] = useState(0);
  const clamped = Math.min(highlight, Math.max(items.length - 1, 0));
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((clamped + step + items.length) % items.length);
    } else if (event.key === "Enter") {
      const item = items[clamped];
      if (item !== undefined) {
        event.preventDefault();
        onPick(item);
      }
    }
  };
  return { highlight: clamped, setHighlight, onKeyDown };
}

/**
 * Searchable project list across every enabled environment, grouped by
 * environment when there is more than one, with "Add project…" at the end.
 */
export function ProjectPicker({
  projects,
  selected,
  onSelect,
  onAddProject,
}: {
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly selected: EnvironmentProject | null;
  readonly onSelect: (project: EnvironmentProject) => void;
  readonly onAddProject: () => void;
}) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = projects
    .filter(
      (project) =>
        needle === "" ||
        project.title.toLowerCase().includes(needle) ||
        project.workspaceRoot.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.title.localeCompare(b.title));
  const environmentIds = [...new Set(projects.map((project) => project.environmentId))];
  const grouped = environmentIds.length > 1;
  // Keyboard order must follow display order, which groups by environment.
  const ordered = grouped
    ? environmentIds.flatMap((id) => matches.filter((project) => project.environmentId === id))
    : matches;
  const pick = (project: EnvironmentProject) => {
    onSelect(project);
    setOpen(false);
  };
  const keyboard = useListKeyboard(ordered, pick);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger className={TRIGGER_CLASS} aria-label="Project">
        <TriggerContent
          icon={<Folder className="size-3.5" />}
          label={selected?.title ?? "Choose project"}
        />
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-[min(20rem,calc(100vw-2rem))]">
        <PickerSearch
          value={query}
          onChange={(value) => {
            setQuery(value);
            keyboard.setHighlight(0);
          }}
          placeholder="Search projects…"
          onKeyDown={keyboard.onKeyDown}
        />
        <div className="max-h-72 overflow-y-auto p-1" role="listbox" aria-label="Projects">
          {ordered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12.5px] text-faint">No projects match.</div>
          ) : null}
          {ordered.map((project, index) => {
            const showHeader =
              grouped && ordered[index - 1]?.environmentId !== project.environmentId;
            const isSelected =
              project.id === selected?.id && project.environmentId === selected.environmentId;
            return (
              <div key={`${project.environmentId}:${project.id}`}>
                {showHeader ? (
                  <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-faint">
                    {presentations.get(project.environmentId)?.entry.target.label ?? "Environment"}
                  </div>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => keyboard.setHighlight(index)}
                  onClick={() => pick(project)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none",
                    index === keyboard.highlight && "bg-active",
                  )}
                >
                  <Folder className="size-3.5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">{project.title}</span>
                    <span className="block truncate text-[11px] text-faint">
                      {project.workspaceRoot}
                    </span>
                  </span>
                  {isSelected ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-line p-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddProject();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] outline-none hover:bg-hover focus-visible:bg-hover"
          >
            <Plus className="size-3.5 text-muted" />
            Add project…
          </button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}

/** The environment a session runs on. Picking another one moves to its projects. */
export function EnvironmentPicker({
  presentations,
  selectedId,
  onSelect,
}: {
  readonly presentations: ReadonlyArray<readonly [EnvironmentId, EnvironmentPresentation]>;
  readonly selectedId: EnvironmentId | null;
  readonly onSelect: (environmentId: EnvironmentId) => void;
}) {
  const selected = presentations.find(([id]) => id === selectedId)?.[1] ?? null;
  const label = selected?.entry.target.label ?? "Environment";
  if (presentations.length <= 1) {
    return (
      <span className="flex h-7 min-w-0 items-center gap-1.5 px-2 text-[12.5px] text-muted">
        <Monitor className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <Menu>
      <MenuTrigger className={TRIGGER_CLASS} aria-label="Environment">
        <TriggerContent icon={<Monitor className="size-3.5" />} label={label} />
      </MenuTrigger>
      <MenuPopup align="end" className="w-56">
        <MenuLabel>Environment</MenuLabel>
        {presentations.map(([id, presentation]) => (
          <MenuItem
            key={id}
            onClick={() => onSelect(id)}
            icon={
              <span
                className={cn(
                  "size-2 rounded-full",
                  PHASE_DOT[presentation.connection.phase] ?? "bg-faint",
                )}
              />
            }
            shortcut={id === selectedId ? "✓" : undefined}
          >
            {presentation.entry.target.label}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

/** "Current checkout" or "New worktree"; worktrees need a git repository. */
export function CheckoutPicker({
  value,
  isRepo,
  worktreePath,
  onChange,
}: {
  readonly value: CheckoutMode;
  readonly isRepo: boolean;
  /** An existing worktree the session will reuse, shown instead of "Current checkout". */
  readonly worktreePath: string | null;
  readonly onChange: (mode: CheckoutMode) => void;
}) {
  const label =
    value === "worktree"
      ? "New worktree"
      : worktreePath
        ? `Worktree · ${basename(worktreePath)}`
        : "Current checkout";
  return (
    <Menu>
      <MenuTrigger className={TRIGGER_CLASS} aria-label="Checkout">
        <TriggerContent
          icon={
            value === "worktree" || worktreePath ? (
              <FolderGit2 className="size-3.5" />
            ) : (
              <Folder className="size-3.5" />
            )
          }
          label={label}
        />
      </MenuTrigger>
      <MenuPopup align="start" className="w-64">
        <MenuItem
          icon={<Folder className="size-3.5" />}
          onClick={() => onChange("current")}
          shortcut={value === "current" ? "✓" : undefined}
        >
          Current checkout
        </MenuItem>
        <MenuItem
          icon={<FolderGit2 className="size-3.5" />}
          onClick={() => onChange("worktree")}
          disabled={!isRepo}
          shortcut={value === "worktree" ? "✓" : undefined}
        >
          New worktree
        </MenuItem>
        {!isRepo ? (
          <>
            <MenuSeparator />
            <div className="px-2 py-1 text-[11.5px] text-faint">
              Worktrees need a git repository.
            </div>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}

/**
 * Branch search for the session's starting point. For a new worktree it picks
 * the base branch; for the current checkout it switches the checkout, or reuses
 * a branch's existing worktree.
 */
export function BranchPicker({
  environmentId,
  cwd,
  mode,
  label,
  onPick,
}: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly mode: CheckoutMode;
  readonly label: string | null;
  /** Worktree mode: a base branch. Current mode: the ref to switch to or reuse. */
  readonly onPick: (ref: VcsRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const refs = useEnvironmentQuery(
    open
      ? vcsEnvironment.listRefs({
          environmentId,
          input: {
            cwd,
            limit: 60,
            refKind: mode === "worktree" ? "all" : "local",
            ...(deferredQuery === "" ? {} : { query: deferredQuery }),
          },
        })
      : null,
  );
  const items = refs.data?.refs ?? [];
  const pick = (ref: VcsRef) => {
    onPick(ref);
    setOpen(false);
  };
  const keyboard = useListKeyboard(items, pick);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger
        className={TRIGGER_CLASS}
        aria-label={mode === "worktree" ? "Base branch" : "Branch"}
      >
        <TriggerContent
          icon={<GitBranch className="size-3.5" />}
          label={label ? (mode === "worktree" ? `from ${label}` : label) : "Branch"}
        />
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-[min(22rem,calc(100vw-2rem))]">
        <PickerSearch
          value={query}
          onChange={(value) => {
            setQuery(value);
            keyboard.setHighlight(0);
          }}
          placeholder={mode === "worktree" ? "Base branch…" : "Switch branch…"}
          onKeyDown={keyboard.onKeyDown}
        />
        <div className="max-h-72 overflow-y-auto p-1" role="listbox" aria-label="Branches">
          {refs.error ? (
            <div className="px-3 py-4 text-center text-[12.5px] text-danger">{refs.error}</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12.5px] text-faint">
              {refs.isPending ? "Loading branches…" : "No branches match."}
            </div>
          ) : (
            items.map((ref, index) => {
              const isSelected = ref.name === label;
              return (
                <button
                  key={`${ref.isRemote ? "remote" : "local"}:${ref.name}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => keyboard.setHighlight(index)}
                  onClick={() => pick(ref)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none",
                    index === keyboard.highlight && "bg-active",
                  )}
                >
                  <GitBranch className="size-3.5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
                    {ref.name}
                  </span>
                  {ref.isDefault ? <RefBadge>default</RefBadge> : null}
                  {ref.current ? <RefBadge>current</RefBadge> : null}
                  {ref.worktreePath && !ref.current ? <RefBadge>worktree</RefBadge> : null}
                  {isSelected ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function RefBadge({ children }: { readonly children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-md border border-line px-1.5 text-[10.5px] leading-4 text-faint">
      {children}
    </span>
  );
}

/** Switches the project checkout to a branch; resolves true once it moved. */
export function useSwitchBranch() {
  const switchRef = useAtomCommand(vcsEnvironment.switchRef);
  return async (environmentId: EnvironmentId, cwd: string, ref: VcsRef) => {
    const result = await switchRef({ environmentId, input: { cwd, refName: ref.name } });
    const message = commandFailureMessage(result);
    if (message) showToast(`Couldn't switch to ${ref.name}: ${message}`);
    return result._tag === "Success";
  };
}
