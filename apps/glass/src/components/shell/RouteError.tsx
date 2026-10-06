import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

import { Button } from "~/components/ui/Button";

/** Shown instead of a blank page when a route throws while rendering. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="relative grid h-full place-items-center overflow-hidden">
      <div className="wallpaper" aria-hidden />
      <div className="glass animate-dialog-in relative w-[min(28rem,calc(100vw-2rem))] rounded-3xl border border-line-strong p-7 shadow-pop">
        <div className="mb-4 grid size-10 place-items-center rounded-xl bg-danger/15 text-danger">
          <TriangleAlert className="size-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">Something broke</h1>
        <p className="mt-1.5 text-[13px] break-words text-muted">{message}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
