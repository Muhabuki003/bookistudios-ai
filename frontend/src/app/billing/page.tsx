import { type Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Billing — bookistudios AI",
  description: "Manage your bookistudios AI subscription, usage and invoices.",
};

/**
 * Sample figures. Wire these to the billing API — `GET /api/billing/summary`
 * for the plan and usage, `GET /api/billing/invoices` for the table — or link
 * straight out to the Stripe customer portal.
 */
const SUBSCRIPTION = {
  plan: "Pro · Annual",
  summary: "$228 / year · renews 12 Aug 2027",
};

const USAGE = [
  { label: "Agent runs", detail: "1,284 of 4,000", percent: 32 },
  { label: "Tokens", detail: "14.2M of 25M", percent: 57 },
  { label: "Workspace storage", detail: "8.4 GB of 50 GB", percent: 17 },
];

const INVOICES = [
  { date: "12 Aug 2026", description: "Pro · Annual", amount: "$228.00" },
  { date: "12 Aug 2025", description: "Pro · Annual", amount: "$228.00" },
  { date: "12 Jul 2025", description: "Pro · Monthly", amount: "$24.00" },
];

export default function BillingPage() {
  return (
    <main className="mx-auto max-w-[880px] px-8 pt-14">
      <h1 className="mb-8 font-serif text-[38px] font-normal">Billing</h1>

      <section className="border-border bg-card mb-5 rounded-[14px] border p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-muted-foreground mb-1 text-xs tracking-[0.04em] uppercase">
              Current plan
            </p>
            <h2 className="mb-1.5 font-serif text-[26px] font-normal">
              {SUBSCRIPTION.plan}
            </h2>
            <p className="text-foreground/75 text-[13.5px]">
              {SUBSCRIPTION.summary}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/pricing"
              className="border-foreground hover:bg-secondary cursor-pointer rounded-[10px] border px-3.5 py-2.5 text-[13.5px]"
            >
              Change plan
            </Link>
            <button
              type="button"
              className="border-border text-muted-foreground hover:text-foreground cursor-pointer rounded-[10px] border px-3.5 py-2.5 text-[13.5px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </section>

      <section className="border-border bg-card mb-5 rounded-[14px] border p-6">
        <h2 className="mb-[18px] text-[15px] font-semibold">
          Usage this cycle
        </h2>
        <div className="flex flex-col gap-[18px]">
          {USAGE.map((meter) => (
            <div key={meter.label}>
              <div className="mb-2 flex justify-between text-[13.5px]">
                <span>{meter.label}</span>
                <span className="text-muted-foreground">{meter.detail}</span>
              </div>
              <div
                role="meter"
                aria-label={meter.label}
                aria-valuenow={meter.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="bg-border h-1.5 overflow-hidden rounded-full"
              >
                <div
                  className="bg-foreground h-full"
                  style={{ width: `${meter.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-border bg-card mb-5 flex flex-wrap items-center justify-between gap-6 rounded-[14px] border p-6">
        <div>
          <h2 className="mb-1.5 text-[15px] font-semibold">Payment method</h2>
          <p className="text-foreground/75 text-[13.5px]">
            Visa ending 4242 · expires 04 / 29
          </p>
        </div>
        <button
          type="button"
          className="border-foreground hover:bg-secondary cursor-pointer rounded-[10px] border px-3.5 py-2.5 text-[13.5px]"
        >
          Update card
        </button>
      </section>

      <section className="border-border bg-card rounded-[14px] border p-6">
        <h2 className="mb-1 text-[15px] font-semibold">Invoices</h2>
        <table className="w-full border-collapse text-[13.5px]">
          <tbody>
            {INVOICES.map((invoice) => (
              <tr key={invoice.date} className="border-border border-t">
                <td className="py-3.5">{invoice.date}</td>
                <td className="text-muted-foreground py-3.5">
                  {invoice.description}
                </td>
                <td className="py-3.5">{invoice.amount}</td>
                <td className="py-3.5 text-right">
                  <span className="text-muted-foreground">PDF</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted-foreground mt-4 text-xs">
          Sample data. Invoices are served from Stripe — wire this list to{" "}
          <code className="font-mono">GET /api/billing/invoices</code> or link
          straight to the Stripe portal.
        </p>
      </section>
    </main>
  );
}
