import { X } from "lucide-react";
import { create } from "zustand";

import { cn } from "~/lib/cn";

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: "error" | "info";
}

const useToastStore = create<{ readonly toasts: ReadonlyArray<Toast> }>(() => ({ toasts: [] }));
let nextToastId = 1;

/** Shows a short-lived message in the corner. Errors linger longer than info. */
export function showToast(message: string, tone: Toast["tone"] = "error") {
  const id = nextToastId++;
  useToastStore.setState((state) => ({
    toasts: [...state.toasts.slice(-3), { id, message, tone }],
  }));
  window.setTimeout(() => dismissToast(id), tone === "error" ? 7000 : 3500);
}

function dismissToast(id: number) {
  useToastStore.setState((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
}

/** Mount once near the root. */
export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            "glass-pop animate-fade-in pointer-events-auto flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px]",
            toast.tone === "error" && "text-danger",
          )}
        >
          <span className="min-w-0 flex-1 break-words">{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissToast(toast.id)}
            className="text-muted hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
