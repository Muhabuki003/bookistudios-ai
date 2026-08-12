import { GITHUB_ISSUES_URL, GITHUB_REPO_URL } from "@/core/site/links";

export type BillingPeriod = "monthly" | "yearly";

export type PlanPrice =
  | { kind: "free" }
  | { kind: "custom" }
  | { kind: "paid"; monthly: number; yearly: number; unit?: string };

export interface PlanFeature {
  /** Feature copy shown next to the check mark. */
  label: string;
  /** Renders muted — used for "everything in the previous tier" style rows. */
  muted?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  price: PlanPrice;
  cta: {
    label: string;
    href: string;
    /** External links open in a new tab and get `rel="noopener noreferrer"`. */
    external?: boolean;
  };
  features: PlanFeature[];
  /** The visually emphasised tier in the grid. Exactly one plan sets this. */
  highlighted?: boolean;
  /** Small label rendered above a highlighted card. */
  badge?: string;
}

/**
 * Pricing tiers for bookistudios AI.
 *
 * Amounts are USD and are the list prices shown on the marketing page only —
 * nothing here charges a card. Wiring a checkout provider means replacing each
 * `cta.href` with the provider's session URL.
 */
export const PLANS: Plan[] = [
  {
    id: "community",
    name: "Community",
    tagline:
      "The full open-source harness, self-hosted on your own infrastructure.",
    price: { kind: "free" },
    cta: {
      label: "Self-host on GitHub",
      href: GITHUB_REPO_URL,
      external: true,
    },
    features: [
      { label: "Unlimited threads on your own hardware" },
      { label: "Bring your own model API keys" },
      { label: "Full skills library and custom skill files" },
      { label: "Local sandbox execution" },
      { label: "Community support on GitHub" },
      { label: "MIT licensed — fork it, ship it" },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Hosted agents with managed sandboxes for day-to-day deep work.",
    price: { kind: "paid", monthly: 20, yearly: 192 },
    cta: { label: "Start with Pro", href: "/workspace" },
    badge: "Most popular",
    highlighted: true,
    features: [
      { label: "Everything in Community", muted: true },
      { label: "Managed cloud sandboxes — no infrastructure to run" },
      { label: "Long-running tasks up to several hours" },
      { label: "Persistent memory across threads" },
      { label: "Artifacts: slides, web pages, podcasts, videos" },
      { label: "Priority model routing during peak hours" },
    ],
  },
  {
    id: "team",
    name: "Team",
    tagline: "Shared skills, shared memory, and seat management for a group.",
    price: { kind: "paid", monthly: 40, yearly: 384, unit: "per seat" },
    cta: { label: "Start with Team", href: "/workspace" },
    features: [
      { label: "Everything in Pro", muted: true },
      { label: "Shared skill library across the workspace" },
      { label: "Shared team memory and knowledge base" },
      { label: "Role-based access control and audit trail" },
      { label: "Centralised billing and seat management" },
      { label: "Higher concurrency limits per seat" },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Private deployment, custom models, and a support agreement.",
    price: { kind: "custom" },
    cta: {
      label: "Talk to us",
      href: `${GITHUB_ISSUES_URL}/new`,
      external: true,
    },
    features: [
      { label: "Everything in Team", muted: true },
      { label: "Single-tenant or on-premise deployment" },
      { label: "SSO / SAML and SCIM provisioning" },
      { label: "Custom model endpoints and private inference" },
      { label: "Dedicated support with an SLA" },
      { label: "Security review and compliance assistance" },
    ],
  },
];

/** Price for a period, or `null` when the tier has no numeric price. */
export function getPlanAmount(
  plan: Plan,
  period: BillingPeriod,
): number | null {
  if (plan.price.kind !== "paid") {
    return null;
  }
  return period === "monthly" ? plan.price.monthly : plan.price.yearly / 12;
}

/**
 * Whole-percent discount of the yearly price against 12x the monthly price.
 * Returns 0 when the tier is not paid or the yearly price saves nothing.
 */
export function getYearlyDiscountPercent(plan: Plan): number {
  if (plan.price.kind !== "paid") {
    return 0;
  }
  const fullPrice = plan.price.monthly * 12;
  if (fullPrice <= 0 || plan.price.yearly >= fullPrice) {
    return 0;
  }
  return Math.round(((fullPrice - plan.price.yearly) / fullPrice) * 100);
}

/** Largest yearly saving across all tiers — used for the billing toggle label. */
export function getMaxYearlyDiscountPercent(plans: Plan[] = PLANS): number {
  return plans.reduce(
    (max, plan) => Math.max(max, getYearlyDiscountPercent(plan)),
    0,
  );
}
