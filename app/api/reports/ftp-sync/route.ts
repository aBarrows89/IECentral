import { NextRequest, NextResponse } from "next/server";
import { Client } from "basic-ftp";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Writable } from "stream";
import { decrypt } from "@/lib/email/encryption";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/reports/ftp-sync
 *
 * Syncs all active FTP connections. Called hourly via cron.
 * For each connection: connect to FTP, find latest matching file,
 * download it, and run the ingest pipeline.
 */
export async function GET(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const convex = new ConvexHttpClient(CONVEX_URL);
  const results: { name: string; status: string; message?: string }[] = [];

  try {
    // Get all active FTP connections
    const connections = await convex.query(api.ftpConnections.list);
    const activeConns = connections.filter((c: { isActive: boolean }) => c.isActive);

    for (const conn of activeConns) {
      const client = new Client();
      try {
        // Get credentials (with actual password)
        const fullConn = await convex.query(api.ftpConnections.getWithCredentials, { id: conn._id as Id<"ftpConnections"> });
        if (!fullConn) continue;

        // Decrypt password
        let password: string;
        try {
          password = decrypt(fullConn.password);
        } catch {
          await convex.mutation(api.ftpConnections.updateSyncStatus, {
            id: conn._id as Id<"ftpConnections">,
            lastSyncStatus: "failed",
            lastSyncError: "Failed to decrypt password",
          });
          results.push({ name: conn.name, status: "failed", message: "Decrypt error" });
          continue;
        }

        // Mark as syncing
        await convex.mutation(api.ftpConnections.updateSyncStatus, {
          id: conn._id as Id<"ftpConnections">,
          lastSyncStatus: "syncing",
        });

        // Connect to FTP
        client.ftp.verbose = false;
        await client.access({
          host: fullConn.host,
          port: fullConn.port,
          user: fullConn.username,
          password,
          secure: false,
        });

        // List files in remote path
        const listing = await client.list(fullConn.remotePath || "/");

        // Find all files matching pattern
        const pattern = fullConn.filePattern.replace(/\*/g, ".*");
        const regex = new RegExp(pattern, "i");
        const matching = listing
          .filter((f) => regex.test(f.name) && f.type !== 2) // type 2 = directory
          .sort((a, b) => (a.modifiedAt?.getTime() ?? 0) - (b.modifiedAt?.getTime() ?? 0)); // oldest first

        if (matching.length === 0) {
          await convex.mutation(api.ftpConnections.updateSyncStatus, {
            id: conn._id as Id<"ftpConnections">,
            lastSyncStatus: "success",
            lastSyncError: "No matching files found",
          });
          results.push({ name: conn.name, status: "skipped", message: "No matching files" });
          client.close();
          continue;
        }

        // Filter to new files — only grab the latest file (most recent by name sort)
        const lastSyncFileName = fullConn.lastSyncFileName || "";
        // Sort by filename descending (timestamps in filename = natural sort works)
        matching.sort((a, b) => b.name.localeCompare(a.name));
        const latestFile = matching[0];
        const newFiles = latestFile && latestFile.name !== lastSyncFileName ? [latestFile] : [];

        if (newFiles.length === 0) {
          await convex.mutation(api.ftpConnections.updateSyncStatus, {
            id: conn._id as Id<"ftpConnections">,
            lastSyncStatus: "success",
          });
          results.push({ name: conn.name, status: "skipped", message: "No new files since last sync" });
          client.close();
          continue;
        }

        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.iecentral.com";
        let totalRows = 0;
        let lastFileName = "";

        // Download and process each new file
        for (const file of newFiles) {
          const remotePath = `${fullConn.remotePath || "/"}/${file.name}`.replace("//", "/");

          const chunks: Buffer[] = [];
          const writable = new Writable({
            write(chunk, _encoding, callback) {
              chunks.push(Buffer.from(chunk));
              callback();
            },
          });

          await client.downloadTo(writable, remotePath);
          const fileBuffer = Buffer.concat(chunks);

          // Upload to S3 via upload-url
          const now = new Date();
          const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
          const urlRes = await fetch(`${APP_URL}/api/reports/upload-url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportType: fullConn.sourceType, month, filename: file.name }),
          });
          const { url, key } = await urlRes.json();

          if (url) {
            const contentType = file.name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv";
            await fetch(url, { method: "PUT", body: fileBuffer, headers: { "Content-Type": contentType } });
            totalRows++;
            lastFileName = file.name;
          }
        }

        client.close();

        await convex.mutation(api.ftpConnections.updateSyncStatus, {
          id: conn._id as Id<"ftpConnections">,
          lastSyncStatus: "success",
          lastSyncFileName: lastFileName,
          lastSyncRowCount: totalRows,
        });
        results.push({ name: conn.name, status: "success", message: `${newFiles.length} files synced (latest: ${lastFileName})` });
      } catch (err) {
        client.close();
        const msg = err instanceof Error ? err.message : "Unknown error";
        try {
          await convex.mutation(api.ftpConnections.updateSyncStatus, {
            id: conn._id as Id<"ftpConnections">,
            lastSyncStatus: "failed",
            lastSyncError: msg,
          });
        } catch { /* best effort */ }
        results.push({ name: conn.name, status: "failed", message: msg });
      }
    }

    return NextResponse.json({ status: "complete", synced: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}

/**
 * POST /api/reports/ftp-sync
 * Manual trigger for a specific connection
 */
export async function POST(request: NextRequest) {
  const { connectionId } = await request.json();
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });
  }

  // Reuse the GET logic by calling ourselves with the connection ID
  // For now, trigger a full sync
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.iecentral.com";
  const res = await fetch(`${APP_URL}/api/reports/ftp-sync`, {
    headers: { Authorization: `Bearer ${CRON_SECRET || ""}` },
  });
  return NextResponse.json(await res.json());
}
