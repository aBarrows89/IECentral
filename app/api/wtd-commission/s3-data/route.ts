import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const S3_BUCKET = "ietires-dunlop-jmk-uploads";
const S3_PREFIX = "jmk-uploads";

// OEA07V column indices (zero-based)
// Verified against actual CSV header:
// Col 0: Item Id, Col 1: Item Description, Col 2: Sidewall, Col 3: Product Type,
// Col 4: MFG Id, Col 5: MFG's Item Id, Col 6: UPC Code, Col 7: EAN Code,
// Col 8: Loc Id, Col 9: Trn Pur, Col 10: Qty Sl/Rc, Col 11: U/Cost FET/In,
// Col 12: Ext Cost FET In, Col 13: U/Sell FET/In, Col 14: Ext Sell FET In,
// Col 15: Account Id, Col 16: Inv Id, Col 17: PO Id, Col 18: Activity Date,
// Col 19: Abbreviated Name
const COL = {
  ITEM_ID: 0,
  DESCRIPTION: 1,
  SIDEWALL: 2,
  PRODUCT_TYPE: 3,   // "Dclass" in setup UI maps to Product Type
  BRAND: 4,          // MFG Id
  MFG_ITEM_ID: 5,    // MFG's Item Id (product mfg code)
  TRN_PUR: 9,
  QTY: 10,
  UNIT_COST: 11,     // U/Cost FET/In
  UNIT_SELL: 13,     // U/Sell FET/In
  ACCOUNT_ID: 15,
  INV_ID: 16,        // Invoice Id
  PO_ID: 17,         // PO Id
  ACTIVITY_DATE: 18,
  CUSTOMER_NAME: 19, // Abbreviated Name
} as const;

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

/**
 * Parse a date string in M/D/YY or M/D/YYYY format to a Date object.
 */
function parseActivityDate(dateStr: string): Date | null {
  const clean = dateStr.replace(/"/g, "").trim();
  const parts = clean.split("/");
  if (parts.length !== 3) return null;
  let [m, d, y] = parts.map(Number);
  if (!m || !d || isNaN(y)) return null;
  // Handle 2-digit year
  if (y < 100) y += 2000;
  return new Date(y, m - 1, d);
}

/**
 * Get all YYYYMM month strings between two dates.
 */
function getMonthRange(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months: string[] = [];

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    months.push(`${yyyy}${mm}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

/**
 * Find the OEA07V file in a given month folder by listing objects.
 */
async function findOEA07VFile(month: string): Promise<string | null> {
  const prefix = `${S3_PREFIX}/${month}/`;
  const command = new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: prefix,
  });

  const response = await s3.send(command);
  if (!response.Contents || response.Contents.length === 0) return null;

  // Find file matching IET-oea07v pattern
  const match = response.Contents.find((obj) =>
    obj.Key?.toLowerCase().includes("iet-oea07v") && obj.Key?.toLowerCase().endsWith(".csv")
  );
  return match?.Key ?? null;
}

/**
 * Download and parse a CSV file from S3.
 */
async function downloadAndParseCSV(key: string): Promise<string[][]> {
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  const response = await s3.send(command);
  const body = await response.Body?.transformToString("utf-8");
  if (!body) return [];

  // Remove BOM and null bytes
  const cleaned = body.replace(/^\uFEFF/, "").replace(/\0/g, "");

  return parseCSV(cleaned);
}

/**
 * Simple CSV parser that handles quoted fields with commas and newlines.
 */
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
          i++; // skip escaped quote
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
        if (ch === "\r") i++; // skip \n after \r
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
  // Last field/row
  if (field || current.length > 0) {
    current.push(field);
    if (current.some((f) => f.trim())) rows.push(current);
  }

  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body as { startDate: string; endDate: string };

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }

    // 1. Determine months in range
    const months = getMonthRange(startDate, endDate);
    if (months.length === 0) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    // 2. Find OEA07V files for each month — check ALL before downloading
    const fileMap: Record<string, string> = {};
    const missingMonths: string[] = [];

    for (const month of months) {
      const key = await findOEA07VFile(month);
      if (key) {
        fileMap[month] = key;
      } else {
        missingMonths.push(month);
      }
    }

    // 3. If any months are missing, stop completely
    if (missingMonths.length > 0) {
      const formatted = missingMonths.map((m) => {
        const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${names[parseInt(m.slice(4, 6), 10) - 1]} ${m.slice(0, 4)}`;
      });
      return NextResponse.json(
        {
          error: `Missing OEA07V files for: ${formatted.join(", ")}. Cannot generate report with incomplete data.`,
          missingMonths: formatted,
        },
        { status: 422 }
      );
    }

    // 4. Download and parse all files
    const allRows: string[][] = [];
    for (const month of months) {
      const rows = await downloadAndParseCSV(fileMap[month]);
      // Skip header row (first row of each file)
      allRows.push(...rows.slice(1));
    }

    // 5. Parse dates and return raw data — filtering happens on the client
    //    with the customer configs from Convex
    const startD = new Date(startDate);
    const endD = new Date(endDate);
    // Set endD to end of day
    endD.setHours(23, 59, 59, 999);

    const parsedRows = [];
    for (const row of allRows) {
      if (row.length <= COL.ACTIVITY_DATE) continue;

      const dateStr = row[COL.ACTIVITY_DATE]?.trim();
      if (!dateStr) continue;

      const activityDate = parseActivityDate(dateStr);
      if (!activityDate) continue;

      // Filter by date range
      if (activityDate < startD || activityDate > endD) continue;

      const itemId = row[COL.ITEM_ID]?.trim() || "";
      const qty = parseFloat(row[COL.QTY]?.trim() || "0");
      const unitCost = parseFloat(row[COL.UNIT_COST]?.trim() || "0");
      const unitSell = parseFloat(row[COL.UNIT_SELL]?.trim() || "0");

      parsedRows.push({
        itemId,
        description: row[COL.DESCRIPTION]?.trim() || "",
        dclass: row[COL.PRODUCT_TYPE]?.trim() || "",  // "Dclass" maps to Product Type column
        brand: row[COL.BRAND]?.trim() || "",
        mfgItemId: row[COL.MFG_ITEM_ID]?.trim() || "",
        trnPur: row[COL.TRN_PUR]?.trim() || "",
        qty: isNaN(qty) ? 0 : qty,
        unitCost: isNaN(unitCost) ? 0 : Math.abs(unitCost),
        unitSell: isNaN(unitSell) ? 0 : Math.abs(unitSell),
        accountId: row[COL.ACCOUNT_ID]?.trim() || "",
        orderNo: row[COL.INV_ID]?.trim() || "",  // Invoice ID used as order reference
        activityDate: dateStr,
        customerName: row[COL.CUSTOMER_NAME]?.trim() || "",
      });
    }

    return NextResponse.json({
      totalRows: parsedRows.length,
      months: Object.keys(fileMap),
      files: Object.values(fileMap),
      rows: parsedRows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("WTD Commission S3 data error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
