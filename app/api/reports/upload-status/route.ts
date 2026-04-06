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

/** Get all business days (Mon-Sat) in a month up to today */
function getBusinessDaysInMonth(yyyymm: string): string[] {
  const y = parseInt(yyyymm.slice(0, 4));
  const m = parseInt(yyyymm.slice(4, 6)) - 1;
  const today = new Date();
  const days: string[] = [];
  const cursor = new Date(y, m, 1);
  while (cursor.getMonth() === m) {
    if (cursor <= today && cursor.getDay() !== 0) { // exclude Sunday
      days.push(cursor.toISOString().split("T")[0]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Extract YYYYMM from S3 key like "jmk-uploads/202604/file.csv" */
function extractMonth(key: string): string | null {
  const match = key.match(/jmk-uploads\/(?:\w+\/)?(\d{6})\//);
  return match ? match[1] : null;
}

/**
 * GET /api/reports/upload-status
 *
 * Scans S3 for uploaded report files. For daily reports (OEA07V, OEIVAL),
 * marks all business days in the file's month as covered. For hourly reports
 * (tires), groups by upload date/hour.
 */
export async function GET() {
  try {
    const statusByDate: Record<string, Record<string, { files: FileInfo[]; complete: boolean; partial: boolean }>> = {};

    // Track which months have files per source (for daily spreading)
    const monthFiles: Record<string, { source: string; file: FileInfo }[]> = {};

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

            const fileInfo: FileInfo = {
              key: obj.Key,
              size: obj.Size || 0,
              lastModified: obj.LastModified.toISOString(),
              hour: obj.LastModified.getHours(),
            };

            if (source.frequency === "hourly") {
              // Hourly sources: group by actual upload date
              const dateStr = obj.LastModified.toISOString().split("T")[0];
              if (!statusByDate[dateStr]) statusByDate[dateStr] = {};
              if (!statusByDate[dateStr][source.type]) {
                statusByDate[dateStr][source.type] = { files: [], complete: false, partial: false };
              }
              statusByDate[dateStr][source.type].files.push(fileInfo);
            } else {
              // Daily sources: spread across the month folder's business days
              const month = extractMonth(obj.Key);
              if (month) {
                if (!monthFiles[month]) monthFiles[month] = [];
                monthFiles[month].push({ source: source.type, file: fileInfo });
              } else {
                // Fallback: use upload date if no month folder
                const dateStr = obj.LastModified.toISOString().split("T")[0];
                if (!statusByDate[dateStr]) statusByDate[dateStr] = {};
                if (!statusByDate[dateStr][source.type]) {
                  statusByDate[dateStr][source.type] = { files: [], complete: false, partial: false };
                }
                statusByDate[dateStr][source.type].files.push(fileInfo);
              }
            }
          }

          token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token);

        const hasFiles = Object.values(statusByDate).some((d) => d[source.type]?.files.length > 0) ||
          Object.values(monthFiles).some((files) => files.some((f) => f.source === source.type));
        if (hasFiles) break;
      }
    }

    // Spread daily files across business days in their month
    for (const [month, files] of Object.entries(monthFiles)) {
      const businessDays = getBusinessDaysInMonth(month);
      for (const dateStr of businessDays) {
        for (const { source, file } of files) {
          if (!statusByDate[dateStr]) statusByDate[dateStr] = {};
          if (!statusByDate[dateStr][source]) {
            statusByDate[dateStr][source] = { files: [], complete: false, partial: false };
          }
          const alreadyHas = statusByDate[dateStr][source].files.some((f) => f.key === file.key);
          if (!alreadyHas) {
            statusByDate[dateStr][source].files.push(file);
          }
        }
      }
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
