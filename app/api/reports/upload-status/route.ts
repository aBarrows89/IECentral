import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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

    // Determine complete/partial status
    for (const date of Object.keys(statusByDate)) {
      for (const source of REPORT_SOURCES) {
        const entry = statusByDate[date]?.[source.type];
        if (!entry) continue;

        if (source.frequency === "hourly") {
          // For hourly: complete = 24 uploads, partial = 1-23
          const uniqueHours = new Set(entry.files.map((f) => f.hour));
          entry.complete = uniqueHours.size >= 20; // ~20 business hours
          entry.partial = uniqueHours.size > 0 && uniqueHours.size < 20;
        } else {
          // For daily: any file = complete
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
