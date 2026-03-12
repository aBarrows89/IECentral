/**
 * Email Domain Configuration Management
 *
 * Super admin operations for managing default IMAP/SMTP configurations
 * for email domains. This allows pre-configuring email settings for
 * company domains so users don't need to enter server details manually.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

// ============ QUERIES ============

/**
 * List all active domain configurations (for account setup flow).
 */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    const configs = await ctx.db
      .query("emailDomainConfigs")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return configs.sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
  },
});

/**
 * List all domain configurations (for admin management).
 */
export const listAll = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Verify user is super admin
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "super_admin") {
      return [];
    }

    const configs = await ctx.db
      .query("emailDomainConfigs")
      .collect();

    return configs.sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
  },
});

/**
 * Get configuration for a specific domain.
 */
export const getByDomain = query({
  args: { domain: v.string() },
  handler: async (ctx, args) => {
    const normalizedDomain = args.domain.toLowerCase().trim();

    const config = await ctx.db
      .query("emailDomainConfigs")
      .withIndex("by_domain", (q) => q.eq("domain", normalizedDomain))
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    return config;
  },
});

/**
 * Get a single domain configuration by ID.
 */
export const get = query({
  args: { configId: v.id("emailDomainConfigs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.configId);
  },
});

// ============ MUTATIONS ============

/**
 * Create a new domain configuration.
 */
export const create = mutation({
  args: {
    userId: v.id("users"),
    domain: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    imapHost: v.string(),
    imapPort: v.number(),
    imapTls: v.boolean(),
    smtpHost: v.string(),
    smtpPort: v.number(),
    smtpTls: v.boolean(),
    useEmailAsUsername: v.boolean(),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Verify user is super admin
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "super_admin") {
      throw new Error("Only super admins can create domain configurations");
    }

    const normalizedDomain = args.domain.toLowerCase().trim();

    // Check if domain already exists
    const existing = await ctx.db
      .query("emailDomainConfigs")
      .withIndex("by_domain", (q) => q.eq("domain", normalizedDomain))
      .first();

    if (existing) {
      throw new Error(`Configuration for domain "${normalizedDomain}" already exists`);
    }

    const now = Date.now();
    const configId = await ctx.db.insert("emailDomainConfigs", {
      domain: normalizedDomain,
      name: args.name,
      description: args.description,
      imapHost: args.imapHost,
      imapPort: args.imapPort,
      imapTls: args.imapTls,
      smtpHost: args.smtpHost,
      smtpPort: args.smtpPort,
      smtpTls: args.smtpTls,
      useEmailAsUsername: args.useEmailAsUsername,
      sortOrder: args.sortOrder,
      isActive: true,
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });

    return configId;
  },
});

/**
 * Update a domain configuration.
 */
export const update = mutation({
  args: {
    userId: v.id("users"),
    configId: v.id("emailDomainConfigs"),
    domain: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    imapHost: v.optional(v.string()),
    imapPort: v.optional(v.number()),
    imapTls: v.optional(v.boolean()),
    smtpHost: v.optional(v.string()),
    smtpPort: v.optional(v.number()),
    smtpTls: v.optional(v.boolean()),
    useEmailAsUsername: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Verify user is super admin
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "super_admin") {
      throw new Error("Only super admins can update domain configurations");
    }

    const config = await ctx.db.get(args.configId);
    if (!config) {
      throw new Error("Domain configuration not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.domain !== undefined) {
      const normalizedDomain = args.domain.toLowerCase().trim();
      // Check for duplicate if changing domain
      if (normalizedDomain !== config.domain) {
        const existing = await ctx.db
          .query("emailDomainConfigs")
          .withIndex("by_domain", (q) => q.eq("domain", normalizedDomain))
          .first();
        if (existing) {
          throw new Error(`Configuration for domain "${normalizedDomain}" already exists`);
        }
      }
      updates.domain = normalizedDomain;
    }
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.imapHost !== undefined) updates.imapHost = args.imapHost;
    if (args.imapPort !== undefined) updates.imapPort = args.imapPort;
    if (args.imapTls !== undefined) updates.imapTls = args.imapTls;
    if (args.smtpHost !== undefined) updates.smtpHost = args.smtpHost;
    if (args.smtpPort !== undefined) updates.smtpPort = args.smtpPort;
    if (args.smtpTls !== undefined) updates.smtpTls = args.smtpTls;
    if (args.useEmailAsUsername !== undefined) updates.useEmailAsUsername = args.useEmailAsUsername;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.configId, updates);
  },
});

/**
 * Delete a domain configuration.
 */
export const remove = mutation({
  args: {
    userId: v.id("users"),
    configId: v.id("emailDomainConfigs"),
  },
  handler: async (ctx, args) => {
    // Verify user is super admin
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "super_admin") {
      throw new Error("Only super admins can delete domain configurations");
    }

    const config = await ctx.db.get(args.configId);
    if (!config) {
      throw new Error("Domain configuration not found");
    }

    await ctx.db.delete(args.configId);
  },
});

/**
 * Toggle active status of a domain configuration.
 */
export const toggleActive = mutation({
  args: {
    userId: v.id("users"),
    configId: v.id("emailDomainConfigs"),
  },
  handler: async (ctx, args) => {
    // Verify user is super admin
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "super_admin") {
      throw new Error("Only super admins can modify domain configurations");
    }

    const config = await ctx.db.get(args.configId);
    if (!config) {
      throw new Error("Domain configuration not found");
    }

    await ctx.db.patch(args.configId, {
      isActive: !config.isActive,
      updatedAt: Date.now(),
    });
  },
});
