import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";

import { environmentCatalog, environmentPresentations } from "~/state/atoms";
import packageJson from "../../../package.json";
import { SettingsGroup, SettingsPage, SettingsRow } from "./SettingsLayout";

/** Client build info plus the version each connected server reports. */
export function AboutSettings() {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  return (
    <SettingsPage
      title="About"
      description="T3 Glass is an open source client for T3 Code servers."
    >
      <SettingsGroup title="Client">
        <SettingsRow label="T3 Glass">
          <span className="font-mono text-[12px] text-muted">v{packageJson.version}</span>
        </SettingsRow>
        <SettingsRow label="Build">
          <span className="font-mono text-[12px] text-muted">{import.meta.env.MODE}</span>
        </SettingsRow>
        <SettingsRow label="Origin">
          <span className="max-w-72 truncate font-mono text-[12px] text-muted">
            {window.location.origin}
          </span>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Servers">
        {[...catalog.entries.keys()].map((environmentId) => (
          <ServerAbout key={environmentId} environmentId={environmentId} />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}

function ServerAbout({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const presentation = useAtomValue(environmentPresentations.presentationAtom(environmentId));
  if (presentation === null) return null;
  const descriptor = presentation.serverConfig?.environment;
  const platform = descriptor
    ? [descriptor.platform.os, descriptor.platform.arch, descriptor.platform.machine]
        .filter(Boolean)
        .join(" · ")
    : null;
  return (
    <SettingsRow
      label={descriptor?.label ?? presentation.entry.target.label}
      description={
        descriptor
          ? `${platform}${descriptor.orchestrationProtocolVersion === undefined ? "" : ` · protocol ${descriptor.orchestrationProtocolVersion}`}`
          : "Not connected"
      }
    >
      <span className="font-mono text-[12px] text-muted">
        {descriptor ? `v${descriptor.serverVersion}` : "—"}
      </span>
    </SettingsRow>
  );
}
