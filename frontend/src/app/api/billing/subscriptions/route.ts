import { NextResponse } from "next/server";

import {
  MAX_SEATS,
  MIN_SEATS,
  PAID_PLANS,
  type BillingCycle,
  type PaidPlanId,
} from "@/core/pricing/plans";

function isPaidPlanId(v: unknown): v is PaidPlanId {
  return v === "pro" || v === "team";
}

const SECRET = process.env.STRIPE_SECRET_KEY;
const PUBLISHABLE = process.env.STRIPE_PUBLISHABLE_KEY;

async function stripePost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + SECRET,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message ?? `Stripe ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function POST(req: Request) {
  if (!SECRET || !PUBLISHABLE) {
    return NextResponse.json(
      { error: "Payments are not configured yet." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  const plan = body.plan;
  if (!isPaidPlanId(plan)) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
  }
  const cycle: BillingCycle = body.cycle === "annual" ? "annual" : "monthly";
  const qty = Math.min(
    MAX_SEATS,
    Math.max(MIN_SEATS, Number(body.seats) || 1),
  );
  const priceId = PAID_PLANS[plan][cycle].priceId;

  try {
    // 1. customer (email comes from the checkout form when present)
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const customer = await stripePost("/customers", email ? { email } : {});

    // 2. subscription with an initial incomplete state — no charge until the
    //    Payment Element is confirmed on the client.
    const sub = await stripePost("/subscriptions", {
      customer: customer.id,
      "items[0][price]": priceId,
      "items[0][quantity]": String(qty),
      payment_behavior: "default_incomplete",
      "expand[0]": "latest_invoice.payment_intent",
      "metadata[app]": "bsai",
      "metadata[plan]": plan,
      "metadata[cycle]": cycle,
    });

    const clientSecret =
      sub?.latest_invoice?.payment_intent?.client_secret ?? null;
    if (!clientSecret) {
      return NextResponse.json(
        { error: "Could not start subscription. Try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      clientSecret,
      publishableKey: PUBLISHABLE,
      subscriptionId: sub.id,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Payment setup failed. Try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
