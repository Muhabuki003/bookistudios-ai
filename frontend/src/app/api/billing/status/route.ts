import { NextResponse } from "next/server";

const SECRET = process.env.STRIPE_SECRET_KEY;
async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "GET",
    headers: {
      Authorization: "Bearer" + SECRET,
    },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Stripe ${res.status}`);
  }
  return json;
}

async function sessionEmail(req: Request): Promise<string> {
  const cookie = req.headers.get("cookie") ?? "";
  if (!cookie) return "";
  try {
    const res = await fetch("http://172.18.0.2:8003/api/v1/auth/me", {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return "";
    const me = await res.json();
    return typeof me.email === "string" ? me.email : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  if (!SECRET) {
    return NextResponse.json({ error: "Payments are not configured yet." }, { status: 503 });
  }

  let email = "";
  try {
    const body = await req.json();
    if (typeof body.email === "string") email = body.email.trim();
  } catch {
    /* ignore */
  }
  if (!email) email = await sessionEmail(req);
  if (!email) return NextResponse.json({ active: false });

  try {
    const customers = await stripeGet(
      `/customers?email=${encodeURIComponent(email)}&limit=1`,
    );
    const customer = customers?.data?.[0];
    if (!customer) return NextResponse.json({ active: false });

    const subs = await stripeGet(
      `/subscriptions?customer=${encodeURIComponent(customer.id)}&status=active&limit=1`,
    );
    const sub = subs?.data?.[0];
    if (!sub) return NextResponse.json({ active: false });

    return NextResponse.json({
      active: true,
      plan: sub.metadata?.plan ?? "pro",
      cycle: sub.metadata?.cycle ?? "monthly",
      seats: sub.items?.data?.[0]?.quantity ?? 1,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Billing lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
