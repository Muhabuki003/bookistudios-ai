"use client";

import { type BillingCycle } from "@/core/pricing/plans";
import { cn } from "@/lib/utils";

export function BillingCycleToggle({
  cycle,
  onChange,
  size = "md",
  className,
}: {
  cycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Billing cycle"
      className={cn("bg-secondary inline-flex rounded-full p-1", className)}
    >
      <CyclePill
        selected={cycle === "monthly"}
        size={size}
        onClick={() => onChange("monthly")}
      >
        Monthly
      </CyclePill>
      <CyclePill
        selected={cycle === "annual"}
        size={size}
        onClick={() => onChange("annual")}
      >
        Annual
      </CyclePill>
    </div>
  );
}

function CyclePill({
  selected,
  size,
  onClick,
  children,
}: {
  selected: boolean;
  size: "sm" | "md";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full transition-colors",
        size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-4 py-1.5 text-[13px]",
        selected
          ? "bg-card text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground bg-transparent",
      )}
    >
      {children}
    </button>
  );
}
