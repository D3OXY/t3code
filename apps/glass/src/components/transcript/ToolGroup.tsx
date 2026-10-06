import {
  resolveWorkEntryToolPresentation,
  summarizeToolGroup,
  toolGroupAction,
  toolGroupSummaryKind,
  workEntryDisplayIndicatesToolFailure,
  type ToolGroupSummaryKind,
  type WorkLogPresentationEntry,
} from "@t3tools/client-runtime/work-log/presentation";
import { turnItemHasDetail } from "@t3tools/client-runtime/work-log/item-detail";
import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import {
  AppWindow,
  Bot,
  Brain,
  ChevronRight,
  CircleAlert,
  Eye,
  FileText,
  Link2,
  Globe,
  Hammer,
  MessageCircle,
  Search,
  Smartphone,
  Sparkles,
  SquarePen,
  SquareTerminal,
  Unlink2,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { memo, useMemo } from "react";

import { PullRequestGlyph } from "~/components/ui/PullRequestGlyph";
import { WorkingCells } from "~/components/ui/WorkingCells";
import { cn } from "~/lib/cn";
import { useDisclosure, useTranscript } from "./context";
import { countDiffLines } from "./lineDiff";
import { ReasoningRow } from "./Reasoning";
import { fileChangeLines, ToolDetail } from "./ToolDetail";
import { toolRowText, toolWorkEntry } from "./toolEntry";
import type { TranscriptRow } from "./transcriptRows";

const KIND_ICONS: Record<ToolGroupSummaryKind, LucideIcon> = {
  "pull-request": PullRequestGlyph.pullRequest,
  "link-pr": Link2,
  "unlink-pr": Unlink2,
  "list-prs": PullRequestGlyph.pullRequest,
  "watch-pr": PullRequestGlyph.pullRequest,
  "unwatch-pr": PullRequestGlyph.pullRequest,
  read: Eye,
  edit: SquarePen,
  command: SquareTerminal,
  "thread-create": Sparkles,
  browser: AppWindow,
  device: Smartphone,
  search: Globe,
  "code-search": Search,
  other: Wrench,
  update: Hammer,
  "dynamic-tool": Hammer,
  reasoning: Brain,
  "agent-tool": Bot,
  "tone-tool": Zap,
  mixed: Hammer,
};

/** Draws an icon chosen at render time. */
function Glyph({
  icon: Icon,
  className,
}: {
  readonly icon: LucideIcon;
  readonly className: string;
}) {
  return <Icon className={className} />;
}

const T3_ICONS = {
  "t3-code": Sparkles,
  browser: AppWindow,
  device: Smartphone,
  "pull-request": PullRequestGlyph.pullRequest,
};

function toolIcon(item: OrchestrationV2TurnItem, entry: WorkLogPresentationEntry): LucideIcon {
  if (item.type === "notification") {
    if (item.outcome === "failed") return CircleAlert;
    switch (item.source.kind) {
      case "subagent":
      case "delegated_task":
        return Bot;
      case "command":
        return SquareTerminal;
      case "monitor":
        return Eye;
      default:
        return Zap;
    }
  }
  const presentation = resolveWorkEntryToolPresentation(entry);
  if (presentation) return T3_ICONS[presentation.icon];
  if (item.type === "approval_request" || item.type === "user_input_request") return MessageCircle;
  const action = toolGroupAction(entry);
  if (action === "read") return FileText;
  return KIND_ICONS[action];
}

const isLive = (item: OrchestrationV2TurnItem) =>
  item.status === "running" || item.status === "pending" || item.status === "waiting";

/** One tool call: icon, label and a one-line detail, expanding to its full detail. */
const ToolItemRow = memo(function ToolItemRow({
  item,
}: {
  readonly item: OrchestrationV2TurnItem;
}) {
  const { workspaceRoot } = useTranscript();
  const [open, toggle] = useDisclosure(`tool:${item.id}`);
  const entry = useMemo(() => toolWorkEntry(item), [item]);
  const text = toolRowText(item, entry, workspaceRoot);
  const failed = workEntryDisplayIndicatesToolFailure(entry);
  const icon = toolIcon(item, entry);
  const counts = useMemo(() => {
    if (item.type !== "file_change") return null;
    if (item.additions !== undefined || item.deletions !== undefined) {
      return { additions: item.additions ?? 0, deletions: item.deletions ?? 0 };
    }
    return countDiffLines(fileChangeLines(item));
  }, [item]);
  const expandable = turnItemHasDetail(item);

  return (
    <div>
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={toggle}
        className="group/tool flex w-full min-w-0 items-center gap-2 rounded-md py-[3px] text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <Glyph
          icon={icon}
          className={cn("size-3.5 shrink-0", failed ? "text-danger" : "text-faint")}
        />
        <span
          className={cn(
            "shrink-0 transition-colors",
            failed ? "text-danger" : "text-muted",
            expandable && !failed && "group-hover/tool:text-fg",
          )}
        >
          {text.label}
        </span>
        {text.detail ? (
          <span className={cn("min-w-0 truncate text-faint", text.mono && "font-mono text-[12px]")}>
            {text.detail}
          </span>
        ) : null}
        {counts && (counts.additions > 0 || counts.deletions > 0) ? (
          <span className="shrink-0 font-mono text-[11px] tabular-nums">
            <span className="text-success">+{counts.additions}</span>{" "}
            <span className="text-danger">−{counts.deletions}</span>
          </span>
        ) : null}
        {isLive(item) ? <WorkingCells size="xs" className="ml-0.5 text-faint" /> : null}
        {expandable ? (
          <ChevronRight
            className={cn(
              "ml-auto size-3.5 shrink-0 text-faint opacity-0 transition-[opacity,transform] duration-150 group-hover/tool:opacity-100",
              open && "rotate-90 opacity-100",
            )}
          />
        ) : null}
      </button>
      {open && expandable ? (
        <div className="mt-1 mb-2 ml-[22px]">
          <ToolDetail item={item} />
        </div>
      ) : null}
    </div>
  );
});

function GroupEntry({ item }: { readonly item: OrchestrationV2TurnItem }) {
  return item.type === "reasoning" ? (
    <ReasoningRow item={item} compact />
  ) : (
    <ToolItemRow item={item} />
  );
}

/**
 * Consecutive tool calls under one summary line ("Ran 3 commands and changed
 * 2 files"). The trailing group stays open while the run streams; a click pins
 * it open or closed. A lone call renders as its own row.
 */
export function ToolGroup({ row }: { readonly row: Extract<TranscriptRow, { kind: "tools" }> }) {
  const { running, trailingGroupId } = useTranscript();
  const [open, toggle] = useDisclosure(row.id, running && trailingGroupId === row.id);
  const entries = useMemo(() => row.rows.map((projected) => toolWorkEntry(projected.item)), [row]);
  const summary = useMemo(() => summarizeToolGroup(entries), [entries]);
  const kind = useMemo(() => toolGroupSummaryKind(entries), [entries]);
  const inherited = row.rows[0]?.visibility === "inherited";
  const tools = row.rows.filter((projected) => projected.item.type !== "reasoning");

  if (tools.length === 1 && row.rows.length === 1) {
    return (
      <div className={cn("py-1", inherited && "opacity-60")}>
        <ToolItemRow item={tools[0]!.item} />
      </div>
    );
  }

  const Icon = KIND_ICONS[kind];
  const live = row.rows.some((projected) => isLive(projected.item));
  return (
    <div className={cn("py-1", inherited && "opacity-60")}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="group/group flex max-w-full items-center gap-2 py-1 text-left text-[13px] text-muted transition-colors outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <Icon
          className={cn("size-3.5 shrink-0", summary.hasFailure ? "text-danger" : "text-faint")}
        />
        <span className="min-w-0 truncate">{summary.summary}</span>
        {live ? <WorkingCells size="xs" className="text-faint" /> : null}
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-faint opacity-0 transition-[opacity,transform] duration-150 group-hover/group:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
      </button>
      {open ? (
        <div className="mt-0.5 ml-[7px] border-l border-line pl-[15px]">
          {row.rows.map((projected) => (
            <GroupEntry key={projected.sourceItemId} item={projected.item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
