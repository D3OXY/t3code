import { SidebarProjectGroupingMode } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import {
  deriveProjectGroupingOverrideKey,
  selectProjectGroupingSettings,
  withProjectGroupingOverride,
} from "../../logicalProject";
import type { SidebarProjectGroupMember } from "../../sidebarProjectGrouping";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";

export const PROJECT_GROUPING_MODE_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};

const isGroupingMode = Schema.is(SidebarProjectGroupingMode);

/**
 * Picks one checkout's grouping rule. Overrides are client settings keyed by
 * environment and path, so they apply on this device only.
 */
export function ProjectGroupingSelect({ member }: { member: SidebarProjectGroupMember }) {
  const settings = useClientSettings(selectProjectGroupingSettings);
  const updateClientSettings = useUpdateClientSettings();
  const selection =
    settings.sidebarProjectGroupingOverrides[deriveProjectGroupingOverrideKey(member)] ?? "inherit";

  return (
    <Select
      value={selection}
      onValueChange={(value) => {
        if (value === selection || (value !== "inherit" && !isGroupingMode(value))) return;
        void updateClientSettings({
          sidebarProjectGroupingOverrides: withProjectGroupingOverride(
            settings.sidebarProjectGroupingOverrides,
            member,
            value,
          ),
        });
      }}
    >
      <SelectTrigger
        size="sm"
        className="w-full sm:w-56"
        aria-label={`Grouping for ${member.workspaceRoot}`}
      >
        <SelectValue>
          {selection === "inherit"
            ? `Default (${PROJECT_GROUPING_MODE_LABELS[settings.sidebarProjectGroupingMode]})`
            : PROJECT_GROUPING_MODE_LABELS[selection]}
        </SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        <SelectItem hideIndicator value="inherit">
          Use default
        </SelectItem>
        {SidebarProjectGroupingMode.literals.map((mode) => (
          <SelectItem key={mode} hideIndicator value={mode}>
            {PROJECT_GROUPING_MODE_LABELS[mode]}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
