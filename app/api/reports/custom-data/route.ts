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
  oeival: [
    { index: 0, name: "Location", key: "location" },
    { index: 1, name: "Product Type", key: "productType" },
    { index: 3, name: "D-Class", key: "dclass" },
    { index: 4, name: "Manufacturer Code", key: "manufacturerCode" },
    { index: 5, name: "Brand", key: "manufacturerName" },
    { index: 6, name: "Model", key: "model" },
    { index: 7, name: "Item ID", key: "itemId" },
    { index: 8, name: "MFG Item ID", key: "mfgItemId" },
    { index: 9, name: "Description", key: "description" },
    { index: 11, name: "Qty On Hand", key: "qtyOnHand" },
    { index: 13, name: "Qty Available", key: "qtyAvailable" },
    { index: 20, name: "Last Cost", key: "lastCost" },
    { index: 21, name: "Avg Cost", key: "avgCost" },
    { index: 24, name: "Extended Value", key: "extendedValue" },
  ],
  tires: [
    { index: 2, name: "Item ID", key: "itemId" },
    { index: 3, name: "MFG Item ID", key: "mfgItemId" },
    { index: 4, name: "Brand", key: "mfgName" },
    { index: 5, name: "Model", key: "model" },
    { index: 9, name: "Load Index", key: "loadIndex" },
    { index: 10, name: "Speed Rating", key: "speedRating" },
    { index: 15, name: "Product Type", key: "productType" },
    { index: 16, name: "Sidewall", key: "sidewall" },
    { index: 19, name: "XL/RF", key: "xlrf" },
    { index: 8, name: "Weight", key: "weight" },
    { index: 17, name: "Warranty Miles", key: "warrantyMiles" },
    { index: 18, name: "Tread Depth", key: "treadDepth" },
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
async function fetchSourceData(reportType: string, months: string[], selectedColumns: string[]) {
  const colDefs = COLUMN_DEFS[reportType];
  if (!colDefs) return { columns: [], rows: [] };

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

    return {
      columns: activeCols.map((c) => ({ key: c.key, name: c.name })),
      rows: allRows,
    };
}

async function fetchXlsxData(reportType: string, selectedColumns: string[]) {
  // For OEIVAL and similar XLSX sources, find latest file in organized folders
  const prefixes = reportType === "oeival" ? ["jmk-uploads/oeival/", "jmk-uploads/"] : ["jmk-uploads/oea07v-sales/", "jmk-uploads/"];

  for (const prefix of prefixes) {
    const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: 1000 }));
    const matches = (listRes.Contents || [])
      .filter((o) => {
        const key = o.Key?.toLowerCase() || "";
        if (reportType === "oeival") return key.includes("oeival") && (key.endsWith(".xlsx") || key.endsWith(".csv"));
        if (reportType === "tires") return key.includes("tires") && key.endsWith(".csv");
        return false;
      })
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    if (matches.length === 0) continue;

    const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: matches[0].Key! }));
    const buffer = await getRes.Body?.transformToByteArray();
    if (!buffer) continue;

    if (reportType === "oeival") {
      let rawData: unknown[][];
      const fileKey = matches[0].Key!.toLowerCase();
      if (fileKey.endsWith(".csv")) {
        const text = new TextDecoder().decode(buffer);
        rawData = parseCSV(text.replace(/^\uFEFF/, "").replace(/\0/g, ""));
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      }

      // Auto-detect columns from header
      const headerRow = (rawData[0] as string[]).map((h) => String(h || "").replace(/"/g, "").trim().toLowerCase());
      const headerAliases: Record<string, string[]> = {
        location: ["loc id", "location"], productType: ["product type", "prod type"],
        dclass: ["d class", "d-class", "dclass"], manufacturerCode: ["mfg code", "mfg id"],
        manufacturerName: ["mfg name", "mfg's name", "brand"],
        model: ["model"], itemId: ["item id", "itemid"], mfgItemId: ["mfg's item id", "mfg item id"],
        description: ["item description", "description"], qtyOnHand: ["qty on hand", "on hand"],
        qtyAvailable: ["qty available", "available"], lastCost: ["last cost"],
        avgCost: ["avg cost", "average cost"], extendedValue: ["extended value", "ext value"],
      };
      const colMap: Record<string, number> = {};
      for (const [field, aliases] of Object.entries(headerAliases)) {
        const idx = headerRow.findIndex((h) => aliases.some((a) => h.includes(a)));
        if (idx >= 0) colMap[field] = idx;
      }
      // Fallback to positional if no headers detected
      if (Object.keys(colMap).length < 5) {
        Object.assign(colMap, {
          location: 0, productType: 1, dclass: 3, manufacturerCode: 4, manufacturerName: 5,
          model: 6, itemId: 7, mfgItemId: 8, description: 9, qtyOnHand: 11,
          qtyAvailable: 13, lastCost: 20, avgCost: 21, extendedValue: 24,
        });
      }

      const rows: Record<string, string>[] = [];
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i] as (string | number | undefined)[];
        if (!row[0] && !row[1]) continue;
        const record: Record<string, string> = {};
        for (const key of selectedColumns) {
          if (colMap[key] !== undefined) {
            record[key] = String(row[colMap[key]] ?? "").replace(/"/g, "").trim();
          }
        }
        rows.push(record);
      }

      const cols = selectedColumns
        .filter((k) => colMap[k] !== undefined)
        .map((k) => ({ key: k, name: k }));
      return { columns: cols, rows };
    }

    if (reportType === "tires") {
      const text = new TextDecoder().decode(buffer);
      const lines = text.replace(/^\uFEFF/, "").split("\n");
      const headers = lines[0].split(",").map((h) => h.trim());
      const rows: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (cols.length < 5) continue;
        const record: Record<string, string> = {};
        for (const key of selectedColumns) {
          const idx = headers.indexOf(key);
          if (idx >= 0) record[key] = cols[idx] || "";
        }
        rows.push(record);
      }
      return { columns: selectedColumns.map((k) => ({ key: k, name: k })), rows };
    }
  }

  return { columns: [], rows: [] };
}

export async function POST(request: NextRequest) {
  try {
    const { reportType, months, selectedColumns, secondSource, fusionJoinKey, fusionColumns } = await request.json();

    if (!reportType || !months?.length) {
      return NextResponse.json({ error: "reportType and months required" }, { status: 400 });
    }

    // Fetch primary source
    let primaryData;
    if (["oeival", "tires"].includes(reportType)) {
      primaryData = await fetchXlsxData(reportType, selectedColumns);
    } else {
      primaryData = await fetchSourceData(reportType, months, selectedColumns);
    }

    let finalRows = primaryData.rows;
    let finalColumns = primaryData.columns;

    // Fusion — fetch second source and join
    if (secondSource && fusionJoinKey) {
      let secondData;
      if (["oeival", "tires"].includes(secondSource)) {
        // Get all columns from second source for fusion
        const secondCols = COLUMN_DEFS[secondSource] || [];
        secondData = await fetchXlsxData(secondSource, secondCols.map((c) => c.key));
      } else {
        const secondCols = COLUMN_DEFS[secondSource] || [];
        secondData = await fetchSourceData(secondSource, months, secondCols.map((c) => c.key));
      }

      // Build lookup map from second source keyed by join field
      const secondMap = new Map<string, Record<string, string>>();
      for (const row of secondData.rows) {
        const key = row[fusionJoinKey];
        if (key) secondMap.set(key, row);
      }

      // Merge columns (add second source columns that don't overlap)
      const primaryKeys = new Set(finalColumns.map((c) => c.key));
      const fusionColSet = fusionColumns ? new Set(fusionColumns as string[]) : null;
      const newCols = secondData.columns.filter((c) =>
        !primaryKeys.has(c.key) && c.key !== fusionJoinKey && (!fusionColSet || fusionColSet.has(c.key))
      );
      finalColumns = [...finalColumns, ...newCols.map((c) => ({ key: `fusion_${c.key}`, name: `${c.name} (${secondSource})` }))];

      // Join rows
      finalRows = finalRows.map((row) => {
        const joinKey = row[fusionJoinKey];
        const secondRow = joinKey ? secondMap.get(joinKey) : undefined;
        if (!secondRow) return row;
        const merged = { ...row };
        for (const col of newCols) {
          merged[`fusion_${col.key}`] = secondRow[col.key] || "";
        }
        return merged;
      });
    }

    return NextResponse.json({
      columns: finalColumns,
      rows: finalRows.slice(0, 10000),
      totalRows: finalRows.length,
      truncated: finalRows.length > 10000,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
