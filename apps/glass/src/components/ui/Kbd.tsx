import type { ReactNode } from "react";

export function Kbd({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-hover px-1 font-sans text-[10.5px] font-medium text-muted">
      {children}
    </kbd>
  );
}
