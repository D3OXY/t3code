import type { ReactNode } from "react";

import { cn } from "~/lib/cn";

/** A small segmented control for 2–4 mutually exclusive options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: T;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: ReactNode }>;
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-hover p-0.5" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
            option.value === value ? "bg-raised text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
