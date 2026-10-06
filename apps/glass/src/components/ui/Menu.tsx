import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/cn";

export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;
export const MenuRadioGroup = MenuPrimitive.RadioGroup;
export const MenuSubmenu = MenuPrimitive.SubmenuRoot;
export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const POPUP_CLASS =
  "glass-pop animate-menu-in min-w-44 max-w-[calc(100vw-2rem)] rounded-xl p-1 outline-none text-[13px]";

export interface MenuPopupProps {
  readonly children: ReactNode;
  readonly side?: "top" | "bottom" | "left" | "right";
  readonly align?: "start" | "center" | "end";
  readonly sideOffset?: number;
  readonly className?: string;
}

/** A positioned, glass menu surface. `className` is for width only. */
export function MenuPopup({
  children,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  className,
}: MenuPopupProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} className="z-50">
        <MenuPrimitive.Popup className={cn(POPUP_CLASS, className)}>
          <div className="max-h-(--available-height) overflow-y-auto">{children}</div>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function ContextMenuPopup({ children, className }: Omit<MenuPopupProps, "side" | "align">) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner className="z-50">
        <ContextMenuPrimitive.Popup className={cn(POPUP_CLASS, className)}>
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

const ITEM_CLASS =
  "flex w-full cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none select-none data-[highlighted]:bg-active data-[disabled]:opacity-40";

export function MenuItem({
  children,
  onClick,
  icon,
  shortcut,
  danger = false,
  disabled = false,
  closeOnClick = true,
}: {
  readonly children: ReactNode;
  readonly onClick?: () => void | undefined;
  readonly icon?: ReactNode | undefined;
  readonly shortcut?: string | undefined;
  readonly danger?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly closeOnClick?: boolean | undefined;
}) {
  return (
    <MenuPrimitive.Item
      className={cn(ITEM_CLASS, danger && "text-danger")}
      onClick={onClick}
      disabled={disabled}
      closeOnClick={closeOnClick}
    >
      {icon ? (
        <span className="grid size-4 shrink-0 place-items-center text-muted">{icon}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut ? <span className="ml-4 text-[11px] text-faint">{shortcut}</span> : null}
    </MenuPrimitive.Item>
  );
}

export function MenuRadioItem({
  value,
  children,
  icon,
  description,
}: {
  readonly value: string;
  readonly children: ReactNode;
  readonly icon?: ReactNode | undefined;
  readonly description?: ReactNode | undefined;
}) {
  return (
    <MenuPrimitive.RadioItem value={value} className={ITEM_CLASS} closeOnClick>
      {icon ? <span className="grid size-4 shrink-0 place-items-center">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {description ? (
          <span className="block truncate text-xs text-faint">{description}</span>
        ) : null}
      </span>
      <MenuPrimitive.RadioItemIndicator className="text-fg">
        <Check className="size-3.5" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

export function MenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
}: {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={ITEM_CLASS}
      closeOnClick={false}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <MenuPrimitive.CheckboxItemIndicator>
        <Check className="size-3.5" />
      </MenuPrimitive.CheckboxItemIndicator>
    </MenuPrimitive.CheckboxItem>
  );
}

export function MenuSubmenuTrigger({
  children,
  icon,
}: {
  readonly children: ReactNode;
  readonly icon?: ReactNode | undefined;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger className={ITEM_CLASS}>
      {icon ? (
        <span className="grid size-4 shrink-0 place-items-center text-muted">{icon}</span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRight className="size-3.5 text-faint" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export function MenuLabel({ children }: { readonly children: ReactNode }) {
  return <div className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-faint">{children}</div>;
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="mx-1 my-1 h-px bg-line" />;
}
