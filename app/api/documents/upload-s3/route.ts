import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET_NAME = process.env.DOCHUB_S3_BUCKET || "iecentral-dochub";
const REGION = process.env.AWS_REGION || "us-east-1";

// Size threshold for S3 (files larger than 10MB go to S3)
// Import from components/dochub/types.ts instead: S3_SIZE_THRESHOLD
const S3_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB

const s3 = new S3Client({
  region: REGION,
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
    const { fileName, fileType, fileSize } = await request.json();

    if (!fileName || !fileType) {
      return NextResponse.json({ error: "Missing fileName or fileType" }, { status: 400 });
    }

    // Generate a unique key
    const timestamp = Date.now();
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `documents/${timestamp}-${sanitizedName}`;

    // Generate presigned URL for direct upload
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return NextResponse.json({
      uploadUrl,
      key,
      bucket: BUCKET_NAME,
      region: REGION,
    });
  } catch (error) {
    console.error("S3 presigned URL error:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
