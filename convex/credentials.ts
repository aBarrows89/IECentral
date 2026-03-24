import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// Helper to check if user has dev team access (super_admin only)
async function hasDevAccess(ctx: any, userId: string): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;

  return user.role === "super_admin";
}

// ============ QUERIES ============

// List all credentials (super_admin only)
export const list = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    if (!(await hasDevAccess(ctx, args.userId))) return [];

    const credentials = await ctx.db.query("credentials").collect();

    // Sort by service, then by name
    return credentials.sort((a, b) => {
      if (a.service !== b.service) return a.service.localeCompare(b.service);
      return a.name.localeCompare(b.name);
    });
  },
});

// Get a single credential
export const get = query({
  args: { id: v.id("credentials"), userId: v.id("users") },
  handler: async (ctx, args) => {
    if (!(await hasDevAccess(ctx, args.userId))) return null;
    return await ctx.db.get(args.id);
  },
});

// Get credentials by service
export const getByService = query({
  args: { service: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    if (!(await hasDevAccess(ctx, args.userId))) return [];

    return await ctx.db
      .query("credentials")
      .withIndex("by_service", (q) => q.eq("service", args.service))
      .collect();
  },
});

// ============ MUTATIONS ============

// Create a new credential
export const create = mutation({
  args: {
    name: v.string(),
    service: v.string(),
    keyType: v.string(),
    value: v.string(),
    environment: v.optional(v.string()),
    project: v.optional(v.string()),
    notes: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (!(await hasDevAccess(ctx, args.userId))) {
      throw new Error("You do not have permission to manage credentials");
    }

    const now = Date.now();

    return await ctx.db.insert("credentials", {
      name: args.name,
      service: args.service,
      keyType: args.keyType,
      value: args.value,
      environment: args.environment,
      project: args.project,
      notes: args.notes,
      expiresAt: args.expiresAt,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update a credential
export const update = mutation({
  args: {
    id: v.id("credentials"),
    name: v.optional(v.string()),
    service: v.optional(v.string()),
    keyType: v.optional(v.string()),
    value: v.optional(v.string()),
    environment: v.optional(v.string()),
    project: v.optional(v.string()),
    notes: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (!(await hasDevAccess(ctx, args.userId))) {
      throw new Error("You do not have permission to manage credentials");
    }

    const { id, userId, ...updates } = args;

    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    }

    return await ctx.db.patch(id, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Delete a credential
export const remove = mutation({
  args: {
    id: v.id("credentials"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    if (!(await hasDevAccess(ctx, args.userId))) {
      throw new Error("You do not have permission to manage credentials");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});
