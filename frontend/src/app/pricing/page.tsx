import { type Metadata } from "next";

import { ComparisonTable } from "@/components/pricing/comparison-table";
import { PlanGrid } from "@/components/pricing/plan-grid";
import { PricingFaq } from "@/components/pricing/pricing-faq";

export const metadata: Metadata = {
  title: "Pricing — bookistudios AI",
  description:
    "Self-host the MIT-licensed harness for free, or use a hosted plan with managed sandboxes, persistent memory and scheduled agents.",
};

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-8 pt-18">
      <div className="max-w-[720px]">
        <h1 className="mb-4 font-serif text-[52px] leading-[1.05] font-normal tracking-[-0.01em]">
          Run the harness yourself, or let us run it.
        </h1>
        <p className="text-foreground/75 text-[17px] leading-[1.6] text-pretty">
          bookistudios AI is MIT-licensed and free forever when you self-host.
          The hosted plans add managed sandboxes, persistent memory, and
          scheduled agents — at roughly a third of what hosted-only agent
          products charge for the same capability tier.
        </p>
      </div>

      <PlanGrid className="mt-10" />
      <ComparisonTable className="mt-24" />
      <PricingFaq className="mt-24" />
    </main>
  );
}
