import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { encrypt } from "@/lib/email/encryption";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.iecentral.com";

export async function GET(request: NextRequest) {
  const convex = new ConvexHttpClient(
    process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud"
  );
  const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID!;
  const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET!;

  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");

    if (error) {
      console.error("Zoom OAuth error:", error);
      return NextResponse.redirect(new URL(`/calendar?error=${encodeURIComponent(error)}`, APP_URL));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL("/calendar?error=missing_params", APP_URL));
    }

    // Verify state from cookie
    const cookieStore = await cookies();
    const storedState = cookieStore.get("zoom_oauth_state")?.value;

    if (!storedState) {
      return NextResponse.redirect(new URL("/calendar?error=state_expired", APP_URL));
    }

    const [expectedState, userId] = storedState.split(":");

    if (state !== expectedState) {
      return NextResponse.redirect(new URL("/calendar?error=state_mismatch", APP_URL));
    }

    cookieStore.delete("zoom_oauth_state");

    // Exchange code for tokens (Zoom uses Basic Auth)
    const basicAuth = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString("base64");

    const tokenResponse = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: `${APP_URL}/api/zoom/oauth/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("Zoom token exchange failed:", errText);
      return NextResponse.redirect(new URL("/calendar?error=token_exchange_failed", APP_URL));
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokens;

    // Get Zoom user profile
    const userResponse = await fetch("https://api.zoom.us/v2/users/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userResponse.ok) {
      console.error("Zoom user profile fetch failed");
      return NextResponse.redirect(new URL("/calendar?error=profile_fetch_failed", APP_URL));
    }

    const zoomUser = await userResponse.json();

    // Encrypt tokens before storing
    const encryptedAccess = encrypt(access_token);
    const encryptedRefresh = encrypt(refresh_token);

    // Save to Convex
    await convex.mutation(api.zoomAccounts.createOrUpdate, {
      userId: userId as Id<"users">,
      zoomUserId: zoomUser.id,
      zoomEmail: zoomUser.email,
      displayName: `${zoomUser.first_name || ""} ${zoomUser.last_name || ""}`.trim() || zoomUser.email,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      tokenExpiresAt: Date.now() + expires_in * 1000,
    });

    return NextResponse.redirect(new URL("/calendar?zoom=connected", APP_URL));
  } catch (err) {
    console.error("Zoom OAuth callback error:", err);
    return NextResponse.redirect(new URL("/calendar?error=callback_failed", APP_URL));
  }
}
