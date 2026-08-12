import { describe, expect, it } from "vitest";

import {
  COMPARISON_COLUMNS,
  COMPARISON_ROWS,
  computeTotals,
  describeLineItem,
  isPaidPlanId,
  MAX_SEATS,
  money,
  nextRenewalDate,
  normalizeCycle,
  normalizeSeats,
  PAID_PLANS,
  resolvePromo,
  TIERS,
} from "@/core/pricing/plans";

describe("plan catalogue", () => {
  it("exposes the five tiers in display order", () => {
    expect(TIERS.map((tier) => tier.id)).toEqual([
      "self-hosted",
      "free",
      "pro",
      "team",
      "enterprise",
    ]);
  });

  it("features exactly one tier", () => {
    expect(TIERS.filter((tier) => tier.featured)).toHaveLength(1);
  });

  it("routes only Pro and Team through checkout", () => {
    const checkoutTiers = TIERS.filter(
      (tier) => tier.action.kind === "checkout",
    ).map((tier) => tier.id);
    expect(checkoutTiers).toEqual(["pro", "team"]);
  });

  it("prices annual at twelve times the advertised monthly rate", () => {
    for (const plan of Object.values(PAID_PLANS)) {
      expect(plan.annual.billed).toBe(plan.annual.amount * 12);
      expect(plan.annual.amount).toBeLessThan(plan.monthly.amount);
    }
  });

  it("gives every comparison row a cell per column", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.values).toHaveLength(COMPARISON_COLUMNS.length);
    }
  });
});

describe("money", () => {
  it("drops a trailing .00", () => {
    expect(money(24)).toBe("$24");
    expect(money(228)).toBe("$228");
  });

  it("keeps cents when they matter", () => {
    expect(money(182.4)).toBe("$182.40");
    expect(money(18.25)).toBe("$18.25");
  });
});

describe("computeTotals", () => {
  it("charges the monthly rate on a monthly cycle", () => {
    const totals = computeTotals({ plan: "pro", cycle: "monthly", seats: 1 });
    expect(totals.base).toBe(24);
    expect(totals.total).toBe(24);
  });

  it("charges the full year up front on an annual cycle", () => {
    const totals = computeTotals({ plan: "pro", cycle: "annual", seats: 1 });
    expect(totals.base).toBe(228);
  });

  it("ignores seats for a flat plan", () => {
    const totals = computeTotals({ plan: "pro", cycle: "monthly", seats: 9 });
    expect(totals.seats).toBe(1);
    expect(totals.base).toBe(24);
  });

  it("multiplies by seats for a per-seat plan", () => {
    expect(
      computeTotals({ plan: "team", cycle: "monthly", seats: 3 }).base,
    ).toBe(177);
    expect(
      computeTotals({ plan: "team", cycle: "annual", seats: 3 }).base,
    ).toBe(1764);
  });

  it("applies a known promo to the base amount", () => {
    const totals = computeTotals({
      plan: "pro",
      cycle: "annual",
      seats: 1,
      promo: "LAUNCH20",
    });
    expect(totals.discount).toBeCloseTo(45.6);
    expect(totals.total).toBeCloseTo(182.4);
  });

  it("ignores an unknown promo", () => {
    const totals = computeTotals({
      plan: "pro",
      cycle: "annual",
      seats: 1,
      promo: "NOPE",
    });
    expect(totals.discount).toBe(0);
    expect(totals.total).toBe(228);
  });
});

describe("describeLineItem", () => {
  it("names the cycle for a flat plan", () => {
    expect(describeLineItem({ plan: "pro", cycle: "annual", seats: 4 })).toBe(
      "Pro · annual",
    );
  });

  it("includes the seat count for a per-seat plan", () => {
    expect(describeLineItem({ plan: "team", cycle: "monthly", seats: 4 })).toBe(
      "Team · monthly × 4 seats",
    );
  });
});

describe("query parameter parsing", () => {
  it("accepts only known paid plans", () => {
    expect(isPaidPlanId("pro")).toBe(true);
    expect(isPaidPlanId("team")).toBe(true);
    expect(isPaidPlanId("enterprise")).toBe(false);
    expect(isPaidPlanId(null)).toBe(false);
  });

  it("defaults the cycle to annual", () => {
    expect(normalizeCycle("monthly")).toBe("monthly");
    expect(normalizeCycle("annual")).toBe("annual");
    expect(normalizeCycle("nonsense")).toBe("annual");
    expect(normalizeCycle(null)).toBe("annual");
  });

  it("clamps seats into range", () => {
    expect(normalizeSeats("4")).toBe(4);
    expect(normalizeSeats(0)).toBe(1);
    expect(normalizeSeats(999)).toBe(MAX_SEATS);
    expect(normalizeSeats("abc")).toBe(3);
  });

  it("resolves promo codes case-insensitively", () => {
    expect(resolvePromo(" launch20 ")).toBe("LAUNCH20");
    expect(resolvePromo("OSS50")).toBe("OSS50");
    expect(resolvePromo("FAKE")).toBeNull();
    expect(resolvePromo("")).toBeNull();
  });
});

describe("nextRenewalDate", () => {
  it("lands a year out for annual", () => {
    expect(nextRenewalDate("annual", new Date("2026-08-12T00:00:00Z"))).toBe(
      "12 Aug 2027",
    );
  });

  it("lands a month out for monthly", () => {
    expect(nextRenewalDate("monthly", new Date("2026-08-12T00:00:00Z"))).toBe(
      "11 Sept 2026",
    );
  });
});
