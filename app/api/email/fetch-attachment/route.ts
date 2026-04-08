import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";

export async function POST(request: NextRequest) {
  try {
    const { attachmentId, accountId } = await request.json();
    if (!attachmentId || !accountId) {
      return NextResponse.json({ error: "attachmentId and accountId required" }, { status: 400 });
    }

    const convex = new ConvexHttpClient(CONVEX_URL);
    const result = await convex.action(api.email.sync.fetchAttachment, {
      attachmentId: attachmentId as Id<"emailAttachments">,
      accountId: accountId as Id<"emailAccounts">,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fetch failed" }, { status: 500 });
  }
}
