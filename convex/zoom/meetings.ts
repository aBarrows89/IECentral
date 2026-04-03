"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

export const createZoomMeeting = action({
  args: {
    userId: v.id("users"),
    topic: v.string(),
    startTime: v.number(), // Unix timestamp ms
    duration: v.number(),  // minutes
  },
  handler: async (ctx, args) => {
    // Get Zoom account with encrypted tokens
    const account = await ctx.runQuery(api.zoom.accounts.getWithCredentials, {
      userId: args.userId,
    });

    if (!account) {
      throw new Error("No Zoom account connected");
    }

    // Decrypt access token
    const { decrypt } = await import("../lib/encryption");
    let accessToken: string;
    try {
      accessToken = decrypt(account.accessToken);
    } catch {
      throw new Error("Failed to decrypt Zoom access token. Try reconnecting Zoom.");
    }

    // Check if token is expired and needs refresh
    if (account.tokenExpiresAt < Date.now() + 60000) {
      // Token expires within 1 minute — refresh it
      const refreshToken = decrypt(account.refreshToken);
      const clientId = process.env.ZOOM_CLIENT_ID!;
      const clientSecret = process.env.ZOOM_CLIENT_SECRET!;
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const refreshRes = await fetch("https://zoom.us/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!refreshRes.ok) {
        throw new Error("Failed to refresh Zoom token. Try reconnecting Zoom.");
      }

      const tokens = await refreshRes.json();
      const { encrypt } = await import("../lib/encryption");
      accessToken = tokens.access_token;

      // Save refreshed tokens
      await ctx.runMutation(api.zoom.accounts.createOrUpdate, {
        userId: args.userId,
        zoomUserId: account.zoomUserId,
        zoomEmail: account.zoomEmail,
        displayName: account.displayName,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      });
    }

    // Create Zoom meeting
    const startTimeISO = new Date(args.startTime).toISOString();

    const createRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: args.topic,
        type: 2, // Scheduled meeting
        start_time: startTimeISO,
        duration: args.duration,
        timezone: "America/New_York",
        settings: {
          join_before_host: true,
          waiting_room: false,
          auto_recording: "cloud",
        },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Zoom API error: ${createRes.status} - ${errText}`);
    }

    const meeting = await createRes.json();

    return {
      zoomMeetingId: meeting.id as number,
      joinUrl: meeting.join_url as string,
      startUrl: meeting.start_url as string,
      password: meeting.password as string,
    };
  },
});
