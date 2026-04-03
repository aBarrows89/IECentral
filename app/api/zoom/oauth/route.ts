import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";

const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://iecentral.com";

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!ZOOM_CLIENT_ID) {
      return NextResponse.json({ error: "Zoom OAuth not configured" }, { status: 500 });
    }

    // CSRF state token
    const state = crypto.randomBytes(32).toString("hex");
    const cookieStore = await cookies();
    cookieStore.set("zoom_oauth_state", `${state}:${userId}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    const params = new URLSearchParams({
      client_id: ZOOM_CLIENT_ID,
      redirect_uri: `${APP_URL}/api/zoom/oauth/callback`,
      response_type: "code",
      state,
    });

    return NextResponse.redirect(`https://zoom.us/oauth/authorize?${params.toString()}`);
  } catch (error) {
    console.error("Zoom OAuth initiation error:", error);
    return NextResponse.json({ error: "Failed to initiate OAuth" }, { status: 500 });
  }
}
