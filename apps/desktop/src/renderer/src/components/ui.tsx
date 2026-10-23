import clsx, { type ClassValue } from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function Panel({
  children,
  className,
  lit = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  lit?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("panel grain", lit && "panel-lit", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("kicker", className)}>{children}</div>;
}

export function StatusDot({ tone = "muted" }: { tone?: "ok" | "warn" | "bad" | "muted" }) {
  const colors = {
    ok: "bg-moss shadow-[0_0_8px_rgba(124,138,88,0.8)]",
    warn: "bg-gold shadow-[0_0_8px_rgba(201,163,90,0.7)]",
    bad: "bg-blood shadow-[0_0_8px_rgba(142,61,54,0.8)]",
    muted: "bg-faint",
  } as const;
  return <span className={cn("inline-block size-1.5 rounded-full", colors[tone])} />;
}

export function Metric({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="kicker">{label}</div>
      <div className="mt-1 truncate font-mono text-sm text-parchment">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-faint">{hint}</div> : null}
    </div>
  );
}
