import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = "ietires-dunlop-jmk-uploads";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

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
  if (field || current.length > 0) {
    current.push(field.trim());
    if (current.some(f => f)) rows.push(current);
  }
  return rows;
}

/**
 * GET /api/reports/sales-history-data
 *
 * Aggregates OEA07V daily CSVs from S3 into monthly sales totals per item.
 * Falls back to XLSX sales history format if available.
 * Query params: brand, productType, dclass, startMonth, endMonth
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const filterBrand = searchParams.get("brand");
    const filterProductType = searchParams.get("productType");
    const filterDclass = searchParams.get("dclass");
    const startMonth = searchParams.get("startMonth");
    const endMonth = searchParams.get("endMonth");

    // Find all OEA07V CSV files across month folders
    const allFiles: { key: string; month: string; lastModified: Date }[] = [];
    const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "jmk-uploads/", MaxKeys: 1000 }));
    for (const obj of listRes.Contents || []) {
      if (!obj.Key || !obj.LastModified) continue;
      const keyLower = obj.Key.toLowerCase();
      if (!keyLower.includes("iet-oea07v") || !keyLower.endsWith(".csv")) continue;
      // Extract month from folder path: jmk-uploads/202604/file.csv
      const monthMatch = obj.Key.match(/jmk-uploads\/(\d{6})\//);
      if (!monthMatch) continue;
      const yyyymm = monthMatch[1];
      const month = `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
      allFiles.push({ key: obj.Key, month, lastModified: obj.LastModified });
    }

    if (allFiles.length === 0) {
      return NextResponse.json({ items: [], monthColumns: [], filters: { brands: [], productTypes: [], dclasses: [] }, fileDate: null });
    }

    // Group by month — use latest file per month
    const filesByMonth = new Map<string, { key: string; lastModified: Date }>();
    for (const f of allFiles) {
      const existing = filesByMonth.get(f.month);
      if (!existing || f.lastModified > existing.lastModified) {
        filesByMonth.set(f.month, { key: f.key, lastModified: f.lastModified });
      }
    }

    // Read ALL files — we filter by row-level activity date, not folder
    const months = [...filesByMonth.keys()].sort();

    // Aggregate: itemId -> { info, monthlySales: { month -> totalQty } }
    const itemMap = new Map<string, {
      itemId: string; description: string; brand: string; productType: string;
      dclass: string; model: string; mfgItemId: string;
      monthlySales: Record<string, number>;
    }>();

    let latestFileDate: string | null = null;

    for (const month of months) {
      const file = filesByMonth.get(month);
      if (!file) continue;
      if (!latestFileDate || file.lastModified.toISOString() > latestFileDate) {
        latestFileDate = file.lastModified.toISOString();
      }

      const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: file.key }));
      const body = await getRes.Body?.transformToString("utf-8");
      if (!body) continue;

      const rows = parseCSV(body.replace(/^\uFEFF/, "").replace(/\0/g, ""));
      // OEA07V columns: 0=ItemId, 1=Description, 2=Sidewall, 3=ProductType, 4=Brand, 5=MfgItemId, 8=Location, 9=Transaction, 10=Qty, 18=ActivityDate
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 11) continue;

        const itemId = (row[0] || "").replace(/"/g, "").trim();
        if (!itemId) continue;

        const qty = parseFloat(row[10] || "0") || 0;
        // Parse activity date to get the month (MM/DD/YY)
        const dateRaw = (row[18] || "").replace(/"/g, "").trim();
        const dateMatch = dateRaw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        let rowMonth = month;
        if (dateMatch) {
          let y = parseInt(dateMatch[3]);
          if (y < 100) y += 2000;
          rowMonth = `${y}-${String(parseInt(dateMatch[1])).padStart(2, "0")}`;
        }

        // Filter by requested date range
        if (startMonth && rowMonth < startMonth) continue;
        if (endMonth && rowMonth > endMonth) continue;

        let entry = itemMap.get(itemId);
        if (!entry) {
          // D-class is the trailing suffix character on Item ID
          const lastChar = itemId.slice(-1);
          const dclass = /[.\^\[:\-]/.test(lastChar) ? lastChar : "";
          entry = {
            itemId,
            description: (row[1] || "").replace(/"/g, "").trim(),
            brand: (row[4] || "").replace(/"/g, "").trim(),
            productType: (row[3] || "").replace(/"/g, "").trim(),
            dclass,
            model: "",
            mfgItemId: (row[5] || "").replace(/"/g, "").trim(),
            monthlySales: {},
          };
          itemMap.set(itemId, entry);
        }
        // Negate qty (sales are negative in OEA07V)
        entry.monthlySales[rowMonth] = (entry.monthlySales[rowMonth] || 0) + (-qty);
      }
    }

    // Build result
    const allMonths = [...new Set([...months, ...Array.from(itemMap.values()).flatMap((e) => Object.keys(e.monthlySales))])].sort();

    let items = Array.from(itemMap.values()).map((entry) => {
      const total = Object.values(entry.monthlySales).reduce((sum, v) => sum + v, 0);
      return { ...entry, total };
    });

    // Collect filter options
    const brands = [...new Set(items.map((i) => i.brand).filter(Boolean))].sort();
    const productTypes = [...new Set(items.map((i) => i.productType).filter(Boolean))].sort();
    const dclasses = [...new Set(items.map((i) => i.dclass).filter(Boolean))].sort();

    // Apply filters
    if (filterBrand) items = items.filter((i) => i.brand === filterBrand);
    if (filterProductType) items = items.filter((i) => i.productType === filterProductType);
    if (filterDclass) items = items.filter((i) => i.dclass === filterDclass);

    // Sort by total descending
    items.sort((a, b) => b.total - a.total);

    return NextResponse.json({
      items: items.slice(0, 10000),
      monthColumns: allMonths,
      allAvailableMonths: allMonths,
      filters: { brands, productTypes, dclasses },
      fileDate: latestFileDate,
      totalRows: items.length,
      truncated: items.length > 10000,
    });
  } catch (err) {
    console.error("Sales history data error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load sales data" }, { status: 500 });
  }
}
