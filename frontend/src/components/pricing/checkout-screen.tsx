"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BillingCycleToggle } from "@/components/pricing/billing-cycle-toggle";
import {
  computeTotals,
  describeLineItem,
  isPaidPlanId,
  MAX_SEATS,
  MIN_SEATS,
  money,
  nextRenewalDate,
  normalizeCycle,
  normalizeSeats,
  PROMOS,
  resolvePromo,
  type BillingCycle,
  type PaidPlanId,
} from "@/core/pricing/plans";
import { cn } from "@/lib/utils";

const inputClass =
  "border-input bg-background w-full rounded-[10px] border px-[13px] py-[11px] text-sm";

export function CheckoutScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const initialPlan = params.get("plan");
  const [plan, setPlan] = useState<PaidPlanId>(
    isPaidPlanId(initialPlan) ? initialPlan : "pro",
  );
  const [cycle, setCycle] = useState<BillingCycle>(
    normalizeCycle(params.get("cycle")),
  );
  const [seats, setSeats] = useState(normalizeSeats(params.get("seats")));
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [promoError, setPromoError] = useState("");
  const [processing, setProcessing] = useState(false);

  const totals = computeTotals({ plan, cycle, seats, promo: applied });
  const perSeat = totals.plan.perSeat;

  function applyPromo() {
    const code = resolvePromo(promo);
    if (code) {
      setApplied(code);
      setPromoError("");
    } else {
      setApplied(null);
      setPromoError(promo.trim() ? "That code isn't valid." : "");
    }
  }

  /**
   * The Stripe call goes here:
   *   1. POST /api/billing/subscriptions { priceId, seats, promoCode } -> clientSecret
   *   2. stripe.confirmPayment({ elements, confirmParams: { return_url } })
   * Until that endpoint exists this hands off to the receipt screen, which
   * recomputes the same figures from the query string.
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessing(true);
    const query = new URLSearchParams({
      plan,
      cycle,
      seats: String(totals.seats),
    });
    if (applied) {
      query.set("promo", applied);
    }
    router.push(`/pricing/success?${query.toString()}`);
  }

  return (
    <main className="mx-auto max-w-[1080px] px-8 pt-14">
      <Link href="/pricing" className="text-muted-foreground text-[13px]">
        ← Back to plans
      </Link>
      <h1 className="mt-4 mb-10 font-serif text-[38px] font-normal">
        Checkout
      </h1>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_380px]">
        <form
          onSubmit={handleSubmit}
          className="border-border bg-card flex flex-col gap-[22px] rounded-[14px] border p-7"
        >
          <div>
            <h2 className="mb-3.5 text-[15px] font-semibold">Contact</h2>
            <label
              htmlFor="checkout-email"
              className="text-muted-foreground mb-1.5 block text-[12.5px]"
            >
              Email
            </label>
            <input
              id="checkout-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@company.com"
              className={inputClass}
            />
          </div>

          <PaymentElementPlaceholder />

          <div>
            <h2 className="mb-3.5 text-[15px] font-semibold">
              Billing address
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                aria-label="Name on card"
                autoComplete="name"
                placeholder="Name on card"
                className={cn(inputClass, "sm:col-span-2")}
              />
              <input
                aria-label="Country"
                autoComplete="country-name"
                placeholder="Country"
                className={inputClass}
              />
              <input
                aria-label="Company (optional)"
                autoComplete="organization"
                placeholder="Company (optional)"
                className={inputClass}
              />
              <input
                aria-label="VAT / Tax ID (optional)"
                placeholder="VAT / Tax ID (optional)"
                className={cn(inputClass, "sm:col-span-2")}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={processing}
            className={cn(
              "border-foreground bg-foreground text-background w-full rounded-[10px] border px-4 py-[13px] text-[14.5px] font-medium",
              processing ? "cursor-wait opacity-70" : "cursor-pointer",
            )}
          >
            {processing
              ? "Processing…"
              : `Pay ${money(totals.total)} and subscribe`}
          </button>
          <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
            By subscribing you agree to the Terms and authorise recurring
            charges until you cancel. Cancel any time from the billing page.
          </p>
        </form>

        <aside className="border-border bg-card sticky top-[88px] flex flex-col gap-[18px] rounded-[14px] border p-6">
          <h2 className="text-[15px] font-semibold">Order summary</h2>

          <div className="flex flex-col gap-2">
            <PlanRadio
              value="pro"
              selected={plan === "pro"}
              onSelect={setPlan}
              title="Pro"
              detail="4,000 runs · 25M tokens / month"
            />
            <PlanRadio
              value="team"
              selected={plan === "team"}
              onSelect={setPlan}
              title="Team"
              detail="10,000 runs / user · shared skills"
            />
          </div>

          <BillingCycleToggle
            cycle={cycle}
            onChange={setCycle}
            size="sm"
            className="self-start"
          />

          {perSeat && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13.5px]">Seats</span>
              <span className="border-input inline-flex items-center overflow-hidden rounded-lg border">
                <button
                  type="button"
                  aria-label="Remove a seat"
                  onClick={() => setSeats((s) => Math.max(MIN_SEATS, s - 1))}
                  className="cursor-pointer px-3 py-1.5 text-[15px]"
                >
                  −
                </button>
                <span className="min-w-8 text-center text-sm">
                  {totals.seats}
                </span>
                <button
                  type="button"
                  aria-label="Add a seat"
                  onClick={() => setSeats((s) => Math.min(MAX_SEATS, s + 1))}
                  className="cursor-pointer px-3 py-1.5 text-[15px]"
                >
                  +
                </button>
              </span>
            </div>
          )}

          <div className="border-border flex flex-col gap-2.5 border-t pt-4 text-[13.5px]">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {describeLineItem({ plan, cycle, seats })}
              </span>
              <span>{money(totals.base)}</span>
            </div>
            {applied && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {PROMOS[applied]?.label}
                </span>
                <span>−{money(totals.discount)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Tax</span>
              <span className="text-muted-foreground">
                Calculated by Stripe
              </span>
            </div>
          </div>

          <div className="border-border flex items-baseline justify-between border-t pt-4">
            <span className="text-sm font-semibold">Due today</span>
            <span className="text-2xl">{money(totals.total)}</span>
          </div>
          <p className="text-muted-foreground -mt-2 text-[11.5px]">
            {cycle === "annual"
              ? `Renews ${nextRenewalDate("annual")} at ${money(totals.base)}.`
              : `Renews monthly on the ${new Date().getDate()}th.`}
          </p>

          <div className="border-border border-t pt-4">
            <label
              htmlFor="promo-code"
              className="text-muted-foreground mb-1.5 block text-[12.5px]"
            >
              Promo code
            </label>
            <div className="flex gap-2">
              <input
                id="promo-code"
                value={promo}
                onChange={(event) => setPromo(event.target.value.toUpperCase())}
                placeholder="LAUNCH20"
                className="border-input bg-background min-w-0 flex-1 rounded-[10px] border px-3 py-2.5 text-[13.5px] uppercase"
              />
              <button
                type="button"
                onClick={applyPromo}
                className="border-foreground cursor-pointer rounded-[10px] border px-3.5 py-2.5 text-[13.5px]"
              >
                Apply
              </button>
            </div>
            <p
              className={cn(
                "mt-2 text-xs",
                applied
                  ? "text-foreground"
                  : promoError
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              {applied
                ? `${PROMOS[applied]?.label} applied.`
                : promoError || "Try LAUNCH20 or OSS50."}
            </p>
          </div>
        </aside>
      </div>

    </main>
  );
}

function PlanRadio({
  value,
  selected,
  onSelect,
  title,
  detail,
}: {
  value: PaidPlanId;
  selected: boolean;
  onSelect: (plan: PaidPlanId) => void;
  title: string;
  detail: string;
}) {
  return (
    <label className="border-input flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-3">
      <input
        type="radio"
        name="plan"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="mt-0.5"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-xs">{detail}</span>
      </span>
    </label>
  );
}

/**
 * Layout stand-in for the Stripe Payment Element. The fields are read-only on
 * purpose — card details must be captured by Stripe's iframe, never by our own
 * inputs — and this block is replaced wholesale once the element is mounted.
 */
function PaymentElementPlaceholder() {
  return (
    <div>
      <div className="mb-3.5 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Payment</h2>
        <span className="text-muted-foreground text-[11.5px]">
          Secured by Stripe
        </span>
      </div>
      <div
        id="payment-element"
        data-stripe-mount="payment-element"
        className="flex flex-col gap-3"
      >
        <div>
          <span className="text-muted-foreground mb-1.5 block text-[12.5px]">
            Card number
          </span>
          <input
            readOnly
            tabIndex={-1}
            aria-hidden
            placeholder="4242 4242 4242 4242"
            className={cn(inputClass, "text-muted-foreground")}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["Expiry", "CVC", "ZIP"].map((label, index) => (
            <div key={label}>
              <span className="text-muted-foreground mb-1.5 block text-[12.5px]">
                {label}
              </span>
              <input
                readOnly
                tabIndex={-1}
                aria-hidden
                placeholder={["MM / YY", "123", "94107"][index]}
                className={cn(inputClass, "text-muted-foreground")}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
