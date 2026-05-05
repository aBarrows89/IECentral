import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const add = mutation({
  args: {
    locationCode: v.string(),
    itemId: v.string(),
    manufacturerName: v.optional(v.string()),
    description: v.optional(v.string()),
    qtyChange: v.number(),
    notes: v.optional(v.string()),
    enteredBy: v.optional(v.id("users")),
    enteredByName: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.locationCode.trim().toUpperCase();
    const itemId = args.itemId.trim();
    if (!code) throw new Error("Location is required");
    if (!itemId) throw new Error("Item ID is required");
    if (!Number.isFinite(args.qtyChange) || args.qtyChange === 0) {
      throw new Error("Qty change must be non-zero");
    }
    return await ctx.db.insert("inventoryAdjustments", {
      ...args,
      locationCode: code,
      itemId,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("inventoryAdjustments") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const listByLocation = query({
  args: { locationCode: v.string() },
  handler: async (ctx, args) => {
    const code = args.locationCode.trim().toUpperCase();
    return await ctx.db
      .query("inventoryAdjustments")
      .withIndex("by_location_created", (q) => q.eq("locationCode", code))
      .order("desc")
      .collect();
  },
});
