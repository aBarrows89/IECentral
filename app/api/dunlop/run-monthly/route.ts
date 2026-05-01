import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const BUCKET = "ietires-dunlop-jmk-uploads";
const CRON_SECRET = process.env.CRON_SECRET;
const API_GATEWAY_URL = process.env.DUNLOP_API_GATEWAY_URL || "https://jzdhz2de88.execute-api.us-east-1.amazonaws.com/prod";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.iecentral.com";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

/**
 * GET /api/dunlop/run-monthly
 *
 * Runs on the 1st of each month at 9 AM EST (14:00 UTC).
 * Finds the latest OEA07V file for the prior month and
 * triggers the Dunlop SFTP submission via the existing Lambda.
 */
export async function GET(request: NextRequest) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Calculate prior month and the current month (where a late-uploaded
    // monthly file might land if /reports/upload bucketed it by today's date).
    const now = new Date();
    const priorMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = `${priorMonth.getFullYear()}${String(priorMonth.getMonth() + 1).padStart(2, "0")}`;
    const currentMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Look in both the prior-month folder and the current-month folder. Filename
    // heuristics help us recognize a monthly upload that landed in the wrong
    // prefix: it usually contains the month name (Apr, April) or the YYYYMM key.
    const monthNames = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[priorMonth.getMonth()];
    const monthAbbr = monthName.slice(0, 3);
    const isMonthlyForPrior = (key: string): boolean => {
      const k = key.toLowerCase();
      return k.includes(monthName.toLowerCase()) ||
             k.includes(monthAbbr.toLowerCase()) ||
             k.includes(month);
    };

    const prefixes = [`jmk-uploads/${month}/`, `jmk-uploads/${currentMonth}/`];
    const allMatches: { Key: string; LastModified?: Date; Size?: number }[] = [];
    for (const prefix of prefixes) {
      const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
      for (const o of listRes.Contents || []) {
        if (!o.Key) continue;
        const k = o.Key.toLowerCase();
        if (k.includes("iet-oea07v") && k.endsWith(".csv")) {
          allMatches.push({ Key: o.Key, LastModified: o.LastModified, Size: o.Size });
        }
      }
    }

    // Prefer files whose name suggests they are the prior month's monthly upload;
    // among those, take the most recent. Fall back to the most recent OEA07V file
    // in the prior-month folder.
    const monthlyHits = allMatches.filter((m) => isMonthlyForPrior(m.Key));
    monthlyHits.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
    const fallback = allMatches
      .filter((m) => m.Key.startsWith(`jmk-uploads/${month}/`))
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));
    const winner = monthlyHits[0] || fallback[0];

    if (!winner) {
      return NextResponse.json({
        status: "skipped",
        message: `No OEA07V file found for ${month} (checked ${prefixes.join(", ")})`,
        month,
      });
    }

    const s3Key = winner.Key;

    // Call the existing Dunlop run endpoint
    const runRes = await fetch(`${APP_URL}/api/dunlop/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        s3_key: s3Key,
        month,
        env: "prod",
        runBy: "Automated Monthly Run",
      }),
    });

    const runData = await runRes.json();

    return NextResponse.json({
      status: runRes.ok ? "success" : "failed",
      month,
      sourceFile: s3Key,
      dunlopResult: runData,
    });
  } catch (err) {
    console.error("Dunlop monthly run error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
