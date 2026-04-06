import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outstanding-dalmatian-787.convex.cloud";
const BATCH_SIZE = 100;

// Excel serial date to YYYY-MM
function excelDateToMonth(serial: number): string {
  const d = new Date((serial - 25569) * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function POST(request: NextRequest) {
  const convex = new ConvexHttpClient(CONVEX_URL);

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const sourceType = formData.get("sourceType") as string;
    const warehouse = formData.get("warehouse") as string | null;
    const userId = formData.get("userId") as string | null;
    const userName = formData.get("userName") as string || "Unknown";

    if (!file || !sourceType) {
      return NextResponse.json({ error: "file and sourceType required" }, { status: 400 });
    }

    if (sourceType === "oea07v" && !warehouse) {
      return NextResponse.json({ error: "warehouse required for OEA07V uploads" }, { status: 400 });
    }

    // Create upload record
    const uploadId = await convex.mutation(api.reportData.createUpload, {
      uploadedBy: userId ? (userId as Id<"users">) : undefined,
      uploadedByName: userName,
      sourceType,
      warehouse: warehouse || undefined,
      fileName: file.name,
      rowCount: 0,
    });

    // Find and delete previous upload's data
    const prevUpload = await convex.query(api.reportData.getLatestUpload, { sourceType });
    if (prevUpload && prevUpload._id !== uploadId) {
      const table = sourceType === "tires" ? "tireCatalog" : sourceType === "oeival" ? "inventoryItems" : "salesHistory";
      try {
        await convex.mutation(api.reportData.deleteByUploadId, { uploadId: prevUpload._id, table });
      } catch { /* may exceed limits for large datasets, continue anyway */ }
    }

    const buffer = await file.arrayBuffer();
    let rowCount = 0;

    if (sourceType === "tires") {
      // Parse CSV
      const text = new TextDecoder().decode(buffer);
      const lines = text.replace(/^\uFEFF/, "").split("\n");
      const headers = lines[0].split(",").map((h) => h.trim());

      const colIdx = (name: string) => headers.indexOf(name);
      const batch: Parameters<typeof api.reportData.batchInsertTireCatalog>[0]["rows"] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        if (cols.length < 10) continue;

        batch.push({
          itemId: cols[colIdx("itemId")] || "",
          mfgItemId: cols[colIdx("mfgItemId")] || undefined,
          mfgName: cols[colIdx("mfgName")] || "",
          mfgId: cols[colIdx("mfgId")] || "",
          model: cols[colIdx("model")] || "",
          size: cols[colIdx("size")] || "",
          rawSize: parseFloat(cols[colIdx("rawSize")]) || undefined,
          xlrf: cols[colIdx("xlrf")] || undefined,
          loadIndex: parseInt(cols[colIdx("loadIndex")]) || undefined,
          speedRating: cols[colIdx("speedRating")] || undefined,
          plyRating: cols[colIdx("plyRating")] || undefined,
          sidewall: cols[colIdx("sidewall")] || undefined,
          productType: cols[colIdx("productType")] || "",
          stockType: parseInt(cols[colIdx("stockType")]) || undefined,
          season: cols[colIdx("season")] || undefined,
          weight: parseFloat(cols[colIdx("weight")]) || undefined,
          utqg: cols[colIdx("utqg")] || undefined,
          upc: cols[colIdx("upc")] || undefined,
          warrantyMiles: parseInt(cols[colIdx("warrantyMiles")]) || undefined,
          treadDepth: parseFloat(cols[colIdx("treadDepth")]) || undefined,
          runflat: parseInt(cols[colIdx("runflat")]) || undefined,
          overallDiameter: parseFloat(cols[colIdx("overallDiameter")]) || undefined,
          sectionWidth: parseFloat(cols[colIdx("sectionWidth")]) || undefined,
          measuredRim: parseFloat(cols[colIdx("measuredRim")]) || undefined,
          rimWidthMin: parseFloat(cols[colIdx("rimWidthMin")]) || undefined,
          rimWidthMax: parseFloat(cols[colIdx("rimWidthMax")]) || undefined,
          maxLoadSingle: parseFloat(cols[colIdx("maxLoadSingle")]) || undefined,
          maxAirSingle: parseFloat(cols[colIdx("maxAirSingle")]) || undefined,
          maxLoadDual: parseFloat(cols[colIdx("maxLoadDual")]) || undefined,
          maxAirDual: parseFloat(cols[colIdx("maxAirDual")]) || undefined,
          fet: parseFloat(cols[colIdx("fet")]) || undefined,
          ean: cols[colIdx("ean")] || undefined,
        });

        if (batch.length >= BATCH_SIZE) {
          await convex.mutation(api.reportData.batchInsertTireCatalog, { uploadId, rows: batch });
          rowCount += batch.length;
          batch.length = 0;
        }
      }
      if (batch.length > 0) {
        await convex.mutation(api.reportData.batchInsertTireCatalog, { uploadId, rows: batch });
        rowCount += batch.length;
      }
    } else {
      // Parse XLSX
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

      if (rawData.length < 2) {
        await convex.mutation(api.reportData.completeUpload, { uploadId, rowCount: 0, status: "error", errorMessage: "No data rows" });
        return NextResponse.json({ error: "No data rows" }, { status: 400 });
      }

      const headers = (rawData[0] as (string | number)[]).map(String);

      if (sourceType === "oeival") {
        const batch: Parameters<typeof api.reportData.batchInsertInventory>[0]["rows"] = [];

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i] as (string | number | undefined)[];
          if (!row[0]) continue;

          const num = (idx: number) => parseFloat(String(row[idx] ?? "0")) || 0;

          batch.push({
            location: String(row[0] || ""),
            productType: String(row[1] || ""),
            stockType: num(2) || undefined,
            dclassRaw: String(row[3] || "Blank"),
            manufacturerCode: String(row[4] || ""),
            manufacturerName: String(row[5] || ""),
            model: String(row[6] || "") || undefined,
            itemId: String(row[7] || ""),
            mfgItemId: String(row[8] || ""),
            description: String(row[9] || ""),
            reorderPoint: num(10),
            qtyOnHand: num(11),
            qtyCommitted: num(12),
            qtyAvailable: num(13),
            priceRetail: num(14),
            priceCommercial: num(15),
            priceWholesale: num(16),
            priceBase: num(17),
            priceList: num(18),
            priceAdj: num(19),
            lastCost: num(20),
            avgCost: num(21),
            stdCost: num(22),
            fet: num(23),
            extendedValue: num(24),
          });

          if (batch.length >= BATCH_SIZE) {
            await convex.mutation(api.reportData.batchInsertInventory, { uploadId, rows: batch });
            rowCount += batch.length;
            batch.length = 0;
          }
        }
        if (batch.length > 0) {
          await convex.mutation(api.reportData.batchInsertInventory, { uploadId, rows: batch });
          rowCount += batch.length;
        }
      } else if (sourceType === "oea07v") {
        // Parse monthly columns — headers after "Stripped Size" and before "Total"
        const totalIdx = headers.indexOf("Total");
        const strippedSizeIdx = headers.indexOf("Stripped Size");
        const availStockIdx = headers.indexOf("Available Stock");

        // Monthly columns are between strippedSizeIdx+1 and totalIdx
        const monthHeaders: { idx: number; month: string }[] = [];
        for (let c = strippedSizeIdx + 1; c < totalIdx; c++) {
          const h = rawData[0]![c];
          if (typeof h === "number") {
            monthHeaders.push({ idx: c, month: excelDateToMonth(h) });
          }
        }

        const batch: Parameters<typeof api.reportData.batchInsertSalesHistory>[0]["rows"] = [];

        for (let i = 1; i < rawData.length; i++) {
          const row = rawData[i] as (string | number | undefined)[];
          if (!row[0]) continue;

          const rawItemId = String(row[0] || "");
          const rawDclass = String(row[1] || "Blank");
          const isColonRow = rawDclass === "colon";
          const itemId = isColonRow ? rawItemId.replace(/:$/, "") : rawItemId;

          // Build monthly sales JSON
          const monthlySales: Record<string, number> = {};
          for (const mh of monthHeaders) {
            const val = parseFloat(String(row[mh.idx] ?? "0")) || 0;
            if (val !== 0) monthlySales[mh.month] = val;
          }

          batch.push({
            itemId,
            dclassRaw: rawDclass,
            mfgItemId: String(row[2] || ""),
            manufacturerName: String(row[3] || ""),
            model: String(row[4] || "") || undefined,
            description: String(row[5] || ""),
            productType: String(row[6] || ""),
            strippedSize: parseFloat(String(row[strippedSizeIdx] ?? "0")) || undefined,
            monthlySales: JSON.stringify(monthlySales),
            total: parseFloat(String(row[totalIdx] ?? "0")) || 0,
            availableStock: availStockIdx >= 0 ? (parseFloat(String(row[availStockIdx] ?? "0")) || undefined) : undefined,
            isColonRow,
          });

          if (batch.length >= BATCH_SIZE) {
            await convex.mutation(api.reportData.batchInsertSalesHistory, { uploadId, warehouse: warehouse!, rows: batch });
            rowCount += batch.length;
            batch.length = 0;
          }
        }
        if (batch.length > 0) {
          await convex.mutation(api.reportData.batchInsertSalesHistory, { uploadId, warehouse: warehouse!, rows: batch });
          rowCount += batch.length;
        }
      }
    }

    // Mark complete
    await convex.mutation(api.reportData.completeUpload, { uploadId, rowCount, status: "complete" });

    return NextResponse.json({ status: "success", uploadId, rowCount });
  } catch (err) {
    console.error("Report ingest error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Ingest failed" }, { status: 500 });
  }
}
