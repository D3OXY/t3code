import type { OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import { memo } from "react";

import { ErrorCard, EventDivider, PlanCard, RequestRecord, SubagentCard } from "./Events";
import { AssistantMessage, UserMessage } from "./Messages";
import { ReasoningRow } from "./Reasoning";
import { ToolGroup } from "./ToolGroup";
import type { TranscriptRow } from "./transcriptRows";

function ItemRow({ row }: { readonly row: OrchestrationV2ProjectedTurnItem }) {
  const { item } = row;
  switch (item.type) {
    case "user_message":
      return <UserMessage row={row} item={item} />;
    case "assistant_message":
      return <AssistantMessage row={row} item={item} />;
    case "reasoning":
      return <ReasoningRow item={item} />;
    case "proposed_plan":
      return <PlanCard item={item} />;
    case "approval_request":
    case "user_input_request":
      return <RequestRecord item={item} />;
    case "error":
      return <ErrorCard item={item} />;
    case "subagent":
      return <SubagentCard item={item} />;
    default:
      return <EventDivider item={item} />;
  }
}

/** One transcript row. Memoized on the row object, which only changes when its items do. */
export const TranscriptRowView = memo(function TranscriptRowView({
  row,
}: {
  readonly row: TranscriptRow;
}) {
  return row.kind === "tools" ? <ToolGroup row={row} /> : <ItemRow row={row.row} />;
});
