"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  type BillingCycle,
  type PaidPlanId,
} from "@/core/pricing/plans";
import { cn } from "@/lib/utils";

const inputClass =
  "border-input bg-background w-full rounded-[10px] border px-[13px] py-[11px] text-sm";

type StripeApi = {
  elements: (opts: {
    clientSecret: string;
    appearance?: Record<string, unknown>;
  }) => unknown;
  confirmPayment: (opts: {
    elements: unknown;
    redirect: "if_required";
    confirmParams: { return_url: string; receipt_email?: string };
  }) => Promise<{
    error?: { message: string };
    paymentIntent?: { status: string };
  }>;
};

type StripeCtor = (publishableKey: string) => StripeApi;

function loadStripeScript(): Promise<StripeCtor> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { Stripe?: StripeCtor };
    if (w.Stripe) return resolve(w.Stripe);
    const existing = document.querySelector(
      'script[src="https://js.stripe.com/v3/"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(w.Stripe as StripeCtor));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => resolve(w.Stripe as StripeCtor);
    script.onerror = () => reject(new Error("Stripe.js failed to load."));
    document.head.appendChild(script);
  });
}

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
  const [email, setEmail] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const totals = computeTotals({ plan, cycle, seats, promo: null });
  const perSeat = totals.plan.perSeat;

  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<{
    stripe: StripeApi;
    elements: unknown;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let paymentElement: {
      mount: (el: HTMLDivElement | null) => void;
      unmount: () => void;
    } | null = null;
    setError("");

    (async () => {
      try {
        const res = await fetch("/api/billing/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, cycle, seats }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Could not start checkout.");
        }
        const StripeCtor = await loadStripeScript();
        const stripe = StripeCtor(data.publishableKey);
        const elements = stripe.elements({
          clientSecret: data.clientSecret,
          appearance: { theme: "stripe" },
        });
        paymentElement = (
          elements as {
            create: (
              type: string,
            ) => {
              mount: (el: HTMLDivElement | null) => void;
              unmount: () => void;
            };
          }
        ).create("payment");
        paymentElement.mount(mountRef.current);
        stripeRef.current = { stripe, elements };
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not start checkout. Try again.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      stripeRef.current = null;
      try {
        paymentElement?.unmount();
      } catch {
        /* element may already be gone */
      }
    };
  }, [plan, cycle, seats]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = stripeRef.current;
    if (!current) {
      setError("Payment is still loading…");
      return;
    }
    setProcessing(true);
    setError("");

    const query = new URLSearchParams({
      plan,
      cycle,
      seats: String(totals.seats),
    });

    const result = await current.stripe.confirmPayment({
      elements: current.elements,
      redirect: "if_required",
      confirmParams: {
        return_url: `${window.location.origin}/pricing/success?${query.toString()}`,
        ...(email.trim() ? { receipt_email: email.trim() } : {}),
      },
    });

    if (result.error) {
      setError(result.error.message);
      setProcessing(false);
    } else if (result.paymentIntent?.status === "succeeded") {
      router.push(`/pricing/success?${query.toString()}`);
    } else {
      setProcessing(false);
    }
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <div className="mb-3.5 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Payment</h2>
              <span className="text-muted-foreground text-[11.5px]">
                Secured by Stripe
              </span>
            </div>
            <div
              id="payment-element"
              ref={mountRef}
              className="border-input bg-background rounded-[10px] border px-3 py-4"
            />
          </div>

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

          {error && (
            <p className="text-destructive text-[13px]" role="alert">
              {error}
            </p>
          )}

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
