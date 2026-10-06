import { useAtomValue } from "@effect/atom-react";
import {
  findExistingAddProject,
  resolveAddProjectPath,
} from "@t3tools/client-runtime/operations/projects";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { ProjectId, type EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "~/components/ui/Button";
import { Dialog, DialogPopup } from "~/components/ui/Dialog";
import { Segmented } from "~/components/ui/Segmented";
import { environmentPresentations, environmentProjects, projectEnvironment } from "~/state/atoms";
import { commandFailureMessage, useAtomCommand } from "~/state/hooks";
import { randomUUID } from "./ids";

/**
 * Adds a project by absolute path on a connected environment's machine. An
 * already-added folder is selected instead of duplicated. `onAdded` receives
 * the project's environment and id.
 */
export function AddProjectDialog({
  open,
  onOpenChange,
  environmentIds,
  defaultEnvironmentId,
  onAdded,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentIds: ReadonlyArray<EnvironmentId>;
  readonly defaultEnvironmentId: EnvironmentId | null;
  readonly onAdded: (project: {
    readonly environmentId: EnvironmentId;
    readonly projectId: ProjectId;
  }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <AddProjectForm
          environmentIds={environmentIds}
          defaultEnvironmentId={defaultEnvironmentId}
          onAdded={(project) => {
            onAdded(project);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function AddProjectForm({
  environmentIds,
  defaultEnvironmentId,
  onAdded,
  onCancel,
}: {
  readonly environmentIds: ReadonlyArray<EnvironmentId>;
  readonly defaultEnvironmentId: EnvironmentId | null;
  readonly onAdded: (project: {
    readonly environmentId: EnvironmentId;
    readonly projectId: ProjectId;
  }) => void;
  readonly onCancel: () => void;
}) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const projects = useAtomValue(environmentProjects.projectsAtom);
  const createProject = useAtomCommand(projectEnvironment.create);
  const [environmentId, setEnvironmentId] = useState(
    defaultEnvironmentId ?? environmentIds[0] ?? null,
  );
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const presentation = environmentId ? presentations.get(environmentId) : undefined;
  const label = presentation?.entry.target.label ?? "this environment";
  const connected = presentation?.connection.phase === "connected";

  const submit = async () => {
    if (!environmentId || busy) return;
    const resolved = resolveAddProjectPath({
      rawPath: path,
      platform: presentation?.serverConfig?.environment.platform.os ?? "",
    });
    if (!resolved.ok) {
      setError(resolved.error);
      return;
    }
    const existing: EnvironmentProject | null = findExistingAddProject({
      projects,
      environmentId,
      path: resolved.path,
    });
    if (existing) {
      onAdded({ environmentId, projectId: existing.id });
      return;
    }
    setBusy(true);
    setError(null);
    const projectId = ProjectId.make(randomUUID());
    const result = await createProject({
      environmentId,
      input: {
        projectId,
        title: inferProjectTitleFromPath(resolved.path),
        workspaceRoot: resolved.path,
        createWorkspaceRootIfMissing: false,
        defaultModelSelection: null,
      },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      setError(commandFailureMessage(result) ?? "The project wasn't added.");
      return;
    }
    onAdded({ environmentId, projectId });
  };

  return (
    <DialogPopup
      title="Add project"
      description={`A folder on ${label}. Sessions run inside it.`}
      size="md"
    >
      <form
        className="flex flex-col gap-3 p-5 pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {environmentIds.length > 1 && environmentId ? (
          <Segmented
            value={environmentId}
            onChange={(next) => {
              setEnvironmentId(next);
              setError(null);
            }}
            options={environmentIds.map((id) => ({
              value: id,
              label: presentations.get(id)?.entry.target.label ?? id,
            }))}
          />
        ) : null}
        <input
          autoFocus
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setError(null);
          }}
          placeholder="/Users/you/code/my-app"
          aria-label="Project path"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="h-9 rounded-xl border border-line bg-transparent px-3 font-mono text-[13px] outline-none placeholder:text-faint focus:border-line-strong"
        />
        {error ? <div className="text-[12.5px] text-danger">{error}</div> : null}
        {!connected && environmentId ? (
          <div className="text-[12.5px] text-warning">{label} isn't connected right now.</div>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || path.trim() === "" || !connected}
          >
            {busy ? "Adding…" : "Add project"}
          </Button>
        </div>
      </form>
    </DialogPopup>
  );
}
