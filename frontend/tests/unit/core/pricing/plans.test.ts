import { describe, expect, it } from "vitest";

import {
  getMaxYearlyDiscountPercent,
  getPlanAmount,
  getYearlyDiscountPercent,
  PLANS,
  type Plan,
} from "@/core/pricing/plans";

function planById(id: string): Plan {
  const plan = PLANS.find((candidate) => candidate.id === id);
  if (!plan) {
    throw new Error(`Unknown plan: ${id}`);
  }
  return plan;
}

describe("pricing plans", () => {
  it("exposes unique plan ids", () => {
    const ids = PLANS.map((plan) => plan.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("highlights exactly one plan", () => {
    expect(PLANS.filter((plan) => plan.highlighted)).toHaveLength(1);
  });

  it("gives every plan a call to action and features", () => {
    for (const plan of PLANS) {
      expect(plan.cta.href).not.toBe("");
      expect(plan.cta.label).not.toBe("");
      expect(plan.features.length).toBeGreaterThan(0);
    }
  });

  it("prices yearly billing at or below the monthly run rate", () => {
    for (const plan of PLANS) {
      if (plan.price.kind !== "paid") continue;
      expect(plan.price.yearly).toBeLessThanOrEqual(plan.price.monthly * 12);
    }
  });
});

describe("getPlanAmount", () => {
  it("returns the monthly price as-is", () => {
    expect(getPlanAmount(planById("pro"), "monthly")).toBe(20);
  });

  it("amortises the yearly price over twelve months", () => {
    expect(getPlanAmount(planById("pro"), "yearly")).toBe(16);
  });

  it("returns null for free and custom tiers", () => {
    expect(getPlanAmount(planById("community"), "monthly")).toBeNull();
    expect(getPlanAmount(planById("enterprise"), "yearly")).toBeNull();
  });
});

describe("getYearlyDiscountPercent", () => {
  it("computes the whole-percent saving for paid tiers", () => {
    // 20/mo -> 240/yr at list, sold at 192/yr = 20% off.
    expect(getYearlyDiscountPercent(planById("pro"))).toBe(20);
  });

  it("is zero for tiers without a numeric price", () => {
    expect(getYearlyDiscountPercent(planById("community"))).toBe(0);
    expect(getYearlyDiscountPercent(planById("enterprise"))).toBe(0);
  });

  it("is zero when the yearly price saves nothing", () => {
    const plan: Plan = {
      ...planById("pro"),
      price: { kind: "paid", monthly: 10, yearly: 120 },
    };
    expect(getYearlyDiscountPercent(plan)).toBe(0);
  });
});

describe("getMaxYearlyDiscountPercent", () => {
  it("reports the largest saving across the tiers", () => {
    expect(getMaxYearlyDiscountPercent()).toBe(20);
  });

  it("is zero when no plan offers a yearly saving", () => {
    expect(getMaxYearlyDiscountPercent([planById("community")])).toBe(0);
  });
});
