import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

import { cn } from "~/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogClose = DialogPrimitive.Close;

const SIZES = {
  sm: "w-[min(24rem,calc(100vw-2rem))]",
  md: "w-[min(28rem,calc(100vw-2rem))]",
  lg: "w-[min(32rem,calc(100vw-2rem))]",
  xl: "w-[min(36rem,calc(100vw-2rem))]",
  auto: "w-auto max-w-[min(92vw,1400px)]",
} as const;

/** A centered glass dialog. Pick a `size`; `className` is for overflow/layout only. */
export function DialogPopup({
  children,
  className,
  size = "lg",
  title,
  description,
  initialFocus,
  position = "center",
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly size?: keyof typeof SIZES;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly initialFocus?: DialogPrimitive.Popup.Props["initialFocus"];
  /** "top" anchors near the top like a command palette. */
  readonly position?: "center" | "top";
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="animate-fade-quick fixed inset-0 z-50 bg-black/30" />
      <DialogPrimitive.Popup
        initialFocus={initialFocus}
        className={cn(
          "glass-pop animate-dialog-in fixed left-1/2 z-50 -translate-x-1/2 rounded-2xl outline-none",
          SIZES[size],
          position === "center" ? "top-1/2 -translate-y-1/2" : "top-[12vh]",
          className,
        )}
      >
        {title ? (
          <div className="px-5 pt-5">
            <DialogPrimitive.Title className="text-[15px] font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-[13px] text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
        ) : null}
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}
