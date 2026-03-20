import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============ QUERIES ============

// Get attendance records for a personnel
export const listByPersonnel = query({
  args: {
    personnelId: v.id("personnel"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attendance = await ctx.db
      .query("attendance")
      .withIndex("by_personnel", (q) => q.eq("personnelId", args.personnelId))
      .collect();

    let filtered = attendance;
    if (args.startDate) {
      filtered = filtered.filter((a) => a.date >= args.startDate!);
    }
    if (args.endDate) {
      filtered = filtered.filter((a) => a.date <= args.endDate!);
    }

    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  },
});

// Get attendance for a specific date (all personnel)
export const listByDate = query({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const attendance = await ctx.db
      .query("attendance")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect();

    // Enrich with personnel names
    const enriched = await Promise.all(
      attendance.map(async (record) => {
        const personnel = await ctx.db.get(record.personnelId);
        return {
          ...record,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
          department: personnel?.department || "Unknown",
        };
      })
    );

    return enriched;
  },
});

// Get attendance summary for a personnel (stats)
export const getSummary = query({
  args: {
    personnelId: v.id("personnel"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const attendance = await ctx.db
      .query("attendance")
      .withIndex("by_personnel", (q) => q.eq("personnelId", args.personnelId))
      .collect();

    const filtered = attendance.filter(
      (a) => a.date >= args.startDate && a.date <= args.endDate
    );

    const summary = {
      totalDays: filtered.length,
      present: filtered.filter((a) => a.status === "present").length,
      absent: filtered.filter((a) => a.status === "absent").length,
      late: filtered.filter((a) => a.status === "late").length,
      excused: filtered.filter((a) => a.status === "excused").length,
      noCallNoShow: filtered.filter((a) => a.status === "no_call_no_show")
        .length,
      totalHours: filtered.reduce((sum, a) => sum + (a.hoursWorked || 0), 0),
    };

    return summary;
  },
});

// Get single attendance record
export const getByPersonnelDate = query({
  args: {
    personnelId: v.id("personnel"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("attendance")
      .withIndex("by_personnel_date", (q) =>
        q.eq("personnelId", args.personnelId).eq("date", args.date)
      )
      .first();

    return record;
  },
});

// ============ MUTATIONS ============

// Create or update attendance record
export const upsert = mutation({
  args: {
    personnelId: v.id("personnel"),
    date: v.string(),
    status: v.string(),
    scheduledStart: v.optional(v.string()),
    scheduledEnd: v.optional(v.string()),
    actualStart: v.optional(v.string()),
    actualEnd: v.optional(v.string()),
    hoursWorked: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if record exists
    const existing = await ctx.db
      .query("attendance")
      .withIndex("by_personnel_date", (q) =>
        q.eq("personnelId", args.personnelId).eq("date", args.date)
      )
      .first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        status: args.status,
        scheduledStart: args.scheduledStart,
        scheduledEnd: args.scheduledEnd,
        actualStart: args.actualStart,
        actualEnd: args.actualEnd,
        hoursWorked: args.hoursWorked,
        notes: args.notes,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Double-check right before insert to prevent duplicate records
      const doubleCheck = await ctx.db
        .query("attendance")
        .withIndex("by_personnel_date", (q) =>
          q.eq("personnelId", args.personnelId).eq("date", args.date)
        )
        .first();

      if (doubleCheck) {
        // Another mutation created the record between our first check and now; update it instead
        await ctx.db.patch(doubleCheck._id, {
          status: args.status,
          scheduledStart: args.scheduledStart,
          scheduledEnd: args.scheduledEnd,
          actualStart: args.actualStart,
          actualEnd: args.actualEnd,
          hoursWorked: args.hoursWorked,
          notes: args.notes,
          updatedAt: now,
        });
        return doubleCheck._id;
      }

      // Create new record
      const recordId = await ctx.db.insert("attendance", {
        personnelId: args.personnelId,
        date: args.date,
        status: args.status,
        scheduledStart: args.scheduledStart,
        scheduledEnd: args.scheduledEnd,
        actualStart: args.actualStart,
        actualEnd: args.actualEnd,
        hoursWorked: args.hoursWorked,
        notes: args.notes,
        createdAt: now,
        updatedAt: now,
      });
      return recordId;
    }
  },
});

// Bulk create attendance records (for a date with all personnel)
export const bulkCreate = mutation({
  args: {
    date: v.string(),
    records: v.array(
      v.object({
        personnelId: v.id("personnel"),
        status: v.string(),
        scheduledStart: v.optional(v.string()),
        scheduledEnd: v.optional(v.string()),
        actualStart: v.optional(v.string()),
        actualEnd: v.optional(v.string()),
        hoursWorked: v.optional(v.number()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const createdIds: string[] = [];

    for (const record of args.records) {
      // Check if record exists
      const existing = await ctx.db
        .query("attendance")
        .withIndex("by_personnel_date", (q) =>
          q.eq("personnelId", record.personnelId).eq("date", args.date)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          status: record.status,
          scheduledStart: record.scheduledStart,
          scheduledEnd: record.scheduledEnd,
          actualStart: record.actualStart,
          actualEnd: record.actualEnd,
          hoursWorked: record.hoursWorked,
          notes: record.notes,
          updatedAt: now,
        });
        createdIds.push(existing._id);
      } else {
        const recordId = await ctx.db.insert("attendance", {
          personnelId: record.personnelId,
          date: args.date,
          status: record.status,
          scheduledStart: record.scheduledStart,
          scheduledEnd: record.scheduledEnd,
          actualStart: record.actualStart,
          actualEnd: record.actualEnd,
          hoursWorked: record.hoursWorked,
          notes: record.notes,
          createdAt: now,
          updatedAt: now,
        });
        createdIds.push(recordId);
      }
    }

    return createdIds;
  },
});

// Delete attendance record
export const remove = mutation({
  args: { attendanceId: v.id("attendance") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.attendanceId);
    return args.attendanceId;
  },
});

// ============ ATTACHMENT FUNCTIONS ============

// Generate upload URL for file storage
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Add attachment to attendance record
export const addAttachment = mutation({
  args: {
    attendanceId: v.id("attendance"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.attendanceId);
    if (!record) {
      throw new Error("Attendance record not found");
    }

    const newAttachment = {
      storageId: args.storageId,
      fileName: args.fileName,
      fileType: args.fileType,
      uploadedAt: Date.now(),
    };

    const existingAttachments = record.attachments || [];
    await ctx.db.patch(args.attendanceId, {
      attachments: [...existingAttachments, newAttachment],
      updatedAt: Date.now(),
    });

    return args.attendanceId;
  },
});

// Remove attachment from attendance record
export const removeAttachment = mutation({
  args: {
    attendanceId: v.id("attendance"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.attendanceId);
    if (!record) {
      throw new Error("Attendance record not found");
    }

    // Remove from storage
    await ctx.storage.delete(args.storageId);

    // Remove from attachments array
    const updatedAttachments = (record.attachments || []).filter(
      (a) => a.storageId !== args.storageId
    );

    await ctx.db.patch(args.attendanceId, {
      attachments: updatedAttachments,
      updatedAt: Date.now(),
    });

    return args.attendanceId;
  },
});

// Get attachment download URL
export const getAttachmentUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

// ============ LIVE ATTENDANCE ============

// Get today's attendance with tardiness status for live view
// ONLY shows employees who are currently clocked in
// Filters by user role: warehouse_manager only sees their flock, execs only visible to payroll_manager
export const getTodayLive = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];

    // Get user for role-based filtering
    let userRole: string | null = null;
    let managedLocationIds: string[] = [];
    if (args.userId) {
      const user = await ctx.db.get(args.userId);
      if (user) {
        userRole = user.role;
        managedLocationIds = (user.managedLocationIds || []) as string[];
      }
    }

    // Get all active personnel
    let personnel = await ctx.db
      .query("personnel")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Role-based filtering
    if (userRole === "warehouse_manager") {
      // Warehouse managers only see:
      // 1. Hourly employees (not salaried/management)
      // 2. Employees in their managed locations
      personnel = personnel.filter((p) => {
        const isHourly = !p.positionType || p.positionType === "hourly";
        const inManagedLocation = !p.locationId || managedLocationIds.length === 0 || managedLocationIds.includes(p.locationId as string);
        return isHourly && inManagedLocation;
      });
    } else if (userRole !== "super_admin" && userRole !== "admin" && userRole !== "payroll_manager") {
      // Non-admin roles (except payroll_manager) can't see salaried/management
      personnel = personnel.filter((p) => !p.positionType || p.positionType === "hourly");
    }
    // super_admin, admin, payroll_manager can see everyone

    // Get today's attendance records
    const attendanceRecords = await ctx.db
      .query("attendance")
      .withIndex("by_date", (q) => q.eq("date", today))
      .collect();

    // Get today's time entries
    const timeEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_date", (q) => q.eq("date", today))
      .collect();

    // Build live attendance data - ONLY for clocked in employees
    const liveData = await Promise.all(
      personnel.map(async (person) => {
        const attendance = attendanceRecords.find((a) => a.personnelId === person._id);
        const entries = timeEntries.filter((e) => e.personnelId === person._id);

        // Determine current status
        const sorted = entries.sort((a, b) => a.timestamp - b.timestamp);
        let isClockedIn = false;
        let isOnBreak = false;
        let clockInTime: number | undefined;

        for (const entry of sorted) {
          if (entry.type === "clock_in") {
            isClockedIn = true;
            isOnBreak = false;
            clockInTime = entry.timestamp;
          } else if (entry.type === "clock_out") {
            isClockedIn = false;
          } else if (entry.type === "break_start") {
            isOnBreak = true;
          } else if (entry.type === "break_end") {
            isOnBreak = false;
          }
        }

        // ONLY include if currently clocked in
        if (!isClockedIn) return null;

        // Get schedule info
        let scheduledStart: string | undefined;
        if (person.defaultScheduleTemplateId) {
          const template = await ctx.db.get(person.defaultScheduleTemplateId);
          if (template?.departments?.[0]?.startTime) {
            scheduledStart = template.departments[0].startTime;
          }
        }

        return {
          personnelId: person._id,
          name: `${person.firstName} ${person.lastName}`,
          department: person.department,
          position: person.position,
          isClockedIn,
          isOnBreak,
          clockInTime,
          scheduledStart,
          // Attendance status
          attendanceStatus: attendance?.status || null,
          minutesLate: attendance?.minutesLate || 0,
          wasWithinGrace: attendance?.wasWithinGrace || false,
          actualStart: attendance?.actualStart,
        };
      })
    );

    // Filter out nulls (non-clocked-in employees) and sort
    const clockedInOnly = liveData.filter((d): d is NonNullable<typeof d> => d !== null);

    // Sort: late first, then by name
    return clockedInOnly.sort((a, b) => {
      // Late employees first
      if (a.attendanceStatus === "late" && b.attendanceStatus !== "late") return -1;
      if (a.attendanceStatus !== "late" && b.attendanceStatus === "late") return 1;
      // Then grace period
      if (a.attendanceStatus === "grace_period" && b.attendanceStatus !== "grace_period") return -1;
      if (a.attendanceStatus !== "grace_period" && b.attendanceStatus === "grace_period") return 1;
      // Then by name
      return a.name.localeCompare(b.name);
    });
  },
});

// ============ ATTENDANCE ISSUES ============

// Get attendance issues (late, no-show) with write-up recommendation
// EXCLUDES terminated employees
// Filters by user role: warehouse_manager only sees their flock, execs only visible to payroll_manager
export const getIssues = query({
  args: {
    personnelId: v.optional(v.id("personnel")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.optional(v.string()), // Filter by status type
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get user for role-based filtering
    let userRole: string | null = null;
    let managedLocationIds: string[] = [];
    if (args.userId) {
      const user = await ctx.db.get(args.userId);
      if (user) {
        userRole = user.role;
        managedLocationIds = (user.managedLocationIds || []) as string[];
      }
    }

    // Get all active personnel first
    let activePersonnel = await ctx.db
      .query("personnel")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // Role-based filtering
    if (userRole === "warehouse_manager") {
      // Warehouse managers only see:
      // 1. Hourly employees (not salaried/management)
      // 2. Employees in their managed locations
      activePersonnel = activePersonnel.filter((p) => {
        const isHourly = !p.positionType || p.positionType === "hourly";
        const inManagedLocation = !p.locationId || managedLocationIds.length === 0 || managedLocationIds.includes(p.locationId as string);
        return isHourly && inManagedLocation;
      });
    } else if (userRole !== "super_admin" && userRole !== "admin" && userRole !== "payroll_manager") {
      // Non-admin roles (except payroll_manager) can't see salaried/management
      activePersonnel = activePersonnel.filter((p) => !p.positionType || p.positionType === "hourly");
    }
    // super_admin, admin, payroll_manager can see everyone

    const activePersonnelIds = new Set(activePersonnel.map((p) => p._id));

    // Get attendance records with issues
    let records = await ctx.db.query("attendance").collect();

    // Filter to only issues (late, no_call_no_show) AND only active personnel
    records = records.filter(
      (r) =>
        (r.status === "late" || r.status === "no_call_no_show") &&
        activePersonnelIds.has(r.personnelId)
    );

    if (args.personnelId) {
      records = records.filter((r) => r.personnelId === args.personnelId);
    }
    if (args.status) {
      records = records.filter((r) => r.status === args.status);
    }
    if (args.startDate) {
      records = records.filter((r) => r.date >= args.startDate!);
    }
    if (args.endDate) {
      records = records.filter((r) => r.date <= args.endDate!);
    }

    // Enrich with personnel info and write-up count
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];

    const enriched = await Promise.all(
      records.map(async (record) => {
        const personnel = await ctx.db.get(record.personnelId);

        // Count attendance write-ups in last 6 months
        const writeUps = await ctx.db
          .query("writeUps")
          .withIndex("by_personnel", (q) => q.eq("personnelId", record.personnelId))
          .collect();

        const recentWriteUps = writeUps.filter(
          (w) => w.category === "attendance" && w.date >= sixMonthsAgoStr && !w.isArchived
        );

        // Determine recommended write-up severity based on progression
        // 1st = Verbal, 2nd = Written, 3rd = 3-Day Suspension, 4th = Termination
        let recommendedSeverity: string;
        let writeUpCount = recentWriteUps.length;

        if (writeUpCount === 0) {
          recommendedSeverity = "verbal_warning";
        } else if (writeUpCount === 1) {
          recommendedSeverity = "written_warning";
        } else if (writeUpCount === 2) {
          recommendedSeverity = "suspension";
        } else {
          recommendedSeverity = "termination";
        }

        return {
          ...record,
          personnelName: personnel
            ? `${personnel.firstName} ${personnel.lastName}`
            : "Unknown",
          department: personnel?.department || "Unknown",
          // Write-up info
          hasLinkedWriteUp: !!record.linkedWriteUpId,
          writeUpsIn6Months: writeUpCount,
          recommendedSeverity,
          severityLabel: {
            verbal_warning: "Verbal Warning (1st offense)",
            written_warning: "Written Warning (2nd offense)",
            suspension: "3-Day Suspension (3rd offense)",
            termination: "Termination (4th offense)",
          }[recommendedSeverity],
        };
      })
    );

    return enriched.sort((a, b) => b.date.localeCompare(a.date));
  },
});

// ============ MISSED SHIFT DETECTION ============

// Check for missed shifts and create no-show records
export const detectMissedShifts = mutation({
  args: {
    date: v.optional(v.string()), // Default to today
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const targetDate = args.date || new Date().toISOString().split("T")[0];
    const currentDate = new Date();
    const currentHour = currentDate.getHours();
    const dayOfWeek = currentDate.getDay();

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { checked: 0, missedShifts: 0 };
    }

    // Check if today is a global holiday
    const globalHoliday = await ctx.db
      .query("holidays")
      .withIndex("by_date", (q) => q.eq("date", targetDate))
      .first();

    if (globalHoliday) {
      // Check if it's a company-wide holiday (no location/department restrictions)
      const isCompanyWide =
        (!globalHoliday.affectedLocations || globalHoliday.affectedLocations.length === 0) &&
        (!globalHoliday.affectedDepartments || globalHoliday.affectedDepartments.length === 0);

      if (isCompanyWide) {
        return {
          checked: 0,
          missedShifts: 0,
          message: `Skipped - Holiday: ${globalHoliday.name}`,
        };
      }
    }

    // Only run after 10am (give people time to arrive)
    if (currentHour < 10) {
      return { checked: 0, missedShifts: 0, message: "Too early to check" };
    }

    // Get all active personnel with schedules
    const personnel = await ctx.db
      .query("personnel")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let checked = 0;
    let missedShifts = 0;

    for (const person of personnel) {
      if (!person.defaultScheduleTemplateId) continue;

      const template = await ctx.db.get(person.defaultScheduleTemplateId);
      if (!template?.departments?.[0]?.startTime) continue;

      const scheduledStart = template.departments[0].startTime;
      checked++;

      // Check if they have an attendance record for today
      const attendance = await ctx.db
        .query("attendance")
        .withIndex("by_personnel_date", (q) =>
          q.eq("personnelId", person._id).eq("date", targetDate)
        )
        .first();

      // Check if they called off or have approved time off
      const callOff = await ctx.db
        .query("callOffs")
        .withIndex("by_personnel", (q) => q.eq("personnelId", person._id))
        .filter((q) => q.eq(q.field("date"), targetDate))
        .first();

      const timeOff = await ctx.db
        .query("timeOffRequests")
        .withIndex("by_personnel", (q) => q.eq("personnelId", person._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "approved"),
            q.lte(q.field("startDate"), targetDate),
            q.gte(q.field("endDate"), targetDate)
          )
        )
        .first();

      // If no attendance record and no valid excuse, they missed their shift
      if (!attendance && !callOff && !timeOff) {
        // Check if this person is affected by a location/department-specific holiday
        if (globalHoliday) {
          const locationMatch =
            !globalHoliday.affectedLocations ||
            globalHoliday.affectedLocations.length === 0 ||
            (person.locationId && globalHoliday.affectedLocations.includes(person.locationId));

          const deptMatch =
            !globalHoliday.affectedDepartments ||
            globalHoliday.affectedDepartments.length === 0 ||
            globalHoliday.affectedDepartments.includes(person.department);

          if (locationMatch && deptMatch) {
            // This person is covered by the holiday, skip them
            continue;
          }
        }

        // Check if their scheduled time has passed (with buffer)
        const [hours, minutes] = scheduledStart.split(":").map(Number);
        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(hours, minutes, 0, 0);

        // Add 2 hour buffer (they're really late at this point)
        const bufferTime = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000);

        if (currentDate > bufferTime) {
          // Create no_call_no_show attendance record
          await ctx.db.insert("attendance", {
            personnelId: person._id,
            date: targetDate,
            status: "no_call_no_show",
            scheduledStart,
            notes: "Auto-detected: Employee did not clock in or call off",
            createdAt: now,
            updatedAt: now,
          });

          missedShifts++;

          // Notify managers
          const users = await ctx.db.query("users").collect();
          const managers = users.filter(
            (u) => u.isActive && ["super_admin", "admin", "warehouse_manager"].includes(u.role)
          );

          for (const manager of managers) {
            await ctx.db.insert("notifications", {
              userId: manager._id,
              type: "no_call_no_show",
              title: "No Call/No Show",
              message: `${person.firstName} ${person.lastName} did not clock in or call off (scheduled: ${scheduledStart})`,
              link: `/personnel/${person._id}`,
              relatedPersonnelId: person._id,
              isRead: false,
              isDismissed: false,
              createdAt: now,
            });
          }
        }
      }
    }

    return { checked, missedShifts };
  },
});

// ============ WRITE-UP CREATION ============

// Create write-up from attendance issue
export const createWriteUpFromAttendance = mutation({
  args: {
    attendanceId: v.id("attendance"),
    userId: v.id("users"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const attendance = await ctx.db.get(args.attendanceId);
    if (!attendance) throw new Error("Attendance record not found");

    if (attendance.linkedWriteUpId) {
      throw new Error("Write-up already exists for this attendance issue");
    }

    const personnel = await ctx.db.get(attendance.personnelId);
    if (!personnel) throw new Error("Personnel not found");

    const user = await ctx.db.get(args.userId);

    // Get write-up count for severity progression
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];

    const existingWriteUps = await ctx.db
      .query("writeUps")
      .withIndex("by_personnel", (q) => q.eq("personnelId", attendance.personnelId))
      .collect();

    const recentWriteUps = existingWriteUps.filter(
      (w) => w.category === "attendance" && w.date >= sixMonthsAgoStr && !w.isArchived
    );

    // Determine severity based on progression
    // 1st = Verbal, 2nd = Written, 3rd = 3-Day Suspension, 4th = Termination
    let severity: string;
    const writeUpCount = recentWriteUps.length;

    if (writeUpCount === 0) {
      severity = "verbal_warning";
    } else if (writeUpCount === 1) {
      severity = "written_warning";
    } else if (writeUpCount === 2) {
      severity = "suspension";
    } else {
      severity = "termination";
    }

    // Build description
    let description: string;
    if (attendance.status === "late") {
      description = `Tardy: Employee arrived ${attendance.minutesLate} minutes late on ${attendance.date}. ` +
        `Scheduled start: ${attendance.scheduledStart}, Actual arrival: ${attendance.actualStart}. ` +
        `This is attendance offense #${writeUpCount + 1} in the last 6 months.`;
    } else if (attendance.status === "no_call_no_show") {
      description = `No Call/No Show: Employee did not report to work or call off on ${attendance.date}. ` +
        `Scheduled start: ${attendance.scheduledStart}. ` +
        `This is attendance offense #${writeUpCount + 1} in the last 6 months.`;
    } else {
      description = `Attendance issue on ${attendance.date}: ${attendance.status}. ` +
        `This is attendance offense #${writeUpCount + 1} in the last 6 months.`;
    }

    if (args.notes) {
      description += `\n\nAdditional notes: ${args.notes}`;
    }

    // Create write-up
    const writeUpId = await ctx.db.insert("writeUps", {
      personnelId: attendance.personnelId,
      date: attendance.date,
      category: "attendance",
      severity,
      description,
      followUpRequired: severity === "suspension" || severity === "termination",
      issuedBy: args.userId,
      createdAt: now,
    });

    // Link write-up to attendance record
    await ctx.db.patch(args.attendanceId, {
      linkedWriteUpId: writeUpId,
      updatedAt: now,
    });

    // Log the action
    await ctx.db.insert("auditLogs", {
      action: "Attendance write-up created",
      actionType: "create",
      resourceType: "writeUps",
      resourceId: writeUpId,
      userId: args.userId,
      userEmail: user?.email || "unknown",
      details: `Created ${severity.replace(/_/g, " ")} for ${personnel.firstName} ${personnel.lastName}: ${attendance.status}`,
      timestamp: now,
    });

    return writeUpId;
  },
});
