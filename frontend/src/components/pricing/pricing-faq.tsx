import { PRICING_FAQS } from "@/core/pricing/plans";
import { cn } from "@/lib/utils";

export function PricingFaq({ className }: { className?: string }) {
  return (
    <section className={cn("grid gap-12 md:grid-cols-[280px_1fr]", className)}>
      <h2 className="font-serif text-[32px] font-normal">Questions</h2>
      <div className="flex flex-col">
        {PRICING_FAQS.map((faq, index) => (
          <div
            key={faq.question}
            className={cn(
              "border-border border-t py-5",
              index === PRICING_FAQS.length - 1 && "border-b",
            )}
          >
            <h3 className="mb-1.5 text-[15px] font-semibold">{faq.question}</h3>
            <p className="text-foreground/75 text-sm leading-[1.6]">
              {faq.answer}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
