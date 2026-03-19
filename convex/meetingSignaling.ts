import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ============ QUERIES ============

// Subscribe to unconsumed signals for a participant (real-time)
export const getMySignals = query({
  args: { participantId: v.id("meetingParticipants") },
  handler: async (ctx, args) => {
    const signals = await ctx.db
      .query("meetingSignals")
      .withIndex("by_recipient", (q) =>
        q.eq("toParticipantId", args.participantId).eq("isConsumed", false)
      )
      .collect();

    return signals;
  },
});

// ============ MUTATIONS ============

// Send a signal (offer/answer/ice-candidate)
export const sendSignal = mutation({
  args: {
    meetingId: v.id("meetings"),
    fromParticipantId: v.id("meetingParticipants"),
    toParticipantId: v.id("meetingParticipants"),
    type: v.string(), // "offer" | "answer" | "ice-candidate" | "renegotiate"
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const signalId = await ctx.db.insert("meetingSignals", {
      meetingId: args.meetingId,
      fromParticipantId: args.fromParticipantId,
      toParticipantId: args.toParticipantId,
      type: args.type,
      payload: args.payload,
      isConsumed: false,
      createdAt: Date.now(),
    });

    return signalId;
  },
});

// Mark signal as consumed
export const consumeSignal = mutation({
  args: { signalId: v.id("meetingSignals") },
  handler: async (ctx, args) => {
    const signal = await ctx.db.get(args.signalId);
    if (!signal) throw new Error("Signal not found");

    await ctx.db.patch(args.signalId, {
      isConsumed: true,
    });

    return args.signalId;
  },
});

// Delete consumed signals for a meeting (cleanup)
export const cleanupSignals = mutation({
  args: { meetingId: v.id("meetings") },
  handler: async (ctx, args) => {
    const signals = await ctx.db
      .query("meetingSignals")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .collect();

    const consumed = signals.filter((s) => s.isConsumed);

    for (const signal of consumed) {
      await ctx.db.delete(signal._id);
    }

    return consumed.length;
  },
});
