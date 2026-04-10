import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

// Get all conversations for a user
export const getConversations = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_last_message")
      .order("desc")
      .collect();

    // Filter to only conversations where user is a participant
    const userConversations = conversations.filter((conv) =>
      conv.participants.includes(args.userId)
    );

    // Enrich with participant info and last message
    const enriched = await Promise.all(
      userConversations.map(async (conv) => {
        const participants = await Promise.all(
          conv.participants.map((id) => ctx.db.get(id))
        );

        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", conv._id)
          )
          .order("desc")
          .first();

        // Get project info if it's a project conversation
        const project = conv.projectId
          ? await ctx.db.get(conv.projectId)
          : null;

        // Count unread messages for this user
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", conv._id)
          )
          .collect();
        const unreadCount = messages.filter(
          (m) => !m.readBy.includes(args.userId) && m.senderId !== args.userId
        ).length;

        return {
          ...conv,
          participants: participants.filter(Boolean),
          lastMessage,
          project,
          unreadCount,
        };
      })
    );

    return enriched;
  },
});

// Get messages for a conversation
export const getMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();

    // Enrich with sender info
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        const sender = await ctx.db.get(msg.senderId);
        return {
          ...msg,
          sender,
        };
      })
    );

    return enriched;
  },
});

// Create a new conversation
export const createConversation = mutation({
  args: {
    type: v.string(), // "direct" | "project" | "group"
    participants: v.array(v.id("users")),
    projectId: v.optional(v.id("projects")),
    name: v.optional(v.string()), // Required for group chats
    createdBy: v.optional(v.id("users")), // Who created the group
  },
  handler: async (ctx, args) => {
    // Check if a direct conversation already exists between these users
    if (args.type === "direct" && args.participants.length === 2) {
      const existingConversations = await ctx.db
        .query("conversations")
        .collect();

      const existing = existingConversations.find(
        (conv) =>
          conv.type === "direct" &&
          conv.participants.length === 2 &&
          conv.participants.includes(args.participants[0]) &&
          conv.participants.includes(args.participants[1])
      );

      if (existing) {
        return existing._id;
      }
    }

    // Validate group chat requirements
    if (args.type === "group") {
      if (!args.name || args.name.trim() === "") {
        throw new Error("Group name is required");
      }
      if (args.participants.length < 2) {
        throw new Error("Group chat requires at least 2 participants");
      }
    }

    const conversationId = await ctx.db.insert("conversations", {
      type: args.type,
      participants: args.participants,
      projectId: args.projectId,
      name: args.type === "group" ? args.name : undefined,
      createdBy: args.type === "group" ? args.createdBy : undefined,
      lastMessageAt: Date.now(),
      createdAt: Date.now(),
    });

    return conversationId;
  },
});

// Update group chat info (name)
export const updateGroupInfo = mutation({
  args: {
    conversationId: v.id("conversations"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (conversation.type !== "group") {
      throw new Error("Can only update group chat info");
    }
    if (!args.name || args.name.trim() === "") {
      throw new Error("Group name is required");
    }
    await ctx.db.patch(args.conversationId, {
      name: args.name.trim(),
    });
  },
});

// Add members to a group chat
export const addGroupMembers = mutation({
  args: {
    conversationId: v.id("conversations"),
    newMembers: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (conversation.type !== "group") {
      throw new Error("Can only add members to group chats");
    }
    // Merge existing and new participants, removing duplicates
    const updatedParticipants = [
      ...new Set([...conversation.participants, ...args.newMembers]),
    ];
    await ctx.db.patch(args.conversationId, {
      participants: updatedParticipants,
    });
  },
});

// Remove a member from a group chat
export const removeGroupMember = mutation({
  args: {
    conversationId: v.id("conversations"),
    memberId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (conversation.type !== "group") {
      throw new Error("Can only remove members from group chats");
    }
    const updatedParticipants = conversation.participants.filter(
      (id) => id !== args.memberId
    );
    if (updatedParticipants.length < 2) {
      throw new Error("Group must have at least 2 members");
    }
    await ctx.db.patch(args.conversationId, {
      participants: updatedParticipants,
    });
  },
});

// Leave a group chat
export const leaveGroup = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
    if (conversation.type !== "group") {
      throw new Error("Can only leave group chats");
    }
    const updatedParticipants = conversation.participants.filter(
      (id) => id !== args.userId
    );
    if (updatedParticipants.length < 2) {
      throw new Error("Group must have at least 2 members");
    }
    await ctx.db.patch(args.conversationId, {
      participants: updatedParticipants,
    });
  },
});

// Send a message
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    content: v.string(),
    mentions: v.array(v.id("users")),
    attachments: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      fileType: v.string(),
      fileSize: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: args.senderId,
      content: args.content,
      mentions: args.mentions,
      attachments: args.attachments,
      readBy: [args.senderId], // Sender has read their own message
      createdAt: Date.now(),
    });

    // Update conversation's lastMessageAt
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: Date.now(),
    });

    // Send web push to other participants
    const conversation = await ctx.db.get(args.conversationId);
    if (conversation) {
      const sender = await ctx.db.get(args.senderId);
      const senderName = sender?.name || "Someone";
      const messagePreview = args.content.startsWith("[GIF]")
        ? "sent a GIF"
        : args.content.length > 80
          ? args.content.substring(0, 80) + "..."
          : args.content;

      for (const participantId of conversation.participants) {
        if (participantId !== args.senderId) {
          await ctx.scheduler.runAfter(0, internal.webPush.sendToUser, {
            userId: participantId,
            title: senderName,
            body: messagePreview,
            url: "/messages",
            tag: "message",
          });
        }
      }
    }

    return messageId;
  },
});

// Generate upload URL for file attachments
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Get attachment download URL
export const getAttachmentUrl = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<string | null> => {
    const url = await ctx.storage.getUrl(args.storageId);
    return url;
  },
});

// Mark messages as read
export const markAsRead = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    for (const message of messages) {
      if (!message.readBy.includes(args.userId)) {
        await ctx.db.patch(message._id, {
          readBy: [...message.readBy, args.userId],
        });
      }
    }
  },
});

// Get unread count for a user
export const getUnreadCount = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const conversations = await ctx.db.query("conversations").collect();

    const userConversations = conversations.filter((conv) =>
      conv.participants.includes(args.userId)
    );

    let totalUnread = 0;
    for (const conv of userConversations) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conv._id)
        )
        .collect();

      const unread = messages.filter(
        (m) => !m.readBy.includes(args.userId) && m.senderId !== args.userId
      ).length;
      totalUnread += unread;
    }

    return totalUnread;
  },
});

// Get all users (for starting new conversations)
export const getAllUsers = query({
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter((u) => u.isActive);
  },
});

// Search for linkable items (projects, applications, personnel)
export const searchLinkableItems = query({
  args: { searchQuery: v.string() },
  handler: async (ctx, args) => {
    const query = args.searchQuery.toLowerCase();
    const results: Array<{
      type: "project" | "application" | "personnel" | "document";
      id: string;
      name: string;
      subtitle: string;
    }> = [];

    // Search projects
    const projects = await ctx.db.query("projects").collect();
    for (const project of projects) {
      if (project.name.toLowerCase().includes(query)) {
        results.push({
          type: "project",
          id: project._id,
          name: project.name,
          subtitle: `Project - ${project.status}`,
        });
      }
    }

    // Search applications
    const applications = await ctx.db.query("applications").collect();
    for (const app of applications) {
      const fullName = `${app.firstName} ${app.lastName}`.toLowerCase();
      if (fullName.includes(query) || app.email?.toLowerCase().includes(query)) {
        results.push({
          type: "application",
          id: app._id,
          name: `${app.firstName} ${app.lastName}`,
          subtitle: `Applicant - ${app.status}`,
        });
      }
    }

    // Search personnel
    const personnel = await ctx.db.query("personnel").collect();
    for (const person of personnel) {
      const fullName = `${person.firstName} ${person.lastName}`.toLowerCase();
      if (fullName.includes(query)) {
        results.push({
          type: "personnel",
          id: person._id,
          name: `${person.firstName} ${person.lastName}`,
          subtitle: `${person.position} - ${person.department}`,
        });
      }
    }

    // Search documents from Doc Hub
    const documents = await ctx.db
      .query("documents")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    for (const doc of documents) {
      if (
        doc.name.toLowerCase().includes(query) ||
        doc.fileName.toLowerCase().includes(query) ||
        (doc.description && doc.description.toLowerCase().includes(query))
      ) {
        const categoryLabels: Record<string, string> = {
          forms: "Form",
          policies: "Policy",
          sops: "SOP",
          templates: "Template",
          training: "Training",
          other: "Document",
        };
        results.push({
          type: "document",
          id: doc._id,
          name: doc.name,
          subtitle: `${categoryLabels[doc.category] || "Document"} - ${doc.fileName}`,
        });
      }
    }

    // Return top 10 results
    return results.slice(0, 10);
  },
});

// ============ MESSAGE REACTIONS ============

// Add a reaction to a message
export const addReaction = mutation({
  args: {
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const reactions = message.reactions || [];

    // Check if user already reacted with this emoji
    const existingReaction = reactions.find(
      (r) => r.userId === args.userId && r.emoji === args.emoji
    );

    if (existingReaction) {
      // Already reacted with this emoji, no need to add again
      return;
    }

    // Add the new reaction
    reactions.push({
      emoji: args.emoji,
      userId: args.userId,
      createdAt: Date.now(),
    });

    await ctx.db.patch(args.messageId, {
      reactions,
    });
  },
});

// Remove a reaction from a message
export const removeReaction = mutation({
  args: {
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const reactions = message.reactions || [];

    // Remove the reaction
    const updatedReactions = reactions.filter(
      (r) => !(r.userId === args.userId && r.emoji === args.emoji)
    );

    await ctx.db.patch(args.messageId, {
      reactions: updatedReactions,
    });
  },
});

// Toggle a reaction (add if not present, remove if present)
export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }

    const reactions = message.reactions || [];

    // Check if user already reacted with this emoji
    const existingIndex = reactions.findIndex(
      (r) => r.userId === args.userId && r.emoji === args.emoji
    );

    if (existingIndex >= 0) {
      // Remove the reaction
      reactions.splice(existingIndex, 1);
    } else {
      // Add the reaction
      reactions.push({
        emoji: args.emoji,
        userId: args.userId,
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(args.messageId, {
      reactions,
    });
  },
});

// ============ TYPING INDICATORS ============

// Set typing status (called when user is typing)
export const setTyping = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Check if there's an existing typing indicator for this user/conversation
    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", args.userId).eq("conversationId", args.conversationId)
      )
      .first();

    if (existing) {
      // Update the timestamp
      await ctx.db.patch(existing._id, {
        lastTypingAt: Date.now(),
      });
    } else {
      // Create a new typing indicator
      await ctx.db.insert("typingIndicators", {
        conversationId: args.conversationId,
        userId: args.userId,
        lastTypingAt: Date.now(),
      });
    }
  },
});

// Clear typing status (called when user stops typing or sends a message)
export const clearTyping = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", args.userId).eq("conversationId", args.conversationId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// Get typing users for a conversation (excludes current user, only recent activity)
export const getTypingUsers = query({
  args: {
    conversationId: v.id("conversations"),
    currentUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const typingIndicators = await ctx.db
      .query("typingIndicators")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .collect();

    // Filter out current user and only include recent typing (within last 3 seconds)
    const recentThreshold = Date.now() - 3000;
    const activeTyping = typingIndicators.filter(
      (t) => t.userId !== args.currentUserId && t.lastTypingAt > recentThreshold
    );

    // Get user info for typing users
    const typingUsers = await Promise.all(
      activeTyping.map(async (t) => {
        const user = await ctx.db.get(t.userId);
        return user ? { _id: user._id, name: user.name } : null;
      })
    );

    return typingUsers.filter(Boolean);
  },
});

export const deleteConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversation not found");

    // Delete all messages in this conversation
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    for (const msg of messages) {
      // Delete message attachments from storage
      if (msg.attachments) {
        for (const att of msg.attachments as any[]) {
          if (att.storageId) {
            try { await ctx.storage.delete(att.storageId); } catch {}
          }
        }
      }
      await ctx.db.delete(msg._id);
    }

    // Delete the conversation
    await ctx.db.delete(args.conversationId);
  },
});
