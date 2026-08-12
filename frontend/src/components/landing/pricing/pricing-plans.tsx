"use client";

import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import SpotlightCard from "@/components/ui/spotlight-card";
import {
  getMaxYearlyDiscountPercent,
  getPlanAmount,
  PLANS,
  type BillingPeriod,
  type Plan,
} from "@/core/pricing/plans";
import { cn } from "@/lib/utils";

export function PricingPlans({ className }: { className?: string }) {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const maxDiscount = getMaxYearlyDiscountPercent();

  return (
    <div className={cn("flex w-full flex-col items-center", className)}>
      <BillingToggle
        period={period}
        onChange={setPeriod}
        discountPercent={maxDiscount}
      />
      <div className="mt-12 grid w-full grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} period={period} />
        ))}
      </div>
      <p className="text-muted-foreground mt-10 text-center text-sm">
        All prices in USD. bookistudios AI is MIT licensed — the Community tier
        is free forever.
      </p>
    </div>
  );
}

function BillingToggle({
  period,
  onChange,
  discountPercent,
}: {
  period: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  discountPercent: number;
}) {
  return (
    <div
      role="group"
      aria-label="Billing period"
      className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1"
    >
      <BillingToggleButton
        selected={period === "monthly"}
        onClick={() => onChange("monthly")}
      >
        Monthly
      </BillingToggleButton>
      <BillingToggleButton
        selected={period === "yearly"}
        onClick={() => onChange("yearly")}
      >
        Yearly
        {discountPercent > 0 && (
          <span
            className={cn(
              "ml-2 rounded-full px-2 py-0.5 text-xs font-medium",
              period === "yearly"
                ? "bg-black/10 text-current"
                : "bg-white/10 text-white/70",
            )}
          >
            −{discountPercent}%
          </span>
        )}
      </BillingToggleButton>
    </div>
  );
}

function BillingToggleButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors",
        selected
          ? "bg-white text-black"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PlanCard({ plan, period }: { plan: Plan; period: BillingPeriod }) {
  const amount = getPlanAmount(plan, period);

  return (
    <SpotlightCard
      className={cn(
        "flex h-full flex-col rounded-2xl border p-8 text-left",
        plan.highlighted
          ? "border-white/25 bg-white/5"
          : "border-white/10 bg-white/2",
      )}
      spotlightColor={
        plan.highlighted
          ? "rgba(255, 255, 255, 0.18)"
          : "rgba(255, 255, 255, 0.08)"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-serif text-2xl">{plan.name}</h3>
        {plan.badge && (
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
            {plan.badge}
          </span>
        )}
      </div>

      <p className="text-muted-foreground mt-3 min-h-12 text-sm">
        {plan.tagline}
      </p>

      <div className="mt-6 flex min-h-16 flex-col justify-center">
        <PlanPriceLabel plan={plan} amount={amount} period={period} />
      </div>

      <Button
        asChild
        size="lg"
        variant={plan.highlighted ? "default" : "outline"}
        className="mt-6 w-full"
      >
        {plan.cta.external ? (
          <a
            href={plan.cta.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${plan.name}: ${plan.cta.label}`}
          >
            {plan.cta.label}
          </a>
        ) : (
          <Link
            href={plan.cta.href}
            aria-label={`${plan.name}: ${plan.cta.label}`}
          >
            {plan.cta.label}
          </Link>
        )}
      </Button>

      <ul className="mt-8 flex flex-col gap-3 text-sm">
        {plan.features.map((feature) => (
          <li key={feature.label} className="flex items-start gap-3">
            <CheckIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-white/70"
            />
            <span
              className={cn(feature.muted && "text-muted-foreground italic")}
            >
              {feature.label}
            </span>
          </li>
        ))}
      </ul>
    </SpotlightCard>
  );
}

function PlanPriceLabel({
  plan,
  amount,
  period,
}: {
  plan: Plan;
  amount: number | null;
  period: BillingPeriod;
}) {
  if (plan.price.kind === "free") {
    return (
      <>
        <span className="text-4xl font-bold">Free</span>
        <span className="text-muted-foreground mt-1 text-sm">
          Self-hosted, forever
        </span>
      </>
    );
  }

  if (plan.price.kind === "custom" || amount === null) {
    return (
      <>
        <span className="text-4xl font-bold">Custom</span>
        <span className="text-muted-foreground mt-1 text-sm">
          Priced to your deployment
        </span>
      </>
    );
  }

  const unit = plan.price.kind === "paid" ? plan.price.unit : undefined;

  return (
    <>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold">${formatAmount(amount)}</span>
        <span className="text-muted-foreground text-sm">/ month</span>
      </div>
      <span className="text-muted-foreground mt-1 text-sm">
        {period === "yearly" ? "billed annually" : "billed monthly"}
        {unit ? `, ${unit}` : ""}
      </span>
    </>
  );
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
