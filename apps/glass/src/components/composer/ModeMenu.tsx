import type { ProviderInteractionMode, RuntimeMode, ServerProvider } from "@t3tools/contracts";
import {
  ChevronDown,
  ListChecks,
  Lock,
  LockOpen,
  PenLine,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import {
  Menu,
  MenuCheckboxItem,
  MenuLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/Menu";
import { useComposerPrefs } from "~/stores/composerPrefs";

const RUNTIME_MODES: Record<RuntimeMode, { label: string; description: string; icon: LucideIcon }> =
  {
    "approval-required": {
      label: "Supervised",
      description: "Ask before commands and file changes",
      icon: Lock,
    },
    "auto-accept-edits": {
      label: "Auto-accept edits",
      description: "Approve edits, ask before other actions",
      icon: PenLine,
    },
    auto: {
      label: "Auto",
      description: "Approve routine actions where supported",
      icon: Sparkles,
    },
    "full-access": {
      label: "Full access",
      description: "Run commands and edit without asking",
      icon: LockOpen,
    },
  };

const RUNTIME_MODE_ORDER = Object.keys(RUNTIME_MODES) as RuntimeMode[];

/**
 * Access level, plan mode and follow-up behavior for the next turn. Modes a
 * provider does not support are hidden, except the current one so the user
 * can always see and leave it.
 */
export function ModeMenu({
  provider,
  runtimeMode,
  interactionMode,
  onRuntimeModeChange,
  onInteractionModeChange,
}: {
  readonly provider: ServerProvider | null;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly onRuntimeModeChange: (mode: RuntimeMode) => void;
  readonly onInteractionModeChange: (mode: ProviderInteractionMode) => void;
}) {
  const followUpBehavior = useComposerPrefs((state) => state.followUpBehavior);
  const setFollowUpBehavior = useComposerPrefs((state) => state.setFollowUpBehavior);
  const supported = provider?.supportedRuntimeModes;
  const modes = RUNTIME_MODE_ORDER.filter(
    (mode) => mode === runtimeMode || supported === undefined || supported.includes(mode),
  );
  const current = RUNTIME_MODES[runtimeMode];
  const Icon = interactionMode === "plan" ? ListChecks : current.icon;

  return (
    <Menu>
      <MenuTrigger
        aria-label={`Access: ${current.label}`}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 data-[popup-open]:bg-hover data-[popup-open]:text-fg"
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="hidden truncate sm:inline">
          {interactionMode === "plan" ? "Plan" : current.label}
        </span>
        <ChevronDown className="size-3 shrink-0 text-faint" />
      </MenuTrigger>
      <MenuPopup side="top" align="end" className="w-64">
        <MenuLabel>Access</MenuLabel>
        <MenuRadioGroup
          value={runtimeMode}
          onValueChange={(value) => {
            const mode = modes.find((entry) => entry === value);
            if (mode) onRuntimeModeChange(mode);
          }}
        >
          {modes.map((mode) => {
            const { label, description, icon: ModeIcon } = RUNTIME_MODES[mode];
            return (
              <MenuRadioItem
                key={mode}
                value={mode}
                icon={<ModeIcon className="size-3.5 text-muted" />}
                description={description}
              >
                {label}
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuCheckboxItem
          checked={interactionMode === "plan"}
          onCheckedChange={(checked) => onInteractionModeChange(checked ? "plan" : "default")}
        >
          Plan first
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuLabel>While the agent is working, Enter</MenuLabel>
        <MenuRadioGroup
          value={followUpBehavior}
          onValueChange={(value) => setFollowUpBehavior(value === "steer" ? "steer" : "queue")}
        >
          <MenuRadioItem value="queue" description="Send after the current turn">
            Queues the message
          </MenuRadioItem>
          <MenuRadioItem value="steer" description="Redirect the current turn">
            Steers the agent
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
