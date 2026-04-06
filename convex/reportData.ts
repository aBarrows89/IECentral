import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

export const WAREHOUSES: Record<string, string> = {
  R10: "Latrobe",
  EXP: "Export / Everson",
  R30: "Chestnut Ridge",
};

// D-class decoding
function decodeDclass(raw: string): string {
  const map: Record<string, string> = { Blank: "", Dash: "-", colon: ":", "Open Bracket": "[" };
  return map[raw] ?? raw;
}

// Computed description from tire catalog fields
function buildDescription(tire: {
  mfgName: string; model: string; size: string;
  xlrf?: string; loadIndex?: number; speedRating?: string;
  plyRating?: string; sidewall?: string;
}): string {
  const parts = [tire.mfgName, tire.model, tire.size];
  if (tire.xlrf) parts.push(tire.xlrf);
  if (tire.loadIndex && tire.speedRating) parts.push(`${tire.loadIndex}${tire.speedRating}`);
  if (tire.plyRating) parts.push(tire.plyRating);
  if (tire.sidewall) parts.push(tire.sidewall);
  return parts.join(" ");
}

// ─── UPLOAD TRACKING ────────────────────────────────────────────────────────

export const createUpload = mutation({
  args: {
    uploadedBy: v.optional(v.id("users")),
    uploadedByName: v.string(),
    sourceType: v.string(),
    warehouse: v.optional(v.string()),
    fileName: v.string(),
    rowCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("reportDataUploads", {
      ...args,
      uploadedAt: Date.now(),
      status: "processing",
    });
  },
});

export const completeUpload = mutation({
  args: {
    uploadId: v.id("reportDataUploads"),
    rowCount: v.number(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.uploadId, {
      rowCount: args.rowCount,
      status: args.status,
      errorMessage: args.errorMessage,
    });
  },
});

export const getLatestUpload = query({
  args: { sourceType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reportDataUploads")
      .withIndex("by_sourceType", (q) => q.eq("sourceType", args.sourceType))
      .order("desc")
      .first();
  },
});

export const listUploads = query({
  args: { sourceType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.sourceType) {
      return await ctx.db
        .query("reportDataUploads")
        .withIndex("by_sourceType", (q) => q.eq("sourceType", args.sourceType))
        .order("desc")
        .take(20);
    }
    return await ctx.db.query("reportDataUploads").order("desc").take(20);
  },
});

// ─── BATCH INSERT MUTATIONS ─────────────────────────────────────────────────

export const batchInsertTireCatalog = mutation({
  args: {
    uploadId: v.id("reportDataUploads"),
    rows: v.array(v.object({
      itemId: v.string(),
      mfgItemId: v.optional(v.string()),
      mfgName: v.string(),
      mfgId: v.string(),
      model: v.string(),
      size: v.string(),
      rawSize: v.optional(v.number()),
      xlrf: v.optional(v.string()),
      loadIndex: v.optional(v.number()),
      speedRating: v.optional(v.string()),
      plyRating: v.optional(v.string()),
      sidewall: v.optional(v.string()),
      productType: v.string(),
      stockType: v.optional(v.number()),
      season: v.optional(v.string()),
      weight: v.optional(v.number()),
      utqg: v.optional(v.string()),
      upc: v.optional(v.string()),
      warrantyMiles: v.optional(v.number()),
      treadDepth: v.optional(v.number()),
      runflat: v.optional(v.number()),
      overallDiameter: v.optional(v.number()),
      sectionWidth: v.optional(v.number()),
      measuredRim: v.optional(v.number()),
      rimWidthMin: v.optional(v.number()),
      rimWidthMax: v.optional(v.number()),
      maxLoadSingle: v.optional(v.number()),
      maxAirSingle: v.optional(v.number()),
      maxLoadDual: v.optional(v.number()),
      maxAirDual: v.optional(v.number()),
      fet: v.optional(v.number()),
      ean: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("tireCatalog", {
        ...row,
        uploadId: args.uploadId,
        computedDescription: buildDescription(row),
      });
    }
  },
});

export const batchInsertInventory = mutation({
  args: {
    uploadId: v.id("reportDataUploads"),
    rows: v.array(v.object({
      location: v.string(),
      productType: v.string(),
      stockType: v.optional(v.number()),
      dclassRaw: v.string(),
      manufacturerCode: v.string(),
      manufacturerName: v.string(),
      model: v.optional(v.string()),
      itemId: v.string(),
      mfgItemId: v.string(),
      description: v.string(),
      reorderPoint: v.number(),
      qtyOnHand: v.number(),
      qtyCommitted: v.number(),
      qtyAvailable: v.number(),
      priceRetail: v.number(),
      priceCommercial: v.number(),
      priceWholesale: v.number(),
      priceBase: v.number(),
      priceList: v.number(),
      priceAdj: v.number(),
      lastCost: v.number(),
      avgCost: v.number(),
      stdCost: v.number(),
      fet: v.number(),
      extendedValue: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const { dclassRaw, ...rest } = row;
      await ctx.db.insert("inventoryItems", {
        ...rest,
        uploadId: args.uploadId,
        dclass: decodeDclass(dclassRaw),
      });
    }
  },
});

export const batchInsertSalesHistory = mutation({
  args: {
    uploadId: v.id("reportDataUploads"),
    warehouse: v.string(),
    rows: v.array(v.object({
      itemId: v.string(),
      dclassRaw: v.string(),
      mfgItemId: v.string(),
      manufacturerName: v.string(),
      model: v.optional(v.string()),
      description: v.string(),
      productType: v.string(),
      strippedSize: v.optional(v.number()),
      monthlySales: v.string(),
      total: v.number(),
      availableStock: v.optional(v.number()),
      isColonRow: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const { dclassRaw, ...rest } = row;
      await ctx.db.insert("salesHistory", {
        ...rest,
        uploadId: args.uploadId,
        warehouse: args.warehouse,
        dclass: decodeDclass(dclassRaw),
      });
    }
  },
});

// Delete old data for a source type (before inserting new)
export const deleteByUploadId = mutation({
  args: {
    uploadId: v.id("reportDataUploads"),
    table: v.string(),
  },
  handler: async (ctx, args) => {
    const tableName = args.table as "tireCatalog" | "inventoryItems" | "salesHistory";
    const rows = await ctx.db
      .query(tableName)
      .withIndex("by_uploadId", (q) => q.eq("uploadId", args.uploadId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return rows.length;
  },
});

// ─── REPORT QUERIES ─────────────────────────────────────────────────────────

export const getInventoryReport = query({
  args: {
    location: v.optional(v.string()),
    brand: v.optional(v.string()),
    productType: v.optional(v.string()),
    dclass: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get latest upload
    const upload = await ctx.db
      .query("reportDataUploads")
      .withIndex("by_sourceType", (q) => q.eq("sourceType", "oeival"))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .order("desc")
      .first();
    if (!upload) return { items: [], uploadDate: null, filters: { locations: [], brands: [], productTypes: [], dclasses: [] } };

    let items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_uploadId", (q) => q.eq("uploadId", upload._id))
      .collect();

    // Collect filter options from full data
    const locations = [...new Set(items.map((i) => i.location))].sort();
    const brands = [...new Set(items.map((i) => i.manufacturerName))].sort();
    const productTypes = [...new Set(items.map((i) => i.productType))].sort();
    const dclasses = [...new Set(items.map((i) => i.dclass))].sort();

    // Apply filters
    if (args.location) items = items.filter((i) => i.location === args.location);
    if (args.brand) items = items.filter((i) => i.manufacturerName === args.brand);
    if (args.productType) items = items.filter((i) => i.productType === args.productType);
    if (args.dclass) items = items.filter((i) => i.dclass === args.dclass);

    // Join with tire catalog for computed descriptions
    const tireUpload = await ctx.db
      .query("reportDataUploads")
      .withIndex("by_sourceType", (q) => q.eq("sourceType", "tires"))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .order("desc")
      .first();

    let tireMap = new Map<string, string>();
    if (tireUpload) {
      const tires = await ctx.db
        .query("tireCatalog")
        .withIndex("by_uploadId", (q) => q.eq("uploadId", tireUpload._id))
        .collect();
      tireMap = new Map(tires.map((t) => [t.itemId, t.computedDescription]));
    }

    const enriched = items.map((item) => ({
      ...item,
      computedDescription: tireMap.get(item.itemId) || item.description,
    }));

    return {
      items: enriched,
      uploadDate: upload.uploadedAt,
      filters: { locations, brands, productTypes, dclasses },
    };
  },
});

export const getSalesHistoryReport = query({
  args: {
    warehouse: v.optional(v.string()),
    brand: v.optional(v.string()),
    productType: v.optional(v.string()),
    dclass: v.optional(v.string()),
    showAllRows: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const upload = await ctx.db
      .query("reportDataUploads")
      .withIndex("by_sourceType", (q) => q.eq("sourceType", "oea07v"))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .order("desc")
      .first();
    if (!upload) return { items: [], uploadDate: null, monthColumns: [], filters: { warehouses: [], brands: [], productTypes: [], dclasses: [] } };

    let items = await ctx.db
      .query("salesHistory")
      .withIndex("by_uploadId", (q) => q.eq("uploadId", upload._id))
      .collect();

    // Filter to colon rows by default (actual sales data)
    if (!args.showAllRows) {
      items = items.filter((i) => i.isColonRow);
    }

    // Collect filter options
    const warehouses = [...new Set(items.map((i) => i.warehouse))].sort();
    const brands = [...new Set(items.map((i) => i.manufacturerName))].sort();
    const productTypes = [...new Set(items.map((i) => i.productType))].sort();
    const dclasses = [...new Set(items.map((i) => i.dclass))].sort();

    // Apply filters
    if (args.warehouse) items = items.filter((i) => i.warehouse === args.warehouse);
    if (args.brand) items = items.filter((i) => i.manufacturerName === args.brand);
    if (args.productType) items = items.filter((i) => i.productType === args.productType);
    if (args.dclass) items = items.filter((i) => i.dclass === args.dclass);

    // Get month columns from the data
    const monthSet = new Set<string>();
    for (const item of items) {
      try {
        const sales = JSON.parse(item.monthlySales);
        Object.keys(sales).forEach((m) => monthSet.add(m));
      } catch { /* skip */ }
    }
    const monthColumns = [...monthSet].sort();

    // Join tire catalog
    const tireUpload = await ctx.db
      .query("reportDataUploads")
      .withIndex("by_sourceType", (q) => q.eq("sourceType", "tires"))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .order("desc")
      .first();

    let tireMap = new Map<string, string>();
    if (tireUpload) {
      const tires = await ctx.db
        .query("tireCatalog")
        .withIndex("by_uploadId", (q) => q.eq("uploadId", tireUpload._id))
        .collect();
      tireMap = new Map(tires.map((t) => [t.itemId, t.computedDescription]));
    }

    const enriched = items.map((item) => ({
      ...item,
      computedDescription: tireMap.get(item.itemId) || item.description,
    }));

    return {
      items: enriched,
      uploadDate: upload.uploadedAt,
      monthColumns,
      filters: { warehouses, brands, productTypes, dclasses },
    };
  },
});

// Get distinct filter values for dropdowns
export const getFilterOptions = query({
  args: { sourceType: v.string() },
  handler: async (ctx, args) => {
    const upload = await ctx.db
      .query("reportDataUploads")
      .withIndex("by_sourceType", (q) => q.eq("sourceType", args.sourceType))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .order("desc")
      .first();
    if (!upload) return { locations: [], brands: [], productTypes: [], dclasses: [] };

    if (args.sourceType === "oeival") {
      const items = await ctx.db.query("inventoryItems").withIndex("by_uploadId", (q) => q.eq("uploadId", upload._id)).collect();
      return {
        locations: [...new Set(items.map((i) => i.location))].sort(),
        brands: [...new Set(items.map((i) => i.manufacturerName))].sort(),
        productTypes: [...new Set(items.map((i) => i.productType))].sort(),
        dclasses: [...new Set(items.map((i) => i.dclass))].sort(),
      };
    }

    if (args.sourceType === "oea07v") {
      const items = await ctx.db.query("salesHistory").withIndex("by_uploadId", (q) => q.eq("uploadId", upload._id)).collect();
      return {
        locations: [...new Set(items.map((i) => i.warehouse))].sort(),
        brands: [...new Set(items.map((i) => i.manufacturerName))].sort(),
        productTypes: [...new Set(items.map((i) => i.productType))].sort(),
        dclasses: [...new Set(items.map((i) => i.dclass))].sort(),
      };
    }

    return { locations: [], brands: [], productTypes: [], dclasses: [] };
  },
});
