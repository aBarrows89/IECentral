import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const API_GATEWAY_URL = process.env.DUNLOP_API_GATEWAY_URL || "https://jzdhz2de88.execute-api.us-east-1.amazonaws.com/prod";

function getConvex() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not configured");
  return new ConvexHttpClient(url);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { s3_key, month, env, runBy } = body;

    if (!s3_key || !month || !env) {
      return NextResponse.json(
        { error: "s3_key, month, and env are required" },
        { status: 400 }
      );
    }

    // Fetch Falken Fanatic dealer JMK list from Convex for exclusion
    let fanaticJmks: string[] = [];
    try {
      const convex = getConvex();
      const dealers = await convex.query(api.dealerRebates.listDealers, {
        program: "falken",
        activeOnly: true,
      });
      fanaticJmks = dealers
        .filter((d: { fanaticId?: number }) => d.fanaticId)
        .map((d: { jmk: string }) => d.jmk.toLowerCase().trim())
        .filter((jmk: string) => jmk && jmk !== "0");
    } catch {
      // If Convex is unavailable, proceed without exclusions
    }

    const res = await fetch(`${API_GATEWAY_URL}/dunlop/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3_key, month, env, runBy, fanaticJmks }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
