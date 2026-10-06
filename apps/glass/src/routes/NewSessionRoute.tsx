import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentPresentation } from "@t3tools/client-runtime/connection";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_SERVER_SETTINGS,
  MessageId,
  ThreadId,
  type EnvironmentId,
  type VcsRef,
} from "@t3tools/contracts";
import { truncate } from "@t3tools/shared/String";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { FolderPlus } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

import { AddProjectDialog } from "~/components/composer/AddProjectDialog";
import { resolveTurnAttachments } from "~/components/composer/attachments";
import { ComposerCard, type ComposerSubmission } from "~/components/composer/ComposerCard";
import { randomUUID } from "~/components/composer/ids";
import { ModeMenu } from "~/components/composer/ModeMenu";
import { ModelPicker } from "~/components/composer/ModelPicker";
import {
  providerUnavailableReason,
  resolveDefaultModelSelection,
} from "~/components/composer/modelSelection";
import {
  BranchPicker,
  CheckoutPicker,
  EnvironmentPicker,
  ProjectPicker,
  useSwitchBranch,
} from "~/components/composer/SessionTargetPickers";
import { AgentPill } from "~/components/shell/AgentPill";
import { Button } from "~/components/ui/Button";
import { useEnvironmentProviders } from "~/components/ui/ProviderIcon";
import { useOpenThread } from "~/lib/navigation";
import {
  enabledEnvironmentIdsAtom,
  environmentPresentations,
  environmentProjects,
  environmentShell,
  primaryEnvironmentIdAtom,
  threadEnvironment,
  vcsEnvironment,
} from "~/state/atoms";
import { commandFailureMessage, useAtomCommand, useEnvironmentQuery } from "~/state/hooks";
import { appAtomRegistry } from "~/state/registry";
import { projectKeyOf, sessionRowsAtom } from "~/state/sessions";
import { useComposerPrefs } from "~/stores/composerPrefs";
import {
  NEW_SESSION_DRAFT_KEY,
  useDraftSettings,
  useDrafts,
  type CheckoutMode,
} from "~/stores/drafts";
import { useLayout } from "~/stores/layout";

// True once an environment's shell snapshot has loaded, so "no projects" is
// not shown while projects are still arriving. A boolean, so it only notifies
// when loading finishes rather than on every shell event.
const snapshotLoadedAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) => Option.isSome(get(environmentShell.stateValueAtom(environmentId)).snapshot)),
);
const NOT_LOADED = Atom.make(false);

/**
 * Where a fresh session starts when the draft has not picked a project: the
 * sidebar's project filter, else the project of the most recent session, else
 * the first project alphabetically.
 */
function defaultProject(projects: ReadonlyArray<EnvironmentProject>): EnvironmentProject | null {
  const byKey = new Map(
    projects.map((project) => [projectKeyOf(project.environmentId, project.id), project]),
  );
  const filtered = useLayout.getState().projectFilter;
  if (filtered && byKey.has(filtered)) return byKey.get(filtered) ?? null;
  const recent = [...appAtomRegistry.get(sessionRowsAtom)].sort((a, b) =>
    b.activityAt.localeCompare(a.activityAt),
  )[0];
  const recentProject = recent
    ? byKey.get(projectKeyOf(recent.shell.environmentId, recent.shell.projectId))
    : undefined;
  return recentProject ?? [...projects].sort((a, b) => a.title.localeCompare(b.title))[0] ?? null;
}

/**
 * The new-session canvas: the wallpaper is the hero and a single prompt card
 * sits a little above center, with the project and environment above it and
 * the checkout and branch below. Sending creates the thread (and worktree)
 * and opens it.
 */
export function NewSessionRoute() {
  const projects = useAtomValue(environmentProjects.projectsAtom);
  const presentationMap = useAtomValue(environmentPresentations.presentationsAtom);
  const enabledIds = useAtomValue(enabledEnvironmentIdsAtom);
  const primaryId = useAtomValue(primaryEnvironmentIdAtom);
  const draft = useDraftSettings(NEW_SESSION_DRAFT_KEY);
  const updateDraft = useDrafts((state) => state.update);
  const sticky = useComposerPrefs((state) => state.stickyModelSelection);
  const startTurn = useAtomCommand(threadEnvironment.startTurn);
  const openThread = useOpenThread();
  const switchBranch = useSwitchBranch();
  const [addOpen, setAddOpen] = useState(false);
  const [addEnvironmentId, setAddEnvironmentId] = useState<EnvironmentId | null>(null);
  // A just-added project is selected before the shell snapshot lists it.
  const [awaitedProjectKey, setAwaitedProjectKey] = useState<string | null>(null);

  const update = (patch: Parameters<typeof updateDraft>[1]) =>
    updateDraft(NEW_SESSION_DRAFT_KEY, patch);
  const presentations = enabledIds.flatMap(
    (id): Array<readonly [EnvironmentId, EnvironmentPresentation]> => {
      const presentation = presentationMap.get(id);
      return presentation ? [[id, presentation]] : [];
    },
  );

  const project =
    projects.find(
      (entry) =>
        entry.id === draft.project?.projectId &&
        entry.environmentId === draft.project.environmentId,
    ) ?? null;

  // Settle on a default project once projects arrive, and recover from a removed one.
  const settleProject = useEffectEvent(() => {
    const selectedKey = draft.project
      ? projectKeyOf(draft.project.environmentId, draft.project.projectId)
      : null;
    if (selectedKey !== null && selectedKey === awaitedProjectKey) return;
    const fallback = defaultProject(projects);
    if (fallback) {
      update({ project: { environmentId: fallback.environmentId, projectId: fallback.id } });
    }
  });
  useEffect(() => {
    if (project === null && projects.length > 0) settleProject();
  }, [project, projects]);

  const environmentId = project?.environmentId ?? primaryId;
  const presentation = environmentId ? presentationMap.get(environmentId) : undefined;
  const serverConfig = presentation?.serverConfig ?? null;
  const settings = serverConfig?.settings ?? DEFAULT_SERVER_SETTINGS;
  const projectOverrides = project ? settings.projectSettingsOverrides[project.id] : undefined;
  const snapshotLoaded = useAtomValue(primaryId ? snapshotLoadedAtom(primaryId) : NOT_LOADED);

  const providers = useEnvironmentProviders(environmentId);
  const draftProvider = draft.modelSelection
    ? providers.find((entry) => entry.instanceId === draft.modelSelection?.instanceId)
    : undefined;
  const modelSelection =
    draft.modelSelection && draftProvider && providerUnavailableReason(draftProvider) === null
      ? draft.modelSelection
      : resolveDefaultModelSelection(providers, [
          project?.defaultModelSelection,
          projectOverrides?.defaultModelSelection,
          settings.defaultModelSelection,
          sticky,
        ]);
  const provider =
    providers.find((entry) => entry.instanceId === modelSelection?.instanceId) ?? null;
  const runtimeMode =
    draft.runtimeMode ?? projectOverrides?.defaultRuntimeMode ?? settings.defaultRuntimeMode;
  const interactionMode = draft.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE;

  const vcsTarget = project
    ? { environmentId: project.environmentId, input: { cwd: project.workspaceRoot } }
    : null;
  const status = useEnvironmentQuery(vcsTarget ? vcsEnvironment.status(vcsTarget) : null);
  const branchRefs = useEnvironmentQuery(
    vcsTarget
      ? vcsEnvironment.listRefs({
          ...vcsTarget,
          input: { ...vcsTarget.input, limit: 100, refKind: "local" },
        })
      : null,
  );
  const isRepo = status.data?.isRepo ?? branchRefs.data?.isRepo ?? false;
  const preferredCheckout =
    draft.checkout ??
    ((project?.defaultThreadEnvMode ??
      projectOverrides?.defaultThreadEnvMode ??
      settings.defaultThreadEnvMode) === "worktree"
      ? "worktree"
      : "current");
  const checkout: CheckoutMode = isRepo ? preferredCheckout : "current";
  const currentBranch =
    status.data?.refName ?? branchRefs.data?.refs.find((entry) => entry.current)?.name ?? null;
  const defaultBranch = branchRefs.data?.refs.find((entry) => entry.isDefault)?.name ?? null;
  const reusedWorktree = checkout === "current" ? draft.worktreePath : null;
  const branch =
    checkout === "worktree"
      ? (draft.branch ?? defaultBranch ?? currentBranch)
      : reusedWorktree
        ? draft.branch
        : currentBranch;

  const blockedReason =
    project === null
      ? "Choose a project to start a session."
      : serverConfig === null
        ? "Waiting for the environment to connect."
        : modelSelection === null
          ? providers.length === 0
            ? "No providers are ready on this environment."
            : "Choose a model to start a session."
          : checkout === "worktree" && branch === null
            ? "Choose a base branch for the new worktree."
            : null;

  const onPickBranch = async (ref: VcsRef) => {
    if (!project) return;
    if (checkout === "worktree") {
      update({ branch: ref.name, worktreePath: null });
      return;
    }
    // A branch checked out in another worktree is reused rather than switched to.
    if (ref.worktreePath && ref.worktreePath !== project.workspaceRoot && !ref.current) {
      update({ branch: ref.name, worktreePath: ref.worktreePath });
      return;
    }
    update({ branch: null, worktreePath: null });
    if (!ref.current) await switchBranch(project.environmentId, project.workspaceRoot, ref);
  };

  const onSubmit = async ({ text, attachments }: ComposerSubmission) => {
    if (!project || !modelSelection || blockedReason) return blockedReason ?? "Choose a project.";
    let turnAttachments: Awaited<ReturnType<typeof resolveTurnAttachments>>;
    try {
      turnAttachments = await resolveTurnAttachments(project.environmentId, attachments);
    } catch (error) {
      return error instanceof Error ? error.message : "Attachments couldn't be sent.";
    }
    const first = attachments[0];
    const title = truncate(
      text.trim() ||
        (first ? `${first.kind === "image" ? "Image" : "File"}: ${first.name}` : "New session"),
    );
    const createdAt = new Date().toISOString();
    const threadId = ThreadId.make(randomUUID());
    const worktree = checkout === "worktree" && branch !== null;
    const result = await startTurn({
      environmentId: project.environmentId,
      input: {
        threadId,
        message: {
          messageId: MessageId.make(randomUUID()),
          role: "user",
          text,
          attachments: turnAttachments,
        },
        modelSelection,
        titleSeed: title,
        runtimeMode,
        interactionMode,
        bootstrap: {
          createThread: {
            projectId: project.id,
            title,
            modelSelection,
            runtimeMode,
            interactionMode,
            branch,
            worktreePath: worktree ? null : reusedWorktree,
            createdAt,
          },
          ...(worktree
            ? {
                prepareWorktree: {
                  projectCwd: project.workspaceRoot,
                  baseBranch: branch,
                  ...(settings.newWorktreesStartFromOrigin ? { startFromOrigin: true } : {}),
                  ...(serverConfig?.environment.capabilities.requiredWorktreeBootstrap === true
                    ? { requireWorktree: true }
                    : {}),
                },
                runSetupScript: true,
              }
            : {}),
        },
        createdAt,
      },
    });
    if (result._tag === "Failure") return commandFailureMessage(result) ?? "Sending was cancelled.";
    // Keep the project, checkout mode and model for the next session; branch choices are per session.
    update({ branch: null, worktreePath: null });
    openThread({ environmentId: project.environmentId, threadId });
    return null;
  };

  const openAddProject = (forEnvironment: EnvironmentId | null) => {
    setAddEnvironmentId(forEnvironment ?? environmentId);
    setAddOpen(true);
  };

  const onSelectEnvironment = (id: EnvironmentId) => {
    if (id === project?.environmentId) return;
    const candidates = projects.filter((entry) => entry.environmentId === id);
    const next = defaultProject(candidates);
    if (next)
      update({
        project: { environmentId: id, projectId: next.id },
        branch: null,
        worktreePath: null,
      });
    else openAddProject(id);
  };

  const noProjects = projects.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto">
      <div className="w-full max-w-[44rem] shrink-0 px-6 pt-[max(4rem,calc(40vh-7rem))] pb-24">
        {noProjects ? (
          snapshotLoaded ? (
            <EmptyProjects
              environmentLabel={presentation?.entry.target.label ?? null}
              onAdd={() => openAddProject(primaryId)}
            />
          ) : null
        ) : (
          <div className="animate-fade-in">
            <div className="mb-1.5 flex min-w-0 items-center justify-end gap-0.5">
              <ProjectPicker
                projects={projects}
                selected={project}
                onSelect={(next) =>
                  update({
                    project: { environmentId: next.environmentId, projectId: next.id },
                    branch: null,
                    worktreePath: null,
                  })
                }
                onAddProject={() => openAddProject(null)}
              />
              <EnvironmentPicker
                presentations={presentations}
                selectedId={environmentId}
                onSelect={onSelectEnvironment}
              />
            </div>
            <ComposerCard
              draftKey={NEW_SESSION_DRAFT_KEY}
              environmentId={environmentId}
              blockedReason={blockedReason}
              autoFocus
              onSubmit={onSubmit}
              controls={
                <>
                  <ModelPicker
                    environmentId={environmentId}
                    selection={modelSelection}
                    onChange={(next) => update({ modelSelection: next })}
                  />
                  <ModeMenu
                    provider={provider}
                    runtimeMode={runtimeMode}
                    interactionMode={interactionMode}
                    onRuntimeModeChange={(mode) => update({ runtimeMode: mode })}
                    onInteractionModeChange={(mode) => update({ interactionMode: mode })}
                  />
                </>
              }
            />
            {project ? (
              <div className="mt-1.5 flex min-w-0 items-center gap-0.5 pl-1">
                <CheckoutPicker
                  value={checkout}
                  isRepo={isRepo}
                  worktreePath={reusedWorktree}
                  onChange={(mode) => update({ checkout: mode, branch: null, worktreePath: null })}
                />
                {isRepo ? (
                  <BranchPicker
                    environmentId={project.environmentId}
                    cwd={project.workspaceRoot}
                    mode={checkout}
                    label={branch}
                    onPick={(ref) => void onPickBranch(ref)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        <AgentPill />
      </div>
      <AddProjectDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        environmentIds={presentations.map(([id]) => id)}
        defaultEnvironmentId={addEnvironmentId}
        onAdded={(added) => {
          setAwaitedProjectKey(projectKeyOf(added.environmentId, added.projectId));
          update({ project: added, branch: null, worktreePath: null });
        }}
      />
    </div>
  );
}

function EmptyProjects({
  environmentLabel,
  onAdd,
}: {
  readonly environmentLabel: string | null;
  readonly onAdd: () => void;
}) {
  return (
    <div className="glass animate-fade-in mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line px-8 py-9 text-center shadow-[0_12px_40px_-16px_rgb(0_0_0/0.35)]">
      <span className="grid size-10 place-items-center rounded-xl bg-hover">
        <FolderPlus className="size-5 text-muted" />
      </span>
      <div className="mt-4 text-[15px] font-semibold">Start with a project</div>
      <p className="mt-1.5 text-[13px] text-muted">
        Point T3 at a folder{environmentLabel ? ` on ${environmentLabel}` : ""} and your agents will
        work inside it.
      </p>
      <div className="mt-5">
        <Button variant="primary" onClick={onAdd}>
          <FolderPlus className="size-4" />
          Add project
        </Button>
      </div>
    </div>
  );
}
