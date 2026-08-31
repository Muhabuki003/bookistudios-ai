import { NextResponse } from "next/server";

const API_BASE = "https://mawazo-api.adrienmuhabukibusiness.workers.dev";
const ADMIN_EMAIL = "founder@bookistudios.com";
const GATEWAY = "http://172.18.0.2:8003";

/**
 * Admin-only proxy to the MAWAZO product API.
 * The worker admin key lives server-side (env), never in the client bundle.
 */
async function sessionEmail(req: Request): Promise<string> {
  const cookie = req.headers.get("cookie") ?? "";
  if (!cookie) return "";
  try {
    const res = await fetch(`${GATEWAY}/api/v1/auth/me`, {
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

async function isAdmin(req: Request): Promise<boolean> {
  const email = await sessionEmail(req);
  return email === ADMIN_EMAIL;
}

function targetUrl(request: Request): string {
  const url = new URL(request.url);
  // /api/mawazo/products/abc -> /api/products/abc
  const apiPath = url.pathname.replace(/^\/api\/mawazo/, "/api");
  return API_BASE + apiPath + url.search;
}

async function proxy(request: Request, method: string) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const target = targetUrl(request);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET") {
    const key = process.env.MAWAZO_ADMIN_KEY ?? "";
    if (key) headers["X-Admin-Key"] = key;
  }
  const payload =
    method === "POST" || method === "PUT" ? await request.json().catch(() => null) : null;
  const res = await fetch(target, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(request: Request) {
  return proxy(request, "GET");
}
export async function POST(request: Request) {
  return proxy(request, "POST");
}
export async function PUT(request: Request) {
  return proxy(request, "PUT");
}
export async function DELETE(request: Request) {
  return proxy(request, "DELETE");
}
