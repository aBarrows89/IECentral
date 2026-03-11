/**
 * Google OAuth Callback Route
 *
 * Handles the OAuth callback from Google, exchanges code for tokens,
 * and creates/updates the email account in Convex.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { encrypt } from "@/lib/email/encryption";

// Google OAuth configuration
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export async function GET(request: NextRequest) {
  // Initialize Convex client inside handler to avoid build-time errors
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");

    // Handle OAuth errors
    if (error) {
      console.error("Google OAuth error:", error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=missing_params`
      );
    }

    // Verify state from cookie
    const cookieStore = await cookies();
    const storedState = cookieStore.get("oauth_state")?.value;

    if (!storedState) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=state_expired`
      );
    }

    const [expectedState, userId] = storedState.split(":");

    if (state !== expectedState) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=state_mismatch`
      );
    }

    // Clear the state cookie
    cookieStore.delete("oauth_state");

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/email/oauth/google/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      console.error("No access token in response:", tokens);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=no_access_token`
      );
    }

    // Get user info (email address)
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      console.error("Failed to get user info");
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=userinfo_failed`
      );
    }

    const userInfo = await userInfoResponse.json();

    if (!userInfo.email) {
      console.error("No email in user info:", userInfo);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=no_email`
      );
    }

    // Encrypt tokens before storing
    const encryptedAccessToken = encrypt(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : encrypt(tokens.access_token); // Fallback if no refresh token

    // Calculate token expiration
    const tokenExpiresAt = Date.now() + (tokens.expires_in || 3600) * 1000;

    // Create or update the email account in Convex
    await convex.mutation(api.email.accounts.createOAuthAccount, {
      userId: userId as Id<"users">,
      provider: "gmail",
      emailAddress: userInfo.email,
      name: userInfo.name || userInfo.email.split("@")[0],
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt,
      oauthProvider: "google",
    });

    // Redirect to email accounts page with success
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?connected=gmail&email=${encodeURIComponent(userInfo.email)}`
    );
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/email/accounts?error=callback_failed`
    );
  }
}
