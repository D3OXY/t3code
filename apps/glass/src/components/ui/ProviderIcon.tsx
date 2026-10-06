import { useAtomValue } from "@effect/atom-react";
import { providerInstanceInitials } from "@t3tools/client-runtime/state/provider-instance-display";
import type { EnvironmentId, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import type { FC, SVGProps } from "react";

import { serverEnvironment } from "~/state/atoms";
import { cn } from "~/lib/cn";
import {
  AntigravityIcon,
  ClaudeAI,
  CursorIcon,
  GrokIcon,
  OpenAI,
  OpenCodeIcon,
  PiAgentIcon,
} from "./ProviderIcons";

const ICON_BY_DRIVER: Record<string, FC<SVGProps<SVGSVGElement>>> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  cursor: CursorIcon,
  grok: GrokIcon,
  opencode: OpenCodeIcon,
  pi: PiAgentIcon,
  antigravity: AntigravityIcon,
};

const NO_PROVIDERS = Atom.make<ReadonlyArray<ServerProvider> | null>(null);

/** The provider list an environment reports, or null before its config arrives. */
export function useEnvironmentProviders(
  environmentId: EnvironmentId | null,
): ReadonlyArray<ServerProvider> {
  return (
    useAtomValue(
      environmentId === null ? NO_PROVIDERS : serverEnvironment.providersValueAtom(environmentId),
    ) ?? []
  );
}

export function useProviderInstance(
  environmentId: EnvironmentId | null,
  instanceId: ProviderInstanceId | null,
): ServerProvider | null {
  const providers = useEnvironmentProviders(environmentId);
  return providers.find((provider) => provider.instanceId === instanceId) ?? null;
}

const SIZES = { xs: "size-3", sm: "size-3.5", md: "size-4", lg: "size-5" } as const;

/** A provider's brand mark, or its initials on its accent color for unknown drivers. */
export function ProviderIcon({
  provider,
  size = "sm",
}: {
  readonly provider: Pick<
    ServerProvider,
    "driver" | "displayName" | "accentColor" | "instanceId"
  > | null;
  readonly size?: keyof typeof SIZES;
}) {
  const Icon = provider ? ICON_BY_DRIVER[provider.driver] : undefined;
  if (Icon) return <Icon className={cn("shrink-0", SIZES[size])} aria-hidden />;
  const label = provider?.displayName ?? provider?.instanceId ?? "?";
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-[4px] text-[8px] leading-none font-semibold text-white",
        SIZES[size],
      )}
      style={{ background: provider?.accentColor ?? "var(--fg-faint)" }}
    >
      {providerInstanceInitials(label)}
    </span>
  );
}
