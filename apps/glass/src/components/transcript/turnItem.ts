import type { OrchestrationV2TurnItem } from "@t3tools/contracts";

/** The turn item variant with the given `type`. */
export type ItemOf<T extends OrchestrationV2TurnItem["type"]> = Extract<
  OrchestrationV2TurnItem,
  { readonly type: T }
>;

/** The item is still in flight: started, running, or waiting on the user. */
export const isLive = (status: OrchestrationV2TurnItem["status"]) =>
  status === "running" || status === "pending" || status === "waiting";
