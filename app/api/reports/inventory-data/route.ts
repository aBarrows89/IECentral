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

    // Auto-detect columns from header row
    const headerRow = (rawData[0] as string[]).map((h) => String(h || "").replace(/"/g, "").trim().toLowerCase());

    // Map known header names to field keys
    const headerMap: Record<string, string[]> = {
      location: ["loc id", "location", "loc"],
      productType: ["product type", "prod type", "type"],
      stockType: ["stock type"],
      dclass: ["d class", "d-class", "dclass"],
      manufacturerCode: ["mfg code", "mfg id", "manufacturer code"],
      manufacturerName: ["mfg name", "mfg's name", "brand", "manufacturer"],
      model: ["model", "model description"],
      itemId: ["item id", "item_id", "itemid"],
      mfgItemId: ["mfg's item id", "mfg item id", "mfg_item_id"],
      description: ["item description", "description", "desc"],
      reorderPoint: ["reorder point", "reorder pt"],
      qtyOnHand: ["qty on hand", "on hand", "qoh"],
      qtyCommitted: ["qty committed", "committed"],
      qtyAvailable: ["qty available", "available"],
      priceRetail: ["retail price", "price retail", "retail"],
      priceCommercial: ["commercial price", "price commercial", "commercial"],
      priceWholesale: ["wholesale price", "price wholesale", "wholesale"],
      priceBase: ["base price", "price base", "base"],
      priceList: ["list price", "price list", "list"],
      priceAdj: ["price adj", "adj price"],
      lastCost: ["last cost", "last"],
      avgCost: ["avg cost", "average cost"],
      stdCost: ["std cost", "standard cost"],
      fet: ["fet"],
      extendedValue: ["extended value", "ext value", "extended"],
    };

    // Find column index for each field
    const col: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(headerMap)) {
      const idx = headerRow.findIndex((h) => aliases.some((a) => h.includes(a)));
      if (idx >= 0) col[field] = idx;
    }

    // Fallback to positional mapping if no header matches (XLSX format)
    const hasHeaders = Object.keys(col).length > 5;
    if (!hasHeaders) {
      Object.assign(col, {
        location: 0, productType: 1, stockType: 2, dclass: 3,
        manufacturerCode: 4, manufacturerName: 5, model: 6, itemId: 7,
        mfgItemId: 8, description: 9, reorderPoint: 10, qtyOnHand: 11,
        qtyCommitted: 12, qtyAvailable: 13, priceRetail: 14, priceCommercial: 15,
        priceWholesale: 16, priceBase: 17, priceList: 18, priceAdj: 19,
        lastCost: 20, avgCost: 21, stdCost: 22, fet: 23, extendedValue: 24,
      });
    }

    const startRow = hasHeaders ? 1 : 1;
    const g = (row: unknown[], field: string) => col[field] !== undefined ? String((row as any)[col[field]] ?? "") : "";
    const gn = (row: unknown[], field: string) => col[field] !== undefined ? num((row as any)[col[field]]) : 0;

    // Parse all rows
    let items = [];
    for (let i = startRow; i < rawData.length; i++) {
      const row = rawData[i] as (string | number | undefined)[];
      if (!row[0] && !row[1]) continue;

      items.push({
        location: g(row, "location"),
        productType: g(row, "productType"),
        stockType: gn(row, "stockType"),
        dclass: decodeDclass(g(row, "dclass") || "Blank"),
        manufacturerCode: g(row, "manufacturerCode"),
        manufacturerName: g(row, "manufacturerName"),
        model: g(row, "model"),
        itemId: g(row, "itemId"),
        mfgItemId: g(row, "mfgItemId"),
        description: g(row, "description"),
        reorderPoint: gn(row, "reorderPoint"),
        qtyOnHand: gn(row, "qtyOnHand"),
        qtyCommitted: gn(row, "qtyCommitted"),
        qtyAvailable: gn(row, "qtyAvailable"),
        priceRetail: gn(row, "priceRetail"),
        priceCommercial: gn(row, "priceCommercial"),
        priceWholesale: gn(row, "priceWholesale"),
        priceBase: gn(row, "priceBase"),
        priceList: gn(row, "priceList"),
        priceAdj: gn(row, "priceAdj"),
        lastCost: gn(row, "lastCost"),
        avgCost: gn(row, "avgCost"),
        stdCost: gn(row, "stdCost"),
        fet: gn(row, "fet"),
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
