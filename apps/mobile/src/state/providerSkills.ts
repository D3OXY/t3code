import type {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ServerProviderSkill,
  ThreadId,
} from "@t3tools/contracts";

import { serverEnvironment } from "./server";
import { useEnvironmentQuery } from "./query";

export function useProviderSkills(input: {
  readonly environmentId: EnvironmentId | null;
  readonly instanceId: ProviderInstanceId | null;
  readonly projectId: ProjectId | null;
  readonly threadId?: ThreadId | null;
  readonly fallback: ReadonlyArray<ServerProviderSkill>;
}): ReadonlyArray<ServerProviderSkill> {
  const query = useEnvironmentQuery(
    input.environmentId && input.projectId && input.instanceId
      ? serverEnvironment.providerSkills({
          environmentId: input.environmentId,
          input: {
            instanceId: input.instanceId,
            projectId: input.projectId,
            ...(input.threadId ? { threadId: input.threadId } : {}),
          },
        })
      : null,
  );
  return query.data?.skills ?? input.fallback;
}
