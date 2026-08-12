import { type Metadata } from "next";

import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { PricingPlans } from "@/components/landing/pricing/pricing-plans";
import { GITHUB_REPO_URL } from "@/core/site/links";

export const metadata: Metadata = {
  title: "Pricing — bookistudios AI",
  description:
    "Plans for bookistudios AI, from the free self-hosted Community tier to hosted Pro, Team, and Enterprise deployments.",
};

const FAQS = [
  {
    question: "Is bookistudios AI really free?",
    answer:
      "Yes. The harness is MIT licensed and the Community tier stays free forever. Clone the repo, bring your own model API keys, and run the whole thing on your own hardware. The paid tiers exist for people who would rather not operate sandboxes, queues, and storage themselves.",
  },
  {
    question: "What counts as a task?",
    answer:
      "A task is one agent run — a thread turn that plans, calls tools, and produces a result. Long-running research or coding runs that span hours still count as a single task; it is the run, not the wall-clock time, that is metered.",
  },
  {
    question: "Can I bring my own model keys on a paid plan?",
    answer:
      "Yes. Paid plans accept your own provider keys for any supported model. When you supply your own keys the inference cost is billed by that provider directly, and your plan covers the hosted sandboxes, memory, and orchestration.",
  },
  {
    question: "Can I switch or cancel later?",
    answer:
      "Change tiers whenever you like — upgrades apply immediately and downgrades take effect at the end of the current period. Cancelling leaves your data exportable, and self-hosting on the Community tier is always available as a fallback.",
  },
  {
    question: "Do you offer discounts for open-source projects?",
    answer:
      "We do. Maintainers of public open-source projects and academic researchers can open an issue on the repository describing the project, and we will sort out a discounted or sponsored plan.",
  },
];

export default function PricingPage() {
  return (
    // `dark` pins the dark palette for this subtree: the page is painted on a
    // hardcoded dark canvas, and only `/` is force-themed by ThemeProvider.
    <div className="dark text-foreground min-h-screen w-full bg-[#0a0a0a]">
      <Header />
      <main className="flex w-full flex-col">
        <section className="container-md mx-auto flex flex-col items-center px-4 pt-32 pb-8 md:pt-40">
          <h1 className="bg-linear-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-center text-5xl font-bold text-transparent md:text-6xl">
            Pricing
          </h1>
          <p className="text-muted-foreground mt-6 max-w-2xl text-center text-xl">
            Start free and self-hosted. Move to a managed workspace when you
            want sandboxes, memory, and long-running tasks handled for you.
          </p>
        </section>

        <section className="container-md mx-auto px-4 pb-16">
          <PricingPlans />
        </section>

        <section className="container-md mx-auto px-4 py-16">
          <h2 className="bg-linear-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-center text-4xl font-bold text-transparent">
            Questions
          </h2>
          <dl className="mx-auto mt-12 flex max-w-3xl flex-col gap-8">
            {FAQS.map((faq) => (
              <div
                key={faq.question}
                className="rounded-2xl border border-white/10 bg-white/2 p-6"
              >
                <dt className="text-lg font-medium">{faq.question}</dt>
                <dd className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {faq.answer}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground mt-10 text-center text-sm">
            Still unsure which tier fits?{" "}
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              Read the docs on GitHub
            </a>{" "}
            or open an issue and ask.
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
