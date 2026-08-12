"use client";

import Link from "next/link";
import { useState } from "react";

import { BillingCycleToggle } from "@/components/pricing/billing-cycle-toggle";
import {
  money,
  PAID_PLANS,
  TIERS,
  type BillingCycle,
  type Tier,
} from "@/core/pricing/plans";
import { cn } from "@/lib/utils";

export function PlanGrid({ className }: { className?: string }) {
  const [cycle, setCycle] = useState<BillingCycle>("annual");

  return (
    <div className={className}>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <BillingCycleToggle cycle={cycle} onChange={setCycle} />
        <span className="text-muted-foreground text-[13px]">
          Annual billing saves 2 months.
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {TIERS.map((tier) => (
          <TierCard key={tier.id} tier={tier} cycle={cycle} />
        ))}
      </div>

      <p className="text-muted-foreground mt-5 text-[12.5px]">
        Hosted plans include model inference on our managed keys. Bring your own
        keys on any plan and runs stop counting against your token allowance.
      </p>
    </div>
  );
}

function TierCard({ tier, cycle }: { tier: Tier; cycle: BillingCycle }) {
  return (
    <section
      className={cn(
        "relative flex min-h-[520px] flex-col gap-4 rounded-[14px] border p-6",
        tier.featured
          ? "border-foreground bg-card shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_32px_rgba(0,0,0,0.06)]"
          : "border-border",
        tier.muted ? "bg-secondary" : !tier.featured && "bg-card",
      )}
    >
      {tier.badge && (
        <span className="bg-foreground text-background absolute -top-[11px] left-6 rounded-full px-2.5 py-1 text-[11px] tracking-[0.04em] uppercase">
          {tier.badge}
        </span>
      )}

      <div>
        <h2 className="mb-1 font-serif text-[22px] font-normal">{tier.name}</h2>
        <p className="text-muted-foreground text-[13px]">{tier.tagline}</p>
      </div>

      <TierPriceLabel tier={tier} cycle={cycle} />

      <TierAction tier={tier} cycle={cycle} />

      <ul className="border-border text-foreground/85 flex flex-col gap-2.5 border-t pt-3 text-[13.5px] leading-[1.45]">
        {tier.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </section>
  );
}

function TierPriceLabel({ tier, cycle }: { tier: Tier; cycle: BillingCycle }) {
  if (tier.price.kind === "custom") {
    return (
      <>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[34px] tracking-[-0.02em]">Custom</span>
        </div>
        <p className="text-muted-foreground text-xs">{tier.note}</p>
      </>
    );
  }

  if (tier.price.kind === "fixed") {
    return (
      <>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px]">$</span>
          <span className="text-[40px] tracking-[-0.02em]">
            {tier.price.amount}
          </span>
          <span className="text-muted-foreground text-[13px]">
            {tier.price.suffix}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">{tier.note}</p>
      </>
    );
  }

  const plan = PAID_PLANS[tier.price.plan];
  const rate = cycle === "annual" ? plan.annual : plan.monthly;
  const perSeat = plan.perSeat;

  return (
    <>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[15px]">$</span>
        <span className="text-[40px] tracking-[-0.02em]">{rate.amount}</span>
        <span className="text-muted-foreground text-[13px]">
          {perSeat ? "/ user / mo" : "/ month"}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        {cycle === "annual"
          ? `${money(plan.annual.billed)}${perSeat ? " / user" : ""} billed yearly`
          : perSeat
            ? "Billed monthly, per user"
            : "Billed monthly"}
      </p>
    </>
  );
}

function TierAction({ tier, cycle }: { tier: Tier; cycle: BillingCycle }) {
  const className = cn(
    "w-full cursor-pointer rounded-[10px] border px-4 py-[11px] text-center text-sm font-medium transition-colors",
    tier.featured
      ? "border-foreground bg-foreground text-background hover:bg-foreground/85"
      : "border-foreground text-foreground hover:bg-secondary bg-transparent",
  );

  if (tier.action.kind === "checkout") {
    return (
      <Link
        href={`/pricing/checkout?plan=${tier.action.plan}&cycle=${cycle}`}
        className={className}
      >
        {tier.action.label}
      </Link>
    );
  }

  if (tier.action.external) {
    return (
      <a
        href={tier.action.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {tier.action.label}
      </a>
    );
  }

  return (
    <Link href={tier.action.href} className={className}>
      {tier.action.label}
    </Link>
  );
}
