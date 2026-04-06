import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ─── REPORT TYPES ───────────────────────────────────────────────────────────

export const listReportTypes = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("jmkReportTypes")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

export const getReportType = query({
  args: { reportCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("jmkReportTypes")
      .withIndex("by_code", (q) => q.eq("reportCode", args.reportCode))
      .first();
  },
});

export const seedReportType = mutation({
  args: {
    reportCode: v.string(),
    displayName: v.string(),
    description: v.string(),
    expectedColumns: v.array(v.string()),
    filePattern: v.string(),
    acceptedFormats: v.array(v.string()),
    s3Prefix: v.string(),
    processingTriggers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("jmkReportTypes")
      .withIndex("by_code", (q) => q.eq("reportCode", args.reportCode))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("jmkReportTypes", {
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ─── UPLOAD HISTORY ─────────────────────────────────────────────────────────

export const recordUpload = mutation({
  args: {
    reportType: v.string(),
    fileName: v.string(),
    fileSize: v.number(),
    s3Key: v.string(),
    reportingMonth: v.string(),
    rowCount: v.optional(v.number()),
    dateRangeStart: v.optional(v.string()),
    dateRangeEnd: v.optional(v.string()),
    validationStatus: v.string(),
    validationErrors: v.optional(v.array(v.string())),
    uploadedBy: v.optional(v.id("users")),
    uploadedByName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("jmkUploadHistory", {
      ...args,
      processingStatus: "pending",
      createdAt: Date.now(),
    });
  },
});

export const updateProcessing = mutation({
  args: {
    uploadId: v.id("jmkUploadHistory"),
    processingStatus: v.string(),
    processingResults: v.optional(v.array(v.object({
      trigger: v.string(),
      status: v.string(),
      message: v.optional(v.string()),
      completedAt: v.optional(v.number()),
    }))),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.uploadId, {
      processingStatus: args.processingStatus,
      processingResults: args.processingResults,
    });
  },
});

export const listUploadHistory = query({
  args: {
    reportType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("jmkUploadHistory").withIndex("by_created").order("desc");

    const results = await q.collect();

    let filtered = results;
    if (args.reportType) {
      filtered = results.filter((r) => r.reportType === args.reportType);
    }

    return filtered.slice(0, args.limit ?? 50);
  },
});

export const getUpload = query({
  args: { uploadId: v.id("jmkUploadHistory") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.uploadId);
  },
});

// ─── ACCESS CONTROL ─────────────────────────────────────────────────────────

export const checkUploadAccess = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const records = await ctx.db.query("reportUploadAccess").collect();
    if (!records[0]) return false;
    return records[0].userIds.includes(args.userId);
  },
});

export const getUploadAccessWithNames = query({
  handler: async (ctx) => {
    const records = await ctx.db.query("reportUploadAccess").collect();
    const record = records[0];
    if (!record) return { userIds: [], users: [] };

    const users = await Promise.all(
      record.userIds.map(async (userId) => {
        const user = await ctx.db.get(userId);
        return user ? { _id: user._id, name: user.name, email: user.email } : null;
      })
    );

    return {
      userIds: record.userIds,
      users: users.filter(Boolean),
    };
  },
});

export const setUploadAccess = mutation({
  args: {
    userIds: v.array(v.id("users")),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("reportUploadAccess").collect();
    const now = Date.now();

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        userIds: args.userIds,
        updatedBy: args.updatedBy,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("reportUploadAccess", {
        userIds: args.userIds,
        updatedBy: args.updatedBy,
        updatedAt: now,
      });
    }
  },
});
