import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const BUCKET = "ietires-dunlop-jmk-uploads";
const CRON_SECRET = process.env.CRON_SECRET;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.iecentral.com";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

// Report types to check for
const REPORT_PATTERNS = [
  { type: "OEA07V", pattern: "iet-oea07v", triggers: ["sales-refresh", "wtd-commission", "dealer-rebates"] },
  { type: "ART24T", pattern: "iet-art24t", triggers: [] },
  { type: "ART30S", pattern: "iet-art30s", triggers: [] },
];

/**
 * GET /api/reports/auto-process
 *
 * Automated daily processing — runs M-F at 4 AM EST via AWS EventBridge.
 * Scans S3 for recently uploaded files, records them in Convex,
 * and triggers processing for each.
 *
 * On Mondays, also checks Saturday and Sunday uploads.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = `${prevMonth.getFullYear()}${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

    // Check last 24 hours (or 72 hours on Monday for weekend uploads)
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const lookbackHours = dayOfWeek === 1 ? 72 : 24; // Monday = 72 hours
    const cutoffTime = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

    const results: { type: string; file: string; month: string; status: string; message?: string }[] = [];
    const convex = new ConvexHttpClient(CONVEX_URL);

    // Scan current and previous month folders
    for (const month of [currentMonth, prevMonthStr]) {
      const prefix = `jmk-uploads/${month}/`;
      const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
      if (!listRes.Contents?.length) continue;

      // Find recently uploaded files
      for (const obj of listRes.Contents) {
        if (!obj.Key || !obj.LastModified) continue;
        if (obj.LastModified < cutoffTime) continue; // Skip old files

        // Match against known report types
        const keyLower = obj.Key.toLowerCase();
        for (const report of REPORT_PATTERNS) {
          if (!keyLower.includes(report.pattern) || !keyLower.endsWith(".csv")) continue;

          // Check if already processed (by s3Key)
          const history = await convex.query(api.jmkUploads.listUploadHistory, { limit: 50 });
          const alreadyProcessed = (history as { s3Key: string }[]).some((h) => h.s3Key === obj.Key);
          if (alreadyProcessed) {
            results.push({ type: report.type, file: obj.Key!, month, status: "skipped", message: "Already processed" });
            continue;
          }

          // Record the upload
          const uploadId = await convex.mutation(api.jmkUploads.recordUpload, {
            reportType: report.type,
            fileName: obj.Key!.split("/").pop() || obj.Key!,
            fileSize: obj.Size || 0,
            s3Key: obj.Key!,
            reportingMonth: month,
            validationStatus: "valid",
            // uploadedBy omitted for automated runs
            uploadedByName: "Automated Daily Processing",
          });

          // Trigger processing for report types with triggers
          if (report.triggers.length > 0) {
            try {
              const processRes = await fetch(`${APP_URL}/api/reports/process`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  uploadId,
                  reportType: report.type,
                  s3Key: obj.Key,
                  month,
                }),
              });
              const processData = await processRes.json();
              results.push({
                type: report.type,
                file: obj.Key!,
                month,
                status: processRes.ok ? "processed" : "failed",
                message: processRes.ok ? `Triggers: ${report.triggers.join(", ")}` : processData.error,
              });
            } catch (err) {
              results.push({
                type: report.type,
                file: obj.Key!,
                month,
                status: "failed",
                message: err instanceof Error ? err.message : "Processing failed",
              });
            }
          } else {
            // No triggers — just record
            await convex.mutation(api.jmkUploads.updateProcessing, {
              uploadId,
              processingStatus: "complete",
              processingResults: [{ trigger: "none", status: "success", message: "No processing triggers", completedAt: Date.now() }],
            });
            results.push({ type: report.type, file: obj.Key!, month, status: "recorded", message: "No processing triggers" });
          }
        }
      }
    }

    return NextResponse.json({
      status: "success",
      processedAt: now.toISOString(),
      lookbackHours,
      isMonday: dayOfWeek === 1,
      monthsChecked: [currentMonth, prevMonthStr],
      results,
    });
  } catch (err) {
    console.error("Auto-process error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
