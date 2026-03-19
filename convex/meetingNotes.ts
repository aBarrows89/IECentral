import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============ QUERIES ============

// Get meeting notes for a specific meeting
export const getByMeeting = query({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    const notes = await ctx.db
      .query("meetingNotes")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .first();
    return notes;
  },
});

// Get meeting notes by ID
export const get = query({
  args: { notesId: v.id("meetingNotes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.notesId);
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

// Generate a Convex file upload URL
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
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
