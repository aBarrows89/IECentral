import { v } from "convex/values";
import { mutation, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Helper to check if a write-up is deprecated (60 days from date)
// Deprecated write-ups are still shown but marked visually
function isWriteUpDeprecated(date: string): boolean {
  const writeUpDate = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - writeUpDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 60;
}

// Helper to get days since write-up
function getDaysSinceWriteUp(date: string): number {
  const writeUpDate = new Date(date);
  const now = new Date();
  return Math.floor((now.getTime() - writeUpDate.getTime()) / (1000 * 60 * 60 * 24));
}

// ============ QUERIES ============

// Get write-ups for a personnel
export const listByPersonnel = query({
  args: { personnelId: v.id("personnel") },
  handler: async (ctx, args) => {
    const writeUps = await ctx.db
      .query("writeUps")
      .withIndex("by_personnel", (q) => q.eq("personnelId", args.personnelId))
      .collect();

    // Get issuer names and calculate deprecated status
    // All write-ups are always shown, but marked as deprecated after 60 days
    const writeUpsWithIssuer = await Promise.all(
      writeUps.map(async (writeUp) => {
        const issuer = await ctx.db.get(writeUp.issuedBy);
        const deprecated = isWriteUpDeprecated(writeUp.date);
        const daysSince = getDaysSinceWriteUp(writeUp.date);
        return {
          ...writeUp,
          issuerName: issuer?.name || "Unknown",
          // Deprecated after 60 days - still shown but marked
          isDeprecated: deprecated,
          daysSinceIssued: daysSince,
          // Keep isArchived for manual archiving if needed
          isArchived: writeUp.isArchived || false,
        };
      })
    );

    return writeUpsWithIssuer.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  },
});

// Get all write-ups (for admin view)
// All write-ups are always shown - deprecated status is just visual
export const listAll = query({
  args: {
    severity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let writeUps;

    if (args.severity) {
      writeUps = await ctx.db
        .query("writeUps")
        .withIndex("by_severity", (q) => q.eq("severity", args.severity!))
        .collect();
    } else {
      writeUps = await ctx.db.query("writeUps").collect();
    }

    // Enrich with personnel and issuer names and deprecated status
    const enriched = await Promise.all(
      writeUps.map(async (writeUp) => {
        const personnel = await ctx.db.get(writeUp.personnelId);
        const issuer = await ctx.db.get(writeUp.issuedBy);
        const deprecated = isWriteUpDeprecated(writeUp.date);
        const daysSince = getDaysSinceWriteUp(writeUp.date);
        return {
          ...writeUp,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
          issuerName: issuer?.name || "Unknown",
          isDeprecated: deprecated,
          daysSinceIssued: daysSince,
          isArchived: writeUp.isArchived || false,
        };
      })
    );

    return enriched.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  },
});

// Get single write-up
export const getById = query({
  args: { writeUpId: v.id("writeUps") },
  handler: async (ctx, args) => {
    const writeUp = await ctx.db.get(args.writeUpId);
    if (!writeUp) return null;

    const personnel = await ctx.db.get(writeUp.personnelId);
    const issuer = await ctx.db.get(writeUp.issuedBy);

    return {
      ...writeUp,
      personnelName: personnel
        ? `${personnel.firstName} ${personnel.lastName}`
        : "Unknown",
      issuerName: issuer?.name || "Unknown",
    };
  },
});

// Get write-ups requiring follow-up
export const listPendingFollowUps = query({
  handler: async (ctx) => {
    const writeUps = await ctx.db.query("writeUps").collect();

    const pending = writeUps.filter(
      (w) => w.followUpRequired && !w.followUpNotes
    );

    const enriched = await Promise.all(
      pending.map(async (writeUp) => {
        const personnel = await ctx.db.get(writeUp.personnelId);
        return {
          ...writeUp,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
        };
      })
    );

    return enriched.sort(
      (a, b) =>
        new Date(a.followUpDate || a.date).getTime() -
        new Date(b.followUpDate || b.date).getTime()
    );
  },
});

// ============ MUTATIONS ============

// Create write-up
export const create = mutation({
  args: {
    personnelId: v.id("personnel"),
    date: v.string(),
    category: v.string(),
    severity: v.string(),
    description: v.string(),
    actionTaken: v.optional(v.string()),
    followUpRequired: v.boolean(),
    followUpDate: v.optional(v.string()),
    issuedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const VALID_CATEGORIES = ["attendance", "behavior", "safety", "performance", "policy_violation"];
    const VALID_SEVERITIES = ["verbal", "written", "final", "termination"];

    if (!VALID_CATEGORIES.includes(args.category)) {
      throw new Error(`Invalid category: ${args.category}. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
    }
    if (!VALID_SEVERITIES.includes(args.severity)) {
      throw new Error(`Invalid severity: ${args.severity}. Must be one of: ${VALID_SEVERITIES.join(", ")}`);
    }

    const writeUpId = await ctx.db.insert("writeUps", {
      personnelId: args.personnelId,
      date: args.date,
      category: args.category,
      severity: args.severity,
      description: args.description,
      actionTaken: args.actionTaken,
      followUpRequired: args.followUpRequired,
      followUpDate: args.followUpDate,
      issuedBy: args.issuedBy,
      createdAt: Date.now(),
    });



    // Send push notification to employee
    const user = await ctx.db
      .query("users")
      .withIndex("by_personnel", (q) => q.eq("personnelId", args.personnelId))
      .first();

    if (user?.expoPushToken) {
      await ctx.scheduler.runAfter(0, internal.writeUps.sendWriteUpPush, {
        expoPushToken: user.expoPushToken,
        category: args.category,
        severity: args.severity,
      });
    }

    return writeUpId;
  },
});

// Update write-up
export const update = mutation({
  args: {
    writeUpId: v.id("writeUps"),
    category: v.optional(v.string()),
    severity: v.optional(v.string()),
    description: v.optional(v.string()),
    actionTaken: v.optional(v.string()),
    followUpRequired: v.optional(v.boolean()),
    followUpDate: v.optional(v.string()),
    followUpNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const VALID_CATEGORIES = ["attendance", "behavior", "safety", "performance", "policy_violation"];
    const VALID_SEVERITIES = ["verbal", "written", "final", "termination"];

    if (args.category && !VALID_CATEGORIES.includes(args.category)) {
      throw new Error(`Invalid category: ${args.category}. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
    }
    if (args.severity && !VALID_SEVERITIES.includes(args.severity)) {
      throw new Error(`Invalid severity: ${args.severity}. Must be one of: ${VALID_SEVERITIES.join(", ")}`);
    }

    const { writeUpId, ...updates } = args;

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    await ctx.db.patch(writeUpId, updateData);
    return writeUpId;
  },
});

// Mark write-up as acknowledged
export const acknowledge = mutation({
  args: { writeUpId: v.id("writeUps") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writeUpId, {
      acknowledgedAt: Date.now(),
    });
    return args.writeUpId;
  },
});

// Add follow-up notes
export const addFollowUpNotes = mutation({
  args: {
    writeUpId: v.id("writeUps"),
    followUpNotes: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.writeUpId, {
      followUpNotes: args.followUpNotes,
    });
    return args.writeUpId;
  },
});

// Delete write-up
export const remove = mutation({
  args: { writeUpId: v.id("writeUps") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.writeUpId);
    return args.writeUpId;
  },
});

// Generate upload URL for write-up attachments
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Add attachment to a write-up
export const addAttachment = mutation({
  args: {
    writeUpId: v.id("writeUps"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
  },
  handler: async (ctx, args) => {
    const writeUp = await ctx.db.get(args.writeUpId);
    if (!writeUp) throw new Error("Write-up not found");

    const newAttachment = {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      uploadedAt: Date.now(),
    };

    const attachments = writeUp.attachments || [];
    attachments.push(newAttachment);

    await ctx.db.patch(args.writeUpId, { attachments });
    return args.writeUpId;
  },
});

// Remove attachment from a write-up
export const removeAttachment = mutation({
  args: {
    writeUpId: v.id("writeUps"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const writeUp = await ctx.db.get(args.writeUpId);
    if (!writeUp) throw new Error("Write-up not found");

    const attachments = (writeUp.attachments || []).filter(
      (a) => a.storageId !== args.storageId
    );

    // Delete the file from storage
    await ctx.storage.delete(args.storageId);

    await ctx.db.patch(args.writeUpId, { attachments });
    return args.writeUpId;
  },
});

// Get attachment URL
export const getAttachmentUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// ============ PUSH NOTIFICATIONS ============

// Send push notification for write-up
export const sendWriteUpPush = internalAction({
  args: {
    expoPushToken: v.string(),
    category: v.string(),
    severity: v.string(),
  },
  handler: async (ctx, args) => {
    const severityLabels: Record<string, string> = {
      verbal_warning: "Verbal Warning",
      written_warning: "Written Warning",
      suspension: "Suspension",
      termination: "Termination Notice",
    };

    const severityLabel = severityLabels[args.severity] || args.severity;

    const message = {
      to: args.expoPushToken,
      sound: "default",
      title: `${severityLabel} Issued`,
      body: `You have received a ${severityLabel.toLowerCase()} for ${args.category}. Please review in the app.`,
      data: { type: "writeup" },
    };

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      return await response.json();
    } catch (error) {
      console.error("Failed to send write-up push notification:", error);
      return null;
    }
  },
});
