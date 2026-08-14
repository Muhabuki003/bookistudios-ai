import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Missing 'code' query parameter" },
      { status: 400 },
    );
  }

  const bypass = process.env.WAITLIST_BYPASS;

  if (!bypass) {
    return NextResponse.json(
      { error: "Unlock mechanism is not configured" },
      { status: 503 },
    );
  }

  if (code.trim() !== bypass.trim()) {
    return NextResponse.json(
      { error: "Invalid access code" },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ success: true, message: "Access granted" });
  response.cookies.set("waitlist_bypass", "true", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return response;
}
