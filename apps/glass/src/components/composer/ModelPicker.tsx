import { resolveProviderInstanceDisplayName } from "@t3tools/client-runtime/state/provider-instance-display";
import type {
  EnvironmentId,
  ModelSelection,
  ProviderOptionDescriptor,
  ServerProvider,
  ServerProviderModel,
} from "@t3tools/contracts";
import { createModelSelection, getProviderOptionCurrentValue } from "@t3tools/shared/model";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";

import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/Popover";
import { ProviderIcon, useEnvironmentProviders } from "~/components/ui/ProviderIcon";
import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import { showToast } from "~/stores/toasts";
import { useComposerPrefs } from "~/stores/composerPrefs";
import {
  findModel,
  modelLabel,
  modelMatchesQuery,
  nonDefaultTraitLabels,
  providerUnavailableReason,
  selectionDescriptors,
  withOption,
} from "./modelSelection";

type View = "traits" | "models";
/** Why switching to a model is not allowed, or null when it is. */
type BlockReason = (next: Pick<ModelSelection, "instanceId" | "model">) => string | null;

/**
 * The composer's model trigger ("Opus 5.5 High") and its compact picker: a
 * traits panel for the current model's options, and a provider rail + model
 * list. `blockReason` lets a started thread veto switches its provider cannot
 * make; blocked models stay visible with the reason.
 */
export function ModelPicker({
  environmentId,
  selection,
  onChange,
  blockReason,
}: {
  readonly environmentId: EnvironmentId | null;
  readonly selection: ModelSelection | null;
  readonly onChange: (selection: ModelSelection) => void;
  readonly blockReason?: BlockReason | undefined;
}) {
  const providers = useEnvironmentProviders(environmentId);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("models");
  const provider = providers.find((entry) => entry.instanceId === selection?.instanceId) ?? null;
  const model = selection ? findModel(provider, selection.model) : null;
  const descriptors = selection ? selectionDescriptors(model, selection) : [];
  const traits = selection ? nonDefaultTraitLabels(model, selection) : [];

  const apply = (next: ModelSelection) => {
    onChange(next);
    useComposerPrefs.getState().setStickyModelSelection(next);
  };

  const pickModel = (target: ServerProvider, targetModel: ServerProviderModel) => {
    const reason = blockReason?.({ instanceId: target.instanceId, model: targetModel.slug });
    if (reason) {
      showToast(reason, "info");
      return;
    }
    // A model starts from its own defaults rather than the previous model's options.
    apply(createModelSelection(target.instanceId, targetModel.slug));
    if ((targetModel.capabilities?.optionDescriptors?.length ?? 0) > 0) setView("traits");
    else setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setView(descriptors.length > 0 ? "traits" : "models");
      }}
    >
      <PopoverTrigger
        disabled={environmentId === null}
        className="flex h-8 max-w-56 min-w-0 items-center gap-1.5 rounded-lg px-2 text-[13px] outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40 data-[popup-open]:bg-hover"
      >
        {selection ? (
          <>
            <ProviderIcon provider={provider} size="sm" />
            <span className="truncate font-medium">{modelLabel(model, selection.model)}</span>
            {traits.length > 0 ? (
              <span className="truncate text-muted">{traits.join(" · ")}</span>
            ) : null}
          </>
        ) : (
          <span className="text-muted">
            {providers.length === 0 ? "No providers" : "Choose model"}
          </span>
        )}
        <ChevronDown className="size-3 shrink-0 text-faint" />
      </PopoverTrigger>
      <PopoverPopup side="top" align="end" className="w-[min(22rem,calc(100vw-2rem))]">
        {view === "traits" && selection && descriptors.length > 0 ? (
          <TraitsPanel
            title={modelLabel(model, selection.model)}
            providerName={provider ? resolveProviderInstanceDisplayName(provider) : null}
            selection={selection}
            descriptors={descriptors}
            onChange={apply}
            onShowModels={() => setView("models")}
          />
        ) : (
          <ModelsPanel
            providers={providers}
            selection={selection}
            blockReason={blockReason}
            onPick={pickModel}
            onBack={descriptors.length > 0 ? () => setView("traits") : null}
          />
        )}
      </PopoverPopup>
    </Popover>
  );
}

function TraitsPanel({
  title,
  providerName,
  selection,
  descriptors,
  onChange,
  onShowModels,
}: {
  readonly title: string;
  readonly providerName: string | null;
  readonly selection: ModelSelection;
  readonly descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly onChange: (selection: ModelSelection) => void;
  readonly onShowModels: () => void;
}) {
  // The first multi-choice option is the headline trait (effort-like); it gets the slider.
  const primary = descriptors.find(
    (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "select" }> =>
      descriptor.type === "select" && descriptor.options.length >= 2,
  );
  const rest = descriptors.filter((descriptor) => descriptor !== primary);
  const primaryValue = primary ? getProviderOptionCurrentValue(primary) : undefined;
  const primaryLabel = primary?.options.find((option) => option.id === primaryValue)?.label;

  return (
    <div className="p-3">
      <div className="px-1">
        <div className="text-[15px] leading-tight font-semibold">{primaryLabel ?? title}</div>
        <button
          type="button"
          onClick={onShowModels}
          className="mt-0.5 flex items-center gap-0.5 text-[13px] text-muted outline-none hover:text-fg focus-visible:text-fg"
        >
          {primaryLabel ? title : (providerName ?? "Models")}
          <ChevronRight className="size-3.5" />
        </button>
      </div>
      {primary ? (
        <StepSlider
          label={primary.label}
          options={primary.options}
          value={typeof primaryValue === "string" ? primaryValue : null}
          onChange={(value) => onChange(withOption(selection, primary.id, value))}
        />
      ) : null}
      {rest.length > 0 ? (
        <div className="mt-2 flex flex-col">
          {rest.map((descriptor) =>
            descriptor.type === "boolean" ? (
              <BooleanRow
                key={descriptor.id}
                descriptor={descriptor}
                onChange={(value) => onChange(withOption(selection, descriptor.id, value))}
              />
            ) : (
              <SelectRow
                key={descriptor.id}
                descriptor={descriptor}
                onChange={(value) => onChange(withOption(selection, descriptor.id, value))}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A stepped track: one stop per option, accent fill up to a glass thumb. */
function StepSlider({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly value: string | null;
  readonly onChange: (value: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const last = options.length - 1;
  const fraction = last === 0 ? 1 : index / last;

  const pickAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = options[Math.round(ratio * last)];
    if (next && next.id !== value) onChange(next.id);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0;
    const target =
      event.key === "Home" ? 0 : event.key === "End" ? last : step === 0 ? null : index + step;
    if (target === null) return;
    event.preventDefault();
    const next = options[Math.min(last, Math.max(0, target))];
    if (next && next.id !== value) onChange(next.id);
  };

  return (
    <div className="mt-3 px-1">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={index}
        aria-valuetext={options[index]?.label}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pickAt(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pickAt(event.clientX);
        }}
        className="relative h-7 cursor-pointer touch-none rounded-full border border-line bg-hover outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-150 ease-out"
          style={{ width: `calc(${fraction} * (100% - 1.75rem) + 1.75rem)` }}
        />
        {options.map((option, stop) => (
          <span
            key={option.id}
            aria-hidden
            className={cn(
              "absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
              stop <= index ? "bg-accent-fg/60" : "bg-faint",
            )}
            style={{ left: `calc(${last === 0 ? 0 : stop / last} * (100% - 1.75rem) + 0.875rem)` }}
          />
        ))}
        <span
          aria-hidden
          className="absolute top-1/2 h-6 w-7 -translate-y-1/2 rounded-full border border-line-strong bg-white shadow-sm transition-[left] duration-150 ease-out"
          style={{ left: `calc(${fraction} * (100% - 1.75rem))` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-faint">
        <span>{options[0]?.label}</span>
        <span>{options[last]?.label}</span>
      </div>
    </div>
  );
}

function BooleanRow({
  descriptor,
  onChange,
}: {
  readonly descriptor: Extract<ProviderOptionDescriptor, { type: "boolean" }>;
  readonly onChange: (value: boolean) => void;
}) {
  const checked = getProviderOptionCurrentValue(descriptor) === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-9 items-center gap-3 rounded-lg px-1 text-left outline-none hover:bg-hover focus-visible:bg-hover"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{descriptor.label}</span>
        {descriptor.description ? (
          <span className="block truncate text-[11.5px] text-faint">{descriptor.description}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-150",
          checked ? "bg-accent" : "bg-active",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform duration-150",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** A secondary multi-choice option as an inline row of choices (no nested popup). */
function SelectRow({
  descriptor,
  onChange,
}: {
  readonly descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>;
  readonly onChange: (value: string) => void;
}) {
  const value = getProviderOptionCurrentValue(descriptor);
  return (
    <div className="flex flex-col gap-1.5 px-1 py-1.5">
      <span className="font-medium">{descriptor.label}</span>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={descriptor.label}>
        {descriptor.options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === value}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-6 rounded-md border px-2 text-[12px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/60",
              option.id === value
                ? "border-line-strong bg-raised font-medium text-fg shadow-sm"
                : "border-line text-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ModelRow {
  readonly provider: ServerProvider;
  readonly model: ServerProviderModel;
  readonly blocked: string | null;
}

function ModelsPanel({
  providers,
  selection,
  blockReason,
  onPick,
  onBack,
}: {
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly selection: ModelSelection | null;
  readonly blockReason?: BlockReason | undefined;
  readonly onPick: (provider: ServerProvider, model: ServerProviderModel) => void;
  readonly onBack: (() => void) | null;
}) {
  // Picker rails show configured, enabled instances; unusable ones stay visible but disabled.
  const rail = providers.filter((provider) => provider.enabled);
  const [query, setQuery] = useState("");
  const [railId, setRailId] = useState(
    () =>
      (
        rail.find((provider) => provider.instanceId === selection?.instanceId) ??
        rail.find((provider) => providerUnavailableReason(provider) === null) ??
        rail[0]
      )?.instanceId ?? null,
  );
  const [highlight, setHighlight] = useState(0);
  const railProvider = rail.find((provider) => provider.instanceId === railId) ?? null;
  const railReason = railProvider ? providerUnavailableReason(railProvider) : null;
  const searching = query.trim() !== "";

  const rows = useMemo((): ReadonlyArray<ModelRow> => {
    const sources = searching
      ? rail.filter((provider) => providerUnavailableReason(provider) === null)
      : railProvider && railReason === null
        ? [railProvider]
        : [];
    return sources.flatMap((provider) =>
      provider.models
        .filter((model) => modelMatchesQuery(model, query))
        .map((model) => ({
          provider,
          model,
          blocked: blockReason?.({ instanceId: provider.instanceId, model: model.slug }) ?? null,
        })),
    );
  }, [blockReason, query, rail, railProvider, railReason, searching]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((current) =>
        rows.length === 0 ? 0 : (current + step + rows.length) % rows.length,
      );
    } else if (event.key === "Enter") {
      const row = rows[highlight];
      if (row && row.blocked === null) {
        event.preventDefault();
        onPick(row.provider, row.model);
      }
    }
  };

  return (
    <div className="flex h-[min(24rem,60vh)] flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 px-2 pt-1">
        {onBack ? (
          <button
            type="button"
            aria-label="Back to options"
            onClick={onBack}
            className="grid size-7 place-items-center rounded-lg text-muted outline-none hover:bg-hover hover:text-fg"
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : null}
        <span className={cn("text-[13px] font-semibold", !onBack && "pl-1.5")}>Models</span>
      </div>
      <label className="mx-2 flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-muted focus-within:text-fg">
        <Search className="size-3.5 shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search models…"
          aria-label="Search models"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-faint"
        />
      </label>
      <div className="mt-1 flex min-h-0 flex-1 border-t border-line">
        {!searching && rail.length > 1 ? (
          <div className="flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line py-1.5 no-scrollbar">
            {rail.map((provider) => {
              const reason = providerUnavailableReason(provider);
              const name = resolveProviderInstanceDisplayName(provider);
              return (
                <Tooltip
                  key={provider.instanceId}
                  side="left"
                  label={reason ? `${name} · ${reason}` : name}
                >
                  <button
                    type="button"
                    aria-label={name}
                    aria-pressed={provider.instanceId === railId}
                    onClick={() => {
                      setRailId(provider.instanceId);
                      setHighlight(0);
                    }}
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                      provider.instanceId === railId ? "bg-active" : "hover:bg-hover",
                      reason && "opacity-40",
                    )}
                  >
                    <ProviderIcon provider={provider} size="md" />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 overflow-y-auto p-1" role="listbox" aria-label="Models">
          {railReason && !searching && railProvider ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-muted">
              <div className="font-medium text-fg">
                {resolveProviderInstanceDisplayName(railProvider)}
              </div>
              <div className="mt-1">{railReason}</div>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-faint">
              {rail.length === 0
                ? "No providers are enabled on this environment."
                : "No models match."}
            </div>
          ) : (
            rows.map((row, index) => {
              const selected =
                row.provider.instanceId === selection?.instanceId &&
                row.model.slug === selection.model;
              return (
                <button
                  key={`${row.provider.instanceId}:${row.model.slug}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-disabled={row.blocked !== null}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() =>
                    row.blocked === null ? onPick(row.provider, row.model) : undefined
                  }
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none",
                    index === highlight && row.blocked === null && "bg-active",
                    row.blocked !== null && "cursor-default",
                  )}
                >
                  <span className={cn("shrink-0", row.blocked !== null && "opacity-40")}>
                    <ProviderIcon provider={row.provider} size="md" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "flex items-center gap-1.5",
                        row.blocked !== null && "text-faint",
                      )}
                    >
                      <span className="truncate">{row.model.name}</span>
                      {row.model.badge === "new" ? (
                        <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-medium text-accent">
                          New
                        </span>
                      ) : null}
                    </span>
                    {row.blocked ? (
                      <span className="block text-[11px] leading-snug text-faint">
                        {row.blocked}
                      </span>
                    ) : searching ? (
                      <span className="block truncate text-[11px] text-faint">
                        {resolveProviderInstanceDisplayName(row.provider)}
                      </span>
                    ) : null}
                  </span>
                  {selected ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
