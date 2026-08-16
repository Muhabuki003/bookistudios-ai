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

async function stripePost(path: string, params: Record<string, string>) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer" + SECRET,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Stripe ${res.status}`);
  }
  return json;
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
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  try {
    const customers = await stripeGet(
      `/customers?email=${encodeURIComponent(email)}&limit=1`,
    );
    const customer = customers?.data?.[0];
    if (!customer) return NextResponse.json({ error: "No billing account yet." }, { status: 404 });

    const session = await stripePost("/billing_portal/sessions", {
      customer: customer.id,
      return_url: "https://bsaiagents.com/workspace",
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not open billing portal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
