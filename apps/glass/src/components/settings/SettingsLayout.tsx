import type { ReactNode } from "react";

import { cn } from "~/lib/cn";

/** A settings page: title, optional lede, then groups. */
export function SettingsPage({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="animate-fade-in mx-auto w-full max-w-2xl px-8 pt-8 pb-16">
      <h1 className="text-[18px] font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      <div className="mt-6 flex flex-col gap-7">{children}</div>
    </div>
  );
}

/** A titled block of rows inside a hairline card. */
export function SettingsGroup({
  title,
  description,
  action,
  children,
}: {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section>
      {title || action ? (
        <div className="mb-2 flex items-end gap-3 px-1">
          <div className="min-w-0 flex-1">
            {title ? <h2 className="text-[12.5px] font-medium text-muted">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-[12px] text-faint">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-hover/40">
        {children}
      </div>
    </section>
  );
}

/** One label/control row in a group. */
export function SettingsRow({
  label,
  description,
  children,
  className,
}: {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("flex min-h-12 items-center gap-4 px-4 py-2.5", className)}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[12px] break-words text-muted">{description}</div>
        ) : null}
      </div>
      {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** A compact on/off switch for settings rows. */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40",
        checked ? "bg-accent" : "bg-active",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 ease-out",
          checked && "translate-x-[14px]",
        )}
      />
    </button>
  );
}

/** A small status pill. */
export function Badge({
  tone = "neutral",
  children,
}: {
  readonly tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-hover text-muted",
        tone === "success" && "bg-success/12 text-success",
        tone === "warning" && "bg-warning/12 text-warning",
        tone === "danger" && "bg-danger/12 text-danger",
        tone === "accent" && "bg-accent/15 text-accent",
      )}
    >
      {children}
    </span>
  );
}
