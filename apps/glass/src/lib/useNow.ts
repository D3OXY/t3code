import { useSyncExternalStore } from "react";

interface Clock {
  readonly subscribe: (listener: () => void) => () => void;
  readonly read: () => number;
}

// One shared clock per cadence, so a hundred sidebar rows re-render together
// from a single interval instead of each running its own timer.
const clocks = new Map<number, Clock>();

function makeClock(intervalMs: number): Clock {
  let now = Date.now();
  let timer: number | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      if (timer === null) {
        now = Date.now();
        timer = window.setInterval(() => {
          now = Date.now();
          for (const notify of listeners) notify();
        }, intervalMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      };
    },
    read: () => now,
  };
}

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = makeClock(intervalMs);
    clocks.set(intervalMs, clock);
  }
  return clock;
}

/** The current time, refreshed every `intervalMs` while any component is subscribed. */
export function useNow(intervalMs = 30_000): number {
  const clock = clockFor(intervalMs);
  return useSyncExternalStore(clock.subscribe, clock.read);
}
