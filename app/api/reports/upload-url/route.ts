import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = "ietires-dunlop-jmk-uploads";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

export async function POST(request: NextRequest) {
  try {
    const { reportType, month, filename } = await request.json();
    if (!reportType || !month || !filename) {
      return NextResponse.json({ error: "reportType, month, and filename required" }, { status: 400 });
    }

    const sanitized = filename.replace(/[^a-zA-Z0-9._() -]/g, "_");

    // Organize by report type for data sources
    const typeFolder = ["oeival", "oea07v-sales", "tires"].includes(reportType) ? reportType : "";
    const key = typeFolder
      ? `jmk-uploads/${typeFolder}/${month}/${sanitized}`
      : `jmk-uploads/${month}/${sanitized}`;

    const contentType = sanitized.endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv";

    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
    const url = await getSignedUrl(s3, command, { expiresIn: 900 });

    return NextResponse.json({ url, key });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
