import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "~/lib/cn";

const VARIANTS = {
  primary: "bg-fg text-bg hover:opacity-90 active:opacity-80",
  accent: "bg-accent text-accent-fg hover:opacity-90 active:opacity-80",
  secondary: "bg-hover text-fg hover:bg-active border border-line",
  ghost: "text-muted hover:text-fg hover:bg-hover",
  danger: "bg-danger/15 text-danger hover:bg-danger/25",
  outline: "border border-line-strong text-fg hover:bg-hover",
} as const;

const SIZES = {
  xs: "h-6 px-2 text-xs gap-1 rounded-md",
  sm: "h-7 px-2.5 text-[13px] gap-1.5 rounded-lg",
  md: "h-8 px-3 text-[13px] gap-2 rounded-lg",
  lg: "h-10 px-4 text-sm gap-2 rounded-xl",
  icon: "size-7 rounded-lg justify-center",
  "icon-sm": "size-6 rounded-md justify-center",
  "icon-lg": "size-9 rounded-full justify-center",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: keyof typeof VARIANTS;
  readonly size?: keyof typeof SIZES;
}

/** The one button. Pick a variant and size; layout classes go on the parent. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "ghost", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center font-medium whitespace-nowrap transition-[background-color,color,opacity] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
