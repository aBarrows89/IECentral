import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const JMK_BUCKET = "ietires-dunlop-jmk-uploads";
const JMK_PREFIX = "jmk-uploads";
const SALES_BUCKET = "ietires-sales-data";

// OEA07V column indices (zero-based)
const COL = {
  ITEM_ID: 0,
  DESCRIPTION: 1,
  DCLASS: 2,
  PRODUCT_TYPE: 3,
  BRAND: 4,
  MFG_ITEM_ID: 5,
  LOC_ID: 8,
  TRN_PUR: 9,
  QTY: 10,
  UNIT_COST: 11,
  UNIT_SELL: 13,
  EXT_SELL: 14,
  ACCOUNT_ID: 15,
  ACTIVITY_DATE: 18,
  CUSTOMER_NAME: 19,
} as const;

const s3 = new S3Client({ region: "us-east-1" });

// Cron secret for Vercel cron jobs
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Strip trailing . [ ^ from item IDs (matching Dunlop Lambda behavior)
 */
function stripTrailingChars(s: string): string {
  return s.replace(/[.\[^]+$/, "");
}

/**
 * Parse date string (M/D/YYYY) → { year, month, day }
 */
function parseDate(dateStr: string): { year: number; month: number; day: number } | null {
  const parts = dateStr.trim().split("/");
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y) return null;
  return { year: y, month: m, day: d };
}

/**
 * Find the OEA07V file in a given month folder.
 */
async function findOEA07VFile(month: string): Promise<string | null> {
  const prefix = `${JMK_PREFIX}/${month}/`;
  const command = new ListObjectsV2Command({ Bucket: JMK_BUCKET, Prefix: prefix });
  const response = await s3.send(command);
  if (!response.Contents?.length) return null;

  const match = response.Contents.find(
    (obj) => obj.Key?.toLowerCase().includes("iet-oea07v") && obj.Key?.toLowerCase().endsWith(".csv")
  );
  return match?.Key ?? null;
}

/**
 * Download and parse CSV from S3.
 */
async function downloadCSV(key: string): Promise<string[][]> {
  const response = await s3.send(new GetObjectCommand({ Bucket: JMK_BUCKET, Key: key }));
  const body = await response.Body?.transformToString("utf-8");
  if (!body) return [];

  const cleaned = body.replace(/^\uFEFF/, "").replace(/\0/g, "");
  return parseCSV(cleaned);
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        current.push(field);
        field = "";
        if (current.some((f) => f.trim())) rows.push(current);
        current = [];
        if (ch === "\r") i++;
      } else if (ch === "\r") {
        current.push(field);
        field = "";
        if (current.some((f) => f.trim())) rows.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }
  if (field || current.length > 0) {
    current.push(field);
    if (current.some((f) => f.trim())) rows.push(current);
  }
  return rows;
}

/**
 * Process OEA07V rows into sales data format matching the Dunlop Lambda's
 * _save_sales_data() output so the existing Sales Dashboard can consume it.
 */
function processRows(rows: string[]): Record<string, unknown>[] {
  const parsed = [];

  for (const rawRow of rows) {
    // Re-split if it's a single string (shouldn't be after parseCSV, but safeguard)
    const row = Array.isArray(rawRow) ? rawRow : [rawRow];

    if (row.length <= COL.ACTIVITY_DATE) continue;

    const dateStr = row[COL.ACTIVITY_DATE]?.trim();
    if (!dateStr) continue;

    const d = parseDate(dateStr);
    if (!d) continue;

    let qtyRaw: number, priceRaw: number, extSell: number;
    try {
      qtyRaw = parseFloat(row[COL.QTY]?.trim() || "0");
      priceRaw = parseFloat(row[COL.UNIT_SELL]?.trim() || "0");
      extSell = parseFloat(row[COL.EXT_SELL]?.trim() || "0");
    } catch {
      continue;
    }
    if (isNaN(qtyRaw)) continue;

    parsed.push({
      date: `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
      item_id: stripTrailingChars(row[COL.ITEM_ID]?.trim() || ""),
      description: row[COL.DESCRIPTION]?.trim() || "",
      product_type: row[COL.PRODUCT_TYPE]?.trim() || "",
      brand: row[COL.BRAND]?.trim() || "",
      mfg_item: row[COL.MFG_ITEM_ID]?.trim() || "",
      loc: row[COL.LOC_ID]?.trim() || "",
      trn: row[COL.TRN_PUR]?.trim() || "",
      qty: Math.round(qtyRaw),
      price: Math.round(priceRaw * 100) / 100,
      ext_sell: Math.round(extSell * 100) / 100,
      account: row[COL.ACCOUNT_ID]?.trim() || "",
      customer: row[COL.CUSTOMER_NAME]?.trim() || "",
    });
  }

  return parsed;
}

/**
 * GET /api/sales/refresh
 *
 * Reads the current month's OEA07V file from S3, processes all rows into
 * the sales data format, and saves to the ietires-sales-data bucket so the
 * existing Sales Dashboard and fetch_sales Lambda can read it.
 *
 * Protected by CRON_SECRET when called via Vercel cron.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret if configured
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Find OEA07V file for current month
    const key = await findOEA07VFile(currentMonth);
    if (!key) {
      return NextResponse.json({
        status: "skipped",
        message: `No OEA07V file found for ${currentMonth}`,
        month: currentMonth,
      });
    }

    // Download and parse
    const allRows = await downloadCSV(key);
    // Skip header row
    const dataRows = allRows.slice(1);

    // Process into sales format
    const processed = processRows(dataRows as unknown as string[]);

    // Save to sales data bucket (same format as Dunlop Lambda)
    const salesKey = `processed/${currentMonth}.json`;
    const payload = JSON.stringify({
      month: currentMonth,
      rowCount: processed.length,
      rows: processed,
      refreshedAt: now.toISOString(),
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: SALES_BUCKET,
        Key: salesKey,
        Body: payload,
        ContentType: "application/json",
      })
    );

    return NextResponse.json({
      status: "success",
      month: currentMonth,
      sourceFile: key,
      rowCount: processed.length,
      savedTo: `${SALES_BUCKET}/${salesKey}`,
      refreshedAt: now.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Sales refresh error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
