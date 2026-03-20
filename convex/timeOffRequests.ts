import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Get all time off requests (admin view)
export const getAll = query({
  args: {
    status: v.optional(v.string()),
    personnelId: v.optional(v.id("personnel")),
  },
  handler: async (ctx, args) => {
    let requests;

    if (args.status) {
      requests = await ctx.db
        .query("timeOffRequests")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else if (args.personnelId) {
      requests = await ctx.db
        .query("timeOffRequests")
        .withIndex("by_personnel", (q) => q.eq("personnelId", args.personnelId!))
        .order("desc")
        .collect();
    } else {
      requests = await ctx.db
        .query("timeOffRequests")
        .order("desc")
        .collect();
    }

    // Enrich with personnel data
    const enriched = await Promise.all(
      requests.map(async (request) => {
        const personnel = await ctx.db.get(request.personnelId);
        const reviewer = request.reviewedBy
          ? await ctx.db.get(request.reviewedBy)
          : null;
        return {
          ...request,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
          personnelDepartment: personnel?.department,
          personnelPosition: personnel?.position,
          reviewerName: reviewer?.name,
        };
      })
    );

    return enriched;
  },
});

// Get pending requests (for manager dashboard)
export const getPending = query({
  args: {},
  handler: async (ctx) => {
    const requests = await ctx.db
      .query("timeOffRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    const enriched = await Promise.all(
      requests.map(async (request) => {
        const personnel = await ctx.db.get(request.personnelId);
        return {
          ...request,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
          personnelDepartment: personnel?.department,
          personnelPosition: personnel?.position,
          personnelLocationId: personnel?.locationId,
        };
      })
    );

    return enriched;
  },
});

// Get requests for a specific employee (employee app view)
export const getMyRequests = query({
  args: {
    personnelId: v.id("personnel"),
  },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("timeOffRequests")
      .withIndex("by_personnel", (q) => q.eq("personnelId", args.personnelId))
      .order("desc")
      .collect();

    return requests;
  },
});

// Get requests for a date range (calendar view)
export const getByDateRange = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let requests = await ctx.db
      .query("timeOffRequests")
      .withIndex("by_date")
      .filter((q) =>
        q.and(
          q.gte(q.field("startDate"), args.startDate),
          q.lte(q.field("startDate"), args.endDate)
        )
      )
      .collect();

    if (args.status) {
      requests = requests.filter((r) => r.status === args.status);
    }

    const enriched = await Promise.all(
      requests.map(async (request) => {
        const personnel = await ctx.db.get(request.personnelId);
        return {
          ...request,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
          personnelDepartment: personnel?.department,
        };
      })
    );

    return enriched;
  },
});

// Submit a time off request (employee action)
export const submit = mutation({
  args: {
    personnelId: v.id("personnel"),
    requestType: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Calculate total days
    const start = new Date(args.startDate);
    const end = new Date(args.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const now = Date.now();

    const requestId = await ctx.db.insert("timeOffRequests", {
      personnelId: args.personnelId,
      requestType: args.requestType,
      startDate: args.startDate,
      endDate: args.endDate,
      totalDays,
      reason: args.reason,
      status: "pending",
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Get personnel to find their location manager
    const personnel = await ctx.db.get(args.personnelId);
    if (personnel?.locationId) {
      const location = await ctx.db.get(personnel.locationId);
      if (location?.managerId) {
        // Create notification for manager
        await ctx.db.insert("notifications", {
          userId: location.managerId,
          type: "time_off_request",
          title: "Time Off Request",
          message: `${personnel.firstName} ${personnel.lastName} requested ${args.requestType} from ${args.startDate} to ${args.endDate}`,
          link: `/time-off`,
          relatedPersonnelId: args.personnelId,
          relatedId: requestId,
          isRead: false,
          isDismissed: false,
          createdAt: now,
        });

        // Update request with notification timestamp
        await ctx.db.patch(requestId, {
          managerNotifiedAt: now,
        });
      }
    }

    // Update PTO balance (pending)
    const currentYear = new Date().getFullYear();
    const ptoBalance = await ctx.db
      .query("ptoBalances")
      .withIndex("by_personnel_year", (q) =>
        q.eq("personnelId", args.personnelId).eq("year", currentYear)
      )
      .first();

    if (ptoBalance) {
      const pendingField = `${args.requestType}Pending` as keyof typeof ptoBalance;
      if (pendingField in ptoBalance && typeof ptoBalance[pendingField] === "number") {
        await ctx.db.patch(ptoBalance._id, {
          [pendingField]: (ptoBalance[pendingField] as number) + totalDays,
          updatedAt: now,
        });
      }
    }

    return requestId;
  },
});

// Approve a request (manager action)
export const approve = mutation({
  args: {
    requestId: v.id("timeOffRequests"),
    reviewedBy: v.id("users"),
    managerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") throw new Error("Request is not pending");

    const now = Date.now();

    // Update status FIRST to prevent race condition with concurrent approvals
    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewedBy: args.reviewedBy,
      reviewedAt: now,
      managerNotes: args.managerNotes,
      updatedAt: now,
    });

    // Re-read the request to verify our patch won (status should be "approved" by us)
    const updatedRequest = await ctx.db.get(args.requestId);
    if (!updatedRequest || updatedRequest.status !== "approved") {
      throw new Error("Request was already processed by another manager");
    }

    // Update PTO balance (move from pending to used)
    const currentYear = new Date().getFullYear();
    const ptoBalance = await ctx.db
      .query("ptoBalances")
      .withIndex("by_personnel_year", (q) =>
        q.eq("personnelId", request.personnelId).eq("year", currentYear)
      )
      .first();

    if (ptoBalance) {
      const pendingField = `${request.requestType}Pending` as keyof typeof ptoBalance;
      const usedField = `${request.requestType}Used` as keyof typeof ptoBalance;

      if (pendingField in ptoBalance && usedField in ptoBalance) {
        await ctx.db.patch(ptoBalance._id, {
          [pendingField]: Math.max(0, (ptoBalance[pendingField] as number) - request.totalDays),
          [usedField]: (ptoBalance[usedField] as number) + request.totalDays,
          updatedAt: now,
        });
      }
    }

    // TODO: Send push notification to employee that request was approved

    return { success: true };
  },
});

// Deny a request (manager action)
export const deny = mutation({
  args: {
    requestId: v.id("timeOffRequests"),
    reviewedBy: v.id("users"),
    managerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") throw new Error("Request is not pending");

    const now = Date.now();

    // Update status FIRST to prevent race condition with concurrent reviews
    await ctx.db.patch(args.requestId, {
      status: "denied",
      reviewedBy: args.reviewedBy,
      reviewedAt: now,
      managerNotes: args.managerNotes,
      updatedAt: now,
    });

    // Re-read the request to verify our patch won
    const updatedRequest = await ctx.db.get(args.requestId);
    if (!updatedRequest || updatedRequest.status !== "denied") {
      throw new Error("Request was already processed by another manager");
    }

    // Update PTO balance (remove from pending)
    const currentYear = new Date().getFullYear();
    const ptoBalance = await ctx.db
      .query("ptoBalances")
      .withIndex("by_personnel_year", (q) =>
        q.eq("personnelId", request.personnelId).eq("year", currentYear)
      )
      .first();

    if (ptoBalance) {
      const pendingField = `${request.requestType}Pending` as keyof typeof ptoBalance;

      if (pendingField in ptoBalance) {
        await ctx.db.patch(ptoBalance._id, {
          [pendingField]: Math.max(0, (ptoBalance[pendingField] as number) - request.totalDays),
          updatedAt: now,
        });
      }
    }

    // TODO: Send push notification to employee that request was denied

    return { success: true };
  },
});

// Cancel a request (employee action - only if still pending)
export const cancel = mutation({
  args: {
    requestId: v.id("timeOffRequests"),
    personnelId: v.id("personnel"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.personnelId !== args.personnelId) {
      throw new Error("Not authorized to cancel this request");
    }
    if (request.status !== "pending") {
      throw new Error("Can only cancel pending requests");
    }

    const now = Date.now();

    // Remove from pending PTO
    const currentYear = new Date().getFullYear();
    const ptoBalance = await ctx.db
      .query("ptoBalances")
      .withIndex("by_personnel_year", (q) =>
        q.eq("personnelId", request.personnelId).eq("year", currentYear)
      )
      .first();

    if (ptoBalance) {
      const pendingField = `${request.requestType}Pending` as keyof typeof ptoBalance;

      if (pendingField in ptoBalance) {
        await ctx.db.patch(ptoBalance._id, {
          [pendingField]: Math.max(0, (ptoBalance[pendingField] as number) - request.totalDays),
          updatedAt: now,
        });
      }
    }

    // Delete the request
    await ctx.db.delete(args.requestId);

    return { success: true };
  },
});

// Get stats for dashboard
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("timeOffRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const today = new Date().toISOString().split("T")[0];
    const approved = await ctx.db
      .query("timeOffRequests")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    // Count people out today
    const outToday = approved.filter(
      (r) => r.startDate <= today && r.endDate >= today
    ).length;

    // Get this week's requests
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split("T")[0];

    const thisWeek = await ctx.db
      .query("timeOffRequests")
      .withIndex("by_requested")
      .filter((q) => q.gte(q.field("requestedAt"), weekStart.getTime()))
      .collect();

    return {
      pendingCount: pending.length,
      outToday,
      requestsThisWeek: thisWeek.length,
      approvedUpcoming: approved.filter((r) => r.startDate > today).length,
    };
  },
});
