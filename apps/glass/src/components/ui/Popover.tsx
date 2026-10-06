import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ReactNode } from "react";

import { cn } from "~/lib/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

/** A positioned glass panel for pickers. `className` is for width/height only. */
export function PopoverPopup({
  children,
  side = "bottom",
  align = "start",
  sideOffset = 8,
  className,
  initialFocus,
}: {
  readonly children: ReactNode;
  readonly side?: "top" | "bottom" | "left" | "right";
  readonly align?: "start" | "center" | "end";
  readonly sideOffset?: number;
  readonly className?: string;
  readonly initialFocus?: PopoverPrimitive.Popup.Props["initialFocus"];
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          initialFocus={initialFocus}
          className={cn(
            "glass-pop animate-menu-in max-h-(--available-height) max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl text-[13px] outline-none",
            className,
          )}
        >
          {/* Pickers swap their content on click (list → detail). That unmounts the
              clicked element before the click reaches the document, where the
              outside-press check would see a detached target and close the popover.
              Inside clicks never need to reach the document. */}
          <div className="contents" onClick={(event) => event.stopPropagation()}>
            {children}
          </div>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
