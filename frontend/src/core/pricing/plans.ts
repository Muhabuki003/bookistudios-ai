import { GITHUB_ISSUES_URL, GITHUB_REPO_URL } from "@/core/site/links";

export type BillingCycle = "monthly" | "annual";

/** The two tiers that go through checkout. */
export type PaidPlanId = "pro" | "team";

export interface CycleRate {
  /** Headline per-month amount shown on the card. */
  amount: number;
  /** Total charged up front on an annual subscription. */
  billed?: number;
  priceId: string;
}

export interface PaidPlan {
  name: string;
  monthly: CycleRate;
  annual: CycleRate & { billed: number };
  perSeat: boolean;
}

/**
 * One object holds every price. Swap the placeholder ids for real Stripe price
 * ids and the pricing, checkout and receipt screens all follow.
 */
export const PAID_PLANS: Record<PaidPlanId, PaidPlan> = {
  pro: {
    name: "Pro",
    monthly: { amount: 24, priceId: "price_pro_monthly_REPLACE" },
    annual: { amount: 19, billed: 228, priceId: "price_pro_annual_REPLACE" },
    perSeat: false,
  },
  team: {
    name: "Team",
    monthly: { amount: 59, priceId: "price_team_monthly_REPLACE" },
    annual: { amount: 49, billed: 588, priceId: "price_team_annual_REPLACE" },
    perSeat: true,
  },
};

export interface Promo {
  off: number;
  label: string;
}

export const PROMOS: Record<string, Promo> = {
  LAUNCH20: { off: 0.2, label: "LAUNCH20 · 20% off" },
  OSS50: { off: 0.5, label: "OSS50 · 50% off first year" },
};

export const MIN_SEATS = 1;
export const MAX_SEATS = 50;

export type TierPrice =
  | { kind: "fixed"; amount: number; suffix: string }
  | { kind: "paid"; plan: PaidPlanId }
  | { kind: "custom" };

export type TierAction =
  | { kind: "checkout"; plan: PaidPlanId; label: string }
  | { kind: "link"; href: string; label: string; external?: boolean };

export interface Tier {
  id: string;
  name: string;
  tagline: string;
  price: TierPrice;
  /** Small line under the price; paid tiers override it per cycle. */
  note?: string;
  action: TierAction;
  features: string[];
  featured?: boolean;
  badge?: string;
  /** Enterprise sits on a tinted card rather than the default card colour. */
  muted?: boolean;
}

export const TIERS: Tier[] = [
  {
    id: "self-hosted",
    name: "Self-hosted",
    tagline: "Your machine, your keys",
    price: { kind: "fixed", amount: 0, suffix: "forever" },
    note: "MIT license · no account needed",
    action: {
      kind: "link",
      label: "Read the install guide",
      href: `${GITHUB_REPO_URL}/blob/main/Install.md`,
      external: true,
    },
    features: [
      "Full agent harness, unlimited runs",
      "Bring your own model keys",
      "Local, Docker or Kubernetes sandboxes",
      "All built-in and custom skills",
      "Sub-agents, memory, MCP servers",
      "Community support on GitHub",
    ],
  },
  {
    id: "free",
    name: "Free",
    tagline: "Hosted, no card",
    price: { kind: "fixed", amount: 0, suffix: "/ month" },
    note: "No credit card required",
    action: { kind: "link", label: "Start free", href: "/workspace" },
    features: [
      "300 agent runs / month",
      "60 messages / day",
      "2M tokens / month",
      "1 concurrent task",
      "5 scheduled tasks · 2 projects",
      "1 GB workspace storage",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For daily driving an agent",
    price: { kind: "paid", plan: "pro" },
    action: { kind: "checkout", plan: "pro", label: "Subscribe" },
    featured: true,
    badge: "Most popular",
    features: [
      "4,000 agent runs / month",
      "Unlimited messages",
      "25M tokens / month",
      "4 concurrent tasks · 4 sub-agents",
      "Unlimited scheduled tasks · 50 projects",
      "50 GB storage · long-term memory",
      "Deploy sites and dashboards from a run",
    ],
  },
  {
    id: "team",
    name: "Team",
    tagline: "Shared skills and runs",
    price: { kind: "paid", plan: "team" },
    action: { kind: "checkout", plan: "team", label: "Start a team" },
    features: [
      "10,000 agent runs / user / month",
      "60M tokens / month, pooled",
      "8 concurrent tasks · 8 sub-agents",
      "Shared skill library and agents",
      "Roles, seats and usage dashboard",
      "200 GB pooled storage",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Self-host with a contract",
    price: { kind: "custom" },
    note: "Annual, invoiced",
    action: {
      kind: "link",
      label: "Talk to us",
      href: `${GITHUB_ISSUES_URL}/new`,
      external: true,
    },
    muted: true,
    features: [
      "Unlimited runs and seats",
      "VPC or on-prem deployment",
      "SSO / SAML, audit logs, IP allowlist",
      "Private model routing",
      "SLA, dedicated support channel",
      "Security review and DPA",
    ],
  },
];

export interface ComparisonRow {
  label: string;
  /** Cells in tier order: self-hosted, free, pro, team, enterprise. */
  values: [string, string, string, string, string];
}

export const COMPARISON_COLUMNS = [
  "Self-hosted",
  "Free",
  "Pro",
  "Team",
  "Enterprise",
] as const;

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "Agent runs / month",
    values: ["Unlimited", "300", "4,000", "10,000 / user", "Unlimited"],
  },
  {
    label: "Messages / day",
    values: ["Unlimited", "60", "Unlimited", "Unlimited", "Unlimited"],
  },
  {
    label: "Included tokens / month",
    values: ["Your keys", "2M", "25M", "60M pooled", "Negotiated"],
  },
  {
    label: "Concurrent tasks",
    values: ["Hardware-bound", "1", "4", "8", "Custom"],
  },
  {
    label: "Sub-agents per run",
    values: ["Unlimited", "1", "4", "8", "Custom"],
  },
  {
    label: "Scheduled tasks",
    values: ["Unlimited", "5", "Unlimited", "Unlimited", "Unlimited"],
  },
  {
    label: "Workspace storage",
    values: ["Your disk", "1 GB", "50 GB", "200 GB pooled", "Custom"],
  },
  {
    label: "Long-term memory",
    values: [
      "Local",
      "7-day",
      "Persistent",
      "Persistent + shared",
      "Persistent + shared",
    ],
  },
  {
    label: "Custom skills & MCP servers",
    values: [
      "Yes",
      "3 skills",
      "Unlimited",
      "Unlimited + shared",
      "Unlimited + shared",
    ],
  },
  {
    label: "IM channels (Slack, Telegram…)",
    values: [
      "Yes",
      "1 channel",
      "All channels",
      "All channels",
      "All channels",
    ],
  },
  {
    label: "Deploy sites with a database",
    values: ["Self-managed", "—", "Yes", "Yes", "Yes"],
  },
  {
    label: "Support",
    values: [
      "Community",
      "Community",
      "Email, 2 business days",
      "Priority email",
      "SLA + shared channel",
    ],
  },
  {
    label: "SSO / SAML, audit logs",
    values: ["—", "—", "—", "SSO", "SSO + SAML + audit"],
  },
];

export const PRICING_FAQS = [
  {
    question: "What counts as an agent run?",
    answer:
      "One task the lead agent accepts and carries to completion, including every sub-agent it spawns. Follow-up messages in the same thread are not new runs.",
  },
  {
    question: "What happens when I hit a limit?",
    answer:
      "Runs queue instead of failing. You can add your own model keys to keep going without a token allowance, or upgrade mid-cycle and only pay the prorated difference.",
  },
  {
    question: "Is the self-hosted version limited?",
    answer:
      "No. It is the same MIT-licensed harness under the same repository — skills, sub-agents, sandboxes, memory, IM channels. Hosted plans pay for infrastructure and managed inference, not features.",
  },
  {
    question: "Can I move between self-hosted and cloud?",
    answer:
      "Yes. Threads, memory and skills export as plain files and import into either. Your config.yaml carries over unchanged.",
  },
  {
    question: "Refunds?",
    answer:
      "Cancel any time from the billing page. Annual plans are refundable in full within 14 days.",
  },
];

/** `$24`, `$228`, `$19.50` — trailing `.00` is dropped. */
export function money(amount: number): string {
  return "$" + amount.toFixed(2).replace(/\.00$/, "");
}

export function isPaidPlanId(
  value: string | null | undefined,
): value is PaidPlanId {
  return value === "pro" || value === "team";
}

export function normalizeCycle(value: string | null | undefined): BillingCycle {
  return value === "monthly" ? "monthly" : "annual";
}

export function normalizeSeats(
  value: string | number | null | undefined,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 3;
  }
  return Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.trunc(parsed)));
}

/** Resolves a promo code to a known promo, ignoring case and padding. */
export function resolvePromo(code: string | null | undefined): string | null {
  const normalized = code?.trim().toUpperCase();
  return normalized && PROMOS[normalized] ? normalized : null;
}

export interface TotalsInput {
  plan: PaidPlanId;
  cycle: BillingCycle;
  seats: number;
  /** An already-applied promo code, or null. */
  promo?: string | null;
}

export interface Totals {
  plan: PaidPlan;
  rate: CycleRate;
  seats: number;
  /** Charge before any discount. */
  base: number;
  discount: number;
  total: number;
}

/**
 * Annual subscriptions charge the full year up front; monthly charges the
 * per-month rate. Per-seat plans multiply by seat count, flat plans ignore it.
 */
export function computeTotals({
  plan,
  cycle,
  seats,
  promo = null,
}: TotalsInput): Totals {
  const paidPlan = PAID_PLANS[plan];
  const rate = cycle === "annual" ? paidPlan.annual : paidPlan.monthly;
  const billedSeats = paidPlan.perSeat ? normalizeSeats(seats) : 1;
  const unit = cycle === "annual" ? paidPlan.annual.billed : rate.amount;
  const base = unit * billedSeats;
  const applied = resolvePromo(promo);
  const discount = applied ? base * (PROMOS[applied]?.off ?? 0) : 0;

  return {
    plan: paidPlan,
    rate,
    seats: billedSeats,
    base,
    discount,
    total: base - discount,
  };
}

/** `Pro · annual`, `Team · monthly × 3 seats`. */
export function describeLineItem({
  plan,
  cycle,
  seats,
}: Omit<TotalsInput, "promo">): string {
  const { plan: paidPlan, seats: billedSeats } = computeTotals({
    plan,
    cycle,
    seats,
  });
  const suffix = paidPlan.perSeat ? ` × ${billedSeats} seats` : "";
  return `${paidPlan.name} · ${cycle}${suffix}`;
}

/** Renewal date one cycle out, formatted like `12 Aug 2027`. */
export function nextRenewalDate(
  cycle: BillingCycle,
  from: Date = new Date(),
): string {
  const days = cycle === "annual" ? 365 : 30;
  return new Date(from.getTime() + days * 864e5).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
