import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

import { Kbd } from "./Kbd";

export const TooltipProvider = TooltipPrimitive.Provider;

/** Wraps a single interactive element with a small label and optional shortcut. */
export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  readonly label: ReactNode;
  readonly shortcut?: string | undefined;
  readonly side?: "top" | "bottom" | "left" | "right";
  readonly children: ReactElement;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} sideOffset={6} className="z-[60]">
          <TooltipPrimitive.Popup className="glass-pop animate-fade-quick flex items-center gap-2 rounded-lg px-2 py-1 text-xs">
            {label}
            {shortcut ? <Kbd>{shortcut}</Kbd> : null}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
