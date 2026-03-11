/**
 * Email Management
 *
 * Queries and mutations for managing cached emails.
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

// Email address object validator
const emailAddressValidator = v.object({
  name: v.optional(v.string()),
  address: v.string(),
});

// ============ QUERIES ============

/**
 * Get emails in a folder with pagination.
 */
export const listByFolder = query({
  args: {
    folderId: v.id("emailFolders"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()), // Pagination by date
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) return { emails: [], hasMore: false, nextCursor: null };

    const account = await ctx.db.get(folder.accountId);
    if (!account) return { emails: [], hasMore: false, nextCursor: null };

    // Verify user has access
    const user = await ctx.db.get(account.userId);
    if (!userHasEmailAccess(user)) {
      return { emails: [], hasMore: false, nextCursor: null };
    }

    const limit = args.limit || 50;

    let emailsQuery = ctx.db
      .query("emails")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId));

    // Apply cursor pagination
    if (args.cursor) {
      emailsQuery = emailsQuery.filter((q) =>
        q.lt(q.field("date"), args.cursor!)
      );
    }

    const emails = await emailsQuery.order("desc").take(limit + 1);

    const hasMore = emails.length > limit;
    const resultEmails = hasMore ? emails.slice(0, limit) : emails;

    return {
      emails: resultEmails,
      hasMore,
      nextCursor:
        resultEmails.length > 0
          ? resultEmails[resultEmails.length - 1].date
          : null,
    };
  },
});

/**
 * Get a single email by ID.
 */
export const get = query({
  args: {
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return null;

    // Get attachments
    const attachments = await ctx.db
      .query("emailAttachments")
      .withIndex("by_email", (q) => q.eq("emailId", args.emailId))
      .collect();

    return {
      ...email,
      attachments,
    };
  },
});

/**
 * Get emails in a thread.
 */
export const getThread = query({
  args: {
    accountId: v.id("emailAccounts"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_thread", (q) =>
        q.eq("accountId", args.accountId).eq("threadId", args.threadId)
      )
      .order("asc")
      .collect();

    return emails;
  },
});

/**
 * Search emails by subject or sender.
 */
export const search = query({
  args: {
    accountId: v.id("emailAccounts"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase();
    const limit = args.limit || 50;

    // Get all emails for the account (limited for performance)
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(1000);

    // Filter by search term
    const results = emails
      .filter((email) => {
        const subjectMatch = email.subject.toLowerCase().includes(searchTerm);
        const fromMatch =
          email.from.address.toLowerCase().includes(searchTerm) ||
          email.from.name?.toLowerCase().includes(searchTerm);
        const snippetMatch = email.snippet.toLowerCase().includes(searchTerm);

        return subjectMatch || fromMatch || snippetMatch;
      })
      .slice(0, limit);

    return results;
  },
});

/**
 * Get unread emails in inbox.
 */
export const getUnreadInbox = query({
  args: {
    accountId: v.id("emailAccounts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Find inbox folder
    const inbox = await ctx.db
      .query("emailFolders")
      .withIndex("by_account_type", (q) =>
        q.eq("accountId", args.accountId).eq("type", "inbox")
      )
      .first();

    if (!inbox) return [];

    const emails = await ctx.db
      .query("emails")
      .withIndex("by_folder", (q) => q.eq("folderId", inbox._id))
      .filter((q) => q.eq(q.field("isRead"), false))
      .order("desc")
      .take(args.limit || 20);

    return emails;
  },
});

/**
 * Get starred emails.
 */
export const getStarred = query({
  args: {
    accountId: v.id("emailAccounts"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query("emails")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .filter((q) => q.eq(q.field("isStarred"), true))
      .order("desc")
      .take(args.limit || 50);

    return emails;
  },
});

// ============ MUTATIONS ============

/**
 * Mark email as read.
 */
export const markAsRead = mutation({
  args: {
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email || email.isRead) return;

    await ctx.db.patch(args.emailId, {
      isRead: true,
      updatedAt: Date.now(),
    });

    // Update folder unread count
    const folder = await ctx.db.get(email.folderId);
    if (folder && folder.unreadCount > 0) {
      await ctx.db.patch(email.folderId, {
        unreadCount: folder.unreadCount - 1,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Mark email as unread.
 */
export const markAsUnread = mutation({
  args: {
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email || !email.isRead) return;

    await ctx.db.patch(args.emailId, {
      isRead: false,
      updatedAt: Date.now(),
    });

    // Update folder unread count
    const folder = await ctx.db.get(email.folderId);
    if (folder) {
      await ctx.db.patch(email.folderId, {
        unreadCount: folder.unreadCount + 1,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Toggle starred status.
 */
export const toggleStar = mutation({
  args: {
    emailId: v.id("emails"),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return;

    await ctx.db.patch(args.emailId, {
      isStarred: !email.isStarred,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Move email to a different folder.
 */
export const moveToFolder = mutation({
  args: {
    emailId: v.id("emails"),
    targetFolderId: v.id("emailFolders"),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return;

    const oldFolder = await ctx.db.get(email.folderId);
    const newFolder = await ctx.db.get(args.targetFolderId);

    if (!newFolder) return;

    // Update email
    await ctx.db.patch(args.emailId, {
      folderId: args.targetFolderId,
      updatedAt: Date.now(),
    });

    // Update old folder counts
    if (oldFolder) {
      await ctx.db.patch(email.folderId, {
        totalCount: Math.max(0, oldFolder.totalCount - 1),
        unreadCount: email.isRead
          ? oldFolder.unreadCount
          : Math.max(0, oldFolder.unreadCount - 1),
        updatedAt: Date.now(),
      });
    }

    // Update new folder counts
    await ctx.db.patch(args.targetFolderId, {
      totalCount: newFolder.totalCount + 1,
      unreadCount: email.isRead
        ? newFolder.unreadCount
        : newFolder.unreadCount + 1,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete email (move to trash or permanent delete).
 */
export const remove = mutation({
  args: {
    emailId: v.id("emails"),
    permanent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return;

    const folder = await ctx.db.get(email.folderId);

    if (args.permanent || folder?.type === "trash") {
      // Permanent delete
      // Delete attachments
      const attachments = await ctx.db
        .query("emailAttachments")
        .withIndex("by_email", (q) => q.eq("emailId", args.emailId))
        .collect();

      for (const att of attachments) {
        if (att.storageId) {
          await ctx.storage.delete(att.storageId);
        }
        await ctx.db.delete(att._id);
      }

      // Update folder count
      if (folder) {
        await ctx.db.patch(email.folderId, {
          totalCount: Math.max(0, folder.totalCount - 1),
          unreadCount: email.isRead
            ? folder.unreadCount
            : Math.max(0, folder.unreadCount - 1),
          updatedAt: Date.now(),
        });
      }

      // Delete email
      await ctx.db.delete(args.emailId);
    } else {
      // Move to trash
      const trashFolder = await ctx.db
        .query("emailFolders")
        .withIndex("by_account_type", (q) =>
          q.eq("accountId", email.accountId).eq("type", "trash")
        )
        .first();

      if (trashFolder) {
        await ctx.db.patch(args.emailId, {
          folderId: trashFolder._id,
          updatedAt: Date.now(),
        });

        // Update old folder counts
        if (folder) {
          await ctx.db.patch(email.folderId, {
            totalCount: Math.max(0, folder.totalCount - 1),
            unreadCount: email.isRead
              ? folder.unreadCount
              : Math.max(0, folder.unreadCount - 1),
            updatedAt: Date.now(),
          });
        }

        // Update trash counts
        await ctx.db.patch(trashFolder._id, {
          totalCount: trashFolder.totalCount + 1,
          unreadCount: email.isRead
            ? trashFolder.unreadCount
            : trashFolder.unreadCount + 1,
          updatedAt: Date.now(),
        });
      }
    }
  },
});

/**
 * Link email to internal conversation.
 */
export const linkToConversation = mutation({
  args: {
    emailId: v.id("emails"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailId, {
      linkedConversationId: args.conversationId,
      updatedAt: Date.now(),
    });
  },
});

// ============ INTERNAL MUTATIONS ============

/**
 * Create email from sync.
 */
export const create = internalMutation({
  args: {
    accountId: v.id("emailAccounts"),
    folderId: v.id("emailFolders"),
    messageId: v.string(),
    uid: v.number(),
    threadId: v.optional(v.string()),
    subject: v.string(),
    from: emailAddressValidator,
    to: v.array(emailAddressValidator),
    cc: v.optional(v.array(emailAddressValidator)),
    bcc: v.optional(v.array(emailAddressValidator)),
    replyTo: v.optional(emailAddressValidator),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.array(v.string())),
    bodyText: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    snippet: v.string(),
    date: v.number(),
    size: v.optional(v.number()),
    isRead: v.boolean(),
    isStarred: v.boolean(),
    isImportant: v.boolean(),
    isDraft: v.boolean(),
    hasAttachments: v.boolean(),
    labels: v.optional(v.array(v.string())),
    isEncrypted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if email already exists
    const existing = await ctx.db
      .query("emails")
      .withIndex("by_message_id", (q) =>
        q.eq("accountId", args.accountId).eq("messageId", args.messageId)
      )
      .first();

    if (existing) {
      // Update existing email with new data
      await ctx.db.patch(existing._id, {
        isRead: args.isRead,
        isStarred: args.isStarred,
        isImportant: args.isImportant,
        labels: args.labels,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    const now = Date.now();

    const emailId = await ctx.db.insert("emails", {
      accountId: args.accountId,
      folderId: args.folderId,
      messageId: args.messageId,
      uid: args.uid,
      threadId: args.threadId,
      subject: args.subject,
      from: args.from,
      to: args.to,
      cc: args.cc,
      bcc: args.bcc,
      replyTo: args.replyTo,
      inReplyTo: args.inReplyTo,
      references: args.references,
      bodyText: args.bodyText,
      bodyHtml: args.bodyHtml,
      snippet: args.snippet,
      date: args.date,
      receivedAt: now,
      size: args.size,
      isRead: args.isRead,
      isStarred: args.isStarred,
      isImportant: args.isImportant,
      isDraft: args.isDraft,
      hasAttachments: args.hasAttachments,
      labels: args.labels,
      isEncrypted: args.isEncrypted,
      createdAt: now,
      updatedAt: now,
    });

    return emailId;
  },
});

/**
 * Create attachment record.
 */
export const createAttachment = internalMutation({
  args: {
    emailId: v.id("emails"),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    contentId: v.optional(v.string()),
    isInline: v.boolean(),
    storageId: v.optional(v.id("_storage")),
    externalRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("emailAttachments", {
      emailId: args.emailId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      size: args.size,
      contentId: args.contentId,
      isInline: args.isInline,
      storageId: args.storageId,
      externalRef: args.externalRef,
      createdAt: Date.now(),
    });
  },
});

/**
 * Bulk update read status.
 */
export const bulkUpdateReadStatus = internalMutation({
  args: {
    emailIds: v.array(v.id("emails")),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const emailId of args.emailIds) {
      await ctx.db.patch(emailId, {
        isRead: args.isRead,
        updatedAt: now,
      });
    }
  },
});

/**
 * Clean up old emails (older than 30 days).
 */
export const cleanupOldEmails = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Find old emails (batch of 500)
    const oldEmails = await ctx.db
      .query("emails")
      .filter((q) => q.lt(q.field("date"), thirtyDaysAgo))
      .take(500);

    let deleted = 0;

    for (const email of oldEmails) {
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

      // Delete email
      await ctx.db.delete(email._id);
      deleted++;
    }

    return { deleted, hasMore: oldEmails.length === 500 };
  },
});
