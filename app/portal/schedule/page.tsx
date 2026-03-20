"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Protected from "../../protected";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTheme } from "../../theme-context";
import { useAuth } from "../../auth-context";

function ScheduleContent() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const router = useRouter();
  const { user, canAccessEmployeePortal } = useAuth();
  const personnelId = user?.personnelId;

  // Date range - current week and next week
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + weekOffset * 7);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const startDate = startOfWeek.toISOString().split("T")[0];
  const endDate = endOfWeek.toISOString().split("T")[0];

  const schedule = useQuery(
    api.employeePortal.getMySchedule,
    personnelId ? { personnelId, startDate, endDate } : "skip"
  );

  if (!canAccessEmployeePortal) {
    router.push("/");
    return null;
  }

  if (!personnelId) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-slate-900" : "bg-gray-50"}`}>
        <p className={isDark ? "text-slate-400" : "text-gray-500"}>Account not linked to personnel record.</p>
      </div>
    );
  }

  // Loading state — schedule is undefined while the query is in flight
  if (schedule === undefined) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-slate-900" : "bg-gray-50"}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin ${isDark ? 'border-cyan-400' : 'border-blue-600'}" />
          <p className={isDark ? "text-slate-400" : "text-gray-500"}>Loading schedule...</p>
        </div>
      </div>
    );
  }

  // Error state — query returned null
  if (schedule === null) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-slate-900" : "bg-gray-50"}`}>
        <div className="flex flex-col items-center gap-3">
          <svg className={`w-10 h-10 ${isDark ? "text-red-400" : "text-red-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className={`font-medium ${isDark ? "text-red-400" : "text-red-600"}`}>Failed to load schedule</p>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>Please try again later.</p>
        </div>
      </div>
    );
  }

  // Generate days of the week
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    days.push({
      date: date.toISOString().split("T")[0],
      dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
      dayNum: date.getDate(),
      isToday: date.toISOString().split("T")[0] === today.toISOString().split("T")[0],
    });
  }

  const getShiftsForDay = (date: string) => {
    return schedule?.filter((s) => s.date === date) || [];
  };

  return (
    <div className={`min-h-screen ${isDark ? "bg-slate-900" : "bg-gray-50"}`}>
      {/* Header */}
      <header className={`sticky top-0 z-10 border-b px-4 py-4 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200"}`}>
        <div className="max-w-lg mx-auto flex items-center gap-4">
          <Link
            href="/portal"
            className={`p-2 -ml-2 rounded-lg ${isDark ? "hover:bg-slate-700" : "hover:bg-gray-100"}`}
          >
            <svg className={`w-6 h-6 ${isDark ? "text-white" : "text-gray-900"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              My Schedule
            </h1>
            <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              {startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
              {endOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Week Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isDark ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-white text-gray-900 hover:bg-gray-100 border border-gray-200"}`}
          >
            Previous
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className={`px-4 py-2 rounded-lg font-medium ${isDark ? "text-cyan-400" : "text-blue-600"}`}
            >
              This Week
            </button>
          )}
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isDark ? "bg-slate-800 text-white hover:bg-slate-700" : "bg-white text-gray-900 hover:bg-gray-100 border border-gray-200"}`}
          >
            Next
          </button>
        </div>

        {/* Schedule Grid */}
        <div className="space-y-3">
          {days.map((day) => {
            const shifts = getShiftsForDay(day.date);
            return (
              <div
                key={day.date}
                className={`rounded-xl p-4 ${
                  day.isToday
                    ? isDark
                      ? "bg-cyan-500/20 border border-cyan-500/30"
                      : "bg-blue-50 border border-blue-200"
                    : isDark
                    ? "bg-slate-800 border border-slate-700"
                    : "bg-white border border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {day.dayName}
                    </span>
                    <span className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      {day.dayNum}
                    </span>
                  </div>
                  {day.isToday && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${isDark ? "bg-cyan-500/30 text-cyan-400" : "bg-blue-100 text-blue-600"}`}>
                      Today
                    </span>
                  )}
                </div>

                {shifts.length > 0 ? (
                  <div className="space-y-2">
                    {shifts.map((shift) => (
                      <div
                        key={shift._id}
                        className={`p-3 rounded-lg ${isDark ? "bg-slate-700/50" : "bg-gray-50"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                            {shift.department}
                          </span>
                          {shift.isLead && (
                            <span className={`text-xs px-2 py-1 rounded-full ${isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700"}`}>
                              Lead
                            </span>
                          )}
                        </div>
                        <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          {shift.startTime} - {shift.endTime}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-sm ${isDark ? "text-slate-500" : "text-gray-400"}`}>
                    No shift scheduled
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Protected>
      <ScheduleContent />
    </Protected>
  );
}
