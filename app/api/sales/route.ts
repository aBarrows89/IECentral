import { NextRequest, NextResponse } from "next/server";

const API_GATEWAY_URL = process.env.DUNLOP_API_GATEWAY_URL || "https://jzdhz2de88.execute-api.us-east-1.amazonaws.com/prod";

export async function GET(request: NextRequest) {
  try {
    const months = request.nextUrl.searchParams.get("months");
    const url = months
      ? `${API_GATEWAY_URL}/dunlop/sales?months=${months}`
      : `${API_GATEWAY_URL}/dunlop/sales`;

    const res = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
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
