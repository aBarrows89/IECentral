import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/email/encryption";

export async function POST(request: NextRequest) {
  try {
    const { value } = await request.json();
    if (!value) return NextResponse.json({ error: "value required" }, { status: 400 });
    return NextResponse.json({ encrypted: encrypt(value) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Encryption failed" }, { status: 500 });
  }
}
