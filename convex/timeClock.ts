import { v } from "convex/values";
import { mutation, query, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Helper to get scheduled start time for an employee today
async function getScheduledStartTime(
  ctx: any,
  personnelId: Id<"personnel">,
  today: string
): Promise<{ startTime: string; shiftName?: string } | null> {
  // First check for specific shift assignment for today
  const todayShifts = await ctx.db
    .query("shifts")
    .withIndex("by_date", (q: any) => q.eq("date", today))
    .collect();

  for (const shift of todayShifts) {
    if (shift.assignedPersonnel.includes(personnelId)) {
      return { startTime: shift.startTime, shiftName: shift.name };
    }
  }

  // Fall back to schedule template
  const personnel = await ctx.db.get(personnelId);
  if (personnel?.defaultScheduleTemplateId) {
    const template = await ctx.db.get(personnel.defaultScheduleTemplateId);
    if (template && template.departments) {
      // Find department matching employee
      for (const dept of template.departments) {
        if (dept.assignedPersonnel?.includes(personnelId) && dept.startTime) {
          return { startTime: dept.startTime };
        }
      }
      // If not found by personnel, match by department name
      const empDept = template.departments.find(
        (d: any) => d.name === personnel.department
      );
      if (empDept?.startTime) {
        return { startTime: empDept.startTime };
      }
    }
  }

  return null;
}

// Helper to round minutes to nearest 15-minute interval for pay
function roundToQuarterHour(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

// Helper to calculate hours with 15-minute rounding
function calculateRoundedHours(totalMinutes: number, breakMinutes: number): number {
  const workMinutes = totalMinutes - breakMinutes;
  const roundedMinutes = roundToQuarterHour(workMinutes);
  return Math.round((roundedMinutes / 60) * 100) / 100;
}

// Helper to parse time string to minutes since midnight
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Helper to get current time in minutes since midnight
function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

// ============ QUERIES ============

// Get current clock status for a personnel (clocked in? on break?)
export const getCurrentStatus = query({
  args: { personnelId: v.id("personnel") },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];

    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_personnel_date", (q) =>
        q.eq("personnelId", args.personnelId).eq("date", today)
      )
      .collect();

    if (entries.length === 0) {
      return { status: "not_clocked_in", entries: [] };
    }

    // Sort by timestamp to get chronological order
    const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
    const lastEntry = sorted[sorted.length - 1];

    let status: "clocked_in" | "on_break" | "clocked_out" | "not_clocked_in";

    switch (lastEntry.type) {
      case "clock_in":
        status = "clocked_in";
        break;
      case "break_start":
        status = "on_break";
        break;
      case "break_end":
        status = "clocked_in";
        break;
      case "clock_out":
        status = "clocked_out";
        break;
      default:
        status = "not_clocked_in";
    }

    // Calculate hours worked so far
    let totalMinutes = 0;
    let breakMinutes = 0;
    let clockInTime: number | null = null;
    let breakStartTime: number | null = null;

    for (const entry of sorted) {
      if (entry.type === "clock_in") {
        clockInTime = entry.timestamp;
      } else if (entry.type === "break_start" && clockInTime) {
        breakStartTime = entry.timestamp;
      } else if (entry.type === "break_end" && breakStartTime) {
        breakMinutes += (entry.timestamp - breakStartTime) / (1000 * 60);
        breakStartTime = null;
      } else if (entry.type === "clock_out" && clockInTime) {
        totalMinutes += (entry.timestamp - clockInTime) / (1000 * 60);
        clockInTime = null;
      }
    }

    // If still clocked in, add time up to now
    if (clockInTime && status !== "clocked_out") {
      const now = Date.now();
      if (breakStartTime) {
        // Currently on break
        breakMinutes += (now - breakStartTime) / (1000 * 60);
      }
      totalMinutes += (now - clockInTime) / (1000 * 60);
    }

    // Round to nearest 15-minute interval for pay
    const hoursWorked = calculateRoundedHours(totalMinutes, breakMinutes);

    return {
      status,
      entries: sorted,
      hoursWorked,
      lastEntry,
    };
  },
});

// Get all currently clocked-in employees (live dashboard)
export const getActiveClocks = query({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];

    // Get all entries for today
    const allEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_date", (q) => q.eq("date", today))
      .collect();

    // Group by personnel
    const byPersonnel = new Map<string, typeof allEntries>();
    for (const entry of allEntries) {
      const key = entry.personnelId;
      if (!byPersonnel.has(key)) {
        byPersonnel.set(key, []);
      }
      byPersonnel.get(key)!.push(entry);
    }

    const activeClocks: Array<{
      personnelId: Id<"personnel">;
      personnelName: string;
      position: string;
      department: string;
      clockInTime: number;
      status: "working" | "on_break";
      hoursWorked: number;
    }> = [];

    for (const [personnelId, entries] of byPersonnel) {
      const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
      const lastEntry = sorted[sorted.length - 1];

      // Only include if currently working or on break
      if (lastEntry.type === "clock_out") continue;

      const personnel = await ctx.db.get(personnelId as Id<"personnel">);
      if (!personnel) continue;

      // Find clock in time
      const clockInEntry = sorted.find((e) => e.type === "clock_in");
      if (!clockInEntry) continue;

      // Calculate hours
      let totalMinutes = 0;
      let breakMinutes = 0;
      let clockInTime: number | null = null;
      let breakStartTime: number | null = null;

      for (const entry of sorted) {
        if (entry.type === "clock_in") {
          clockInTime = entry.timestamp;
        } else if (entry.type === "break_start" && clockInTime) {
          breakStartTime = entry.timestamp;
        } else if (entry.type === "break_end" && breakStartTime) {
          breakMinutes += (entry.timestamp - breakStartTime) / (1000 * 60);
          breakStartTime = null;
        }
      }

      if (clockInTime) {
        const now = Date.now();
        if (breakStartTime) {
          breakMinutes += (now - breakStartTime) / (1000 * 60);
        }
        totalMinutes = (now - clockInTime) / (1000 * 60);
      }

      // Round to nearest 15-minute interval for pay
      const hoursWorked = calculateRoundedHours(totalMinutes, breakMinutes);

      activeClocks.push({
        personnelId: personnelId as Id<"personnel">,
        personnelName: `${personnel.firstName} ${personnel.lastName}`,
        position: personnel.position,
        department: personnel.department,
        clockInTime: clockInEntry.timestamp,
        status: lastEntry.type === "break_start" ? "on_break" : "working",
        hoursWorked: Math.round(hoursWorked * 100) / 100,
      });
    }

    // Sort by clock in time
    return activeClocks.sort((a, b) => a.clockInTime - b.clockInTime);
  },
});

// Get all entries for a specific date
export const getEntriesByDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Enrich with personnel info
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const personnel = await ctx.db.get(entry.personnelId);
        return {
          ...entry,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
          department: personnel?.department || "Unknown",
          position: personnel?.position || "Unknown",
        };
      })
    );

    return enriched.sort((a, b) => a.timestamp - b.timestamp);
  },
});

// Get entries for a specific personnel within a date range
export const getEntriesByPersonnel = query({
  args: {
    personnelId: v.id("personnel"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_personnel", (q) => q.eq("personnelId", args.personnelId))
      .collect();

    const filtered = entries.filter(
      (e) => e.date >= args.startDate && e.date <= args.endDate
    );

    return filtered.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.timestamp - b.timestamp;
    });
  },
});

// Get daily summary (aggregated hours per employee for a date)
export const getDailySummary = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Group by personnel
    const byPersonnel = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = entry.personnelId;
      if (!byPersonnel.has(key)) {
        byPersonnel.set(key, []);
      }
      byPersonnel.get(key)!.push(entry);
    }

    const summaries: Array<{
      personnelId: Id<"personnel">;
      personnelName: string;
      department: string;
      position: string;
      clockIn: number | null;
      clockOut: number | null;
      breakMinutes: number;
      totalHours: number;
      entries: typeof entries;
      isComplete: boolean;
    }> = [];

    for (const [personnelId, personEntries] of byPersonnel) {
      const personnel = await ctx.db.get(personnelId as Id<"personnel">);
      if (!personnel) continue;

      const sorted = personEntries.sort((a, b) => a.timestamp - b.timestamp);

      let clockIn: number | null = null;
      let clockOut: number | null = null;
      let breakMinutes = 0;
      let breakStartTime: number | null = null;

      for (const entry of sorted) {
        if (entry.type === "clock_in" && !clockIn) {
          clockIn = entry.timestamp;
        } else if (entry.type === "clock_out") {
          clockOut = entry.timestamp;
        } else if (entry.type === "break_start") {
          breakStartTime = entry.timestamp;
        } else if (entry.type === "break_end" && breakStartTime) {
          breakMinutes += (entry.timestamp - breakStartTime) / (1000 * 60);
          breakStartTime = null;
        }
      }

      let totalHours = 0;
      if (clockIn && clockOut) {
        // Round to nearest 15-minute interval for pay
        const totalMinutes = (clockOut - clockIn) / (1000 * 60);
        totalHours = calculateRoundedHours(totalMinutes, breakMinutes);
      } else if (clockIn) {
        // Still clocked in - round to nearest 15-minute interval
        const now = Date.now();
        const totalMinutes = (now - clockIn) / (1000 * 60);
        totalHours = calculateRoundedHours(totalMinutes, breakMinutes);
      }

      summaries.push({
        personnelId: personnelId as Id<"personnel">,
        personnelName: `${personnel.firstName} ${personnel.lastName}`,
        department: personnel.department,
        position: personnel.position,
        clockIn,
        clockOut,
        breakMinutes: Math.round(breakMinutes),
        totalHours: Math.round(totalHours * 100) / 100,
        entries: sorted,
        isComplete: !!clockIn && !!clockOut,
      });
    }

    return summaries.sort((a, b) => a.personnelName.localeCompare(b.personnelName));
  },
});

// Get pending time corrections
export const getPendingCorrections = query({
  args: {},
  handler: async (ctx) => {
    const corrections = await ctx.db
      .query("timeCorrections")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Enrich with personnel info
    const enriched = await Promise.all(
      corrections.map(async (correction) => {
        const personnel = await ctx.db.get(correction.personnelId);
        return {
          ...correction,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
        };
      })
    );

    return enriched.sort((a, b) => b.requestedAt - a.requestedAt);
  },
});

// Get all corrections (with optional status filter)
export const getCorrections = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let corrections;
    if (args.status) {
      corrections = await ctx.db
        .query("timeCorrections")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      corrections = await ctx.db.query("timeCorrections").collect();
    }

    // Enrich with personnel info
    const enriched = await Promise.all(
      corrections.map(async (correction) => {
        const personnel = await ctx.db.get(correction.personnelId);
        let reviewerName = null;
        if (correction.reviewedBy) {
          const reviewer = await ctx.db.get(correction.reviewedBy);
          reviewerName = reviewer?.name || null;
        }
        return {
          ...correction,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
          reviewerName,
        };
      })
    );

    return enriched.sort((a, b) => b.requestedAt - a.requestedAt);
  },
});

// ============ MUTATIONS ============

// Clock in
export const clockIn = mutation({
  args: {
    personnelId: v.id("personnel"),
    source: v.string(),
    locationId: v.optional(v.id("locations")),
    gpsCoordinates: v.optional(v.object({
      lat: v.number(),
      lng: v.number(),
    })),
    notes: v.optional(v.string()),
    bypassScheduleCheck: v.optional(v.boolean()), // For admin overrides
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Check if already clocked in today
    const existing = await ctx.db
      .query("timeEntries")
      .withIndex("by_personnel_date", (q) =>
        q.eq("personnelId", args.personnelId).eq("date", today)
      )
      .collect();

    if (existing.length > 0) {
      const sorted = existing.sort((a, b) => b.timestamp - a.timestamp);
      const last = sorted[0];
      if (last.type !== "clock_out") {
        throw new Error("Already clocked in. Please clock out first.");
      }
    }

    // Get scheduled start time and check for early clock-in
    let minutesLate = 0;
    let isLate = false;
    let scheduledStart: string | null = null;

    if (!args.bypassScheduleCheck) {
      const schedule = await getScheduledStartTime(ctx, args.personnelId, today);

      if (schedule) {
        scheduledStart = schedule.startTime;
        const scheduledMinutes = parseTimeToMinutes(schedule.startTime);
        const currentMinutes = getCurrentMinutes();

        // Block early clock-in (before scheduled start time)
        if (currentMinutes < scheduledMinutes) {
          const minutesEarly = scheduledMinutes - currentMinutes;
          throw new Error(
            `Cannot clock in yet. Your shift starts at ${schedule.startTime}. ` +
            `Please wait ${minutesEarly} minute${minutesEarly === 1 ? '' : 's'}.`
          );
        }

        // Check if late (more than 5 minute grace period)
        const GRACE_PERIOD_MINUTES = 5;
        minutesLate = currentMinutes - scheduledMinutes;
        isLate = minutesLate > GRACE_PERIOD_MINUTES;
      }
    }

    // Create the time entry
    const entryId = await ctx.db.insert("timeEntries", {
      personnelId: args.personnelId,
      date: today,
      type: "clock_in",
      timestamp: now,
      source: args.source,
      locationId: args.locationId,
      gpsCoordinates: args.gpsCoordinates,
      notes: args.notes,
      createdAt: now,
      // Late tracking
      scheduledStart: scheduledStart || undefined,
      minutesLate: minutesLate > 0 ? minutesLate : undefined,
      isLate: isLate || undefined,
    });

    // If late, send alerts to managers
    if (isLate) {
      const personnel = await ctx.db.get(args.personnelId);
      const employeeName = personnel
        ? `${personnel.firstName} ${personnel.lastName}`
        : "Unknown Employee";

      await ctx.scheduler.runAfter(0, internal.timeClock.sendLateAlert, {
        personnelId: args.personnelId,
        employeeName,
        minutesLate,
        scheduledStart: scheduledStart || "Unknown",
        locationId: personnel?.locationId,
      });
    }

    return entryId;
  },
});

// Clock out
export const clockOut = mutation({
  args: {
    personnelId: v.id("personnel"),
    source: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Check current status
    const existing = await ctx.db
      .query("timeEntries")
      .withIndex("by_personnel_date", (q) =>
        q.eq("personnelId", args.personnelId).eq("date", today)
      )
      .collect();

    if (existing.length === 0) {
      throw new Error("Not clocked in. Please clock in first.");
    }

    const sorted = existing.sort((a, b) => b.timestamp - a.timestamp);
    const last = sorted[0];

    if (last.type === "clock_out") {
      throw new Error("Already clocked out.");
    }

    if (last.type === "break_start") {
      throw new Error("Currently on break. Please end break first.");
    }

    const entryId = await ctx.db.insert("timeEntries", {
      personnelId: args.personnelId,
      date: today,
      type: "clock_out",
      timestamp: now,
      source: args.source,
      notes: args.notes,
      createdAt: now,
    });

    return entryId;
  },
});

// Start break
export const startBreak = mutation({
  args: {
    personnelId: v.id("personnel"),
    source: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    const existing = await ctx.db
      .query("timeEntries")
      .withIndex("by_personnel_date", (q) =>
        q.eq("personnelId", args.personnelId).eq("date", today)
      )
      .collect();

    if (existing.length === 0) {
      throw new Error("Not clocked in. Please clock in first.");
    }

    const sorted = existing.sort((a, b) => b.timestamp - a.timestamp);
    const last = sorted[0];

    if (last.type !== "clock_in" && last.type !== "break_end") {
      throw new Error("Cannot start break. Must be clocked in and not already on break.");
    }

    const entryId = await ctx.db.insert("timeEntries", {
      personnelId: args.personnelId,
      date: today,
      type: "break_start",
      timestamp: now,
      source: args.source,
      notes: args.notes,
      createdAt: now,
    });

    return entryId;
  },
});

// End break
export const endBreak = mutation({
  args: {
    personnelId: v.id("personnel"),
    source: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    const existing = await ctx.db
      .query("timeEntries")
      .withIndex("by_personnel_date", (q) =>
        q.eq("personnelId", args.personnelId).eq("date", today)
      )
      .collect();

    if (existing.length === 0) {
      throw new Error("Not clocked in.");
    }

    const sorted = existing.sort((a, b) => b.timestamp - a.timestamp);
    const last = sorted[0];

    if (last.type !== "break_start") {
      throw new Error("Not currently on break.");
    }

    const entryId = await ctx.db.insert("timeEntries", {
      personnelId: args.personnelId,
      date: today,
      type: "break_end",
      timestamp: now,
      source: args.source,
      notes: args.notes,
      createdAt: now,
    });

    return entryId;
  },
});

// Edit a time entry (manager direct edit)
export const editEntry = mutation({
  args: {
    timeEntryId: v.id("timeEntries"),
    newTimestamp: v.number(),
    userId: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.timeEntryId);
    if (!entry) {
      throw new Error("Time entry not found");
    }

    await ctx.db.patch(args.timeEntryId, {
      timestamp: args.newTimestamp,
      editedBy: args.userId,
      editedAt: Date.now(),
      originalTimestamp: entry.originalTimestamp || entry.timestamp,
      editReason: args.reason,
    });

    return args.timeEntryId;
  },
});

// Delete a time entry
export const deleteEntry = mutation({
  args: {
    timeEntryId: v.id("timeEntries"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.timeEntryId);
    return args.timeEntryId;
  },
});

// Add a missed time entry (manager adding for employee)
export const addMissedEntry = mutation({
  args: {
    personnelId: v.id("personnel"),
    date: v.string(),
    type: v.string(),
    timestamp: v.number(),
    userId: v.id("users"),
    reason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const entryId = await ctx.db.insert("timeEntries", {
      personnelId: args.personnelId,
      date: args.date,
      type: args.type,
      timestamp: args.timestamp,
      source: "admin",
      notes: args.notes || `Added by manager: ${args.reason}`,
      editedBy: args.userId,
      editedAt: now,
      editReason: args.reason,
      createdAt: now,
    });

    return entryId;
  },
});

// Request a time correction (employee initiated)
export const requestCorrection = mutation({
  args: {
    personnelId: v.id("personnel"),
    timeEntryId: v.optional(v.id("timeEntries")),
    date: v.string(),
    requestType: v.string(),
    currentTimestamp: v.optional(v.number()),
    requestedTimestamp: v.optional(v.number()),
    requestedType: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const correctionId = await ctx.db.insert("timeCorrections", {
      personnelId: args.personnelId,
      timeEntryId: args.timeEntryId,
      date: args.date,
      requestType: args.requestType,
      currentTimestamp: args.currentTimestamp,
      requestedTimestamp: args.requestedTimestamp,
      requestedType: args.requestedType,
      reason: args.reason,
      status: "pending",
      requestedAt: now,
    });

    return correctionId;
  },
});

// Review a correction request (approve/deny)
export const reviewCorrection = mutation({
  args: {
    correctionId: v.id("timeCorrections"),
    status: v.string(), // "approved" | "denied"
    userId: v.id("users"),
    reviewNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const correction = await ctx.db.get(args.correctionId);
    if (!correction) {
      throw new Error("Correction not found");
    }

    if (correction.status !== "pending") {
      throw new Error("Correction already reviewed");
    }

    const now = Date.now();

    // If approved, apply the correction
    if (args.status === "approved") {
      if (correction.requestType === "edit" && correction.timeEntryId && correction.requestedTimestamp) {
        await ctx.db.patch(correction.timeEntryId, {
          timestamp: correction.requestedTimestamp,
          editedBy: args.userId,
          editedAt: now,
          originalTimestamp: correction.currentTimestamp,
          editReason: `Approved correction: ${correction.reason}`,
        });
      } else if (correction.requestType === "add_missed" && correction.requestedTimestamp && correction.requestedType) {
        await ctx.db.insert("timeEntries", {
          personnelId: correction.personnelId,
          date: correction.date,
          type: correction.requestedType,
          timestamp: correction.requestedTimestamp,
          source: "admin",
          notes: `Approved missed punch: ${correction.reason}`,
          editedBy: args.userId,
          editedAt: now,
          editReason: correction.reason,
          createdAt: now,
        });
      } else if (correction.requestType === "delete" && correction.timeEntryId) {
        await ctx.db.delete(correction.timeEntryId);
      }
    }

    // Update correction record
    await ctx.db.patch(args.correctionId, {
      status: args.status,
      reviewedBy: args.userId,
      reviewedAt: now,
      reviewNotes: args.reviewNotes,
    });

    return args.correctionId;
  },
});

// Get clock status for all personnel (efficient batch query for dashboards)
export const getAllClockStatuses = query({
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];

    // Get all entries for today
    const allEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_date", (q) => q.eq("date", today))
      .collect();

    // Group by personnel and determine status
    const statusMap: Record<string, {
      status: "clocked_in" | "on_break" | "clocked_out" | "not_clocked_in";
      clockInTime?: number;
      hoursWorked?: number;
    }> = {};

    const byPersonnel = new Map<string, typeof allEntries>();
    for (const entry of allEntries) {
      const key = entry.personnelId;
      if (!byPersonnel.has(key)) {
        byPersonnel.set(key, []);
      }
      byPersonnel.get(key)!.push(entry);
    }

    for (const [personnelId, entries] of byPersonnel) {
      const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
      const lastEntry = sorted[sorted.length - 1];

      let status: "clocked_in" | "on_break" | "clocked_out" | "not_clocked_in";
      switch (lastEntry.type) {
        case "clock_in":
          status = "clocked_in";
          break;
        case "break_start":
          status = "on_break";
          break;
        case "break_end":
          status = "clocked_in";
          break;
        case "clock_out":
          status = "clocked_out";
          break;
        default:
          status = "not_clocked_in";
      }

      // Calculate hours worked
      let totalMinutes = 0;
      let breakMinutes = 0;
      let clockInTime: number | undefined;
      let breakStartTime: number | null = null;

      for (const entry of sorted) {
        if (entry.type === "clock_in" && !clockInTime) {
          clockInTime = entry.timestamp;
        } else if (entry.type === "break_start") {
          breakStartTime = entry.timestamp;
        } else if (entry.type === "break_end" && breakStartTime) {
          breakMinutes += (entry.timestamp - breakStartTime) / (1000 * 60);
          breakStartTime = null;
        } else if (entry.type === "clock_out" && clockInTime) {
          totalMinutes += (entry.timestamp - clockInTime) / (1000 * 60);
        }
      }

      // If still clocked in, add time up to now
      if (clockInTime && status !== "clocked_out") {
        const now = Date.now();
        if (breakStartTime) {
          breakMinutes += (now - breakStartTime) / (1000 * 60);
        }
        totalMinutes = (now - clockInTime) / (1000 * 60);
      }

      // Round to nearest 15-minute interval for pay
      const hoursWorked = calculateRoundedHours(totalMinutes, breakMinutes);

      statusMap[personnelId] = {
        status,
        clockInTime,
        hoursWorked: hoursWorked > 0 ? hoursWorked : undefined,
      };
    }

    return statusMap;
  },
});

// Get manager dashboard data (all employee statuses for today)
export const getManagerDashboard = query({
  args: {
    locationId: v.optional(v.id("locations")), // Filter by location if needed
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];
    const now = Date.now();

    // Get all active personnel
    let personnel = await ctx.db
      .query("personnel")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Filter by location if specified
    if (args.locationId) {
      personnel = personnel.filter((p) => p.locationId === args.locationId);
    }

    // Get all entries for today
    const allEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_date", (q) => q.eq("date", today))
      .collect();

    // Get today's call-offs
    const callOffs = await ctx.db
      .query("callOffs")
      .withIndex("by_date", (q) => q.eq("date", today))
      .collect();

    // Get unacknowledged call-offs
    const unacknowledgedCallOffs = await ctx.db
      .query("callOffs")
      .filter((q) => q.eq(q.field("acknowledgedAt"), undefined))
      .collect();

    // Group entries by personnel
    const entriesByPersonnel = new Map<string, typeof allEntries>();
    for (const entry of allEntries) {
      if (!entriesByPersonnel.has(entry.personnelId)) {
        entriesByPersonnel.set(entry.personnelId, []);
      }
      entriesByPersonnel.get(entry.personnelId)!.push(entry);
    }

    // Call-off map
    const callOffPersonnelIds = new Set(callOffs.map((c) => c.personnelId));

    // Build employee status list
    const employees = await Promise.all(
      personnel.map(async (person) => {
        const entries = entriesByPersonnel.get(person._id) || [];
        const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
        const lastEntry = sorted[sorted.length - 1];
        const hasCalledOff = callOffPersonnelIds.has(person._id);

        // Determine status
        let status: "clocked_in" | "on_break" | "clocked_out" | "not_clocked_in" | "called_off";
        if (hasCalledOff) {
          status = "called_off";
        } else if (!lastEntry) {
          status = "not_clocked_in";
        } else {
          switch (lastEntry.type) {
            case "clock_in":
              status = "clocked_in";
              break;
            case "break_start":
              status = "on_break";
              break;
            case "break_end":
              status = "clocked_in";
              break;
            case "clock_out":
              status = "clocked_out";
              break;
            default:
              status = "not_clocked_in";
          }
        }

        // Calculate hours worked
        let totalMinutes = 0;
        let breakMinutes = 0;
        let clockInTime: number | undefined;
        let breakStartTime: number | null = null;

        for (const entry of sorted) {
          if (entry.type === "clock_in" && !clockInTime) {
            clockInTime = entry.timestamp;
          } else if (entry.type === "break_start") {
            breakStartTime = entry.timestamp;
          } else if (entry.type === "break_end" && breakStartTime) {
            breakMinutes += (entry.timestamp - breakStartTime) / (1000 * 60);
            breakStartTime = null;
          } else if (entry.type === "clock_out" && clockInTime) {
            totalMinutes += (entry.timestamp - clockInTime) / (1000 * 60);
          }
        }

        // If still clocked in, add time up to now
        if (clockInTime && status !== "clocked_out") {
          if (status === "on_break" && breakStartTime) {
            // Don't count break time
            totalMinutes += (breakStartTime - clockInTime) / (1000 * 60);
          } else {
            totalMinutes += (now - clockInTime) / (1000 * 60);
          }
        }

        // Round to nearest 15-minute interval for pay
        const hoursWorked = calculateRoundedHours(totalMinutes, breakMinutes);

        // Check if late (look at first clock_in entry)
        const firstClockIn = sorted.find((e) => e.type === "clock_in");
        const isLate = firstClockIn?.isLate || false;
        const minutesLate = firstClockIn?.minutesLate;

        return {
          personnelId: person._id,
          name: `${person.firstName} ${person.lastName}`,
          department: person.department,
          position: person.position,
          status,
          clockInTime,
          hoursWorked: hoursWorked > 0 ? hoursWorked : undefined,
          isLate,
          minutesLate,
        };
      })
    );

    // Sort: clocked in first, then by name
    const statusOrder = { clocked_in: 0, on_break: 1, not_clocked_in: 2, called_off: 3, clocked_out: 4 };
    employees.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

    // Calculate summary stats
    const clockedInCount = employees.filter((e) => e.status === "clocked_in" || e.status === "on_break").length;
    const lateCount = employees.filter((e) => e.isLate && e.status !== "called_off").length;
    const callOffCount = employees.filter((e) => e.status === "called_off").length;
    const notClockedInCount = employees.filter((e) => e.status === "not_clocked_in").length;

    // Enrich unacknowledged call-offs with personnel info
    const unacknowledgedWithNames = await Promise.all(
      unacknowledgedCallOffs.map(async (callOff) => {
        const person = await ctx.db.get(callOff.personnelId);
        return {
          ...callOff,
          personnelName: person ? `${person.firstName} ${person.lastName}` : "Unknown",
        };
      })
    );

    return {
      employees,
      summary: {
        total: employees.length,
        clockedIn: clockedInCount,
        late: lateCount,
        callOffs: callOffCount,
        notClockedIn: notClockedInCount,
      },
      unacknowledgedCallOffs: unacknowledgedWithNames,
    };
  },
});

// Force clock out (manager action for employee who forgot)
export const forceClockOut = mutation({
  args: {
    personnelId: v.id("personnel"),
    userId: v.id("users"),
    timestamp: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = args.timestamp || Date.now();
    const today = new Date(now).toISOString().split("T")[0];

    const entryId = await ctx.db.insert("timeEntries", {
      personnelId: args.personnelId,
      date: today,
      type: "clock_out",
      timestamp: now,
      source: "admin",
      notes: args.notes || "Force clocked out by manager",
      editedBy: args.userId,
      editedAt: Date.now(),
      editReason: "Force clock out",
      createdAt: Date.now(),
    });

    return entryId;
  },
});

// ============ LATE ALERTS ============

// Get users who should receive late alerts
export const getLateAlertRecipients = internalQuery({
  args: {
    locationId: v.optional(v.id("locations")),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect();
    const recipientRoles = ["super_admin", "admin", "warehouse_director", "coo"];

    // Get location manager if location specified
    let locationManagerId: Id<"users"> | null = null;
    if (args.locationId) {
      const location = await ctx.db.get(args.locationId);
      if (location?.managerId) {
        locationManagerId = location.managerId;
      }
    }

    const recipients = users.filter((u) => {
      if (!u.isActive || !u.expoPushToken) return false;
      // Include by role
      if (recipientRoles.includes(u.role)) return true;
      // Include location manager
      if (locationManagerId && u._id === locationManagerId) return true;
      return false;
    });

    return recipients.map((u) => ({
      userId: u._id,
      name: u.name,
      expoPushToken: u.expoPushToken!,
      role: u.role,
    }));
  },
});

// Send late alert push notification
export const sendLateAlert = internalAction({
  args: {
    personnelId: v.id("personnel"),
    employeeName: v.string(),
    minutesLate: v.number(),
    scheduledStart: v.string(),
    locationId: v.optional(v.id("locations")),
  },
  handler: async (ctx, args) => {
    const recipients = await ctx.runQuery(internal.timeClock.getLateAlertRecipients, {
      locationId: args.locationId,
    });

    if (recipients.length === 0) {
      console.log("No recipients for late alert");
      return { sentCount: 0 };
    }

    let sentCount = 0;
    for (const recipient of recipients) {
      try {
        const message = {
          to: recipient.expoPushToken,
          sound: "default",
          title: "⏰ Late Clock-In",
          body: `${args.employeeName} clocked in ${args.minutesLate} min late (scheduled: ${args.scheduledStart})`,
          data: { type: "late_alert", personnelId: args.personnelId },
        };

        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (response.ok) {
          sentCount++;
        }
      } catch (error) {
        console.error(`Failed to send late alert to ${recipient.name}:`, error);
      }
    }

    return { sentCount };
  },
});

// Check for late patterns (more than 1x per week = flagged)
export const checkLatePattern = internalQuery({
  args: {
    personnelId: v.id("personnel"),
  },
  handler: async (ctx, args) => {
    // Get entries from the last 7 days
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split("T")[0];

    const entries = await ctx.db
      .query("timeEntries")
      .withIndex("by_personnel_date", (q) => q.eq("personnelId", args.personnelId))
      .filter((q) => q.gte(q.field("date"), weekAgoStr))
      .collect();

    // Count late clock-ins
    const lateCount = entries.filter(
      (e) => e.type === "clock_in" && e.isLate
    ).length;

    return {
      lateCountThisWeek: lateCount,
      hasPattern: lateCount > 1,
    };
  },
});
