import * as Cache from "effect/Cache";
import * as Duration from "effect/Duration";
import type * as Effect from "effect/Effect";

const PROVIDER_SKILLS_CACHE_CAPACITY = 16;
const PROVIDER_SKILLS_CACHE_TTL = Duration.seconds(5);

export function makeProviderSkillsCache<A>(lookup: (cwd: string) => Effect.Effect<A>) {
  return Cache.make({
    capacity: PROVIDER_SKILLS_CACHE_CAPACITY,
    timeToLive: PROVIDER_SKILLS_CACHE_TTL,
    lookup,
  });
}
