import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";

const BUCKET = "ietires-dunlop-jmk-uploads";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

// Report types to track
const REPORT_SOURCES = [
  { type: "OEA07V", pattern: "iet-oea07v", label: "Daily Sales", frequency: "daily", prefixes: ["jmk-uploads/"] },
  { type: "oeival", pattern: "oeival", label: "Inventory", frequency: "daily", prefixes: ["jmk-uploads/oeival/", "jmk-uploads/"] },
  { type: "tires", pattern: "tires-", label: "Tires Catalog", frequency: "hourly", prefixes: ["jmk-uploads/tires/", "jmk-uploads/"] },
];

interface FileInfo {
  key: string;
  size: number;
  lastModified: string;
  hour?: number;
}

/**
 * GET /api/reports/upload-status
 *
 * Scans S3 for all uploaded report files and returns a date-indexed map
 * showing which report types have data for each date.
 */
export async function GET() {
  try {
    const statusByDate: Record<string, Record<string, { files: FileInfo[]; complete: boolean; partial: boolean }>> = {};

    for (const source of REPORT_SOURCES) {
      for (const prefix of source.prefixes) {
        let token: string | undefined;
        do {
          const res = await s3.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: token,
          }));

          for (const obj of res.Contents || []) {
            if (!obj.Key || !obj.LastModified) continue;
            const keyLower = obj.Key.toLowerCase();
            if (!keyLower.includes(source.pattern)) continue;
            if (!keyLower.endsWith(".csv") && !keyLower.endsWith(".xlsx")) continue;

            const dateStr = obj.LastModified.toISOString().split("T")[0];
            const hour = obj.LastModified.getHours();

            if (!statusByDate[dateStr]) statusByDate[dateStr] = {};
            if (!statusByDate[dateStr][source.type]) {
              statusByDate[dateStr][source.type] = { files: [], complete: false, partial: false };
            }

            statusByDate[dateStr][source.type].files.push({
              key: obj.Key,
              size: obj.Size || 0,
              lastModified: obj.LastModified.toISOString(),
              hour,
            });
          }

          token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token);

        // If we found files for this source in this prefix, don't check fallback
        const hasFiles = Object.values(statusByDate).some((d) => d[source.type]?.files.length > 0);
        if (hasFiles) break;
      }
    }

    // Check Convex upload history for date ranges (spreads OEA07V across actual data dates)
    try {
      const convex = new ConvexHttpClient(CONVEX_URL);
      const history = await convex.query(api.jmkUploads.listUploadHistory, { limit: 100 });
      for (const upload of history as any[]) {
        if (!upload.dateRangeStart || !upload.dateRangeEnd) continue;
        // Parse "Apr 1, 2026" format dates
        const start = new Date(upload.dateRangeStart);
        const end = new Date(upload.dateRangeEnd);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

        const sourceType = upload.reportType;
        const cursor = new Date(start);
        while (cursor <= end) {
          const dateStr = cursor.toISOString().split("T")[0];
          if (!statusByDate[dateStr]) statusByDate[dateStr] = {};
          if (!statusByDate[dateStr][sourceType]) {
            statusByDate[dateStr][sourceType] = { files: [], complete: false, partial: false };
          }
          // Add a synthetic file entry for this date if not already covered by S3 scan
          const alreadyHas = statusByDate[dateStr][sourceType].files.some(
            (f) => f.key === upload.s3Key
          );
          if (!alreadyHas) {
            statusByDate[dateStr][sourceType].files.push({
              key: upload.s3Key,
              size: upload.fileSize || 0,
              lastModified: new Date(upload.createdAt).toISOString(),
            });
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    } catch {
      // Convex lookup is supplemental — don't fail the whole response
    }

    // Determine complete/partial status
    for (const date of Object.keys(statusByDate)) {
      for (const source of REPORT_SOURCES) {
        const entry = statusByDate[date]?.[source.type];
        if (!entry) continue;

        if (source.frequency === "hourly") {
          const uniqueHours = new Set(entry.files.map((f) => f.hour));
          entry.complete = uniqueHours.size >= 20;
          entry.partial = uniqueHours.size > 0 && uniqueHours.size < 20;
        } else {
          entry.complete = entry.files.length > 0;
          entry.partial = false;
        }
      }
    }

    return NextResponse.json({
      sources: REPORT_SOURCES.map((s) => ({ type: s.type, label: s.label, frequency: s.frequency })),
      statusByDate,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to check status" }, { status: 500 });
  }
}
