import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* ─────────────── Button ─────────────── */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium font-sans transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[.99] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-paper hover:bg-primary/90",
        gradient: "bg-primary text-primary-foreground shadow-paper hover:bg-primary/90",
        secondary: "border border-border bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border border-border bg-card text-foreground hover:bg-secondary hover:text-foreground",
        ghost: "hover:bg-secondary hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground shadow-paper hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm",
        sm: "h-7 rounded-sm px-2.5 text-xs",
        lg: "h-11 rounded px-6 text-base font-semibold",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);
Button.displayName = "Button";

/* ─────────────── Card ─────────────── */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded border border-border bg-card text-card-foreground shadow-paper transition-all duration-200",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1 p-5 pb-3 border-b border-border/40", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-serif text-lg font-normal tracking-tight text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-muted-foreground leading-relaxed", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-4", className)} {...props} />;
}

/* ─────────────── Badge ─────────────── */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary/10 text-primary",
        secondary: "border-border bg-secondary text-secondary-foreground",
        success: "border-success/30 bg-success/10 text-success dark:text-emerald-400",
        warning: "border-warning/30 bg-warning/10 text-warning dark:text-amber-400",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive dark:text-rose-400",
        outline: "border-border text-muted-foreground",
        sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        violet: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* ─────────────── Inputs ─────────────── */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      className={cn(
        "flex h-10 w-full rounded border border-border bg-card px-3.5 py-2 text-sm font-sans text-foreground transition-all placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded border border-border bg-card px-3.5 py-2 text-sm font-sans text-foreground transition-all placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-none font-sans select-none", className)}
      {...props}
    />
  );
}

/* ─────────────── Avatar ─────────────── */
const avatarPalette = [
  "bg-[#E8D5C0] text-[#641E32] border border-[#A79A8C]",
  "bg-sky-50 text-sky-900 border border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
  "bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
  "bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  "bg-stone-100 text-stone-900 border border-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:border-stone-700",
  "bg-slate-100 text-slate-900 border border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
];

export function Avatar({
  name,
  className,
  icon,
}: {
  name: string;
  className?: string;
  icon?: boolean;
}) {
  const hue = name.length % avatarPalette.length;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded font-serif font-normal select-none tracking-tight",
        icon ? "h-9 w-9 [&_svg]:size-4" : "h-9 w-9 text-xs",
        avatarPalette[hue],
        className
      )}
      title={name}
    >
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}

/* ─────────────── Empty state ─────────────── */
export function EmptyState({
  emoji = "🗂",
  title,
  description,
  action,
}: {
  emoji?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded border border-dashed border-border py-12 px-4 text-center bg-card/40">
      <div className="text-3xl opacity-80" aria-hidden>{emoji}</div>
      <p className="font-serif text-base font-normal tracking-tight text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ─────────────── Skeleton ─────────────── */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse-soft rounded bg-muted/70",
        className
      )}
    />
  );
}

/* ─────────────── Progress ─────────────── */
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-xs bg-secondary border border-border/40", className)}>
      <div
        className="h-full bg-primary transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ─────────────── Stat card ─────────────── */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "primary" | "warning" | "success";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "bg-secondary text-muted-foreground border-border",
    primary: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    success: "bg-success/10 text-success border-success/20",
  };
  return (
    <Card className={cn("group p-5 hover:border-primary/40 transition-colors", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="uppercase text-[11px] font-semibold tracking-wider text-muted-foreground">{label}</p>
          <p className="font-serif text-3xl font-normal tracking-tight text-foreground tabular-nums">{value}</p>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        {icon && (
          <div className={cn("rounded border p-2 text-xs transition-colors", tones[tone])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

