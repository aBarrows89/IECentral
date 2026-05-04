import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = "ietires-sales-data";
const PREFIX = "wtd-commission-reports/";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

/**
 * GET /api/wtd-commission/reports
 * Lists all saved commission reports from S3.
 * Query params: month (YYYY-MM) to filter
 */
export async function GET(request: NextRequest) {
  try {
    const filterMonth = request.nextUrl.searchParams.get("month"); // YYYY-MM

    const reports: {
      key: string;
      customerName: string;
      customerNumber: string;
      date: string;
      grandTotal: number;
      lineItemCount: number;
      generatedAt: string;
    }[] = [];

    let token: string | undefined;
    do {
      const res = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX,
        MaxKeys: 1000,
        ContinuationToken: token,
      }));

      for (const obj of res.Contents || []) {
        if (!obj.Key || !obj.Key.endsWith(".json")) continue;

        // Parse key: wtd-commission-reports/{customerNumber}/{date}_{timestamp}.json
        const parts = obj.Key.replace(PREFIX, "").split("/");
        if (parts.length < 2) continue;
        const customerNumber = parts[0];
        const fileName = parts[1];
        const date = fileName.split("_")[0]; // YYYY-MM-DD

        // Read the file to get report details. Note: we don't filter by month
        // here — the months picker on the client must always see every month
        // we have data for, even when the user is currently viewing a different
        // (or empty) month.
        try {
          const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
          const body = await getRes.Body?.transformToString("utf-8");
          if (!body) continue;
          const data = JSON.parse(body);
          reports.push({
            key: obj.Key,
            customerName: data.customerName || customerNumber,
            customerNumber,
            date,
            grandTotal: data.grandTotal || 0,
            lineItemCount: data.lineItems?.length || 0,
            generatedAt: data.generatedAt || obj.LastModified?.toISOString() || "",
          });
        } catch {
          // Skip unreadable files
        }
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);

    // Sort by date descending
    reports.sort((a, b) => b.date.localeCompare(a.date));

    // Available months — derived from ALL reports, before any filter is applied,
    // so the client month picker always shows every month with data.
    const months = [...new Set(reports.map((r) => r.date.slice(0, 7)))].sort().reverse();

    // Now apply the month filter to the reports array we return.
    const filtered = filterMonth ? reports.filter((r) => r.date.startsWith(filterMonth)) : reports;

    return NextResponse.json({ reports: filtered, months });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list reports" }, { status: 500 });
  }
}

/**
 * POST /api/wtd-commission/reports
 * Fetch a specific report by S3 key.
 */
export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json();
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

    const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const body = await getRes.Body?.transformToString("utf-8");
    if (!body) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const data = JSON.parse(body);

    // Handle delete request
    if (data && request.headers.get("x-action") === "delete") {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load report" }, { status: 500 });
  }
}

/**
 * DELETE /api/wtd-commission/reports
 * Delete a report by S3 key.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { key } = await request.json();
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete" }, { status: 500 });
  }
}
