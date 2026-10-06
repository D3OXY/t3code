import {
  DEFAULT_MODEL_BY_PROVIDER,
  isProviderAvailable,
  type ModelSelection,
  type ProviderOptionDescriptor,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import {
  createModelSelection,
  formatModelSlugName,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
} from "@t3tools/shared/model";

/** Why a provider cannot start a turn right now, or null when it can. */
export function providerUnavailableReason(provider: ServerProvider): string | null {
  if (!provider.enabled) return "Disabled in settings";
  if (!isProviderAvailable(provider)) return provider.unavailableReason ?? "Unavailable";
  if (!provider.installed) return "Not installed";
  if (provider.status === "disabled") return "Disabled";
  if (provider.status === "error") return provider.message ?? "Not working";
  if (provider.auth.status === "unauthenticated") return "Sign in required";
  return null;
}

/** A provider's own default model: declared default, first built-in, any, then the driver default. */
export function defaultModelForProvider(provider: ServerProvider): string | null {
  return (
    provider.models.find((model) => model.isDefault === true && !model.isCustom)?.slug ??
    provider.models.find((model) => !model.isCustom)?.slug ??
    provider.models[0]?.slug ??
    DEFAULT_MODEL_BY_PROVIDER[provider.driver] ??
    null
  );
}

/**
 * The selection a new session starts with: the first candidate whose provider
 * can run now (kept byte-for-byte, options included), else the first ready
 * provider's default model. Candidates are tried in priority order, e.g.
 * project default, server default, the user's last pick.
 */
export function resolveDefaultModelSelection(
  providers: ReadonlyArray<ServerProvider>,
  candidates: ReadonlyArray<ModelSelection | null | undefined>,
): ModelSelection | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const provider = providers.find((entry) => entry.instanceId === candidate.instanceId);
    if (provider && providerUnavailableReason(provider) === null) return candidate;
  }
  const fallback =
    providers.find(
      (provider) => providerUnavailableReason(provider) === null && provider.status === "ready",
    ) ?? providers.find((provider) => providerUnavailableReason(provider) === null);
  if (!fallback) return null;
  const model = defaultModelForProvider(fallback);
  return model === null ? null : createModelSelection(fallback.instanceId, model);
}

export function findModel(
  provider: ServerProvider | null,
  slug: string,
): ServerProviderModel | null {
  return provider?.models.find((model) => model.slug === slug) ?? null;
}

/** Compact model label for triggers: short name, name, then a prettified slug. */
export function modelLabel(model: ServerProviderModel | null, slug: string): string {
  return model?.shortName ?? model?.name ?? formatModelSlugName(slug);
}

/** The model's option descriptors with the selection's values applied. */
export function selectionDescriptors(
  model: ServerProviderModel | null,
  selection: ModelSelection,
): ReadonlyArray<ProviderOptionDescriptor> {
  if (!model?.capabilities) return [];
  return getProviderOptionDescriptors({ caps: model.capabilities, selections: selection.options });
}

/**
 * Labels for options the user moved off their defaults, e.g. ["High", "Fast"].
 * Select options show the chosen label; switched-on booleans show their name.
 */
export function nonDefaultTraitLabels(
  model: ServerProviderModel | null,
  selection: ModelSelection,
): string[] {
  if (!model?.capabilities) return [];
  const defaults = getProviderOptionDescriptors({ caps: model.capabilities });
  return selectionDescriptors(model, selection).flatMap((descriptor) => {
    const value = getProviderOptionCurrentValue(descriptor);
    const fallback = getProviderOptionCurrentValue(
      defaults.find((entry) => entry.id === descriptor.id),
    );
    if (value === undefined || value === fallback) return [];
    if (descriptor.type === "boolean") return value === true ? [descriptor.label] : [];
    return descriptor.options.find((option) => option.id === value)?.label ?? [];
  });
}

/** The selection with one option set, keeping every other explicit choice. */
export function withOption(
  selection: ModelSelection,
  id: string,
  value: string | boolean,
): ModelSelection {
  return createModelSelection(selection.instanceId, selection.model, [
    ...(selection.options ?? []).filter((option) => option.id !== id),
    { id, value },
  ]);
}

/** Case-insensitive match over a model's names, slug and aliases. */
export function modelMatchesQuery(model: ServerProviderModel, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return [
    model.name,
    model.shortName,
    model.slug,
    model.subProvider,
    ...(model.aliases ?? []),
  ].some((value) => value?.toLowerCase().includes(needle) === true);
}

/**
 * Why a started thread cannot switch to `next`, or null when it can. Provider
 * switches need handoff support; some providers cannot change models
 * mid-conversation.
 */
export function modelSwitchBlockReason(input: {
  readonly providers: ReadonlyArray<
    Pick<ServerProvider, "instanceId" | "requiresNewThreadForModelChange">
  >;
  readonly hasStarted: boolean;
  readonly supportsProviderHandoff: boolean;
  readonly current: ModelSelection;
  readonly next: Pick<ModelSelection, "instanceId" | "model">;
}): string | null {
  if (!input.hasStarted) return null;
  const { current, next } = input;
  if (current.instanceId === next.instanceId && current.model === next.model) return null;
  if (current.instanceId !== next.instanceId) {
    return input.supportsProviderHandoff
      ? null
      : "This session can't switch providers. Start a new session to use it.";
  }
  const provider = input.providers.find((entry) => entry.instanceId === current.instanceId);
  return provider?.requiresNewThreadForModelChange === true
    ? "This provider can't change models mid-session. Start a new session to use it."
    : null;
}
