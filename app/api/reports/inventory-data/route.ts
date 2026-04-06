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

/**
 * GET /api/reports/inventory-data
 *
 * Reads the latest OEIVAL XLSX from S3, parses it, returns filtered JSON.
 * Query params: location, brand, productType, dclass
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const filterLocation = searchParams.get("location");
    const filterBrand = searchParams.get("brand");
    const filterProductType = searchParams.get("productType");
    const filterDclass = searchParams.get("dclass");

    // Find latest OEIVAL file — check organized folder first, then legacy paths
    let oeivalFiles: { Key?: string; LastModified?: Date }[] = [];
    for (const prefix of ["jmk-uploads/oeival/", "jmk-uploads/"]) {
      const listRes = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, MaxKeys: 1000 }));
      const found = (listRes.Contents || [])
        .filter((o) => o.Key?.toLowerCase().includes("oeival") && (o.Key?.endsWith(".xlsx") || o.Key?.endsWith(".csv")));
      if (found.length > 0) { oeivalFiles = found; break; }
    }
    oeivalFiles.sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    if (oeivalFiles.length === 0) {
      return NextResponse.json({ items: [], filters: { locations: [], brands: [], productTypes: [], dclasses: [] }, fileDate: null });
    }

    const fileKey = oeivalFiles[0].Key!;
    const fileDate = oeivalFiles[0].LastModified?.toISOString();

    // Download and parse
    const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: fileKey }));
    const buffer = await getRes.Body?.transformToByteArray();
    if (!buffer) return NextResponse.json({ items: [], filters: { locations: [], brands: [], productTypes: [], dclasses: [] }, fileDate });

    let rawData: unknown[][];
    if (fileKey.toLowerCase().endsWith(".csv")) {
      const text = new TextDecoder().decode(buffer);
      const lines = text.replace(/^\uFEFF/, "").replace(/\0/g, "").split("\n");
      rawData = lines.map((line) => {
        const fields: string[] = [];
        let field = "", inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQuotes) {
            if (ch === '"') { if (line[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
            else field += ch;
          } else {
            if (ch === '"') inQuotes = true;
            else if (ch === ",") { fields.push(field.trim()); field = ""; }
            else if (ch === "\r") continue;
            else field += ch;
          }
        }
        fields.push(field.trim());
        return fields;
      }).filter((r) => r.some((f) => f));
    } else {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    }

    if (rawData.length < 2) {
      return NextResponse.json({ items: [], filters: { locations: [], brands: [], productTypes: [], dclasses: [] }, fileDate });
    }

    const num = (val: unknown) => parseFloat(String(val ?? "0")) || 0;

    // Parse all rows
    let items = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i] as (string | number | undefined)[];
      if (!row[0]) continue;

      items.push({
        location: String(row[0] || ""),
        productType: String(row[1] || ""),
        stockType: num(row[2]),
        dclass: decodeDclass(String(row[3] || "Blank")),
        manufacturerCode: String(row[4] || ""),
        manufacturerName: String(row[5] || ""),
        model: String(row[6] || ""),
        itemId: String(row[7] || ""),
        mfgItemId: String(row[8] || ""),
        description: String(row[9] || ""),
        reorderPoint: num(row[10]),
        qtyOnHand: num(row[11]),
        qtyCommitted: num(row[12]),
        qtyAvailable: num(row[13]),
        priceRetail: num(row[14]),
        priceCommercial: num(row[15]),
        priceWholesale: num(row[16]),
        priceBase: num(row[17]),
        priceList: num(row[18]),
        priceAdj: num(row[19]),
        lastCost: num(row[20]),
        avgCost: num(row[21]),
        stdCost: num(row[22]),
        fet: num(row[23]),
        extendedValue: num(row[24]),
      });
    }

    // Collect filter options from full data
    const locations = [...new Set(items.map((i) => i.location))].sort();
    const brands = [...new Set(items.map((i) => i.manufacturerName))].sort();
    const productTypes = [...new Set(items.map((i) => i.productType))].sort();
    const dclasses = [...new Set(items.map((i) => i.dclass))].sort();

    // Apply filters
    if (filterLocation) items = items.filter((i) => i.location === filterLocation);
    if (filterBrand) items = items.filter((i) => i.manufacturerName === filterBrand);
    if (filterProductType) items = items.filter((i) => i.productType === filterProductType);
    if (filterDclass) items = items.filter((i) => i.dclass === filterDclass);

    return NextResponse.json({
      items,
      filters: { locations, brands, productTypes, dclasses },
      fileDate,
      fileName: fileKey.split("/").pop(),
      totalRows: items.length,
    });
  } catch (err) {
    console.error("Inventory data error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load inventory data" }, { status: 500 });
  }
}
