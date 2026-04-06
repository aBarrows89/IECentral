import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("savedReportConfigs")
      .withIndex("by_created")
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("savedReportConfigs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getAutoRunConfigs = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("savedReportConfigs")
      .withIndex("by_autoRun", (q) => q.eq("autoRun", true))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    sources: v.array(v.string()),
    selectedColumns: v.array(v.string()),
    excludeTransactions: v.optional(v.array(v.string())),
    filterBrand: v.optional(v.string()),
    filterAccount: v.optional(v.string()),
    filterLocation: v.optional(v.string()),
    filterProductType: v.optional(v.string()),
    filterDclass: v.optional(v.string()),
    negateQty: v.optional(v.boolean()),
    dateRangeType: v.string(),
    customStartDate: v.optional(v.string()),
    customEndDate: v.optional(v.string()),
    fusionJoinKey: v.optional(v.string()),
    autoRun: v.boolean(),
    createdBy: v.id("users"),
    createdByName: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("savedReportConfigs", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("savedReportConfigs"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    autoRun: v.optional(v.boolean()),
    lastRunAt: v.optional(v.number()),
    lastRunRowCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("savedReportConfigs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
