"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
  recording: { label: "Recording", color: "text-red-400", bgColor: "bg-red-500/10" },
  uploading: { label: "Uploading", color: "text-amber-400", bgColor: "bg-amber-500/10" },
  transcribing: { label: "Transcribing", color: "text-blue-400", bgColor: "bg-blue-500/10" },
  generating: { label: "Generating Notes", color: "text-purple-400", bgColor: "bg-purple-500/10" },
  complete: { label: "Complete", color: "text-emerald-400", bgColor: "bg-emerald-500/10" },
  error: { label: "Error", color: "text-red-400", bgColor: "bg-red-500/10" },
};

export default function SharedMeetingNotesPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const meetingId = searchParams.get("meeting") as Id<"meetings"> | null;

  const [showTranscript, setShowTranscript] = useState(false);

  const notes = useQuery(
    api.meetingNotes.getByInviteToken,
    token && meetingId ? { meetingId, token } : "skip"
  );

  const meeting = useQuery(
    api.meetings.get,
    meetingId ? { meetingId } : "skip"
  );

  // No token or meeting ID
  if (!token || !meetingId) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white mb-2">Invalid Link</h1>
          <p className="text-slate-400 text-sm">This meeting notes link is missing required parameters.</p>
        </div>
      </div>
    );
  }

  // Loading
  if (notes === undefined || meeting === undefined) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500" />
      </div>
    );
  }

  // Invalid token or no access
  if (!notes) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 text-sm">This link is invalid or has expired. Contact the meeting host for access.</p>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[notes.status] || STATUS_LABELS.error;
  const isProcessing = notes.status !== "complete" && notes.status !== "error";

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header bar */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Image src="/logo.gif" alt="IE Central" width={100} height={28} className="h-7 w-auto" />
          <span className="text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
            SHARED NOTES
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {meeting?.title || "Meeting Notes"}
          </h1>
          <p className="text-sm mt-1 text-slate-400">Shared Meeting Notes</p>
        </div>

        {/* Info card */}
        <div className="border rounded-xl p-4 sm:p-6 bg-slate-800/50 border-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Date</p>
              <p className="text-sm mt-1 text-slate-200">
                {meeting?.startedAt ? formatDateTime(meeting.startedAt) : meeting?.createdAt ? formatDateTime(meeting.createdAt) : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Duration</p>
              <p className="text-sm mt-1 text-slate-200">
                {notes.duration ? formatDuration(notes.duration) : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Status</p>
              <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color} ${statusInfo.bgColor}`}>
                {isProcessing && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Processing */}
        {isProcessing && (
          <div className="border rounded-xl p-6 text-center bg-slate-800/50 border-slate-700">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-1 text-white">Processing Meeting</h3>
            <p className="text-sm text-slate-400">Notes will appear here once processing is complete.</p>
          </div>
        )}

        {/* Error */}
        {notes.status === "error" && (
          <div className="border rounded-xl p-6 bg-red-900/20 border-red-800/50">
            <h3 className="text-red-400 font-semibold">Processing Error</h3>
            <p className="text-sm mt-1 text-red-300/70">
              {notes.errorMessage || "An error occurred while processing meeting notes."}
            </p>
          </div>
        )}

        {/* Notes content */}
        {notes.status === "complete" && (
          <>
            {/* Summary */}
            {notes.summary && (
              <div className="border rounded-xl p-4 sm:p-6 bg-slate-800/50 border-slate-700">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Summary
                </h2>
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
                  {notes.summary}
                </div>
              </div>
            )}

            {/* Action Items */}
            {notes.actionItems && notes.actionItems.length > 0 && (
              <div className="border rounded-xl p-4 sm:p-6 bg-slate-800/50 border-slate-700">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-white">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Action Items
                </h2>
                <div className="space-y-2">
                  {notes.actionItems.map((item: { text: string; assignee?: string; dueDate?: string; completed: boolean }, index: number) => (
                    <div key={index} className="flex items-start gap-3 p-3 rounded-lg">
                      <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        item.completed ? "bg-emerald-500 border-emerald-500" : "border-slate-500"
                      }`}>
                        {item.completed && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm ${item.completed ? "text-slate-500 line-through" : "text-slate-200"}`}>{item.text}</p>
                        <div className="flex gap-3 mt-1">
                          {item.assignee && <span className="text-xs text-cyan-400">{item.assignee}</span>}
                          {item.dueDate && <span className="text-xs text-slate-500">Due: {item.dueDate}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Decisions */}
            {notes.decisions && notes.decisions.length > 0 && (
              <div className="border rounded-xl p-4 sm:p-6 bg-slate-800/50 border-slate-700">
                <h2 className="text-lg font-semibold mb-3 text-white">Key Decisions</h2>
                <ul className="space-y-2">
                  {notes.decisions.map((d: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-emerald-400 mt-0.5">-</span> {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Follow-ups */}
            {notes.followUps && notes.followUps.length > 0 && (
              <div className="border rounded-xl p-4 sm:p-6 bg-slate-800/50 border-slate-700">
                <h2 className="text-lg font-semibold mb-3 text-white">Follow-ups</h2>
                <ul className="space-y-2">
                  {notes.followUps.map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-amber-400 mt-0.5">-</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Transcript toggle */}
            {notes.transcript && (
              <div className="border rounded-xl bg-slate-800/50 border-slate-700 overflow-hidden">
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="w-full flex items-center justify-between p-4 sm:p-6 text-left"
                >
                  <h2 className="text-lg font-semibold text-white">Full Transcript</h2>
                  <svg className={`w-5 h-5 text-slate-400 transition-transform ${showTranscript ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showTranscript && (
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-400 max-h-96 overflow-y-auto">
                      {notes.transcript}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-4 mt-12">
        <p className="text-center text-xs text-slate-600">
          Import Export Tire Company — IE Central
        </p>
      </footer>
    </div>
  );
}
