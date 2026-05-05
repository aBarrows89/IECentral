import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = "ietires-sales-data";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

/**
 * POST /api/reports/cir/upload-url
 *
 * Returns a presigned PUT URL for archiving a CIR PDF to S3.
 * Path: cir-reports/{LOCATION}/{YYYY-MM-DD}_{ISO-timestamp}.pdf
 */
export async function POST(request: NextRequest) {
  try {
    const { locationCode, snapshotDate } = await request.json();
    if (!locationCode) {
      return NextResponse.json({ error: "locationCode required" }, { status: 400 });
    }

    const code = String(locationCode).toUpperCase();
    const date = snapshotDate && /^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)
      ? snapshotDate
      : new Date().toISOString().slice(0, 10);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `cir-reports/${code}/${date}_${ts}.pdf`;

    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: "application/pdf" });
    const url = await getSignedUrl(s3, command, { expiresIn: 600 });

    return NextResponse.json({ url, key });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
