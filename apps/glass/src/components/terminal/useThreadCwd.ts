import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { projectScriptCwd } from "@t3tools/shared/projectScripts";
import { Atom } from "effect/reactivity";

import { environmentProjects, environmentThreadShells } from "~/state/atoms";
import type { ThreadTab } from "~/stores/tabs";

const NO_PROJECT = Atom.make<EnvironmentProject | null>(null);

/**
 * Where a thread's tools run: its worktree when it has one, else the project
 * root. `cwd` is null until the thread shell and project have loaded.
 */
export function useThreadCwd(threadRef: ThreadTab): {
  readonly cwd: string | null;
  readonly worktreePath: string | null;
} {
  const shell = useAtomValue(environmentThreadShells.threadShellAtom(threadRef));
  const project = useAtomValue(
    shell === null
      ? NO_PROJECT
      : environmentProjects.projectAtom({
          environmentId: threadRef.environmentId,
          projectId: shell.projectId,
        }),
  );
  const worktreePath = shell?.worktreePath ?? null;
  return {
    cwd:
      project === null
        ? worktreePath
        : projectScriptCwd({ project: { cwd: project.workspaceRoot }, worktreePath }),
    worktreePath,
  };
}
