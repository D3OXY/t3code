import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ServerProvider } from "@t3tools/contracts";

import { ProviderIcon } from "~/components/ui/ProviderIcon";
import { environmentCatalog, environmentPresentations, serverEnvironment } from "~/state/atoms";
import { Badge, SettingsGroup, SettingsPage } from "./SettingsLayout";

const STATUS: Record<
  ServerProvider["status"],
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  ready: { label: "Ready", tone: "success" },
  warning: { label: "Warning", tone: "warning" },
  error: { label: "Error", tone: "danger" },
  disabled: { label: "Disabled", tone: "neutral" },
};

/** Read-only view of each environment's agent providers and their health. */
export function ProviderSettings() {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const ids = [...catalog.entries].filter(([, entry]) => entry.enabled).map(([id]) => id);
  return (
    <SettingsPage
      title="Providers"
      description="The coding agents each server can run. Install, sign in and configure providers in the T3 Code app or with the t3 CLI on that machine."
    >
      {ids.length === 0 ? (
        <p className="text-[13px] text-muted">No enabled environments.</p>
      ) : (
        ids.map((environmentId) => (
          <EnvironmentProviders key={environmentId} environmentId={environmentId} />
        ))
      )}
    </SettingsPage>
  );
}

function EnvironmentProviders({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const presentation = useAtomValue(environmentPresentations.presentationAtom(environmentId));
  const providers = useAtomValue(serverEnvironment.providersValueAtom(environmentId));
  const label = presentation?.entry.target.label ?? "Environment";
  return (
    <SettingsGroup title={label}>
      {providers === null ? (
        <div className="px-4 py-5 text-center text-[12.5px] text-muted">
          {presentation?.connection.phase === "connected"
            ? "Loading providers…"
            : "Connect to this server to see its providers."}
        </div>
      ) : providers.length === 0 ? (
        <div className="px-4 py-5 text-center text-[12.5px] text-muted">
          No providers configured.
        </div>
      ) : (
        providers.map((provider) => <ProviderRow key={provider.instanceId} provider={provider} />)
      )}
    </SettingsGroup>
  );
}

function ProviderRow({ provider }: { readonly provider: ServerProvider }) {
  const status = STATUS[provider.status] ?? { label: provider.status, tone: "neutral" as const };
  const auth = provider.auth;
  const authLabel =
    auth.status === "authenticated"
      ? (auth.email ?? auth.label ?? "Signed in")
      : auth.status === "unauthenticated"
        ? "Signed out"
        : null;
  const details = [
    provider.driver,
    provider.version ? `v${provider.version}` : null,
    `${provider.models.length} ${provider.models.length === 1 ? "model" : "models"}`,
    authLabel,
  ].filter((part) => part !== null);

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-hover">
        <ProviderIcon provider={provider} size="md" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">
            {provider.displayName ?? provider.driver}
          </span>
          {provider.enabled ? null : <Badge>Off</Badge>}
          {provider.installed ? null : <Badge tone="warning">Not installed</Badge>}
          {auth.status === "unauthenticated" ? <Badge tone="warning">Sign-in needed</Badge> : null}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted">{details.join(" · ")}</div>
        {provider.message || provider.unavailableReason ? (
          <div className="mt-1 text-[12px] break-words text-faint">
            {provider.unavailableReason ?? provider.message}
          </div>
        ) : null}
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
    </div>
  );
}
