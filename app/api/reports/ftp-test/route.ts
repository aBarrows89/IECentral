import { NextRequest, NextResponse } from "next/server";
import { Client } from "basic-ftp";

export async function POST(request: NextRequest) {
  const client = new Client();
  try {
    const { host, port, username, password, remotePath } = await request.json();

    if (!host || !username || !password) {
      return NextResponse.json({ error: "host, username, password required" }, { status: 400 });
    }

    client.ftp.verbose = false;
    await client.access({ host, port: port || 21, user: username, password, secure: false });

    // Try listing the remote path
    let files: string[] = [];
    try {
      const listing = await client.list(remotePath || "/");
      files = listing.map((f) => f.name).slice(0, 10);
    } catch {
      files = ["(could not list directory)"];
    }

    return NextResponse.json({
      connected: true,
      message: `Connected to ${host}:${port || 21}`,
      files,
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      message: err instanceof Error ? err.message : "Connection failed",
    });
  } finally {
    client.close();
  }
}
