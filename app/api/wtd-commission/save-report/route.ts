import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = "ietires-sales-data";
const PREFIX = "wtd-commission-reports";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerNumber, startDate, endDate, report } = body;

    if (!customerNumber || !startDate || !endDate || !report) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `${PREFIX}/${customerNumber}/${startDate}_to_${endDate}_${timestamp}.json`;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: JSON.stringify(report, null, 2),
        ContentType: "application/json",
      })
    );

    return NextResponse.json({ status: "saved", key });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("S3 report save error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
