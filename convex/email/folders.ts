/**
 * Email Folder Management
 *
 * Operations for managing email folders (inbox, sent, drafts, etc.)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Super admin role has automatic email access
const SUPER_ADMIN_ROLE = "super_admin";

// Helper to check if user has email access
function userHasEmailAccess(user: { hasEmailAccess?: boolean; role?: string } | null): boolean {
  if (!user) return false;
  return user.hasEmailAccess === true || user.role === SUPER_ADMIN_ROLE;
}

// ============ QUERIES ============

/**
 * Get all folders for an email account.
 */
export const listByAccount = query({
  args: {
    accountId: v.id("emailAccounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) return [];

    // Verify user has access
    const user = await ctx.db.get(account.userId);
    if (!userHasEmailAccess(user)) {
      return [];
    }

    const folders = await ctx.db
      .query("emailFolders")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    // Sort: system folders first, then alphabetically
    const systemOrder = ["inbox", "sent", "drafts", "trash", "spam", "archive"];

    return folders.sort((a, b) => {
      const aIndex = systemOrder.indexOf(a.type);
      const bIndex = systemOrder.indexOf(b.type);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      return a.name.localeCompare(b.name);
    });
  },
});

/**
 * Get a single folder by ID.
 */
export const get = query({
  args: {
    folderId: v.id("emailFolders"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.folderId);
  },
});

/**
 * Get folder by type (inbox, sent, etc.)
 */
export const getByType = query({
  args: {
    accountId: v.id("emailAccounts"),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailFolders")
      .withIndex("by_account_type", (q) =>
        q.eq("accountId", args.accountId).eq("type", args.type)
      )
      .first();
  },
});

/**
 * Get folder by path.
 */
export const getByPath = query({
  args: {
    accountId: v.id("emailAccounts"),
    path: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailFolders")
      .withIndex("by_path", (q) =>
        q.eq("accountId", args.accountId).eq("path", args.path)
      )
      .first();
  },
});

/**
 * Get total unread count across all folders for an account.
 */
export const getTotalUnread = query({
  args: {
    accountId: v.id("emailAccounts"),
  },
  handler: async (ctx, args) => {
    const folders = await ctx.db
      .query("emailFolders")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();

    return folders.reduce((sum, folder) => sum + folder.unreadCount, 0);
  },
});

/**
 * Get unread counts for all accounts of a user.
 */
export const getUnreadByUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    const results: Record<string, number> = {};

    for (const account of accounts) {
      const folders = await ctx.db
        .query("emailFolders")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();

      results[account._id] = folders.reduce(
        (sum, folder) => sum + folder.unreadCount,
        0
      );
    }

    return results;
  },
});

/**
 * Get total unread email count for a user (all accounts combined).
 * Used for sidebar badge.
 */
export const getTotalUnreadForUser = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    let total = 0;

    for (const account of accounts) {
      // Only count inbox unread (not spam, trash, etc.)
      const inbox = await ctx.db
        .query("emailFolders")
        .withIndex("by_account_type", (q) =>
          q.eq("accountId", account._id).eq("type", "inbox")
        )
        .first();

      if (inbox) {
        total += inbox.unreadCount;
      }
    }

    return total;
  },
});

// ============ MUTATIONS ============

/**
 * Create or update a folder (upsert).
 */
export const upsert = mutation({
  args: {
    accountId: v.id("emailAccounts"),
    name: v.string(),
    path: v.string(),
    type: v.string(),
    unreadCount: v.optional(v.number()),
    totalCount: v.optional(v.number()),
    parentPath: v.optional(v.string()),
    flags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("emailFolders")
      .withIndex("by_path", (q) =>
        q.eq("accountId", args.accountId).eq("path", args.path)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        type: args.type,
        unreadCount: args.unreadCount ?? existing.unreadCount,
        totalCount: args.totalCount ?? existing.totalCount,
        parentPath: args.parentPath,
        flags: args.flags,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("emailFolders", {
      accountId: args.accountId,
      name: args.name,
      path: args.path,
      type: args.type,
      unreadCount: args.unreadCount ?? 0,
      totalCount: args.totalCount ?? 0,
      parentPath: args.parentPath,
      flags: args.flags,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update folder counts.
 */
export const updateCounts = mutation({
  args: {
    folderId: v.id("emailFolders"),
    unreadCount: v.optional(v.number()),
    totalCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.unreadCount !== undefined) {
      updates.unreadCount = args.unreadCount;
    }
    if (args.totalCount !== undefined) {
      updates.totalCount = args.totalCount;
    }

    await ctx.db.patch(args.folderId, updates);
  },
});

/**
 * Increment/decrement unread count.
 */
export const adjustUnreadCount = mutation({
  args: {
    folderId: v.id("emailFolders"),
    delta: v.number(), // positive to increment, negative to decrement
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) return;

    const newCount = Math.max(0, folder.unreadCount + args.delta);
    await ctx.db.patch(args.folderId, {
      unreadCount: newCount,
      updatedAt: Date.now(),
    });
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Update last sync UID for a folder.
 */
export const updateLastSyncUid = internalMutation({
  args: {
    folderId: v.id("emailFolders"),
    lastSyncUid: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.folderId, {
      lastSyncUid: args.lastSyncUid,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Bulk update folder counts after sync.
 */
export const bulkUpdateCounts = internalMutation({
  args: {
    updates: v.array(
      v.object({
        folderId: v.id("emailFolders"),
        unreadCount: v.number(),
        totalCount: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const update of args.updates) {
      await ctx.db.patch(update.folderId, {
        unreadCount: update.unreadCount,
        totalCount: update.totalCount,
        updatedAt: now,
      });
    }
  },
});

/**
 * Delete a folder and all its emails.
 */
export const remove = internalMutation({
  args: {
    folderId: v.id("emailFolders"),
  },
  handler: async (ctx, args) => {
    // Delete all emails in folder
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
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

    // Delete the folder
    await ctx.db.delete(args.folderId);
  },
});

// ============ HELPER FUNCTIONS ============

/**
 * Map IMAP folder flags to folder type.
 */
export function mapFolderType(
  path: string,
  flags: string[] = [],
  specialUse?: string
): string {
  // Check special-use attribute first
  if (specialUse) {
    const specialUseMap: Record<string, string> = {
      "\\Inbox": "inbox",
      "\\Sent": "sent",
      "\\Drafts": "drafts",
      "\\Trash": "trash",
      "\\Junk": "spam",
      "\\Spam": "spam",
      "\\Archive": "archive",
      "\\All": "archive",
    };
    if (specialUseMap[specialUse]) {
      return specialUseMap[specialUse];
    }
  }

  // Check flags
  const flagsLower = flags.map((f) => f.toLowerCase());
  if (flagsLower.includes("\\inbox")) return "inbox";
  if (flagsLower.includes("\\sent")) return "sent";
  if (flagsLower.includes("\\drafts")) return "drafts";
  if (flagsLower.includes("\\trash")) return "trash";
  if (flagsLower.includes("\\junk") || flagsLower.includes("\\spam"))
    return "spam";
  if (flagsLower.includes("\\archive") || flagsLower.includes("\\all"))
    return "archive";

  // Check path name
  const pathLower = path.toLowerCase();
  if (pathLower === "inbox") return "inbox";
  if (pathLower.includes("sent")) return "sent";
  if (pathLower.includes("draft")) return "drafts";
  if (pathLower.includes("trash") || pathLower.includes("deleted"))
    return "trash";
  if (pathLower.includes("junk") || pathLower.includes("spam")) return "spam";
  if (pathLower.includes("archive")) return "archive";

  return "custom";
}
