import { NextRequest, NextResponse } from "next/server";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const S3_BUCKET = "ietires-dunlop-jmk-uploads";
const S3_PREFIX = "jmk-uploads";
const SALES_BUCKET = "ietires-sales-data";
const CRON_SECRET = process.env.CRON_SECRET;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";

const COL = {
  ITEM_ID: 0,
  DESCRIPTION: 1,
  PRODUCT_TYPE: 3,
  BRAND: 4,
  MFG_ITEM_ID: 5,
  QTY: 10,
  UNIT_COST: 11,
  EXT_COST: 12,
  UNIT_SELL: 13,
  ACCOUNT_ID: 15,
  INV_ID: 16,
  ACTIVITY_DATE: 18,
  CUSTOMER_NAME: 19,
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

function parseActivityDate(dateStr: string): Date | null {
  const clean = dateStr.replace(/"/g, "").trim();
  const parts = clean.split("/");
  if (parts.length !== 3) return null;
  let [m, d, y] = parts.map(Number);
  if (!m || !d || isNaN(y)) return null;
  if (y < 100) y += 2000;
  return new Date(y, m - 1, d);
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

interface CustomerConfig {
  _id: string;
  customerName: string;
  customerNumber: string;
  qualifyingDclasses: string[];
  qualifyingBrands: string[];
  commissionType: string;
  commissionValue: number;
}

/**
 * GET /api/wtd-commission/daily-run
 *
 * Automated daily job (4 AM EST via Vercel cron):
 * 1. Fetches yesterday's OEA07V data from S3
 * 2. For each active customer config, generates a commission report
 * 3. Saves reports to Convex + S3
 * 4. If no data for a customer, saves a "no data" marker
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  if (CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const targetDate = yesterday.toISOString().split("T")[0];
    const targetMonth = `${yesterday.getFullYear()}${String(yesterday.getMonth() + 1).padStart(2, "0")}`;

    // Find latest OEA07V file for the month
    const prefix = `${S3_PREFIX}/${targetMonth}/`;
    const listRes = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix }));
    const matches = (listRes.Contents || [])
      .filter(obj => obj.Key?.toLowerCase().includes("iet-oea07v") && obj.Key?.toLowerCase().endsWith(".csv"))
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    if (matches.length === 0) {
      // No OEA07V file — save "no data" for all customers
      const convex = new ConvexHttpClient(CONVEX_URL);
      const customers = await convex.query(api.wtdCommission.getActiveCustomers) as CustomerConfig[];

      for (const config of customers) {
        await convex.mutation(api.wtdCommission.saveReport, {
          customerName: config.customerName,
          customerNumber: config.customerNumber,
          startDate: targetDate,
          endDate: targetDate,
          commissionType: config.commissionType,
          commissionValue: config.commissionValue,
          lineItems: [],
          grandTotal: 0,
          generatedBy: undefined,
          generatedByName: "Automated Daily Run",
        });
      }

      return NextResponse.json({
        status: "no_data",
        message: `No OEA07V file found for ${targetMonth}`,
        date: targetDate,
        customersProcessed: customers.length,
      });
    }

    // Download and parse the CSV
    const fileKey = matches[0].Key!;
    const getRes = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: fileKey }));
    const body = await getRes.Body?.transformToString("utf-8");
    if (!body) throw new Error("Empty CSV file");

    const allRows = parseCSV(body.replace(/^\uFEFF/, "").replace(/\0/g, ""));
    const dataRows = allRows.slice(1); // Skip header

    // Filter to yesterday's rows only
    const targetStart = new Date(targetDate);
    const targetEnd = new Date(targetDate);
    targetEnd.setHours(23, 59, 59, 999);

    const yesterdayRows = dataRows.filter(row => {
      if (row.length <= COL.ACTIVITY_DATE) return false;
      const d = parseActivityDate(row[COL.ACTIVITY_DATE]?.trim() || "");
      return d && d >= targetStart && d <= targetEnd;
    });

    // Get active customer configs from Convex
    const convex = new ConvexHttpClient(CONVEX_URL);
    const customers = await convex.query(api.wtdCommission.getActiveCustomers) as CustomerConfig[];

    const results = [];

    for (const config of customers) {
      // Filter qualifying rows for this customer
      const qualifying = yesterdayRows.filter(row => {
        const itemId = row[COL.ITEM_ID]?.replace(/"/g, "").trim() || "";
        const accountId = row[COL.ACCOUNT_ID]?.replace(/"/g, "").trim() || "";
        const brand = row[COL.BRAND]?.replace(/"/g, "").trim() || "";

        if (accountId.toUpperCase() !== config.customerNumber.toUpperCase()) return false;

        if (config.qualifyingDclasses.length > 0) {
          if (!config.qualifyingDclasses.some(suffix => itemId.endsWith(suffix))) return false;
        }

        if (!config.qualifyingBrands.includes("ALL")) {
          if (!config.qualifyingBrands.some(b => b.toUpperCase() === brand.toUpperCase())) return false;
        }

        return true;
      });

      // Calculate commission for each line
      const lineItems = qualifying.map(row => {
        const qty = Math.abs(parseFloat(row[COL.QTY]?.replace(/"/g, "").trim() || "0") || 0);
        const extCost = Math.abs(parseFloat(row[COL.EXT_COST]?.replace(/"/g, "").trim() || "0") || 0);
        const unitCost = Math.abs(parseFloat(row[COL.UNIT_COST]?.replace(/"/g, "").trim() || "0") || 0);

        let commissionAmount: number;
        if (config.commissionType === "percentage") {
          commissionAmount = extCost * (config.commissionValue / 100);
        } else {
          commissionAmount = qty * config.commissionValue;
        }

        return {
          orderNo: row[COL.INV_ID]?.replace(/"/g, "").trim() || "",
          brand: row[COL.BRAND]?.replace(/"/g, "").trim() || "",
          mfgItemId: row[COL.MFG_ITEM_ID]?.replace(/"/g, "").trim() || "",
          description: row[COL.DESCRIPTION]?.replace(/"/g, "").trim() || "",
          qty,
          unitCost,
          commissionAmount: Math.round(commissionAmount * 100) / 100,
        };
      });

      const grandTotal = Math.round(lineItems.reduce((sum, li) => sum + li.commissionAmount, 0) * 100) / 100;

      // Save to Convex
      await convex.mutation(api.wtdCommission.saveReport, {
        customerName: config.customerName,
        customerNumber: config.customerNumber,
        startDate: targetDate,
        endDate: targetDate,
        commissionType: config.commissionType,
        commissionValue: config.commissionValue,
        lineItems,
        grandTotal,
        generatedBy: "system" as any,
        generatedByName: "Automated Daily Run",
      });

      // Save to S3
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const s3Key = `wtd-commission-reports/${config.customerNumber}/${targetDate}_${timestamp}.json`;
      await s3.send(new PutObjectCommand({
        Bucket: SALES_BUCKET,
        Key: s3Key,
        Body: JSON.stringify({
          customerName: config.customerName,
          customerNumber: config.customerNumber,
          date: targetDate,
          lineItems,
          grandTotal,
          generatedAt: new Date().toISOString(),
        }, null, 2),
        ContentType: "application/json",
      }));

      results.push({
        customer: config.customerName,
        lineItemCount: lineItems.length,
        grandTotal,
        hasData: lineItems.length > 0,
      });
    }

    return NextResponse.json({
      status: "success",
      date: targetDate,
      sourceFile: fileKey,
      totalRowsInFile: dataRows.length,
      yesterdayRows: yesterdayRows.length,
      customers: results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("WTD daily run error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
