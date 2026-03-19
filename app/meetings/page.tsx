"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Protected from "../protected";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "../theme-context";
import { useAuth } from "../auth-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(start: number, end: number): string {
  const mins = Math.round((end - start) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export default function MeetingsPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useAuth();
  const router = useRouter();

  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [title, setTitle] = useState("");
  const [isNotedMeeting, setIsNotedMeeting] = useState(false);
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [lookupCode, setLookupCode] = useState<string | null>(null);

  const [showPast, setShowPast] = useState(false);

  const userId = user?._id as Id<"users"> | undefined;
  const upcomingMeetings = useQuery(api.meetings.listUpcoming, userId ? { userId } : "skip");
  const pastMeetings = useQuery(api.meetings.listPast, userId ? { userId } : "skip");
  const createMeeting = useMutation(api.meetings.create);
  const startMeeting = useMutation(api.meetings.start);
  const meetingByJoinCode = useQuery(
    api.meetings.getByJoinCode,
    lookupCode ? { joinCode: lookupCode } : "skip"
  );

  async function handleCreateMeeting() {
    if (!user || !title.trim()) return;
    setCreating(true);
    try {
      const meetingId = await createMeeting({
        title: title.trim(),
        isNotedMeeting,
        userId: user._id,
      });
      // Start it immediately
      await startMeeting({ meetingId });
      router.push(`/meetings/room/${meetingId}`);
    } catch (err) {
      console.error("Failed to create meeting:", err);
    } finally {
      setCreating(false);
    }
  }

  // React to join-code lookup result
  useEffect(() => {
    if (!lookupCode) return;
    if (meetingByJoinCode === undefined) return; // still loading
    if (meetingByJoinCode) {
      router.push(`/meetings/room/${meetingByJoinCode._id}`);
    } else {
      setJoinError("Meeting not found. Check the code and try again.");
    }
    setJoining(false);
    setLookupCode(null);
  }, [meetingByJoinCode, lookupCode, router]);

  function handleJoin() {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError("");
    setLookupCode(joinCode.trim());
  }

  return (
    <Protected>
      <div className={`min-h-screen ${isDark ? "bg-slate-900" : "bg-gray-50"}`}>
        <Sidebar />
        <main className="lg:ml-64 p-4 sm:p-6 lg:p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1
                className={`text-2xl sm:text-3xl font-bold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                Meetings
              </h1>
              <button
                onClick={() => setShowNewMeeting(!showNewMeeting)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isDark
                    ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                    : "bg-blue-100 text-blue-600 hover:bg-blue-200"
                }`}
              >
                {showNewMeeting ? "Cancel" : "New Meeting"}
              </button>
            </div>

            {/* New Meeting Form */}
            {showNewMeeting && (
              <div
                className={`border rounded-xl p-4 sm:p-6 ${
                  isDark
                    ? "bg-slate-800/50 border-slate-700"
                    : "bg-white border-gray-200 shadow-sm"
                }`}
              >
                <h2
                  className={`text-lg font-semibold mb-4 ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  Start a New Meeting
                </h2>
                <div className="space-y-4">
                  <div>
                    <label
                      className={`block text-sm font-medium mb-1 ${
                        isDark ? "text-slate-300" : "text-gray-700"
                      }`}
                    >
                      Meeting Title
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Weekly Team Standup"
                      className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 ${
                        isDark
                          ? "bg-slate-700 border-slate-600 text-white focus:ring-cyan-500 placeholder-slate-400"
                          : "bg-white border-gray-300 text-gray-900 focus:ring-blue-500 placeholder-gray-400"
                      }`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateMeeting();
                      }}
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isNotedMeeting}
                      onChange={(e) => setIsNotedMeeting(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span
                      className={`text-sm ${
                        isDark ? "text-slate-300" : "text-gray-700"
                      }`}
                    >
                      Noted Meeting (AI notes will be generated)
                    </span>
                  </label>
                  <button
                    onClick={handleCreateMeeting}
                    disabled={!title.trim() || creating}
                    className={`px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                      isDark
                        ? "bg-cyan-600 text-white hover:bg-cyan-700"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {creating ? "Starting..." : "Start Now"}
                  </button>
                </div>
              </div>
            )}

            {/* Join Meeting */}
            <div
              className={`border rounded-xl p-4 sm:p-6 ${
                isDark
                  ? "bg-slate-800/50 border-slate-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <h2
                className={`text-lg font-semibold mb-3 ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                Join a Meeting
              </h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => {
                    setJoinCode(e.target.value);
                    setJoinError("");
                  }}
                  placeholder="Enter meeting code"
                  className={`flex-1 px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 ${
                    isDark
                      ? "bg-slate-700 border-slate-600 text-white focus:ring-cyan-500 placeholder-slate-400"
                      : "bg-white border-gray-300 text-gray-900 focus:ring-blue-500 placeholder-gray-400"
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoin();
                  }}
                />
                <button
                  onClick={handleJoin}
                  disabled={!joinCode.trim() || joining}
                  className={`px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                    isDark
                      ? "bg-cyan-600 text-white hover:bg-cyan-700"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {joining ? "Joining..." : "Join"}
                </button>
              </div>
              {joinError && (
                <p className="mt-2 text-sm text-red-400">{joinError}</p>
              )}
            </div>

            {/* Upcoming Meetings */}
            <div
              className={`border rounded-xl p-4 sm:p-6 ${
                isDark
                  ? "bg-slate-800/50 border-slate-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <h2
                className={`text-lg font-semibold mb-3 ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                Upcoming Meetings
              </h2>
              {!upcomingMeetings ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
                </div>
              ) : upcomingMeetings.length === 0 ? (
                <p className={isDark ? "text-slate-400" : "text-gray-500"}>
                  No upcoming meetings.
                </p>
              ) : (
                <div className="space-y-3">
                  {upcomingMeetings.map((meeting: any) => (
                    <div
                      key={meeting._id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isDark
                          ? "bg-slate-700/50 border-slate-600"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div>
                        <h3
                          className={`font-medium ${
                            isDark ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {meeting.title}
                        </h3>
                        {meeting.scheduledStart && (
                          <p
                            className={`text-sm ${
                              isDark ? "text-slate-400" : "text-gray-500"
                            }`}
                          >
                            {formatDateTime(meeting.scheduledStart)}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {meeting.isNotedMeeting && (
                            <span className="inline-flex items-center gap-1 text-xs text-cyan-400">
                              <span className="w-2 h-2 bg-cyan-400 rounded-full" />
                              Noted
                            </span>
                          )}
                          {meeting.joinCode && (
                            <span
                              className={`text-xs font-mono ${
                                isDark ? "text-slate-500" : "text-gray-400"
                              }`}
                            >
                              Code: {meeting.joinCode}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          router.push(`/meetings/room/${meeting._id}`)
                        }
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          isDark
                            ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                            : "bg-blue-100 text-blue-600 hover:bg-blue-200"
                        }`}
                      >
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Past Meetings */}
            <div
              className={`border rounded-xl p-4 sm:p-6 ${
                isDark
                  ? "bg-slate-800/50 border-slate-700"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <button
                onClick={() => setShowPast(!showPast)}
                className="flex items-center justify-between w-full"
              >
                <h2
                  className={`text-lg font-semibold ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  Past Meetings
                </h2>
                <svg
                  className={`w-5 h-5 transition-transform ${
                    showPast ? "rotate-180" : ""
                  } ${isDark ? "text-slate-400" : "text-gray-500"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {showPast && (
                <div className="mt-3">
                  {!pastMeetings ? (
                    <div className="flex justify-center py-6">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
                    </div>
                  ) : pastMeetings.length === 0 ? (
                    <p
                      className={isDark ? "text-slate-400" : "text-gray-500"}
                    >
                      No past meetings.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {pastMeetings.map((meeting: any) => (
                        <div
                          key={meeting._id}
                          className={`p-3 rounded-lg border ${
                            isDark
                              ? "bg-slate-700/50 border-slate-600"
                              : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <h3
                              className={`font-medium ${
                                isDark ? "text-white" : "text-gray-900"
                              }`}
                            >
                              {meeting.title}
                            </h3>
                            {meeting.isNotedMeeting && (
                              <span className="text-xs text-cyan-400">
                                Noted
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-sm mt-1 ${
                              isDark ? "text-slate-400" : "text-gray-500"
                            }`}
                          >
                            {meeting.startedAt &&
                              formatDateTime(meeting.startedAt)}
                            {meeting.startedAt && meeting.endedAt && (
                              <span className="ml-2">
                                ({formatDuration(meeting.startedAt, meeting.endedAt)})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </Protected>
  );
}
