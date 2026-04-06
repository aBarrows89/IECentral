import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = "ietires-dunlop-jmk-uploads";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

// Column definitions per report type
const COLUMN_DEFS: Record<string, { index: number; name: string; key: string }[]> = {
  OEA07V: [
    { index: 0, name: "Item ID", key: "itemId" },
    { index: 1, name: "Description", key: "description" },
    { index: 2, name: "Sidewall", key: "sidewall" },
    { index: 3, name: "Product Type", key: "productType" },
    { index: 4, name: "Brand", key: "brand" },
    { index: 5, name: "MFG Item ID", key: "mfgItemId" },
    { index: 8, name: "Location", key: "location" },
    { index: 9, name: "Transaction", key: "transaction" },
    { index: 10, name: "Qty", key: "qty" },
    { index: 11, name: "Unit Cost", key: "unitCost" },
    { index: 12, name: "Ext Cost", key: "extCost" },
    { index: 13, name: "Unit Sell", key: "unitSell" },
    { index: 14, name: "Ext Sell", key: "extSell" },
    { index: 15, name: "Account ID", key: "accountId" },
    { index: 16, name: "Invoice ID", key: "invoiceId" },
    { index: 18, name: "Activity Date", key: "activityDate" },
    { index: 19, name: "Customer Name", key: "customerName" },
  ],
  ART24T: [
    { index: 0, name: "A/R Account ID", key: "arAccountId" },
    { index: 1, name: "Invoice ID", key: "invoiceId" },
    { index: 4, name: "Trans Date", key: "transDate" },
    { index: 5, name: "Location", key: "location" },
    { index: 6, name: "Product Type", key: "productType" },
    { index: 7, name: "Brand", key: "brand" },
    { index: 9, name: "Item ID", key: "itemId" },
    { index: 10, name: "Description", key: "description" },
    { index: 13, name: "Qty Delivered", key: "qty" },
    { index: 14, name: "Total Amount", key: "totalAmt" },
    { index: 15, name: "Total Cost", key: "totalCost" },
    { index: 16, name: "Gross Profit", key: "grossProfit" },
    { index: 17, name: "Unit Price", key: "unitPrice" },
    { index: 19, name: "Unit COGS", key: "unitCogs" },
    { index: 20, name: "Profit %", key: "profitPct" },
    { index: 31, name: "Customer Name", key: "customerName" },
  ],
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { current.push(field); field = ""; }
      else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        current.push(field); field = "";
        if (current.some(f => f.trim())) rows.push(current);
        current = [];
        if (ch === "\r") i++;
      } else if (ch === "\r") {
        current.push(field); field = "";
        if (current.some(f => f.trim())) rows.push(current);
        current = [];
      } else field += ch;
    }
  }
  if (field || current.length > 0) {
    current.push(field);
    if (current.some(f => f.trim())) rows.push(current);
  }
  return rows;
}

/**
 * POST /api/reports/custom-data
 *
 * Accepts: { reportType, months[], selectedColumns[] }
 * Returns: { columns, rows, totalRows, dateRange }
 */
export async function POST(request: NextRequest) {
  try {
    const { reportType, months, selectedColumns } = await request.json();

    if (!reportType || !months?.length) {
      return NextResponse.json({ error: "reportType and months required" }, { status: 400 });
    }

    const colDefs = COLUMN_DEFS[reportType];
    if (!colDefs) {
      return NextResponse.json({ error: `Unknown report type: ${reportType}` }, { status: 400 });
    }

    // Filter to selected columns (or all if none specified)
    const activeCols = selectedColumns?.length
      ? colDefs.filter((c) => selectedColumns.includes(c.key))
      : colDefs;

    // Find and download files for each month
    const allRows: Record<string, string>[] = [];

    for (const month of months as string[]) {
      const prefix = `jmk-uploads/${month}/`;
      const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
      if (!listRes.Contents?.length) continue;

      // Find matching file by report type pattern
      const pattern = reportType === "OEA07V" ? "iet-oea07v" : reportType === "ART24T" ? "iet-art24t" : reportType.toLowerCase();
      const matches = listRes.Contents
        .filter((o) => o.Key?.toLowerCase().includes(pattern) && o.Key?.toLowerCase().endsWith(".csv"))
        .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

      if (matches.length === 0) continue;

      const fileKey = matches[0].Key!;
      const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: fileKey }));
      const body = await getRes.Body?.transformToString("utf-8");
      if (!body) continue;

      const csvRows = parseCSV(body.replace(/^\uFEFF/, "").replace(/\0/g, ""));
      // Skip header
      for (let i = 1; i < csvRows.length; i++) {
        const row = csvRows[i];
        const record: Record<string, string> = {};
        for (const col of activeCols) {
          record[col.key] = (row[col.index] || "").replace(/"/g, "").trim();
        }
        allRows.push(record);
      }
    }

    return NextResponse.json({
      columns: activeCols.map((c) => ({ key: c.key, name: c.name })),
      rows: allRows.slice(0, 10000), // Cap at 10K rows for browser performance
      totalRows: allRows.length,
      truncated: allRows.length > 10000,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
