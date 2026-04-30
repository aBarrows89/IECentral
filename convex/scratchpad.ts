import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function gen4DigitCode(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

export const createCode = mutation({
  args: {
    content: v.string(),
    createdBy: v.optional(v.id("users")),
    createdByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const trimmed = args.content.trim();
    if (!trimmed) throw new Error("Content cannot be empty");
    if (trimmed.length > 100_000) throw new Error("Content too large (max 100KB)");

    const now = Date.now();
    // Sweep expired entries opportunistically (cap to keep mutation cheap).
    const expired = await ctx.db
      .query("scratchpadCodes")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(20);
    for (const e of expired) await ctx.db.delete(e._id);

    // Pick a 4-digit code, retry on collision (active codes only).
    let code = "";
    for (let i = 0; i < 50; i++) {
      const candidate = gen4DigitCode();
      const collision = await ctx.db
        .query("scratchpadCodes")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .first();
      if (!collision || collision.expiresAt < now) {
        if (collision) await ctx.db.delete(collision._id); // free the slot
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error("Could not allocate a free code — try again shortly");

    await ctx.db.insert("scratchpadCodes", {
      code,
      content: trimmed,
      createdBy: args.createdBy,
      createdByName: args.createdByName,
      createdAt: now,
      expiresAt: now + TTL_MS,
    });

    return { code, expiresAt: now + TTL_MS };
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim();
    if (!/^\d{4}$/.test(code)) return null;
    const row = await ctx.db
      .query("scratchpadCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return {
      content: row.content,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      createdByName: row.createdByName,
    };
  },
});

export const deleteCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("scratchpadCodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});
