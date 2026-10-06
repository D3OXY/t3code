import { Kbd } from "~/components/ui/Kbd";
import { shortcutLabel } from "~/lib/format";
import { SHORTCUTS, type ShortcutId } from "~/lib/shortcuts";
import { SettingsGroup, SettingsPage, SettingsRow } from "./SettingsLayout";

// Typed by ShortcutId so a new shortcut can't ship without a label here.
const LABELS: Record<ShortcutId, string> = {
  palette: "Command palette",
  newSession: "New session",
  settings: "Open settings",
  toggleSidebar: "Toggle sidebar",
  toggleDiff: "Toggle changes",
  toggleTerminal: "Toggle terminal",
  closeTab: "Close tab",
  previousSession: "Previous session",
  nextSession: "Next session",
};

const COMPOSER: ReadonlyArray<{
  readonly label: string;
  readonly description?: string;
  readonly keys: string;
}> = [
  { label: "Send", keys: "enter" },
  { label: "New line", keys: "shift+enter" },
  {
    label: "Send the other way",
    description:
      "While the agent is working, steers instead of queueing (or the reverse, per your default).",
    keys: "mod+enter",
  },
];

/** Every keyboard shortcut Glass binds, rendered for this platform. */
export function ShortcutSettings() {
  return (
    <SettingsPage
      title="Keyboard shortcuts"
      description="Browsers own the new-window, close-tab and tab-number shortcuts, so tab and session shortcuts use Alt."
    >
      <SettingsGroup title="App">
        {(Object.keys(LABELS) as ShortcutId[]).map((id) => (
          <SettingsRow key={id} label={LABELS[id]} className="min-h-10 py-2">
            <Kbd>{shortcutLabel(SHORTCUTS[id])}</Kbd>
          </SettingsRow>
        ))}
        <SettingsRow label="Switch to tab 1–9" className="min-h-10 py-2">
          <Kbd>{shortcutLabel("alt+1")}</Kbd>
          <span className="text-[11px] text-faint">…</span>
          <Kbd>{shortcutLabel("alt+9")}</Kbd>
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup title="Composer">
        {COMPOSER.map((shortcut) => (
          <SettingsRow
            key={shortcut.keys}
            label={shortcut.label}
            description={shortcut.description}
            className="min-h-10 py-2"
          >
            <Kbd>{shortcutLabel(shortcut.keys)}</Kbd>
          </SettingsRow>
        ))}
      </SettingsGroup>
      <SettingsGroup title="Command palette">
        <SettingsRow label="Move selection" className="min-h-10 py-2">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
        </SettingsRow>
        <SettingsRow label="Open selection" className="min-h-10 py-2">
          <Kbd>↵</Kbd>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}
