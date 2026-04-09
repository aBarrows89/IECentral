import { NextRequest, NextResponse } from "next/server";
import { Client } from "basic-ftp";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { decrypt } from "@/lib/email/encryption";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";

/**
 * POST /api/reports/ftp-list
 * Lists files on an FTP connection using saved credentials.
 * Body: { connectionId, path? }
 */
export async function POST(request: NextRequest) {
  const client = new Client();
  try {
    const { connectionId, path } = await request.json();
    if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 });

    const convex = new ConvexHttpClient(CONVEX_URL);
    const conn = await convex.query(api.ftpConnections.getWithCredentials, { id: connectionId as Id<"ftpConnections"> });
    if (!conn) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

    const password = decrypt(conn.password);

    client.ftp.verbose = false;
    await client.access({ host: conn.host, port: conn.port, user: conn.username, password, secure: false });

    const remotePath = path || conn.remotePath || "/";
    const listing = await client.list(remotePath);

    const files = listing.map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type === 2 ? "dir" : "file",
      modified: f.modifiedAt?.toISOString() || null,
    })).sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));

    return NextResponse.json({ path: remotePath, files, total: files.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list" }, { status: 500 });
  } finally {
    client.close();
  }
}
