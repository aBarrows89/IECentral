/**
 * Email Account Management
 *
 * CRUD operations for managing user email accounts (Gmail, Outlook, Yahoo, iCloud, IMAP).
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ============ QUERIES ============

// Super admin role has automatic email access
const SUPER_ADMIN_ROLE = "super_admin";

// Helper to check if user has email access
function userHasEmailAccess(user: { hasEmailAccess?: boolean; role?: string } | null): boolean {
  if (!user) return false;
  return user.hasEmailAccess === true || user.role === SUPER_ADMIN_ROLE;
}

/**
 * Get all email accounts for a user.
 */
export const listByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user has email access (either flag or super_admin role)
    const user = await ctx.db.get(args.userId);
    if (!userHasEmailAccess(user)) {
      return [];
    }

    const accounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Don't return sensitive fields to client
    return accounts.map((account) => ({
      _id: account._id,
      userId: account.userId,
      name: account.name,
      emailAddress: account.emailAddress,
      provider: account.provider,
      oauthProvider: account.oauthProvider,
      lastSyncAt: account.lastSyncAt,
      syncStatus: account.syncStatus,
      syncError: account.syncError,
      isActive: account.isActive,
      isPrimary: account.isPrimary,
      signature: account.signature,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      // IMAP config (without password)
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
    }));
  },
});

/**
 * Get a single email account by ID.
 */
export const get = query({
  args: {
    accountId: v.id("emailAccounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return null;

    // Verify user has access
    const user = await ctx.db.get(account.userId);
    if (!userHasEmailAccess(user)) {
      return null;
    }

    // Return without sensitive fields
    return {
      _id: account._id,
      userId: account.userId,
      name: account.name,
      emailAddress: account.emailAddress,
      provider: account.provider,
      oauthProvider: account.oauthProvider,
      lastSyncAt: account.lastSyncAt,
      syncStatus: account.syncStatus,
      syncError: account.syncError,
      isActive: account.isActive,
      isPrimary: account.isPrimary,
      signature: account.signature,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
    };
  },
});

/**
 * Get full account details including encrypted credentials (internal use only).
 */
export const getWithCredentials = query({
  args: {
    accountId: v.id("emailAccounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.accountId);
  },
});

/**
 * Get the primary account for a user.
 */
export const getPrimary = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isPrimary"), true))
      .first();

    if (!accounts) return null;

    return {
      _id: accounts._id,
      name: accounts.name,
      emailAddress: accounts.emailAddress,
      provider: accounts.provider,
    };
  },
});

// ============ MUTATIONS ============

/**
 * Create an OAuth-based email account (Gmail, Outlook, Yahoo).
 */
export const createOAuthAccount = mutation({
  args: {
    userId: v.id("users"),
    provider: v.string(), // "gmail" | "outlook" | "yahoo"
    emailAddress: v.string(),
    name: v.optional(v.string()),
    accessToken: v.string(), // Already encrypted
    refreshToken: v.string(), // Already encrypted
    tokenExpiresAt: v.number(),
    oauthProvider: v.string(), // "google" | "microsoft" | "yahoo"
  },
  handler: async (ctx, args) => {
    // Verify user has email access
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (!userHasEmailAccess(user)) {
      throw new Error("User does not have email access permission");
    }

    // Check if account already exists
    const existing = await ctx.db
      .query("emailAccounts")
      .withIndex("by_email", (q) => q.eq("emailAddress", args.emailAddress.toLowerCase()))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (existing) {
      // Update existing account with new tokens
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiresAt: args.tokenExpiresAt,
        syncStatus: "idle",
        syncError: undefined,
        isActive: true,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    // Check if this is the first account (make it primary)
    const existingAccounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const isPrimary = existingAccounts.length === 0;

    const now = Date.now();
    const accountId = await ctx.db.insert("emailAccounts", {
      userId: args.userId,
      name: args.name || args.emailAddress.split("@")[0],
      emailAddress: args.emailAddress.toLowerCase(),
      provider: args.provider,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      oauthProvider: args.oauthProvider,
      syncStatus: "idle",
      isActive: true,
      isPrimary,
      createdAt: now,
      updatedAt: now,
    });

    return accountId;
  },
});

/**
 * Internal mutation to create IMAP account (called by action after encryption).
 */
export const createImapAccountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    emailAddress: v.string(),
    name: v.optional(v.string()),
    imapHost: v.string(),
    imapPort: v.number(),
    imapUsername: v.string(),
    imapPassword: v.string(),
    imapTls: v.boolean(),
    smtpHost: v.string(),
    smtpPort: v.number(),
    smtpUsername: v.string(),
    smtpPassword: v.string(),
    smtpTls: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Verify user has email access
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (!userHasEmailAccess(user)) {
      throw new Error("User does not have email access permission");
    }

    // Check if account already exists
    const existing = await ctx.db
      .query("emailAccounts")
      .withIndex("by_email", (q) => q.eq("emailAddress", args.emailAddress.toLowerCase()))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (existing) {
      throw new Error("Email account already exists");
    }

    // Check if this is the first account (make it primary)
    const existingAccounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const isPrimary = existingAccounts.length === 0;

    const now = Date.now();
    const accountId = await ctx.db.insert("emailAccounts", {
      userId: args.userId,
      name: args.name || args.emailAddress.split("@")[0],
      emailAddress: args.emailAddress.toLowerCase(),
      provider: "imap",
      imapHost: args.imapHost,
      imapPort: args.imapPort,
      imapUsername: args.imapUsername,
      imapPassword: args.imapPassword,
      imapTls: args.imapTls,
      smtpHost: args.smtpHost,
      smtpPort: args.smtpPort,
      smtpUsername: args.smtpUsername,
      smtpPassword: args.smtpPassword,
      smtpTls: args.smtpTls,
      syncStatus: "idle",
      isActive: true,
      isPrimary,
      createdAt: now,
      updatedAt: now,
    });

    return accountId;
  },
});

/**
 * Internal mutation to create iCloud account (called by action after encryption).
 */
export const createIcloudAccountInternal = internalMutation({
  args: {
    userId: v.id("users"),
    emailAddress: v.string(),
    name: v.optional(v.string()),
    appPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify user has email access
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (!userHasEmailAccess(user)) {
      throw new Error("User does not have email access permission");
    }

    // Check if account already exists
    const existing = await ctx.db
      .query("emailAccounts")
      .withIndex("by_email", (q) => q.eq("emailAddress", args.emailAddress.toLowerCase()))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (existing) {
      throw new Error("Email account already exists");
    }

    // Check if this is the first account
    const existingAccounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const isPrimary = existingAccounts.length === 0;

    const now = Date.now();
    const accountId = await ctx.db.insert("emailAccounts", {
      userId: args.userId,
      name: args.name || args.emailAddress.split("@")[0],
      emailAddress: args.emailAddress.toLowerCase(),
      provider: "icloud",
      // iCloud IMAP settings
      imapHost: "imap.mail.me.com",
      imapPort: 993,
      imapUsername: args.emailAddress.toLowerCase(),
      imapPassword: args.appPassword,
      imapTls: true,
      // iCloud SMTP settings
      smtpHost: "smtp.mail.me.com",
      smtpPort: 587,
      smtpUsername: args.emailAddress.toLowerCase(),
      smtpPassword: args.appPassword,
      smtpTls: true,
      syncStatus: "idle",
      isActive: true,
      isPrimary,
      createdAt: now,
      updatedAt: now,
    });

    return accountId;
  },
});

/**
 * Update account settings (name, signature).
 */
export const updateSettings = mutation({
  args: {
    accountId: v.id("emailAccounts"),
    userId: v.id("users"),
    name: v.optional(v.string()),
    signature: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (account.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.signature !== undefined) updates.signature = args.signature;

    await ctx.db.patch(args.accountId, updates);
  },
});

/**
 * Set an account as primary.
 */
export const setPrimary = mutation({
  args: {
    accountId: v.id("emailAccounts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (account.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    // Remove primary from all other accounts
    const accounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const acc of accounts) {
      if (acc._id !== args.accountId && acc.isPrimary) {
        await ctx.db.patch(acc._id, { isPrimary: false, updatedAt: Date.now() });
      }
    }

    // Set this account as primary
    await ctx.db.patch(args.accountId, { isPrimary: true, updatedAt: Date.now() });
  },
});

/**
 * Deactivate an account (stops syncing but keeps data).
 */
export const deactivate = mutation({
  args: {
    accountId: v.id("emailAccounts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (account.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.accountId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Reactivate an account.
 */
export const reactivate = mutation({
  args: {
    accountId: v.id("emailAccounts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (account.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.accountId, {
      isActive: true,
      syncStatus: "idle",
      syncError: undefined,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete an account and all associated data.
 */
export const remove = mutation({
  args: {
    accountId: v.id("emailAccounts"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    if (account.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    // Delete all folders
    const folders = await ctx.db
      .query("emailFolders")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const folder of folders) {
      // Delete all emails in folder
      const emails = await ctx.db
        .query("emails")
        .withIndex("by_folder", (q) => q.eq("folderId", folder._id))
        .collect();

      for (const email of emails) {
        // Delete attachments
        const attachments = await ctx.db
          .query("emailAttachments")
          .withIndex("by_email", (q) => q.eq("emailId", email._id))
          .collect();

        for (const att of attachments) {
          if (att.storageId) {
            await ctx.storage.delete(att.storageId);
          }
          await ctx.db.delete(att._id);
        }

        await ctx.db.delete(email._id);
      }

      await ctx.db.delete(folder._id);
    }

    // Delete drafts
    const drafts = await ctx.db
      .query("emailDrafts")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const draft of drafts) {
      await ctx.db.delete(draft._id);
    }

    // Delete send queue items
    const queueItems = await ctx.db
      .query("emailSendQueue")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("accountId"), args.accountId))
      .collect();

    for (const item of queueItems) {
      await ctx.db.delete(item._id);
    }

    // Delete sync logs
    const logs = await ctx.db
      .query("emailSyncLogs")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    // If this was primary, set another account as primary
    if (account.isPrimary) {
      const otherAccount = await ctx.db
        .query("emailAccounts")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .filter((q) => q.neq(q.field("_id"), args.accountId))
        .first();

      if (otherAccount) {
        await ctx.db.patch(otherAccount._id, { isPrimary: true });
      }
    }

    // Delete the account
    await ctx.db.delete(args.accountId);
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Update OAuth tokens (called by token refresh action).
 */
export const updateTokens = internalMutation({
  args: {
    accountId: v.id("emailAccounts"),
    accessToken: v.string(),
    tokenExpiresAt: v.number(),
    refreshToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      accessToken: args.accessToken,
      tokenExpiresAt: args.tokenExpiresAt,
      updatedAt: Date.now(),
    };

    if (args.refreshToken) {
      updates.refreshToken = args.refreshToken;
    }

    await ctx.db.patch(args.accountId, updates);
  },
});

/**
 * Update sync state after syncing.
 */
export const updateSyncState = internalMutation({
  args: {
    accountId: v.id("emailAccounts"),
    lastSyncAt: v.optional(v.number()),
    syncStatus: v.optional(v.string()),
    syncError: v.optional(v.string()),
    lastUid: v.optional(v.number()),
    lastUidValidity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.lastSyncAt !== undefined) updates.lastSyncAt = args.lastSyncAt;
    if (args.syncStatus !== undefined) updates.syncStatus = args.syncStatus;
    if (args.syncError !== undefined) updates.syncError = args.syncError;
    if (args.lastUid !== undefined) updates.lastUid = args.lastUid;
    if (args.lastUidValidity !== undefined) updates.lastUidValidity = args.lastUidValidity;

    await ctx.db.patch(args.accountId, updates);
  },
});

/**
 * Mark sync error.
 */
export const markSyncError = internalMutation({
  args: {
    accountId: v.id("emailAccounts"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      syncStatus: "error",
      syncError: args.error,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Clear sync error for an account (user-initiated dismiss).
 */
export const clearSyncError = mutation({
  args: {
    accountId: v.id("emailAccounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return;

    await ctx.db.patch(args.accountId, {
      syncError: undefined,
      updatedAt: Date.now(),
    });
  },
});
