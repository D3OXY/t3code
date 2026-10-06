import { ConnectionOnboarding } from "@t3tools/client-runtime/connection";
import { createAssetEnvironmentAtoms } from "@t3tools/client-runtime/state/assets";
import { createAttachmentEnvironmentAtoms } from "@t3tools/client-runtime/state/attachments";
import {
  createEnvironmentCatalogAtoms,
  enabledEnvironmentIds,
} from "@t3tools/client-runtime/state/connections";
import { createOrchestrationEnvironmentAtoms } from "@t3tools/client-runtime/state/orchestration";
import { createEnvironmentPresentationAtoms } from "@t3tools/client-runtime/state/presentation";
import {
  createEnvironmentProjectAtoms,
  createProjectEnvironmentAtoms,
} from "@t3tools/client-runtime/state/projects";
import { createReviewEnvironmentAtoms } from "@t3tools/client-runtime/state/review";
import {
  createAtomCommandScheduler,
  createRuntimeCommand,
} from "@t3tools/client-runtime/state/runtime";
import { createServerEnvironmentAtoms } from "@t3tools/client-runtime/state/server";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";
import {
  createEnvironmentShellAtoms,
  createEnvironmentSnapshotAtom,
} from "@t3tools/client-runtime/state/shell";
import { createTerminalEnvironmentAtoms } from "@t3tools/client-runtime/state/terminal";
import {
  createEnvironmentThreadDetailAtoms,
  createEnvironmentThreadShellAtoms,
  createEnvironmentThreadStateAtoms,
  createThreadEnvironmentAtoms,
} from "@t3tools/client-runtime/state/threads";
import { createVcsEnvironmentAtoms } from "@t3tools/client-runtime/state/vcs";
import { DEFAULT_SERVER_SETTINGS, type ServerSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "~/connection/runtime";

// Every environment-scoped atom family and command in Glass is built here, once,
// on the shared connection runtime. Components import these instead of creating
// their own so streams and caches are shared across views.

export const environmentCatalog = createEnvironmentCatalogAtoms(connectionAtomRuntime);

export const enabledEnvironmentIdsAtom = Atom.map(
  environmentCatalog.catalogValueAtom,
  (catalog) => [...enabledEnvironmentIds(catalog)],
);

export const primaryEnvironmentIdAtom = Atom.make((get) => {
  for (const [environmentId, entry] of get(environmentCatalog.catalogValueAtom).entries) {
    if (entry.target._tag === "PrimaryConnectionTarget") return environmentId;
  }
  return null;
}).pipe(Atom.withLabel("glass-primary-environment-id"));

export const environmentSession = createEnvironmentSessionAtoms(connectionAtomRuntime);

export const serverEnvironment = createServerEnvironmentAtoms(connectionAtomRuntime, {
  initialConfigValueAtom: environmentSession.initialConfigValueAtom,
  environmentThemes: true,
});

export const primaryServerSettingsAtom = Atom.make((get): ServerSettings => {
  const environmentId = get(primaryEnvironmentIdAtom);
  if (environmentId === null) return DEFAULT_SERVER_SETTINGS;
  return get(serverEnvironment.configValueAtom(environmentId))?.settings ?? DEFAULT_SERVER_SETTINGS;
}).pipe(Atom.withLabel("glass-primary-server-settings"));

export const environmentPresentations = createEnvironmentPresentationAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  stateAtom: environmentCatalog.stateAtom,
  serverConfigValueAtom: serverEnvironment.configValueAtom,
});

export const environmentShell = createEnvironmentShellAtoms(connectionAtomRuntime);
export const environmentSnapshotAtom = createEnvironmentSnapshotAtom(environmentShell.stateAtom);

export const environmentProjects = createEnvironmentProjectAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: environmentSnapshotAtom,
});
export const projectEnvironment = createProjectEnvironmentAtoms(connectionAtomRuntime, {
  projectAtom: environmentProjects.projectAtom,
});

/** Thread commands plus an optimistic overlay of the shell snapshot. */
export const threadEnvironment = createThreadEnvironmentAtoms(
  connectionAtomRuntime,
  environmentSnapshotAtom,
);
export const environmentThreads = createEnvironmentThreadStateAtoms(connectionAtomRuntime);
export const environmentThreadDetails = createEnvironmentThreadDetailAtoms(
  environmentThreads.stateAtom,
);
export const environmentThreadShells = createEnvironmentThreadShellAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: threadEnvironment.snapshotAtom,
});

export const orchestrationEnvironment = createOrchestrationEnvironmentAtoms(connectionAtomRuntime);
export const vcsEnvironment = createVcsEnvironmentAtoms(connectionAtomRuntime);
export const attachmentEnvironment = createAttachmentEnvironmentAtoms(connectionAtomRuntime);
export const assetEnvironment = createAssetEnvironmentAtoms(connectionAtomRuntime);
export const terminalEnvironment = createTerminalEnvironmentAtoms(connectionAtomRuntime);
export const reviewEnvironment = createReviewEnvironmentAtoms(connectionAtomRuntime);

const onboardingScheduler = createAtomCommandScheduler();

/** Pairs a remote T3 server from a pairing URL (or host + code) and saves it. */
export const connectPairing = createRuntimeCommand(connectionAtomRuntime, {
  label: "glass:connection:connect-pairing",
  scheduler: onboardingScheduler,
  concurrency: {
    mode: "singleFlight",
    key: (input: ConnectionOnboarding.PairingConnectionInput) => JSON.stringify(input),
  },
  execute: (input: ConnectionOnboarding.PairingConnectionInput) =>
    ConnectionOnboarding.ConnectionOnboarding.pipe(
      Effect.flatMap((onboarding) => onboarding.registerPairing(input)),
    ),
});
