import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const BUCKET = "ietires-dunlop-jmk-uploads";
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";

const IE_FALKEN = { distributorAccount: "20118", address: "400 Unity St.  STE. 100", city: "Latrobe", state: "PA", zip: "15650" };
const IE_MILESTAR = { parentDistributor: "119662", distributorCenter: "119662:0" };

const COL = {
  ITEM_ID: 0, PRODUCT_TYPE: 3, MFG_ID: 4, MFG_ITEM_ID: 5,
  LOC_ID: 8, QTY: 10, SELL_PRICE: 13, ACCOUNT_ID: 15,
  INV_ID: 16, ACTIVITY_DATE: 18,
};

const STORE_ACCOUNTS: Record<string, string> = {
  "w08r20": "w08r20", "r20w08": "w08r20",
  "w08r25": "w08r25", "r25w08": "w08r25",
  "w08r35": "w08r35", "r35w08": "w08r35",
};

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

function normalizeAcct(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return STORE_ACCOUNTS[lower] || lower;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { current.push(field.trim()); field = ""; }
      else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        current.push(field.trim()); field = "";
        if (current.some(f => f)) rows.push(current);
        current = [];
        if (ch === "\r") i++;
      } else if (ch === "\r") {
        current.push(field.trim()); field = "";
        if (current.some(f => f)) rows.push(current);
        current = [];
      } else field += ch;
    }
  }
  if (field || current.length) { current.push(field.trim()); if (current.some(f => f)) rows.push(current); }
  return rows;
}

function csvEscape(val: string): string {
  return val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
}

/**
 * POST /api/dealer-rebates/auto-process
 * Automatically processes dealer rebates from an uploaded OEA07V file.
 * Body: { s3Key }
 */
export async function POST(request: NextRequest) {
  try {
    const { s3Key } = await request.json();
    if (!s3Key) return NextResponse.json({ error: "s3Key required" }, { status: 400 });

    // 1. Download CSV from S3
    const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    const body = await getRes.Body?.transformToString("utf-8");
    if (!body) return NextResponse.json({ error: "Empty file" }, { status: 400 });

    const allRows = parseCSV(body.replace(/^\uFEFF/, "").replace(/\0/g, ""));
    const dataRows = allRows.slice(1); // skip header

    // Filter to tire product types only
    const tireRows = dataRows.filter(cols => {
      const pt = (cols[COL.PRODUCT_TYPE] || "").trim().toUpperCase();
      return pt.startsWith("T");
    });

    // 2. Load dealers from Convex
    const convex = new ConvexHttpClient(CONVEX_URL);
    const dealers = await convex.query(api.dealerRebates.listDealers, {}) as any[];

    const falkenDealers = dealers.filter((d: any) => d.isActive && d.programs?.includes("falken"));
    const milestarDealers = dealers.filter((d: any) => d.isActive && d.programs?.includes("milestar"));

    const falkenByJmk: Record<string, any[]> = {};
    falkenDealers.forEach((d: any) => {
      const key = d.jmk.toLowerCase().trim();
      if (!key || key === "0" || key === "xxx") return;
      if (!falkenByJmk[key]) falkenByJmk[key] = [];
      falkenByJmk[key].push(d);
    });

    const milestarByJmk: Record<string, any> = {};
    milestarDealers.forEach((d: any) => {
      const key = d.jmk.toLowerCase().trim();
      if (!key || key === "0" || key === "xxx") return;
      milestarByJmk[key] = d;
    });

    // 3. Process rows
    const falkenRows: string[][] = [];
    const milestarRows: string[][] = [];
    const falkenDealersSeen = new Set<string>();
    const milestarDealersSeen = new Set<string>();

    for (const cols of tireRows) {
      const jmk = normalizeAcct(cols[COL.ACCOUNT_ID] || "");
      const invoice = (cols[COL.INV_ID] || "").trim();
      const dateRaw = (cols[COL.ACTIVITY_DATE] || "").trim();
      const brand = (cols[COL.MFG_ID] || "").trim().toUpperCase();
      const mfrPartNumber = (cols[COL.MFG_ITEM_ID] || "").trim();
      const rawAcct = (cols[COL.ACCOUNT_ID] || "").trim().toLowerCase();
      const isReturn = /^r\d{2}w\d{2}$/.test(rawAcct);
      const rawQty = parseFloat((cols[COL.QTY] || "0").trim()) || 0;
      const qty = String(isReturn ? rawQty : rawQty * -1);
      const price = (cols[COL.SELL_PRICE] || "").trim();

      if (brand === "FAL" && falkenByJmk[jmk]) {
        for (const dealer of falkenByJmk[jmk]) {
          if (!dealer.fanaticId) continue;
          falkenRows.push([
            IE_FALKEN.distributorAccount, dealer.fanaticId,
            IE_FALKEN.address, IE_FALKEN.city, IE_FALKEN.state, IE_FALKEN.zip,
            invoice, mfrPartNumber, dateRaw, qty, price,
          ]);
          falkenDealersSeen.add(jmk);
        }
      }

      if (brand === "MIL" && milestarByJmk[jmk]) {
        const dealer = milestarByJmk[jmk];
        if (dealer.dealerNumber) {
          milestarRows.push([
            IE_MILESTAR.parentDistributor, IE_MILESTAR.distributorCenter,
            dealer.dealerNumber, invoice, dateRaw, mfrPartNumber, qty, price,
          ]);
          milestarDealersSeen.add(jmk);
        }
      }
    }

    // 4. Build CSV outputs and save to S3
    const now = new Date();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${now.getFullYear()}`;
    const results: { type: string; rows: number; dealers: number; s3Key?: string }[] = [];

    if (falkenRows.length > 0) {
      const header = "Falken_Distributor_Account_Number,FANATIC_Dealer_Account_Number,Distributor_Center_Address,Distributor_Center_City,Distributor_Center_State,Distributor_Center_Postal_Code,Invoice_Number,SKU,Date,Quantity,Price_Per_Tire";
      const csv = [header, ...falkenRows.map(r => r.map(csvEscape).join(","))].join("\n");
      const key = `dealer-rebates/falken/Falken_Fanatic_${dateStr}.csv`;
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: csv, ContentType: "text/csv" }));
      results.push({ type: "Falken", rows: falkenRows.length, dealers: falkenDealersSeen.size, s3Key: key });
    } else {
      results.push({ type: "Falken", rows: 0, dealers: 0 });
    }

    if (milestarRows.length > 0) {
      const header = "ParentDistributorNumber,DistributorCenterNumber,DealerNumber,InvoiceNumber,InvoiceDate,ProductCode,Quantity,SellPricePerTire";
      const csv = [header, ...milestarRows.map(r => r.map(csvEscape).join(","))].join("\n");
      const key = `dealer-rebates/milestar/Milestar_Momentum_${dateStr}.csv`;
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: csv, ContentType: "text/csv" }));
      results.push({ type: "Milestar", rows: milestarRows.length, dealers: milestarDealersSeen.size, s3Key: key });
    } else {
      results.push({ type: "Milestar", rows: 0, dealers: 0 });
    }

    return NextResponse.json({
      status: "success",
      totalInputRows: dataRows.length,
      tireRows: tireRows.length,
      results,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Processing failed" }, { status: 500 });
  }
}
