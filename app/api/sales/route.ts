import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const BUCKET = "ietires-sales-data";
const REGION = "us-east-1";

function getS3() {
  return new S3Client({ region: REGION });
}

// GET /api/sales?months=202603,202602 — fetch processed sales data
export async function GET(request: NextRequest) {
  try {
    const months = request.nextUrl.searchParams.get("months");
    const s3 = getS3();

    if (months) {
      // Fetch specific months
      const monthList = months.split(",").map(m => m.trim()).filter(Boolean);
      const results = await Promise.all(
        monthList.map(async (month) => {
          try {
            const resp = await s3.send(new GetObjectCommand({
              Bucket: BUCKET,
              Key: `processed/${month}.json`,
            }));
            const body = await resp.Body?.transformToString();
            return body ? JSON.parse(body) : null;
          } catch {
            return null;
          }
        })
      );
      return NextResponse.json(results.filter(Boolean));
    }

    // List available months
    const resp = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: "processed/",
    }));

    const available = (resp.Contents || [])
      .map(obj => {
        const match = obj.Key?.match(/processed\/(\d{6})\.json/);
        return match ? match[1] : null;
      })
      .filter(Boolean)
      .sort()
      .reverse();

    return NextResponse.json({ available });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
