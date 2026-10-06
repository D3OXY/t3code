import { threadRuntimeCanArchive } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

import { useCloseTab } from "~/lib/navigation";
import { confirmAction } from "~/stores/confirm";
import { showToast } from "~/stores/toasts";
import { threadEnvironment } from "./atoms";
import { commandFailureMessage, useAtomCommand } from "./hooks";

/** Row-level thread actions shared by the sidebar, tabs and command palette. */
export function useThreadActions() {
  const rename = useAtomCommand(threadEnvironment.updateMetadata);
  const pin = useAtomCommand(threadEnvironment.pin);
  const unpin = useAtomCommand(threadEnvironment.unpin);
  const markUnread = useAtomCommand(threadEnvironment.markUnread);
  const archive = useAtomCommand(threadEnvironment.archive);
  const unarchive = useAtomCommand(threadEnvironment.unarchive);
  const remove = useAtomCommand(threadEnvironment.delete);
  const closeTab = useCloseTab();

  const report = (result: Parameters<typeof commandFailureMessage>[0]) => {
    const message = commandFailureMessage(result);
    if (message) showToast(message);
    return result._tag === "Success";
  };

  type Target = Pick<
    EnvironmentThreadShell,
    "environmentId" | "id" | "title" | "pinnedAt" | "runtime"
  >;
  const ref = (thread: Target) => ({
    environmentId: thread.environmentId,
    input: { threadId: thread.id },
  });

  return {
    rename: async (thread: Target, title: string) => {
      const trimmed = title.trim();
      if (trimmed === "" || trimmed === thread.title) return;
      report(
        await rename({
          environmentId: thread.environmentId,
          input: { threadId: thread.id, title: trimmed },
        }),
      );
    },
    regenerateTitle: async (thread: Target) => {
      report(
        await rename({
          environmentId: thread.environmentId,
          input: { threadId: thread.id, regenerateTitle: true },
        }),
      );
    },
    togglePin: async (thread: Target) => {
      report(await (thread.pinnedAt === null ? pin(ref(thread)) : unpin(ref(thread))));
    },
    markUnread: async (thread: Target) => report(await markUnread(ref(thread))),
    archive: async (thread: Target) => {
      if (!threadRuntimeCanArchive(thread.runtime)) {
        showToast("Stop the running turn before archiving this session.");
        return;
      }
      if (report(await archive(ref(thread)))) {
        closeTab({ environmentId: thread.environmentId, threadId: thread.id });
      }
    },
    unarchive: async (thread: Target) => report(await unarchive(ref(thread))),
    remove: async (thread: Target) => {
      const confirmed = await confirmAction({
        title: "Delete session?",
        description: `“${thread.title}” and its history will be permanently deleted.`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!confirmed) return;
      if (report(await remove(ref(thread)))) {
        closeTab({ environmentId: thread.environmentId, threadId: thread.id });
      }
    },
  };
}
