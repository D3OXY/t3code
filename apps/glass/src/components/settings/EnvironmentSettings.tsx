import { useAtomValue } from "@effect/atom-react";
import {
  type ConnectionTargetKind,
  connectionCatalogDisplayUrl,
  connectionStatusText,
  type EnvironmentConnectionPhase,
} from "@t3tools/client-runtime/connection";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link2, RotateCw, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "~/components/ui/Button";
import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import { connectPairing, environmentCatalog, environmentPresentations } from "~/state/atoms";
import { commandFailureMessage, useAtomCommand } from "~/state/hooks";
import { confirmAction } from "~/stores/confirm";
import { showToast } from "~/stores/toasts";
import { Badge, SettingsGroup, SettingsPage, Toggle } from "./SettingsLayout";

const PHASE_TONE: Record<EnvironmentConnectionPhase, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  reconnecting: "bg-warning",
  offline: "bg-faint",
  available: "bg-faint",
  error: "bg-danger",
  unsupported: "bg-danger",
};

const KIND_LABEL: Record<ConnectionTargetKind, string> = {
  PrimaryConnectionTarget: "This server",
  BearerConnectionTarget: "Paired",
  RelayConnectionTarget: "T3 Connect",
  SshConnectionTarget: "SSH",
};

/** Saved T3 servers this client talks to, plus pairing a new one. */
export function EnvironmentSettings() {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const ids = [...catalog.entries.keys()];
  return (
    <SettingsPage
      title="Environments"
      description="Each environment is a T3 server with its own projects, sessions and provider sign-ins."
    >
      <SettingsGroup title="Connected servers">
        {ids.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-muted">
            {catalog.isReady ? "No servers saved yet." : "Loading…"}
          </div>
        ) : (
          ids.map((environmentId) => (
            <EnvironmentRow key={environmentId} environmentId={environmentId} />
          ))
        )}
      </SettingsGroup>
      <PairForm />
    </SettingsPage>
  );
}

function EnvironmentRow({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const presentation = useAtomValue(environmentPresentations.presentationAtom(environmentId));
  const retry = useAtomCommand(environmentCatalog.retryNow);
  const setEnabled = useAtomCommand(environmentCatalog.setEnabled);
  const remove = useAtomCommand(environmentCatalog.remove);
  const [busy, setBusy] = useState(false);
  if (presentation === null) return null;

  const { entry, connection, serverConfig } = presentation;
  const primary = entry.target._tag === "PrimaryConnectionTarget";
  const url = connectionCatalogDisplayUrl(entry);
  const label = entry.target.label;
  const version = serverConfig?.environment.serverVersion;

  const run = async (action: () => Promise<AtomCommandResult<unknown, unknown>>) => {
    setBusy(true);
    const message = commandFailureMessage(await action());
    setBusy(false);
    if (message) showToast(message);
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-fg text-[13px] font-semibold text-bg">
        {label.slice(0, 1).toUpperCase()}
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface",
            entry.enabled ? PHASE_TONE[connection.phase] : "bg-faint",
          )}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{label}</span>
          <Badge>{KIND_LABEL[entry.target._tag]}</Badge>
          {version ? <span className="font-mono text-[11px] text-faint">v{version}</span> : null}
        </div>
        {url ? (
          <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted">{url}</div>
        ) : null}
        <div
          className={cn(
            "mt-1 text-[12px] break-words",
            !entry.enabled
              ? "text-faint"
              : connection.phase === "error" || connection.phase === "unsupported"
                ? "text-danger"
                : "text-muted",
          )}
        >
          {entry.enabled
            ? connectionStatusText(connection)
            : "Disabled. This client won't connect to it."}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {entry.enabled && connection.phase !== "connected" ? (
          <Tooltip label="Retry now">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Retry connection"
              disabled={busy}
              onClick={() => void run(() => retry(environmentId))}
            >
              <RotateCw className="size-3.5" />
            </Button>
          </Tooltip>
        ) : null}
        {primary ? null : (
          <>
            <Toggle
              label={entry.enabled ? `Disable ${label}` : `Enable ${label}`}
              checked={entry.enabled}
              disabled={busy}
              onChange={(enabled) => void run(() => setEnabled({ environmentId, enabled }))}
            />
            <Tooltip label="Remove">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${label}`}
                disabled={busy}
                onClick={async () => {
                  const confirmed = await confirmAction({
                    title: `Remove ${label}?`,
                    description:
                      "This client forgets the server and its credentials. Sessions stay on the server; pair again to reconnect.",
                    confirmLabel: "Remove",
                    danger: true,
                  });
                  if (confirmed) await run(() => remove(environmentId));
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}

function PairForm() {
  const pair = useAtomCommand(connectPairing);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const pairingUrl = value.trim();
    if (pairingUrl === "") return;
    setPending(true);
    setError(null);
    const result = await pair({ pairingUrl });
    setPending(false);
    if (result._tag === "Success") {
      setValue("");
      showToast("Server paired.", "info");
      return;
    }
    setError(commandFailureMessage(result));
  };

  return (
    <SettingsGroup
      title="Pair a server"
      description="Paste the pairing link a T3 server printed on startup, or mint one with `t3 pair` on that machine."
    >
      <form onSubmit={submit} className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line-strong bg-sunken/60 px-2.5 focus-within:border-accent">
            <Link2 className="size-3.5 shrink-0 text-faint" />
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="https://host:3773/pair#token=…"
              aria-label="Pairing link"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent font-mono text-[12px] outline-none placeholder:text-faint"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={pending || value.trim() === ""}
          >
            {pending ? "Pairing…" : "Pair"}
          </Button>
        </div>
        {error ? <p className="text-[12px] break-words text-danger">{error}</p> : null}
        <p className="text-[11.5px] text-faint">
          The server must accept requests from{" "}
          <code className="rounded bg-code px-1 font-mono">{window.location.origin}</code>. For a
          dev server, add it to{" "}
          <code className="rounded bg-code px-1 font-mono">T3CODE_DEV_ALLOWED_ORIGINS</code>.
        </p>
      </form>
    </SettingsGroup>
  );
}
