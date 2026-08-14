import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const bypassCookie = request.cookies.get("waitlist_bypass");

  return NextResponse.json({
    unlocked: bypassCookie?.value === "true",
  });
}
