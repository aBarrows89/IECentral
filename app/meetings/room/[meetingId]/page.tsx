"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "@/app/theme-context";
import { useAuth } from "@/app/auth-context";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useMediaStream } from "@/lib/webrtc/useMediaStream";
import { usePeerConnections } from "@/lib/webrtc/usePeerConnections";
import VideoGrid from "@/components/meetings/VideoGrid";
import MeetingControls from "@/components/meetings/MeetingControls";

export default function MeetingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useAuth();

  const meetingId = params.meetingId as string;
  const typedMeetingId = meetingId as unknown as Id<"meetings">;

  // Convex queries
  const meeting = useQuery(api.meetings.get, { meetingId: typedMeetingId });
  const participants = useQuery(api.meetingParticipants.getByMeeting, {
    meetingId: typedMeetingId,
  });
  const myParticipant = useQuery(
    api.meetingParticipants.getMyParticipant,
    user ? { userId: user._id, meetingId: typedMeetingId } : "skip"
  );

  // Convex mutations
  const joinMeeting = useMutation(api.meetingParticipants.join);
  const leaveMeeting = useMutation(api.meetingParticipants.leave);
  const endMeeting = useMutation(api.meetings.end);
  const updateMediaState = useMutation(
    api.meetingParticipants.updateMediaState
  );
  const toggleNotedMeeting = useMutation(api.meetings.updateNotedMeeting);

  // Local state
  const [hasJoined, setHasJoined] = useState(false);
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Media
  const {
    localStream,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    cleanup,
  } = useMediaStream();

  // Peer connections — only initialize when we have the participant record
  const remoteStreams = usePeerConnections({
    localStream,
    myParticipantId: (myParticipant?._id ?? null) as unknown as Id<"meetingParticipants">,
    meetingId: typedMeetingId,
    participants: (participants ?? []) as any[],
  });

  // Join meeting on mount
  const startMeeting = useMutation(api.meetings.start);

  useEffect(() => {
    if (hasJoined || !user || !meeting) return;

    // Meeting already ended
    if (meeting.status === "ended") {
      setError("This meeting has ended.");
      return;
    }

    async function join() {
      try {
        // Start the meeting if host and not yet active
        const isHost = String(meeting!.hostId) === String(user!._id);
        if (isHost && (meeting!.status === "lobby" || meeting!.status === "scheduled")) {
          await startMeeting({ meetingId: typedMeetingId });
        }

        await joinMeeting({
          meetingId: typedMeetingId,
          userId: user!._id,
        });
        setHasJoined(true);
      } catch (err) {
        console.error("Failed to join meeting:", err);
        setError("Failed to join meeting.");
      }
    }

    join();
  }, [user, meeting, hasJoined, joinMeeting, startMeeting, typedMeetingId]);

  // Sync media state to Convex
  useEffect(() => {
    if (!myParticipant) return;

    updateMediaState({
      participantId: myParticipant._id,
      isMuted: !isAudioEnabled,
      isCameraOff: !isVideoEnabled,
      isScreenSharing,
    }).catch(() => {});
  }, [
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    myParticipant,
    updateMediaState,
  ]);

  // Handle leaving
  const handleLeave = useCallback(async () => {
    try {
      if (myParticipant) {
        await leaveMeeting({ participantId: myParticipant._id });
      }
    } catch {
      // Best-effort
    }
    cleanup();
    router.push("/meetings");
  }, [myParticipant, leaveMeeting, cleanup, router]);

  // Handle end call (host)
  const handleEndCall = useCallback(async () => {
    if (!user || !meeting) {
      await handleLeave();
      return;
    }

    const isHost =
      meeting.hostId && String(meeting.hostId) === String(user._id);

    if (isHost) {
      try {
        await endMeeting({ meetingId: typedMeetingId });
      } catch {
        // Best-effort
      }
    }

    await handleLeave();
  }, [user, meeting, endMeeting, typedMeetingId, handleLeave]);

  // Handle noted meeting toggle
  const handleToggleNotedMeeting = useCallback(async () => {
    if (!meeting) return;
    try {
      await toggleNotedMeeting({
        meetingId: typedMeetingId,
        isNotedMeeting: !meeting.isNotedMeeting,
      });
    } catch (err) {
      console.error("Failed to toggle noted meeting:", err);
    }
  }, [meeting, toggleNotedMeeting, typedMeetingId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect meeting ended by host
  useEffect(() => {
    if (meeting && meeting.status === "ended" && hasJoined) {
      cleanup();
      router.push("/meetings");
    }
  }, [meeting, hasJoined, cleanup, router]);

  // Error state
  if (error) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDark ? "bg-slate-900" : "bg-gray-50"
        }`}
      >
        <div
          className={`text-center border rounded-xl p-8 max-w-md ${
            isDark
              ? "bg-slate-800/50 border-slate-700"
              : "bg-white border-gray-200 shadow-sm"
          }`}
        >
          <svg
            className={`w-16 h-16 mx-auto mb-4 ${
              isDark ? "text-slate-500" : "text-gray-400"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <h2
            className={`text-xl font-semibold mb-2 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            {error}
          </h2>
          <button
            onClick={() => router.push("/meetings")}
            className={`mt-4 px-5 py-2 rounded-lg font-medium transition-colors ${
              isDark
                ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                : "bg-blue-100 text-blue-600 hover:bg-blue-200"
            }`}
          >
            Back to Meetings
          </button>
        </div>
      </div>
    );
  }

  // Loading state — wait for meeting data; participant record will come reactively
  if (!meeting || !hasJoined) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDark ? "bg-slate-900" : "bg-gray-50"
        }`}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4" />
          <p className={isDark ? "text-slate-400" : "text-gray-500"}>
            Joining meeting...
          </p>
        </div>
      </div>
    );
  }

  const isHost =
    meeting.hostId && String(meeting.hostId) === String(user?._id);

  // Build participant list with display names and media state
  const enrichedParticipants = (participants ?? []).map((p: any) => ({
    ...p,
    displayName:
      p.displayName || p.guestName || (p.userId === user?._id ? user?.name : "Participant"),
  }));

  return (
    <div
      className={`h-screen flex flex-col ${
        isDark ? "bg-slate-900" : "bg-gray-100"
      }`}
    >
      {/* Top bar — minimal */}
      <div
        className={`flex items-center justify-between px-4 py-2 ${
          isDark ? "bg-slate-800/80" : "bg-white/80"
        } backdrop-blur-sm z-10`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={handleLeave}
            className={`p-1.5 rounded-lg transition-colors ${
              isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-200 text-gray-500"
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1
            className={`text-sm font-medium truncate ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            {meeting.title}
          </h1>
          {meeting.isNotedMeeting && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Noting
            </span>
          )}
        </div>
        {meeting.joinCode && (
          <span
            className={`text-xs font-mono ${
              isDark ? "text-slate-500" : "text-gray-400"
            }`}
          >
            {meeting.joinCode}
          </span>
        )}
      </div>

      {/* Video area */}
      <div className="flex-1 min-h-0 p-2 sm:p-4 pb-20 sm:pb-24">
        <VideoGrid
          localStream={localStream}
          remoteStreams={remoteStreams}
          participants={enrichedParticipants}
          myParticipantId={String(myParticipant?._id ?? "")}
        />
      </div>

      {/* Participant side panel */}
      {showParticipantList && (
        <div
          className={`fixed top-0 right-0 bottom-0 w-72 z-40 border-l ${
            isDark
              ? "bg-slate-800 border-slate-700"
              : "bg-white border-gray-200"
          } shadow-xl`}
        >
          <div className="flex items-center justify-between p-4 border-b ${isDark ? 'border-slate-700' : 'border-gray-200'}">
            <h3
              className={`font-semibold ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              Participants ({(participants ?? []).length})
            </h3>
            <button
              onClick={() => setShowParticipantList(false)}
              className={`p-1 rounded ${
                isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-200 text-gray-500"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-60px)]">
            {enrichedParticipants.map((p: any) => (
              <div
                key={String(p._id)}
                className={`flex items-center gap-3 p-2 rounded-lg ${
                  isDark ? "bg-slate-700/50" : "bg-gray-50"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white ${
                    p.userId === user?._id ? "bg-cyan-600" : "bg-slate-500"
                  }`}
                >
                  {(p.displayName || "?")
                    .split(" ")
                    .map((w: string) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {p.displayName}
                    {p.userId === user?._id && " (You)"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {p.isMuted && (
                    <svg
                      className="w-4 h-4 text-red-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                      />
                    </svg>
                  )}
                  {p.isCameraOff && (
                    <svg
                      className="w-4 h-4 text-red-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                      />
                    </svg>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <MeetingControls
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing}
        toggleAudio={toggleAudio}
        toggleVideo={toggleVideo}
        startScreenShare={startScreenShare}
        stopScreenShare={stopScreenShare}
        onEndCall={handleEndCall}
        isNotedMeeting={meeting.isNotedMeeting ?? false}
        onToggleNotedMeeting={handleToggleNotedMeeting}
        isHost={!!isHost}
        participantCount={(participants ?? []).length}
        onToggleParticipantList={() =>
          setShowParticipantList(!showParticipantList)
        }
        showParticipantList={showParticipantList}
      />
    </div>
  );
}
