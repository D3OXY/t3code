import type { HighlighterTypes } from "@pierre/diffs";
import { WorkerPoolContext, useWorkerPool } from "@pierre/diffs/react";
import { WorkerPoolManager } from "@pierre/diffs/worker";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { type ReactNode, useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { type DocumentTheme, useDocumentTheme } from "./useDocumentTheme";

/**
 * Oniguruma WASM only: the JS regex engine can backtrack catastrophically and
 * hang the tokenizing thread. The shared highlighter is first-caller-wins, so
 * the pool and every viewer must pass this.
 */
export const PREFERRED_HIGHLIGHTER: HighlighterTypes = "shiki-wasm";

export const diffThemeName = (theme: DocumentTheme) => `pierre-${theme}` as const;
type DiffThemeName = ReturnType<typeof diffThemeName>;

/** Provides the shared syntax-highlighting worker pool to Pierre diff viewers below it. */
export function DiffWorkerPoolProvider({ children }: { readonly children: ReactNode }) {
  const theme = diffThemeName(useDocumentTheme());
  const pool = useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const entry = acquirePool(theme);
        onChange();
        return () => {
          entry.consumers -= 1;
          if (entry.consumers !== 0) return;
          entry.idleTimer = window.setTimeout(() => {
            entry.pool.terminate();
            if (shared === entry) shared = undefined;
          }, IDLE_TTL_MS);
        };
      },
      [theme],
    ),
    () => shared?.pool,
    () => undefined,
  );
  return (
    <WorkerPoolContext value={pool}>
      <ThemeSync theme={theme} />
      <PoolReady>{children}</PoolReady>
    </WorkerPoolContext>
  );
}

const IDLE_TTL_MS = 30_000;
let shared:
  | {
      readonly pool: WorkerPoolManager;
      consumers: number;
      idleTimer: number | undefined;
    }
  | undefined;

// Workers are created when the first viewer commits and kept warm across
// short pane closures, then terminated once idle.
function acquirePool(theme: DiffThemeName) {
  const cores = Math.max(1, navigator.hardwareConcurrency || 4);
  const entry = (shared ??= {
    pool: new WorkerPoolManager(
      {
        workerFactory: () => new DiffsWorker(),
        poolSize: Math.max(2, Math.min(4, Math.floor(cores / 2))),
        totalASTLRUCacheSize: 160,
      },
      {
        theme,
        preferredHighlighter: PREFERRED_HIGHLIGHTER,
        tokenizeMaxLineLength: 1_000,
        useTokenTransformer: true,
      },
    ),
    consumers: 0,
    idleTimer: undefined,
  });
  window.clearTimeout(entry.idleTimer);
  entry.idleTimer = undefined;
  entry.consumers += 1;
  return entry;
}

function ThemeSync({ theme }: { readonly theme: DiffThemeName }) {
  const pool = useWorkerPool();
  useEffect(() => {
    if (!pool) return;
    const current = pool.getDiffRenderOptions();
    if (current.theme === theme) return;
    void pool.setRenderOptions({ ...current, theme }).catch(() => undefined);
  }, [pool, theme]);
  return null;
}

// Holds rendering until the pool is up, so the first paint is highlighted
// instead of flashing plain text. A failed pool falls back to the main thread.
function PoolReady({ children }: { readonly children: ReactNode }) {
  const pool = useWorkerPool();
  const [readyPool, setReadyPool] = useState<WorkerPoolManager>();
  const ready = pool ? readyPool === pool || pool.isInitialized() || !pool.isWorkingPool() : false;
  useEffect(() => {
    if (ready || !pool) return;
    let mounted = true;
    const finish = () => mounted && setReadyPool(pool);
    void pool.initialize().then(finish, finish);
    return () => {
      mounted = false;
    };
  }, [pool, ready]);
  return ready ? (
    children
  ) : (
    <div role="status" className="grid flex-1 place-items-center text-xs text-faint">
      Loading highlighter…
    </div>
  );
}
