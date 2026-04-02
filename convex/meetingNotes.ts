import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============ QUERIES ============

// Get meeting notes for a specific meeting — restricted to participants/host
export const getByMeeting = query({
  args: {
    meetingId: v.id("meetings"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // If userId provided, verify they're host or participant
    if (args.userId) {
      const meeting = await ctx.db.get(args.meetingId);
      if (!meeting) return null;
      const isHost = meeting.hostId === args.userId;
      if (!isHost) {
        const participant = await ctx.db
          .query("meetingParticipants")
          .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
          .filter((q) => q.eq(q.field("userId"), args.userId))
          .first();
        if (!participant) return null;
      }
    }

    return await ctx.db
      .query("meetingNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .first();
  },
});

// Get meeting notes by ID — restricted to participants/host
export const get = query({
  args: {
    notesId: v.id("meetingNotes"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db.get(args.notesId);
    if (!notes) return null;

    if (args.userId) {
      const meeting = await ctx.db.get(notes.meetingId);
      if (!meeting) return null;
      const isHost = meeting.hostId === args.userId;
      if (!isHost) {
        const participant = await ctx.db
          .query("meetingParticipants")
          .withIndex("by_meeting", (q) => q.eq("meetingId", notes.meetingId))
          .filter((q) => q.eq(q.field("userId"), args.userId))
          .first();
        if (!participant) return null;
      }
    }

    return notes;
  },
});

// Get meeting notes via invite token — for external users who were invited
export const getByInviteToken = query({
  args: {
    meetingId: v.id("meetings"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Verify token belongs to this meeting
    const invite = await ctx.db
      .query("meetingInvites")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .filter((q) => q.eq(q.field("inviteToken"), args.token))
      .first();
    if (!invite) return null;

    return await ctx.db
      .query("meetingNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .first();
  },
});

// ============ MUTATIONS ============

// Create initial meeting notes record
export const create = mutation({
  args: {
    meetingId: v.id("meetings"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const notesId = await ctx.db.insert("meetingNotes", {
      meetingId: args.meetingId,
      status: "recording",
      createdAt: now,
      updatedAt: now,
    });

    // Link notes to the meeting
    await ctx.db.patch(args.meetingId, {
      meetingNotesId: notesId,
    });

    return notesId;
  },
});

// Update transcript text
export const updateTranscript = mutation({
  args: {
    notesId: v.id("meetingNotes"),
    transcript: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notesId, {
      transcript: args.transcript,
      updatedAt: Date.now(),
    });
  },
});

// Update AI-generated notes
export const updateNotes = mutation({
  args: {
    notesId: v.id("meetingNotes"),
    summary: v.string(),
    actionItems: v.array(
      v.object({
        text: v.string(),
        assignee: v.optional(v.string()),
        dueDate: v.optional(v.string()),
        completed: v.boolean(),
      })
    ),
    decisions: v.array(v.string()),
    followUps: v.array(v.string()),
    keyTopics: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notesId, {
      summary: args.summary,
      actionItems: args.actionItems,
      decisions: args.decisions,
      followUps: args.followUps,
      keyTopics: args.keyTopics,
      updatedAt: Date.now(),
    });
  },
});

// Update processing status
export const updateStatus = mutation({
  args: {
    notesId: v.id("meetingNotes"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.errorMessage !== undefined) {
      patch.errorMessage = args.errorMessage;
    }
    await ctx.db.patch(args.notesId, patch);
  },
});

// Store the audio file reference and duration
export const updateAudioFile = mutation({
  args: {
    notesId: v.id("meetingNotes"),
    audioFileId: v.id("_storage"),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notesId, {
      audioFileId: args.audioFileId,
      duration: args.duration,
      status: "transcribing",
      updatedAt: Date.now(),
    });
  },
});

// Generate a Convex file upload URL (legacy — prefer S3)
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Store the S3 audio key and duration
export const updateAudioS3Key = mutation({
  args: {
    notesId: v.id("meetingNotes"),
    audioS3Key: v.string(),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notesId, {
      audioS3Key: args.audioS3Key,
      duration: args.duration,
      status: "transcribing",
      updatedAt: Date.now(),
    });
  },
});

// Toggle action item completed status
export const toggleActionItem = mutation({
  args: {
    notesId: v.id("meetingNotes"),
    index: v.number(),
  },
  handler: async (ctx, args) => {
    const notes = await ctx.db.get(args.notesId);
    if (!notes || !notes.actionItems) return;

    const actionItems = [...notes.actionItems];
    if (args.index >= 0 && args.index < actionItems.length) {
      actionItems[args.index] = {
        ...actionItems[args.index],
        completed: !actionItems[args.index].completed,
      };
    }

    await ctx.db.patch(args.notesId, {
      actionItems,
      updatedAt: Date.now(),
    });
  },
});

// ============ INTERNAL MUTATIONS (for actions) ============

export const internalUpdateTranscript = internalMutation({
  args: {
    notesId: v.id("meetingNotes"),
    transcript: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notesId, {
      transcript: args.transcript,
      status: "generating",
      updatedAt: Date.now(),
    });
  },
});

export const internalUpdateNotes = internalMutation({
  args: {
    notesId: v.id("meetingNotes"),
    summary: v.string(),
    actionItems: v.array(
      v.object({
        text: v.string(),
        assignee: v.optional(v.string()),
        dueDate: v.optional(v.string()),
        completed: v.boolean(),
      })
    ),
    decisions: v.array(v.string()),
    followUps: v.array(v.string()),
    keyTopics: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notesId, {
      summary: args.summary,
      actionItems: args.actionItems,
      decisions: args.decisions,
      followUps: args.followUps,
      keyTopics: args.keyTopics,
      status: "complete",
      updatedAt: Date.now(),
    });
  },
});

export const internalUpdateStatus = internalMutation({
  args: {
    notesId: v.id("meetingNotes"),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.errorMessage !== undefined) {
      patch.errorMessage = args.errorMessage;
    }
    await ctx.db.patch(args.notesId, patch);
  },
});
