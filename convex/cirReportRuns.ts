import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const logRun = mutation({
  args: {
    locationCode: v.string(),
    brands: v.array(v.string()),
    generatedBy: v.optional(v.id("users")),
    generatedByName: v.string(),
  },
  handler: async (ctx, args) => {
    const code = args.locationCode.trim().toUpperCase();
    if (!code) throw new Error("locationCode is required");
    return await ctx.db.insert("cirReportRuns", {
      ...args,
      locationCode: code,
      createdAt: Date.now(),
    });
  },
});

export const listSince = query({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cirReportRuns")
      .withIndex("by_created", (q) => q.gte("createdAt", args.since))
      .order("desc")
      .collect();
  },
});

export const listByLocation = query({
  args: { locationCode: v.string(), since: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const code = args.locationCode.trim().toUpperCase();
    const all = await ctx.db
      .query("cirReportRuns")
      .withIndex("by_location_created", (q) => q.eq("locationCode", code))
      .order("desc")
      .collect();
    return args.since !== undefined ? all.filter((r) => r.createdAt >= args.since!) : all;
  },
});
