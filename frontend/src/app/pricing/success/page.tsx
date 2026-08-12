import { type Metadata } from "next";
import Link from "next/link";

import {
  computeTotals,
  isPaidPlanId,
  money,
  nextRenewalDate,
  normalizeCycle,
  normalizeSeats,
} from "@/core/pricing/plans";

export const metadata: Metadata = {
  title: "Subscription confirmed — bookistudios AI",
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const planParam = first("plan");
  const plan = isPaidPlanId(planParam) ? planParam : "pro";
  const cycle = normalizeCycle(first("cycle"));
  const seats = normalizeSeats(first("seats"));
  const totals = computeTotals({ plan, cycle, seats, promo: first("promo") });

  const receiptPlan = totals.plan.perSeat
    ? `${totals.plan.name} · ${totals.seats} seats`
    : totals.plan.name;

  return (
    <main className="mx-auto max-w-[640px] px-8 pt-24">
      <div className="border-border bg-card rounded-[14px] border p-10">
        <div className="bg-foreground text-background mb-6 flex size-11 items-center justify-center rounded-full text-xl">
          ✓
        </div>
        <h1 className="mb-2.5 font-serif text-[32px] font-normal">
          You&apos;re on {totals.plan.name}.
        </h1>
        <p className="text-foreground/75 mb-7 text-[15px] leading-[1.6]">
          Your workspace limits are live already. A receipt is on its way to
          your email.
        </p>

        <dl className="border-border flex flex-col gap-3 rounded-xl border p-5 text-[13.5px]">
          <ReceiptRow label="Plan" value={receiptPlan} />
          <ReceiptRow
            label="Billing"
            value={cycle === "annual" ? "Annual" : "Monthly"}
          />
          <ReceiptRow label="Charged" value={money(totals.total)} />
          <ReceiptRow label="Next invoice" value={nextRenewalDate(cycle)} />
        </dl>

        <div className="mt-7 flex flex-wrap gap-2.5">
          <Link
            href="/workspace"
            className="border-foreground bg-foreground text-background cursor-pointer rounded-[10px] border px-[18px] py-[11px] text-sm font-medium"
          >
            Open workspace
          </Link>
          <Link
            href="/billing"
            className="border-foreground hover:bg-secondary cursor-pointer rounded-[10px] border px-[18px] py-[11px] text-sm"
          >
            Manage subscription
          </Link>
        </div>
      </div>
    </main>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
