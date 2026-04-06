import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = "ietires-dunlop-jmk-uploads";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }
    : {}),
});

function decodeDclass(raw: string): string {
  const map: Record<string, string> = { Blank: "", Dash: "-", colon: ":", "Open Bracket": "[" };
  return map[raw] ?? raw;
}

function excelDateToMonth(serial: number): string {
  const d = new Date((serial - 25569) * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * GET /api/reports/sales-history-data
 *
 * Reads the latest OEA07V sales history XLSX from S3.
 * Query params: brand, productType, dclass, startMonth (YYYY-MM), endMonth (YYYY-MM), showAllRows
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const filterBrand = searchParams.get("brand");
    const filterProductType = searchParams.get("productType");
    const filterDclass = searchParams.get("dclass");
    const startMonth = searchParams.get("startMonth"); // YYYY-MM
    const endMonth = searchParams.get("endMonth");     // YYYY-MM
    const showAllRows = searchParams.get("showAllRows") === "true";

    // Find latest sales history file — check organized folder first, then legacy
    let salesFiles: { Key?: string; LastModified?: Date }[] = [];
    for (const prefix of ["jmk-uploads/oea07v-sales/", "jmk-uploads/"]) {
      const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: 1000 }));
      const found = (listRes.Contents || [])
        .filter((o) => {
          const key = o.Key?.toLowerCase() || "";
          return (key.includes("sales") || key.includes("oea07v") || key.includes("oeival")) && key.endsWith(".xlsx");
        });
      if (found.length > 0) { salesFiles = found; break; }
    }
    salesFiles.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    if (salesFiles.length === 0) {
      return NextResponse.json({ items: [], monthColumns: [], filters: { brands: [], productTypes: [], dclasses: [] }, fileDate: null });
    }

    const fileKey = salesFiles[0].Key!;
    const fileDate = salesFiles[0].LastModified?.toISOString();

    const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: fileKey }));
    const buffer = await getRes.Body?.transformToByteArray();
    if (!buffer) return NextResponse.json({ items: [], monthColumns: [], filters: { brands: [], productTypes: [], dclasses: [] }, fileDate });

    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

    if (rawData.length < 2) {
      return NextResponse.json({ items: [], monthColumns: [], filters: { brands: [], productTypes: [], dclasses: [] }, fileDate });
    }

    const headers = (rawData[0] as (string | number)[]);

    // Find column boundaries
    const totalIdx = headers.findIndex((h) => String(h) === "Total");
    const strippedSizeIdx = headers.findIndex((h) => String(h) === "Stripped Size");
    const availStockIdx = headers.findIndex((h) => String(h) === "Available Stock");

    // Parse monthly column headers (Excel serial dates)
    const allMonthHeaders: { idx: number; month: string }[] = [];
    for (let c = (strippedSizeIdx >= 0 ? strippedSizeIdx + 1 : 8); c < (totalIdx >= 0 ? totalIdx : headers.length); c++) {
      const h = headers[c];
      if (typeof h === "number" && h > 40000) { // Excel date serial
        allMonthHeaders.push({ idx: c, month: excelDateToMonth(h) });
      }
    }

    // Filter month columns by date range
    let monthHeaders = allMonthHeaders;
    if (startMonth) {
      monthHeaders = monthHeaders.filter((m) => m.month >= startMonth);
    }
    if (endMonth) {
      monthHeaders = monthHeaders.filter((m) => m.month <= endMonth);
    }

    const monthColumns = monthHeaders.map((m) => m.month);

    // Parse rows
    let items = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i] as (string | number | undefined)[];
      if (!row[0]) continue;

      const rawItemId = String(row[0] || "");
      const rawDclass = String(row[1] || "Blank");
      const isColonRow = rawDclass === "colon";
      const itemId = isColonRow ? rawItemId.replace(/:$/, "") : rawItemId;

      if (!showAllRows && !isColonRow) continue;

      const monthlySales: Record<string, number> = {};
      let total = 0;
      for (const mh of monthHeaders) {
        const val = parseFloat(String(row[mh.idx] ?? "0")) || 0;
        if (val !== 0) {
          monthlySales[mh.month] = val;
          total += val;
        }
      }

      items.push({
        itemId,
        dclass: decodeDclass(rawDclass),
        mfgItemId: String(row[2] || ""),
        manufacturerName: String(row[3] || ""),
        model: String(row[4] || ""),
        description: String(row[5] || ""),
        productType: String(row[6] || ""),
        strippedSize: parseFloat(String(row[strippedSizeIdx] ?? "0")) || undefined,
        monthlySales,
        total,
        availableStock: availStockIdx >= 0 ? (parseFloat(String(row[availStockIdx] ?? "0")) || undefined) : undefined,
        isColonRow,
      });
    }

    // Collect filter options
    const brands = [...new Set(items.map((i) => i.manufacturerName))].sort();
    const productTypes = [...new Set(items.map((i) => i.productType))].sort();
    const dclasses = [...new Set(items.map((i) => i.dclass))].sort();

    // Apply filters
    if (filterBrand) items = items.filter((i) => i.manufacturerName === filterBrand);
    if (filterProductType) items = items.filter((i) => i.productType === filterProductType);
    if (filterDclass) items = items.filter((i) => i.dclass === filterDclass);

    return NextResponse.json({
      items,
      monthColumns,
      allAvailableMonths: allMonthHeaders.map((m) => m.month),
      filters: { brands, productTypes, dclasses },
      fileDate,
      fileName: fileKey.split("/").pop(),
      totalRows: items.length,
    });
  } catch (err) {
    console.error("Sales history data error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load sales data" }, { status: 500 });
  }
}
