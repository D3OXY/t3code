import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ModelSelection,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  modelSwitchBlockReason,
  nonDefaultTraitLabels,
  resolveDefaultModelSelection,
  withOption,
} from "./modelSelection";

const opus: ServerProviderModel = {
  slug: "claude-opus-5-5",
  name: "Claude Opus 5.5",
  shortName: "Opus 5.5",
  isCustom: false,
  isDefault: true,
  capabilities: {
    optionDescriptors: [
      {
        id: "effort",
        label: "Effort",
        type: "select",
        options: [
          { id: "low", label: "Low" },
          { id: "medium", label: "Medium", isDefault: true },
          { id: "high", label: "High" },
        ],
      },
      { id: "fast", label: "Fast", type: "boolean", currentValue: false },
    ],
  },
};

const provider = (instanceId: string, overrides: Partial<ServerProvider> = {}): ServerProvider => ({
  instanceId: ProviderInstanceId.make(instanceId),
  driver: ProviderDriverKind.make("claudeAgent"),
  enabled: true,
  installed: true,
  version: null,
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-10-01T00:00:00.000Z",
  models: [
    opus,
    { slug: "claude-haiku-5", name: "Claude Haiku 5", isCustom: false, capabilities: null },
  ],
  slashCommands: [],
  skills: [],
  ...overrides,
});

const selection = (instanceId: string, model = opus.slug): ModelSelection => ({
  instanceId: ProviderInstanceId.make(instanceId),
  model,
});

describe("resolveDefaultModelSelection", () => {
  it("takes the first candidate whose provider can run, unchanged", () => {
    const providers = [provider("claude"), provider("work", { status: "error" })];
    const pinned = {
      ...selection("claude", "claude-haiku-5"),
      options: [{ id: "x", value: true }],
    };
    expect(resolveDefaultModelSelection(providers, [selection("work"), null, pinned])).toBe(pinned);
  });

  it("falls back to a ready provider's own default model", () => {
    const providers = [provider("broken", { installed: false }), provider("claude")];
    expect(resolveDefaultModelSelection(providers, [selection("missing")])).toEqual(
      selection("claude"),
    );
  });

  it("is null when nothing can run", () => {
    expect(resolveDefaultModelSelection([provider("off", { enabled: false })], [])).toBeNull();
  });
});

describe("nonDefaultTraitLabels", () => {
  it("names only the options moved off their defaults", () => {
    const base = selection("claude");
    expect(nonDefaultTraitLabels(opus, base)).toEqual([]);
    expect(
      nonDefaultTraitLabels(opus, withOption(withOption(base, "effort", "high"), "fast", true)),
    ).toEqual(["High", "Fast"]);
    expect(nonDefaultTraitLabels(opus, withOption(base, "effort", "medium"))).toEqual([]);
  });
});

describe("modelSwitchBlockReason", () => {
  const base = {
    providers: [provider("claude"), provider("strict", { requiresNewThreadForModelChange: true })],
    hasStarted: true,
    supportsProviderHandoff: false,
  };

  it("allows anything before the first turn", () => {
    expect(
      modelSwitchBlockReason({
        ...base,
        hasStarted: false,
        current: selection("claude"),
        next: selection("other"),
      }),
    ).toBeNull();
  });

  it("blocks provider switches without handoff support", () => {
    const input = { ...base, current: selection("claude"), next: selection("other") };
    expect(modelSwitchBlockReason(input)).not.toBeNull();
    expect(modelSwitchBlockReason({ ...input, supportsProviderHandoff: true })).toBeNull();
  });

  it("blocks model changes on providers that require a new thread", () => {
    expect(
      modelSwitchBlockReason({
        ...base,
        current: selection("strict"),
        next: selection("strict", "claude-haiku-5"),
      }),
    ).not.toBeNull();
    expect(
      modelSwitchBlockReason({
        ...base,
        current: selection("claude"),
        next: selection("claude", "claude-haiku-5"),
      }),
    ).toBeNull();
  });
});
