"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─────────────── Dialog ─────────────── */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs data-[state=open]:animate-fade-in" />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
        <DialogPrimitive.Content
          className={cn(
            "pointer-events-auto relative max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded border border-border bg-card p-6 shadow-paper data-[state=open]:animate-scale-in",
            className
          )}
          {...props}
        >
          <div className="mb-4 space-y-1.5 pr-8 border-b border-border/50 pb-3">
            <DialogPrimitive.Title className="font-serif text-xl font-normal tracking-tight text-foreground">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-xs text-muted-foreground leading-relaxed">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          {children}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-xs p-1 opacity-60 transition-opacity hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-1 focus:ring-ring">
            <X className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

/* ─────────────── Select ─────────────── */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between rounded border border-input bg-card px-3 py-1.5 text-sm shadow-2xs focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        "relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded border border-border bg-popover text-popover-foreground shadow-paper data-[state=open]:animate-scale-in",
        position === "popper" && "mt-1 w-full min-w-[var(--radix-select-trigger-width)]",
        className
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-xs py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-4 items-center justify-center text-primary">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

