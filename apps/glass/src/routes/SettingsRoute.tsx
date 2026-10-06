import { Cpu, Info, Keyboard, Palette, Server } from "lucide-react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { AboutSettings } from "~/components/settings/AboutSettings";
import { AppearanceSettings } from "~/components/settings/AppearanceSettings";
import { EnvironmentSettings } from "~/components/settings/EnvironmentSettings";
import { ProviderSettings } from "~/components/settings/ProviderSettings";
import { ShortcutSettings } from "~/components/settings/ShortcutSettings";
import { cn } from "~/lib/cn";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette, Page: AppearanceSettings },
  { id: "environments", label: "Environments", icon: Server, Page: EnvironmentSettings },
  { id: "providers", label: "Providers", icon: Cpu, Page: ProviderSettings },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, Page: ShortcutSettings },
  { id: "about", label: "About", icon: Info, Page: AboutSettings },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Settings inside the frosted main panel: section nav on the left, one page at a time. */
export function SettingsRoute() {
  const { section: requested } = useSearch({ from: "/settings" });
  const navigate = useNavigate({ from: "/settings" });
  const section = SECTIONS.find((candidate) => candidate.id === requested) ?? SECTIONS[0];
  const sectionId: SectionId = section.id;
  const setSectionId = (id: SectionId) => void navigate({ search: { section: id }, replace: true });
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <nav
        aria-label="Settings"
        className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-line p-2 pt-4"
      >
        <div className="px-2.5 pb-2 text-[11.5px] font-medium text-faint">Settings</div>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={id === sectionId ? "page" : undefined}
            onClick={() => setSectionId(id)}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/60",
              id === sectionId
                ? "bg-active font-medium text-fg"
                : "text-muted hover:bg-hover hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <section.Page key={section.id} />
      </div>
    </div>
  );
}
