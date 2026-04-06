import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const BUCKET = "ietires-dunlop-jmk-uploads";
const CRON_SECRET = process.env.CRON_SECRET;
const API_GATEWAY_URL = process.env.DUNLOP_API_GATEWAY_URL || "https://jzdhz2de88.execute-api.us-east-1.amazonaws.com/prod";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://iecentral.com";

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
    // Calculate prior month
    const now = new Date();
    const priorMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = `${priorMonth.getFullYear()}${String(priorMonth.getMonth() + 1).padStart(2, "0")}`;

    // Find latest OEA07V file for that month
    const prefix = `jmk-uploads/${month}/`;
    const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
    const matches = (listRes.Contents || [])
      .filter((o) => o.Key?.toLowerCase().includes("iet-oea07v") && o.Key?.toLowerCase().endsWith(".csv"))
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    if (matches.length === 0) {
      return NextResponse.json({
        status: "skipped",
        message: `No OEA07V file found for ${month}`,
        month,
      });
    }

    const s3Key = matches[0].Key!;

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
