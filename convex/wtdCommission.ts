import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ─── CUSTOMER CONFIG QUERIES ────────────────────────────────────────────────

export const listCustomers = query({
  handler: async (ctx) => {
    return await ctx.db.query("wtdCommissionCustomers").collect();
  },
});

export const getActiveCustomers = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("wtdCommissionCustomers")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

export const getCustomer = query({
  args: { id: v.id("wtdCommissionCustomers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ─── CUSTOMER CONFIG MUTATIONS ──────────────────────────────────────────────

export const createCustomer = mutation({
  args: {
    customerName: v.string(),
    customerNumber: v.string(),
    qualifyingDclasses: v.array(v.string()),
    qualifyingBrands: v.array(v.string()),
    commissionType: v.string(),
    commissionValue: v.number(),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("wtdCommissionCustomers", {
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCustomer = mutation({
  args: {
    id: v.id("wtdCommissionCustomers"),
    customerName: v.optional(v.string()),
    customerNumber: v.optional(v.string()),
    qualifyingDclasses: v.optional(v.array(v.string())),
    qualifyingBrands: v.optional(v.array(v.string())),
    commissionType: v.optional(v.string()),
    commissionValue: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Customer config not found");
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
  },
});

export const deleteCustomer = mutation({
  args: { id: v.id("wtdCommissionCustomers") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// ─── ACCESS OVERRIDE QUERIES ────────────────────────────────────────────────

export const getAccessOverrides = query({
  handler: async (ctx) => {
    const records = await ctx.db.query("wtdCommissionAccess").collect();
    return records[0] ?? null;
  },
});

export const getAccessOverridesWithNames = query({
  handler: async (ctx) => {
    const records = await ctx.db.query("wtdCommissionAccess").collect();
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

// ─── ACCESS OVERRIDE MUTATIONS ──────────────────────────────────────────────

export const setAccessOverrides = mutation({
  args: {
    userIds: v.array(v.id("users")),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("wtdCommissionAccess").collect();
    const now = Date.now();

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        userIds: args.userIds,
        updatedBy: args.updatedBy,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("wtdCommissionAccess", {
        userIds: args.userIds,
        updatedBy: args.updatedBy,
        updatedAt: now,
      });
    }
  },
});

// ─── CHECK ACCESS ───────────────────────────────────────────────────────────

export const checkAccess = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const records = await ctx.db.query("wtdCommissionAccess").collect();
    if (!records[0]) return false;
    return records[0].userIds.includes(args.userId);
  },
});
